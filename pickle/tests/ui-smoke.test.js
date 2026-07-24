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
global.document = { addEventListener() {}, visibilityState: 'visible' };
global.window = {
  addEventListener() {}, removeEventListener() {},
  setInterval() { return 1; }, clearInterval() {},
  setTimeout() { return 1; }, clearTimeout() {}
};
global.confirm = () => true;

require('../src/game-engine.js');
require('../src/live-sync.js');
require('../src/app.js');

test('minimal setup view renders', () => {
  const app = new global.PickleballAppForTest();
  app.connectedCallback();
  assert.match(app.innerHTML, /PicklePulse/);
  assert.match(app.innerHTML, /Player 1/);
  assert.match(app.innerHTML, />Start</);
});

test('scoreboard renders an active game and live action', () => {
  const app = new global.PickleballAppForTest();
  app.state.currentGame = global.PickleEngine.createGame({
    format: 'doubles', target: 11,
    teamAName: 'Kitchen Kings', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben',
    teamBName: 'Dink Squad', teamBPlayer1: 'Cora', teamBPlayer2: 'Drew',
    startingTeam: 0
  });
  app.view = 'game';
  app.render();
  assert.match(app.innerHTML, /Kitchen Kings/);
  assert.match(app.innerHTML, /0 - 0 - 2/);
  assert.match(app.innerHTML, />Live</);
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
