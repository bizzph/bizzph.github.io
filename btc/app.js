(() => {
  "use strict";

  const API = "https://api.pro.coins.ph";
  const WS = "wss://wsapi.pro.coins.ph/openapi/quote/ws/v3";
  const QUOTE = "PHP";

  const PAIR_KEYS = ["crypto_php_pair_1_v2", "crypto_php_pair_2_v2"];
  const ALERT_PREFIX = "crypto_php_alert_";
  const SETTINGS_KEY = "crypto_php_general_settings_v1";
  const DEFAULT_ALERT_PERCENTAGES = [1.1, 0.6, 3];

  const REST_MS = 15000;
  const HIDDEN_REST_MS = 60000;
  const STALE_MS = 20000;
  const HIDDEN_STALE_MS = 60000;
  const TIMEOUT_MS = 10000;
  const MAX_RECONNECT_MS = 30000;

  const $ = id => document.getElementById(id);

  const timeEl = $("time");
  const alertPanel = $("alertPanel");
  const settingsPanel = $("settingsPanel");
  const panelBackdrop = $("panelBackdrop");
  const panelTitle = $("panelTitle");
  const aboveInput = $("aboveInput");
  const belowInput = $("belowInput");
  const repeatInput = $("repeatInput");
  const alertReferencePrice = $("alertReferencePrice");
  const percentageInputs = [$("percentageInput1"), $("percentageInput2"), $("percentageInput3")];

  let fallbackTimer = null;
  let timeTimer = null;
  let destroyed = false;
  let activeAlertSlot = null;
  let alertPercentages = [...DEFAULT_ALERT_PERCENTAGES];

  function blankAlert() {
    return {
      above: null,
      below: null,
      repeat: false,
      aboveTriggered: false,
      belowTriggered: false
    };
  }

  function makeSlot(index, defaultPair) {
    const n = index + 1;

    return {
      index,
      defaultPair,
      pair: defaultPair,
      base: baseFromPair(defaultPair),
      pairForm: $(`pairForm${n}`),
      pairInput: $(`pairInput${n}`),
      pairLabel: $(`pairLabel${n}`),
      priceEl: $(`price${n}`),
      rangeEl: $(`range${n}`),
      alertStatus: $(`alertStatus${n}`),
      alertBtn: $(`alertBtn${n}`),
      dot: $(`dot${n}`),
      socket: null,
      reconnectTimer: null,
      aborter: null,
      reconnects: 0,
      manualClose: false,
      lastUpdate: 0,
      currentPrice: null,
      previousPrice: null,
      shownPrice: "",
      shownRange: "",
      dotState: "",
      alertConfig: blankAlert()
    };
  }

  const slots = [
    makeSlot(0, "BTCPHP"),
    makeSlot(1, "ETHPHP")
  ];

  function pairFromInput(value, fallback = "BTCPHP") {
    const clean = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!clean) return fallback;
    return clean.endsWith(QUOTE) ? clean : `${clean}${QUOTE}`;
  }

  function baseFromPair(value) {
    return String(value || "BTCPHP").replace(new RegExp(`${QUOTE}$`), "") || "BTC";
  }

  function setDot(slot, state) {
    if (slot.dotState === state) return;
    slot.dotState = state;
    slot.dot.className = `dot ${state}`;
  }

  function updateTime() {
    timeEl.textContent = new Date().toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).toLowerCase();
  }

  function updateVisualViewport() {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    const offsetTop = viewport ? viewport.offsetTop : 0;

    document.documentElement.style.setProperty("--vvh", `${Math.max(120, height)}px`);
    document.documentElement.style.setProperty("--vvtop", `${Math.max(0, offsetTop)}px`);

    const panelInputFocused = document.activeElement?.matches(
      "#aboveInput, #belowInput, #percentageInput1, #percentageInput2, #percentageInput3"
    );

    if ((alertPanel.classList.contains("open") || settingsPanel.classList.contains("open")) && panelInputFocused) {
      requestAnimationFrame(() => document.activeElement.scrollIntoView({ block: "center", behavior: "smooth" }));
    }
  }

  function compact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--";

    if (Math.abs(n) >= 1000000) {
      return `${Number((n / 1000000).toFixed(2))}e`;
    }

    if (Math.abs(n) >= 1000) {
      return n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    return n.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  }

  function parsePercentage(value) {
    const n = Number(String(value ?? "").trim());
    return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
  }

  function formatPercentage(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return String(Number(n.toFixed(4)));
  }

  function formatPriceInput(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";

    const decimals = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 4 : 8;
    return String(Number(n.toFixed(decimals)));
  }

  function loadGeneralSettings() {
    alertPercentages = [...DEFAULT_ALERT_PERCENTAGES];

    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      const values = Array.isArray(saved?.alertPercentages) ? saved.alertPercentages : [];

      if (values.length === 3) {
        const parsed = values.map(parsePercentage);
        if (parsed.every(value => value !== null)) alertPercentages = parsed;
      }
    } catch (_) {}
  }

  function saveGeneralSettingsState() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ alertPercentages }));
    } catch (_) {}
  }

  function syncPercentageInputs() {
    percentageInputs.forEach((input, index) => {
      input.value = formatPercentage(alertPercentages[index]);
    });
  }

  function renderPercentageButtons() {
    document.querySelectorAll("[data-alert-percent]").forEach(button => {
      const index = Number(button.dataset.index);
      const direction = button.dataset.direction;
      const percentage = alertPercentages[index];
      const sign = direction === "below" ? "−" : "+";
      button.textContent = `${sign}${formatPercentage(percentage)}%`;
    });
  }

  function syncAlertQuickControls(slot) {
    const hasPrice = Number.isFinite(slot?.currentPrice) && slot.currentPrice > 0;
    alertReferencePrice.textContent = hasPrice ? compact(slot.currentPrice) : "price unavailable";

    document.querySelectorAll("[data-alert-percent]").forEach(button => {
      button.disabled = !hasPrice;
    });
  }

  function applyAlertPercentage(direction, index) {
    const slot = activeAlertSlot;
    if (!slot || !Number.isFinite(slot.currentPrice) || slot.currentPrice <= 0) return;

    const percentage = alertPercentages[index];
    if (!Number.isFinite(percentage)) return;

    const multiplier = direction === "below"
      ? 1 - (percentage / 100)
      : 1 + (percentage / 100);
    const targetPrice = slot.currentPrice * multiplier;
    const input = direction === "below" ? belowInput : aboveInput;

    input.value = formatPriceInput(targetPrice);
  }

  function normalize(payload, expectedPair) {
    let data = payload?.data || payload;

    if (Array.isArray(data)) {
      data = data.find(item =>
        String(item.symbol || item.s || "").toUpperCase() === expectedPair
      );
    }

    if (!data || typeof data !== "object") return null;

    return {
      symbol: String(data.symbol || data.s || expectedPair).toUpperCase(),
      last: data.lastPrice ?? data.c,
      high: data.highPrice ?? data.h,
      low: data.lowPrice ?? data.l
    };
  }

  function alertKey(slot) {
    return `${ALERT_PREFIX}${slot.pair}`;
  }

  function nullablePositive(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function loadAlert(slot) {
    slot.alertConfig = blankAlert();

    try {
      const saved = JSON.parse(localStorage.getItem(alertKey(slot)));
      if (!saved || typeof saved !== "object") return;

      slot.alertConfig.above = nullablePositive(saved.above);
      slot.alertConfig.below = nullablePositive(saved.below);
      slot.alertConfig.repeat = Boolean(saved.repeat);
      slot.alertConfig.aboveTriggered = Boolean(saved.aboveTriggered);
      slot.alertConfig.belowTriggered = Boolean(saved.belowTriggered);
    } catch (_) {}
  }

  function saveAlertState(slot) {
    try {
      localStorage.setItem(alertKey(slot), JSON.stringify(slot.alertConfig));
    } catch (_) {}
  }

  function syncAlertInputs(slot) {
    aboveInput.value = slot.alertConfig.above ?? "";
    belowInput.value = slot.alertConfig.below ?? "";
    repeatInput.checked = slot.alertConfig.repeat;
  }

  function renderAlertStatus(slot, message, triggered = false) {
    if (message) {
      slot.alertStatus.textContent = message;
      slot.alertStatus.classList.toggle("triggered", triggered);
      return;
    }

    const parts = [];

    if (slot.alertConfig.above !== null) parts.push(`above ${compact(slot.alertConfig.above)}`);
    if (slot.alertConfig.below !== null) parts.push(`below ${compact(slot.alertConfig.below)}`);
    if (parts.length && slot.alertConfig.repeat) parts.push("repeat");

    slot.alertStatus.textContent = parts.length ? `Alert: ${parts.join(" / ")}` : "";
    slot.alertStatus.classList.remove("triggered");
  }

  function notify(slot, message) {
    renderAlertStatus(slot, message, true);

    if ("vibrate" in navigator) {
      navigator.vibrate([250, 120, 250]);
    }

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`${slot.base}/${QUOTE} Alert`, { body: message });
    }
  }

  function checkAlert(slot, price, force = false) {
    if (!Number.isFinite(price)) return;

    const prev = Number.isFinite(slot.previousPrice) ? slot.previousPrice : null;
    let changed = false;

    if (slot.alertConfig.above !== null) {
      const crossed = force
        ? price >= slot.alertConfig.above
        : prev === null
          ? price >= slot.alertConfig.above
          : prev < slot.alertConfig.above && price >= slot.alertConfig.above;

      if (slot.alertConfig.repeat && price < slot.alertConfig.above && slot.alertConfig.aboveTriggered) {
        slot.alertConfig.aboveTriggered = false;
        changed = true;
      }

      if (!slot.alertConfig.aboveTriggered && crossed) {
        slot.alertConfig.aboveTriggered = true;
        changed = true;
        notify(slot, `${slot.base}/${QUOTE} went above ${compact(slot.alertConfig.above)}`);
      }
    }

    if (slot.alertConfig.below !== null) {
      const crossed = force
        ? price <= slot.alertConfig.below
        : prev === null
          ? price <= slot.alertConfig.below
          : prev > slot.alertConfig.below && price <= slot.alertConfig.below;

      if (slot.alertConfig.repeat && price > slot.alertConfig.below && slot.alertConfig.belowTriggered) {
        slot.alertConfig.belowTriggered = false;
        changed = true;
      }

      if (!slot.alertConfig.belowTriggered && crossed) {
        slot.alertConfig.belowTriggered = true;
        changed = true;
        notify(slot, `${slot.base}/${QUOTE} went below ${compact(slot.alertConfig.below)}`);
      }
    }

    if (changed) saveAlertState(slot);
  }

  function render(slot, payload, source) {
    const data = normalize(payload, slot.pair);
    if (!data) return;

    const price = Number(data.last);
    if (!Number.isFinite(price)) return;

    const nextPrice = compact(price);

    if (nextPrice !== slot.shownPrice) {
      slot.shownPrice = nextPrice;
      slot.priceEl.textContent = nextPrice;
    }

    const high = Number(data.high);
    const low = Number(data.low);

    if (Number.isFinite(high) && Number.isFinite(low)) {
      const nextRange = `H ${compact(high)} · L ${compact(low)}`;

      if (nextRange !== slot.shownRange) {
        slot.shownRange = nextRange;
        slot.rangeEl.textContent = nextRange;
      }
    }

    slot.currentPrice = price;
    if (activeAlertSlot === slot && alertPanel.classList.contains("open")) syncAlertQuickControls(slot);
    checkAlert(slot, price);
    slot.previousPrice = price;
    slot.lastUpdate = Date.now();

    setDot(slot, source === "ws" ? "live" : "warn");
  }

  function resetDisplay(slot) {
    slot.currentPrice = null;
    slot.previousPrice = null;
    slot.shownPrice = "";
    slot.shownRange = "";
    slot.lastUpdate = 0;

    slot.priceEl.textContent = "---";
    slot.rangeEl.textContent = "";
  }

  function applyPair(slot, nextPair) {
    slot.pair = pairFromInput(nextPair, slot.defaultPair);
    slot.base = baseFromPair(slot.pair);

    slot.pairInput.value = slot.base;
    slot.pairLabel.textContent = `${slot.base}/${QUOTE}`;

    try {
      localStorage.setItem(PAIR_KEYS[slot.index], slot.pair);
    } catch (_) {}

    resetDisplay(slot);
    loadAlert(slot);
    renderAlertStatus(slot);
    updateDocumentTitle();
  }

  function updateDocumentTitle() {
    document.title = `${slots[0].base}/${QUOTE} · ${slots[1].base}/${QUOTE}`;
  }

  function abortRest(slot) {
    if (!slot.aborter) return;
    slot.aborter.abort();
    slot.aborter = null;
  }

  async function fetchRest(slot) {
    abortRest(slot);

    const controller = new AbortController();
    slot.aborter = controller;
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const url = `${API}/openapi/quote/v1/ticker/24hr?symbol=${slot.pair}&_=${Date.now()}`;
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`REST ${response.status}`);

      const payload = await response.json();
      render(slot, payload, "rest");
    } finally {
      clearTimeout(timer);
      if (slot.aborter === controller) slot.aborter = null;
    }
  }

  function closeSocket(slot) {
    if (!slot.socket) return;

    slot.socket.onopen = null;
    slot.socket.onmessage = null;
    slot.socket.onerror = null;
    slot.socket.onclose = null;

    try {
      slot.socket.close();
    } catch (_) {}

    slot.socket = null;
  }

  function clearReconnect(slot) {
    clearTimeout(slot.reconnectTimer);
    slot.reconnectTimer = null;
  }

  function reconnectDelay(slot) {
    const baseDelay = Math.min(
      MAX_RECONNECT_MS,
      1000 * Math.pow(2, Math.min(slot.reconnects, 5))
    );

    return baseDelay + Math.floor(Math.random() * 1000);
  }

  function connectSocket(slot) {
    if (destroyed) return;

    if (
      slot.socket &&
      (slot.socket.readyState === WebSocket.OPEN || slot.socket.readyState === WebSocket.CONNECTING)
    ) return;

    clearReconnect(slot);
    closeSocket(slot);

    slot.manualClose = false;
    setDot(slot, "warn");

    try {
      slot.socket = new WebSocket(`${WS}/${slot.pair.toLowerCase()}@ticker`);
    } catch (_) {
      scheduleReconnect(slot);
      return;
    }

    slot.socket.onopen = () => {
      slot.reconnects = 0;
      setDot(slot, "live");
    };

    slot.socket.onmessage = event => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.pong || payload.result === null) return;
        render(slot, payload, "ws");
      } catch (_) {}
    };

    slot.socket.onerror = () => setDot(slot, "warn");

    slot.socket.onclose = () => {
      slot.socket = null;
      if (!slot.manualClose && !destroyed) scheduleReconnect(slot);
    };
  }

  function scheduleReconnect(slot) {
    if (destroyed) return;

    clearReconnect(slot);
    slot.reconnects += 1;
    setDot(slot, "dead");
    slot.reconnectTimer = setTimeout(() => connectSocket(slot), reconnectDelay(slot));
  }

  async function refreshSlot(slot) {
    slot.manualClose = true;
    slot.reconnects = 0;

    clearReconnect(slot);
    closeSocket(slot);
    abortRest(slot);

    try {
      await fetchRest(slot);
    } catch (error) {
      console.error(error);
      setDot(slot, "dead");
    }

    connectSocket(slot);
  }

  async function refreshAll() {
    await Promise.allSettled(slots.map(slot => refreshSlot(slot)));
  }

  function scheduleFallback() {
    clearTimeout(fallbackTimer);
    if (destroyed) return;

    const hidden = document.visibilityState === "hidden";
    const interval = hidden ? HIDDEN_REST_MS : REST_MS;
    const staleLimit = hidden ? HIDDEN_STALE_MS : STALE_MS;

    fallbackTimer = setTimeout(async () => {
      const staleSlots = slots.filter(slot => Date.now() - slot.lastUpdate > staleLimit);

      await Promise.allSettled(staleSlots.map(async slot => {
        try {
          await fetchRest(slot);
        } catch (error) {
          console.error(error);
          setDot(slot, "dead");
        }
      }));

      scheduleFallback();
    }, interval);
  }

  async function changePair(slot, value) {
    const nextPair = pairFromInput(value, slot.defaultPair);

    if (nextPair === slot.pair) {
      slot.pairInput.value = slot.base;
      return;
    }

    slot.manualClose = true;
    slot.reconnects = 0;

    clearReconnect(slot);
    closeSocket(slot);
    abortRest(slot);

    applyPair(slot, nextPair);
    setDot(slot, "warn");

    try {
      await fetchRest(slot);
      connectSocket(slot);
    } catch (error) {
      console.error(error);
      resetDisplay(slot);
      slot.pairLabel.textContent = "NO PRICE";
      slot.rangeEl.textContent = "Try BTC, ETH, XRP, SOL, DOGE";
      setDot(slot, "dead");
    }
  }

  function parsePrice(value) {
    const n = Number(String(value || "").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function openAlert(slot) {
    closeSettings();
    activeAlertSlot = slot;
    panelTitle.textContent = `${slot.base}/${QUOTE} Price Alert`;
    syncAlertInputs(slot);
    renderPercentageButtons();
    syncAlertQuickControls(slot);
    alertPanel.classList.add("open");
    panelBackdrop.classList.add("open");
    updateVisualViewport();
  }

  function closeAlert() {
    alertPanel.classList.remove("open");
    if (!settingsPanel.classList.contains("open")) panelBackdrop.classList.remove("open");
    activeAlertSlot = null;

    if (document.activeElement?.matches("#aboveInput, #belowInput")) {
      document.activeElement.blur();
    }
  }

  function openSettings() {
    closeAlert();
    syncPercentageInputs();
    settingsPanel.classList.add("open");
    panelBackdrop.classList.add("open");
    updateVisualViewport();
  }

  function closeSettings() {
    settingsPanel.classList.remove("open");
    if (!alertPanel.classList.contains("open")) panelBackdrop.classList.remove("open");

    if (document.activeElement?.matches("#percentageInput1, #percentageInput2, #percentageInput3")) {
      document.activeElement.blur();
    }
  }

  function saveSettings() {
    const next = percentageInputs.map(input => parsePercentage(input.value));
    const invalidIndex = next.findIndex(value => value === null);

    if (invalidIndex !== -1) {
      percentageInputs[invalidIndex].focus();
      return;
    }

    alertPercentages = next;
    saveGeneralSettingsState();
    renderPercentageButtons();
    closeSettings();
  }

  async function saveAlert() {
    const slot = activeAlertSlot;
    if (!slot) return;

    slot.alertConfig = {
      above: parsePrice(aboveInput.value),
      below: parsePrice(belowInput.value),
      repeat: repeatInput.checked,
      aboveTriggered: false,
      belowTriggered: false
    };

    saveAlertState(slot);
    renderAlertStatus(slot);

    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (_) {}
    }

    if (slot.currentPrice !== null) {
      checkAlert(slot, slot.currentPrice, true);
    }

    closeAlert();
  }

  function clearAlert() {
    const slot = activeAlertSlot;
    if (!slot) return;

    slot.alertConfig = blankAlert();

    try {
      localStorage.removeItem(alertKey(slot));
    } catch (_) {}

    syncAlertInputs(slot);
    renderAlertStatus(slot);
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (_) {}
  }

  function bindSlot(slot) {
    slot.pairForm.addEventListener("submit", event => {
      event.preventDefault();
      changePair(slot, slot.pairInput.value);
      slot.pairInput.blur();
    });

    slot.pairInput.addEventListener("input", () => {
      slot.pairInput.value = slot.pairInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    });

    slot.pairInput.addEventListener("change", () => changePair(slot, slot.pairInput.value));
    slot.alertBtn.addEventListener("click", () => openAlert(slot));
  }

  function bind() {
    slots.forEach(bindSlot);

    $("refreshBtn").addEventListener("click", refreshAll);
    $("settingsBtn").addEventListener("click", openSettings);
    $("fullscreenBtn").addEventListener("click", fullscreen);
    $("saveAlertBtn").addEventListener("click", saveAlert);
    $("clearAlertBtn").addEventListener("click", clearAlert);
    $("closeAlertBtn").addEventListener("click", closeAlert);
    $("panelCloseX").addEventListener("click", closeAlert);
    $("saveSettingsBtn").addEventListener("click", saveSettings);
    $("closeSettingsBtn").addEventListener("click", closeSettings);
    $("settingsCloseX").addEventListener("click", closeSettings);

    document.querySelectorAll("[data-alert-percent]").forEach(button => {
      button.addEventListener("click", () => {
        applyAlertPercentage(button.dataset.direction, Number(button.dataset.index));
      });
    });

    panelBackdrop.addEventListener("click", () => {
      if (alertPanel.classList.contains("open")) closeAlert();
      if (settingsPanel.classList.contains("open")) closeSettings();
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (alertPanel.classList.contains("open")) closeAlert();
      if (settingsPanel.classList.contains("open")) closeSettings();
    });

    [aboveInput, belowInput, ...percentageInputs].forEach(input => {
      input.addEventListener("focus", updateVisualViewport);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateVisualViewport);
      window.visualViewport.addEventListener("scroll", updateVisualViewport);
    }

    window.addEventListener("resize", updateVisualViewport);

    document.addEventListener("visibilitychange", () => {
      scheduleFallback();

      if (document.visibilityState === "visible") {
        updateTime();
        slots.forEach(slot => {
          fetchRest(slot).catch(error => {
            console.error(error);
            setDot(slot, "warn");
          });
          connectSocket(slot);
        });
      }
    });

    window.addEventListener("beforeunload", () => {
      destroyed = true;
      clearTimeout(fallbackTimer);
      clearInterval(timeTimer);

      slots.forEach(slot => {
        slot.manualClose = true;
        clearReconnect(slot);
        closeSocket(slot);
        abortRest(slot);
      });
    });
  }

  function start() {
    loadGeneralSettings();
    renderPercentageButtons();
    bind();

    slots.forEach(slot => {
      let savedPair = slot.defaultPair;

      try {
        savedPair = localStorage.getItem(PAIR_KEYS[slot.index]) || slot.defaultPair;
      } catch (_) {}

      applyPair(slot, savedPair);
    });

    updateVisualViewport();
    updateTime();
    timeTimer = setInterval(updateTime, 1000);

    slots.forEach(slot => {
      fetchRest(slot).catch(error => {
        console.error(error);
        setDot(slot, "warn");
      });
      connectSocket(slot);
    });

    scheduleFallback();
  }

  start();
})();
