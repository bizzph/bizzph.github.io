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
require('../src/live-sync.js');
require('../src/app.js');

test('minimal setup view renders a fifteen-minute default', () => {
  const app = new global.PickleballAppForTest();
  app.connectedCallback();
  assert.match(app.innerHTML, /PicklePulse/);
  assert.match(app.innerHTML, /P1 · Right/);
  assert.match(app.innerHTML, /value="15" selected/);
  assert.match(app.innerHTML, />Start</);
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
