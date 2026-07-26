(function attachPickleLive(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleLive(root) {
  'use strict';

  const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const ACCESS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const MIN_ACCESS_KEY_LENGTH = 16;
  const MAX_ACCESS_KEY_LENGTH = 32;
  const MAX_VIEWERS = 3;
  const MAX_MESSAGE_CHARS = 65536;
  const POLL_INTERVAL_MS = 600;
  const HEARTBEAT_INTERVAL_MS = 4000;

  function randomFraction() {
    if (root.crypto && root.crypto.getRandomValues) {
      const value = new Uint32Array(1);
      root.crypto.getRandomValues(value);
      return value[0] / 4294967296;
    }
    return Math.random();
  }

  function secureRandomFraction() {
    if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') {
      throw new Error('This browser cannot create a secure live access key.');
    }
    const value = new Uint32Array(1);
    root.crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }

  function normalizeRoom(value) {
    return String(value || '').toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '').slice(0, 8);
  }

  function normalizeAccessKey(value) {
    return String(value || '').replace(/[^2-9A-HJ-NP-Za-km-z]/g, '').slice(0, MAX_ACCESS_KEY_LENGTH);
  }

  function validAccessKey(value) {
    const key = normalizeAccessKey(value);
    return key.length >= MIN_ACCESS_KEY_LENGTH && key.length <= MAX_ACCESS_KEY_LENGTH;
  }

  function generateToken(alphabet, requestedLength, minimum, maximum, randomSource) {
    const size = Math.max(minimum, Math.min(maximum, Number(requestedLength) || minimum));
    const getRandom = randomSource || randomFraction;
    let token = '';
    for (let index = 0; index < size; index += 1) {
      token += alphabet[Math.floor(getRandom() * alphabet.length) % alphabet.length];
    }
    return token;
  }

  function generateRoomCode(length = 6, randomSource) {
    return generateToken(ROOM_ALPHABET, length, 4, 8, randomSource);
  }

  function generateAccessKey(length = 20, randomSource) {
    return generateToken(ACCESS_ALPHABET, length, MIN_ACCESS_KEY_LENGTH, MAX_ACCESS_KEY_LENGTH, randomSource || secureRandomFraction);
  }

  function accessCode(room, accessKey) {
    const safeRoom = normalizeRoom(room);
    const safeKey = normalizeAccessKey(accessKey);
    return safeRoom && validAccessKey(safeKey) ? `${safeRoom}.${safeKey}` : '';
  }

  function parseAccess(value, href) {
    const raw = String(value || '').trim();
    let room = '';
    let accessKey = '';
    if (raw) {
      try {
        const base = href || (root.location && root.location.href) || 'https://example.test/';
        const url = new URL(raw, base);
        room = normalizeRoom(url.searchParams.get('watch'));
        const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
        accessKey = normalizeAccessKey(fragment.get('key'));
      } catch (_error) {}
    }
    if (!room || !accessKey) {
      const compact = raw.replace(/\s+/g, '');
      const match = compact.match(/^([2-9A-HJ-NP-Z]{4,8})[.:/-]([2-9A-HJ-NP-Za-km-z]{16,32})$/i);
      if (match) {
        room = normalizeRoom(match[1]);
        accessKey = normalizeAccessKey(match[2]);
      }
    }
    return { room, accessKey, valid: Boolean(room && validAccessKey(accessKey)) };
  }

  function displayUrl(room, accessKey, href) {
    const source = href || (root.location && root.location.href) || 'https://example.test/';
    const url = new URL(source);
    url.search = '';
    url.hash = '';
    url.searchParams.set('watch', normalizeRoom(room));
    url.hash = new URLSearchParams({ key: normalizeAccessKey(accessKey) }).toString();
    return url.toString();
  }

  // Small synchronous SHA-256 implementation so authenticated LAN mode also works on HTTP origins.
  function sha256Ascii(value) {
    const input = String(value || '');
    const maxWord = 2 ** 32;
    const words = [];
    const hash = [];
    const constants = [];
    const composite = {};
    let primeCount = 0;
    for (let candidate = 2; primeCount < 64; candidate += 1) {
      if (composite[candidate]) continue;
      for (let multiple = candidate * candidate; multiple < 313; multiple += candidate) composite[multiple] = true;
      hash[primeCount] = (Math.sqrt(candidate) * maxWord) | 0;
      constants[primeCount] = ((candidate ** (1 / 3)) * maxWord) | 0;
      primeCount += 1;
    }
    let ascii = `${input}\u0080`;
    while (ascii.length % 64 !== 56) ascii += '\u0000';
    for (let index = 0; index < ascii.length; index += 1) {
      const code = ascii.charCodeAt(index);
      if (code > 255) throw new Error('Access key contains unsupported characters.');
      words[index >> 2] |= code << ((3 - index) % 4) * 8;
    }
    const bitLength = input.length * 8;
    words.push(Math.floor(bitLength / maxWord));
    words.push(bitLength);
    let workingHash = hash.slice(0, 8);
    for (let offset = 0; offset < words.length; offset += 16) {
      const previousHash = workingHash.slice();
      const schedule = words.slice(offset, offset + 16);
      for (let round = 0; round < 64; round += 1) {
        const w15 = schedule[round - 15];
        const w2 = schedule[round - 2];
        const a = workingHash[0];
        const e = workingHash[4];
        const sigma0 = round < 16 ? 0 : ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        const sigma1 = round < 16 ? 0 : ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        if (round >= 16) schedule[round] = (schedule[round - 16] + sigma0 + schedule[round - 7] + sigma1) | 0;
        const choose = (e & workingHash[5]) ^ (~e & workingHash[6]);
        const majority = (a & workingHash[1]) ^ (a & workingHash[2]) ^ (workingHash[1] & workingHash[2]);
        const bigSigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const bigSigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const temp1 = (workingHash[7] + bigSigma1 + choose + constants[round] + schedule[round]) | 0;
        const temp2 = (bigSigma0 + majority) | 0;
        workingHash = [(temp1 + temp2) | 0, a, workingHash[1], workingHash[2], (workingHash[3] + temp1) | 0, e, workingHash[5], workingHash[6]];
      }
      workingHash = workingHash.map((item, index) => (item + previousHash[index]) | 0);
    }
    return workingHash.map((item) => (item >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function relayToken(room, accessKey) {
    const safeRoom = normalizeRoom(room);
    const safeKey = normalizeAccessKey(accessKey);
    if (!safeRoom || !validAccessKey(safeKey)) throw new Error('A valid room and access key are required.');
    return sha256Ascii(`picklepulse-relay-v1|${safeRoom}|${safeKey}`);
  }

  function relayEndpoint(room, href) {
    const source = href || (root.location && root.location.href) || 'http://localhost/';
    const url = new URL(source);
    return `${url.origin}/api/live/${normalizeRoom(room)}`;
  }

  function serializedSize(value) {
    try { return JSON.stringify(value).length; } catch (_error) { return Infinity; }
  }

  function adaptRemoteGame(game, sentAt, receivedAt) {
    if (!game || typeof game !== 'object' || Array.isArray(game)) throw new Error('Invalid live game payload.');
    if (serializedSize(game) > MAX_MESSAGE_CHARS) throw new Error('Live game payload is too large.');
    const clone = JSON.parse(JSON.stringify(game));
    const sent = Number(sentAt);
    const received = Number(receivedAt == null ? Date.now() : receivedAt);
    if (clone.timer && clone.timer.running && Number.isFinite(Number(clone.timer.startedAt)) && Number.isFinite(sent) && Number.isFinite(received)) {
      clone.timer.startedAt = Number(clone.timer.startedAt) + Math.max(-300000, Math.min(300000, received - sent));
    }
    return clone;
  }

  function makeError(message, type) {
    const error = new Error(message);
    error.type = type;
    return error;
  }

  class LiveController {
    constructor(options) {
      const safe = options || {};
      this.room = normalizeRoom(safe.room);
      this.accessKey = normalizeAccessKey(safe.accessKey);
      if (!this.room || !validAccessKey(this.accessKey)) throw new Error('A secure live room needs a room code and access key.');
      this.getState = safe.getState;
      this.onStatus = safe.onStatus || (() => {});
      this.fetchFn = safe.fetchFn || root.fetch;
      this.endpoint = safe.endpoint || relayEndpoint(this.room, safe.href);
      this.token = relayToken(this.room, this.accessKey);
      this.stopped = false;
      this.heartbeat = null;
      this.pending = false;
      this.queued = false;
      this.viewers = 0;
    }

    status(phase, detail) {
      this.onStatus({ phase, room: this.room, viewers: this.viewers, detail: detail || '' });
    }

    async start() {
      if (typeof this.fetchFn !== 'function') throw makeError('Local live server is unavailable.', 'relay-unavailable');
      this.stopped = false;
      this.status('starting', 'Local Wi-Fi');
      await this.sendState(true);
      this.heartbeat = setInterval(() => this.sendState(false), HEARTBEAT_INTERVAL_MS);
      this.status('live', 'Local Wi-Fi');
      return this;
    }

    async sendState(throwOnError) {
      if (this.stopped || this.pending) {
        if (this.pending) this.queued = true;
        return false;
      }
      const state = this.getState && this.getState();
      if (!state) return false;
      const packet = { type: 'state', game: state, sentAt: Date.now() };
      const body = JSON.stringify(packet);
      if (body.length > MAX_MESSAGE_CHARS) {
        const error = makeError('Live update was too large.', 'payload-too-large');
        this.status('error', error.message);
        if (throwOnError) throw error;
        return false;
      }
      this.pending = true;
      try {
        const response = await this.fetchFn(this.endpoint, {
          method: 'POST', cache: 'no-store', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-PicklePulse-Token': this.token }, body
        });
        if (response.status === 409) throw makeError('Room is already secured by another controller.', 'unavailable-id');
        if (!response.ok) throw makeError(`Local live server rejected the update (${response.status}).`, 'relay-error');
        const result = await response.json().catch(() => ({}));
        this.viewers = Math.max(0, Math.min(MAX_VIEWERS, Number(result.viewers) || 0));
        this.status('live', 'Local Wi-Fi');
        return true;
      } catch (error) {
        this.status('error', error.message || 'Local live server unavailable');
        if (throwOnError) throw error;
        return false;
      } finally {
        this.pending = false;
        if (this.queued && !this.stopped) {
          this.queued = false;
          queueMicrotask(() => this.sendState(false));
        }
      }
    }

    broadcast() { this.sendState(false); }

    stop() {
      this.stopped = true;
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (typeof this.fetchFn === 'function') {
        try {
          this.fetchFn(this.endpoint, {
            method: 'DELETE', cache: 'no-store', credentials: 'same-origin', keepalive: true,
            headers: { 'X-PicklePulse-Token': this.token }
          }).catch(() => {});
        } catch (_error) {}
      }
      this.status('off');
    }
  }

  class LiveViewer {
    constructor(options) {
      const safe = options || {};
      this.room = normalizeRoom(safe.room);
      this.accessKey = normalizeAccessKey(safe.accessKey);
      if (!this.room || !validAccessKey(this.accessKey)) throw new Error('This live link is missing its access key.');
      this.onState = safe.onState || (() => {});
      this.onStatus = safe.onStatus || (() => {});
      this.fetchFn = safe.fetchFn || root.fetch;
      this.endpoint = safe.endpoint || relayEndpoint(this.room, safe.href);
      this.token = relayToken(this.room, this.accessKey);
      this.viewerId = sha256Ascii(`${this.token}|${Date.now()}|${randomFraction()}`).slice(0, 24);
      this.stopped = false;
      this.retryCount = 0;
      this.retryTimer = null;
      this.etag = '';
    }

    status(phase, detail) { this.onStatus({ phase, room: this.room, detail: detail || '' }); }

    async start() {
      if (typeof this.fetchFn !== 'function') throw makeError('Local live server is unavailable.', 'relay-unavailable');
      this.stopped = false;
      this.status('connecting', 'Local Wi-Fi');
      await this.poll();
      return this;
    }

    schedule(delay = POLL_INTERVAL_MS) {
      clearTimeout(this.retryTimer);
      if (this.stopped) return;
      this.retryTimer = setTimeout(() => this.poll(), delay);
    }

    async poll() {
      if (this.stopped) return;
      try {
        const headers = { 'X-PicklePulse-Token': this.token, 'X-PicklePulse-Viewer': this.viewerId };
        if (this.etag) headers['If-None-Match'] = this.etag;
        const response = await this.fetchFn(this.endpoint, { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers });
        if (response.status === 304) {
          this.retryCount = 0;
          this.status('live', 'Local Wi-Fi');
          this.schedule();
          return;
        }
        if (response.status === 404) {
          this.status(this.retryCount ? 'reconnecting' : 'connecting', 'Waiting for controller');
          this.retryCount += 1;
          this.schedule(Math.min(3000, POLL_INTERVAL_MS * Math.max(1, this.retryCount)));
          return;
        }
        if (response.status === 403) {
          this.status('error', 'Access denied');
          this.stopped = true;
          return;
        }
        if (response.status === 429) {
          this.status('reconnecting', 'Display limit reached; retrying');
          this.retryCount += 1;
          this.schedule(3000);
          return;
        }
        if (!response.ok) throw makeError(`Local live server returned ${response.status}.`, 'relay-error');
        const text = await response.text();
        if (text.length > MAX_MESSAGE_CHARS) throw makeError('Live update was too large.', 'payload-too-large');
        const payload = JSON.parse(text);
        if (!payload || payload.type !== 'state' || !payload.game) throw makeError('Invalid live update.', 'invalid-payload');
        this.etag = response.headers && response.headers.get ? (response.headers.get('ETag') || '') : '';
        this.retryCount = 0;
        this.onState(payload.game, payload.sentAt || Date.now());
        this.status('live', 'Local Wi-Fi');
        this.schedule();
      } catch (error) {
        if (this.stopped) return;
        this.retryCount += 1;
        this.status('reconnecting', error.message || 'Local connection interrupted');
        this.schedule(Math.min(5000, 700 * (2 ** Math.min(this.retryCount, 3))));
      }
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.status('off');
    }
  }

  return {
    MIN_ACCESS_KEY_LENGTH,
    MAX_ACCESS_KEY_LENGTH,
    MAX_VIEWERS,
    MAX_MESSAGE_CHARS,
    generateRoomCode,
    generateAccessKey,
    normalizeRoom,
    normalizeAccessKey,
    validAccessKey,
    accessCode,
    parseAccess,
    displayUrl,
    relayToken,
    relayEndpoint,
    adaptRemoteGame,
    LiveController,
    LiveViewer
  };
});
