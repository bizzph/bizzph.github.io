(function attachPicklePlayers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PicklePlayers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPicklePlayers() {
  'use strict';

  const ROOT_SCHEMA_VERSION = 3;
  const MAX_PLAYERS = 500;
  const MAX_QUEUE_PLAYERS = 500;
  const MAX_ID_LENGTH = 120;

  function makeId(prefix = 'player') {
    const random = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function cleanId(value) {
    return String(value == null ? '' : value).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, MAX_ID_LENGTH);
  }

  function safeDate(value, fallback) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
  }

  function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  function nameKey(value) {
    return cleanName(value).toLocaleLowerCase();
  }

  function unique(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
  }

  function normalizePlayer(value, now = Date.now()) {
    if (typeof value === 'string') {
      const name = cleanName(value);
      return name ? { id: makeId(), name, createdAt: new Date(now).toISOString() } : null;
    }
    if (!value || typeof value !== 'object') return null;
    const name = cleanName(value.name);
    if (!name) return null;
    const fallbackDate = new Date(now).toISOString();
    const id = cleanId(value.id) || makeId();
    return { id, name, createdAt: safeDate(value.createdAt, fallbackDate) };
  }

  function normalizePlayers(values) {
    const byId = new Map();
    const byName = new Map();
    (Array.isArray(values) ? values.slice(0, MAX_PLAYERS) : []).forEach((value) => {
      const player = normalizePlayer(value);
      if (!player) return;
      const key = nameKey(player.name);
      if (byId.has(player.id) || byName.has(key)) return;
      byId.set(player.id, player);
      byName.set(key, player.id);
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function normalizeQueue(value, players) {
    const source = value && typeof value === 'object' ? value : {};
    const validIds = new Set(normalizePlayers(players).map((player) => player.id));
    const safe = (items, max = MAX_QUEUE_PLAYERS) => unique(items).map(cleanId).filter((id) => validIds.has(id)).slice(0, max);
    const pending = safe(source.pending, 4);
    const onCourt = safe(source.onCourt, 4);
    return {
      waiting: safe(source.waiting).filter((id) => !onCourt.includes(id)),
      pending: pending.length === 4 ? pending : [],
      onCourt,
      activeGameId: cleanId(source.activeGameId)
    };
  }

  function addToQueue(queue, playerId, players) {
    const next = normalizeQueue(queue, players);
    const id = String(playerId || '');
    const valid = normalizePlayers(players).some((player) => player.id === id);
    if (!valid || next.waiting.includes(id) || next.onCourt.includes(id)) return next;
    next.waiting.push(id);
    return next;
  }

  function removeFromQueue(queue, playerId, players) {
    const next = normalizeQueue(queue, players);
    const id = String(playerId || '');
    next.waiting = next.waiting.filter((item) => item !== id);
    next.pending = next.pending.filter((item) => item !== id);
    if (next.pending.length !== 4) next.pending = [];
    return next;
  }

  function moveInQueue(queue, playerId, direction, players) {
    const next = normalizeQueue(queue, players);
    const id = String(playerId || '');
    const index = next.waiting.indexOf(id);
    const target = index + (Number(direction) < 0 ? -1 : 1);
    if (index < 0 || target < 0 || target >= next.waiting.length) return next;
    [next.waiting[index], next.waiting[target]] = [next.waiting[target], next.waiting[index]];
    if (next.pending.length) next.pending = next.waiting.slice(0, 4);
    return next;
  }

  function prepareNextFour(queue, players) {
    const next = normalizeQueue(queue, players);
    next.pending = next.waiting.length >= 4 ? next.waiting.slice(0, 4) : [];
    return next;
  }

  function cancelPending(queue, players) {
    const next = normalizeQueue(queue, players);
    next.pending = [];
    return next;
  }

  function samePlayers(left, right) {
    const a = unique(left).sort();
    const b = unique(right).sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function startQueuedGame(queue, selectedIds, gameId, players) {
    const next = normalizeQueue(queue, players);
    const selected = unique(selectedIds).filter(Boolean);
    if (selected.length !== 4 || next.pending.length !== 4 || !samePlayers(selected, next.pending)) {
      next.pending = [];
      return next;
    }
    next.waiting = next.waiting.filter((id) => !selected.includes(id));
    next.pending = [];
    next.onCourt = selected;
    next.activeGameId = String(gameId || '');
    return next;
  }

  function finishQueuedGame(queue, gameId, players) {
    const next = normalizeQueue(queue, players);
    if (!next.activeGameId || next.activeGameId !== String(gameId || '')) return next;
    next.onCourt.forEach((id) => {
      if (!next.waiting.includes(id)) next.waiting.push(id);
    });
    next.onCourt = [];
    next.activeGameId = '';
    next.pending = [];
    return next;
  }

  function removePlayerEverywhere(queue, playerId, players) {
    const next = normalizeQueue(queue, players);
    const id = String(playerId || '');
    next.waiting = next.waiting.filter((item) => item !== id);
    next.pending = next.pending.filter((item) => item !== id);
    next.onCourt = next.onCourt.filter((item) => item !== id);
    if (next.pending.length !== 4) next.pending = [];
    if (!next.onCourt.length) next.activeGameId = '';
    return next;
  }

  function gameTimestamp(game) {
    const value = game && (game.savedAt || game.completedAt || game.updatedAt || game.createdAt);
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function dedupeGames(games) {
    const byGame = new Map();
    (Array.isArray(games) ? games : []).forEach((game, index) => {
      if (!game || !Array.isArray(game.teams) || game.teams.length !== 2) return;
      const key = String(game.id || game.snapshotId || `legacy-${index}`);
      const existing = byGame.get(key);
      if (!existing || gameTimestamp(game) >= gameTimestamp(existing)) byGame.set(key, game);
    });
    return [...byGame.values()];
  }

  function calculateStandings(games, players) {
    const roster = normalizePlayers(players);
    const rosterById = new Map(roster.map((player) => [player.id, player]));
    const rosterByName = new Map(roster.map((player) => [nameKey(player.name), player]));
    const rows = new Map();

    function ensureRow(id, name) {
      const safeName = cleanName(name) || 'Unknown player';
      const key = id ? `id:${id}` : `name:${nameKey(safeName)}`;
      if (!rows.has(key)) {
        rows.set(key, {
          id: id || '', name: safeName, games: 0, wins: 0, losses: 0,
          pointsFor: 0, pointsAgainst: 0, pointDiff: 0, winPct: 0
        });
      }
      return rows.get(key);
    }

    roster.forEach((player) => ensureRow(player.id, player.name));

    dedupeGames(games).forEach((game) => {
      if (game.status !== 'complete') return;
      const scores = game.teams.map((team) => Number(team && team.score) || 0);
      if (scores[0] === scores[1]) return;
      const winner = scores[0] > scores[1] ? 0 : 1;
      game.teams.forEach((team, teamIndex) => {
        const names = Array.isArray(team && team.players) ? team.players : [];
        const ids = Array.isArray(team && team.playerIds) ? team.playerIds : [];
        names.forEach((rawName, playerIndex) => {
          const safeName = cleanName(rawName);
          if (!safeName) return;
          const rawId = ids[playerIndex] ? String(ids[playerIndex]) : '';
          const rosterPlayer = (rawId && rosterById.get(rawId)) || rosterByName.get(nameKey(safeName));
          const id = rosterPlayer ? rosterPlayer.id : rawId;
          const row = ensureRow(id, rosterPlayer ? rosterPlayer.name : safeName);
          row.games += 1;
          row.pointsFor += scores[teamIndex];
          row.pointsAgainst += scores[teamIndex === 0 ? 1 : 0];
          if (teamIndex === winner) row.wins += 1;
          else row.losses += 1;
        });
      });
    });

    return [...rows.values()].map((row) => ({
      ...row,
      pointDiff: row.pointsFor - row.pointsAgainst,
      winPct: row.games ? row.wins / row.games : 0
    })).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
      if (b.games !== a.games) return b.games - a.games;
      return a.name.localeCompare(b.name);
    });
  }

  return {
    ROOT_SCHEMA_VERSION,
    MAX_PLAYERS,
    MAX_QUEUE_PLAYERS,
    makeId,
    cleanId,
    cleanName,
    nameKey,
    normalizePlayer,
    normalizePlayers,
    normalizeQueue,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    prepareNextFour,
    cancelPending,
    startQueuedGame,
    finishQueuedGame,
    removePlayerEverywhere,
    samePlayers,
    dedupeGames,
    calculateStandings
  };
});
