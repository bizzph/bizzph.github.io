#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8080));
const ROOT = __dirname;
const TLS_CERT = process.env.TLS_CERT || '';
const TLS_KEY = process.env.TLS_KEY || '';
if (Boolean(TLS_CERT) !== Boolean(TLS_KEY)) {
  console.error('Set both TLS_CERT and TLS_KEY, or neither.');
  process.exit(1);
}
const USE_TLS = Boolean(TLS_CERT && TLS_KEY);
const PROTOCOL = USE_TLS ? 'https' : 'http';
const MAX_CLIENT_MESSAGE_BYTES = 128 * 1024;
const MAX_STATE_CHARS = 100000;
const ROOM_RE = /^[2-9A-HJ-NP-Z]{4,8}$/;
const rooms = new Map();

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
});

function roomState(code) {
  if (!rooms.has(code)) rooms.set(code, { controller: null, viewers: new Set() });
  return rooms.get(code);
}

function pruneRoom(code) {
  const room = rooms.get(code);
  if (room && !room.controller && room.viewers.size === 0) rooms.delete(code);
}

function safeStaticPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (_error) { return null; }
  if (decoded === '/') decoded = '/index.html';
  if (decoded.includes('\0')) return null;

  const allowed = decoded === '/index.html'
    || decoded === '/styles.css'
    || decoded === '/manifest.webmanifest'
    || decoded === '/sw.js'
    || decoded.startsWith('/src/')
    || decoded.startsWith('/assets/');
  if (!allowed) return null;

  const relative = decoded.replace(/^\/+/, '');
  const full = path.resolve(ROOT, relative);
  if (!full.startsWith(`${path.resolve(ROOT)}${path.sep}`) && full !== path.resolve(ROOT, 'index.html')) return null;
  return full;
}

function serveFile(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  if (requestUrl.pathname === '/healthz') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  const filePath = safeStaticPath(requestUrl.pathname);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Not found');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600'
    };
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function encodeFrame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
  let header;
  if (body.length < 126) {
    header = Buffer.allocUnsafe(2);
    header[1] = body.length;
  } else if (body.length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  header[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([header, body]);
}

class WsConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.fragmentOpcode = 0;
    this.fragments = [];
    this.fragmentBytes = 0;
    this.onText = () => {};
    this.onClose = () => {};
    socket.on('data', (chunk) => this.feed(chunk));
    socket.on('close', () => this.finishClose());
    socket.on('end', () => this.finishClose());
    socket.on('error', () => this.finishClose());
  }

  sendJson(value) {
    if (this.closed || this.socket.destroyed) return false;
    try {
      this.socket.write(encodeFrame(0x1, JSON.stringify(value)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  sendPong(payload) {
    if (!this.closed && !this.socket.destroyed) this.socket.write(encodeFrame(0xA, payload));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const reasonBytes = Buffer.from(String(reason || '').slice(0, 120));
    const payload = Buffer.allocUnsafe(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    reasonBytes.copy(payload, 2);
    try { this.socket.write(encodeFrame(0x8, payload)); } catch (_error) {}
    this.closed = true;
    try { this.socket.end(); } catch (_error) {}
    this.onClose();
  }

  finishClose() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }

  feed(chunk) {
    if (this.closed) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    while (this.buffer.length >= 2 && !this.closed) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const longLength = this.buffer.readBigUInt64BE(2);
        if (longLength > BigInt(MAX_CLIENT_MESSAGE_BYTES)) {
          this.close(1009, 'Message too large');
          return;
        }
        length = Number(longLength);
        offset = 10;
      }

      if (!masked) {
        this.close(1002, 'Client frames must be masked');
        return;
      }
      if (length > MAX_CLIENT_MESSAGE_BYTES) {
        this.close(1009, 'Message too large');
        return;
      }
      if (this.buffer.length < offset + 4 + length) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];

      if (opcode === 0x8) {
        this.close(1000, 'Closed');
        return;
      }
      if (opcode === 0x9) {
        this.sendPong(payload);
        continue;
      }
      if (opcode === 0xA) continue;

      if (opcode === 0x1 || opcode === 0x2) {
        if (this.fragmentOpcode) {
          this.close(1002, 'Unexpected data frame');
          return;
        }
        if (fin) {
          if (opcode !== 0x1) continue;
          this.onText(payload.toString('utf8'));
        } else {
          this.fragmentOpcode = opcode;
          this.fragments = [payload];
          this.fragmentBytes = payload.length;
        }
        continue;
      }

      if (opcode === 0x0) {
        if (!this.fragmentOpcode) {
          this.close(1002, 'Unexpected continuation');
          return;
        }
        this.fragments.push(payload);
        this.fragmentBytes += payload.length;
        if (this.fragmentBytes > MAX_CLIENT_MESSAGE_BYTES) {
          this.close(1009, 'Message too large');
          return;
        }
        if (fin) {
          const whole = Buffer.concat(this.fragments, this.fragmentBytes);
          const kind = this.fragmentOpcode;
          this.fragmentOpcode = 0;
          this.fragments = [];
          this.fragmentBytes = 0;
          if (kind === 0x1) this.onText(whole.toString('utf8'));
        }
        continue;
      }

      this.close(1002, 'Unsupported frame');
    }
  }
}

function notifyViewerCount(code) {
  const room = rooms.get(code);
  if (!room || !room.controller) return;
  room.controller.sendJson({ type: 'viewers', count: room.viewers.size });
}

function broadcastControllerPresence(code, online) {
  const room = rooms.get(code);
  if (!room) return;
  for (const viewer of room.viewers) viewer.sendJson({ type: 'controller', online: Boolean(online) });
}

function attachController(connection, code) {
  const room = roomState(code);
  if (room.controller && !room.controller.closed) {
    connection.sendJson({ type: 'error', code: 'room-in-use', message: 'That room is already active on another controller.' });
    connection.close(4009, 'Room in use');
    return;
  }

  room.controller = connection;
  connection.sendJson({ type: 'ready', role: 'controller', room: code, viewers: room.viewers.size });
  broadcastControllerPresence(code, true);

  connection.onText = (text) => {
    if (text.length > MAX_STATE_CHARS) return;
    let message;
    try { message = JSON.parse(text); } catch (_error) { return; }
    if (!message || message.type !== 'state' || !message.game) return;
    const sentAt = Number(message.sentAt) || Date.now();
    const outgoing = JSON.stringify({ type: 'state', game: message.game, sentAt });
    if (outgoing.length > MAX_STATE_CHARS) return;
    for (const viewer of room.viewers) {
      if (!viewer.closed) {
        try { viewer.socket.write(encodeFrame(0x1, outgoing)); } catch (_error) {}
      }
    }
  };

  connection.onClose = () => {
    if (room.controller === connection) {
      room.controller = null;
      broadcastControllerPresence(code, false);
    }
    pruneRoom(code);
  };
}

function attachViewer(connection, code) {
  const room = roomState(code);
  room.viewers.add(connection);
  connection.sendJson({ type: 'ready', role: 'viewer', room: code, controller: Boolean(room.controller && !room.controller.closed) });
  notifyViewerCount(code);
  connection.onText = () => {}; // Spectator displays are read-only.
  connection.onClose = () => {
    room.viewers.delete(connection);
    notifyViewerCount(code);
    pruneRoom(code);
  };
}

function rejectUpgrade(socket, statusLine, message) {
  const body = message || 'Bad request';
  socket.write(`${statusLine}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  socket.destroy();
}

const server = USE_TLS
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, serveFile)
  : http.createServer(serveFile);

server.on('upgrade', (req, socket) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (_error) {
    rejectUpgrade(socket, 'HTTP/1.1 400 Bad Request', 'Bad request');
    return;
  }
  if (url.pathname !== '/live') {
    rejectUpgrade(socket, 'HTTP/1.1 404 Not Found', 'Not found');
    return;
  }

  const room = String(url.searchParams.get('room') || '').toUpperCase();
  const role = url.searchParams.get('role');
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  if (!ROOM_RE.test(room) || !['controller', 'viewer'].includes(role) || !key || version !== '13') {
    rejectUpgrade(socket, 'HTTP/1.1 400 Bad Request', 'Invalid WebSocket request');
    return;
  }

  const accept = crypto.createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  const connection = new WsConnection(socket);
  if (role === 'controller') attachController(connection, room);
  else attachViewer(connection, room);
});

server.listen(PORT, HOST, () => {
  console.log('PicklePulse LAN server is running.');
  console.log(`Local: ${PROTOCOL}://localhost:${PORT}/`);
  const interfaces = os.networkInterfaces();
  const shown = new Set();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const url = `${PROTOCOL}://${entry.address}:${PORT}/`;
      if (!shown.has(url)) {
        shown.add(url);
        console.log(`LAN:   ${url}`);
      }
    }
  }
  console.log('Open the same LAN URL on the controller and scoreboard devices. Internet access is not required.');
});

function shutdown() {
  for (const room of rooms.values()) {
    if (room.controller) room.controller.close(1001, 'Server stopping');
    for (const viewer of room.viewers) viewer.close(1001, 'Server stopping');
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
