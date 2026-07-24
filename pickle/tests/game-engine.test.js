const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../src/game-engine.js');

function game(overrides = {}) {
  return Engine.createGame({
    format: 'doubles',
    target: 11,
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

test('doubles starts at second server', () => {
  const g = game();
  assert.equal(g.serverNumber, 2);
  assert.equal(Engine.spokenScore(g), '0 - 0 - 2');
});

test('serving team scores a point', () => {
  const g = Engine.recordRally(game(), 0, 2000);
  assert.equal(g.teams[0].score, 1);
  assert.equal(g.servingTeam, 0);
});

test('opening side-out switches service and resets to server one', () => {
  const g = Engine.recordRally(game(), 1, 2000);
  assert.equal(g.servingTeam, 1);
  assert.equal(g.serverNumber, 1);
});

test('first server loss advances to second server', () => {
  let g = game();
  g.serverNumber = 1;
  g = Engine.recordRally(g, 1, 2000);
  assert.equal(g.servingTeam, 0);
  assert.equal(g.serverNumber, 2);
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

test('undo restores score and service', () => {
  const before = game();
  const after = Engine.recordRally(before, 1, 2000);
  const undone = Engine.undoLastRally(after, 3000);
  assert.equal(undone.servingTeam, before.servingTeam);
  assert.equal(undone.serverNumber, before.serverNumber);
  assert.deepEqual(undone.teams.map((team) => team.score), [0, 0]);
});

test('singles changes server immediately on service loss', () => {
  const g = Engine.recordRally(game({ format: 'singles' }), 1, 2000);
  assert.equal(g.servingTeam, 1);
  assert.equal(g.serverNumber, 1);
});
