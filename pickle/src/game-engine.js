(function attachPickleEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PickleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPickleEngine() {
  'use strict';

  const SCHEMA_VERSION = 3;
  const DEFAULT_TIMER_MS = 15 * 60 * 1000;
  const MAX_TIMER_MS = 180 * 60 * 1000;
  const MAX_SCORE = 999;
  const MAX_RALLIES = 500;
  const MAX_SAVED_RALLIES = 100;
  const MAX_IMPORT_GAMES = 500;
  const MAX_TEXT_LENGTH = 60;
  const MAX_ID_LENGTH = 120;

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
    const text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT_LENGTH);
    return text || fallback;
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function safeInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
  }

  function safeId(value, fallback) {
    const text = String(value == null ? '' : value).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, MAX_ID_LENGTH);
    return text || fallback;
  }

  function safeDate(value, fallback) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
  }

  function normalizeTimer(value, status) {
    const source = safeObject(value);
    const durationMs = safeInteger(source.durationMs, DEFAULT_TIMER_MS, 1, MAX_TIMER_MS);
    const elapsedMs = safeInteger(source.elapsedMs, 0, 0, durationMs);
    const running = status === 'active' && Boolean(source.running) && elapsedMs < durationMs;
    const startedAt = running && Number.isFinite(Number(source.startedAt)) ? Number(source.startedAt) : null;
    return { durationMs, elapsedMs, running, startedAt };
  }

  function normalizeTeam(value, index, format) {
    const source = safeObject(value);
    const expectedPlayers = format === 'singles' ? 1 : 2;
    const rawPlayers = Array.isArray(source.players) ? source.players.slice(0, expectedPlayers) : [];
    const players = [];
    for (let playerIndex = 0; playerIndex < expectedPlayers; playerIndex += 1) {
      players.push(normalizeName(rawPlayers[playerIndex], `Player ${format === 'singles' ? index + 1 : playerIndex + 1}`));
    }
    const rawIds = Array.isArray(source.playerIds) ? source.playerIds.slice(0, expectedPlayers) : [];
    const playerIds = players.map((_name, playerIndex) => safeId(rawIds[playerIndex], ''));
    return {
      name: normalizeName(source.name, `Team ${index === 0 ? 'A' : 'B'}`),
      players,
      playerIds,
      score: safeInteger(source.score, 0, 0, MAX_SCORE)
    };
  }

  function normalizeSnapshot(value, durationMs, format) {
    const source = safeObject(value);
    const scores = Array.isArray(source.scores) ? source.scores : [];
    const status = source.status === 'complete' ? 'complete' : 'active';
    const timer = normalizeTimer(source.timer, status);
    timer.durationMs = durationMs;
    timer.elapsedMs = Math.min(durationMs, timer.elapsedMs);
    if (status === 'complete') {
      timer.running = false;
      timer.startedAt = null;
    }
    return {
      scores: [safeInteger(scores[0], 0, 0, MAX_SCORE), safeInteger(scores[1], 0, 0, MAX_SCORE)],
      servingTeam: safeInteger(source.servingTeam, 0, 0, 1),
      serverNumber: format === 'doubles' ? safeInteger(source.serverNumber, 1, 1, 2) : 1,
      servingPlayer: format === 'doubles' ? safeInteger(source.servingPlayer, 0, 0, 1) : 0,
      status,
      completedAt: status === 'complete' ? safeDate(source.completedAt, null) : null,
      timer
    };
  }

  function normalizeRally(value, durationMs, format, index) {
    const source = safeObject(value);
    const winnerTeam = Number(source.winnerTeam);
    if (![0, 1].includes(winnerTeam)) return null;
    return {
      id: safeId(source.id, `rally-${index}`),
      at: safeDate(source.at, new Date(0).toISOString()),
      winnerTeam,
      before: normalizeSnapshot(source.before, durationMs, format)
    };
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
    const source = safeObject(game);
    const nowIso = new Date().toISOString();
    const format = source.format === 'singles' ? 'singles' : 'doubles';
    const status = source.status === 'complete' ? 'complete' : 'active';
    const rawTeams = Array.isArray(source.teams) ? source.teams.slice(0, 2) : [];
    const teams = [normalizeTeam(rawTeams[0], 0, format), normalizeTeam(rawTeams[1], 1, format)];
    const timer = normalizeTimer(source.timer, status);
    const target = [11, 15, 21].includes(Number(source.target)) ? Number(source.target) : 11;
    const next = {
      schemaVersion: SCHEMA_VERSION,
      id: safeId(source.id, makeId('game')),
      createdAt: safeDate(source.createdAt, nowIso),
      updatedAt: safeDate(source.updatedAt, nowIso),
      completedAt: status === 'complete' ? safeDate(source.completedAt, nowIso) : null,
      format,
      target,
      winBy: 2,
      scoring: 'sideout',
      status,
      teams,
      servingTeam: safeInteger(source.servingTeam, 0, 0, 1),
      serverNumber: format === 'doubles' ? safeInteger(source.serverNumber, 1, 1, 2) : 1,
      servingPlayer: format === 'doubles' ? safeInteger(source.servingPlayer, 0, 0, 1) : 0,
      startingTeam: safeInteger(source.startingTeam, 0, 0, 1),
      rallies: [],
      timer
    };
    const rawRallies = Array.isArray(source.rallies) ? source.rallies.slice(-MAX_RALLIES) : [];
    next.rallies = rawRallies.map((rally, index) => normalizeRally(rally, timer.durationMs, format, index)).filter(Boolean);
    if (format === 'doubles') next.servingPlayer = servingPlayerIndex(next);
    if (status === 'complete') {
      next.timer.running = false;
      next.timer.startedAt = null;
    }
    const snapshotId = safeId(source.snapshotId, '');
    const savedAt = safeDate(source.savedAt, null);
    if (snapshotId) next.snapshotId = snapshotId;
    if (savedAt) next.savedAt = savedAt;
    return next;
  }

  function publicGameState(game) {
    const normalized = normalizeGame(game);
    return {
      schemaVersion: normalized.schemaVersion,
      id: normalized.id,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      completedAt: normalized.completedAt,
      format: normalized.format,
      target: normalized.target,
      winBy: normalized.winBy,
      scoring: normalized.scoring,
      status: normalized.status,
      teams: normalized.teams.map((team) => ({ name: team.name, players: team.players.slice(), score: team.score })),
      servingTeam: normalized.servingTeam,
      serverNumber: normalized.serverNumber,
      servingPlayer: normalized.servingPlayer,
      startingTeam: normalized.startingTeam,
      timer: { ...normalized.timer },
      rallies: []
    };
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
    snapshot.rallies = snapshot.status === 'complete' ? [] : snapshot.rallies.slice(-MAX_SAVED_RALLIES);
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
    if (games.length > MAX_IMPORT_GAMES) throw new Error(`A backup can contain at most ${MAX_IMPORT_GAMES} games.`);
    const validGames = games.filter((game) => game && Array.isArray(game.teams) && game.teams.length === 2);
    if (validGames.length === 0) throw new Error('No valid pickleball games were found.');
    return validGames.map(normalizeGame);
  }

  return {
    SCHEMA_VERSION,
    DEFAULT_TIMER_MS,
    MAX_TIMER_MS,
    MAX_SCORE,
    MAX_RALLIES,
    MAX_SAVED_RALLIES,
    MAX_IMPORT_GAMES,
    createGame,
    normalizeGame,
    publicGameState,
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
