(function attachPickleLive(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleLive(root) {
  'use strict';

  const PEERJS_URLS = [
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'
  ];
  const PEERJS_INTEGRITY = 'sha512-XEKeWX+mI3Ov+tg2evDlVQFzVOIp4T8J3cNcCEPaEUGpxJV3eZaN8rHuvnFPvQpGJBHPmrozJDMpm2xcDvtmyQ==';
  const PEER_OPTIONS = Object.freeze({
    debug: 0,
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      sdpSemantics: 'unified-plan'
    }
  });
  const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MAX_LIVE_PAYLOAD_CHARS = 100000;
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
    url.search = '';
    url.hash = '';
    url.searchParams.set('watch', normalizeRoom(room));
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

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (!root.document) {
        reject(new Error('PeerJS requires a browser document.'));
        return;
      }
      const script = root.document.createElement('script');
      script.src = url;
      script.async = true;
      script.integrity = PEERJS_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => resolve(root.Peer);
      script.onerror = () => reject(new Error(`Unable to load ${url}`));
      root.document.head.appendChild(script);
    });
  }

  function loadPeerJS() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (peerLoadPromise) return peerLoadPromise;
    peerLoadPromise = PEERJS_URLS.reduce((promise, url) => {
      return promise.catch(() => loadScript(url));
    }, Promise.reject(new Error('Starting PeerJS loader'))).then((PeerCtor) => {
      if (!PeerCtor) throw new Error('PeerJS did not initialize.');
      return PeerCtor;
    }).catch((error) => {
      peerLoadPromise = null;
      throw error;
    });
    return peerLoadPromise;
  }

  class LiveController {
    constructor(options) {
      this.room = normalizeRoom(options.room);
      this.getState = options.getState;
      this.onStatus = options.onStatus || (() => {});
      this.PeerCtor = options.PeerCtor || null;
      this.peer = null;
      this.connections = new Set();
      this.stopped = false;
      this.reconnectTimer = null;
    }

    status(phase, detail) {
      this.onStatus({
        phase,
        room: this.room,
        viewers: this.connections.size,
        detail: detail || ''
      });
    }

    async start() {
      this.stopped = false;
      this.status('starting');
      const PeerCtor = this.PeerCtor || await loadPeerJS();
      return new Promise((resolve, reject) => {
        let settled = false;
        this.peer = new PeerCtor(controllerPeerId(this.room), PEER_OPTIONS);

        this.peer.on('open', () => {
          settled = true;
          this.status('live');
          resolve(this);
        });

        this.peer.on('connection', (connection) => this.accept(connection));
        this.peer.on('disconnected', () => {
          if (this.stopped) return;
          this.status('reconnecting');
          this.scheduleReconnect();
        });
        this.peer.on('close', () => {
          if (!this.stopped) this.status('error', 'Live room closed');
        });
        this.peer.on('error', (error) => {
          const type = error && error.type ? error.type : 'peer-error';
          if (!settled && type === 'unavailable-id') {
            settled = true;
            reject(error);
            return;
          }
          this.status('error', type);
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      });
    }

    scheduleReconnect() {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.stopped || !this.peer || this.peer.destroyed) return;
        try {
          this.peer.reconnect();
        } catch (_error) {
          this.scheduleReconnect();
        }
      }, 1500);
    }

    accept(connection) {
      if (!connection || connection.label !== 'picklepulse-display') {
        try { if (connection) connection.close(); } catch (_error) {}
        return;
      }
      const remove = () => {
        this.connections.delete(connection);
        if (!this.stopped) this.status('live');
      };
      connection.on('open', () => {
        this.connections.add(connection);
        this.sendState(connection);
        this.status('live');
      });
      connection.on('close', remove);
      connection.on('error', remove);
      // Controller deliberately ignores all incoming data. Displays are read-only.
      connection.on('data', () => {});
    }

    sendState(connection) {
      if (!connection || !connection.open) return;
      const state = this.getState && this.getState();
      if (!state) return;
      try {
        connection.send({ type: 'state', game: state, sentAt: Date.now() });
      } catch (_error) {
        this.connections.delete(connection);
      }
    }

    broadcast() {
      this.connections.forEach((connection) => this.sendState(connection));
      this.status(this.peer && this.peer.open ? 'live' : 'reconnecting');
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.reconnectTimer);
      this.connections.forEach((connection) => {
        try { connection.close(); } catch (_error) {}
      });
      this.connections.clear();
      if (this.peer) {
        try { this.peer.destroy(); } catch (_error) {}
      }
      this.peer = null;
      this.status('off');
    }
  }

  class LiveViewer {
    constructor(options) {
      this.room = normalizeRoom(options.room);
      this.onState = options.onState || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.PeerCtor = options.PeerCtor || null;
      this.peer = null;
      this.connection = null;
      this.stopped = false;
      this.retryCount = 0;
      this.retryTimer = null;
    }

    status(phase, detail) {
      this.onStatus({ phase, room: this.room, detail: detail || '' });
    }

    async start() {
      this.stopped = false;
      this.status('connecting');
      const PeerCtor = this.PeerCtor || await loadPeerJS();
      this.peer = new PeerCtor(undefined, PEER_OPTIONS);
      this.peer.on('open', () => this.connect());
      this.peer.on('disconnected', () => {
        if (this.stopped) return;
        this.status('reconnecting');
        try { this.peer.reconnect(); } catch (_error) { this.scheduleReconnect(); }
      });
      this.peer.on('error', (error) => {
        if (this.stopped) return;
        this.status('reconnecting', error && error.type ? error.type : 'connection error');
        this.scheduleReconnect();
      });
      return this;
    }

    connect() {
      if (this.stopped || !this.peer || !this.peer.open) return;
      if (this.connection) {
        try { this.connection.close(); } catch (_error) {}
      }
      this.status(this.retryCount ? 'reconnecting' : 'connecting');
      const connection = this.peer.connect(controllerPeerId(this.room), {
        reliable: true,
        serialization: 'json',
        label: 'picklepulse-display'
      });
      this.connection = connection;
      connection.on('open', () => {
        this.retryCount = 0;
        this.status('live');
      });
      connection.on('data', (payload) => {
        if (!payload || payload.type !== 'state' || !payload.game) return;
        try {
          if (JSON.stringify(payload).length > MAX_LIVE_PAYLOAD_CHARS) return;
        } catch (_error) {
          return;
        }
        this.onState(payload.game, payload.sentAt || Date.now());
        this.status('live');
      });
      connection.on('close', () => {
        if (!this.stopped) {
          this.status('reconnecting');
          this.scheduleReconnect();
        }
      });
      connection.on('error', () => {
        if (!this.stopped) this.scheduleReconnect();
      });
    }

    scheduleReconnect() {
      clearTimeout(this.retryTimer);
      if (this.stopped) return;
      this.retryCount += 1;
      const delay = Math.min(10000, 700 * (2 ** Math.min(this.retryCount, 4)));
      this.retryTimer = setTimeout(() => {
        if (this.stopped) return;
        if (this.peer && this.peer.open) this.connect();
        else if (this.peer && !this.peer.destroyed) {
          try { this.peer.reconnect(); } catch (_error) { this.scheduleReconnect(); }
        }
      }, delay);
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.retryTimer);
      if (this.connection) {
        try { this.connection.close(); } catch (_error) {}
      }
      if (this.peer) {
        try { this.peer.destroy(); } catch (_error) {}
      }
      this.connection = null;
      this.peer = null;
      this.status('off');
    }
  }

  return {
    PEERJS_URLS,
    normalizeRoom,
    generateRoomCode,
    controllerPeerId,
    displayUrl,
    adaptRemoteGame,
    loadPeerJS,
    LiveController,
    LiveViewer
  };
});
