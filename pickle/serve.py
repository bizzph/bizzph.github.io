#!/usr/bin/env python3
"""Serve PicklePulse and its authenticated in-memory LAN live relay."""
from __future__ import annotations

import argparse
import ipaddress
from collections import defaultdict, deque
import json
import re
import ssl
import threading
import time
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

CSP = (
    "default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; "
    "frame-ancestors 'none'; script-src 'self'; script-src-attr 'none'; connect-src 'self'; "
    "img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'none'; media-src 'none'; "
    "frame-src 'none'; worker-src 'self'; manifest-src 'self'"
)
ROOM_RE = re.compile(r"^[2-9A-HJ-NP-Z]{4,8}$")
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")
VIEWER_RE = re.compile(r"^[0-9a-f]{24}$")
MAX_BODY_BYTES = 65536
MAX_ROOMS = 100
ROOM_TTL_SECONDS = 12 * 60 * 60
VIEWER_TTL_SECONDS = 8
MAX_VIEWERS = 3
API_REQUEST_LIMIT = 100
API_WINDOW_SECONDS = 10
NEW_ROOM_LIMIT = 10
NEW_ROOM_WINDOW_SECONDS = 60
ROOT_DIR = Path(__file__).resolve().parent
ALLOWED_STATIC_PATHS = {
    '/index.html', '/styles.css', '/manifest.webmanifest', '/sw.js', '/assets/icon.svg',
    '/src/picklepulse-core.js', '/src/live-sync.js'
}


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def allow(self, scope: str, client: str, limit: int, window: float) -> bool:
        now = time.monotonic()
        key = (scope, client)
        with self._lock:
            events = self._events[key]
            while events and now - events[0] > window:
                events.popleft()
            if len(events) >= limit:
                return False
            events.append(now)
            if not events:
                self._events.pop(key, None)
            return True


class LiveStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._rooms: dict[str, dict] = {}

    def _cleanup(self, now: float) -> None:
        expired = [room for room, value in self._rooms.items() if now - value['updated_at'] > ROOM_TTL_SECONDS]
        for room in expired:
            self._rooms.pop(room, None)

    @staticmethod
    def _active_viewers(value: dict, now: float) -> dict[str, float]:
        viewers = {viewer: seen for viewer, seen in value.get('viewers', {}).items() if now - seen <= VIEWER_TTL_SECONDS}
        value['viewers'] = viewers
        return viewers

    def exists(self, room: str) -> bool:
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            return room in self._rooms

    def put(self, room: str, token: str, packet: dict) -> tuple[int, int]:
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            value = self._rooms.get(room)
            if value and value['token'] != token:
                raise PermissionError('room-conflict')
            if not value:
                if len(self._rooms) >= MAX_ROOMS:
                    raise OverflowError('room-limit')
                value = {'token': token, 'version': 0, 'viewers': {}}
                self._rooms[room] = value
            value['packet'] = packet
            value['version'] += 1
            value['updated_at'] = now
            return value['version'], len(self._active_viewers(value, now))

    def get(self, room: str, token: str, viewer: str) -> tuple[dict, int]:
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            value = self._rooms.get(room)
            if not value:
                raise KeyError(room)
            if value['token'] != token:
                raise PermissionError('invalid-token')
            viewers = self._active_viewers(value, now)
            if viewer not in viewers and len(viewers) >= MAX_VIEWERS:
                raise OverflowError('viewer-limit')
            viewers[viewer] = now
            return value['packet'], value['version']

    def delete(self, room: str, token: str) -> bool:
        with self._lock:
            value = self._rooms.get(room)
            if not value:
                return False
            if value['token'] != token:
                raise PermissionError('invalid-token')
            self._rooms.pop(room, None)
            return True


LIVE_STORE = LiveStore()
RATE_LIMITER = SlidingWindowLimiter()


class SecureHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 32


class SecureHandler(SimpleHTTPRequestHandler):
    server_version = 'PicklePulse'
    sys_version = ''
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'
    }

    def _valid_host(self) -> bool:
        raw = self.headers.get('Host', '').strip().lower()
        if not raw:
            return False
        if raw.startswith('['):
            end = raw.find(']')
            host = raw[1:end] if end > 0 else ''
        else:
            host = raw.rsplit(':', 1)[0] if raw.count(':') == 1 else raw
        if host == 'localhost' or host.endswith('.local'):
            return True
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return False

    def _reject_invalid_host(self) -> bool:
        if self._valid_host():
            return False
        self._json(HTTPStatus.MISDIRECTED_REQUEST, {'error': 'invalid-host'})
        return True

    def _reject_api_flood(self) -> bool:
        client = str(self.client_address[0])
        if RATE_LIMITER.allow('api', client, API_REQUEST_LIMIT, API_WINDOW_SECONDS):
            return False
        self._json(HTTPStatus.TOO_MANY_REQUESTS, {'error': 'rate-limit'}, {'Retry-After': '2'})
        return True

    def send_head(self):
        path = urlparse(self.path).path
        if path in ('', '/'):
            path = '/index.html'
        if path not in ALLOWED_STATIC_PATHS:
            self.send_error(HTTPStatus.NOT_FOUND, 'Not found')
            return None
        original = self.path
        self.path = path
        try:
            return super().send_head()
        finally:
            self.path = original

    def end_headers(self) -> None:
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        if getattr(self.server, 'is_https', False):
            self.send_header('Strict-Transport-Security', 'max-age=31536000')
        self.send_header('Cache-Control', 'no-store' if self.path.startswith('/api/') else 'no-cache')
        super().end_headers()

    def _json(self, status: int, payload: dict, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _empty(self, status: int, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header('Content-Length', '0')
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()

    def _live_room(self) -> str | None:
        path = urlparse(self.path).path
        prefix = '/api/live/'
        if not path.startswith(prefix):
            return None
        room = path[len(prefix):].upper()
        return room if ROOM_RE.fullmatch(room) else None

    def _token(self) -> str:
        token = self.headers.get('X-PicklePulse-Token', '').lower()
        return token if TOKEN_RE.fullmatch(token) else ''

    def do_HEAD(self) -> None:  # noqa: N802
        if self._reject_invalid_host():
            return
        super().do_HEAD()

    def do_GET(self) -> None:  # noqa: N802
        if self._reject_invalid_host():
            return
        path = urlparse(self.path).path
        if path.startswith('/api/') and self._reject_api_flood():
            return
        if path == '/api/live/ping':
            self._json(HTTPStatus.OK, {'ok': True, 'transport': 'local-lan'})
            return
        room = self._live_room()
        if room is None:
            super().do_GET()
            return
        token = self._token()
        viewer = self.headers.get('X-PicklePulse-Viewer', '').lower()
        if not token or not VIEWER_RE.fullmatch(viewer):
            self._json(HTTPStatus.BAD_REQUEST, {'error': 'invalid-request'})
            return
        try:
            packet, version = LIVE_STORE.get(room, token, viewer)
        except KeyError:
            self._json(HTTPStatus.NOT_FOUND, {'error': 'room-not-found'})
            return
        except PermissionError:
            self._json(HTTPStatus.FORBIDDEN, {'error': 'access-denied'})
            return
        except OverflowError:
            self._json(HTTPStatus.TOO_MANY_REQUESTS, {'error': 'viewer-limit'})
            return
        etag = f'"{version}"'
        if self.headers.get('If-None-Match') == etag:
            self._empty(HTTPStatus.NOT_MODIFIED, {'ETag': etag})
            return
        self._json(HTTPStatus.OK, packet, {'ETag': etag})

    def do_POST(self) -> None:  # noqa: N802
        if self._reject_invalid_host():
            return
        if self._reject_api_flood():
            return
        room = self._live_room()
        if room is None:
            self._json(HTTPStatus.NOT_FOUND, {'error': 'not-found'})
            return
        token = self._token()
        if not token:
            self._json(HTTPStatus.BAD_REQUEST, {'error': 'invalid-token'})
            return
        content_type = self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
        if content_type != 'application/json':
            self._json(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {'error': 'json-required'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {'error': 'payload-too-large'})
            return
        try:
            packet = json.loads(self.rfile.read(length).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(HTTPStatus.BAD_REQUEST, {'error': 'invalid-json'})
            return
        if not isinstance(packet, dict) or packet.get('type') != 'state' or not isinstance(packet.get('game'), dict):
            self._json(HTTPStatus.BAD_REQUEST, {'error': 'invalid-state'})
            return
        client = str(self.client_address[0])
        if not LIVE_STORE.exists(room) and not RATE_LIMITER.allow('new-room', client, NEW_ROOM_LIMIT, NEW_ROOM_WINDOW_SECONDS):
            self._json(HTTPStatus.TOO_MANY_REQUESTS, {'error': 'room-create-rate-limit'}, {'Retry-After': '60'})
            return
        try:
            version, viewers = LIVE_STORE.put(room, token, packet)
        except PermissionError:
            self._json(HTTPStatus.CONFLICT, {'error': 'room-conflict'})
            return
        except OverflowError:
            self._json(HTTPStatus.SERVICE_UNAVAILABLE, {'error': 'room-limit'}, {'Retry-After': '60'})
            return
        self._json(HTTPStatus.OK, {'ok': True, 'version': version, 'viewers': viewers})

    def do_DELETE(self) -> None:  # noqa: N802
        if self._reject_invalid_host():
            return
        if self._reject_api_flood():
            return
        room = self._live_room()
        if room is None:
            self._json(HTTPStatus.NOT_FOUND, {'error': 'not-found'})
            return
        token = self._token()
        if not token:
            self._json(HTTPStatus.BAD_REQUEST, {'error': 'invalid-token'})
            return
        try:
            deleted = LIVE_STORE.delete(room, token)
        except PermissionError:
            self._json(HTTPStatus.FORBIDDEN, {'error': 'access-denied'})
            return
        self._json(HTTPStatus.OK, {'ok': True, 'deleted': deleted})


def main() -> None:
    parser = argparse.ArgumentParser(description='Serve PicklePulse on a trusted local network.')
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--bind', default='0.0.0.0')
    parser.add_argument('--cert', help='Optional PEM certificate for HTTPS')
    parser.add_argument('--key', help='Optional PEM private key for HTTPS')
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error('--cert and --key must be provided together')

    handler = partial(SecureHandler, directory=str(ROOT_DIR))
    server = SecureHTTPServer((args.bind, args.port), handler)
    server.is_https = False
    scheme = 'http'
    if args.cert and args.key:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.cert, args.key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        server.is_https = True
        scheme = 'https'

    print(f'PicklePulse is available at {scheme}://localhost:{args.port}')
    print("On the same trusted Wi-Fi, open this computer's LAN IP and the same port on both devices.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
