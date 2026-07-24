(function attachPickleEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleEngine() {
  'use strict';

  const SCHEMA_VERSION = 1;

  function makeId(prefix) {
    const random = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeName(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function createGame(options) {
    const now = options.now || Date.now();
    const format = options.format === 'singles' ? 'singles' : 'doubles';
    const target = [11, 15, 21].includes(Number(options.target)) ? Number(options.target) : 11;
    const startingTeam = Number(options.startingTeam) === 1 ? 1 : 0;

    const teamAPlayers = [normalizeName(options.teamAPlayer1, 'Player 1')];
    const teamBPlayers = [normalizeName(options.teamBPlayer1, 'Player 2')];
    if (format === 'doubles') {
      teamAPlayers.push(normalizeName(options.teamAPlayer2, 'Player 2'));
      teamBPlayers.push(normalizeName(options.teamBPlayer2, 'Player 2'));
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      id: makeId('game'),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      completedAt: null,
      format,
      target,
      winBy: 2,
      scoring: 'sideout',
      status: 'active',
      teams: [
        {
          name: normalizeName(options.teamAName, format === 'singles' ? teamAPlayers[0] : 'Team A'),
          players: teamAPlayers,
          score: 0
        },
        {
          name: normalizeName(options.teamBName, format === 'singles' ? teamBPlayers[0] : 'Team B'),
          players: teamBPlayers,
          score: 0
        }
      ],
      servingTeam: startingTeam,
      serverNumber: format === 'doubles' ? 2 : 1,
      startingTeam,
      rallies: [],
      timer: {
        elapsedMs: 0,
        running: true,
        startedAt: now
      }
    };
  }

  function getElapsedMs(game, now) {
    const safeNow = now || Date.now();
    const elapsed = Number(game.timer && game.timer.elapsedMs) || 0;
    if (!game.timer || !game.timer.running || !game.timer.startedAt) return elapsed;
    return Math.max(0, elapsed + (safeNow - game.timer.startedAt));
  }

  function pauseTimer(game, now) {
    const next = clone(game);
    next.timer = next.timer || { elapsedMs: 0, running: false, startedAt: null };
    next.timer.elapsedMs = getElapsedMs(game, now);
    next.timer.running = false;
    next.timer.startedAt = null;
    next.updatedAt = new Date(now || Date.now()).toISOString();
    return next;
  }

  function startTimer(game, now) {
    if (game.status === 'complete' || (game.timer && game.timer.running)) return clone(game);
    const safeNow = now || Date.now();
    const next = clone(game);
    next.timer = next.timer || { elapsedMs: 0, running: false, startedAt: null };
    next.timer.running = true;
    next.timer.startedAt = safeNow;
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function resetTimer(game, now) {
    const safeNow = now || Date.now();
    const next = clone(game);
    next.timer = {
      elapsedMs: 0,
      running: game.status === 'active',
      startedAt: game.status === 'active' ? safeNow : null
    };
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function isWinner(game, teamIndex) {
    const score = game.teams[teamIndex].score;
    const opponentScore = game.teams[teamIndex === 0 ? 1 : 0].score;
    return score >= game.target && score - opponentScore >= game.winBy;
  }

  function stateSnapshot(game) {
    return {
      scores: game.teams.map((team) => team.score),
      servingTeam: game.servingTeam,
      serverNumber: game.serverNumber,
      status: game.status,
      completedAt: game.completedAt,
      timer: clone(game.timer)
    };
  }

  function recordRally(game, winnerTeam, now) {
    if (game.status !== 'active') return clone(game);
    if (![0, 1].includes(Number(winnerTeam))) throw new Error('winnerTeam must be 0 or 1');

    const safeNow = now || Date.now();
    const winner = Number(winnerTeam);
    const next = clone(game);
    next.rallies.push({
      id: makeId('rally'),
      at: new Date(safeNow).toISOString(),
      winnerTeam: winner,
      before: stateSnapshot(game)
    });

    if (winner === next.servingTeam) {
      next.teams[winner].score += 1;
      if (isWinner(next, winner)) {
        next.status = 'complete';
        next.completedAt = new Date(safeNow).toISOString();
        next.timer.elapsedMs = getElapsedMs(game, safeNow);
        next.timer.running = false;
        next.timer.startedAt = null;
      }
    } else if (next.format === 'doubles' && next.serverNumber === 1) {
      next.serverNumber = 2;
    } else {
      next.servingTeam = winner;
      next.serverNumber = 1;
    }

    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function undoLastRally(game, now) {
    if (!game.rallies || game.rallies.length === 0) return clone(game);
    const safeNow = now || Date.now();
    const next = clone(game);
    const rally = next.rallies.pop();
    const before = rally.before;

    next.teams[0].score = before.scores[0];
    next.teams[1].score = before.scores[1];
    next.servingTeam = before.servingTeam;
    next.serverNumber = before.serverNumber;
    next.status = before.status;
    next.completedAt = before.completedAt;
    next.timer = clone(before.timer);

    if (next.status === 'active' && next.timer.running) {
      const priorElapsed = getElapsedMs({ timer: before.timer }, safeNow);
      next.timer.elapsedMs = priorElapsed;
      next.timer.startedAt = safeNow;
    }

    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function endGame(game, now) {
    const safeNow = now || Date.now();
    const next = pauseTimer(game, safeNow);
    next.status = 'complete';
    next.completedAt = new Date(safeNow).toISOString();
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function snapshotForSave(game, now) {
    const safeNow = now || Date.now();
    const snapshot = clone(game);
    snapshot.snapshotId = makeId('save');
    snapshot.savedAt = new Date(safeNow).toISOString();
    snapshot.timer.elapsedMs = getElapsedMs(game, safeNow);
    snapshot.timer.running = false;
    snapshot.timer.startedAt = null;
    return snapshot;
  }

  function serviceCourt(game) {
    const score = game.teams[game.servingTeam].score;
    return score % 2 === 0 ? 'Right court' : 'Left court';
  }

  function spokenScore(game) {
    const serving = game.teams[game.servingTeam].score;
    const receiving = game.teams[game.servingTeam === 0 ? 1 : 0].score;
    return game.format === 'doubles'
      ? `${serving} - ${receiving} - ${game.serverNumber}`
      : `${serving} - ${receiving}`;
  }

  function validateImport(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('The JSON file is not an object.');
    const games = Array.isArray(payload.games) ? payload.games : Array.isArray(payload) ? payload : null;
    if (!games) throw new Error('No games array was found in the JSON file.');

    const validGames = games.filter((game) => {
      return game && Array.isArray(game.teams) && game.teams.length === 2 && game.teams.every((team) => typeof team.score === 'number');
    });
    if (validGames.length === 0) throw new Error('No valid pickleball games were found.');
    return validGames.map(clone);
  }

  return {
    SCHEMA_VERSION,
    createGame,
    getElapsedMs,
    pauseTimer,
    startTimer,
    resetTimer,
    recordRally,
    undoLastRally,
    endGame,
    snapshotForSave,
    serviceCourt,
    spokenScore,
    validateImport
  };
});
