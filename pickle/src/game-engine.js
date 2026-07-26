(function attachPickleEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleEngine() {
  'use strict';

  const SCHEMA_VERSION = 3;
  const DEFAULT_TIMER_MS = 15 * 60 * 1000;
  const MAX_TIMER_MS = 180 * 60 * 1000;

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

  function timerDurationMs(game) {
    const duration = Number(game && game.timer && game.timer.durationMs);
    return Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_TIMER_MS;
  }

  function rightPlayerIndex(game, teamIndex) {
    if (!game || game.format !== 'doubles') return 0;
    const score = Number(game.teams && game.teams[teamIndex] && game.teams[teamIndex].score) || 0;
    return score % 2 === 0 ? 0 : 1;
  }

  function courtSideForPlayer(game, teamIndex, playerIndex) {
    if (!game || game.format !== 'doubles') {
      const score = Number(game && game.teams && game.teams[teamIndex] && game.teams[teamIndex].score) || 0;
      return score % 2 === 0 ? 'Right' : 'Left';
    }
    return Number(playerIndex) === rightPlayerIndex(game, teamIndex) ? 'Right' : 'Left';
  }

  function replayServiceState(game) {
    const format = game && game.format === 'singles' ? 'singles' : 'doubles';
    const scores = [0, 0];
    let servingTeam = Number(game && game.startingTeam) === 1 ? 1 : 0;
    let serverNumber = format === 'doubles' ? 2 : 1;
    let servingPlayer = 0;
    const rallies = Array.isArray(game && game.rallies) ? game.rallies : [];

    rallies.forEach((rally) => {
      const winner = Number(rally && rally.winnerTeam);
      if (![0, 1].includes(winner)) return;
      if (winner === servingTeam) {
        scores[winner] += 1;
      } else if (format === 'doubles' && serverNumber === 1) {
        serverNumber = 2;
        servingPlayer = servingPlayer === 0 ? 1 : 0;
      } else {
        servingTeam = winner;
        serverNumber = 1;
        servingPlayer = format === 'doubles' ? (scores[winner] % 2 === 0 ? 0 : 1) : 0;
      }
    });

    return { servingTeam, serverNumber, servingPlayer };
  }

  function servingPlayerIndex(game) {
    if (!game || game.format !== 'doubles') return 0;
    const stored = Number(game.servingPlayer);
    if ([0, 1].includes(stored)) return stored;
    return replayServiceState(game).servingPlayer;
  }

  function normalizeGame(game) {
    const next = clone(game);
    next.schemaVersion = SCHEMA_VERSION;
    next.timer = next.timer || {};
    next.timer.durationMs = timerDurationMs(next);
    next.timer.elapsedMs = Math.max(0, Math.min(next.timer.durationMs, Number(next.timer.elapsedMs) || 0));
    next.timer.running = Boolean(next.timer.running) && next.timer.elapsedMs < next.timer.durationMs;
    next.timer.startedAt = next.timer.running && next.timer.startedAt != null && Number.isFinite(Number(next.timer.startedAt))
      ? Number(next.timer.startedAt)
      : null;
    next.teams = Array.isArray(next.teams) ? next.teams : [];
    next.teams.forEach((team) => {
      team.players = Array.isArray(team.players) ? team.players.map((name) => normalizeName(name, 'Player')) : [];
      team.playerIds = Array.isArray(team.playerIds) ? team.playerIds.map((id) => String(id || '')) : [];
      while (team.playerIds.length < team.players.length) team.playerIds.push('');
      team.playerIds = team.playerIds.slice(0, team.players.length);
    });
    if (next.format === 'doubles') next.servingPlayer = servingPlayerIndex(next);
    else next.servingPlayer = 0;
    return next;
  }

  function createGame(options) {
    const safeOptions = options || {};
    const now = safeOptions.now || Date.now();
    const format = safeOptions.format === 'singles' ? 'singles' : 'doubles';
    const target = [11, 15, 21].includes(Number(safeOptions.target)) ? Number(safeOptions.target) : 11;
    const startingTeam = Number(safeOptions.startingTeam) === 1 ? 1 : 0;
    const durationMinutes = Math.max(1, Math.min(180, Number(safeOptions.durationMinutes) || 15));
    const durationMs = durationMinutes * 60 * 1000;

    const teamAPlayers = [normalizeName(safeOptions.teamAPlayer1, 'Player 1')];
    const teamBPlayers = [normalizeName(safeOptions.teamBPlayer1, 'Player 2')];
    const teamAPlayerIds = [String(safeOptions.teamAPlayer1Id || '')];
    const teamBPlayerIds = [String(safeOptions.teamBPlayer1Id || '')];
    if (format === 'doubles') {
      teamAPlayers.push(normalizeName(safeOptions.teamAPlayer2, 'Player 2'));
      teamBPlayers.push(normalizeName(safeOptions.teamBPlayer2, 'Player 2'));
      teamAPlayerIds.push(String(safeOptions.teamAPlayer2Id || ''));
      teamBPlayerIds.push(String(safeOptions.teamBPlayer2Id || ''));
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
          name: normalizeName(safeOptions.teamAName, format === 'singles' ? teamAPlayers[0] : 'Team A'),
          players: teamAPlayers,
          playerIds: teamAPlayerIds,
          score: 0
        },
        {
          name: normalizeName(safeOptions.teamBName, format === 'singles' ? teamBPlayers[0] : 'Team B'),
          players: teamBPlayers,
          playerIds: teamBPlayerIds,
          score: 0
        }
      ],
      servingTeam: startingTeam,
      serverNumber: format === 'doubles' ? 2 : 1,
      servingPlayer: 0,
      startingTeam,
      rallies: [],
      timer: {
        durationMs,
        elapsedMs: 0,
        running: true,
        startedAt: now
      }
    };
  }

  function getElapsedMs(game, now) {
    const safeNow = now || Date.now();
    const duration = timerDurationMs(game);
    const elapsed = Number(game && game.timer && game.timer.elapsedMs) || 0;
    if (!game || !game.timer || !game.timer.running || !game.timer.startedAt) {
      return Math.max(0, Math.min(duration, elapsed));
    }
    return Math.max(0, Math.min(duration, elapsed + Math.max(0, safeNow - game.timer.startedAt)));
  }

  function getRemainingMs(game, now) {
    return Math.max(0, timerDurationMs(game) - getElapsedMs(game, now));
  }

  function pauseTimer(game, now) {
    const safeNow = now || Date.now();
    const next = normalizeGame(game);
    next.timer.elapsedMs = getElapsedMs(game, safeNow);
    next.timer.running = false;
    next.timer.startedAt = null;
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function startTimer(game, now) {
    const safeNow = now || Date.now();
    const next = normalizeGame(game);
    if (next.status === 'complete' || next.timer.running || getRemainingMs(next, safeNow) <= 0) return next;
    next.timer.running = true;
    next.timer.startedAt = safeNow;
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function resetTimer(game, now) {
    const safeNow = now || Date.now();
    const next = normalizeGame(game);
    next.timer.elapsedMs = 0;
    next.timer.running = next.status === 'active';
    next.timer.startedAt = next.status === 'active' ? safeNow : null;
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function setRemainingMs(game, remainingMs, now) {
    const safeNow = now || Date.now();
    const next = normalizeGame(game);
    const wasRunning = next.status === 'active' && Boolean(next.timer.running);
    const desired = Math.max(0, Math.min(MAX_TIMER_MS, Number(remainingMs) || 0));
    const duration = Math.max(timerDurationMs(next), desired);

    next.timer.durationMs = duration;
    next.timer.elapsedMs = duration - desired;
    next.timer.running = wasRunning && desired > 0;
    next.timer.startedAt = next.timer.running ? safeNow : null;
    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function adjustTimer(game, deltaMs, now) {
    const safeNow = now || Date.now();
    const remaining = getRemainingMs(game, safeNow);
    return setRemainingMs(game, remaining + (Number(deltaMs) || 0), safeNow);
  }

  function expireTimer(game, now) {
    const safeNow = now || Date.now();
    const next = normalizeGame(game);
    if (!next.timer.running || getRemainingMs(next, safeNow) > 0) return next;
    next.timer.elapsedMs = timerDurationMs(next);
    next.timer.running = false;
    next.timer.startedAt = null;
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
      servingPlayer: servingPlayerIndex(game),
      status: game.status,
      completedAt: game.completedAt,
      timer: clone(game.timer)
    };
  }

  function recordRally(game, winnerTeam, now) {
    if (game.status !== 'active') return normalizeGame(game);
    if (![0, 1].includes(Number(winnerTeam))) throw new Error('winnerTeam must be 0 or 1');

    const safeNow = now || Date.now();
    const winner = Number(winnerTeam);
    const next = normalizeGame(game);
    next.rallies.push({
      id: makeId('rally'),
      at: new Date(safeNow).toISOString(),
      winnerTeam: winner,
      before: stateSnapshot(next)
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
      next.servingPlayer = next.servingPlayer === 0 ? 1 : 0;
    } else {
      next.servingTeam = winner;
      next.serverNumber = 1;
      next.servingPlayer = rightPlayerIndex(next, winner);
    }

    next.updatedAt = new Date(safeNow).toISOString();
    return next;
  }

  function undoLastRally(game, now) {
    if (!game.rallies || game.rallies.length === 0) return normalizeGame(game);
    const safeNow = now || Date.now();
    const next = normalizeGame(game);
    const rally = next.rallies.pop();
    const before = rally.before;

    next.teams[0].score = before.scores[0];
    next.teams[1].score = before.scores[1];
    next.servingTeam = before.servingTeam;
    next.serverNumber = before.serverNumber;
    next.servingPlayer = [0, 1].includes(Number(before.servingPlayer))
      ? Number(before.servingPlayer)
      : replayServiceState(next).servingPlayer;
    next.status = before.status;
    next.completedAt = before.completedAt;
    next.timer = clone(before.timer);
    next.timer.durationMs = timerDurationMs(next);

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
    const snapshot = normalizeGame(game);
    snapshot.snapshotId = makeId('save');
    snapshot.savedAt = new Date(safeNow).toISOString();
    snapshot.timer.elapsedMs = getElapsedMs(game, safeNow);
    snapshot.timer.running = false;
    snapshot.timer.startedAt = null;
    return snapshot;
  }

  function serviceCourt(game) {
    const teamIndex = Number(game.servingTeam) === 1 ? 1 : 0;
    return `${courtSideForPlayer(game, teamIndex, servingPlayerIndex(game))} court`;
  }

  function serviceDetails(game) {
    const teamIndex = Number(game.servingTeam) === 1 ? 1 : 0;
    const playerIndex = servingPlayerIndex(game);
    const team = game.teams && game.teams[teamIndex] ? game.teams[teamIndex] : { players: [] };
    const fallback = game.format === 'singles' ? `Player ${teamIndex + 1}` : `Player ${playerIndex + 1}`;
    return {
      teamIndex,
      playerIndex,
      playerName: normalizeName(team.players && team.players[playerIndex], fallback),
      side: courtSideForPlayer(game, teamIndex, playerIndex),
      serverNumber: game.format === 'doubles' ? Number(game.serverNumber) || 1 : 1
    };
  }

  function nextServiceAfterFault(game) {
    const normalized = normalizeGame(game);
    let teamIndex;
    let playerIndex;
    let serverNumber;

    if (normalized.format === 'doubles' && normalized.serverNumber === 1) {
      teamIndex = normalized.servingTeam;
      playerIndex = servingPlayerIndex(normalized) === 0 ? 1 : 0;
      serverNumber = 2;
    } else {
      teamIndex = normalized.servingTeam === 0 ? 1 : 0;
      playerIndex = normalized.format === 'doubles' ? rightPlayerIndex(normalized, teamIndex) : 0;
      serverNumber = 1;
    }

    const team = normalized.teams[teamIndex];
    return {
      teamIndex,
      playerIndex,
      playerName: normalizeName(team.players && team.players[playerIndex], `Player ${playerIndex + 1}`),
      side: courtSideForPlayer(normalized, teamIndex, playerIndex),
      serverNumber
    };
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
    return validGames.map(normalizeGame);
  }

  return {
    SCHEMA_VERSION,
    DEFAULT_TIMER_MS,
    MAX_TIMER_MS,
    createGame,
    normalizeGame,
    timerDurationMs,
    getElapsedMs,
    getRemainingMs,
    pauseTimer,
    startTimer,
    resetTimer,
    setRemainingMs,
    adjustTimer,
    expireTimer,
    recordRally,
    undoLastRally,
    endGame,
    snapshotForSave,
    rightPlayerIndex,
    servingPlayerIndex,
    serviceCourt,
    serviceDetails,
    nextServiceAfterFault,
    spokenScore,
    validateImport
  };
});
