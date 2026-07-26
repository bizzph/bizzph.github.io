const test = require('node:test');
const assert = require('node:assert/strict');
const Live = require('../src/live-sync.js');

test('room codes omit ambiguous characters', () => {
  const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  let index = 0;
  const code = Live.generateRoomCode(6, () => values[index++]);
  assert.equal(code.length, 6);
  assert.match(code, /^[2-9A-HJ-NP-Z]+$/);
});

test('room normalization is URL-safe and uppercase', () => {
  assert.equal(Live.normalizeRoom(' ab-c10z 29 '), 'ABCZ29');
});

test('controller id is deterministic', () => {
  assert.equal(Live.controllerPeerId('AB23XZ'), 'picklepulse-ab23xz');
});

test('display link replaces old query and hash', () => {
  const result = Live.displayUrl('AB23XZ', 'https://name.github.io/pickle/?old=1#test');
  assert.equal(result, 'https://name.github.io/pickle/?watch=AB23XZ');
});

const { EventEmitter } = require('node:events');

class FakeConnection extends EventEmitter {
  constructor() {
    super();
    this.open = false;
    this.other = null;
  }
  send(payload) {
    if (!this.open || !this.other) throw new Error('closed');
    queueMicrotask(() => this.other.emit('data', payload));
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    if (this.other && this.other.open) {
      this.other.open = false;
      this.other.emit('close');
    }
  }
}

class FakePeer extends EventEmitter {
  static peers = new Map();
  static next = 1;
  constructor(id) {
    super();
    this.id = id || `viewer-${FakePeer.next++}`;
    this.open = false;
    this.destroyed = false;
    if (FakePeer.peers.has(this.id)) {
      queueMicrotask(() => this.emit('error', { type: 'unavailable-id' }));
      return;
    }
    FakePeer.peers.set(this.id, this);
    queueMicrotask(() => {
      this.open = true;
      this.emit('open', this.id);
    });
  }
  connect(targetId) {
    const target = FakePeer.peers.get(targetId);
    const local = new FakeConnection();
    const remote = new FakeConnection();
    local.other = remote;
    remote.other = local;
    queueMicrotask(() => {
      if (!target) {
        local.emit('error', { type: 'peer-unavailable' });
        local.emit('close');
        return;
      }
      target.emit('connection', remote);
      local.open = true;
      remote.open = true;
      remote.emit('open');
      local.emit('open');
    });
    return local;
  }
  reconnect() {}
  destroy() {
    this.destroyed = true;
    this.open = false;
    FakePeer.peers.delete(this.id);
    this.emit('close');
  }
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('controller broadcasts state to a read-only viewer', async () => {
  FakePeer.peers.clear();
  let score = 0;
  let received = null;
  let controllerStatus = null;
  const controller = new Live.LiveController({
    room: 'K7M4Q2',
    PeerCtor: FakePeer,
    getState: () => ({ score }),
    onStatus: (status) => { controllerStatus = status; }
  });
  await controller.start();

  const viewer = new Live.LiveViewer({
    room: 'K7M4Q2',
    PeerCtor: FakePeer,
    onState: (state) => { received = state; }
  });
  await viewer.start();
  await tick();
  await tick();
  assert.deepEqual(received, { score: 0 });
  assert.equal(controllerStatus.viewers, 1);

  score = 4;
  controller.broadcast();
  await tick();
  assert.deepEqual(received, { score: 4 });

  viewer.stop();
  controller.stop();
});

test('remote timer is shifted to the viewer clock', () => {
  const game = { timer: { running: true, startedAt: 1000, elapsedMs: 0 } };
  const adapted = Live.adaptRemoteGame(game, 5000, 9000);
  assert.equal(adapted.timer.startedAt, 5000);
  assert.equal(game.timer.startedAt, 1000);
});
