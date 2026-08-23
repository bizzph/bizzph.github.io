const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.match(app.innerHTML, /<h1>Players<\/h1>/);
  assert.match(app.innerHTML, /id="join-room-form"/);
  assert.match(app.innerHTML, /placeholder="ROOM CODE"/);
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' }
  ];
  app.render();
  assert.match(app.innerHTML, /value="15" selected/);
  assert.match(app.innerHTML, />Start</);
  assert.match(app.innerHTML, /<select name="teamAPlayer1"/);
});

test('compact interface removes verbose queue and scoring helper messages', () => {
  const app = new global.PickleballAppForTest();
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' }
  ];
  app.view = 'players';
  app.render();
  assert.doesNotMatch(app.innerHTML, /Team mapping:/);
  assert.doesNotMatch(app.innerHTML, /After the game, all four/);
  assert.match(app.innerHTML, /aria-label="Add all players to queue"/);
  assert.match(app.innerHTML, /aria-label="Prepare next four players"/);
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
  assert.match(app.innerHTML, /data-action="share"/);
  assert.doesNotMatch(app.innerHTML, /Scoring protected/);
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
  assert.match(app.innerHTML, /1 Ava \+ 2 Ben vs 3 Cora \+ 4 Drew/);
  assert.doesNotMatch(app.innerHTML, /Team mapping:/);
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
  await app.startViewer();
  assert.equal(requestedScript, 'src/live-sync.js');
  assert.ok(app.viewer instanceof MockViewer);

  global.document.createElement = originalCreateElement;
  global.document.head = originalHead;
  delete global.PickleLive;
});

test('queue renders add-all and touch-friendly drag controls', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' }
  ];
  app.state.queue = global.PicklePlayers.normalizeQueue({ waiting: ['p1', 'p2'] }, app.state.players);
  app.view = 'players';
  app.render();
  assert.match(app.innerHTML, /data-action="queue-add-all"/);
  assert.match(app.innerHTML, /data-queue-drag/);
  assert.match(app.innerHTML, /draggable="true"/);
  assert.match(app.innerHTML, /title="Drag to reorder"/);
});

test('add-all action queues every available player', async () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' }
  ];
  app.state.queue = global.PicklePlayers.normalizeQueue({ waiting: ['p2'] }, app.state.players);
  await app.onClick({ target: { closest() { return { dataset: { action: 'queue-add-all' } }; } } });
  assert.deepEqual(app.state.queue.waiting, ['p2', 'p1', 'p3', 'p4']);
});

test('manual end asks for confirmation before completing the game', async () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.state.currentGame = global.PickleEngine.createGame({ format: 'singles' });
  const originalConfirm = global.confirm;
  let prompts = 0;
  global.confirm = () => { prompts += 1; return false; };
  await app.onClick({ target: { closest() { return { dataset: { action: 'end' } }; } } });
  assert.equal(prompts, 1);
  assert.equal(app.state.currentGame.status, 'active');
  global.confirm = () => true;
  await app.onClick({ target: { closest() { return { dataset: { action: 'end' } }; } } });
  assert.equal(app.state.currentGame.status, 'complete');
  global.confirm = originalConfirm;
});


test('final live display shows a floating bottom next-four queue panel', () => {
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  app.watchRoom = 'RCBZLH';
  app.remoteGame = global.PickleEngine.createGame({
    format: 'doubles', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben',
    teamBPlayer1: 'Cora', teamBPlayer2: 'Drew'
  });
  app.remoteGame.status = 'complete';
  app.remoteGame.teams[0].score = 11;
  app.remoteGame.teams[1].score = 8;
  app.remoteGame.nextQueue = ['Eli', 'Faye', '<Gus>', 'Hope', 'Ignored'];
  app.remoteStatus = { phase: 'live', room: 'RCBZLH', detail: '' };
  app.render();
  assert.match(app.innerHTML, /class="remote-scoreboard has-next-queue"/);
  assert.match(app.innerHTML, /class="remote-next-queue"/);
  assert.match(app.innerHTML, /Next 4/);
  assert.match(app.innerHTML, /Eli/);
  assert.match(app.innerHTML, /Faye/);
  assert.match(app.innerHTML, /&lt;Gus&gt;/);
  assert.match(app.innerHTML, /Hope/);
  assert.doesNotMatch(app.innerHTML, /Ignored/);
});



test('final next-four panel is fixed at the bottom with readable names', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(styles, /\.remote-next-queue\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(styles, /\.remote-next-queue\s*\{[\s\S]*?bottom:\s*max\(18px, env\(safe-area-inset-bottom\)\);/);
  assert.match(styles, /\.remote-next-queue li > b\s*\{[\s\S]*?font-size:\s*clamp\(1rem, 2vw, 1\.45rem\);/);
});

test('active live display does not show the next-four queue panel', () => {
  const app = new global.PickleballAppForTest();
  app.mode = 'display';
  app.watchRoom = 'RCBZLH';
  app.remoteGame = global.PickleEngine.createGame({ format: 'singles' });
  app.remoteGame.nextQueue = ['Eli', 'Faye', 'Gus', 'Hope'];
  app.remoteStatus = { phase: 'live', room: 'RCBZLH', detail: '' };
  app.render();
  assert.doesNotMatch(app.innerHTML, /remote-next-queue/);
  assert.doesNotMatch(app.innerHTML, /has-next-queue/);
});

test('final live snapshot uses the first four waiting players after requeue', () => {
  global.localStorage.value = null;
  const app = new global.PickleballAppForTest();
  app.state.players = [
    { id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cora' }, { id: 'p4', name: 'Drew' },
    { id: 'p5', name: 'Eli' }, { id: 'p6', name: 'Faye' },
    { id: 'p7', name: 'Gus' }, { id: 'p8', name: 'Hope' }
  ];
  const game = global.PickleEngine.createGame({
    format: 'doubles', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben',
    teamBPlayer1: 'Cora', teamBPlayer2: 'Drew'
  });
  app.state.currentGame = game;
  app.state.queue = global.PicklePlayers.normalizeQueue({
    waiting: ['p5', 'p6', 'p7', 'p8'],
    onCourt: ['p1', 'p2', 'p3', 'p4'],
    activeGameId: game.id
  }, app.state.players);
  let sent = null;
  app.liveController = { broadcast() { sent = app.liveSnapshot(); } };
  const finalGame = global.PickleEngine.endGame(game, Date.now());
  app.setCurrentGame(finalGame);
  assert.deepEqual(sent.nextQueue, ['Eli', 'Faye', 'Gus', 'Hope']);
  assert.deepEqual(app.state.queue.waiting.slice(-4), ['p1', 'p2', 'p3', 'p4']);
});

test('player name draft survives UI rerenders while typing', () => {
  const app = new global.PickleballAppForTest();
  app.view = 'players';
  app.onInput({ target: { name: 'playerName', value: 'Alex Johnson' } });
  app.render();
  assert.match(app.innerHTML, /name="playerName"[^>]*value="Alex Johnson"/);
  app.network = { level: 'weak', label: 'Weak' };
  app.render();
  assert.match(app.innerHTML, /name="playerName"[^>]*value="Alex Johnson"/);
});

test('audio settings default to system voice and rank four clear English alternatives', () => {
  const priorSynth = global.speechSynthesis;
  global.speechSynthesis = {
    getVoices() {
      return [
        { voiceURI: 'aria', name: 'Microsoft Aria Online (Natural)', lang: 'en-US' },
        { voiceURI: 'google-us', name: 'Google US English', lang: 'en-US' },
        { voiceURI: 'samantha', name: 'Samantha', lang: 'en-US', localService: true },
        { voiceURI: 'daniel', name: 'Daniel', lang: 'en-GB', localService: true },
        { voiceURI: 'generic', name: 'English Generic', lang: 'en-AU', localService: true },
        { voiceURI: 'novelty', name: 'Whisper', lang: 'en-US', localService: true },
        { voiceURI: 'fr-1', name: 'French One', lang: 'fr-FR', localService: true }
      ];
    }
  };
  try {
    const app = new global.PickleballAppForTest();
    app.refreshVoices(false);
    assert.equal(app.availableVoices.length, 4);
    assert.ok(app.availableVoices.every((voice) => /^en[-_]/i.test(voice.lang)));
    assert.equal(app.availableVoices[0].voiceURI, 'aria');
    assert.ok(app.availableVoices.some((voice) => voice.voiceURI === 'google-us'));
    assert.ok(app.availableVoices.some((voice) => voice.voiceURI === 'samantha'));
    assert.ok(app.availableVoices.some((voice) => voice.voiceURI === 'daniel'));
    assert.ok(!app.availableVoices.some((voice) => voice.voiceURI === 'novelty'));
    assert.equal(app.selectedVoice(false), null);
    app.showAudio = true;
    app.render();
    assert.match(app.innerHTML, /id="voice-select"/);
    assert.match(app.innerHTML, /System default \(recommended\)/);
    assert.match(app.innerHTML, /value="" selected/);
    assert.match(app.innerHTML, /Microsoft Aria Online \(Natural\)/);
    assert.doesNotMatch(app.innerHTML, /French One/);
    assert.doesNotMatch(app.innerHTML, /Whisper/);
    assert.match(app.innerHTML, /System default \+ up to 4 best clear English voices on this device/);
    assert.match(app.innerHTML, /Sunny Rally/);
    assert.match(app.innerHTML, /Kitchen Bounce/);
    assert.match(app.innerHTML, /Baseline Drive/);
    assert.match(app.innerHTML, /Pauses automatically for voice-over/);
  } finally {
    global.speechSynthesis = priorSynth;
  }
});

test('scoreboard side swap changes visual order without mutating team data', async () => {
  const app = new global.PickleballAppForTest();
  app.state.currentGame = global.PickleEngine.createGame({
    format: 'singles', teamAPlayer1: 'Ava', teamBPlayer1: 'Ben'
  });
  app.view = 'game';
  const beforeTeams = JSON.stringify(app.state.currentGame.teams);
  await app.onClick({ target: { closest() { return { dataset: { action: 'swap-scoreboard' } }; } } });
  const scoreGrid = app.innerHTML.match(/<div class="score-grid"[\s\S]*?<\/div>\s*<nav class="game-toolbar"/)[0];
  const benIndex = scoreGrid.indexOf('Ben');
  const avaIndex = scoreGrid.indexOf('Ava');
  assert.ok(benIndex >= 0 && avaIndex >= 0 && benIndex < avaIndex);
  assert.equal(JSON.stringify(app.state.currentGame.teams), beforeTeams);
  assert.equal(app.state.settings.scoreboardSwapped, true);
});

test('voice announces match point only when the serving team can win next rally', () => {
  const spoken = [];
  const priorSynth = global.speechSynthesis;
  const priorUtterance = global.SpeechSynthesisUtterance;
  global.speechSynthesis = {
    speaking: false,
    cancel() {},
    speak(utterance) { spoken.push(utterance.text); },
    getVoices() { return []; }
  };
  global.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
  };
  try {
    const app = new global.PickleballAppForTest();
    app.state.settings.voiceEnabled = true;
    let game = global.PickleEngine.createGame({ format: 'singles', target: 11, teamAPlayer1: 'Ava', teamBPlayer1: 'Ben', startingTeam: 0 });
    game.teams[0].score = 9;
    game.teams[1].score = 8;
    app.state.currentGame = game;
    const atTen = global.PickleEngine.recordRally(game, 0, Date.now());
    app.setCurrentGame(atTen);
    assert.match(spoken.at(-1), /Match point\./);

    const tied = global.PickleEngine.normalizeGame(atTen);
    tied.teams[1].score = 10;
    app.announceGame(tied, true, false, atTen);
    assert.doesNotMatch(spoken.at(-1), /Match point\./);
  } finally {
    global.speechSynthesis = priorSynth;
    global.SpeechSynthesisUtterance = priorUtterance;
  }
});

test('voice says side out only when service transfers to the other team', () => {
  const spoken = [];
  const priorSynth = global.speechSynthesis;
  const priorUtterance = global.SpeechSynthesisUtterance;
  global.speechSynthesis = {
    speaking: false,
    cancel() {},
    speak(utterance) { spoken.push(utterance.text); },
    getVoices() { return []; }
  };
  global.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
  };
  try {
    const app = new global.PickleballAppForTest();
    app.state.settings.voiceEnabled = true;
    const opening = global.PickleEngine.createGame({
      format: 'doubles', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben', teamBPlayer1: 'Cora', teamBPlayer2: 'Drew', startingTeam: 0
    });
    app.state.currentGame = opening;
    const sideOut = global.PickleEngine.recordRally(opening, 1, Date.now());
    app.setCurrentGame(sideOut);
    assert.match(spoken.at(-1), /^Side out\./);

    let teamB = global.PickleEngine.recordRally(sideOut, 0, Date.now());
    app.state.currentGame = sideOut;
    app.setCurrentGame(teamB);
    assert.match(spoken.at(-1), /^Second server\./);
    assert.doesNotMatch(spoken.at(-1), /^Side out\./);
  } finally {
    global.speechSynthesis = priorSynth;
    global.SpeechSynthesisUtterance = priorUtterance;
  }
});

test('voice announcements insert a half-second pause between rule call, score, and server position', () => {
  const spoken = [];
  const timers = [];
  const priorSynth = global.speechSynthesis;
  const priorUtterance = global.SpeechSynthesisUtterance;
  const priorSetTimeout = global.window.setTimeout;
  const priorClearTimeout = global.window.clearTimeout;
  global.window.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  global.window.clearTimeout = () => {};
  global.speechSynthesis = {
    speaking: false,
    cancel() {},
    speak(utterance) { spoken.push(utterance); },
    getVoices() { return [{ voiceURI: 'en-1', name: 'English One', lang: 'en-US' }]; }
  };
  global.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; }
  };
  try {
    const app = new global.PickleballAppForTest();
    app.refreshVoices(false);
    app.state.settings.voiceEnabled = true;
    const opening = global.PickleEngine.createGame({
      format: 'doubles', teamAPlayer1: 'Ava', teamAPlayer2: 'Ben', teamBPlayer1: 'Cora', teamBPlayer2: 'Drew', startingTeam: 0
    });
    const sideOut = global.PickleEngine.recordRally(opening, 1, Date.now());
    const secondServer = global.PickleEngine.recordRally(sideOut, 0, Date.now());
    app.state.currentGame = sideOut;
    app.announceGame(secondServer, true, false, sideOut);

    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].text, 'Second server.');
    assert.equal(spoken[0].lang, 'en-US');
    spoken[0].onend();
    assert.equal(timers[0].delay, 500);
    timers[0].callback();

    assert.equal(spoken[1].text, '0, 0, 2.');
    spoken[1].onend();
    assert.equal(timers[1].delay, 500);
    timers[1].callback();

    assert.equal(spoken[2].text, 'Drew on the left side.');
  } finally {
    global.speechSynthesis = priorSynth;
    global.SpeechSynthesisUtterance = priorUtterance;
    global.window.setTimeout = priorSetTimeout;
    global.window.clearTimeout = priorClearTimeout;
  }
});

