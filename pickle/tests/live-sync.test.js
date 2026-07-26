const test = require('node:test');
const assert = require('node:assert/strict');
const Live = require('../src/live-sync.js');

const ACCESS_KEY = '23456789ABCDEFGHJKMN';

function response(status, payload = null, headers = {}) {
  const textValue = payload == null ? '' : JSON.stringify(payload);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) { return headers[name] || headers[name.toLowerCase()] || null; }
    },
    async json() { return payload; },
    async text() { return textValue; }
  };
}

function createRelay() {
  let room = null;
  let version = 0;
  const viewers = new Set();
  return {
    async fetch(_url, options = {}) {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      const token = headers['X-PicklePulse-Token'];
      if (method === 'POST') {
        if (room && room.token !== token) return response(409, { error: 'room-conflict' });
        room = { token, packet: JSON.parse(options.body) };
        version += 1;
        return response(200, { ok: true, version, viewers: viewers.size });
      }
      if (method === 'GET') {
        if (!room) return response(404, { error: 'room-not-found' });
        if (room.token !== token) return response(403, { error: 'access-denied' });
        viewers.add(headers['X-PicklePulse-Viewer']);
        const etag = `"${version}"`;
        if (headers['If-None-Match'] === etag) return response(304, null, { ETag: etag });
        return response(200, room.packet, { ETag: etag });
      }
      if (method === 'DELETE') {
        if (room && room.token !== token) return response(403, { error: 'access-denied' });
        room = null;
        return response(200, { ok: true });
      }
      return response(405, { error: 'method' });
    }
  };
}

test('room codes omit ambiguous characters', () => {
  const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  let index = 0;
  const code = Live.generateRoomCode(6, () => values[index++]);
  assert.equal(code.length, 6);
  assert.match(code, /^[2-9A-HJ-NP-Z]+$/);
});

test('access keys are long and URL-safe', () => {
  const key = Live.generateAccessKey(20, () => 0.42);
  assert.equal(key.length, 20);
  assert.equal(Live.validAccessKey(key), true);
  assert.match(key, /^[2-9A-HJ-NP-Za-km-z]+$/);
});

test('room normalization is URL-safe and uppercase', () => {
  assert.equal(Live.normalizeRoom(' ab-c10z 29 '), 'ABCZ29');
});

test('relay token is deterministic and does not reveal the key', () => {
  const token = Live.relayToken('AB23XZ', ACCESS_KEY);
  assert.equal(token, Live.relayToken('ab23xz', ACCESS_KEY));
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(token, new RegExp(ACCESS_KEY));
});

test('display link keeps the access key in the fragment and parses compact codes', () => {
  const result = Live.displayUrl('AB23XZ', ACCESS_KEY, 'https://name.example/pickle/?old=1#test');
  assert.equal(result, `https://name.example/pickle/?watch=AB23XZ#key=${ACCESS_KEY}`);
  assert.deepEqual(Live.parseAccess(result), { room: 'AB23XZ', accessKey: ACCESS_KEY, valid: true });
  assert.deepEqual(Live.parseAccess(`AB23XZ.${ACCESS_KEY}`), { room: 'AB23XZ', accessKey: ACCESS_KEY, valid: true });
});

test('controller publishes state to an authenticated read-only viewer', async () => {
  const relay = createRelay();
  let score = 0;
  let received = null;
  let controllerStatus = null;
  const controller = new Live.LiveController({
    room: 'K7M4Q2', accessKey: ACCESS_KEY, fetchFn: relay.fetch,
    getState: () => ({ score }),
    onStatus: (status) => { controllerStatus = status; }
  });
  await controller.start();

  const viewer = new Live.LiveViewer({
    room: 'K7M4Q2', accessKey: ACCESS_KEY, fetchFn: relay.fetch,
    onState: (state) => { received = state; }
  });
  await viewer.start();
  assert.deepEqual(received, { score: 0 });

  score = 4;
  await controller.sendState(true);
  await viewer.poll();
  assert.deepEqual(received, { score: 4 });
  assert.equal(controllerStatus.phase, 'live');

  viewer.stop();
  controller.stop();
});

test('viewer with the wrong access key cannot read a room', async () => {
  const relay = createRelay();
  const controller = new Live.LiveController({
    room: 'K7M4Q2', accessKey: ACCESS_KEY, fetchFn: relay.fetch,
    getState: () => ({ score: 2 })
  });
  await controller.start();
  let status = null;
  const viewer = new Live.LiveViewer({
    room: 'K7M4Q2', accessKey: 'ZZZZZZZZZZZZZZZZZZZZ', fetchFn: relay.fetch,
    onStatus: (value) => { status = value; }
  });
  await viewer.start();
  assert.equal(viewer.stopped, true);
  assert.equal(status.phase, 'error');
  assert.equal(status.detail, 'Access denied');
  controller.stop();
});

test('remote timer is shifted to the viewer clock and oversized data is rejected', () => {
  const game = { timer: { running: true, startedAt: 1000, elapsedMs: 0 } };
  const adapted = Live.adaptRemoteGame(game, 5000, 9000);
  assert.equal(adapted.timer.startedAt, 5000);
  assert.equal(game.timer.startedAt, 1000);
  assert.throws(() => Live.adaptRemoteGame({ payload: 'x'.repeat(Live.MAX_MESSAGE_CHARS + 1) }), /too large/i);
});
