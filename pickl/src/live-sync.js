(function attachPickleLive(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleLive(root) {
  'use strict';

  const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MAX_LIVE_PAYLOAD_CHARS = 100000;
  const CONNECT_TIMEOUT_MS = 8000;
  const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
  const PEERJS_INTEGRITY = 'sha512-XEKeWX+mI3Ov+tg2evDlVQFzVOIp4T8J3cNcCEPaEUGpxJV3eZaN8rHuvnFPvQpGJBHPmrozJDMpm2xcDvtmyQ==';
  const PEER_LABEL = 'picklepulse-display';
  const PEER_OPTIONS = Object.freeze({
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }
  });

  let peerLoadPromise = null;

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

  function controllerPeerId(room) {
    const normalized = normalizeRoom(room);
    if (!normalized) throw new Error('A valid room code is required.');
    return `picklepulse-${normalized.toLowerCase()}`;
  }

  function displayUrl(room, href) {
    const source = href || (root.location && root.location.href);
    if (!source) throw new Error('App URL unavailable.');
    const url = new URL(source);
    const forcedTransport = url.searchParams.get('liveTransport');
    url.search = '';
    url.hash = '';
    if (forcedTransport === 'lan' || forcedTransport === 'peer') {
      url.searchParams.set('liveTransport', forcedTransport);
    }
    url.searchParams.set('watch', normalizeRoom(room));
    return url.toString();
  }

  function isLocalNetworkHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (host === '::1') return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match172 = host.match(/^172\.(\d{1,3})\./);
    if (match172) {
      const second = Number(match172[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  }

  function transportMode(href) {
    const source = href || (root.location && root.location.href);
    if (!source) return 'peer';
    let url;
    try { url = new URL(source); } catch (_error) { return 'peer'; }
    const forced = String(url.searchParams.get('liveTransport') || '').toLowerCase();
    if (forced === 'lan' || forced === 'peer') return forced;
    return isLocalNetworkHost(url.hostname) ? 'lan' : 'peer';
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

  function parseSocketMessage(event) {
    if (!event || typeof event.data !== 'string') return null;
    if (event.data.length > MAX_LIVE_PAYLOAD_CHARS + 2048) return null;
    try {
      const value = JSON.parse(event.data);
      return value && typeof value === 'object' ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function parsePeerMessage(value) {
    if (!value || typeof value !== 'object') return null;
    try {
      if (JSON.stringify(value).length > MAX_LIVE_PAYLOAD_CHARS + 2048) return null;
    } catch (_error) {
      return null;
    }
    return value;
  }

  function makeError(message, type) {
    const error = new Error(message || 'Live Display connection failed.');
    if (type) error.type = type;
    return error;
  }

  function loadPeerJs() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (peerLoadPromise) return peerLoadPromise;
    if (!root.document || !document.createElement) {
      return Promise.reject(makeError('Peer-to-peer Live Display is unavailable in this environment.', 'unsupported'));
    }
    peerLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(makeError('PeerJS did not load. Check the Internet connection.', 'peer-load-timeout'));
      }, CONNECT_TIMEOUT_MS);
      script.src = PEERJS_URL;
      script.integrity = PEERJS_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.async = true;
      script.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (root.Peer) resolve(root.Peer);
        else reject(makeError('PeerJS loaded but did not initialize.', 'peer-load-failed'));
      };
      script.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(makeError('Could not load PeerJS. Live Display from the hosted PWA needs Internet access.', 'peer-load-failed'));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      peerLoadPromise = null;
      throw error;
    });
    return peerLoadPromise;
  }

  function clonePeerOptions() {
    return {
      host: PEER_OPTIONS.host,
      port: PEER_OPTIONS.port,
      path: PEER_OPTIONS.path,
      secure: PEER_OPTIONS.secure,
      config: {
        iceServers: PEER_OPTIONS.config.iceServers.map((entry) => ({ ...entry }))
      }
    };
  }

  class RelayController {
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
    }

    status(phase, detail) {
      this.onStatus({ phase, room: this.room, viewers: this.viewers, detail: detail || '' });
    }

    async start() {
      if (!this.room) throw makeError('A valid room code is required.', 'invalid-room');
      if (!this.WebSocketCtor) throw makeError('WebSocket is not supported by this browser.', 'unsupported');
      this.stopped = false;
      this.status('starting');
      await this.openSocket(true);
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
          const message = parseSocketMessage(event);
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

  class RelayViewer {
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
        const message = parseSocketMessage(event);
        if (!message) return;

        if (message.type === 'ready') {
          this.retryCount = 0;
          this.status('connecting', message.controller ? 'Waiting for score' : 'Waiting for controller');
          return;
        }

        if (message.type === 'controller') {
          if (message.online) this.status(this.hasState ? 'live' : 'connecting', this.hasState ? '' : 'Waiting for score');
          else {
            this.hasState = false;
            this.status('reconnecting', 'Waiting for controller');
          }
          return;
        }

        if (message.type === 'state' && message.game) {
          this.hasState = true;
          this.onState(message.game, message.sentAt || Date.now());
          this.status('live');
          return;
        }

        if (message.type === 'error') this.status('error', message.message || 'LAN relay error');
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

  class PeerController {
    constructor(options) {
      this.room = normalizeRoom(options.room);
      this.getState = options.getState;
      this.onStatus = options.onStatus || (() => {});
      this.PeerCtor = options.PeerCtor || null;
      this.peer = null;
      this.connections = new Set();
      this.stopped = false;
      this.reconnectTimer = null;
      this.retryCount = 0;
      this.viewers = 0;
      this.ready = false;
    }

    status(phase, detail) {
      this.viewers = Array.from(this.connections).filter((connection) => connection && connection.open).length;
      this.onStatus({ phase, room: this.room, viewers: this.viewers, detail: detail || '' });
    }

    async start() {
      if (!this.room) throw makeError('A valid room code is required.', 'invalid-room');
      if (!this.PeerCtor) this.PeerCtor = await loadPeerJs();
      this.stopped = false;
      this.status('starting', 'Connecting to Live Display service');
      await this.openPeer(true);
      return this;
    }

    openPeer(initial) {
      clearTimeout(this.reconnectTimer);
      if (this.stopped) return Promise.reject(makeError('Stopped.', 'stopped'));

      return new Promise((resolve, reject) => {
        let settled = false;
        let opened = false;
        let timer = null;
        let peer;

        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };

        try {
          peer = new this.PeerCtor(controllerPeerId(this.room), clonePeerOptions());
        } catch (error) {
          fail(makeError(error && error.message, 'peer-unavailable'));
          return;
        }

        this.peer = peer;
        timer = setTimeout(() => {
          if (settled || opened) return;
          try { peer.destroy(); } catch (_error) {}
          fail(makeError('Live Display service did not respond.', 'peer-timeout'));
        }, CONNECT_TIMEOUT_MS);

        peer.on('open', () => {
          opened = true;
          this.ready = true;
          this.retryCount = 0;
          this.status('live');
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(this);
          }
        });

        peer.on('connection', (connection) => {
          if (!connection || connection.label !== PEER_LABEL) {
            try { connection.close(); } catch (_error) {}
            return;
          }
          connection.on('open', () => {
            if (this.stopped) {
              try { connection.close(); } catch (_error) {}
              return;
            }
            this.connections.add(connection);
            this.status('live');
            this.sendState(connection);
          });
          connection.on('data', () => {});
          connection.on('close', () => {
            this.connections.delete(connection);
            if (!this.stopped) this.status('live');
          });
          connection.on('error', () => {
            this.connections.delete(connection);
            if (!this.stopped) this.status('live');
          });
        });

        peer.on('disconnected', () => {
          if (this.stopped) return;
          this.status('reconnecting', 'Reconnecting Live Display');
          try { peer.reconnect(); } catch (_error) { this.scheduleReconnect(); }
        });

        peer.on('close', () => {
          if (this.peer === peer) this.peer = null;
          if (this.stopped) return;
          this.ready = false;
          if (!opened && !settled) {
            fail(makeError('Could not connect to Live Display service.', 'peer-unavailable'));
            return;
          }
          this.status('reconnecting', 'Live Display disconnected');
          this.scheduleReconnect();
        });

        peer.on('error', (error) => {
          if (this.stopped) return;
          const type = error && error.type;
          if (type === 'unavailable-id') {
            const unavailable = makeError('That room is already active on another controller.', 'unavailable-id');
            if (!opened) fail(unavailable);
            this.status('error', unavailable.message);
            try { peer.destroy(); } catch (_error) {}
            return;
          }
          const message = error && error.message ? error.message : 'Live Display connection failed.';
          if (!opened) {
            fail(makeError(message, type || 'peer-unavailable'));
            try { peer.destroy(); } catch (_error) {}
            return;
          }
          this.status('reconnecting', message);
        });
      });
    }

    scheduleReconnect() {
      clearTimeout(this.reconnectTimer);
      if (this.stopped) return;
      this.retryCount += 1;
      const delay = Math.min(10000, 700 * (2 ** Math.min(this.retryCount, 4)));
      this.reconnectTimer = setTimeout(() => {
        if (this.stopped) return;
        try { if (this.peer) this.peer.destroy(); } catch (_error) {}
        this.peer = null;
        this.connections.clear();
        this.openPeer(false).catch((error) => {
          if (this.stopped) return;
          if (error && error.type === 'unavailable-id') {
            this.status('error', error.message);
            return;
          }
          this.status('reconnecting', error && error.message ? error.message : 'Retrying Live Display');
          this.scheduleReconnect();
        });
      }, delay);
    }

    sendState(targetConnection) {
      const state = this.getState && this.getState();
      if (!state) return;
      const payload = { type: 'state', game: state, sentAt: Date.now() };
      try {
        if (JSON.stringify(payload).length > MAX_LIVE_PAYLOAD_CHARS) return;
      } catch (_error) {
        return;
      }
      const targets = targetConnection ? [targetConnection] : Array.from(this.connections);
      for (const connection of targets) {
        if (!connection || !connection.open) continue;
        try { connection.send(payload); } catch (_error) {}
      }
    }

    broadcast() {
      this.sendState();
      this.status(this.ready ? 'live' : 'reconnecting');
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      for (const connection of this.connections) {
        try { connection.close(); } catch (_error) {}
      }
      this.connections.clear();
      if (this.peer) {
        try { this.peer.destroy(); } catch (_error) {}
      }
      this.peer = null;
      this.ready = false;
      this.viewers = 0;
      this.status('off');
    }
  }

  class PeerViewer {
    constructor(options) {
      this.room = normalizeRoom(options.room);
      this.onState = options.onState || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.PeerCtor = options.PeerCtor || null;
      this.peer = null;
      this.connection = null;
      this.stopped = false;
      this.retryTimer = null;
      this.retryCount = 0;
      this.hasState = false;
      this.peerReady = false;
    }

    status(phase, detail) {
      this.onStatus({ phase, room: this.room, detail: detail || '' });
    }

    async start() {
      if (!this.room) throw makeError('A valid room code is required.', 'invalid-room');
      if (!this.PeerCtor) this.PeerCtor = await loadPeerJs();
      this.stopped = false;
      this.status('connecting', 'Connecting to live room');
      this.createPeer();
      return this;
    }

    createPeer() {
      if (this.stopped) return;
      let peer;
      try {
        peer = new this.PeerCtor(undefined, clonePeerOptions());
      } catch (error) {
        this.status('error', error && error.message ? error.message : 'Could not start Live Display');
        this.scheduleReconnect(true);
        return;
      }
      this.peer = peer;
      this.peerReady = false;

      peer.on('open', () => {
        if (this.stopped) return;
        this.peerReady = true;
        this.retryCount = 0;
        this.connectToController();
      });

      peer.on('disconnected', () => {
        if (this.stopped) return;
        this.peerReady = false;
        this.status('reconnecting', 'Reconnecting Live Display');
        try { peer.reconnect(); } catch (_error) { this.scheduleReconnect(true); }
      });

      peer.on('close', () => {
        if (this.peer === peer) this.peer = null;
        if (this.stopped) return;
        this.peerReady = false;
        this.hasState = false;
        this.status('reconnecting', 'Live Display disconnected');
        this.scheduleReconnect(true);
      });

      peer.on('error', (error) => {
        if (this.stopped) return;
        const type = error && error.type;
        if (type === 'peer-unavailable') {
          this.hasState = false;
          this.status('reconnecting', 'Waiting for controller');
          this.scheduleReconnect(false);
          return;
        }
        const message = error && error.message ? error.message : 'Live Display connection failed.';
        this.status('reconnecting', message);
      });
    }

    connectToController() {
      clearTimeout(this.retryTimer);
      if (this.stopped || !this.peer || !this.peerReady) return;
      if (this.connection) {
        try { this.connection.close(); } catch (_error) {}
      }
      let connection;
      try {
        connection = this.peer.connect(controllerPeerId(this.room), {
          label: PEER_LABEL,
          reliable: true,
          serialization: 'json'
        });
      } catch (error) {
        this.status('reconnecting', error && error.message ? error.message : 'Waiting for controller');
        this.scheduleReconnect(false);
        return;
      }
      this.connection = connection;
      this.status(this.retryCount ? 'reconnecting' : 'connecting', 'Waiting for controller');

      connection.on('open', () => {
        if (this.stopped) return;
        this.retryCount = 0;
        this.status(this.hasState ? 'live' : 'connecting', this.hasState ? '' : 'Waiting for score');
      });

      connection.on('data', (value) => {
        const message = parsePeerMessage(value);
        if (!message || message.type !== 'state' || !message.game) return;
        this.hasState = true;
        this.onState(message.game, message.sentAt || Date.now());
        this.status('live');
      });

      connection.on('close', () => {
        if (this.connection === connection) this.connection = null;
        if (this.stopped) return;
        this.hasState = false;
        this.status('reconnecting', 'Waiting for controller');
        this.scheduleReconnect(false);
      });

      connection.on('error', () => {
        if (this.stopped) return;
        this.hasState = false;
        this.status('reconnecting', 'Waiting for controller');
        this.scheduleReconnect(false);
      });
    }

    scheduleReconnect(recreatePeer) {
      clearTimeout(this.retryTimer);
      if (this.stopped) return;
      this.retryCount += 1;
      const delay = Math.min(10000, 700 * (2 ** Math.min(this.retryCount, 4)));
      this.retryTimer = setTimeout(() => {
        if (this.stopped) return;
        if (recreatePeer || !this.peer || this.peer.destroyed) {
          try { if (this.peer) this.peer.destroy(); } catch (_error) {}
          this.peer = null;
          this.createPeer();
        } else {
          this.connectToController();
        }
      }, delay);
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      if (this.connection) {
        try { this.connection.close(); } catch (_error) {}
      }
      this.connection = null;
      if (this.peer) {
        try { this.peer.destroy(); } catch (_error) {}
      }
      this.peer = null;
      this.status('off');
    }
  }

  class LiveController {
    constructor(options) {
      this.mode = options.transport || transportMode(options.href);
      this.impl = this.mode === 'lan' ? new RelayController(options) : new PeerController(options);
    }

    start() { return this.impl.start().then(() => this); }
    broadcast() { return this.impl.broadcast(); }
    stop() { return this.impl.stop(); }
  }

  class LiveViewer {
    constructor(options) {
      this.mode = options.transport || transportMode(options.href);
      this.impl = this.mode === 'lan' ? new RelayViewer(options) : new PeerViewer(options);
    }

    start() { return this.impl.start().then(() => this); }
    stop() { return this.impl.stop(); }
  }

  return {
    MAX_LIVE_PAYLOAD_CHARS,
    normalizeRoom,
    generateRoomCode,
    controllerPeerId,
    displayUrl,
    relayUrl,
    transportMode,
    adaptRemoteGame,
    LiveController,
    LiveViewer
  };
});
