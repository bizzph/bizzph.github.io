const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../src/game-engine.js');

function game(overrides = {}) {
  return Engine.createGame({
    format: 'doubles',
    target: 11,
    durationMinutes: 15,
    teamAName: 'Kitchen Kings',
    teamAPlayer1: 'Ava',
    teamAPlayer2: 'Ben',
    teamBName: 'Dink Squad',
    teamBPlayer1: 'Cora',
    teamBPlayer2: 'Drew',
    startingTeam: 0,
    now: 1000,
    ...overrides
  });
}

test('doubles starts at second server with player one on the right', () => {
  const g = game();
  assert.equal(g.serverNumber, 2);
  assert.equal(g.servingPlayer, 0);
  assert.equal(Engine.spokenScore(g), '0 - 0 - 2');
  assert.deepEqual(Engine.serviceDetails(g), {
    teamIndex: 0, playerIndex: 0, playerName: 'Ava', side: 'Right', serverNumber: 2
  });
});

test('countdown defaults to fifteen minutes', () => {
  const g = game();
  assert.equal(g.timer.durationMs, 15 * 60 * 1000);
  assert.equal(Engine.getRemainingMs(g, 1000), 15 * 60 * 1000);
  assert.equal(Engine.getRemainingMs(g, 61000), 14 * 60 * 1000);
});

test('countdown pauses, resumes, resets, and expires at zero', () => {
  let g = Engine.pauseTimer(game(), 61000);
  assert.equal(Engine.getRemainingMs(g, 120000), 14 * 60 * 1000);
  g = Engine.startTimer(g, 120000);
  assert.equal(Engine.getRemainingMs(g, 180000), 13 * 60 * 1000);
  g = Engine.resetTimer(g, 180000);
  assert.equal(Engine.getRemainingMs(g, 180000), 15 * 60 * 1000);
  g = Engine.expireTimer(g, 1080000);
  assert.equal(Engine.getRemainingMs(g, 1080000), 0);
  assert.equal(g.timer.running, false);
});

test('serving player stays the same and moves sides after scoring', () => {
  const g = Engine.recordRally(game(), 0, 2000);
  assert.equal(g.teams[0].score, 1);
  assert.equal(g.servingTeam, 0);
  assert.deepEqual(Engine.serviceDetails(g), {
    teamIndex: 0, playerIndex: 0, playerName: 'Ava', side: 'Left', serverNumber: 2
  });
});

test('opening side-out selects the receiving right-side player as server one', () => {
  const g = Engine.recordRally(game(), 1, 2000);
  assert.equal(g.servingTeam, 1);
  assert.equal(g.serverNumber, 1);
  assert.deepEqual(Engine.serviceDetails(g), {
    teamIndex: 1, playerIndex: 0, playerName: 'Cora', side: 'Right', serverNumber: 1
  });
});

test('first server loss advances to the partner on their current side', () => {
  let g = Engine.recordRally(game(), 1, 2000); // B gets serve, Cora server 1
  g = Engine.recordRally(g, 1, 3000); // Cora scores and moves left
  g = Engine.recordRally(g, 0, 4000); // Cora loses rally; Drew is server 2 on right
  assert.equal(g.servingTeam, 1);
  assert.equal(g.serverNumber, 2);
  assert.deepEqual(Engine.serviceDetails(g), {
    teamIndex: 1, playerIndex: 1, playerName: 'Drew', side: 'Right', serverNumber: 2
  });
});

test('side-out at an odd score selects the player currently on the right', () => {
  let g = Engine.recordRally(game(), 0, 2000); // A 1, Ava left
  g = Engine.recordRally(g, 1, 3000); // side out to B
  g = Engine.recordRally(g, 0, 4000); // B server 1 loses -> server 2
  g = Engine.recordRally(g, 0, 5000); // B server 2 loses -> side out to A
  assert.equal(g.servingTeam, 0);
  assert.equal(g.serverNumber, 1);
  assert.deepEqual(Engine.serviceDetails(g), {
    teamIndex: 0, playerIndex: 1, playerName: 'Ben', side: 'Right', serverNumber: 1
  });
});

test('next service after a fault is calculated automatically', () => {
  let g = Engine.recordRally(game(), 1, 2000); // Cora server 1
  assert.deepEqual(Engine.nextServiceAfterFault(g), {
    teamIndex: 1, playerIndex: 1, playerName: 'Drew', side: 'Left', serverNumber: 2
  });
  g = Engine.recordRally(g, 0, 3000); // Drew server 2
  assert.deepEqual(Engine.nextServiceAfterFault(g), {
    teamIndex: 0, playerIndex: 0, playerName: 'Ava', side: 'Right', serverNumber: 1
  });
});

test('game must be won by two', () => {
  let g = game();
  g.teams[0].score = 10;
  g.teams[1].score = 10;
  g = Engine.recordRally(g, 0, 2000);
  assert.equal(g.status, 'active');
  g = Engine.recordRally(g, 0, 3000);
  assert.equal(g.status, 'complete');
  assert.equal(g.teams[0].score, 12);
});

test('undo restores score, server number, player, and court side', () => {
  const before = game();
  const after = Engine.recordRally(before, 1, 2000);
  const undone = Engine.undoLastRally(after, 3000);
  assert.equal(undone.servingTeam, before.servingTeam);
  assert.equal(undone.serverNumber, before.serverNumber);
  assert.equal(undone.servingPlayer, before.servingPlayer);
  assert.deepEqual(undone.teams.map((team) => team.score), [0, 0]);
  assert.equal(Engine.serviceDetails(undone).side, 'Right');
});

test('singles changes server immediately and serves from score-based side', () => {
  let g = Engine.recordRally(game({ format: 'singles' }), 1, 2000);
  assert.equal(g.servingTeam, 1);
  assert.equal(g.serverNumber, 1);
  assert.equal(Engine.serviceDetails(g).playerName, 'Cora');
  assert.equal(Engine.serviceDetails(g).side, 'Right');
  g = Engine.recordRally(g, 1, 3000);
  assert.equal(Engine.serviceDetails(g).side, 'Left');
});

test('legacy games gain countdown and serving-player data', () => {
  const legacy = game();
  delete legacy.servingPlayer;
  delete legacy.timer.durationMs;
  const migrated = Engine.normalizeGame(legacy);
  assert.equal(migrated.timer.durationMs, Engine.DEFAULT_TIMER_MS);
  assert.equal(migrated.servingPlayer, 0);
  assert.equal(migrated.schemaVersion, 2);
});
