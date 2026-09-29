(function attachPickleLive(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleLive(root) {
  'use strict';

  const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MAX_LIVE_PAYLOAD_CHARS = 100000;
  const CONNECT_TIMEOUT_MS = 6000;

  function normalizeRoom(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^2-9A-HJ-NP-Z]/g, '')
      .slice(0, 8);
  }

  function generateRoomCode(length = 8, randomSource) {
    const size = Math.max(4, Math.min(8, Number(length) || 8));
    const getRandom = randomSource || (() => {
      if (!root.crypto || !root.crypto.getRandomValues) {
        throw new Error('Secure random generator unavailable.');
      }
      const value = new Uint32Array(1);
      root.crypto.getRandomValues(value);
      return value[0] / 4294967296;
    });
    let code = '';
    for (let i = 0; i < size; i += 1) {
      code += ROOM_ALPHABET[Math.floor(getRandom() * ROOM_ALPHABET.length) % ROOM_ALPHABET.length];
    }
    return code;
  }

  // Kept for compatibility with older tests/callers. The LAN relay uses room codes,
  // but this stable legacy identifier is still useful for logging/debugging.
  function controllerPeerId(room) {
    const normalized = normalizeRoom(room);
    if (!normalized) throw new Error('A valid room code is required.');
    return `picklepulse-${normalized.toLowerCase()}`;
  }

  function displayUrl(room, href) {
    const source = href || (root.location && root.location.href);
    if (!source) throw new Error('App URL unavailable.');
    const url = new URL(source);
    url.search = '';
    url.hash = '';
    url.searchParams.set('watch', normalizeRoom(room));
    return url.toString();
  }

  function relayUrl(room, role, href) {
    const source = href || (root.location && root.location.href);
    if (!source) throw new Error('App URL unavailable.');
    const url = new URL(source);
    if (!/^https?:$/.test(url.protocol)) {
      throw new Error('Open PicklePulse through the included LAN server.');
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/live';
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', normalizeRoom(room));
    url.searchParams.set('role', role === 'controller' ? 'controller' : 'viewer');
    return url.toString();
  }

  function adaptRemoteGame(game, sentAt, receivedAt) {
    const clone = JSON.parse(JSON.stringify(game));
    const sent = Number(sentAt);
    const received = Number(receivedAt || Date.now());
    if (clone && clone.timer && clone.timer.running && Number.isFinite(Number(clone.timer.startedAt))
      && Number.isFinite(sent) && Number.isFinite(received)) {
      clone.timer.startedAt = Number(clone.timer.startedAt) + (received - sent);
    }
    return clone;
  }

  function parseMessage(event) {
    if (!event || typeof event.data !== 'string') return null;
    if (event.data.length > MAX_LIVE_PAYLOAD_CHARS + 2048) return null;
    try {
      const value = JSON.parse(event.data);
      return value && typeof value === 'object' ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function makeError(message, type) {
    const error = new Error(message || 'LAN relay connection failed.');
    if (type) error.type = type;
    return error;
  }

  class LiveController {
    constructor(options) {
      this.room = normalizeRoom(options.room);
      this.getState = options.getState;
      this.onStatus = options.onStatus || (() => {});
      this.WebSocketCtor = options.WebSocketCtor || root.WebSocket;
      this.socket = null;
      this.stopped = false;
      this.reconnectTimer = null;
      this.retryCount = 0;
      this.viewers = 0;
      this.started = false;
    }

    status(phase, detail) {
      this.onStatus({
        phase,
        room: this.room,
        viewers: this.viewers,
        detail: detail || ''
      });
    }

    async start() {
      if (!this.room) throw makeError('A valid room code is required.', 'invalid-room');
      if (!this.WebSocketCtor) throw makeError('WebSocket is not supported by this browser.', 'unsupported');
      this.stopped = false;
      this.status('starting');
      await this.openSocket(true);
      this.started = true;
      return this;
    }

    openSocket(initial) {
      clearTimeout(this.reconnectTimer);
      if (this.stopped) return Promise.reject(makeError('Stopped.', 'stopped'));

      return new Promise((resolve, reject) => {
        let settled = false;
        let ready = false;
        let timer = null;
        let socket;

        const finishReject = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };

        try {
          socket = new this.WebSocketCtor(relayUrl(this.room, 'controller'));
        } catch (error) {
          finishReject(makeError(error && error.message, 'relay-unavailable'));
          return;
        }

        this.socket = socket;
        timer = setTimeout(() => {
          if (settled || ready) return;
          try { socket.close(); } catch (_error) {}
          finishReject(makeError('LAN relay did not respond.', 'relay-timeout'));
        }, CONNECT_TIMEOUT_MS);

        socket.addEventListener('open', () => {
          if (!initial) this.status('reconnecting');
        });

        socket.addEventListener('message', (event) => {
          const message = parseMessage(event);
          if (!message) return;

          if (message.type === 'error') {
            const type = message.code === 'room-in-use' ? 'unavailable-id' : (message.code || 'relay-error');
            const error = makeError(message.message || 'LAN relay rejected the connection.', type);
            if (!ready) finishReject(error);
            this.status('error', error.message);
            try { socket.close(); } catch (_error) {}
            return;
          }

          if (message.type === 'ready') {
            ready = true;
            this.retryCount = 0;
            this.viewers = Math.max(0, Number(message.viewers) || 0);
            this.status('live');
            this.sendState();
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(this);
            }
            return;
          }

          if (message.type === 'viewers') {
            this.viewers = Math.max(0, Number(message.count) || 0);
            this.status('live');
          }
        });

        socket.addEventListener('close', () => {
          clearTimeout(timer);
          if (this.socket === socket) this.socket = null;
          if (this.stopped) return;
          if (!ready && !settled) {
            finishReject(makeError('Could not connect to the LAN relay.', 'relay-unavailable'));
            return;
          }
          this.status('reconnecting');
          this.scheduleReconnect();
        });

        socket.addEventListener('error', () => {
          if (this.stopped) return;
          if (!ready && initial) this.status('starting', 'Connecting to LAN relay');
        });
      });
    }

    scheduleReconnect() {
      clearTimeout(this.reconnectTimer);
      if (this.stopped) return;
      this.retryCount += 1;
      const delay = Math.min(8000, 500 * (2 ** Math.min(this.retryCount, 4)));
      this.reconnectTimer = setTimeout(() => {
        if (this.stopped) return;
        this.openSocket(false).catch((error) => {
          if (this.stopped) return;
          if (error && error.type === 'unavailable-id') {
            this.status('error', 'Room is active on another controller');
            return;
          }
          this.status('reconnecting', error && error.message ? error.message : 'Retrying LAN relay');
          this.scheduleReconnect();
        });
      }, delay);
    }

    sendState() {
      const socket = this.socket;
      if (!socket || socket.readyState !== 1) return;
      const state = this.getState && this.getState();
      if (!state) return;
      const payload = { type: 'state', game: state, sentAt: Date.now() };
      try {
        const serialized = JSON.stringify(payload);
        if (serialized.length > MAX_LIVE_PAYLOAD_CHARS) return;
        socket.send(serialized);
      } catch (_error) {}
    }

    broadcast() {
      this.sendState();
      const connected = this.socket && this.socket.readyState === 1;
      this.status(connected ? 'live' : 'reconnecting');
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.socket) {
        try { this.socket.close(1000, 'Controller stopped'); } catch (_error) {}
      }
      this.socket = null;
      this.viewers = 0;
      this.status('off');
    }
  }

  class LiveViewer {
    constructor(options) {
      this.room = normalizeRoom(options.room);
      this.onState = options.onState || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.WebSocketCtor = options.WebSocketCtor || root.WebSocket;
      this.socket = null;
      this.stopped = false;
      this.retryCount = 0;
      this.retryTimer = null;
      this.hasState = false;
    }

    status(phase, detail) {
      this.onStatus({ phase, room: this.room, detail: detail || '' });
    }

    async start() {
      if (!this.room) throw makeError('A valid room code is required.', 'invalid-room');
      if (!this.WebSocketCtor) throw makeError('WebSocket is not supported by this browser.', 'unsupported');
      this.stopped = false;
      this.status('connecting');
      this.connect();
      return this;
    }

    connect() {
      clearTimeout(this.retryTimer);
      if (this.stopped) return;
      if (this.socket) {
        try { this.socket.close(); } catch (_error) {}
      }

      let socket;
      try {
        socket = new this.WebSocketCtor(relayUrl(this.room, 'viewer'));
      } catch (error) {
        this.status('error', error && error.message ? error.message : 'Could not open LAN relay');
        this.scheduleReconnect();
        return;
      }
      this.socket = socket;
      this.status(this.retryCount ? 'reconnecting' : 'connecting');

      socket.addEventListener('message', (event) => {
        const message = parseMessage(event);
        if (!message) return;

        if (message.type === 'ready') {
          this.retryCount = 0;
          this.status(message.controller ? 'connecting' : 'connecting', message.controller ? 'Waiting for score' : 'Waiting for controller');
          return;
        }

        if (message.type === 'controller') {
          if (message.online) {
            this.status(this.hasState ? 'live' : 'connecting', this.hasState ? '' : 'Waiting for score');
          } else {
            this.hasState = false;
            this.status('reconnecting', 'Waiting for controller');
          }
          return;
        }

        if (message.type === 'state' && message.game) {
          try {
            if (JSON.stringify(message).length > MAX_LIVE_PAYLOAD_CHARS) return;
          } catch (_error) {
            return;
          }
          this.hasState = true;
          this.onState(message.game, message.sentAt || Date.now());
          this.status('live');
          return;
        }

        if (message.type === 'error') {
          this.status('error', message.message || 'LAN relay error');
        }
      });

      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = null;
        if (!this.stopped) {
          this.hasState = false;
          this.status('reconnecting', 'LAN relay disconnected');
          this.scheduleReconnect();
        }
      });

      socket.addEventListener('error', () => {
        if (!this.stopped) this.status('reconnecting', 'Connecting to LAN relay');
      });
    }

    scheduleReconnect() {
      clearTimeout(this.retryTimer);
      if (this.stopped) return;
      this.retryCount += 1;
      const delay = Math.min(10000, 700 * (2 ** Math.min(this.retryCount, 4)));
      this.retryTimer = setTimeout(() => this.connect(), delay);
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      if (this.socket) {
        try { this.socket.close(1000, 'Viewer stopped'); } catch (_error) {}
      }
      this.socket = null;
      this.status('off');
    }
  }

  return {
    MAX_LIVE_PAYLOAD_CHARS,
    normalizeRoom,
    generateRoomCode,
    controllerPeerId,
    displayUrl,
    relayUrl,
    adaptRemoteGame,
    LiveController,
    LiveViewer
  };
});
