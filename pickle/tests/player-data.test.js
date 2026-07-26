const test = require('node:test');
const assert = require('node:assert/strict');
const Players = require('../src/player-data.js');
const Engine = require('../src/game-engine.js');

const roster = [
  { id: 'p1', name: 'Ava' },
  { id: 'p2', name: 'Ben' },
  { id: 'p3', name: 'Cora' },
  { id: 'p4', name: 'Drew' },
  { id: 'p5', name: 'Eli' }
];

test('FIFO queue prepares the first four and requeues them after the game', () => {
  let queue = Players.normalizeQueue({ waiting: ['p1', 'p2', 'p3', 'p4', 'p5'] }, roster);
  queue = Players.prepareNextFour(queue, roster);
  assert.deepEqual(queue.pending, ['p1', 'p2', 'p3', 'p4']);
  queue = Players.startQueuedGame(queue, ['p1', 'p2', 'p3', 'p4'], 'game-1', roster);
  assert.deepEqual(queue.waiting, ['p5']);
  assert.deepEqual(queue.onCourt, ['p1', 'p2', 'p3', 'p4']);
  queue = Players.finishQueuedGame(queue, 'game-1', roster);
  assert.deepEqual(queue.waiting, ['p5', 'p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(queue.onCourt, []);
});

test('standings use the latest saved snapshot per game and player ids', () => {
  const game = Engine.createGame({
    format: 'doubles', target: 11,
    teamAPlayer1: 'Ava', teamAPlayer1Id: 'p1',
    teamAPlayer2: 'Ben', teamAPlayer2Id: 'p2',
    teamBPlayer1: 'Cora', teamBPlayer1Id: 'p3',
    teamBPlayer2: 'Drew', teamBPlayer2Id: 'p4'
  });
  game.status = 'complete';
  game.teams[0].score = 11;
  game.teams[1].score = 7;
  const older = { ...JSON.parse(JSON.stringify(game)), savedAt: '2026-01-01T00:00:00.000Z' };
  const newer = { ...JSON.parse(JSON.stringify(game)), savedAt: '2026-01-02T00:00:00.000Z' };
  const rows = Players.calculateStandings([older, newer], roster);
  const ava = rows.find((row) => row.id === 'p1');
  const cora = rows.find((row) => row.id === 'p3');
  assert.equal(ava.games, 1);
  assert.equal(ava.wins, 1);
  assert.equal(ava.pointDiff, 4);
  assert.equal(cora.losses, 1);
});

test('standings ignore unfinished saved snapshots', () => {
  const game = Engine.createGame({
    format: 'singles', target: 11,
    teamAPlayer1: 'Ava', teamAPlayer1Id: 'p1',
    teamBPlayer1: 'Cora', teamBPlayer1Id: 'p3'
  });
  game.teams[0].score = 7;
  game.teams[1].score = 3;
  const rows = Players.calculateStandings([game], roster);
  assert.equal(rows.find((row) => row.id === 'p1').games, 0);
  assert.equal(rows.find((row) => row.id === 'p3').games, 0);
});

test('add all queues every available roster player once', () => {
  const queue = Players.normalizeQueue({ waiting: ['p2'], onCourt: ['p4'] }, roster);
  const next = Players.addAllToQueue(queue, roster);
  assert.deepEqual(next.waiting, ['p2', 'p1', 'p3', 'p5']);
  assert.deepEqual(next.onCourt, ['p4']);
});

test('drag reorder moves players before or after a target and refreshes pending four', () => {
  let queue = Players.normalizeQueue({
    waiting: ['p1', 'p2', 'p3', 'p4', 'p5'],
    pending: ['p1', 'p2', 'p3', 'p4']
  }, roster);
  queue = Players.reorderQueue(queue, 'p5', 'p2', false, roster);
  assert.deepEqual(queue.waiting, ['p1', 'p5', 'p2', 'p3', 'p4']);
  assert.deepEqual(queue.pending, ['p1', 'p5', 'p2', 'p3']);
  queue = Players.reorderQueue(queue, 'p1', 'p4', true, roster);
  assert.deepEqual(queue.waiting, ['p5', 'p2', 'p3', 'p4', 'p1']);
  assert.deepEqual(queue.pending, ['p5', 'p2', 'p3', 'p4']);
});
