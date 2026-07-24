(function bootstrapPicklePulse() {
  'use strict';

  const Engine = globalThis.PickleEngine;
  const Live = globalThis.PickleLive;
  const STORAGE_KEY = 'picklepulse-state-v1';

  const ICONS = {
    ball: '<circle cx="12" cy="12" r="8"/><path d="M7.2 6.5c3.1 1.9 6.4 5.2 8.3 8.4M16.8 6.5c-3.1 1.9-6.4 5.2-8.3 8.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
    play: '<path d="m9 7 8 5-8 5Z"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    reset: '<path d="M4 7v5h5"/><path d="M5.5 15a7 7 0 1 0 .5-7.5L4 12"/>',
    radio: '<path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7"/><circle cx="12" cy="12" r="1.5"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4"/>',
    copy: '<rect x="8" y="8" width="10" height="10" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4M12 7v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    save: '<path d="M5 4h12l2 2v14H5Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>',
    wifiOff: '<path d="m3 3 18 18M8.5 16a5 5 0 0 1 2.3-1.3M5 12.5a10 10 0 0 1 1.8-1.4M13.2 9.2a10 10 0 0 1 5.8 3.3M15.5 16a5 5 0 0 0-1.3-.8M12 20h.01"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0ZM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
    fullscreen: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    fullscreenExit: '<path d="M8 8H3V3M16 8h5V3M8 16H3v5M16 16h5v5"/>'
  };

  function icon(name, className = '') {
    return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.ball}</svg>`;
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
    const generic = !team.name || team.name === `Team ${index === 0 ? 'A' : 'B'}`;
    return generic ? team.players.join(' · ') : team.name;
  }

  function filenameDate() {
    return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  }

  class PickleballApp extends HTMLElement {
    constructor() {
      super();
      const params = new URLSearchParams(globalThis.location ? location.search : '');
      this.watchRoom = Live.normalizeRoom(params.get('watch'));
      this.mode = this.watchRoom ? 'display' : 'controller';
      this.state = this.loadState();
      this.view = this.state.currentGame ? 'game' : 'setup';
      this.network = this.readNetwork();
      this.toast = '';
      this.live = { phase: 'off', room: '', viewers: 0, detail: '' };
      this.liveController = null;
      this.remoteGame = null;
      this.remoteStatus = { phase: 'connecting', room: this.watchRoom, detail: '' };
      this.remoteUpdatedAt = null;
      this.viewer = null;
      this.boundClick = this.onClick.bind(this);
      this.boundSubmit = this.onSubmit.bind(this);
      this.boundChange = this.onChange.bind(this);
      this.boundNetwork = this.onNetworkChange.bind(this);
      this.boundFullscreen = this.onFullscreenChange.bind(this);
    }

    connectedCallback() {
      this.addEventListener('click', this.boundClick);
      this.addEventListener('submit', this.boundSubmit);
      this.addEventListener('change', this.boundChange);
      window.addEventListener('online', this.boundNetwork);
      window.addEventListener('offline', this.boundNetwork);
      document.addEventListener('fullscreenchange', this.boundFullscreen);
      document.addEventListener('webkitfullscreenchange', this.boundFullscreen);
      if (navigator.connection && navigator.connection.addEventListener) {
        navigator.connection.addEventListener('change', this.boundNetwork);
      }
      this.render();
      this.clock = window.setInterval(() => {
        const game = this.mode === 'display' ? this.remoteGame : this.state.currentGame;
        if (!game || !game.timer || !game.timer.running) return;
        const now = Date.now();
        if (this.mode === 'controller' && Engine.getRemainingMs(game, now) <= 0) {
          this.setCurrentGame(Engine.expireTimer(game, now));
          this.showToast('Time');
          return;
        }
        this.render();
      }, 1000);
      if (this.mode === 'display') this.startViewer();
      this.registerServiceWorker();
    }

    disconnectedCallback() {
      window.clearInterval(this.clock);
      window.removeEventListener('online', this.boundNetwork);
      window.removeEventListener('offline', this.boundNetwork);
      document.removeEventListener('fullscreenchange', this.boundFullscreen);
      document.removeEventListener('webkitfullscreenchange', this.boundFullscreen);
      if (navigator.connection && navigator.connection.removeEventListener) {
        navigator.connection.removeEventListener('change', this.boundNetwork);
      }
      if (this.liveController) this.liveController.stop();
      if (this.viewer) this.viewer.stop();
    }

    loadState() {
      const fallback = { schemaVersion: Engine.SCHEMA_VERSION, currentGame: null, games: [], lastSavedAt: null };
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!parsed || typeof parsed !== 'object') return fallback;
        return {
          schemaVersion: Engine.SCHEMA_VERSION,
          currentGame: parsed.currentGame ? Engine.normalizeGame(parsed.currentGame) : null,
          games: Array.isArray(parsed.games) ? parsed.games.map((game) => Engine.normalizeGame(game)) : [],
          lastSavedAt: parsed.lastSavedAt || null
        };
      } catch (_error) {
        return fallback;
      }
    }

    persist() {
      try {
        this.state.lastSavedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (error) {
        this.showToast(`Save failed: ${error.message}`);
      }
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

    registerServiceWorker() {
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
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

    setCurrentGame(game, broadcast = true) {
      const previous = this.state.currentGame;
      if (previous && previous.status === 'active' && game && game.status === 'complete') {
        this.state.games.unshift(Engine.snapshotForSave(game, Date.now()));
      }
      this.state.currentGame = game ? Engine.normalizeGame(game) : null;
      this.persist();
      if (broadcast && this.liveController) this.liveController.broadcast();
      this.render();
    }

    async startViewer() {
      if (!this.watchRoom) return;
      try {
        this.viewer = new Live.LiveViewer({
          room: this.watchRoom,
          onState: (game, sentAt) => {
            const receivedAt = Date.now();
            this.remoteGame = Live.adaptRemoteGame(game, sentAt, receivedAt);
            this.remoteUpdatedAt = receivedAt;
            this.render();
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

    async startLive() {
      if (!this.state.currentGame) {
        this.showToast('Start a match first');
        return false;
      }
      if (!navigator.onLine) {
        this.showToast('Internet is required for live mode');
        return false;
      }
      if (this.liveController) return true;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const room = Live.generateRoomCode();
        this.live = { phase: 'starting', room, viewers: 0, detail: '' };
        this.render();
        const controller = new Live.LiveController({
          room,
          getState: () => this.state.currentGame,
          onStatus: (status) => {
            this.live = status;
            this.render();
          }
        });
        try {
          await controller.start();
          this.liveController = controller;
          controller.broadcast();
          this.showToast(`Live · ${room}`);
          return true;
        } catch (error) {
          controller.stop();
          if (error && error.type === 'unavailable-id') continue;
          this.live = { phase: 'error', room, viewers: 0, detail: error.message || 'Unable to connect' };
          this.render();
          return false;
        }
      }
      this.showToast('Could not create a room');
      return false;
    }

    stopLive() {
      if (this.liveController) this.liveController.stop();
      this.liveController = null;
      this.live = { phase: 'off', room: '', viewers: 0, detail: '' };
      this.render();
    }

    async shareLive() {
      const started = await this.startLive();
      if (!started) return;
      const url = Live.displayUrl(this.live.room);
      const shareData = { title: 'PicklePulse live score', text: `Watch room ${this.live.room}`, url };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch (error) {
          if (error && error.name === 'AbortError') return;
        }
      }
      await this.copyText(url, 'Display link copied');
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

    onSubmit(event) {
      const form = event.target.closest('form');
      if (!form || form.id !== 'new-game-form') return;
      event.preventDefault();
      const data = new FormData(form);
      if (this.state.currentGame && this.state.currentGame.status === 'active') {
        this.state.games.unshift(Engine.snapshotForSave(this.state.currentGame, Date.now()));
      }
      const game = Engine.createGame({
        format: data.get('format'),
        target: Number(data.get('target')),
        teamAName: '',
        teamAPlayer1: data.get('teamAPlayer1'),
        teamAPlayer2: data.get('teamAPlayer2'),
        teamBName: '',
        teamBPlayer1: data.get('teamBPlayer1'),
        teamBPlayer2: data.get('teamBPlayer2'),
        startingTeam: Number(data.get('startingTeam')),
        durationMinutes: Number(data.get('durationMinutes')) || 15
      });
      this.view = 'game';
      this.setCurrentGame(game);
    }

    onChange(event) {
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
        this.view = target.dataset.view;
        this.render();
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
        this.setCurrentGame(game.timer.running ? Engine.pauseTimer(game, Date.now()) : Engine.startTimer(game, Date.now()));
        return;
      }
      if (action === 'reset-timer') {
        if (!this.state.currentGame) return;
        this.setCurrentGame(Engine.resetTimer(this.state.currentGame, Date.now()));
        return;
      }
      if (action === 'save') {
        if (!this.state.currentGame) return;
        this.state.games.unshift(Engine.snapshotForSave(this.state.currentGame, Date.now()));
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
        else await this.startLive();
        return;
      }
      if (action === 'share') {
        await this.shareLive();
        return;
      }
      if (action === 'copy-room') {
        await this.copyText(this.live.room, 'Room copied');
        return;
      }
      if (action === 'copy-link') {
        await this.copyText(Live.displayUrl(this.live.room), 'Display link copied');
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
        this.setCurrentGame(clone);
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
        const url = new URL(location.href);
        url.search = '';
        location.href = url.toString();
      }
    }

    exportJson() {
      const payload = {
        app: 'PicklePulse',
        schemaVersion: Engine.SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        games: this.state.games
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `picklepulse-${filenameDate()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.showToast('JSON exported');
    }

    async importJson(file) {
      try {
        const payload = JSON.parse(await file.text());
        const games = Engine.validateImport(payload);
        this.state.games = [...games, ...this.state.games];
        this.persist();
        this.view = 'history';
        this.showToast(`${games.length} imported`);
      } catch (error) {
        this.showToast(error.message || 'Import failed');
      }
    }

    render() {
      if (this.mode === 'display') {
        this.innerHTML = this.renderDisplay();
        return;
      }
      this.innerHTML = `
        <div class="app-shell">
          ${this.renderHeader()}
          <main class="main-content">
            ${this.view === 'setup' ? this.renderSetup() : this.view === 'history' ? this.renderHistory() : this.renderGame()}
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
            <button class="icon-btn ${this.view === 'history' ? 'active' : ''}" type="button" data-action="view" data-view="history" aria-label="Saved games" title="Saved games">${icon('history')}</button>
            <button class="icon-btn ${this.view === 'setup' ? 'active' : ''}" type="button" data-action="view" data-view="setup" aria-label="New game" title="New game">${icon('plus')}</button>
          </div>
        </header>
      `;
    }

    renderSetup() {
      return `
        <section class="setup-view">
          <form id="new-game-form" class="setup-card">
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
          </form>
          <p class="microcopy">P1 starts right · side-out · win by 2</p>
        </section>
      `;
    }

    renderTeamFields(letter) {
      return `
        <fieldset class="team-fields team-${letter.toLowerCase()}">
          <legend>${letter}</legend>
          <label><span class="sr-only">Team ${letter} right-side starter</span><input name="team${letter}Player1" placeholder="P1 · Right" required autocomplete="off"></label>
          <label class="doubles-only"><span class="sr-only">Team ${letter} left-side starter</span><input name="team${letter}Player2" placeholder="P2 · Left" autocomplete="off"></label>
        </fieldset>
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
      return `
        <section class="game-view">
          ${this.renderLiveBar()}
          <div class="game-meta">
            <button class="timer-btn" type="button" data-action="toggle-timer" ${game.status === 'complete' ? 'disabled' : ''} aria-label="${game.timer.running ? 'Pause timer' : 'Start timer'}">
              ${icon(game.timer.running ? 'pause' : 'play')}<time class="${remaining <= 60000 ? 'timer-low' : ''}">${formatCountdown(remaining)}</time>
            </button>
            <div class="serve-call ${game.status === 'complete' ? 'complete' : ''}">
              ${game.status === 'complete' ? icon('trophy') : '<span class="serve-pip"></span>'}
              <strong>${game.status === 'complete' ? 'Final' : escapeHtml(serve.playerName)}</strong>
              <span>${game.status === 'complete' ? `${game.teams[0].score}–${game.teams[1].score}` : `${escapeHtml(serve.side)} · ${escapeHtml(Engine.spokenScore(game))}`}</span>
            </div>
            <button class="icon-btn subtle" type="button" data-action="reset-timer" aria-label="Reset timer" title="Reset timer">${icon('reset')}</button>
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
          <span class="team-score">${team.score}</span>
          <span class="score-action">${icon('plus')} ${actionLabel}</span>
        </button>
      `;
    }

    renderHistory() {
      return `
        <section class="history-view">
          <div class="section-head">
            <h1>Saved</h1>
            <div>
              <button class="icon-btn" type="button" data-action="import" aria-label="Import JSON" title="Import JSON">${icon('upload')}</button>
              <button class="icon-btn" type="button" data-action="export" aria-label="Export JSON" title="Export JSON">${icon('download')}</button>
              <button class="icon-btn danger" type="button" data-action="clear-history" ${this.state.games.length ? '' : 'disabled'} aria-label="Delete all saved games" title="Clear">${icon('trash')}</button>
            </div>
          </div>
          ${this.state.games.length ? `<div class="history-list">${this.state.games.map((game, index) => this.renderSaved(game, index)).join('')}</div>` : `<div class="empty-view compact"><div class="empty-symbol">${icon('history')}</div><p>Nothing saved</p></div>`}
        </section>
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
      return `
        <div class="display-shell ${game ? '' : 'waiting'} ${fullscreen ? 'is-fullscreen' : ''}">
          <header class="display-topbar">
            <span class="display-brand">${icon('ball')}<b>PicklePulse</b></span>
            <span class="display-status ${live ? 'live' : ''}"><i></i>${escapeHtml(statusLabel)} · ${escapeHtml(this.watchRoom)}</span>
            <div class="display-actions">
              <button class="icon-btn ghost fullscreen-btn" type="button" data-action="toggle-fullscreen" aria-label="${fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}" title="${fullscreen ? 'Exit fullscreen' : 'Fullscreen'}">${icon(fullscreen ? 'fullscreenExit' : 'fullscreen')}</button>
              <button class="icon-btn ghost leave-display" type="button" data-action="leave-display" aria-label="Exit display mode" title="Exit">${icon('x')}</button>
            </div>
          </header>
          ${game ? this.renderRemoteGame(game) : `
            <main class="display-wait">
              <div class="radar">${icon('radio')}</div>
              <h1>${escapeHtml(this.watchRoom)}</h1>
              <p>${this.remoteStatus.phase === 'error' ? 'Could not load PeerJS' : 'Waiting for controller'}</p>
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
            <time class="${remaining <= 60000 ? 'timer-low' : ''}">${formatCountdown(remaining)}</time>
            <div class="remote-call">
              ${game.status === 'complete' ? icon('trophy') : '<span class="serve-pip"></span>'}
              <strong>${game.status === 'complete' ? 'Final' : escapeHtml(serve.playerName)}</strong>
              <span>${game.status === 'complete' ? `${game.teams[0].score}–${game.teams[1].score}` : `${escapeHtml(serve.side)} · ${escapeHtml(Engine.spokenScore(game))}`}</span>
            </div>
          </div>
          <div class="remote-grid">
            ${this.renderRemoteTeam(game, 0)}
            ${this.renderRemoteTeam(game, 1)}
          </div>
          <footer class="remote-footer">${game.format} · first to ${game.target} · win by 2${this.remoteUpdatedAt ? ` · synced ${escapeHtml(formatDate(this.remoteUpdatedAt))}` : ''}</footer>
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
          <strong>${team.score}</strong>
        </section>
      `;
    }
  }

  customElements.define('pickleball-app', PickleballApp);
})();
