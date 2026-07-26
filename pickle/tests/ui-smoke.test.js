const test = require('node:test');
const assert = require('node:assert/strict');

class FakeElement {
  constructor() { this.innerHTML = ''; }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
}

global.HTMLElement = FakeElement;
global.customElements = {
  define(name, component) {
    if (name === 'pickleball-app') global.PickleballAppForTest = component;
  }
};
global.localStorage = {
  value: null,
  getItem() { return this.value; },
  setItem(_key, value) { this.value = value; }
};
global.navigator = { onLine: true };
global.location = { protocol: 'file:', search: '', href: 'file:///app/index.html' };
global.history = { state: null, replaceState(value) { this.state = value; }, pushState(value) { this.state = value; }, go() {}, back() {} };
global.document = {
  addEventListener() {}, removeEventListener() {},
  visibilityState: 'visible', fullscreenElement: null, webkitFullscreenElement: null,
  documentElement: {}
};
global.window = {
  addEventListener() {}, removeEventListener() {},
  setInterval() { return 1; }, clearInterval() {},
  setTimeout() { return 1; }, clearTimeout() {}
};
global.confirm = () => true;

require('../src/game-engine.js');
require('../src/player-data.js');
require('../src/app.js');

test('minimal setup view renders a fifteen-minute default', () => {
  const app = new global.PickleballAppForTest();
  app.connectedCallback();
  assert.match(app.innerHTML, /PicklePulse/);
  assert.match(app.innerHTML, /Add players first/);
  assert.match(app.innerHTML, /Watch a live game/);
  assert.match(app.innerHTML, /Paste the secure link/);
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' }
  ];
  app.render();
  assert.match(app.innerHTML, /value="15" selected/);
  assert.match(app.innerHTML, />Start</);
  assert.match(app.innerHTML, /<select name="teamAPlayer1"/);
});

test('scoreboard renders countdown and named server guidance', () => {
  const app = new global.PickleballAppForTest();
  app.state.currentGame = global.PickleEngine.createGame({
    format: 'doubles', target: 11, durationMinutes: 15,
    teamAName: 'Kitchen Kings', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben',
    teamBName: 'Dink Squad', teamBPlayer1: 'Cora', teamBPlayer2: 'Drew',
    startingTeam: 0, now: Date.now()
  });
  app.view = 'game';
  app.render();
  assert.match(app.innerHTML, /Kitchen Kings/);
  assert.match(app.innerHTML, /15:00/);
  assert.match(app.innerHTML, />Ava</);
  assert.match(app.innerHTML, /Right · 0 - 0 - 2/);
  assert.match(app.innerHTML, />Live</);
});

test('watch mode renders a fullscreen control', () => {
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  app.watchRoom = 'ABC234';
  app.remoteStatus = { phase: 'connecting', room: 'ABC234', detail: '' };
  app.render();
  assert.match(app.innerHTML, /data-action="toggle-fullscreen"/);
  assert.match(app.innerHTML, /Waiting for controller/);
});

test('fullscreen action requests browser fullscreen', async () => {
  let requested = 0;
  global.document.documentElement.requestFullscreen = async () => { requested += 1; };
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  await app.toggleFullscreen();
  assert.equal(requested, 1);
  delete global.document.documentElement.requestFullscreen;
});

test('a completed game is automatically added to history', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  const game = global.PickleEngine.createGame({
    format: 'singles', target: 11,
    teamAPlayer1: 'Ava', teamBPlayer1: 'Cora', startingTeam: 0
  });
  game.teams[0].score = 10;
  game.teams[1].score = 9;
  app.state.currentGame = game;
  const complete = global.PickleEngine.recordRally(game, 0, Date.now());
  app.setCurrentGame(complete);
  assert.equal(app.state.games.length, 1);
  assert.equal(app.state.games[0].status, 'complete');
});

test('score color panel renders presets and custom color inputs', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.showColors = true;
  app.render();
  assert.match(app.innerHTML, /Score colors/);
  assert.match(app.innerHTML, /data-color-key="teamA"/);
  assert.match(app.innerHTML, /data-color-key="teamB"/);
  assert.match(app.innerHTML, /data-preset="max"/);
  assert.match(app.innerHTML, /score-high-contrast/);
});

test('custom score colors persist and render on the controller', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.onChange({ target: { dataset: { colorKey: 'teamA' }, value: '#ff5500' } });
  app.onChange({ target: { dataset: { colorKey: 'teamB' }, value: '#00aaff' } });
  assert.equal(app.state.appearance.teamA, '#ff5500');
  assert.equal(app.state.appearance.teamB, '#00aaff');
  assert.match(app.innerHTML, /--team-a:#ff5500/);
  assert.match(app.innerHTML, /--team-b:#00aaff/);
  assert.match(global.localStorage.value, /#ff5500/);
});

test('watch mode applies colors received with the live game', () => {
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  app.watchRoom = 'ABC234';
  app.remoteGame = global.PickleEngine.createGame({ format: 'singles' });
  app.remoteGame.appearance = { teamA: '#ffcc00', teamB: '#00ddff', highContrast: true };
  app.remoteStatus = { phase: 'live', room: 'ABC234', detail: '' };
  app.render();
  assert.match(app.innerHTML, /--team-a:#ffcc00/);
  assert.match(app.innerHTML, /--team-b:#00ddff/);
  assert.match(app.innerHTML, /score-contrast/);
});


test('timer adjustment panel renders quick steps and exact fields', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.state.currentGame = global.PickleEngine.createGame({ durationMinutes: 15, now: Date.now() });
  app.view = 'game';
  app.showTimerAdjust = true;
  app.render();
  assert.match(app.innerHTML, /Adjust time/);
  assert.match(app.innerHTML, /data-ms="-60000"/);
  assert.match(app.innerHTML, /data-ms="60000"/);
  assert.match(app.innerHTML, /id="timer-adjust-form"/);
  assert.match(app.innerHTML, /name="minutes"/);
  assert.match(app.innerHTML, /name="seconds"/);
});

test('quick time adjustment persists and broadcasts to live viewers', async () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  const now = Date.now();
  app.state.currentGame = global.PickleEngine.createGame({ durationMinutes: 15, now });
  let broadcasts = 0;
  app.liveController = { broadcast() { broadcasts += 1; } };
  await app.onClick({
    target: {
      closest() { return { dataset: { action: 'adjust-time', ms: '60000' } }; }
    }
  });
  const remaining = global.PickleEngine.getRemainingMs(app.state.currentGame, now);
  assert.ok(remaining >= 16 * 60 * 1000 - 100 && remaining <= 16 * 60 * 1000);
  assert.equal(broadcasts, 1);
  assert.match(global.localStorage.value, /durationMs/);
});

test('active scoring requests the browser navigation warning', () => {
  const app = new global.PickleballAppForTest();
  app.state.currentGame = global.PickleEngine.createGame({ format: 'singles' });
  let prevented = false;
  const event = { preventDefault() { prevented = true; }, returnValue: undefined };
  const result = app.onBeforeUnload(event);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, '');
  assert.equal(result, '');
});

test('live display emphasizes the current serving player', () => {
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  app.watchRoom = 'RCBZLH';
  app.remoteGame = global.PickleEngine.createGame({
    format: 'doubles', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben',
    teamBPlayer1: 'Cora', teamBPlayer2: 'Drew'
  });
  app.remoteStatus = { phase: 'live', room: 'RCBZLH', detail: '' };
  app.render();
  assert.match(app.innerHTML, /Current serving/);
  assert.match(app.innerHTML, /<strong>Ava<\/strong>/);
  assert.match(app.innerHTML, /0 - 0 - 2 · Right side/);
});

test('queued positions prefill teams in 1-2 versus 3-4 order', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' }
  ];
  app.state.queue = global.PicklePlayers.normalizeQueue({
    waiting: ['p1', 'p2', 'p3', 'p4'],
    pending: ['p1', 'p2', 'p3', 'p4']
  }, app.state.players);
  assert.deepEqual(app.pendingSelections(), {
    teamAPlayer1: 'p1',
    teamAPlayer2: 'p2',
    teamBPlayer1: 'p3',
    teamBPlayer2: 'p4'
  });
  app.view = 'setup';
  app.render();
  assert.match(app.innerHTML, /name="teamAPlayer1"[\s\S]*?value="p1" selected/);
  assert.match(app.innerHTML, /name="teamAPlayer2"[\s\S]*?value="p2" selected/);
  assert.match(app.innerHTML, /name="teamBPlayer1"[\s\S]*?value="p3" selected/);
  assert.match(app.innerHTML, /name="teamBPlayer2"[\s\S]*?value="p4" selected/);
  app.view = 'players';
  app.render();
  assert.match(app.innerHTML, /1 = A P1, 2 = A P2, 3 = B P1, 4 = B P2/);
});

test('watch mode loads the live module only when requested', async () => {
  const originalCreateElement = global.document.createElement;
  const originalHead = global.document.head;
  let requestedScript = '';

  class MockViewer {
    constructor(options) { this.options = options; }
    async start() { return this; }
    stop() {}
  }

  global.document.createElement = () => ({
    src: '', async: false, onload: null, onerror: null
  });
  global.document.head = {
    appendChild(script) {
      requestedScript = script.src;
      global.PickleLive = {
        LiveViewer: MockViewer,
        adaptRemoteGame(game) { return game; }
      };
      script.onload();
    }
  };

  const app = new global.PickleballAppForTest();
  app.watchRoom = 'ABC234';
  app.watchAccessKey = '23456789ABCDEFGHJKMN';
  await app.startViewer();
  assert.equal(requestedScript, 'src/live-sync.js?v=8');
  assert.ok(app.viewer instanceof MockViewer);

  global.document.createElement = originalCreateElement;
  global.document.head = originalHead;
  delete global.PickleLive;
});

test('hostile remote values are normalized and escaped before rendering', () => {
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  app.watchRoom = 'ABC234';
  app.remoteGame = global.PickleEngine.normalizeGame({
    format: '<script>alert(1)</script>',
    target: '<img src=x onerror=alert(1)>',
    teams: [
      { name: '<img src=x onerror=alert(1)>', players: ['<b>Ava</b>'], score: '<svg onload=alert(1)>' },
      { name: 'Safe Team', players: ['Drew'], score: 5 }
    ]
  });
  app.remoteStatus = { phase: 'live', room: 'ABC234', detail: '' };
  app.render();
  assert.doesNotMatch(app.innerHTML, /<script|<img src=x|<svg onload/i);
  assert.match(app.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(app.innerHTML, /first to 11/);
});

test('viewer captures the live key in session storage and removes it from the address bar', () => {
  const originalLocation = global.location;
  const originalHistory = global.history;
  const originalSessionStorage = global.sessionStorage;
  const values = new Map();
  let replacedUrl = '';
  global.location = {
    protocol: 'http:',
    search: '?watch=ABC234',
    hash: '#key=23456789ABCDEFGHJKMN',
    href: 'http://192.168.1.25:4173/?watch=ABC234#key=23456789ABCDEFGHJKMN'
  };
  global.sessionStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  global.history = {
    state: null,
    replaceState(value, _title, url) { this.state = value; replacedUrl = url || ''; },
    pushState(value) { this.state = value; },
    go() {}, back() {}
  };

  const app = new global.PickleballAppForTest();
  assert.equal(app.watchRoom, 'ABC234');
  assert.equal(app.watchAccessKey, '23456789ABCDEFGHJKMN');
  assert.match(values.get('picklepulse-live-secret-v1'), /23456789ABCDEFGHJKMN/);
  assert.equal(replacedUrl, 'http://192.168.1.25:4173/?watch=ABC234');

  global.location = originalLocation;
  global.history = originalHistory;
  if (originalSessionStorage === undefined) delete global.sessionStorage;
  else global.sessionStorage = originalSessionStorage;
});
