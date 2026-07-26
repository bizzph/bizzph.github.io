(function bootstrapPicklePulse() {
  'use strict';

  const Engine = globalThis.PickleEngine;
  let Live = globalThis.PickleLive || null;
  const LIVE_SCRIPT_URL = 'src/live-sync.js?v=8';
  let liveLoadPromise = null;
  const Players = globalThis.PicklePlayers;
  const STORAGE_KEY = 'picklepulse-state-v1';
  const LIVE_SECRET_STORAGE_KEY = 'picklepulse-live-secret-v1';
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_SAVED_GAMES = 500;
  const DEFAULT_APPEARANCE = Object.freeze({ teamA: '', teamB: '', highContrast: false });
  const DEFAULT_SETTINGS = Object.freeze({ voiceEnabled: false });
  const COLOR_PRESETS = Object.freeze([
    { id: 'classic', label: 'Classic', teamA: '#1e7350', teamB: '#4e5f8d' },
    { id: 'bright', label: 'Bright', teamA: '#00c875', teamB: '#3b82f6' },
    { id: 'sunset', label: 'Sunset', teamA: '#e85d3f', teamB: '#8b5cf6' },
    { id: 'max', label: 'Maximum contrast', teamA: '#ffd400', teamB: '#00d9ff', highContrast: true }
  ]);



  function icon(name, className = '') {
    const safeName = /^[a-z]+$/i.test(String(name || '')) ? name : 'ball';
    return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#pp-icon-${safeName}"></use></svg>`;
  }

  function normalizeRoomCode(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^2-9A-HJ-NP-Z]/g, '')
      .slice(0, 8);
  }

  function normalizeAccessKey(value) {
    return String(value || '').replace(/[^2-9A-HJ-NP-Za-km-z]/g, '').slice(0, 32);
  }

  function liveSecretStorage() {
    try {
      if (globalThis.sessionStorage) return globalThis.sessionStorage;
    } catch (_error) {}
    return globalThis.localStorage;
  }

  function liveDisplayUrl(room, accessKey, href) {
    const source = href || (globalThis.location && location.href) || 'https://example.test/';
    const url = new URL(source);
    url.search = '';
    url.hash = '';
    url.searchParams.set('watch', normalizeRoomCode(room));
    const key = normalizeAccessKey(accessKey);
    if (key) url.hash = new URLSearchParams({ key }).toString();
    return url.toString();
  }

  function parseLiveAccess(value, href) {
    const raw = String(value || '').trim();
    let room = '';
    let accessKey = '';
    if (raw) {
      try {
        const url = new URL(raw, href || (globalThis.location && location.href) || 'https://example.test/');
        room = normalizeRoomCode(url.searchParams.get('watch'));
        accessKey = normalizeAccessKey(new URLSearchParams(url.hash.replace(/^#/, '')).get('key'));
      } catch (_error) {}
    }
    if (!room || !accessKey) {
      const match = raw.replace(/\s+/g, '').match(/^([2-9A-HJ-NP-Z]{4,8})[.:/-]([2-9A-HJ-NP-Za-km-z]{16,32})$/i);
      if (match) {
        room = normalizeRoomCode(match[1]);
        accessKey = normalizeAccessKey(match[2]);
      }
    }
    return { room, accessKey, valid: room.length >= 4 && accessKey.length >= 16 };
  }

  function loadLiveSync() {
    if (Live) return Promise.resolve(Live);
    if (globalThis.PickleLive) {
      Live = globalThis.PickleLive;
      return Promise.resolve(Live);
    }
    if (liveLoadPromise) return liveLoadPromise;
    if (!globalThis.document || !document.createElement) {
      return Promise.reject(new Error('Live display module is unavailable.'));
    }
    liveLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LIVE_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        Live = globalThis.PickleLive || null;
        if (Live) resolve(Live);
        else reject(new Error('Live display module did not initialize.'));
      };
      script.onerror = () => reject(new Error('Unable to load live display module.'));
      document.head.appendChild(script);
    }).catch((error) => {
      liveLoadPromise = null;
      throw error;
    });
    return liveLoadPromise;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatCountdown(ms) {
    const value = Math.max(0, Number(ms) || 0);
    const total = value === 0 ? 0 : Math.ceil(value / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      }).format(new Date(value));
    } catch (_error) {
      return String(value);
    }
  }

  function teamTitle(team, index) {
    const players = Array.isArray(team && team.players) ? team.players : [];
    const generic = !team.name || team.name === `Team ${index === 0 ? 'A' : 'B'}`;
    return generic ? players.join(' · ') : team.name;
  }

  function filenameDate() {
    return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  }

  function normalizeHex(value) {
    const text = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '';
  }

  function normalizeAppearance(value) {
    const source = value && typeof value === 'object' ? value : DEFAULT_APPEARANCE;
    return {
      teamA: normalizeHex(source.teamA),
      teamB: normalizeHex(source.teamB),
      highContrast: Boolean(source.highContrast)
    };
  }

  function normalizeSettings(value) {
    const source = value && typeof value === 'object' ? value : DEFAULT_SETTINGS;
    return { voiceEnabled: Boolean(source.voiceEnabled) };
  }

  function appearanceStyle(value) {
    const appearance = normalizeAppearance(value);
    const declarations = [];
    if (appearance.teamA) declarations.push(`--team-a:${appearance.teamA}`, `--team-a-soft:color-mix(in srgb, ${appearance.teamA} 15%, var(--surface))`);
    if (appearance.teamB) declarations.push(`--team-b:${appearance.teamB}`, `--team-b-soft:color-mix(in srgb, ${appearance.teamB} 15%, var(--surface))`);
    return declarations.join(';');
  }

  function presetIsActive(preset, appearance) {
    const value = normalizeAppearance(appearance);
    return value.teamA === preset.teamA.toLowerCase()
      && value.teamB === preset.teamB.toLowerCase()
      && value.highContrast === Boolean(preset.highContrast);
  }

  function voiceSignature(game) {
    if (!game || !Array.isArray(game.teams)) return '';
    const details = Engine.serviceDetails(game);
    return [game.status, game.teams[0].score, game.teams[1].score, game.servingTeam, game.serverNumber, details.playerName, details.side].join('|');
  }

  function gameAnnouncement(game) {
    if (!game || !Array.isArray(game.teams)) return '';
    if (game.status === 'complete') {
      const a = Number(game.teams[0].score) || 0;
      const b = Number(game.teams[1].score) || 0;
      if (a === b) return `Game ended, tied at ${a}.`;
      const winner = a > b ? 0 : 1;
      return `Game. ${teamTitle(game.teams[winner], winner)} wins, ${Math.max(a, b)} to ${Math.min(a, b)}.`;
    }
    const serve = Engine.serviceDetails(game);
    const score = Engine.spokenScore(game).replaceAll(' - ', ', ');
    return `${score}. ${serve.playerName} serving from the ${serve.side.toLowerCase()} side.`;
  }

  class PickleballApp extends HTMLElement {
    constructor() {
      super();
      const params = new URLSearchParams(globalThis.location ? location.search : '');
      this.watchRoom = normalizeRoomCode(params.get('watch'));
      const fragment = new URLSearchParams(globalThis.location ? String(location.hash || '').replace(/^#/, '') : '');
      const fragmentAccessKey = normalizeAccessKey(fragment.get('key'));
      this.watchAccessKey = fragmentAccessKey;
      this.mode = this.watchRoom ? 'display' : 'controller';
      this.state = this.loadState();
      if (this.watchRoom) {
        this.watchAccessKey = fragmentAccessKey || this.readLiveSecret(this.watchRoom);
        if (this.watchAccessKey.length >= 16) {
          this.saveLiveSecret(this.watchRoom, this.watchAccessKey);
          if (fragmentAccessKey && globalThis.history && typeof history.replaceState === 'function') {
            try {
              const cleanUrl = new URL(location.href);
              cleanUrl.hash = '';
              history.replaceState(history.state, '', cleanUrl.toString());
            } catch (_error) {}
          }
        }
      }
      this.view = this.state.currentGame ? 'game' : 'setup';
      this.network = this.readNetwork();
      this.toast = '';
      this.showColors = false;
      this.showTimerAdjust = false;
      this.showLeaveWarning = false;
      this.pendingView = '';
      this.allowPageLeave = false;
      this.guardArmed = false;
      this.live = { phase: 'off', room: '', viewers: 0, detail: '' };
      this.liveController = null;
      this.liveAccessKey = '';
      this.remoteGame = null;
      this.remoteStatus = { phase: 'connecting', room: this.watchRoom, detail: '' };
      this.remoteUpdatedAt = null;
      this.viewer = null;
      this.displayVoiceEnabled = false;
      this.lastVoiceSignature = this.state.currentGame ? voiceSignature(this.state.currentGame) : '';
      this.lastRemoteVoiceSignature = '';
      this._playerMapSource = null;
      this._playerMap = new Map();
      this.boundClick = this.onClick.bind(this);
      this.boundSubmit = this.onSubmit.bind(this);
      this.boundChange = this.onChange.bind(this);
      this.boundNetwork = this.onNetworkChange.bind(this);
      this.boundFullscreen = this.onFullscreenChange.bind(this);
      this.boundBeforeUnload = this.onBeforeUnload.bind(this);
      this.boundPopState = this.onPopState.bind(this);
    }

    connectedCallback() {
      this.addEventListener('click', this.boundClick);
      this.addEventListener('submit', this.boundSubmit);
      this.addEventListener('change', this.boundChange);
      window.addEventListener('online', this.boundNetwork);
      window.addEventListener('offline', this.boundNetwork);
      window.addEventListener('beforeunload', this.boundBeforeUnload);
      window.addEventListener('popstate', this.boundPopState);
      document.addEventListener('fullscreenchange', this.boundFullscreen);
      document.addEventListener('webkitfullscreenchange', this.boundFullscreen);
      if (navigator.connection && navigator.connection.addEventListener) {
        navigator.connection.addEventListener('change', this.boundNetwork);
      }
      this.render();
      if (this.shouldProtectScoring()) this.armScoringGuard();
      this.clock = window.setInterval(() => {
        const game = this.mode === 'display' ? this.remoteGame : this.state.currentGame;
        if (!game || !game.timer || !game.timer.running) return;
        const now = Date.now();
        if (this.mode === 'controller' && Engine.getRemainingMs(game, now) <= 0) {
          this.showTimerAdjust = false;
          this.setCurrentGame(Engine.expireTimer(game, now));
          this.showToast('Time');
          return;
        }
        if (this.mode === 'controller' && this.showTimerAdjust) return;
        this.updateClockDisplay();
      }, 1000);
      if (this.mode === 'display') this.startViewer();
      if (this.mode === 'controller' && this.state.currentGame && this.state.currentGame.status === 'active' && this.state.liveRoom) {
        this.startLive(this.state.liveRoom, true);
      }
      this.scheduleServiceWorker();
    }

    disconnectedCallback() {
      window.clearInterval(this.clock);
      window.removeEventListener('online', this.boundNetwork);
      window.removeEventListener('offline', this.boundNetwork);
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      window.removeEventListener('popstate', this.boundPopState);
      document.removeEventListener('fullscreenchange', this.boundFullscreen);
      document.removeEventListener('webkitfullscreenchange', this.boundFullscreen);
      if (navigator.connection && navigator.connection.removeEventListener) {
        navigator.connection.removeEventListener('change', this.boundNetwork);
      }
      if (this.liveController) this.liveController.stop();
      if (this.viewer) this.viewer.stop();
    }

    loadState() {
      const fallbackPlayers = [];
      const fallback = {
        schemaVersion: Players.ROOT_SCHEMA_VERSION,
        currentGame: null,
        games: [],
        players: fallbackPlayers,
        queue: Players.normalizeQueue({}, fallbackPlayers),
        settings: normalizeSettings(DEFAULT_SETTINGS),
        liveRoom: '',
        lastSavedAt: null,
        appearance: normalizeAppearance(DEFAULT_APPEARANCE)
      };
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!parsed || typeof parsed !== 'object') return fallback;
        const players = Players.normalizePlayers(parsed.players);
        return {
          schemaVersion: Players.ROOT_SCHEMA_VERSION,
          currentGame: parsed.currentGame ? Engine.normalizeGame(parsed.currentGame) : null,
          games: Array.isArray(parsed.games) ? parsed.games.slice(0, MAX_SAVED_GAMES).map((game) => Engine.normalizeGame(game)) : [],
          players,
          queue: Players.normalizeQueue(parsed.queue, players),
          settings: normalizeSettings(parsed.settings),
          liveRoom: normalizeRoomCode(parsed.liveRoom),
          lastSavedAt: parsed.lastSavedAt || null,
          appearance: normalizeAppearance(parsed.appearance)
        };
      } catch (_error) {
        return fallback;
      }
    }

    persist() {
      try {
        this.state.schemaVersion = Players.ROOT_SCHEMA_VERSION;
        this.state.players = Players.normalizePlayers(this.state.players);
        this.state.queue = Players.normalizeQueue(this.state.queue, this.state.players);
        this.state.settings = normalizeSettings(this.state.settings);
        this.state.games = (Array.isArray(this.state.games) ? this.state.games : []).slice(0, MAX_SAVED_GAMES).map((game) => Engine.normalizeGame(game));
        this.state.lastSavedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        return true;
      } catch (error) {
        this.showToast(`Save failed: ${error.message}`);
        return false;
      }
    }

    readLiveSecret(room = '') {
      try {
        const value = JSON.parse(liveSecretStorage().getItem(LIVE_SECRET_STORAGE_KEY));
        const expected = normalizeRoomCode(room);
        return value && normalizeRoomCode(value.room) === expected ? normalizeAccessKey(value.accessKey) : '';
      } catch (_error) {
        return '';
      }
    }

    saveLiveSecret(room, accessKey) {
      try {
        liveSecretStorage().setItem(LIVE_SECRET_STORAGE_KEY, JSON.stringify({ room: normalizeRoomCode(room), accessKey: normalizeAccessKey(accessKey) }));
      } catch (_error) {}
    }

    clearLiveSecret() {
      try { liveSecretStorage().removeItem(LIVE_SECRET_STORAGE_KEY); } catch (_error) {}
      this.liveAccessKey = '';
    }

    playerById(id) {
      if (this._playerMapSource !== this.state.players) {
        this._playerMapSource = this.state.players;
        this._playerMap = new Map(this.state.players.map((player) => [player.id, player]));
      }
      return this._playerMap.get(String(id || '')) || null;
    }

    playerName(id) {
      const player = this.playerById(id);
      return player ? player.name : 'Unknown';
    }

    readNetwork() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!navigator.onLine) return { level: 'offline', label: 'Offline' };
      if (!connection) return { level: 'online', label: 'Online' };
      const weak = ['slow-2g', '2g'].includes(connection.effectiveType)
        || (Number(connection.downlink) > 0 && Number(connection.downlink) < 1.5)
        || Number(connection.rtt) > 600;
      return { level: weak ? 'weak' : 'online', label: weak ? 'Weak' : 'Online' };
    }

    onNetworkChange() {
      this.network = this.readNetwork();
      this.render();
    }

    onFullscreenChange() {
      if (this.mode === 'display') this.render();
    }

    isFullscreen() {
      return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    async toggleFullscreen() {
      try {
        if (this.isFullscreen()) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) await exit.call(document);
          return;
        }
        const root = document.documentElement;
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) {
          this.showToast('Fullscreen unavailable');
          return;
        }
        await request.call(root);
      } catch (_error) {
        this.showToast('Fullscreen unavailable');
      }
    }

    shouldProtectScoring() {
      return this.mode === 'controller'
        && !this.allowPageLeave
        && Boolean(this.state.currentGame && this.state.currentGame.status === 'active');
    }

    armScoringGuard() {
      if (this.guardArmed || !globalThis.history || !history.pushState) return;
      try {
        history.replaceState({ ...(history.state || {}), picklepulseBase: true }, '', location.href);
        history.pushState({ picklepulseGuard: true }, '', location.href);
        this.guardArmed = true;
      } catch (_error) {}
    }

    onBeforeUnload(event) {
      if (!this.shouldProtectScoring()) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    }

    onPopState() {
      if (!this.shouldProtectScoring()) return;
      try { history.pushState({ picklepulseGuard: true }, '', location.href); } catch (_error) {}
      this.view = 'game';
      this.pendingView = '';
      this.showLeaveWarning = true;
      this.render();
    }

    scheduleServiceWorker() {
      if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
      const register = () => this.registerServiceWorker();
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(register, { timeout: 2500 });
      } else {
        window.setTimeout(register, 1200);
      }
    }

    registerServiceWorker() {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    updateClockDisplay() {
      const game = this.mode === 'display' ? this.remoteGame : this.state.currentGame;
      if (!game || !game.timer) return;
      const remaining = Engine.getRemainingMs(game, Date.now());
      this.querySelectorAll('[data-role="match-clock"]').forEach((element) => {
        element.textContent = formatCountdown(remaining);
        if (element.classList) element.classList.toggle('timer-low', remaining <= 60000);
      });
    }

    showToast(message) {
      this.toast = message;
      this.render();
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toast = '';
        this.render();
      }, 2600);
    }

    setCurrentGame(game, broadcast = true, announce = true) {
      const previous = this.state.currentGame;
      const completedNow = previous && previous.status === 'active' && game && game.status === 'complete';
      if (completedNow) {
        this.state.games.unshift(Engine.snapshotForSave(game, Date.now()));
        this.state.games = this.state.games.slice(0, MAX_SAVED_GAMES);
        this.state.queue = Players.finishQueuedGame(this.state.queue, game.id, this.state.players);
      }
      this.state.currentGame = game ? Engine.normalizeGame(game) : null;
      this.persist();
      if (this.state.currentGame && this.state.currentGame.status === 'active') this.armScoringGuard();
      if (broadcast && this.liveController) this.liveController.broadcast();
      if (announce) this.announceGame(this.state.currentGame);
      this.render();
    }

    voiceEnabled() {
      return this.mode === 'display' ? this.displayVoiceEnabled : Boolean(this.state.settings.voiceEnabled);
    }

    announceGame(game, force = false, remote = false) {
      if (!this.voiceEnabled() || !game || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return;
      const signature = voiceSignature(game);
      const lastKey = remote ? 'lastRemoteVoiceSignature' : 'lastVoiceSignature';
      if (!force && signature === this[lastKey]) return;
      this[lastKey] = signature;
      const text = gameAnnouncement(game);
      if (!text) return;
      try {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        speechSynthesis.speak(utterance);
      } catch (_error) {
        this.showToast('Voice unavailable');
      }
    }

    async startViewer() {
      if (!this.watchRoom) return;
      if (this.watchAccessKey.length < 16) {
        this.remoteStatus = { phase: 'error', room: this.watchRoom, detail: 'This live link is missing its access key.' };
        this.render();
        return;
      }
      try {
        const LiveApi = await loadLiveSync();
        this.viewer = new LiveApi.LiveViewer({
          room: this.watchRoom,
          accessKey: this.watchAccessKey,
          onState: (game, sentAt) => {
            try {
              const receivedAt = Date.now();
              const adapted = LiveApi.adaptRemoteGame(game, sentAt, receivedAt);
              const appearance = normalizeAppearance(adapted.appearance);
              this.remoteGame = { ...Engine.normalizeGame(adapted), appearance };
              this.remoteUpdatedAt = receivedAt;
              this.announceGame(this.remoteGame, false, true);
              this.render();
            } catch (error) {
              this.remoteStatus = { phase: 'error', room: this.watchRoom, detail: error.message || 'Invalid live update' };
              this.render();
            }
          },
          onStatus: (status) => {
            this.remoteStatus = status;
            this.render();
          }
        });
        await this.viewer.start();
      } catch (error) {
        this.remoteStatus = { phase: 'error', room: this.watchRoom, detail: error.message };
        this.render();
      }
    }

    async startLive(preferredRoom = '', silent = false) {
      if (!this.state.currentGame) {
        if (!silent) this.showToast('Start a match first');
        return false;
      }
      if (this.liveController) return true;

      let LiveApi;
      try {
        LiveApi = await loadLiveSync();
      } catch (error) {
        this.live = { phase: 'error', room: normalizeRoomCode(preferredRoom), viewers: 0, detail: error.message || 'Unable to load local live mode' };
        this.render();
        if (!silent) this.showToast('Could not load local live mode');
        return false;
      }

      const preferred = normalizeRoomCode(preferredRoom);
      const storedKey = preferred ? this.readLiveSecret(preferred) : '';
      const attempts = preferred ? 3 : 4;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const room = preferred || LiveApi.generateRoomCode();
        let accessKey = storedKey;
        try {
          accessKey = accessKey || LiveApi.generateAccessKey();
        } catch (error) {
          this.live = { phase: 'error', room, viewers: 0, detail: error.message || 'Secure randomness is unavailable' };
          this.render();
          if (!silent) this.showToast('This browser cannot create a secure live room');
          return false;
        }
        this.live = { phase: attempt ? 'reconnecting' : 'starting', room, viewers: 0, detail: '' };
        this.render();
        const controller = new LiveApi.LiveController({
          room,
          accessKey,
          getState: () => this.state.currentGame
            ? { ...Engine.publicGameState(this.state.currentGame), appearance: normalizeAppearance(this.state.appearance) }
            : null,
          onStatus: (status) => {
            this.live = status;
            this.render();
          }
        });
        try {
          await controller.start();
          this.liveController = controller;
          this.liveAccessKey = accessKey;
          this.state.liveRoom = room;
          this.saveLiveSecret(room, accessKey);
          this.persist();
          controller.broadcast();
          if (!silent) this.showToast(`Secure live · ${room}`);
          return true;
        } catch (error) {
          controller.stop();
          if (error && error.type === 'unavailable-id') {
            if (preferred && attempt < attempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
              continue;
            }
            if (!preferred) continue;
          }
          this.live = { phase: 'error', room, viewers: 0, detail: error.message || 'Unable to connect to the local server' };
          this.render();
          return false;
        }
      }
      if (!silent) this.showToast(preferred ? 'Could not restore the live room' : 'Could not create a room');
      return false;
    }

    stopLive() {
      if (this.liveController) this.liveController.stop();
      this.liveController = null;
      this.live = { phase: 'off', room: '', viewers: 0, detail: '' };
      this.state.liveRoom = '';
      this.clearLiveSecret();
      this.persist();
      this.render();
    }

    async shareLive() {
      const started = await this.startLive(this.state.liveRoom);
      if (!started) return;
      const url = liveDisplayUrl(this.live.room, this.liveAccessKey);
      const shareData = { title: 'PicklePulse live score', text: `Watch secure room ${this.live.room}`, url };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch (error) {
          if (error && error.name === 'AbortError') return;
        }
      }
      await this.copyText(url, 'Secure display link copied');
    }

    async copyText(text, message = 'Copied') {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        this.showToast(message);
      } catch (_error) {
        window.prompt('Copy this link', text);
      }
    }

    addPlayer(name) {
      const clean = Players.cleanName(name);
      if (!clean) {
        this.showToast('Enter a player name');
        return null;
      }
      if (this.state.players.length >= Players.MAX_PLAYERS) {
        this.showToast(`Player limit reached (${Players.MAX_PLAYERS})`);
        return null;
      }
      if (this.state.players.some((player) => Players.nameKey(player.name) === Players.nameKey(clean))) {
        this.showToast('Player already exists');
        return null;
      }
      const player = Players.normalizePlayer({ id: Players.makeId(), name: clean });
      this.state.players.push(player);
      this.state.players = Players.normalizePlayers(this.state.players);
      this.persist();
      this.render();
      return player;
    }

    onSubmit(event) {
      const form = event.target.closest('form');
      if (!form) return;

      if (form.id === 'add-player-form' || form.id === 'quick-add-player-form') {
        event.preventDefault();
        const data = new FormData(form);
        const player = this.addPlayer(data.get('playerName'));
        if (player) this.showToast(`${player.name} added`);
        return;
      }

      if (form.id === 'join-room-form') {
        event.preventDefault();
        const data = new FormData(form);
        const access = parseLiveAccess(data.get('room'));
        if (!access.valid) {
          this.showToast('Paste the secure link or room.access code');
          return;
        }
        this.allowPageLeave = true;
        location.href = liveDisplayUrl(access.room, access.accessKey);
        return;
      }

      if (form.id === 'timer-adjust-form') {
        event.preventDefault();
        if (!this.state.currentGame) return;
        const data = new FormData(form);
        const minutes = Math.max(0, Math.min(180, Number(data.get('minutes')) || 0));
        const seconds = Math.max(0, Math.min(59, Number(data.get('seconds')) || 0));
        const remainingMs = (minutes * 60 + seconds) * 1000;
        this.showTimerAdjust = false;
        this.setCurrentGame(Engine.setRemainingMs(this.state.currentGame, remainingMs, Date.now()), true, false);
        this.showToast('Time set');
        return;
      }

      if (form.id !== 'new-game-form') return;
      event.preventDefault();
      const data = new FormData(form);
      const format = data.get('format') === 'singles' ? 'singles' : 'doubles';
      const ids = format === 'doubles'
        ? [data.get('teamAPlayer1'), data.get('teamAPlayer2'), data.get('teamBPlayer1'), data.get('teamBPlayer2')]
        : [data.get('teamAPlayer1'), data.get('teamBPlayer1')];
      const selectedIds = ids.map(String).filter(Boolean);
      if (selectedIds.length !== (format === 'doubles' ? 4 : 2)) {
        this.showToast('Select every player');
        return;
      }
      if (new Set(selectedIds).size !== selectedIds.length) {
        this.showToast('Each player can only be selected once');
        return;
      }
      const selected = selectedIds.map((id) => this.playerById(id));
      if (selected.some((player) => !player)) {
        this.showToast('A selected player is missing');
        return;
      }
      if (this.state.currentGame && this.state.currentGame.status === 'active') {
        this.state.games.unshift(Engine.snapshotForSave(this.state.currentGame, Date.now()));
        this.state.games = this.state.games.slice(0, MAX_SAVED_GAMES);
        this.state.queue = Players.finishQueuedGame(
          this.state.queue,
          this.state.currentGame.id,
          this.state.players
        );
      }
      const game = Engine.createGame({
        format,
        target: Number(data.get('target')),
        teamAName: '',
        teamAPlayer1: this.playerName(data.get('teamAPlayer1')),
        teamAPlayer1Id: data.get('teamAPlayer1'),
        teamAPlayer2: this.playerName(data.get('teamAPlayer2')),
        teamAPlayer2Id: data.get('teamAPlayer2'),
        teamBName: '',
        teamBPlayer1: this.playerName(data.get('teamBPlayer1')),
        teamBPlayer1Id: data.get('teamBPlayer1'),
        teamBPlayer2: this.playerName(data.get('teamBPlayer2')),
        teamBPlayer2Id: data.get('teamBPlayer2'),
        startingTeam: Number(data.get('startingTeam')),
        durationMinutes: Number(data.get('durationMinutes')) || 15
      });
      this.state.queue = Players.startQueuedGame(this.state.queue, selectedIds, game.id, this.state.players);
      this.view = 'game';
      this.allowPageLeave = false;
      this.setCurrentGame(game, true, false);
      this.lastVoiceSignature = '';
      this.announceGame(game, true);
    }

    onChange(event) {
      if (event.target.dataset && event.target.dataset.colorKey) {
        const key = event.target.dataset.colorKey;
        if (key === 'teamA' || key === 'teamB') {
          this.state.appearance = { ...normalizeAppearance(this.state.appearance), [key]: normalizeHex(event.target.value) };
          this.persist();
          if (this.liveController) this.liveController.broadcast();
          this.render();
        }
        return;
      }
      if (event.target.id === 'score-high-contrast') {
        this.state.appearance = { ...normalizeAppearance(this.state.appearance), highContrast: Boolean(event.target.checked) };
        this.persist();
        if (this.liveController) this.liveController.broadcast();
        this.render();
        return;
      }
      if (event.target.name === 'format') {
        const doubles = event.target.value === 'doubles';
        this.querySelectorAll('.doubles-only').forEach((element) => { element.hidden = !doubles; });
      }
      if (event.target.id === 'import-file' && event.target.files && event.target.files[0]) {
        this.importJson(event.target.files[0]);
      }
    }

    async onClick(event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'view') {
        const nextView = target.dataset.view;
        if (this.state.currentGame && this.state.currentGame.status === 'active' && nextView !== 'game') {
          this.pendingView = nextView;
          this.showLeaveWarning = true;
          this.render();
          return;
        }
        this.view = nextView;
        this.render();
        return;
      }
      if (action === 'stay-scoring') {
        this.showLeaveWarning = false;
        this.pendingView = '';
        this.view = 'game';
        this.render();
        return;
      }
      if (action === 'open-protected-view') {
        this.showLeaveWarning = false;
        this.view = this.pendingView || 'game';
        this.pendingView = '';
        this.render();
        return;
      }
      if (action === 'leave-page-anyway') {
        this.allowPageLeave = true;
        this.showLeaveWarning = false;
        if (globalThis.history && history.go) history.go(-2);
        return;
      }
      if (action === 'toggle-colors') {
        this.showColors = !this.showColors;
        if (this.showColors) this.showTimerAdjust = false;
        this.render();
        return;
      }
      if (action === 'close-colors') {
        this.showColors = false;
        this.render();
        return;
      }
      if (action === 'color-preset') {
        const preset = COLOR_PRESETS.find((item) => item.id === target.dataset.preset);
        if (!preset) return;
        this.state.appearance = normalizeAppearance(preset);
        this.persist();
        if (this.liveController) this.liveController.broadcast();
        this.render();
        return;
      }
      if (action === 'reset-colors') {
        this.state.appearance = normalizeAppearance(DEFAULT_APPEARANCE);
        this.persist();
        if (this.liveController) this.liveController.broadcast();
        this.render();
        return;
      }
      if (action === 'toggle-time-adjust') {
        if (!this.state.currentGame || this.state.currentGame.status === 'complete') return;
        this.showTimerAdjust = !this.showTimerAdjust;
        if (this.showTimerAdjust) this.showColors = false;
        this.render();
        return;
      }
      if (action === 'close-time-adjust') {
        this.showTimerAdjust = false;
        this.render();
        return;
      }
      if (action === 'adjust-time') {
        if (!this.state.currentGame) return;
        const deltaMs = Number(target.dataset.ms) || 0;
        this.setCurrentGame(Engine.adjustTimer(this.state.currentGame, deltaMs, Date.now()), true, false);
        return;
      }
      if (action === 'rally') {
        if (!this.state.currentGame) return;
        this.setCurrentGame(Engine.recordRally(this.state.currentGame, Number(target.dataset.team), Date.now()));
        return;
      }
      if (action === 'undo') {
        if (!this.state.currentGame) return;
        this.setCurrentGame(Engine.undoLastRally(this.state.currentGame, Date.now()));
        return;
      }
      if (action === 'toggle-timer') {
        const game = this.state.currentGame;
        if (!game) return;
        this.setCurrentGame(game.timer.running ? Engine.pauseTimer(game, Date.now()) : Engine.startTimer(game, Date.now()), true, false);
        return;
      }
      if (action === 'reset-timer') {
        if (!this.state.currentGame) return;
        this.setCurrentGame(Engine.resetTimer(this.state.currentGame, Date.now()), true, false);
        return;
      }
      if (action === 'toggle-voice') {
        if (this.mode === 'display') {
          this.displayVoiceEnabled = !this.displayVoiceEnabled;
          this.render();
          if (this.displayVoiceEnabled) this.announceGame(this.remoteGame, true, true);
        } else {
          this.state.settings.voiceEnabled = !this.state.settings.voiceEnabled;
          this.persist();
          this.render();
          if (this.state.settings.voiceEnabled) this.announceGame(this.state.currentGame, true);
          else if (globalThis.speechSynthesis) speechSynthesis.cancel();
        }
        return;
      }
      if (action === 'save') {
        if (!this.state.currentGame) return;
        this.state.games.unshift(Engine.snapshotForSave(this.state.currentGame, Date.now()));
        this.state.games = this.state.games.slice(0, MAX_SAVED_GAMES);
        this.persist();
        this.showToast('Saved');
        return;
      }
      if (action === 'end') {
        if (!this.state.currentGame) return;
        this.setCurrentGame(Engine.endGame(this.state.currentGame, Date.now()));
        return;
      }
      if (action === 'new') {
        this.view = 'setup';
        this.render();
        return;
      }
      if (action === 'live') {
        if (this.liveController) this.stopLive();
        else await this.startLive(this.state.liveRoom);
        return;
      }
      if (action === 'share') {
        await this.shareLive();
        return;
      }
      if (action === 'copy-room') {
        await this.copyText(`${this.live.room}.${this.liveAccessKey}`, 'Secure room code copied');
        return;
      }
      if (action === 'copy-link') {
        await this.copyText(liveDisplayUrl(this.live.room, this.liveAccessKey), 'Secure display link copied');
        return;
      }
      if (action === 'queue-add') {
        this.state.queue = Players.addToQueue(this.state.queue, target.dataset.player, this.state.players);
        this.persist();
        this.render();
        return;
      }
      if (action === 'queue-remove') {
        this.state.queue = Players.removeFromQueue(this.state.queue, target.dataset.player, this.state.players);
        this.persist();
        this.render();
        return;
      }
      if (action === 'queue-up' || action === 'queue-down') {
        this.state.queue = Players.moveInQueue(this.state.queue, target.dataset.player, action === 'queue-up' ? -1 : 1, this.state.players);
        this.persist();
        this.render();
        return;
      }
      if (action === 'prepare-next') {
        this.state.queue = Players.prepareNextFour(this.state.queue, this.state.players);
        if (this.state.queue.pending.length < 4) {
          this.showToast('Add at least four players to the queue');
          return;
        }
        this.persist();
        this.view = 'setup';
        this.render();
        return;
      }
      if (action === 'cancel-pending') {
        this.state.queue = Players.cancelPending(this.state.queue, this.state.players);
        this.persist();
        this.render();
        return;
      }
      if (action === 'delete-player') {
        const player = this.playerById(target.dataset.player);
        if (!player) return;
        if (confirm(`Remove ${player.name} from the local player list? Saved games will keep their name.`)) {
          this.state.players = this.state.players.filter((item) => item.id !== player.id);
          this.state.queue = Players.removePlayerEverywhere(this.state.queue, player.id, this.state.players);
          this.persist();
          this.render();
        }
        return;
      }
      if (action === 'export') {
        this.exportJson();
        return;
      }
      if (action === 'import') {
        const input = this.querySelector('#import-file');
        if (input) input.click();
        return;
      }
      if (action === 'delete-save') {
        this.state.games.splice(Number(target.dataset.index), 1);
        this.persist();
        this.render();
        return;
      }
      if (action === 'load-save') {
        const saved = this.state.games[Number(target.dataset.index)];
        if (!saved) return;
        const clone = JSON.parse(JSON.stringify(saved));
        clone.status = clone.status || 'active';
        this.view = 'game';
        this.setCurrentGame(clone, true, false);
        return;
      }
      if (action === 'clear-history') {
        if (confirm('Delete all saved games?')) {
          this.state.games = [];
          this.persist();
          this.render();
        }
        return;
      }
      if (action === 'toggle-fullscreen') {
        await this.toggleFullscreen();
        return;
      }
      if (action === 'leave-display') {
        this.clearLiveSecret();
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        this.allowPageLeave = true;
        location.href = url.toString();
      }
    }

    exportJson() {
      const payload = {
        app: 'PicklePulse',
        schemaVersion: Players.ROOT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        players: this.state.players,
        queue: this.state.queue,
        currentGame: this.state.currentGame,
        games: this.state.games,
        appearance: normalizeAppearance(this.state.appearance),
        settings: normalizeSettings(this.state.settings)
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `picklepulse-${filenameDate()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.showToast('Backup exported');
    }

    async importJson(file) {
      const previousState = JSON.parse(JSON.stringify(this.state));
      try {
        if (!file || Number(file.size) > MAX_IMPORT_BYTES) throw new Error('Backup is too large. Maximum size is 5 MB.');
        const text = await file.text();
        if (text.length > MAX_IMPORT_BYTES) throw new Error('Backup is too large. Maximum size is 5 MB.');
        const payload = JSON.parse(text);
        if (!payload || typeof payload !== 'object') throw new Error('The JSON backup has an invalid structure.');

        const currentByName = new Map(this.state.players.map((player) => [Players.nameKey(player.name), player]));
        const usedIds = new Set(this.state.players.map((player) => player.id));
        const idMap = new Map();
        const importedPlayers = Players.normalizePlayers(payload.players);
        importedPlayers.forEach((player) => {
          const existing = currentByName.get(Players.nameKey(player.name));
          if (existing) {
            idMap.set(player.id, existing.id);
            return;
          }
          if (usedIds.size >= Players.MAX_PLAYERS) return;
          const next = Players.normalizePlayer({ ...player, id: usedIds.has(player.id) ? Players.makeId() : player.id });
          if (!next) return;
          usedIds.add(next.id);
          idMap.set(player.id, next.id);
          this.state.players.push(next);
          currentByName.set(Players.nameKey(next.name), next);
        });
        this.state.players = Players.normalizePlayers(this.state.players);

        const rawGames = Array.isArray(payload.games) ? payload.games : Array.isArray(payload) ? payload : [];
        const importedGames = rawGames.length ? Engine.validateImport({ games: rawGames }) : [];
        importedGames.forEach((game) => {
          game.teams.forEach((team) => {
            team.playerIds = (team.playerIds || []).map((id, index) => {
              if (idMap.has(id)) return idMap.get(id);
              const name = team.players && team.players[index];
              const player = currentByName.get(Players.nameKey(name));
              return player ? player.id : Players.cleanId(id);
            });
          });
        });
        const existingSnapshots = new Set(this.state.games.map((game) => String(game.snapshotId || `${game.id}|${game.savedAt || game.updatedAt}`)));
        importedGames.reverse().forEach((game) => {
          const key = String(game.snapshotId || `${game.id}|${game.savedAt || game.updatedAt}`);
          if (!existingSnapshots.has(key) && this.state.games.length < MAX_SAVED_GAMES) {
            this.state.games.unshift(game);
            existingSnapshots.add(key);
          }
        });
        this.state.games = this.state.games.slice(0, MAX_SAVED_GAMES);

        if (payload.queue) {
          const importedQueue = {
            ...payload.queue,
            waiting: (Array.isArray(payload.queue.waiting) ? payload.queue.waiting : []).map((id) => idMap.get(String(id)) || Players.cleanId(id)),
            pending: [], onCourt: [], activeGameId: ''
          };
          const normalized = Players.normalizeQueue(importedQueue, this.state.players);
          normalized.waiting.forEach((id) => {
            this.state.queue = Players.addToQueue(this.state.queue, id, this.state.players);
          });
        }
        if (!this.state.currentGame && payload.currentGame) {
          const importedCurrent = Engine.normalizeGame(payload.currentGame);
          importedCurrent.teams.forEach((team) => {
            team.playerIds = (team.playerIds || []).map((id, index) => {
              if (idMap.has(id)) return idMap.get(id);
              const player = currentByName.get(Players.nameKey(team.players && team.players[index]));
              return player ? player.id : Players.cleanId(id);
            });
          });
          this.state.currentGame = importedCurrent;
        }
        if (payload.appearance) this.state.appearance = normalizeAppearance(payload.appearance);
        if (payload.settings) this.state.settings = normalizeSettings(payload.settings);
        if (!this.persist()) throw new Error('Backup could not be saved locally.');
        this.view = 'history';
        this.showToast(`${importedGames.length} games · ${importedPlayers.length} players reviewed`);
      } catch (error) {
        this.state = previousState;
        this._playerMapSource = null;
        this.showToast(error.message || 'Import failed');
      }
    }

    render() {
      if (this.mode === 'display') {
        this.innerHTML = this.renderDisplay();
        return;
      }
      const appearance = normalizeAppearance(this.state.appearance);
      this.innerHTML = `
        <div class="app-shell ${appearance.highContrast ? 'score-contrast' : ''}" style="${appearanceStyle(appearance)}">
          ${this.renderHeader()}
          ${this.showColors ? this.renderColorPanel() : ''}
          ${this.showTimerAdjust ? this.renderTimeAdjustPanel() : ''}
          ${this.showLeaveWarning ? this.renderLeaveWarning() : ''}
          <main class="main-content">
            ${this.view === 'setup' ? this.renderSetup() : this.view === 'history' ? this.renderHistory() : this.view === 'players' ? this.renderPlayers() : this.renderGame()}
          </main>
          ${this.toast ? `<div class="toast" role="status">${escapeHtml(this.toast)}</div>` : ''}
          <input id="import-file" type="file" accept="application/json,.json" hidden />
        </div>
      `;
    }

    renderHeader() {
      const game = this.state.currentGame;
      const liveActive = ['starting', 'live', 'reconnecting'].includes(this.live.phase);
      return `
        <header class="topbar">
          <button class="brand" type="button" data-action="view" data-view="${game ? 'game' : 'setup'}" aria-label="Open scoreboard">
            <span class="brand-mark">${icon('ball')}</span><span>PicklePulse</span>
          </button>
          <div class="top-actions">
            <span class="network-dot ${this.network.level}" title="${escapeHtml(this.network.label)}">${icon(this.network.level === 'offline' ? 'wifiOff' : 'wifi')}</span>
            ${game ? `<button class="icon-btn ${liveActive ? 'is-live' : ''}" type="button" data-action="live" aria-label="${liveActive ? 'Stop live display' : 'Start live display'}" title="${liveActive ? 'Stop live' : 'Go live'}">${icon(liveActive ? 'x' : 'radio')}</button>` : ''}
            <button class="icon-btn ${this.showColors ? 'active' : ''}" type="button" data-action="toggle-colors" aria-label="Score colors" title="Score colors">${icon('palette')}</button>
            <button class="icon-btn ${this.view === 'players' ? 'active' : ''}" type="button" data-action="view" data-view="players" aria-label="Players and queue" title="Players and queue">${icon('users')}</button>
            <button class="icon-btn ${this.view === 'history' ? 'active' : ''}" type="button" data-action="view" data-view="history" aria-label="Standings and saved games" title="Standings and saved games">${icon('history')}</button>
            <button class="icon-btn ${this.view === 'setup' ? 'active' : ''}" type="button" data-action="view" data-view="setup" aria-label="New game" title="New game">${icon('plus')}</button>
          </div>
        </header>
      `;
    }

    renderLeaveWarning() {
      const browserLeave = !this.pendingView;
      return `
        <div class="guard-scrim"></div>
        <section class="guard-dialog" role="alertdialog" aria-modal="true" aria-label="Active scoring warning">
          <span class="guard-icon">${icon('shield')}</span>
          <h2>Scoring is still active</h2>
          <p>${browserLeave ? 'Leaving or refreshing can interrupt the live room. Your local score is saved, and the same room code is restored after a refresh when possible.' : 'Opening another screen can lead to accidental scoring interruptions.'}</p>
          <div class="guard-actions">
            <button class="guard-primary" type="button" data-action="stay-scoring">Stay on scoreboard</button>
            <button class="guard-secondary" type="button" data-action="${browserLeave ? 'leave-page-anyway' : 'open-protected-view'}">${browserLeave ? 'Leave anyway' : 'Open anyway'}</button>
          </div>
        </section>
      `;
    }

    renderColorPanel() {
      const appearance = normalizeAppearance(this.state.appearance);
      const teamA = appearance.teamA || '#1e7350';
      const teamB = appearance.teamB || '#4e5f8d';
      return `
        <div class="color-scrim" data-action="close-colors"></div>
        <section class="color-panel" role="dialog" aria-modal="true" aria-label="Score colors">
          <header>
            <span>${icon('palette')}<b>Score colors</b></span>
            <button class="icon-btn compact" type="button" data-action="close-colors" aria-label="Close colors">${icon('x')}</button>
          </header>
          <div class="color-preview" aria-hidden="true">
            <span style="--preview:${teamA}">8</span><span style="--preview:${teamB}">7</span>
          </div>
          <div class="preset-row" aria-label="Color presets">
            ${COLOR_PRESETS.map((preset) => `<button class="preset-pair ${presetIsActive(preset, appearance) ? 'active' : ''}" type="button" data-action="color-preset" data-preset="${preset.id}" aria-label="${preset.label}" title="${preset.label}"><i style="--swatch:${preset.teamA}"></i><i style="--swatch:${preset.teamB}"></i></button>`).join('')}
          </div>
          <div class="color-inputs">
            <label><b>A</b><input type="color" value="${teamA}" data-color-key="teamA" aria-label="Team A score color"></label>
            <label><b>B</b><input type="color" value="${teamB}" data-color-key="teamB" aria-label="Team B score color"></label>
          </div>
          <label class="contrast-toggle"><span>${icon('fullscreen')}<b>High contrast</b></span><input id="score-high-contrast" type="checkbox" ${appearance.highContrast ? 'checked' : ''}></label>
          <button class="reset-colors" type="button" data-action="reset-colors">Reset</button>
        </section>
      `;
    }

    renderTimeAdjustPanel() {
      const game = this.state.currentGame;
      if (!game) return '';
      const remaining = Engine.getRemainingMs(game, Date.now());
      const totalSeconds = remaining === 0 ? 0 : Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const steps = [
        { label: '−5m', ms: -300000 },
        { label: '−1m', ms: -60000 },
        { label: '−10s', ms: -10000 },
        { label: '+10s', ms: 10000 },
        { label: '+1m', ms: 60000 },
        { label: '+5m', ms: 300000 }
      ];
      return `
        <div class="time-scrim" data-action="close-time-adjust"></div>
        <section class="time-panel" role="dialog" aria-modal="true" aria-label="Adjust timer">
          <header>
            <span>${icon('clockAdjust')}<b>Adjust time</b></span>
            <button class="icon-btn compact" type="button" data-action="close-time-adjust" aria-label="Close timer adjustment">${icon('x')}</button>
          </header>
          <time class="time-preview ${remaining <= 60000 ? 'timer-low' : ''}">${formatCountdown(remaining)}</time>
          <div class="time-step-grid" aria-label="Quick time adjustments">
            ${steps.map((step) => `<button type="button" data-action="adjust-time" data-ms="${step.ms}">${step.label}</button>`).join('')}
          </div>
          <form id="timer-adjust-form" class="time-exact-form">
            <label><span>Min</span><input name="minutes" type="number" min="0" max="180" step="1" inputmode="numeric" value="${minutes}" required></label>
            <i>:</i>
            <label><span>Sec</span><input name="seconds" type="number" min="0" max="59" step="1" inputmode="numeric" value="${String(seconds).padStart(2, '0')}" required></label>
            <button type="submit">Set</button>
          </form>
          <p>${game.timer.running ? 'Keeps running' : 'Stays paused'}</p>
        </section>
      `;
    }

    pendingSelections() {
      const pending = this.state.queue.pending;
      if (!Array.isArray(pending) || pending.length !== 4) return {};
      return {
        teamAPlayer1: pending[0],
        teamAPlayer2: pending[1],
        teamBPlayer1: pending[2],
        teamBPlayer2: pending[3]
      };
    }

    renderSetup() {
      const hasPlayers = this.state.players.length >= 2;
      const pending = this.state.queue.pending.length === 4;
      return `
        <section class="setup-view setup-stack">
          ${pending ? `
            <aside class="next-match-banner">
              <div><b>Next four loaded</b><span>${this.state.queue.pending.map((id) => escapeHtml(this.playerName(id))).join(' · ')}</span></div>
              <button type="button" data-action="cancel-pending">Cancel</button>
            </aside>
          ` : ''}
          ${hasPlayers ? this.renderNewGameForm() : this.renderRosterEmpty()}
          <form id="join-room-form" class="connect-card">
            <div><span class="connect-icon">${icon('shield')}</span><span><b>Watch a live game</b><small>Paste the secure link or room.access code.</small></span></div>
            <label><span class="sr-only">Secure live link or code</span><input name="room" maxlength="400" placeholder="ROOM.ACCESS KEY" autocomplete="off" required><button type="submit">Connect</button></label>
          </form>
        </section>
      `;
    }

    renderRosterEmpty() {
      return `
        <article class="roster-empty-card">
          <div class="empty-symbol">${icon('users')}</div>
          <h1>Add players first</h1>
          <p>Names stay on this device and become selectable for games, queues, and standings.</p>
          <form id="quick-add-player-form" class="add-player-form">
            <label><span class="sr-only">Player name</span><input name="playerName" maxlength="60" placeholder="Player name" autocomplete="off" required></label>
            <button type="submit">${icon('plus')} Add</button>
          </form>
          <button class="text-link" type="button" data-action="view" data-view="players">Manage players and queue</button>
        </article>
      `;
    }

    renderNewGameForm() {
      return `
        <form id="new-game-form" class="setup-card">
          <div class="setup-title-row">
            <div><h1>New game</h1><p>Select saved players for each starting position.</p></div>
            <button class="text-link" type="button" data-action="view" data-view="players">Players & queue</button>
          </div>
          <div class="format-switch" aria-label="Match format">
            <label><input type="radio" name="format" value="doubles" checked><span>2 × 2</span></label>
            <label><input type="radio" name="format" value="singles"><span>1 × 1</span></label>
          </div>
          <div class="teams-form">
            ${this.renderTeamFields('A')}
            ${this.renderTeamFields('B')}
          </div>
          <div class="setup-options">
            <label><span>To</span><select name="target"><option>11</option><option>15</option><option>21</option></select></label>
            <label><span>Serve</span><select name="startingTeam"><option value="0">A</option><option value="1">B</option></select></label>
            <label><span>Timer</span><select name="durationMinutes"><option value="10">10m</option><option value="15" selected>15m</option><option value="20">20m</option><option value="30">30m</option></select></label>
          </div>
          <button class="start-btn" type="submit">${icon('play')}<span>Start</span></button>
          <p class="microcopy">P1 starts right · side-out · win by 2</p>
        </form>
      `;
    }

    playerOptions(selectedId, placeholder) {
      return `<option value="">${escapeHtml(placeholder)}</option>${this.state.players.map((player) => `<option value="${escapeHtml(player.id)}" ${player.id === selectedId ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('')}`;
    }

    renderTeamFields(letter) {
      const selected = this.pendingSelections();
      const lower = letter.toLowerCase();
      return `
        <fieldset class="team-fields team-${lower}">
          <legend>${letter}</legend>
          <label><span>P1 · Right</span><select name="team${letter}Player1" required>${this.playerOptions(selected[`team${letter}Player1`], 'Select player')}</select></label>
          <label class="doubles-only"><span>P2 · Left</span><select name="team${letter}Player2">${this.playerOptions(selected[`team${letter}Player2`], 'Select player')}</select></label>
        </fieldset>
      `;
    }

    renderPlayers() {
      const queue = this.state.queue;
      const queued = new Set([...queue.waiting, ...queue.onCourt]);
      return `
        <section class="players-view">
          <div class="section-head">
            <div><h1>Players</h1><p>Saved locally on this browser.</p></div>
            <div>
              <button class="icon-btn" type="button" data-action="import" aria-label="Import backup" title="Import backup">${icon('upload')}</button>
              <button class="icon-btn" type="button" data-action="export" aria-label="Export backup" title="Export backup">${icon('download')}</button>
            </div>
          </div>
          <form id="add-player-form" class="add-player-form player-add-card">
            <label><span class="sr-only">Player name</span><input name="playerName" maxlength="60" placeholder="Add player name" autocomplete="off" required></label>
            <button type="submit">${icon('plus')} Add</button>
          </form>
          ${this.renderQueue()}
          <section class="roster-card">
            <header><h2>Roster</h2><span>${this.state.players.length}</span></header>
            ${this.state.players.length ? `<div class="roster-list">${this.state.players.map((player) => `
              <article class="roster-row">
                <span class="player-avatar">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</span>
                <b>${escapeHtml(player.name)}</b>
                <button class="queue-chip" type="button" data-action="queue-add" data-player="${escapeHtml(player.id)}" ${queued.has(player.id) ? 'disabled' : ''}>${queued.has(player.id) ? 'Queued' : '+ Queue'}</button>
                <button class="icon-btn danger compact" type="button" data-action="delete-player" data-player="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">${icon('trash')}</button>
              </article>
            `).join('')}</div>` : `<div class="empty-view compact"><p>No players yet</p></div>`}
          </section>
        </section>
      `;
    }

    renderQueue() {
      const queue = this.state.queue;
      return `
        <section class="queue-card">
          <header>
            <div><h2>Play queue</h2><p>FIFO · four on, four off</p></div>
            <button type="button" class="queue-next" data-action="prepare-next" ${queue.waiting.length >= 4 && !queue.onCourt.length ? '' : 'disabled'}>${icon('play')} Next 4</button>
          </header>
          ${queue.onCourt.length ? `<div class="on-court"><span>On court</span><b>${queue.onCourt.map((id) => escapeHtml(this.playerName(id))).join(' · ')}</b></div>` : ''}
          ${queue.pending.length === 4 ? `<div class="queue-ready"><span>Ready next</span><b>1 ${escapeHtml(this.playerName(queue.pending[0]))} + 2 ${escapeHtml(this.playerName(queue.pending[1]))} vs 3 ${escapeHtml(this.playerName(queue.pending[2]))} + 4 ${escapeHtml(this.playerName(queue.pending[3]))}</b><button type="button" data-action="view" data-view="setup">Set teams</button></div>` : ''}
          ${queue.waiting.length ? `<ol class="queue-list">${queue.waiting.map((id, index) => `
            <li class="${queue.pending.includes(id) ? 'is-pending' : ''}">
              <span class="queue-position">${index + 1}</span><b>${escapeHtml(this.playerName(id))}</b>
              <span class="queue-actions">
                <button type="button" data-action="queue-up" data-player="${escapeHtml(id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move up">${icon('arrowUp')}</button>
                <button type="button" data-action="queue-down" data-player="${escapeHtml(id)}" ${index === queue.waiting.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('arrowDown')}</button>
                <button type="button" data-action="queue-remove" data-player="${escapeHtml(id)}" aria-label="Remove from queue">${icon('x')}</button>
              </span>
            </li>
          `).join('')}</ol>` : `<div class="queue-empty"><p>Queue players from the roster below.</p></div>`}
          <p class="queue-note">Team mapping: 1 = A P1, 2 = A P2, 3 = B P1, 4 = B P2. After the game, all four return to the back automatically.</p>
        </section>
      `;
    }

    renderLiveBar() {
      if (this.live.phase === 'off') return '';
      const connected = this.live.phase === 'live';
      const status = this.live.phase === 'starting' ? 'Starting' : this.live.phase === 'reconnecting' ? 'Retrying' : this.live.phase === 'error' ? 'Error' : `${this.live.viewers}`;
      return `
        <aside class="live-bar ${connected ? 'connected' : ''}">
          <span class="pulse-dot"></span>
          <button type="button" class="room-code" data-action="copy-room" title="Copy room code">${escapeHtml(this.live.room || '—')}</button>
          <span class="viewer-count">${icon('users')}<b>${escapeHtml(status)}</b></span>
          <span class="live-spacer"></span>
          <button class="icon-btn compact" type="button" data-action="copy-link" aria-label="Copy display link" title="Copy link">${icon('copy')}</button>
          <button class="icon-btn compact" type="button" data-action="share" aria-label="Share display link" title="Share">${icon('share')}</button>
        </aside>
      `;
    }

    renderGame() {
      const game = this.state.currentGame;
      if (!game) return `<section class="empty-view"><div class="empty-symbol">${icon('ball')}</div><h1>No match</h1><button class="start-btn" data-action="view" data-view="setup">${icon('plus')}<span>New</span></button></section>`;
      const remaining = Engine.getRemainingMs(game, Date.now());
      const serve = Engine.serviceDetails(game);
      const voice = Boolean(this.state.settings.voiceEnabled);
      return `
        <section class="game-view">
          ${this.renderLiveBar()}
          <div class="scoring-protection">${icon('shield')}<span>Scoring protected · refresh/back warns first${this.state.liveRoom ? ` · room ${escapeHtml(this.state.liveRoom)}` : ''}</span></div>
          <div class="game-meta">
            <button class="timer-btn" type="button" data-action="toggle-timer" ${game.status === 'complete' ? 'disabled' : ''} aria-label="${game.timer.running ? 'Pause timer' : 'Start timer'}">
              ${icon(game.timer.running ? 'pause' : 'play')}<time data-role="match-clock" class="${remaining <= 60000 ? 'timer-low' : ''}">${formatCountdown(remaining)}</time>
            </button>
            <div class="serve-call ${game.status === 'complete' ? 'complete' : ''}">
              ${game.status === 'complete' ? icon('trophy') : '<span class="serve-pip"></span>'}
              <strong>${game.status === 'complete' ? 'Final' : escapeHtml(serve.playerName)}</strong>
              <span>${game.status === 'complete' ? `${escapeHtml(Number(game.teams[0].score) || 0)}–${escapeHtml(Number(game.teams[1].score) || 0)}` : `${escapeHtml(serve.side)} · ${escapeHtml(Engine.spokenScore(game))}`}</span>
            </div>
            <div class="timer-tools">
              <button class="icon-btn subtle ${voice ? 'active' : ''}" type="button" data-action="toggle-voice" aria-label="${voice ? 'Turn voice announcements off' : 'Turn voice announcements on'}" title="Voice announcements">${icon(voice ? 'speaker' : 'speakerOff')}</button>
              <button class="icon-btn subtle ${this.showTimerAdjust ? 'active' : ''}" type="button" data-action="toggle-time-adjust" ${game.status === 'complete' ? 'disabled' : ''} aria-label="Adjust timer" title="Adjust timer">${icon('clockAdjust')}</button>
              <button class="icon-btn subtle" type="button" data-action="reset-timer" ${game.status === 'complete' ? 'disabled' : ''} aria-label="Reset timer" title="Reset timer">${icon('reset')}</button>
            </div>
          </div>
          <div class="score-grid" aria-live="polite">
            ${this.renderScoreTeam(game, 0)}
            ${this.renderScoreTeam(game, 1)}
          </div>
          <nav class="game-toolbar" aria-label="Match actions">
            <button class="tool-btn" type="button" data-action="undo" ${game.rallies.length ? '' : 'disabled'}>${icon('undo')}<span>Undo</span></button>
            <button class="tool-btn" type="button" data-action="save">${icon('save')}<span>Save</span></button>
            <button class="tool-btn live-tool ${this.liveController ? 'active' : ''}" type="button" data-action="share">${icon('radio')}<span>${this.liveController ? this.live.room : 'Live'}</span></button>
            ${game.status === 'complete'
              ? `<button class="tool-btn" type="button" data-action="new">${icon('plus')}<span>New</span></button>`
              : `<button class="tool-btn" type="button" data-action="end">${icon('trophy')}<span>End</span></button>`}
          </nav>
        </section>
      `;
    }

    renderScoreTeam(game, index) {
      const team = game.teams[index];
      const serving = game.status === 'active' && game.servingTeam === index;
      const actionLabel = serving ? 'Point' : game.format === 'doubles' && game.serverNumber === 1 ? 'Server 2' : 'Serve';
      return `
        <button class="score-team team-${index === 0 ? 'a' : 'b'} ${serving ? 'serving' : ''}" type="button" data-action="rally" data-team="${index}" ${game.status === 'active' ? '' : 'disabled'} aria-label="${escapeHtml(teamTitle(team, index))} won rally">
          <span class="team-letter">${index === 0 ? 'A' : 'B'}${serving ? '<i></i>' : ''}</span>
          <strong class="team-name">${escapeHtml(teamTitle(team, index))}</strong>
          <span class="team-score">${escapeHtml(Number(team.score) || 0)}</span>
          <span class="score-action">${icon('plus')} ${actionLabel}</span>
        </button>
      `;
    }

    renderHistory() {
      const standings = Players.calculateStandings(this.state.games, this.state.players);
      return `
        <section class="history-view">
          <div class="section-head">
            <div><h1>Standings</h1><p>Calculated from the latest saved result for each game.</p></div>
            <div>
              <button class="icon-btn" type="button" data-action="import" aria-label="Import backup" title="Import backup">${icon('upload')}</button>
              <button class="icon-btn" type="button" data-action="export" aria-label="Export backup" title="Export backup">${icon('download')}</button>
            </div>
          </div>
          ${this.renderStandings(standings)}
          <div class="saved-section-head"><h2>Saved games</h2><button class="icon-btn danger compact" type="button" data-action="clear-history" ${this.state.games.length ? '' : 'disabled'} aria-label="Delete all saved games" title="Clear">${icon('trash')}</button></div>
          ${this.state.games.length ? `<div class="history-list">${this.state.games.map((game, index) => this.renderSaved(game, index)).join('')}</div>` : `<div class="empty-view compact"><div class="empty-symbol">${icon('history')}</div><p>Nothing saved</p></div>`}
        </section>
      `;
    }

    renderStandings(rows) {
      if (!rows.length) return `<div class="standings-empty"><p>Add players and save completed games to build local standings.</p></div>`;
      return `
        <div class="standings-card">
          <div class="standings-row standings-head"><span>#</span><b>Player</b><span>GP</span><span>W–L</span><span>Win%</span><span>+/−</span></div>
          ${rows.map((row, index) => `<div class="standings-row ${row.games ? '' : 'no-games'}"><span>${index + 1}</span><b>${escapeHtml(row.name)}</b><span>${row.games}</span><span>${row.wins}–${row.losses}</span><span>${Math.round(row.winPct * 100)}%</span><span>${row.pointDiff > 0 ? '+' : ''}${row.pointDiff}</span></div>`).join('')}
        </div>
      `;
    }

    renderSaved(game, index) {
      const a = game.teams && game.teams[0] ? game.teams[0] : { name: 'A', players: [], score: 0 };
      const b = game.teams && game.teams[1] ? game.teams[1] : { name: 'B', players: [], score: 0 };
      return `
        <article class="saved-row">
          <button class="saved-open" type="button" data-action="load-save" data-index="${index}">
            <span class="saved-date">${escapeHtml(formatDate(game.savedAt || game.updatedAt))}</span>
            <span class="saved-teams"><b>${escapeHtml(teamTitle(a, 0))}</b><strong>${Number(a.score) || 0}</strong><i>–</i><strong>${Number(b.score) || 0}</strong><b>${escapeHtml(teamTitle(b, 1))}</b></span>
            <span class="saved-meta">${escapeHtml(game.format || 'doubles')} · ${formatDuration(game.timer ? game.timer.elapsedMs : 0)}</span>
          </button>
          <button class="icon-btn danger compact" type="button" data-action="delete-save" data-index="${index}" aria-label="Delete saved game">${icon('trash')}</button>
        </article>
      `;
    }

    renderDisplay() {
      const game = this.remoteGame;
      const live = this.remoteStatus.phase === 'live';
      const fullscreen = this.isFullscreen();
      const statusLabel = live ? 'Live' : this.remoteStatus.phase === 'error' ? 'Error' : 'Connecting';
      const appearance = normalizeAppearance(game && game.appearance);
      return `
        <div class="display-shell ${game ? '' : 'waiting'} ${fullscreen ? 'is-fullscreen' : ''} ${appearance.highContrast ? 'score-contrast' : ''}" style="${appearanceStyle(appearance)}">
          <header class="display-topbar">
            <span class="display-brand">${icon('ball')}<b>PicklePulse</b></span>
            <span class="display-status ${live ? 'live' : ''}"><i></i>${escapeHtml(statusLabel)} · ${escapeHtml(this.watchRoom)}</span>
            <div class="display-actions">
              <button class="icon-btn ghost ${this.displayVoiceEnabled ? 'active' : ''}" type="button" data-action="toggle-voice" aria-label="${this.displayVoiceEnabled ? 'Turn voice announcements off' : 'Turn voice announcements on'}" title="Voice announcements">${icon(this.displayVoiceEnabled ? 'speaker' : 'speakerOff')}</button>
              <button class="icon-btn ghost fullscreen-btn" type="button" data-action="toggle-fullscreen" aria-label="${fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}" title="${fullscreen ? 'Exit fullscreen' : 'Fullscreen'}">${icon(fullscreen ? 'fullscreenExit' : 'fullscreen')}</button>
              <button class="icon-btn ghost leave-display" type="button" data-action="leave-display" aria-label="Exit display mode" title="Exit">${icon('x')}</button>
            </div>
          </header>
          ${game ? this.renderRemoteGame(game) : `
            <main class="display-wait">
              <div class="radar">${icon('radio')}</div>
              <h1>${escapeHtml(this.watchRoom)}</h1>
              <p>${escapeHtml(this.remoteStatus.detail || (this.remoteStatus.phase === 'error' ? 'Could not connect to the local live server' : 'Waiting for controller'))}</p>
            </main>
          `}
          ${this.toast ? `<div class="toast" role="status">${escapeHtml(this.toast)}</div>` : ''}
        </div>
      `;
    }

    renderRemoteGame(game) {
      const remaining = Engine.getRemainingMs(game, Date.now());
      const serve = Engine.serviceDetails(game);
      return `
        <main class="remote-scoreboard">
          <div class="remote-meta">
            <time data-role="match-clock" class="${remaining <= 60000 ? 'timer-low' : ''}">${formatCountdown(remaining)}</time>
            <div class="remote-call ${game.status === 'complete' ? 'complete' : ''}">
              <span class="remote-call-label">${game.status === 'complete' ? 'Result' : 'Current serving'}</span>
              <strong>${game.status === 'complete' ? 'FINAL' : escapeHtml(serve.playerName)}</strong>
              <span class="remote-call-detail">${game.status === 'complete' ? `${escapeHtml(Number(game.teams[0].score) || 0)}–${escapeHtml(Number(game.teams[1].score) || 0)}` : `${escapeHtml(Engine.spokenScore(game))} · ${escapeHtml(serve.side)} side`}</span>
            </div>
          </div>
          <div class="remote-grid">
            ${this.renderRemoteTeam(game, 0)}
            ${this.renderRemoteTeam(game, 1)}
          </div>
          <footer class="remote-footer">${escapeHtml(game.format)} · first to ${escapeHtml(Number(game.target) || 11)} · win by 2${this.remoteUpdatedAt ? ` · synced ${escapeHtml(formatDate(this.remoteUpdatedAt))}` : ''}</footer>
        </main>
      `;
    }

    renderRemoteTeam(game, index) {
      const team = game.teams[index];
      const serving = game.status === 'active' && game.servingTeam === index;
      return `
        <section class="remote-team team-${index === 0 ? 'a' : 'b'} ${serving ? 'serving' : ''}">
          <span class="remote-letter">${index === 0 ? 'A' : 'B'}${serving ? '<i></i>' : ''}</span>
          <h2>${escapeHtml(teamTitle(team, index))}</h2>
          <strong>${escapeHtml(Number(team.score) || 0)}</strong>
        </section>
      `;
    }
  }

  customElements.define('pickleball-app', PickleballApp);
})();
