'use strict';

const DB_NAME = 'trade-vault-db';
const DB_VERSION = 1;
const LEGACY_RECORD_AAD = new TextEncoder().encode('trade-vault-record-v1');
const RECORD_AAD_PREFIX = 'trade-vault-record-v2:';
const VERIFY_AAD = new TextEncoder().encode('trade-vault-verifier-v1');
const VERIFY_TEXT = 'trade-vault-ok-v1';
const PBKDF2_ITERATIONS = 600000;
const SCALE_DIGITS = 18;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
const DEFAULT_AUTO_LOCK_MINUTES = 5;
const MIN_AUTO_LOCK_MINUTES = 1;
const MAX_AUTO_LOCK_MINUTES = 120;
const PIN_ITERATIONS = 600000;
const PIN_WRAP_AAD = new TextEncoder().encode('trade-vault-pin-wrap-v1');
const MAX_NOTES_LENGTH = 2000;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const MAX_BACKUP_RECORDS = 100000;
const MAX_RECORD_CIPHER_BYTES = 256 * 1024;
const MAX_RECEIPT_TEXT_LENGTH = 100000;
const MIN_ACCEPTED_KDF_ITERATIONS = 1;
const MAX_ACCEPTED_KDF_ITERATIONS = 2000000;
const PURPOSE_LABELS = { TRADE: 'Trading', HOLD: 'Long-term' };
const DEFAULT_BUY_FEE_RATE_PERCENT_TEXT = '0.1';
const DEFAULT_SELL_FEE_RATE_PERCENT_TEXT = '0.1';
const MARKET_WS_RAW_BASE = 'wss://wsapi.pro.coins.ph/openapi/quote/ws/v3/';
const MARKET_RECONNECT_BASE_MS = 1000;
const MARKET_MAX_RECONNECT_MS = 30000;
const MARKET_RENDER_THROTTLE_MS = 350;
const MARKET_WATCHDOG_INTERVAL_MS = 5000;
const MARKET_STALE_AFTER_MS = 20000;
const MARKET_INITIAL_QUOTE_TIMEOUT_MS = 10000;
const MARKET_PING_INTERVAL_MS = 4 * 60 * 1000;
const THEME_STORAGE_KEY = 'trade-vault-theme';
const THEME_COLORS = { dark: '#080b12', light: '#f5f7fa' };
const APP_BUILD = '2026.09.13.4';
const BUILD_RELOAD_KEY = `trade-vault-build-reload:${APP_BUILD}`;

let db;
let vaultKey = null;
let transactions = [];
let analyticsCache = null;
let deferredInstallPrompt = null;
let idleTimer = null;
let hiddenAt = 0;
let editingRecordKey = null;
let selectedRecordKeys = new Set();
let expandedRecordKeys = new Set();
let expandedHoldingKeys = new Set();
let holdingsPurpose = 'TRADE';
let overviewPurpose = 'TRADE';
let feeRatePercentBySide = { BUY: DEFAULT_BUY_FEE_RATE_PERCENT_TEXT, SELL: DEFAULT_SELL_FEE_RATE_PERCENT_TEXT };
let autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
let pinConfigured = false;
let unlockDebounceTimer = null;
let unlockInFlight = false;
let livePricingEnabled = false;
let marketPrices = new Map();
let marketConnections = new Map();
let marketSyncGeneration = 0;
let marketWatchdogTimer = null;
let marketRenderTimer = null;
let marketLastMessageAt = 0;
let marketStatusText = 'Live pricing off';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const VIEW_TITLES = { overview: 'Overview', holdings: 'Holdings', ledger: 'Ledger' };

function initialTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme, persist = false) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next]);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', next === 'dark' ? 'black-translucent' : 'default');
  for (const id of ['themeToggleBtn', 'gateThemeBtn']) {
    const button = $(id);
    if (!button) continue;
    const target = next === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${target} theme`);
    button.title = `Switch to ${target} theme`;
    button.querySelector('use')?.setAttribute('href', next === 'dark' ? '#i-sun' : '#i-moon');
  }
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
  }
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
}

applyTheme(initialTheme());

function setView(view, updateHash = true) {
  const next = VIEW_TITLES[view] ? view : 'overview';
  document.querySelectorAll('[data-page]').forEach(page => { page.hidden = page.dataset.page !== next; });
  document.querySelectorAll('[data-view-target]').forEach(button => {
    const active = button.dataset.viewTarget === next;
    button.classList.toggle('active', active);
    if (button.matches('.nav-button')) button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if ($('pageTitle')) $('pageTitle').textContent = VIEW_TITLES[next];
  document.title = `Trade Vault · ${VIEW_TITLES[next]}`;
  if (updateHash && location.hash !== `#${next}`) history.pushState(null, '', `#${next}`);
  if ((next === 'holdings' || next === 'overview') && vaultKey) syncMarketData();
}

function currentViewFromHash() {
  const view = location.hash.replace(/^#/, '').toLowerCase();
  return VIEW_TITLES[view] ? view : 'overview';
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Local storage took too long to open. Close other Trade Vault tabs and reopen the app.'));
    }, 10000);
    const finish = (fn, value) => {
      if (settled) {
        if (fn === resolve) value?.close?.();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('records')) database.createObjectStore('records', { keyPath: 'key' });
    };
    request.onblocked = () => finish(reject, new Error('Local storage is busy in another tab. Close other Trade Vault tabs and reopen the app.'));
    request.onsuccess = () => finish(resolve, request.result);
    request.onerror = () => finish(reject, request.error || new Error('Could not open local storage.'));
  });
}

function idbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbClear(storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbReplaceVault(vault, records) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta', 'records'], 'readwrite');
    const meta = tx.objectStore('meta');
    const recordStore = tx.objectStore('records');
    meta.clear();
    recordStore.clear();
    meta.put(vault);
    for (const record of records) recordStore.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not restore the local vault.'));
    tx.onabort = () => reject(tx.error || new Error('Vault restore was cancelled by local storage.'));
  });
}

function decodeB64Checked(value, label, { exactBytes = null, minBytes = 0, maxBytes = Infinity } = {}) {
  const text = String(value ?? '');
  if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new Error(`${label} is not valid base64.`);
  }
  let bytes;
  try { bytes = b64ToBytes(text); }
  catch { throw new Error(`${label} is not valid base64.`); }
  if (exactBytes !== null && bytes.length !== exactBytes) throw new Error(`${label} has an invalid length.`);
  if (bytes.length < minBytes || bytes.length > maxBytes) throw new Error(`${label} has an invalid size.`);
  return bytes;
}

function validateBackupPayload(backup) {
  if (backup?.format !== 'trade-vault-backup' || backup?.version !== 1 || !backup.vault || !Array.isArray(backup.records)) {
    throw new Error('This is not a valid Trade Vault backup.');
  }
  if (backup.records.length > MAX_BACKUP_RECORDS) throw new Error('Backup contains too many records.');

  const vault = backup.vault;
  if (vault.key !== 'vault' || (vault.version != null && vault.version !== 1) || (vault.kdf != null && vault.kdf !== 'PBKDF2-SHA-256')) throw new Error('Backup vault metadata is invalid.');
  if (!Number.isInteger(vault.iterations) || vault.iterations < MIN_ACCEPTED_KDF_ITERATIONS || vault.iterations > MAX_ACCEPTED_KDF_ITERATIONS) {
    throw new Error('Backup vault KDF settings are outside the supported safety range.');
  }
  decodeB64Checked(vault.salt, 'Backup salt', { exactBytes: 16 });
  if (!vault.verifier || typeof vault.verifier !== 'object') throw new Error('Backup verifier is missing.');
  decodeB64Checked(vault.verifier.iv, 'Backup verifier IV', { exactBytes: 12 });
  decodeB64Checked(vault.verifier.cipher, 'Backup verifier ciphertext', { minBytes: 16, maxBytes: 4096 });

  const seen = new Set();
  for (const [index, record] of backup.records.entries()) {
    if (!record || typeof record !== 'object') throw new Error(`Backup record ${index + 1} is invalid.`);
    if (typeof record.key !== 'string' || !record.key || record.key.length > 256) throw new Error(`Backup record ${index + 1} has an invalid key.`);
    if (seen.has(record.key)) throw new Error(`Backup contains duplicate record key ${record.key}.`);
    seen.add(record.key);
    if (record.version != null && ![1, 2].includes(record.version)) throw new Error(`Backup record ${index + 1} uses an unsupported format.`);
    decodeB64Checked(record.iv, `Backup record ${index + 1} IV`, { exactBytes: 12 });
    decodeB64Checked(record.cipher, `Backup record ${index + 1} ciphertext`, { minBytes: 16, maxBytes: MAX_RECORD_CIPHER_BYTES });
  }
  return backup;
}

async function deriveKeyBytes(secret, salt, iterations) {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, 256);
  return new Uint8Array(bits);
}

async function importVaultKey(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function deriveKey(secret, salt, iterations) {
  return importVaultKey(await deriveKeyBytes(secret, salt, iterations));
}

async function encryptBytes(key, bytes, aad) {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, bytes);
  return { iv: bytesToB64(iv), cipher: bytesToB64(cipher) };
}

async function decryptBytes(key, payload, aad) {
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv), additionalData: aad },
    key,
    b64ToBytes(payload.cipher)
  );
  return new Uint8Array(clear);
}

function makeUniqueKey(prefix = 'record') {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  const bytes = randomBytes(16);
  return `${prefix}-${Date.now()}-${bytesToB64(bytes).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
}

function recordAad(recordKey) {
  return enc.encode(`${RECORD_AAD_PREFIX}${recordKey}`);
}

async function encryptTransaction(tx, recordKey = makeUniqueKey('record')) {
  const payload = await encryptBytes(vaultKey, enc.encode(JSON.stringify(tx)), recordAad(recordKey));
  return { key: recordKey, version: 2, ...payload };
}

async function decryptRecord(record) {
  const aad = record.version === 2 ? recordAad(record.key) : LEGACY_RECORD_AAD;
  const clear = await decryptBytes(vaultKey, record, aad);
  return JSON.parse(dec.decode(clear));
}

async function vaultExists() {
  return Boolean(await idbGet('meta', 'vault'));
}

function validatePin(pin) {
  const text = String(pin ?? '').trim();
  if (!/^\d{4}$/.test(text)) throw new Error('PIN must be exactly 4 digits.');
  return text;
}

async function savePinWrapperFromRaw(pin, rawVaultKey) {
  const cleanPin = validatePin(pin);
  const salt = randomBytes(16);
  const pinKey = await deriveKey(cleanPin, salt, PIN_ITERATIONS);
  const wrap = await encryptBytes(pinKey, rawVaultKey, PIN_WRAP_AAD);
  await idbPut('meta', {
    key: 'pin', version: 1, kdf: 'PBKDF2-SHA-256', iterations: PIN_ITERATIONS,
    salt: bytesToB64(salt), wrap
  });
  pinConfigured = true;
}

async function savePinForPassphrase(pin, passphrase) {
  const vault = await idbGet('meta', 'vault');
  if (!vault) throw new Error('No vault exists.');
  const rawVaultKey = await deriveKeyBytes(passphrase, b64ToBytes(vault.salt), vault.iterations);
  const candidate = await importVaultKey(rawVaultKey);
  try {
    const check = dec.decode(await decryptBytes(candidate, vault.verifier, VERIFY_AAD));
    if (check !== VERIFY_TEXT) throw new Error('Incorrect passphrase.');
  } catch (error) {
    if (error?.message === 'Incorrect passphrase.') throw error;
    throw new Error('Incorrect passphrase.');
  }
  await savePinWrapperFromRaw(pin, rawVaultKey);
}

async function createVault(passphrase, pin) {
  const salt = randomBytes(16);
  const rawVaultKey = await deriveKeyBytes(passphrase, salt, PBKDF2_ITERATIONS);
  const key = await importVaultKey(rawVaultKey);
  const verifier = await encryptBytes(key, enc.encode(VERIFY_TEXT), VERIFY_AAD);
  const vault = {
    key: 'vault',
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToB64(salt),
    verifier
  };
  await idbPut('meta', vault);
  await savePinWrapperFromRaw(pin, rawVaultKey);
  vaultKey = key;
  transactions = [];
  showApp();
  renderAll();
  requestPersistence();
}

async function finishUnlock(key) {
  vaultKey = key;
  await loadTransactions();
  showApp();
  renderAll();
  requestPersistence();
}

async function unlockVault(passphrase) {
  const vault = await idbGet('meta', 'vault');
  if (!vault) throw new Error('No vault exists.');
  const key = await deriveKey(passphrase, b64ToBytes(vault.salt), vault.iterations);
  try {
    const check = dec.decode(await decryptBytes(key, vault.verifier, VERIFY_AAD));
    if (check !== VERIFY_TEXT) throw new Error('Incorrect passphrase.');
  } catch (error) {
    if (error?.message === 'Incorrect passphrase.') throw error;
    throw new Error('Incorrect passphrase.');
  }
  await finishUnlock(key);
}

async function unlockVaultWithPin(pin) {
  const [vault, pinMeta] = await Promise.all([idbGet('meta', 'vault'), idbGet('meta', 'pin')]);
  if (!vault) throw new Error('No vault exists.');
  if (!pinMeta?.wrap) throw new Error('No PIN is configured on this device.');
  try {
    const pinKey = await deriveKey(validatePin(pin), b64ToBytes(pinMeta.salt), pinMeta.iterations || PIN_ITERATIONS);
    const rawVaultKey = await decryptBytes(pinKey, pinMeta.wrap, PIN_WRAP_AAD);
    const key = await importVaultKey(rawVaultKey);
    const check = dec.decode(await decryptBytes(key, vault.verifier, VERIFY_AAD));
    if (check !== VERIFY_TEXT) throw new Error('Incorrect PIN.');
    await finishUnlock(key);
  } catch (error) {
    if (error?.message === 'No PIN is configured on this device.') throw error;
    throw new Error('Incorrect PIN.');
  }
}

function clearSensitiveUi() {
  const txBody = $('transactionsBody');
  const holdingsBody = $('holdingsBody');
  const allocation = $('allocationChart');
  if (txBody) txBody.innerHTML = '<tr><td colspan="13" class="empty-cell">Vault locked.</td></tr>';
  if (holdingsBody) holdingsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Vault locked.</td></tr>';
  if ($('transactionsCards')) $('transactionsCards').innerHTML = '<div class="empty-card">Vault locked.</div>';
  if ($('holdingsCards')) $('holdingsCards').innerHTML = '<div class="empty-card">Vault locked.</div>';
  if (allocation) { allocation.className = 'bar-chart empty-state'; allocation.textContent = 'Vault locked.'; }
  if ($('performanceChart')) { $('performanceChart').className = 'performance-chart empty-state'; $('performanceChart').textContent = 'Vault locked.'; }
  if ($('analyticsStats')) $('analyticsStats').innerHTML = '';
  if ($('warningBanner')) { $('warningBanner').hidden = true; $('warningBanner').textContent = ''; }
  if ($('searchInput')) $('searchInput').value = '';
  if ($('manualDialog')?.open) $('manualDialog').close();
  if ($('settingsDialog')?.open) $('settingsDialog').close();
  if ($('manualForm')) $('manualForm').reset();
  editingRecordKey = null;
  selectedRecordKeys.clear();
  expandedRecordKeys.clear();
  expandedHoldingKeys.clear();
  holdingsPurpose = 'TRADE';
  overviewPurpose = 'TRADE';
  if ($('selectAllVisible')) $('selectAllVisible').checked = false;
  if ($('selectionCount')) { $('selectionCount').hidden = true; $('selectionCount').textContent = ''; }
}

function showUnlockMethod(method) {
  const usePin = method === 'pin' && pinConfigured;
  $('pinUnlockGroup').hidden = !usePin;
  $('passphraseUnlockGroup').hidden = usePin;
  $('usePinBtn').hidden = !pinConfigured;
  $('unlockStatus').textContent = '';
  $('unlockStatus').className = 'gate-status';
  setTimeout(() => (usePin ? $('unlockPin') : $('unlockPassphrase'))?.focus(), 0);
}

function lockVault() {
  stopMarketData({ clearPrices: true, resetStatus: true });
  vaultKey = null;
  transactions = [];
  analyticsCache = null;
  clearTimeout(idleTimer);
  clearTimeout(unlockDebounceTimer);
  clearSensitiveUi();
  $('appShell').hidden = true;
  $('vaultGate').hidden = false;
  $('unlockPassphrase').value = '';
  $('unlockPin').value = '';
  $('unlockVaultPanel').hidden = false;
  $('createVaultPanel').hidden = true;
  showUnlockMethod(pinConfigured ? 'pin' : 'passphrase');
}

async function loadTransactions() {
  const records = await idbGetAll('records');
  const loaded = [];
  const legacy = [];
  for (const record of records) {
    try {
      const tx = await decryptRecord(record);
      tx.purpose = transactionPurpose(tx);
      tx._recordKey = record.key;
      loaded.push(tx);
      if (record.version !== 2) legacy.push({ recordKey: record.key, tx });
    } catch (error) {
      console.error('Could not decrypt record', record.key, error);
    }
  }
  transactions = loaded.sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date));

  // Transparently upgrade legacy ciphertext to record-bound authenticated data.
  for (const item of legacy) {
    const cleanTx = { ...item.tx };
    delete cleanTx._recordKey;
    await idbPut('records', await encryptTransaction(cleanTx, item.recordKey));
  }
}

async function saveTransaction(tx) {
  if (!vaultKey) throw new Error('Vault is locked.');
  const record = await encryptTransaction(tx);
  await idbPut('records', record);
  tx._recordKey = record.key;
  transactions.push(tx);
  transactions.sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date));
}

async function updateTransaction(recordKey, tx) {
  if (!vaultKey) throw new Error('Vault is locked.');
  if (!recordKey) throw new Error('Transaction record is missing.');
  const record = await encryptTransaction(tx, recordKey);
  await idbPut('records', record);
  const index = transactions.findIndex(item => item._recordKey === recordKey);
  if (index < 0) throw new Error('Transaction was not found.');
  tx._recordKey = recordKey;
  transactions[index] = tx;
  transactions.sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date));
}

async function deleteTransaction(recordKey) {
  if (!vaultKey) throw new Error('Vault is locked.');
  await idbDelete('records', recordKey);
  transactions = transactions.filter(item => item._recordKey !== recordKey);
  selectedRecordKeys.delete(recordKey);
}

async function requestPersistence() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
    const persisted = await navigator.storage.persisted?.();
    $('storageStatus').textContent = persisted ? 'Encrypted local vault · persistent storage' : 'Encrypted local vault · browser-managed storage';
  } catch {
    $('storageStatus').textContent = 'Encrypted local vault';
  }
}

function clearCredentialInputs() {
  for (const id of ['newPassphrase', 'confirmPassphrase', 'newPin', 'confirmPin', 'unlockPassphrase', 'unlockPin']) {
    const input = $(id);
    if (input) input.value = '';
  }
  const settingsForm = $('settingsForm');
  if (settingsForm) {
    settingsForm.elements.pinPassphrase.value = '';
    settingsForm.elements.newPin.value = '';
    settingsForm.elements.confirmPin.value = '';
  }
}

function showApp() {
  clearCredentialInputs();
  $('vaultGate').hidden = true;
  $('appShell').hidden = false;
  setView(currentViewFromHash(), false);
  resetIdleTimer();
}

function resetIdleTimer() {
  if (!vaultKey) return;
  clearTimeout(idleTimer);
  const timeoutMs = autoLockMinutes * 60 * 1000;
  idleTimer = setTimeout(() => {
    lockVault();
    toast(`Vault locked after ${autoLockMinutes} minute${autoLockMinutes === 1 ? '' : 's'} of inactivity.`);
  }, timeoutMs);
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setBusy(button, busy, busyText) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  if (button.classList.contains('icon-only')) return;
  if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
  button.innerHTML = busy ? escapeHtml(busyText) : button.dataset.originalHtml;
}

function normalizeDecimal(value, allowEmpty = false) {
  let text = String(value ?? '').trim().replace(/,/g, '');
  if (allowEmpty && text === '') return '';
  if (/^\.\d+$/.test(text)) text = `0${text}`;
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`Invalid decimal value: ${value}`);
  return text;
}

function parseFixed(value) {
  const text = normalizeDecimal(value);
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > SCALE_DIGITS) {
    const kept = fraction.slice(0, SCALE_DIGITS);
    const next = fraction[SCALE_DIGITS];
    let scaled = BigInt(whole) * SCALE + BigInt(kept.padEnd(SCALE_DIGITS, '0'));
    if (next >= '5') scaled += 1n;
    return scaled;
  }
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(SCALE_DIGITS, '0'));
}

function mulFixed(a, b) {
  return (a * b + SCALE / 2n) / SCALE;
}

function divFixed(a, b) {
  if (b === 0n) return 0n;
  return (a * SCALE + b / 2n) / b;
}

function percentOfFixed(value, percent) {
  return (value * percent + (SCALE * 100n) / 2n) / (SCALE * 100n);
}

function fixedToNumber(value) {
  return Number(value) / Number(SCALE);
}

function formatFixed(value, maxDecimals = 8) {
  const negative = value < 0n;
  let n = negative ? -value : value;
  const whole = n / SCALE;
  let fraction = (n % SCALE).toString().padStart(SCALE_DIGITS, '0').slice(0, maxDecimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

function formatMoney(value) {
  if (value == null) return '—';
  const amount = typeof value === 'bigint' ? fixedToNumber(value) : value;
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function transactionPurpose(txOrValue) {
  const raw = typeof txOrValue === 'object' && txOrValue !== null ? txOrValue.purpose : txOrValue;
  const text = String(raw ?? '').trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!text || ['TRADE', 'TRADING', 'FOR TRADE'].includes(text)) return 'TRADE';
  if (['HOLD', 'HOLDING', 'FOR HOLD', 'LONG TERM', 'LONGTERM', 'INVESTMENT'].includes(text)) return 'HOLD';
  throw new Error('Purpose must be Trading or Long-term.');
}

function purposeLabel(value) {
  return PURPOSE_LABELS[transactionPurpose(value)];
}

function parseFee(rawFee, side, base, quote) {
  const text = String(rawFee ?? '').trim();
  if (!text) return { amount: '0', asset: quote, inferred: false, raw: '' };
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)(?:\s+([A-Za-z0-9._-]+))?$/);
  if (!match) throw new Error(`Invalid fee: ${text}`);
  const amount = normalizeDecimal(match[1]);
  const explicit = match[2]?.toUpperCase();
  if (explicit) return { amount, asset: explicit, inferred: false, raw: text };
  return { amount, asset: side === 'SELL' ? quote : base, inferred: parseFixed(amount) > 0n, raw: text };
}

function normalizeTransaction(input, source = 'manual') {
  const date = String(input.date ?? '').trim();
  if (!date || date.length > 64 || !parseDateMs(date)) throw new Error('Date is required and must be valid.');
  const id = String(input.id ?? '').trim();
  if (!id || id.length > 256) throw new Error('Transaction ID is required and must be 256 characters or fewer.');
  const pair = String(input.pair ?? '').trim().toUpperCase();
  const pairMatch = pair.match(/^([A-Z0-9._-]{1,20})\/([A-Z0-9._-]{1,20})$/);
  if (!pairMatch) throw new Error(`Invalid pair: ${pair}`);
  const [, base, quote] = pairMatch;
  const side = String(input.side ?? '').trim().toUpperCase();
  if (!['BUY', 'SELL'].includes(side)) throw new Error(`Invalid side: ${side}`);
  const price = normalizeDecimal(input.price);
  const executed = normalizeDecimal(input.executed);
  const total = normalizeDecimal(input.total);
  const fee = parseFee(input.fee, side, base, quote);
  if (parseFixed(price) <= 0n || parseFixed(executed) <= 0n || parseFixed(total) < 0n) throw new Error('Price and quantity must be positive; total cannot be negative.');

  const expectedTotal = mulFixed(parseFixed(price), parseFixed(executed));
  const statedTotal = parseFixed(total);
  const diff = expectedTotal > statedTotal ? expectedTotal - statedTotal : statedTotal - expectedTotal;
  const tolerance = statedTotal / 10000n + 1000n; // roughly 0.01% plus a tiny floor

  return {
    date,
    id,
    pair,
    base,
    quote,
    type: ['LIMIT', 'MARKET', 'OTHER'].includes(String(input.type ?? '').trim().toUpperCase()) ? String(input.type).trim().toUpperCase() : 'OTHER',
    side,
    purpose: transactionPurpose(input.purpose),
    price,
    executed,
    total,
    feeAmount: fee.amount,
    feeAsset: fee.asset,
    feeRaw: fee.raw,
    feeInferred: fee.inferred,
    totalMismatch: diff > tolerance,
    notes: String(input.notes ?? '').trim().slice(0, MAX_NOTES_LENGTH),
    source,
    addedAt: new Date().toISOString()
  };
}

function parseCsv(text) {
  if (String(text ?? '').length > MAX_CSV_BYTES) throw new Error('CSV is too large. Maximum supported size is 5 MB.');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function csvRowsToTransactions(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV has no transaction rows.');
  const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').trim());
  const required = ['Date', 'ID', 'Pair', 'Type', 'Side', 'Executed Price', 'Executed', 'Total', 'Fee'];
  for (const name of required) if (!headers.includes(name)) throw new Error(`Missing required column: ${name}`);
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));

  return rows.slice(1).map((r, rowIndex) => {
    try {
      return normalizeTransaction({
        date: r[index.Date],
        id: r[index.ID],
        pair: r[index.Pair],
        type: r[index.Type],
        side: r[index.Side],
        purpose: index.Purpose === undefined ? 'TRADE' : r[index.Purpose],
        price: r[index['Executed Price']],
        executed: r[index.Executed],
        total: r[index.Total],
        fee: r[index.Fee],
        notes: index.Notes === undefined ? '' : r[index.Notes]
      }, 'csv');
    } catch (error) {
      throw new Error(`CSV row ${rowIndex + 2}: ${error.message}`);
    }
  });
}

function parseDateMs(value) {
  const match = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return Date.parse(value) || 0;
  const [, y, m, d, hh, mm, ss = '0'] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
}

function shortDate(value) {
  const ms = parseDateMs(value);
  if (!ms) return value;
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

function marketSymbolForHolding(holding) {
  if (!holding || holding.quote !== 'PHP' || holding.netQty <= 0n) return null;
  return `${holding.base}${holding.quote}`.replace(/[^A-Z0-9]/g, '').toUpperCase();
}

function desiredMarketSymbols() {
  if (!analyticsCache?.holdings) return [];
  return [...new Set(analyticsCache.holdings.map(marketSymbolForHolding).filter(Boolean))].sort();
}

function updateMarketControls() {
  for (const id of ['marketToggleBtn', 'overviewMarketToggleBtn']) {
    const toggle = $(id);
    if (!toggle) continue;
    toggle.setAttribute('aria-pressed', String(livePricingEnabled));
    toggle.classList.toggle('active', livePricingEnabled);
    toggle.setAttribute('aria-label', livePricingEnabled ? 'Turn live pricing off' : 'Turn live pricing on');
    toggle.title = livePricingEnabled ? 'Live pricing on' : 'Live pricing off';
  }
  for (const id of ['marketRefreshBtn', 'overviewMarketRefreshBtn']) {
    const refresh = $(id);
    if (refresh) refresh.disabled = !livePricingEnabled;
  }
}

function updateMarketStatus(text = marketStatusText) {
  marketStatusText = text;
  let suffix = '';
  if (marketLastMessageAt) {
    const time = new Intl.DateTimeFormat('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(marketLastMessageAt));
    suffix = ` · ${time}`;
  }
  for (const id of ['marketStatus', 'overviewMarketStatus']) {
    const el = $(id);
    if (el) el.textContent = `${text}${suffix}`;
  }
  updateMarketControls();
}

function scheduleMarketRender() {
  if (marketRenderTimer) return;
  marketRenderTimer = setTimeout(() => {
    marketRenderTimer = null;
    if (vaultKey) {
      renderHoldings();
      renderOverview();
    }
    updateMarketStatus();
  }, MARKET_RENDER_THROTTLE_MS);
}

function pruneMarketPrices(symbols) {
  const keep = new Set(symbols);
  for (const symbol of marketPrices.keys()) {
    if (!keep.has(symbol)) marketPrices.delete(symbol);
  }
}

function isFreshMarketQuote(market, now = Date.now()) {
  return Boolean(market?.updatedAt && now - market.updatedAt <= MARKET_STALE_AFTER_MS);
}

function applyMarketTickerPayload(payload, symbols) {
  const wanted = new Set(symbols);
  let rows = payload?.data ?? payload;
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  let applied = 0;
  const now = Date.now();
  for (const row of rows) {
    const symbol = String(row?.s ?? row?.symbol ?? '').toUpperCase();
    if (!symbol || !wanted.has(symbol)) continue;
    const rawLast = row?.c ?? row?.lastPrice;
    const rawBid = row?.b ?? row?.bidPrice;
    if ((rawLast == null || String(rawLast).trim() === '') && (rawBid == null || String(rawBid).trim() === '')) continue;
    try {
      let lastPrice = '';
      let bidPrice = '';
      let askPrice = '';
      if (rawLast != null && String(rawLast).trim() !== '') {
        lastPrice = normalizeDecimal(rawLast);
        if (parseFixed(lastPrice) <= 0n) lastPrice = '';
      }
      if (rawBid != null && String(rawBid).trim() !== '') {
        bidPrice = normalizeDecimal(rawBid);
        if (parseFixed(bidPrice) <= 0n) bidPrice = '';
      }
      const rawAsk = row?.a ?? row?.askPrice;
      if (rawAsk != null && String(rawAsk).trim() !== '') {
        askPrice = normalizeDecimal(rawAsk);
        if (parseFixed(askPrice) <= 0n) askPrice = '';
      }
      if (!lastPrice && !bidPrice) continue;
      marketPrices.set(symbol, {
        lastPrice: lastPrice || bidPrice,
        bidPrice,
        askPrice,
        eventAt: Number.isFinite(Number(row?.E)) ? Number(row.E) : null,
        updatedAt: now
      });
      applied++;
    } catch {}
  }
  if (applied) marketLastMessageAt = now;
  return applied;
}

function newMarketConnection(symbol) {
  return {
    symbol,
    socket: null,
    reconnectTimer: null,
    pingTimer: null,
    reconnectAttempt: 0,
    openedAt: 0,
    lastMessageAt: 0,
    lastError: ''
  };
}

function marketConnection(symbol) {
  let conn = marketConnections.get(symbol);
  if (!conn) {
    conn = newMarketConnection(symbol);
    marketConnections.set(symbol, conn);
  }
  return conn;
}

function clearMarketConnectionTimers(conn) {
  if (!conn) return;
  clearTimeout(conn.reconnectTimer);
  clearInterval(conn.pingTimer);
  conn.reconnectTimer = null;
  conn.pingTimer = null;
}

function closeMarketConnection(symbol, { remove = false } = {}) {
  const conn = marketConnections.get(symbol);
  if (!conn) return;
  clearMarketConnectionTimers(conn);
  if (conn.socket) {
    const socket = conn.socket;
    conn.socket = null;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try { socket.close(1000, 'Trade Vault market resync'); } catch {}
  }
  conn.openedAt = 0;
  if (remove) marketConnections.delete(symbol);
}

function pruneMarketConnections(symbols) {
  const keep = new Set(symbols);
  for (const symbol of [...marketConnections.keys()]) {
    if (!keep.has(symbol)) closeMarketConnection(symbol, { remove: true });
  }
}

function marketConnectionSummary(symbols, now = Date.now()) {
  let fresh = 0;
  let open = 0;
  let connecting = 0;
  let retrying = 0;
  for (const symbol of symbols) {
    if (isFreshMarketQuote(marketPrices.get(symbol), now)) fresh++;
    const conn = marketConnections.get(symbol);
    if (!conn) continue;
    if (conn.socket?.readyState === WebSocket.OPEN) open++;
    else if (conn.socket?.readyState === WebSocket.CONNECTING) connecting++;
    if (conn.reconnectTimer) retrying++;
  }
  return { fresh, open, connecting, retrying, total: symbols.length };
}

function updateMarketConnectionStatus(symbols) {
  if (!livePricingEnabled) return updateMarketStatus('Live pricing off');
  if (!symbols.length) return updateMarketStatus('No open PHP inventory to price');
  const { fresh, open, connecting, retrying, total } = marketConnectionSummary(symbols);
  if (fresh === total) return updateMarketStatus(`Coins.ph live market · ${fresh}/${total} fresh`);
  if (open || connecting || retrying) return updateMarketStatus(`Coins.ph market · ${fresh}/${total} fresh · connecting`);
  updateMarketStatus(`Coins.ph market · ${fresh}/${total} fresh`);
}

function reconnectDelay(attempt) {
  const base = Math.min(MARKET_MAX_RECONNECT_MS, MARKET_RECONNECT_BASE_MS * (2 ** Math.min(attempt, 5)));
  return base + Math.floor(Math.random() * 750);
}

function scheduleMarketReconnect(symbol) {
  if (!vaultKey || !livePricingEnabled || document.hidden) return;
  const conn = marketConnection(symbol);
  if (conn.reconnectTimer || conn.socket) return;
  const delay = reconnectDelay(conn.reconnectAttempt);
  conn.reconnectAttempt = Math.min(conn.reconnectAttempt + 1, 6);
  conn.reconnectTimer = setTimeout(() => {
    conn.reconnectTimer = null;
    connectMarketSymbol(symbol);
  }, delay);
  updateMarketConnectionStatus(desiredMarketSymbols());
}

function connectMarketSymbol(symbol, { force = false } = {}) {
  if (!vaultKey || !livePricingEnabled || document.hidden || !symbol) return;
  const conn = marketConnection(symbol);
  if (!force && conn.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(conn.socket.readyState)) return;
  if (force) closeMarketConnection(symbol);
  clearTimeout(conn.reconnectTimer);
  conn.reconnectTimer = null;
  conn.lastError = '';

  let socket;
  try {
    socket = new WebSocket(`${MARKET_WS_RAW_BASE}${symbol.toLowerCase()}@ticker`);
  } catch (error) {
    conn.lastError = error?.message || 'Could not create WebSocket';
    scheduleMarketReconnect(symbol);
    return;
  }
  conn.socket = socket;

  socket.onopen = () => {
    if (conn.socket !== socket) return;
    conn.reconnectAttempt = 0;
    conn.openedAt = Date.now();
    conn.lastError = '';
    clearInterval(conn.pingTimer);
    conn.pingTimer = setInterval(() => {
      if (conn.socket === socket && socket.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ ping: Date.now() })); } catch {}
      }
    }, MARKET_PING_INTERVAL_MS);
    updateMarketConnectionStatus(desiredMarketSymbols());
  };

  socket.onmessage = event => {
    if (conn.socket !== socket) return;
    try {
      const message = JSON.parse(event.data);
      if (message?.pong || message?.result === null) return;
      if (message?.code != null || message?.desc) {
        conn.lastError = String(message.desc || `Coins.ph stream error ${message.code}`);
        console.warn(`Coins.ph ${symbol} stream response`, message);
        return;
      }
      const applied = applyMarketTickerPayload(message, [symbol]);
      if (!applied) return;
      conn.lastMessageAt = Date.now();
      conn.lastError = '';
      updateMarketConnectionStatus(desiredMarketSymbols());
      scheduleMarketRender();
    } catch (error) {
      console.warn(`Ignored malformed Coins.ph ${symbol} market message`, error);
    }
  };

  socket.onerror = () => {
    if (conn.socket !== socket) return;
    conn.lastError = 'WebSocket error';
    updateMarketConnectionStatus(desiredMarketSymbols());
  };

  socket.onclose = () => {
    if (conn.socket !== socket) return;
    conn.socket = null;
    conn.openedAt = 0;
    clearInterval(conn.pingTimer);
    conn.pingTimer = null;
    if (vaultKey && livePricingEnabled && !document.hidden && desiredMarketSymbols().includes(symbol)) {
      scheduleMarketReconnect(symbol);
    }
  };
}

function startMarketWatchdog(symbols) {
  clearInterval(marketWatchdogTimer);
  marketWatchdogTimer = null;
  if (!vaultKey || !livePricingEnabled || document.hidden || !symbols.length) return;
  marketWatchdogTimer = setInterval(() => {
    if (!vaultKey || !livePricingEnabled || document.hidden) return;
    const wanted = desiredMarketSymbols();
    const now = Date.now();
    for (const symbol of wanted) {
      const conn = marketConnection(symbol);
      const state = conn.socket?.readyState;
      if (state === WebSocket.OPEN) {
        const activityAt = conn.lastMessageAt || conn.openedAt;
        const timeout = conn.lastMessageAt ? MARKET_STALE_AFTER_MS : MARKET_INITIAL_QUOTE_TIMEOUT_MS;
        if (activityAt && now - activityAt > timeout) {
          conn.lastError = 'Ticker stream stopped updating';
          closeMarketConnection(symbol);
          scheduleMarketReconnect(symbol);
        }
      } else if (state !== WebSocket.CONNECTING && !conn.reconnectTimer) {
        scheduleMarketReconnect(symbol);
      }
    }
    updateMarketConnectionStatus(wanted);
    scheduleMarketRender();
  }, MARKET_WATCHDOG_INTERVAL_MS);
}

function stopMarketData({ clearPrices = true, resetStatus = true } = {}) {
  clearInterval(marketWatchdogTimer);
  clearTimeout(marketRenderTimer);
  marketWatchdogTimer = null;
  marketRenderTimer = null;
  for (const symbol of [...marketConnections.keys()]) closeMarketConnection(symbol, { remove: true });
  marketConnections.clear();
  if (clearPrices) {
    marketPrices.clear();
    marketLastMessageAt = 0;
  }
  if (resetStatus) updateMarketStatus(livePricingEnabled ? 'Coins.ph live pricing idle' : 'Live pricing off');
}

function syncMarketData(force = false) {
  marketSyncGeneration++;
  if (!vaultKey || !livePricingEnabled || document.hidden) {
    if (marketConnections.size || marketWatchdogTimer) stopMarketData({ clearPrices: false, resetStatus: true });
    return;
  }

  const symbols = desiredMarketSymbols();
  if (!symbols.length) {
    stopMarketData({ clearPrices: true, resetStatus: false });
    updateMarketStatus('No open PHP inventory to price');
    return;
  }

  pruneMarketPrices(symbols);
  pruneMarketConnections(symbols);

  if (force) {
    for (const symbol of symbols) {
      const conn = marketConnection(symbol);
      conn.reconnectAttempt = 0;
      closeMarketConnection(symbol);
      connectMarketSymbol(symbol);
    }
  } else {
    for (const symbol of symbols) connectMarketSymbol(symbol);
  }

  startMarketWatchdog(symbols);
  updateMarketConnectionStatus(symbols);
}

function analyzeTransactions(list) {
  const ordered = [...list].sort((a, b) => parseDateMs(a.date) - parseDateMs(b.date));
  const states = new Map();
  const txStatus = new Map();
  const realizedEvents = [];
  let buyVolumePhp = 0n;
  let feesPhp = 0n;
  let realizedPnlPhp = 0n;
  let matchedSells = 0;
  let unmatchedSells = 0;
  const warnings = [];

  for (const tx of ordered) {
    const purpose = transactionPurpose(tx);
    const stateKey = `${purpose}:${tx.pair}`;
    const state = states.get(stateKey) || { pair: tx.pair, base: tx.base, quote: tx.quote, purpose, netQty: 0n, knownQty: 0n, knownCost: 0n };
    const qty = parseFixed(tx.executed);
    const total = parseFixed(tx.total);
    const fee = parseFixed(tx.feeAmount || '0');
    const notes = [];

    if (tx.quote === 'PHP' && tx.side === 'BUY') buyVolumePhp += total;
    if (tx.feeAsset === 'PHP') feesPhp += fee;
    if (tx.feeInferred && fee > 0n) notes.push(`Fee asset inferred as ${tx.feeAsset}`);
    if (tx.totalMismatch) notes.push('Price × quantity differs from Total');

    if (tx.side === 'BUY') {
      let qtyAdded = qty;
      let quoteCost = total;
      if (tx.feeAsset === tx.base) qtyAdded -= fee;
      else if (tx.feeAsset === tx.quote) quoteCost += fee;
      else if (fee > 0n) notes.push(`Fee in ${tx.feeAsset} not valued in cost basis`);
      state.netQty += qtyAdded;
      if (qtyAdded > 0n) {
        state.knownQty += qtyAdded;
        state.knownCost += quoteCost;
      }
    } else {
      let qtyRemoved = qty;
      let proceeds = total;
      if (tx.feeAsset === tx.base) qtyRemoved += fee;
      else if (tx.feeAsset === tx.quote) proceeds = proceeds > fee ? proceeds - fee : 0n;
      else if (fee > 0n) notes.push(`Fee in ${tx.feeAsset} not valued in proceeds`);
      state.netQty -= qtyRemoved;

      if (state.knownQty > 0n && qtyRemoved <= state.knownQty) {
        const avgCost = divFixed(state.knownCost, state.knownQty);
        const removedCost = mulFixed(avgCost, qtyRemoved);
        const pnl = proceeds - removedCost;
        state.knownQty -= qtyRemoved;
        state.knownCost = state.knownCost > removedCost ? state.knownCost - removedCost : 0n;
        if (tx.quote === 'PHP') {
          realizedPnlPhp += pnl;
          realizedEvents.push({ date: tx.date, pair: tx.pair, pnl, removedCost, proceeds, id: tx.id, recordKey: tx._recordKey || '' });
        }
        matchedSells++;
        notes.push('Matched using weighted average cost');
      } else {
        unmatchedSells++;
        state.knownQty = 0n;
        state.knownCost = 0n;
        notes.push('Missing prior inventory; realized P&L not calculated');
      }
    }

    states.set(stateKey, state);
    txStatus.set(tx.id, notes);
  }

  const holdings = [...states.values()].sort((a, b) => Number(b.knownCost - a.knownCost));
  if (unmatchedSells) warnings.push(`${unmatchedSells} sell transaction${unmatchedSells === 1 ? '' : 's'} cannot be matched to earlier inventory. Import older history before relying on realized P&L.`);
  const inferredFees = list.filter(t => t.feeInferred && parseFixed(t.feeAmount || '0') > 0n).length;
  if (inferredFees) warnings.push(`${inferredFees} fee asset${inferredFees === 1 ? ' was' : 's were'} inferred from trade side because the CSV omitted the currency.`);
  const mismatches = list.filter(t => t.totalMismatch).length;
  if (mismatches) warnings.push(`${mismatches} transaction${mismatches === 1 ? '' : 's'} have a noticeable Price × Quantity vs Total difference.`);

  return { holdings, txStatus, buyVolumePhp, feesPhp, realizedPnlPhp, realizedEvents, matchedSells, unmatchedSells, warnings };
}

function performanceSummary(events) {
  const wins = events.filter(event => event.pnl > 0n);
  const losses = events.filter(event => event.pnl < 0n);
  const scratches = events.length - wins.length - losses.length;
  const grossProfit = wins.reduce((sum, event) => sum + event.pnl, 0n);
  const grossLoss = losses.reduce((sum, event) => sum + (-event.pnl), 0n);
  const directional = wins.length + losses.length;
  const winRate = directional ? (wins.length / directional) * 100 : null;
  const profitFactor = grossLoss > 0n ? fixedToNumber(divFixed(grossProfit, grossLoss)) : grossProfit > 0n ? Infinity : null;
  const avgWin = wins.length ? grossProfit / BigInt(wins.length) : null;
  const avgLoss = losses.length ? -(grossLoss / BigInt(losses.length)) : null;
  let expectancy = null;
  if (directional) expectancy = (grossProfit - grossLoss) / BigInt(directional);

  let cumulative = 0n;
  let peak = 0n;
  let maxDrawdown = 0n;
  const curve = events.map(event => {
    cumulative += event.pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    return { date: event.date, value: cumulative };
  });

  return { wins: wins.length, losses: losses.length, scratches, winRate, profitFactor, avgWin, avgLoss, expectancy, grossProfit, grossLoss, maxDrawdown, curve };
}

function valuationSummary(analysis) {
  const open = analysis.holdings.filter(holding => holding.netQty > 0n && holding.quote === 'PHP');
  let totalCostBasis = 0n;
  let valuedCostBasis = 0n;
  let marketValue = 0n;
  let valuedPositions = 0;
  for (const holding of open) {
    totalCostBasis += holding.knownCost;
    const symbol = marketSymbolForHolding(holding);
    const market = symbol ? marketPrices.get(symbol) : null;
    if (!isFreshMarketQuote(market) || !market?.lastPrice) continue;
    try {
      marketValue += mulFixed(holding.netQty, parseFixed(market.lastPrice));
      valuedCostBasis += holding.knownCost;
      valuedPositions++;
    } catch {}
  }
  const unrealized = valuedPositions ? marketValue - valuedCostBasis : null;
  const unrealizedPct = unrealized != null && valuedCostBasis > 0n ? (fixedToNumber(unrealized) / fixedToNumber(valuedCostBasis)) * 100 : null;
  return { openPositions: open.length, totalCostBasis, valuedCostBasis, marketValue: valuedPositions ? marketValue : null, unrealized, unrealizedPct, valuedPositions };
}

function formatPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(digits)}%`;
}

function dateRangeText(list) {
  const times = list.map(tx => parseDateMs(tx.date)).filter(Boolean);
  if (!times.length) return 'No data yet';
  const min = Math.min(...times), max = Math.max(...times);
  const fmt = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt.format(new Date(min))} – ${fmt.format(new Date(max))}`;
}

function overviewTransactions() {
  return transactions.filter(tx => transactionPurpose(tx) === overviewPurpose);
}

function updateOverviewPurposeTabs() {
  document.querySelectorAll('[data-overview-purpose]').forEach(button => {
    const active = button.dataset.overviewPurpose === overviewPurpose;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function renderAll() {
  analyticsCache = analyzeTransactions(transactions);
  renderOverview();
  renderHoldings();
  renderTransactions();
  syncMarketData();
}

function renderOverview() {
  updateOverviewPurposeTabs();
  const list = overviewTransactions();
  const analysis = analyzeTransactions(list);
  const performance = performanceSummary(analysis.realizedEvents);
  const valuation = valuationSummary(analysis);
  renderMetrics(list, analysis, performance, valuation);
  renderAnalyticsStats(list, analysis, performance, valuation);
  renderPerformanceChart(list, analysis, performance);
  renderAllocation(analysis);
  renderWarnings(analysis);
}

function setMetric(labelId, valueId, noteId, label, value, note) {
  if ($(labelId)) $(labelId).textContent = label;
  if ($(valueId)) $(valueId).textContent = value;
  if ($(noteId)) $(noteId).textContent = note;
}

function renderMetrics(list, analysis, performance, valuation) {
  if (overviewPurpose === 'TRADE') {
    const exitCount = analysis.realizedEvents.length;
    setMetric('metricTransactionsLabel', 'metricTransactions', 'metricDateRange', 'Realized P&L', exitCount ? formatMoney(analysis.realizedPnlPhp) : '—', exitCount ? `${exitCount} matched PHP sell${exitCount === 1 ? '' : 's'}` : 'No matched PHP sells');
    setMetric('metricBuyVolumeLabel', 'metricBuyVolume', 'metricBuyVolumeNote', 'Win rate', performance.winRate == null ? '—' : formatPercent(performance.winRate), performance.wins || performance.losses ? `${performance.wins} win${performance.wins === 1 ? '' : 's'} · ${performance.losses} loss${performance.losses === 1 ? '' : 'es'}` : 'Needs matched exits');
    const factorText = performance.profitFactor === Infinity ? '∞' : performance.profitFactor == null ? '—' : performance.profitFactor.toFixed(2);
    setMetric('metricFeesLabel', 'metricFees', 'metricFeesNote', 'Profit factor', factorText, performance.profitFactor == null ? 'Needs wins/losses' : 'Gross profit ÷ gross loss');
    setMetric('metricPnlLabel', 'metricPnl', 'metricPnlNote', 'Max drawdown', analysis.realizedEvents.length ? formatMoney(-performance.maxDrawdown) : '—', analysis.realizedEvents.length ? 'Peak-to-trough realized P&L' : 'Needs matched exits');
  } else {
    const coverage = valuation.openPositions ? `${valuation.valuedPositions}/${valuation.openPositions} positions valued` : 'No open positions';
    setMetric('metricTransactionsLabel', 'metricTransactions', 'metricDateRange', 'Current value', valuation.marketValue == null ? '—' : formatMoney(valuation.marketValue), livePricingEnabled ? coverage : 'Turn on live pricing');
    setMetric('metricBuyVolumeLabel', 'metricBuyVolume', 'metricBuyVolumeNote', 'Cost basis', formatMoney(valuation.totalCostBasis), `${valuation.openPositions} open position${valuation.openPositions === 1 ? '' : 's'}`);
    const unrealizedClass = valuation.unrealized == null ? '' : valuation.unrealized > 0n ? 'positive' : valuation.unrealized < 0n ? 'negative' : '';
    setMetric('metricFeesLabel', 'metricFees', 'metricFeesNote', 'Unrealized P&L', valuation.unrealized == null ? '—' : formatMoney(valuation.unrealized), valuation.unrealized == null ? (livePricingEnabled ? 'Waiting for fresh market prices' : 'Turn on live pricing') : 'On live-valued positions');
    $('metricFees').className = unrealizedClass;
    setMetric('metricPnlLabel', 'metricPnl', 'metricPnlNote', 'Unrealized return', valuation.unrealizedPct == null ? '—' : formatPercent(valuation.unrealizedPct), valuation.unrealizedPct == null ? (livePricingEnabled ? 'Waiting for fresh market prices' : 'Turn on live pricing') : 'Market value vs cost basis');
    $('metricPnl').className = unrealizedClass;
  }
  if (overviewPurpose === 'TRADE') {
    $('metricFees').className = '';
    $('metricPnl').className = performance.maxDrawdown > 0n ? 'negative' : '';
  }
}

function analyticsStat(label, value, note = '') {
  return `<div class="analytics-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`;
}

function renderAnalyticsStats(list, analysis, performance, valuation) {
  const el = $('analyticsStats');
  if (!el) return;
  if (overviewPurpose === 'TRADE') {
    $('analyticsEyebrow').textContent = 'TRADING QUALITY';
    $('analyticsTitle').textContent = 'Performance diagnostics';
    $('analyticsDescription').textContent = 'Matched sell events use weighted-average cost. This is a performance lens, not a claim that each sell is a complete round-trip trade.';
    const openCost = analysis.holdings.filter(h => h.quote === 'PHP' && h.netQty > 0n).reduce((sum, h) => sum + h.knownCost, 0n);
    const liveCoverage = valuation.openPositions ? `${valuation.valuedPositions}/${valuation.openPositions} live-valued` : 'No open PHP positions';
    el.innerHTML = [
      analyticsStat('Matched exits', String(analysis.realizedEvents.length), `${list.length} trading transaction${list.length === 1 ? '' : 's'} · ${dateRangeText(list)}`),
      analyticsStat('Expectancy / exit', performance.expectancy == null ? '—' : formatMoney(performance.expectancy), 'Expected realized P&L per directional matched sell'),
      analyticsStat('Average win', performance.avgWin == null ? '—' : formatMoney(performance.avgWin), `${performance.wins} winning exit${performance.wins === 1 ? '' : 's'}`),
      analyticsStat('Average loss', performance.avgLoss == null ? '—' : formatMoney(performance.avgLoss), `${performance.losses} losing exit${performance.losses === 1 ? '' : 's'}`),
      analyticsStat('Open value', valuation.marketValue == null ? '—' : formatMoney(valuation.marketValue), livePricingEnabled ? liveCoverage : 'Turn on live pricing'),
      analyticsStat('Open unrealized', valuation.unrealized == null ? '—' : formatMoney(valuation.unrealized), valuation.unrealizedPct == null ? liveCoverage : formatPercent(valuation.unrealizedPct)),
      analyticsStat('PHP fees', formatMoney(analysis.feesPhp), 'Known PHP-denominated fees'),
      analyticsStat('Open cost basis', formatMoney(openCost), `${valuation.openPositions} open PHP position${valuation.openPositions === 1 ? '' : 's'}`)
    ].join('');
  } else {
    $('analyticsEyebrow').textContent = 'LONG-TERM HEALTH';
    $('analyticsTitle').textContent = 'Accumulation snapshot';
    $('analyticsDescription').textContent = 'Long-term analytics emphasize capital deployed, open cost basis, concentration, and live unrealized return instead of short-term win/loss statistics.';
    const buys = list.filter(tx => tx.side === 'BUY' && tx.quote === 'PHP');
    const sells = list.filter(tx => tx.side === 'SELL' && tx.quote === 'PHP');
    const avgBuy = buys.length ? analysis.buyVolumePhp / BigInt(buys.length) : null;
    const allocationRows = analysis.holdings.filter(h => h.quote === 'PHP' && h.knownCost > 0n);
    const totalCost = allocationRows.reduce((sum, h) => sum + h.knownCost, 0n);
    const largest = allocationRows.reduce((best, h) => !best || h.knownCost > best.knownCost ? h : best, null);
    const concentration = largest && totalCost > 0n ? (fixedToNumber(largest.knownCost) / fixedToNumber(totalCost)) * 100 : null;
    el.innerHTML = [
      analyticsStat('Transactions', String(list.length), dateRangeText(list)),
      analyticsStat('Gross purchases', formatMoney(analysis.buyVolumePhp), `${buys.length} PHP buy${buys.length === 1 ? '' : 's'}`),
      analyticsStat('Average purchase', avgBuy == null ? '—' : formatMoney(avgBuy), 'Average PHP buy size'),
      analyticsStat('Realized P&L', analysis.realizedEvents.length ? formatMoney(analysis.realizedPnlPhp) : '—', `${sells.length} PHP sell${sells.length === 1 ? '' : 's'}`),
      analyticsStat('Largest allocation', largest ? `${largest.base} ${formatPercent(concentration)}` : '—', 'Share of open cost basis'),
      analyticsStat('Open positions', String(valuation.openPositions), formatMoney(valuation.totalCostBasis)),
      analyticsStat('PHP fees', formatMoney(analysis.feesPhp), 'Known PHP-denominated fees'),
      analyticsStat('Live coverage', valuation.openPositions ? `${valuation.valuedPositions}/${valuation.openPositions}` : '—', livePricingEnabled ? 'Open PHP positions with fresh market prices' : 'Live pricing is off')
    ].join('');
  }
}

function renderLineChart(el, points, { emptyText, footerLeft, footerRight } = {}) {
  if (!points.length) {
    el.className = 'performance-chart empty-state';
    el.textContent = emptyText || 'No data yet.';
    return;
  }
  const width = 640, height = 180, padX = 18, padY = 18;
  const values = points.map(point => fixedToNumber(point.value));
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const x = index => points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2);
  const y = value => padY + ((max - value) / span) * (height - padY * 2);
  const polyline = points.map((point, index) => `${x(index).toFixed(1)},${y(fixedToNumber(point.value)).toFixed(1)}`).join(' ');
  const zeroY = y(0).toFixed(1);
  el.className = 'performance-chart';
  el.innerHTML = `<svg class="performance-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Performance line chart"><line class="chart-zero" x1="${padX}" y1="${zeroY}" x2="${width - padX}" y2="${zeroY}"/><polyline class="chart-line" points="${polyline}" vector-effect="non-scaling-stroke"/>${points.map((point, index) => `<circle class="chart-point" cx="${x(index).toFixed(1)}" cy="${y(fixedToNumber(point.value)).toFixed(1)}" r="3"/>`).join('')}</svg><div class="chart-footer"><span>${escapeHtml(footerLeft || '')}</span><strong>${escapeHtml(footerRight || '')}</strong></div>`;
}

function renderPerformanceChart(list, analysis, performance) {
  const el = $('performanceChart');
  if (!el) return;
  if (overviewPurpose === 'TRADE') {
    $('performanceEyebrow').textContent = 'REALIZED PERFORMANCE';
    $('performanceTitle').textContent = 'Cumulative P&L';
    renderLineChart(el, performance.curve, {
      emptyText: 'No matched PHP sell events yet. Add prior buys and matched sells to unlock trading analytics.',
      footerLeft: performance.curve.length ? shortDate(performance.curve[0].date) : '',
      footerRight: performance.curve.length ? `Latest ${formatMoney(performance.curve[performance.curve.length - 1].value)}` : ''
    });
    return;
  }

  $('performanceEyebrow').textContent = 'ACCUMULATION';
  $('performanceTitle').textContent = 'Cumulative purchases';
  let cumulative = 0n;
  const points = list
    .filter(tx => tx.side === 'BUY' && tx.quote === 'PHP')
    .sort((a, b) => parseDateMs(a.date) - parseDateMs(b.date))
    .map(tx => ({ date: tx.date, value: (cumulative += parseFixed(tx.total)) }));
  renderLineChart(el, points, {
    emptyText: 'No long-term PHP purchases yet.',
    footerLeft: points.length ? shortDate(points[0].date) : '',
    footerRight: points.length ? `Gross purchases ${formatMoney(points[points.length - 1].value)}` : ''
  });
}

function renderWarnings(analysis = analyticsCache) {
  const el = $('warningBanner');
  if (!analysis?.warnings?.length) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = analysis.warnings.join(' ');
}

function holdingUiKey(holding) {
  return `${transactionPurpose(holding)}:${holding.pair}`;
}

function updateHoldingsDetailToggle(visibleHoldings) {
  const button = $('toggleHoldingsDetailsBtn');
  if (!button) return;
  const keys = visibleHoldings.map(holdingUiKey);
  const allExpanded = keys.length > 0 && keys.every(key => expandedHoldingKeys.has(key));
  button.disabled = keys.length === 0;
  button.classList.toggle('expanded', allExpanded);
  button.setAttribute('aria-pressed', String(allExpanded));
  button.setAttribute('aria-label', allExpanded ? 'Collapse all holding details' : 'Expand all holding details');
  const label = button.querySelector('span');
  if (label) label.textContent = allExpanded ? 'Collapse all' : 'Expand all';
}

function updateHoldingsPurposeTabs() {
  document.querySelectorAll('[data-holdings-purpose]').forEach(button => {
    const active = button.dataset.holdingsPurpose === holdingsPurpose;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function renderHoldings() {
  const body = $('holdingsBody');
  const cards = $('holdingsCards');
  updateHoldingsPurposeTabs();
  const visibleHoldings = analyticsCache.holdings.filter(h => transactionPurpose(h) === holdingsPurpose && h.netQty > 0n);
  updateHoldingsDetailToggle(visibleHoldings);
  if (!visibleHoldings.length) {
    const label = purposeLabel(holdingsPurpose).toLowerCase();
    body.innerHTML = `<tr><td colspan="7" class="empty-cell">No ${label} holdings yet.</td></tr>`;
    if (cards) cards.innerHTML = `<div class="empty-card">No ${label} holdings yet.</div>`;
    return;
  }

  const rows = visibleHoldings.map(h => {
    const avg = h.knownQty > 0n ? divFixed(h.knownCost, h.knownQty) : null;
    const quantity = formatFixed(h.netQty, 10);
    const symbol = marketSymbolForHolding(h);
    const market = symbol ? marketPrices.get(symbol) : null;
    let marketValue = null;
    let unrealized = null;
    const marketFresh = isFreshMarketQuote(market);
    if (marketFresh && market?.lastPrice && h.netQty > 0n) {
      try {
        marketValue = mulFixed(h.netQty, parseFixed(market.lastPrice));
        if (h.quote === 'PHP' && h.knownCost >= 0n) unrealized = marketValue - h.knownCost;
      } catch { marketValue = null; }
    }
    const liveMarket = !livePricingEnabled ? 'Off' : marketFresh && market?.lastPrice ? formatMoney(parseFixed(market.lastPrice)) : (market?.updatedAt ? 'Stale' : (symbol ? 'Waiting…' : '—'));
    const liveBid = !livePricingEnabled ? 'Off' : marketFresh && market?.bidPrice ? formatMoney(parseFixed(market.bidPrice)) : (market?.updatedAt ? 'Stale' : (symbol ? 'Waiting…' : '—'));
    const quoteAge = market?.updatedAt ? Math.max(0, Math.round((Date.now() - market.updatedAt) / 1000)) : null;
    const valueText = marketValue == null ? '—' : formatMoney(marketValue);
    const pnlText = unrealized == null ? '—' : formatMoney(unrealized);
    const pnlClass = unrealized == null ? '' : unrealized > 0n ? 'positive' : unrealized < 0n ? 'negative' : '';
    const avgText = avg == null ? '—' : `${escapeHtml(h.quote)} ${formatFixed(avg, 6)}`;
    const costText = h.quote === 'PHP' ? formatMoney(h.knownCost) : `${escapeHtml(h.quote)} ${formatFixed(h.knownCost, 4)}`;
    const key = holdingUiKey(h);
    const expanded = expandedHoldingKeys.has(key);
    return { h, key, expanded, quantity, liveMarket, liveBid, quoteAge, valueText, pnlText, pnlClass, avgText, costText };
  });

  body.innerHTML = rows.map(({ h, quantity, liveMarket, valueText, pnlText, pnlClass, avgText, costText }) => `<tr>
    <td><strong>${escapeHtml(h.base)}</strong></td>
    <td>${quantity}</td>
    <td>${avgText}</td>
    <td>${costText}</td>
    <td>${liveMarket}</td>
    <td><strong>${valueText}</strong></td>
    <td class="${pnlClass}">${pnlText}</td>
  </tr>`).join('');

  if (cards) cards.innerHTML = rows.map(({ h, key, expanded, quantity, liveMarket, liveBid, quoteAge, valueText, pnlText, pnlClass, avgText, costText }) => `<article class="holding-card${expanded ? ' expanded' : ''}">
    <div class="holding-summary">
      <div class="holding-summary-main">
        <div class="asset-name">${escapeHtml(h.base)}</div>
        <div class="card-sub">${escapeHtml(h.base)}/${escapeHtml(h.quote)} · ${quantity}</div>
      </div>
      <div class="holding-summary-value">
        <div class="asset-value">${valueText}</div>
        <div class="holding-summary-pnl ${pnlClass}">${pnlText === '—' ? (livePricingEnabled ? 'Waiting for price' : 'Live pricing off') : `${pnlText} unrealized`}</div>
      </div>
      <button class="detail-toggle holding-detail-toggle" type="button" data-holding-action="toggle-details" data-holding-key="${escapeHtml(key)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeHtml(h.base)} holding details"><svg><use href="#i-chevron"/></svg></button>
    </div>
    <div class="holding-detail-panel"${expanded ? '' : ' hidden'}>
      <div class="value-grid">
        <div class="value-cell"><span>Quantity</span><strong>${quantity}</strong></div>
        <div class="value-cell"><span>Market price</span><strong>${liveMarket}</strong></div>
        <div class="value-cell"><span>Sell bid</span><strong>${liveBid}</strong></div>
        <div class="value-cell"><span>Avg cost</span><strong>${avgText}</strong></div>
        <div class="value-cell"><span>Cost basis</span><strong>${costText}</strong></div>
        <div class="value-cell"><span>Unrealized</span><strong class="${pnlClass}">${pnlText}</strong></div>
        <div class="value-cell"><span>Bucket</span><strong>${escapeHtml(purposeLabel(h))}</strong></div>
        <div class="value-cell"><span>Quote age</span><strong>${quoteAge == null ? '—' : `${quoteAge}s`}</strong></div>
      </div>
    </div>
  </article>`).join('');
}

function renderAllocation(analysis = analyticsCache) {
  const el = $('allocationChart');
  const title = $('allocationTitle');
  if (title) title.textContent = `${purposeLabel(overviewPurpose)} cost-basis allocation`;
  const grouped = new Map();
  for (const h of (analysis?.holdings || []).filter(h => h.quote === 'PHP' && h.knownCost > 0n)) {
    const key = `${h.base}/${h.quote}`;
    const row = grouped.get(key) || { base: h.base, quote: h.quote, knownCost: 0n };
    row.knownCost += h.knownCost;
    grouped.set(key, row);
  }
  const rows = [...grouped.values()].sort((a, b) => Number(b.knownCost - a.knownCost));
  if (!rows.length) {
    el.className = 'bar-chart empty-state';
    el.textContent = `No ${purposeLabel(overviewPurpose).toLowerCase()} open cost basis yet.`;
    return;
  }
  el.className = 'bar-chart';
  const total = rows.reduce((sum, row) => sum + row.knownCost, 0n);
  el.innerHTML = rows.slice(0, 8).map(r => {
    const pct = total > 0n ? (fixedToNumber(r.knownCost) / fixedToNumber(total)) * 100 : 0;
    return `<div class="bar-row">
      <div class="bar-label">${escapeHtml(r.base)}</div>
      <progress class="bar-progress" max="100" value="${pct.toFixed(2)}" aria-label="${escapeHtml(r.base)} ${pct.toFixed(1)} percent allocation"></progress>
      <div class="bar-value"><strong>${pct.toFixed(1)}%</strong><span>${formatMoney(r.knownCost)}</span></div>
    </div>`;
  }).join('');
}

function filteredTransactions() {
  const q = $('searchInput')?.value.trim().toLowerCase() || '';
  const side = $('sideFilter')?.value || '';
  return transactions.filter(tx => {
    if (side && tx.side !== side) return false;
    return !q || [tx.id, tx.pair, tx.side, tx.type, purposeLabel(tx), tx.feeAsset, tx.source, tx.notes].some(v => String(v ?? '').toLowerCase().includes(q));
  });
}

function netAcquiredForTransaction(tx) {
  const acquiredAsset = tx.side === 'BUY' ? tx.base : tx.quote;
  let amount = tx.side === 'BUY' ? parseFixed(tx.executed) : parseFixed(tx.total);
  const fee = parseFixed(tx.feeAmount || '0');
  if (tx.feeAsset === acquiredAsset && fee > 0n) amount = amount > fee ? amount - fee : 0n;
  return { amount, asset: acquiredAsset };
}

function fixedCopyValue(value) {
  return formatFixed(value, 18).replace(/,/g, '');
}

async function copyText(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch {}
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand?.('copy');
  input.remove();
  if (!copied) throw new Error('Copy is not available in this browser.');
}

function updateLedgerDetailsToggle(filtered = filteredTransactions()) {
  for (const key of [...expandedRecordKeys]) {
    if (!transactions.some(tx => tx._recordKey === key)) expandedRecordKeys.delete(key);
  }
  const visibleKeys = filtered.map(tx => tx._recordKey);
  const allExpanded = visibleKeys.length > 0 && visibleKeys.every(key => expandedRecordKeys.has(key));
  const button = $('toggleLedgerDetailsBtn');
  if (!button) return;
  button.disabled = visibleKeys.length === 0;
  button.setAttribute('aria-pressed', String(allExpanded));
  button.setAttribute('aria-label', allExpanded ? 'Collapse all visible transaction details' : 'Expand all visible transaction details');
  const label = button.querySelector('span');
  if (label) label.textContent = allExpanded ? 'Collapse all' : 'Expand all';
  button.classList.toggle('expanded', allExpanded);
}

function updateSelectionUi(filtered = filteredTransactions()) {
  for (const key of [...selectedRecordKeys]) {
    if (!transactions.some(tx => tx._recordKey === key)) selectedRecordKeys.delete(key);
  }
  const visibleKeys = filtered.map(tx => tx._recordKey);
  const selectedVisible = visibleKeys.filter(key => selectedRecordKeys.has(key)).length;
  const selectAll = $('selectAllVisible');
  if (selectAll) {
    selectAll.checked = visibleKeys.length > 0 && selectedVisible === visibleKeys.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleKeys.length;
  }
  const deleteBtn = $('deleteSelectedBtn');
  if (deleteBtn) {
    deleteBtn.disabled = selectedRecordKeys.size === 0;
    const label = selectedRecordKeys.size ? `Delete ${selectedRecordKeys.size} selected transaction${selectedRecordKeys.size === 1 ? '' : 's'}` : 'Delete selected transactions';
    deleteBtn.setAttribute('aria-label', label);
    deleteBtn.title = label;
  }
  const selectBtn = $('selectVisibleBtn');
  if (selectBtn) {
    const allSelected = visibleKeys.length > 0 && selectedVisible === visibleKeys.length;
    const label = allSelected ? 'Clear visible selection' : 'Select visible transactions';
    selectBtn.setAttribute('aria-label', label);
    selectBtn.title = label;
    selectBtn.classList.toggle('active', allSelected);
  }
  const count = $('selectionCount');
  if (count) {
    count.hidden = selectedRecordKeys.size === 0;
    count.textContent = selectedRecordKeys.size ? `${selectedRecordKeys.size} selected` : '';
  }
}
function renderTransactions() {
  const body = $('transactionsBody');
  const cards = $('transactionsCards');
  const filtered = filteredTransactions();
  if (!filtered.length) {
    const message = transactions.length ? 'No matches.' : 'No transactions yet.';
    body.innerHTML = `<tr><td colspan="13" class="empty-cell">${message}</td></tr>`;
    if (cards) cards.innerHTML = `<div class="empty-card">${message}</div>`;
    updateSelectionUi(filtered);
    updateLedgerDetailsToggle(filtered);
    return;
  }

  const rows = filtered.map(tx => {
    const notes = analyticsCache.txStatus.get(tx.id) || [];
    const warn = notes.some(n => n.includes('Missing') || n.includes('differs') || n.includes('inferred'));
    const feeText = `${formatFixed(parseFixed(tx.feeAmount || '0'), 12)} ${escapeHtml(tx.feeAsset || '')}`.trim();
    const checked = selectedRecordKeys.has(tx._recordKey);
    const expanded = expandedRecordKeys.has(tx._recordKey);
    const totalText = tx.quote === 'PHP' ? formatMoney(parseFixed(tx.total)) : `${formatFixed(parseFixed(tx.total), 8)} ${escapeHtml(tx.quote)}`;
    const priceText = tx.quote === 'PHP' ? formatMoney(parseFixed(tx.price)) : `${formatFixed(parseFixed(tx.price), 8)} ${escapeHtml(tx.quote)}`;
    const net = netAcquiredForTransaction(tx);
    const netCopy = fixedCopyValue(net.amount);
    const netText = `${formatFixed(net.amount, 12)} ${escapeHtml(net.asset)}`;
    const purpose = purposeLabel(tx);
    return { tx, notes, warn, feeText, checked, expanded, totalText, priceText, netCopy, netText, purpose };
  });

  body.innerHTML = rows.map(({ tx, notes, warn, feeText, checked, totalText, priceText, netCopy, netText, purpose }) => `<tr>
    <td class="select-cell"><input type="checkbox" data-select-key="${escapeHtml(tx._recordKey)}" aria-label="Select ${escapeHtml(tx.pair)} transaction"${checked ? ' checked' : ''}></td>
    <td title="${escapeHtml(tx.date)}">${escapeHtml(shortDate(tx.date))}</td>
    <td title="ID ${escapeHtml(tx.id)}"><strong>${escapeHtml(tx.pair)}</strong></td>
    <td><span class="purpose-badge ${transactionPurpose(tx).toLowerCase()}">${escapeHtml(purpose)}</span></td>
    <td><span class="side ${tx.side.toLowerCase()}">${escapeHtml(tx.side)}</span></td>
    <td>${priceText}</td>
    <td>${formatFixed(parseFixed(tx.executed), 10)}</td>
    <td><strong>${totalText}</strong></td>
    <td>${feeText}</td>
    <td><div class="net-copy-cell"><strong>${netText}</strong><button type="button" class="inline-copy icon-only" data-action="copy-net" data-key="${escapeHtml(tx._recordKey)}" aria-label="Copy net acquired amount ${escapeHtml(netCopy)}" title="Copy net acquired amount">${icon('copy')}</button></div></td>
    <td class="note-cell" title="${escapeHtml(tx.notes || '')}">${tx.notes ? escapeHtml(tx.notes) : '—'}</td>
    <td class="status ${warn ? 'warn' : ''}" title="${escapeHtml(notes.join(' · '))}">${notes.length ? escapeHtml(notes[0]) : 'OK'}</td>
    <td><div class="row-actions"><button type="button" class="table-action icon-only" data-action="edit" data-key="${escapeHtml(tx._recordKey)}" aria-label="Edit transaction" title="Edit">${icon('edit')}</button><button type="button" class="table-action danger icon-only" data-action="delete" data-key="${escapeHtml(tx._recordKey)}" aria-label="Delete transaction" title="Delete">${icon('trash')}</button></div></td>
  </tr>`).join('');

  if (cards) cards.innerHTML = rows.map(({ tx, notes, warn, feeText, checked, expanded, totalText, priceText, netCopy, netText, purpose }) => `<article class="transaction-card${checked ? ' selected' : ''}${expanded ? ' expanded' : ''}" data-card-key="${escapeHtml(tx._recordKey)}">
    <div class="transaction-summary">
      <input type="checkbox" data-select-key="${escapeHtml(tx._recordKey)}" aria-label="Select ${escapeHtml(tx.pair)} transaction"${checked ? ' checked' : ''}>
      <div class="transaction-summary-main">
        <div class="transaction-summary-top"><strong class="pair-name">${escapeHtml(tx.pair)}</strong><span class="side ${tx.side.toLowerCase()}">${escapeHtml(tx.side)}</span></div>
        <div class="card-sub">${escapeHtml(shortDate(tx.date))} · ${escapeHtml(purpose)}</div>
      </div>
      <div class="transaction-net-summary">
        <span>Net acquired</span>
        <div><strong>${netText}</strong><button type="button" class="inline-copy icon-only" data-action="copy-net" data-key="${escapeHtml(tx._recordKey)}" aria-label="Copy net acquired amount ${escapeHtml(netCopy)}" title="Copy net acquired amount">${icon('copy')}</button></div>
        ${tx.side === 'BUY' ? `<div class="transaction-spend-summary"><span>Total spent</span><strong>${totalText}</strong></div>` : ''}
      </div>
      <button type="button" class="detail-toggle icon-only" data-action="toggle-details" data-key="${escapeHtml(tx._recordKey)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escapeHtml(tx.pair)} transaction details" title="${expanded ? 'Collapse details' : 'Expand details'}">${icon('chevron')}</button>
    </div>
    <div class="transaction-detail-panel"${expanded ? '' : ' hidden'}>
      <div class="tx-detail-grid">
        <div class="value-cell"><span>Type</span><strong>${escapeHtml(tx.type)}</strong></div>
        <div class="value-cell"><span>Purpose</span><strong>${escapeHtml(purpose)}</strong></div>
        <div class="value-cell"><span>Price</span><strong>${priceText}</strong></div>
        <div class="value-cell"><span>Executed</span><strong>${formatFixed(parseFixed(tx.executed), 12)} ${escapeHtml(tx.base)}</strong></div>
        <div class="value-cell"><span>Total</span><strong>${totalText}</strong></div>
        <div class="value-cell"><span>Fee</span><strong>${feeText}</strong></div>
        <div class="value-cell span-detail"><span>ID</span><strong class="break-value">${escapeHtml(tx.id)}</strong></div>
        <div class="tx-status ${warn ? 'warn' : ''}">${notes.length ? escapeHtml(notes[0]) : 'OK'}</div>
      </div>
      ${tx.notes ? `<div class="tx-notes">${escapeHtml(tx.notes)}</div>` : ''}
      <div class="transaction-card-actions"><button type="button" class="table-action icon-only" data-action="edit" data-key="${escapeHtml(tx._recordKey)}" aria-label="Edit transaction" title="Edit">${icon('edit')}</button><button type="button" class="table-action danger icon-only" data-action="delete" data-key="${escapeHtml(tx._recordKey)}" aria-label="Delete transaction" title="Delete">${icon('trash')}</button></div>
    </div>
  </article>`).join('');
  updateSelectionUi(filtered);
  updateLedgerDetailsToggle(filtered);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

async function importCsvFile(file) {
  if (file.size > MAX_CSV_BYTES) throw new Error('CSV is too large. Maximum supported size is 5 MB.');
  const text = await file.text();
  const imported = csvRowsToTransactions(text);
  const existingIds = new Set(transactions.map(t => t.id));
  const batchIds = new Set();
  let added = 0;
  let skipped = 0;
  for (const tx of imported) {
    if (existingIds.has(tx.id) || batchIds.has(tx.id)) { skipped++; continue; }
    batchIds.add(tx.id);
    await saveTransaction(tx);
    added++;
  }
  renderAll();
  toast(`Imported ${added} transaction${added === 1 ? '' : 's'}${skipped ? ` · ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}.`);
}

async function exportEncryptedBackup() {
  const vault = await idbGet('meta', 'vault');
  const records = await idbGetAll('records');
  const backup = { format: 'trade-vault-backup', version: 1, exportedAt: new Date().toISOString(), vault, records };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Encrypted backup downloaded.');
}

async function restoreEncryptedBackup(file) {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup is too large. Maximum supported size is 25 MB.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error('Backup is not valid JSON.'); }
  const backup = validateBackupPayload(parsed);
  if (!confirm(`Restore ${backup.records.length} encrypted record(s)? This replaces the current local vault.`)) return;
  await idbReplaceVault(backup.vault, backup.records);
  pinConfigured = false;
  await loadGeneralSettings();
  lockVault();
  toast('Backup restored atomically. Unlock with the backup passphrase, then set a new local PIN if wanted.');
}

function normalizeFeeRatePercent(value) {
  const normalized = normalizeDecimal(value);
  const rate = parseFixed(normalized);
  if (rate > parseFixed('100')) throw new Error('Fee percentage must be between 0 and 100.');
  return normalized;
}

function configuredFeeProfile(side) {
  const normalizedSide = side === 'SELL' ? 'SELL' : 'BUY';
  return {
    mode: normalizedSide === 'SELL' ? 'QUOTE' : 'BASE',
    ratePercent: parseFixed(feeRatePercentBySide[normalizedSide]),
    side: normalizedSide
  };
}

function normalizeAutoLockMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_AUTO_LOCK_MINUTES || minutes > MAX_AUTO_LOCK_MINUTES) {
    throw new Error(`Auto-lock must be a whole number from ${MIN_AUTO_LOCK_MINUTES} to ${MAX_AUTO_LOCK_MINUTES} minutes.`);
  }
  return minutes;
}

async function loadGeneralSettings() {
  const stored = await idbGet('meta', 'settings');
  const next = { BUY: DEFAULT_BUY_FEE_RATE_PERCENT_TEXT, SELL: DEFAULT_SELL_FEE_RATE_PERCENT_TEXT };
  let nextAutoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
  if (stored) {
    try { next.BUY = normalizeFeeRatePercent(stored.buyFeePercent ?? next.BUY); } catch {}
    try { next.SELL = normalizeFeeRatePercent(stored.sellFeePercent ?? next.SELL); } catch {}
    try { nextAutoLockMinutes = normalizeAutoLockMinutes(stored.autoLockMinutes ?? nextAutoLockMinutes); } catch {}
  }
  feeRatePercentBySide = next;
  autoLockMinutes = nextAutoLockMinutes;
}

function populateSettingsForm() {
  const form = $('settingsForm');
  if (!form) return;
  form.elements.buyFeePercent.value = feeRatePercentBySide.BUY;
  form.elements.sellFeePercent.value = feeRatePercentBySide.SELL;
  form.elements.autoLockMinutes.value = String(autoLockMinutes);
  form.elements.pinPassphrase.value = '';
  form.elements.newPin.value = '';
  form.elements.confirmPin.value = '';
  $('pinStatus').textContent = pinConfigured ? 'PIN enabled on this device' : 'No PIN set yet';
}

async function saveGeneralSettings(form) {
  const buyFeePercent = normalizeFeeRatePercent(form.elements.buyFeePercent.value);
  const sellFeePercent = normalizeFeeRatePercent(form.elements.sellFeePercent.value);
  const nextAutoLockMinutes = normalizeAutoLockMinutes(form.elements.autoLockMinutes.value);
  const pinPassphrase = String(form.elements.pinPassphrase.value || '');
  const newPin = String(form.elements.newPin.value || '').trim();
  const confirmPin = String(form.elements.confirmPin.value || '').trim();
  const wantsPinChange = Boolean(pinPassphrase || newPin || confirmPin);

  if (wantsPinChange) {
    if (!pinPassphrase) throw new Error('Enter the vault passphrase to set or change the PIN.');
    validatePin(newPin);
    if (newPin !== confirmPin) throw new Error('PINs do not match.');
    await savePinForPassphrase(newPin, pinPassphrase);
  }

  await idbPut('meta', {
    key: 'settings', version: 2, buyFeePercent, sellFeePercent,
    autoLockMinutes: nextAutoLockMinutes
  });
  feeRatePercentBySide = { BUY: buyFeePercent, SELL: sellFeePercent };
  autoLockMinutes = nextAutoLockMinutes;
  resetIdleTimer();
  updateManualCalculations();
  return { pinChanged: wantsPinChange };
}

function updateManualCalculations(form = $('manualForm')) {
  if (!form) return;
  const priceEl = form.elements.price;
  const qtyEl = form.elements.executed;
  const totalEl = form.elements.total;
  const feeEl = form.elements.fee;
  const noteEl = $('feeRuleNote');
  const pair = String(form.elements.pair.value || '').trim().toUpperCase();
  const side = String(form.elements.side.value || 'BUY').toUpperCase();
  const [base = '', quote = ''] = pair.split('/');
  const profile = configuredFeeProfile(side);
  const rateText = formatFixed(profile.ratePercent, 6).replace(/,/g, '');
  const basisText = profile.mode === 'BASE' ? `executed ${base || 'base'} quantity` : `total ${quote || 'quote'} value`;
  const assetText = profile.mode === 'BASE' ? (base || 'base asset') : (quote || 'quote asset');
  if (noteEl) noteEl.textContent = `${side}: ${rateText}% of ${basisText}, charged in ${assetText} — from General settings. The setting is used for new transactions only; Fee override still wins.`;

  try {
    const price = parseFixed(priceEl.value);
    const qty = parseFixed(qtyEl.value);
    if (price <= 0n || qty <= 0n) throw new Error('incomplete');
    const calculatedTotal = mulFixed(price, qty);
    const reportedTotalText = String(form.elements.reportedTotal?.value || '').trim();
    const effectiveTotal = reportedTotalText ? parseFixed(reportedTotalText) : calculatedTotal;
    totalEl.value = reportedTotalText || formatFixed(calculatedTotal, 18).replace(/,/g, '');

    const feeAsset = profile.mode === 'BASE' ? base : quote;
    const feeBasis = profile.mode === 'BASE' ? qty : effectiveTotal;
    const feeAmount = percentOfFixed(feeBasis, profile.ratePercent);
    feeEl.value = feeAsset ? `${formatFixed(feeAmount, 18).replace(/,/g, '')} ${feeAsset}` : '';
  } catch {
    totalEl.value = '';
    feeEl.value = '';
  }
}

function localDateTimeInputValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ensureManualDefaults(form = $('manualForm')) {
  if (!form) return;
  if (!form.elements.date.value) form.elements.date.value = localDateTimeInputValue();
  if (!form.elements.id.value) form.elements.id.value = makeUniqueKey('manual');
}

function dateToInputValue(value) {
  const match = String(value || '').match(/^(\d{4}-\d{1,2}-\d{1,2})[ T](\d{1,2}:\d{2})/);
  if (!match) return localDateTimeInputValue();
  const [y, m, d] = match[1].split('-');
  const [hh, mm] = match[2].split(':');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function setManualMode(tx = null) {
  const form = $('manualForm');
  form.reset();
  setManualStatus('');
  if ($('receiptTextInput')) $('receiptTextInput').value = '';
  editingRecordKey = tx?._recordKey || null;
  $('manualEyebrow').textContent = 'TRANSACTION';
  $('manualTitle').textContent = tx ? 'Edit transaction' : 'Add transaction';
  $('saveManualBtn').setAttribute('aria-label', tx ? 'Save changes' : 'Save transaction');
  $('saveManualBtn').title = tx ? 'Save changes' : 'Save transaction';

  if (!tx) {
    ensureManualDefaults(form);
    updateManualCalculations(form);
    return;
  }

  form.elements.date.value = dateToInputValue(tx.date);
  form.elements.id.value = tx.id;
  form.elements.pair.value = tx.pair;
  form.elements.type.value = ['LIMIT', 'MARKET', 'OTHER'].includes(tx.type) ? tx.type : 'OTHER';
  form.elements.side.value = tx.side;
  form.elements.purpose.value = transactionPurpose(tx);
  form.elements.price.value = tx.price;
  form.elements.executed.value = tx.executed;
  form.elements.notes.value = tx.notes || '';
  form.elements.reportedTotal.value = '';
  updateManualCalculations(form);
  form.elements.feeOverride.value = `${tx.feeAmount || '0'} ${tx.feeAsset || tx.quote}`.trim();
  setManualStatus(`Editing ${tx.source === 'csv' ? 'an imported' : 'a manual'} transaction. Saving replaces only this encrypted local record.`, 'info');
}

function openEditTransaction(recordKey) {
  const tx = transactions.find(item => item._recordKey === recordKey);
  if (!tx) return toast('Transaction was not found.');
  setManualMode(tx);
  $('manualDialog').showModal();
}

function setManualStatus(message = '', kind = '') {
  const el = $('manualStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `manual-status span-2${kind ? ` ${kind}` : ''}`;
}

function validateManualForm(form) {
  ensureManualDefaults(form);
  const pair = String(form.elements.pair.value || '').trim().toUpperCase();
  if (!/^([A-Z0-9._-]+)\/([A-Z0-9._-]+)$/.test(pair)) throw new Error('Enter a pair like BTC/PHP.');
  if (!String(form.elements.price.value || '').trim()) throw new Error('Executed price is required.');
  if (!String(form.elements.executed.value || '').trim()) throw new Error('Executed quantity is required.');
  const price = parseFixed(form.elements.price.value);
  const qty = parseFixed(form.elements.executed.value);
  if (price <= 0n) throw new Error('Executed price must be greater than zero.');
  if (qty <= 0n) throw new Error('Executed quantity must be greater than zero.');
  updateManualCalculations(form);
  if (!String(form.elements.total.value || '').trim()) throw new Error('Total quote value could not be calculated.');
  if (!String(form.elements.fee.value || '').trim() && !String(form.elements.feeOverride.value || '').trim()) throw new Error('Fee could not be calculated. Check the pair, price, and quantity.');
}

function manualFormToTransaction(form) {
  validateManualForm(form);
  const data = new FormData(form);
  const dateValue = String(data.get('date') || '').replace('T', ' ');
  const feeOverride = String(data.get('feeOverride') || '').trim();
  return normalizeTransaction({
    date: dateValue.length === 16 ? `${dateValue}:00` : dateValue,
    id: data.get('id'),
    pair: data.get('pair'),
    type: data.get('type'),
    side: data.get('side'),
    purpose: data.get('purpose'),
    price: data.get('price'),
    executed: data.get('executed'),
    total: String(data.get('reportedTotal') || '').trim() || data.get('total'),
    fee: feeOverride || data.get('fee'),
    notes: data.get('notes')
  }, 'manual');
}

function cleanImportedNumber(value) {
  const text = String(value || '').trim().replace(/,/g, '').replace(/\s+/g, '');
  return /^\.\d+$/.test(text) ? `0${text}` : text;
}

function parseImportedDateTime(value) {
  const text = String(value || '').trim();
  let match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (match) {
    const [, year, month, day, hour, minute, second = '00'] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}:${second}`;
  }

  // Coins.ph / Google Lens commonly returns MM/DD/YYYY.
  match = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (match) {
    const [, month, day, year, hour, minute, second = '00'] = match;
    const monthNumber = Number(month), dayNumber = Number(day);
    if (monthNumber >= 1 && monthNumber <= 12 && dayNumber >= 1 && dayNumber <= 31) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}:${second}`;
    }
  }
  return '';
}

function parseNumberAsset(value) {
  const match = String(value || '').match(/([0-9][0-9,]*(?:\.\d+)?|\.\d+)\s*([A-Z][A-Z0-9._-]{1,11})?/i);
  if (!match) return null;
  return { number: cleanImportedNumber(match[1]), asset: (match[2] || '').toUpperCase() };
}

function parseOrderText(rawText) {
  const sourceText = String(rawText || '');
  if (sourceText.length > MAX_RECEIPT_TEXT_LENGTH) throw new Error('Copied trade text is too large.');
  const lines = sourceText
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean);
  if (!lines.length) return {};

  const result = {};
  const joined = lines.join('\n');
  let baseAsset = '';
  let quoteAsset = '';

  const valueAfterLabel = (labelPattern, lookahead = 2) => {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!labelPattern.test(line)) continue;
      labelPattern.lastIndex = 0;
      const remainder = line.replace(labelPattern, '').replace(/^\s*[:.-]?\s*/, '').trim();
      if (remainder) return remainder;
      for (let offset = 1; offset <= lookahead && index + offset < lines.length; offset += 1) {
        const candidate = lines[index + offset].trim();
        if (candidate) return candidate;
      }
    }
    return '';
  };

  const nonAssetWords = new Set(['FILLED', 'AMOUNT', 'PRICE', 'DATE', 'TOTAL', 'FEE', 'STATUS', 'TYPE', 'REMARKS', 'AVERAGE', 'PERCENT']);
  for (const pair of joined.matchAll(/\b([A-Z0-9]{2,12})\s*\/\s*([A-Z0-9]{2,12})\b/gi)) {
    const candidateBase = pair[1].toUpperCase();
    const candidateQuote = pair[2].toUpperCase();
    if (!/[A-Z]/.test(candidateBase) || !/[A-Z]/.test(candidateQuote)) continue;
    if (nonAssetWords.has(candidateBase) || nonAssetWords.has(candidateQuote)) continue;
    baseAsset = candidateBase;
    quoteAsset = candidateQuote;
    result.pair = `${baseAsset}/${quoteAsset}`;
    break;
  }

  const typeValue = valueAfterLabel(/^Type\b/i, 2) || lines.find(line => /\b(?:LIMIT|MARKET)\b.*\b(?:BUY|SELL)\b/i.test(line)) || '';
  const type = typeValue.match(/\b(LIMIT|MARKET)\b/i) || joined.match(/\b(LIMIT|MARKET)\b/i);
  if (type) result.type = type[1].toUpperCase();
  const side = typeValue.match(/\b(BUY|SELL)\b/i) || joined.match(/\b(BUY|SELL)\b/i);
  if (side) result.side = side[1].toUpperCase();

  const averagePriceValue = valueAfterLabel(/^Average\s+price\.?/i, 2);
  const averagePrice = parseNumberAsset(averagePriceValue);
  if (averagePrice) {
    result.price = averagePrice.number;
    if (averagePrice.asset) quoteAsset = averagePrice.asset;
  }

  if (!result.price) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^Price\b/i.test(lines[index])) continue;
      let candidate = lines[index].replace(/^Price\b/i, '').replace(/^\s*[:.-]?\s*/, '').trim();
      if (!candidate && index + 1 < lines.length && !/^[A-Za-z ]+$/.test(lines[index + 1])) candidate = lines[index + 1];
      const currencyFirst = candidate.match(/^([A-Z][A-Z0-9._-]{1,11})\s+([0-9][0-9,]*(?:\.\d+)?|\.\d+)$/i);
      if (currencyFirst) {
        quoteAsset = currencyFirst[1].toUpperCase();
        result.price = cleanImportedNumber(currencyFirst[2]);
        break;
      }
      const parsedPrice = parseNumberAsset(candidate);
      if (parsedPrice) {
        result.price = parsedPrice.number;
        if (parsedPrice.asset) quoteAsset = parsedPrice.asset;
        break;
      }
    }
  }

  const filledValue = valueAfterLabel(/^Filled\s*\/\s*Amount\b/i, 2);
  const filledMatch = filledValue.match(/([0-9][0-9,]*(?:\.\d+)?|\.\d+)\s*\/\s*([0-9][0-9,]*(?:\.\d+)?|\.\d+)\s*([A-Z][A-Z0-9._-]{1,11})?/i);
  if (filledMatch) {
    result.executed = cleanImportedNumber(filledMatch[1]);
    if (filledMatch[3]) baseAsset = filledMatch[3].toUpperCase();
  } else {
    const executedValue = valueAfterLabel(/^Executed(?:\s+(?:Amount|Quantity))?\b/i, 2);
    const executed = parseNumberAsset(executedValue);
    if (executed) {
      result.executed = executed.number;
      if (executed.asset) baseAsset = executed.asset;
    }
  }

  const feeValue = valueAfterLabel(/^(?:Trading\s+)?Fee\b/i, 2);
  const fee = parseNumberAsset(feeValue);
  if (fee) {
    result.fee = `${fee.number}${fee.asset ? ` ${fee.asset}` : ''}`;
    if (!baseAsset && fee.asset) baseAsset = fee.asset;
  }

  const totalValue = valueAfterLabel(/^Total(?:\s+(?:Amount|Value))?\b/i, 2);
  const total = parseNumberAsset(totalValue);
  if (total) {
    result.total = total.number;
    if (total.asset) quoteAsset = total.asset;
  }

  const orderIdValue = valueAfterLabel(/^Order\s*ID\b/i, 2);
  const orderId = orderIdValue.match(/\b([A-Z0-9-]{6,})\b/i);
  if (orderId) result.id = orderId[1];

  for (const line of lines) {
    const parsedDate = parseImportedDateTime(line);
    if (parsedDate) {
      result.date = parsedDate;
      break;
    }
  }

  // Google Lens may output the Date / Price / Amount table as three headers,
  // followed by the date row, price, and amount on separate lines. Use that
  // table only as a fallback so Average price / Filled Amount always win.
  const dateHeaderIndex = lines.findIndex(line => /^Date$/i.test(line));
  if (dateHeaderIndex >= 0) {
    let rowDateIndex = -1;
    for (let index = dateHeaderIndex + 1; index < Math.min(lines.length, dateHeaderIndex + 8); index += 1) {
      if (parseImportedDateTime(lines[index])) {
        rowDateIndex = index;
        if (!result.date) result.date = parseImportedDateTime(lines[index]);
        break;
      }
    }
    if (rowDateIndex >= 0) {
      if (!result.price) {
        const tablePrice = parseNumberAsset(lines[rowDateIndex + 1] || '');
        if (tablePrice) result.price = tablePrice.number;
      }
      if (!result.executed) {
        const tableAmount = parseNumberAsset(lines[rowDateIndex + 2] || '');
        if (tableAmount) result.executed = tableAmount.number;
      }
    }
  }

  if (!result.pair && baseAsset && quoteAsset && baseAsset !== quoteAsset) {
    result.pair = `${baseAsset}/${quoteAsset}`;
  }

  return result;
}

function applyParsedOrderToManualForm(parsed, sourceLabel = 'copied text') {
  const form = $('manualForm');
  const found = [];
  if (parsed.date) { form.elements.date.value = dateToInputValue(parsed.date); found.push('date'); }
  if (parsed.id) { form.elements.id.value = parsed.id; found.push('ID'); }
  if (parsed.pair) { form.elements.pair.value = parsed.pair; found.push('pair'); }
  if (parsed.type && ['LIMIT', 'MARKET', 'OTHER'].includes(parsed.type)) { form.elements.type.value = parsed.type; found.push('type'); }
  if (parsed.side && ['BUY', 'SELL'].includes(parsed.side)) { form.elements.side.value = parsed.side; found.push('side'); }
  if (parsed.price) { form.elements.price.value = parsed.price; found.push('price'); }
  if (parsed.executed) { form.elements.executed.value = parsed.executed; found.push('quantity'); }
  if (parsed.fee) { form.elements.feeOverride.value = parsed.fee; found.push('fee'); }
  form.elements.reportedTotal.value = parsed.total || '';
  if (parsed.total) found.push('reported total');
  updateManualCalculations(form);
  if (!found.length) throw new Error('No supported transaction fields were found. Paste the full copied trade details and try again.');
  setManualStatus(`Filled ${found.join(', ')} from ${sourceLabel}. Review everything before saving.`, 'info');
}

function autocorrectLeadingDecimalInput(input) {
  if (!input) return;
  const value = input.value;
  if (/^\./.test(value)) input.value = `0${value}`;
}

function setupInstallFlow() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('installBtn').hidden = false;
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (ios && !standalone) $('installBtn').hidden = false;

  $('installBtn')?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('installBtn').hidden = true;
      return;
    }
    if (ios) alert('On iPhone/iPad: open the Share menu, choose “Add to Home Screen”, then confirm Add.');
    else alert('Use your browser menu and choose Install app / Add to Home screen.');
  });
}

async function ensureCurrentAppShell() {
  const marker = document.querySelector('meta[name="trade-vault-build"]')?.getAttribute('content') || '';
  if (marker === APP_BUILD) {
    try { sessionStorage.removeItem(BUILD_RELOAD_KEY); } catch {}
    return true;
  }

  const status = $('startupStatus');
  const message = 'Finishing an app update…';
  if (status) {
    status.hidden = false;
    status.className = 'fine startup-status';
    status.textContent = message;
  }

  // A stale HTML shell can briefly be paired with a newer app.js after a PWA update.
  // Clear only Trade Vault shell caches/service worker registration; IndexedDB vault data is untouched.
  if (location.protocol === 'file:' || !navigator.onLine) {
    if (status) {
      status.className = 'fine startup-status error';
      status.textContent = 'The app files are out of sync. Reopen the updated Trade Vault files while online once; your encrypted vault data is not affected.';
    }
    return false;
  }

  try {
    if (sessionStorage.getItem(BUILD_RELOAD_KEY) === '1') {
      if (status) {
        status.className = 'fine startup-status error';
        status.textContent = 'The app update did not finish cleanly. Close this Trade Vault window/app completely, then open it again.';
      }
      return false;
    }
    sessionStorage.setItem(BUILD_RELOAD_KEY, '1');
  } catch {}

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('trade-vault-shell-')).map(key => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('./');
      await registration?.unregister();
    }
  } catch (error) {
    console.warn('Could not fully clear the stale app shell:', error);
  }

  const url = new URL(location.href);
  url.searchParams.set('tvbuild', APP_BUILD);
  location.replace(url.href);
  return false;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(error => console.warn('Service worker registration failed:', error));
  }
}

async function init() {
  if (!await ensureCurrentAppShell()) return;
  if (window.top !== window.self) {
    document.body.textContent = 'Trade Vault cannot run inside an embedded frame.';
    return;
  }
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    document.body.textContent = 'Trade Vault requires HTTPS (or localhost) so Web Crypto and PWA protections are available.';
    return;
  }
  if (!window.crypto?.subtle || !window.indexedDB) {
    document.body.innerHTML = '<main class="unsupported-browser"><h1>Unsupported browser</h1><p>This app requires Web Crypto and IndexedDB.</p></main>';
    return;
  }
  db = await openDb();
  await loadGeneralSettings();
  const exists = await vaultExists();
  pinConfigured = Boolean(await idbGet('meta', 'pin'));
  $('createVaultPanel').hidden = exists;
  $('unlockVaultPanel').hidden = !exists;
  $('startupStatus').hidden = true;
  if (exists) showUnlockMethod(pinConfigured ? 'pin' : 'passphrase');
  setupInstallFlow();
  registerServiceWorker();
  $('themeToggleBtn')?.addEventListener('click', toggleTheme);
  $('gateThemeBtn')?.addEventListener('click', toggleTheme);
  for (const id of ['newPin', 'confirmPin']) {
    $(id)?.addEventListener('input', event => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 4); });
  }
  $('settingsBtn')?.addEventListener('click', () => { populateSettingsForm(); $('settingsDialog').showModal(); });
  $('closeSettingsBtn')?.addEventListener('click', () => { clearCredentialInputs(); $('settingsDialog').close(); });
  $('cancelSettingsBtn')?.addEventListener('click', () => { clearCredentialInputs(); $('settingsDialog').close(); });
  $('settingsForm')?.addEventListener('input', event => {
    if (event.target.matches('input[name="buyFeePercent"], input[name="sellFeePercent"]')) autocorrectLeadingDecimalInput(event.target);
    if (event.target.matches('input[name="newPin"], input[name="confirmPin"]')) event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  });
  $('settingsForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('saveSettingsBtn');
    try {
      setBusy(button, true, 'Saving…');
      const result = await saveGeneralSettings(event.currentTarget);
      clearCredentialInputs();
      $('settingsDialog').close();
      toast(result.pinChanged ? 'Settings saved and local PIN updated.' : 'General settings saved.');
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not save settings.');
    } finally {
      setBusy(button, false);
    }
  });

  ['pointerdown', 'keydown', 'touchstart'].forEach(name => document.addEventListener(name, resetIdleTimer, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      stopMarketData({ clearPrices: false, resetStatus: true });
    } else if (vaultKey && hiddenAt && Date.now() - hiddenAt > autoLockMinutes * 60 * 1000) {
      lockVault();
      toast('Vault locked after being backgrounded.');
    } else if (vaultKey) {
      syncMarketData(true);
    }
    hiddenAt = document.hidden ? hiddenAt : 0;
  });
  window.addEventListener('offline', () => {
    if (!vaultKey) return;
    stopMarketData({ clearPrices: false, resetStatus: false });
    updateMarketStatus('Offline · showing last in-memory quotes');
  });
  window.addEventListener('online', () => {
    if (vaultKey && livePricingEnabled && !document.hidden) syncMarketData(true);
  });
  window.addEventListener('pagehide', () => { stopMarketData({ clearPrices: true }); vaultKey = null; transactions = []; analyticsCache = null; clearSensitiveUi(); clearCredentialInputs(); });
  window.addEventListener('pageshow', () => { if (!vaultKey && !$('appShell').hidden) lockVault(); });

  $('createVaultBtn')?.addEventListener('click', async () => {
    const btn = $('createVaultBtn');
    const pass = $('newPassphrase').value;
    const confirmPass = $('confirmPassphrase').value;
    const pin = $('newPin').value;
    const confirmPin = $('confirmPin').value;
    if (pass.length < 16) return toast('Use at least 16 characters for the vault passphrase.');
    if (pass !== confirmPass) return toast('Passphrases do not match.');
    try { validatePin(pin); } catch (error) { return toast(error.message); }
    if (pin !== confirmPin) return toast('PINs do not match.');
    try {
      setBusy(btn, true, 'Creating vault…');
      await createVault(pass, pin);
      $('newPassphrase').value = '';
      $('confirmPassphrase').value = '';
      $('newPin').value = '';
      $('confirmPin').value = '';
      toast('Encrypted vault created.');
    } catch (error) { console.error(error); toast(error.message || 'Could not create vault.'); }
    finally { setBusy(btn, false); }
  });

  const setUnlockStatus = (message = '', kind = '') => {
    $('unlockStatus').textContent = message;
    $('unlockStatus').className = `gate-status${kind ? ` ${kind}` : ''}`;
  };
  const attemptPassphraseUnlock = async () => {
    const input = $('unlockPassphrase');
    const value = input.value;
    if (unlockInFlight || value.length < 16) return;
    unlockInFlight = true;
    input.disabled = true;
    setUnlockStatus('Unlocking…');
    try {
      await unlockVault(value);
      input.value = '';
    } catch (error) {
      console.error(error);
      setUnlockStatus(error.message || 'Could not unlock vault.', 'error');
    } finally {
      input.disabled = false;
      unlockInFlight = false;
    }
  };
  const schedulePassphraseUnlock = () => {
    clearTimeout(unlockDebounceTimer);
    setUnlockStatus('');
    if ($('unlockPassphrase').value.length < 16) return;
    unlockDebounceTimer = setTimeout(attemptPassphraseUnlock, 850);
  };
  $('unlockPassphrase')?.addEventListener('input', schedulePassphraseUnlock);
  $('unlockPassphrase')?.addEventListener('change', schedulePassphraseUnlock);
  $('unlockPassphrase')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); clearTimeout(unlockDebounceTimer); attemptPassphraseUnlock(); }
  });
  $('unlockPin')?.addEventListener('input', async event => {
    const input = event.currentTarget;
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
    setUnlockStatus('');
    if (input.value.length !== 4 || unlockInFlight) return;
    unlockInFlight = true;
    input.disabled = true;
    setUnlockStatus('Unlocking…');
    try {
      await unlockVaultWithPin(input.value);
      input.value = '';
    } catch (error) {
      console.error(error);
      input.value = '';
      setUnlockStatus(error.message || 'Could not unlock vault.', 'error');
      setTimeout(() => input.focus(), 0);
    } finally {
      input.disabled = false;
      unlockInFlight = false;
    }
  });
  $('usePassphraseBtn')?.addEventListener('click', () => showUnlockMethod('passphrase'));
  $('usePinBtn')?.addEventListener('click', () => showUnlockMethod('pin'));
  $('lockBtn')?.addEventListener('click', lockVault);

  document.querySelectorAll('[data-view-target]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewTarget)));
  window.addEventListener('hashchange', () => { if (vaultKey) setView(currentViewFromHash(), false); });
  window.addEventListener('popstate', () => { if (vaultKey) setView(currentViewFromHash(), false); });
  const openManual = () => { setManualMode(null); $('manualDialog').showModal(); };
  $('ledgerAddBtn')?.addEventListener('click', openManual);
  $('floatingAddBtn')?.addEventListener('click', openManual);

  const handleCsvInput = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importCsvFile(file); updateManualCalculations(); }
    catch (error) { console.error(error); toast(error.message || 'CSV import failed.'); }
    finally { event.target.value = ''; }
  };

  $('csvInput')?.addEventListener('change', handleCsvInput);
  $('ledgerCsvInput')?.addEventListener('change', handleCsvInput);


  $('searchInput')?.addEventListener('input', renderTransactions);
  $('sideFilter')?.addEventListener('change', renderTransactions);
  $('selectAllVisible')?.addEventListener('change', event => {
    const visible = filteredTransactions();
    for (const tx of visible) {
      if (event.currentTarget.checked) selectedRecordKeys.add(tx._recordKey);
      else selectedRecordKeys.delete(tx._recordKey);
    }
    renderTransactions();
  });
  $('selectVisibleBtn')?.addEventListener('click', () => {
    const visible = filteredTransactions();
    const allSelected = visible.length > 0 && visible.every(tx => selectedRecordKeys.has(tx._recordKey));
    for (const tx of visible) {
      if (allSelected) selectedRecordKeys.delete(tx._recordKey);
      else selectedRecordKeys.add(tx._recordKey);
    }
    renderTransactions();
  });
  $('deleteSelectedBtn')?.addEventListener('click', async () => {
    const keys = [...selectedRecordKeys].filter(key => transactions.some(tx => tx._recordKey === key));
    if (!keys.length) return;
    if (!confirm(`Delete ${keys.length} selected transaction${keys.length === 1 ? '' : 's'}?\n\nThis removes the encrypted local records and recalculates analytics.`)) return;
    const btn = $('deleteSelectedBtn');
    try {
      setBusy(btn, true, 'Deleting…');
      for (const key of keys) await deleteTransaction(key);
      renderAll();
      toast(`${keys.length} transaction${keys.length === 1 ? '' : 's'} deleted locally.`);
    } catch (error) {
      console.error(error);
      toast(error.message || 'Could not delete selected transactions.');
    } finally {
      setBusy(btn, false);
      updateSelectionUi();
    }
  });
  const handleSelectionChange = event => {
    const checkbox = event.target.closest('input[data-select-key]');
    if (!checkbox) return;
    if (checkbox.checked) selectedRecordKeys.add(checkbox.dataset.selectKey);
    else selectedRecordKeys.delete(checkbox.dataset.selectKey);
    renderTransactions();
  };
  $('transactionsBody')?.addEventListener('change', handleSelectionChange);
  $('transactionsCards')?.addEventListener('change', handleSelectionChange);
  document.querySelectorAll('[data-holdings-purpose]').forEach(button => button.addEventListener('click', () => {
    holdingsPurpose = transactionPurpose(button.dataset.holdingsPurpose);
    renderHoldings();
  }));
  $('toggleHoldingsDetailsBtn')?.addEventListener('click', () => {
    const visible = analyticsCache?.holdings?.filter(h => transactionPurpose(h) === holdingsPurpose && h.netQty > 0n) || [];
    const keys = visible.map(holdingUiKey);
    const allExpanded = keys.length > 0 && keys.every(key => expandedHoldingKeys.has(key));
    for (const key of keys) {
      if (allExpanded) expandedHoldingKeys.delete(key);
      else expandedHoldingKeys.add(key);
    }
    renderHoldings();
  });
  $('holdingsCards')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-holding-action="toggle-details"][data-holding-key]');
    if (!button) return;
    const key = button.dataset.holdingKey;
    if (expandedHoldingKeys.has(key)) expandedHoldingKeys.delete(key);
    else expandedHoldingKeys.add(key);
    renderHoldings();
  });
  document.querySelectorAll('[data-overview-purpose]').forEach(button => button.addEventListener('click', () => {
    overviewPurpose = transactionPurpose(button.dataset.overviewPurpose);
    renderOverview();
  }));
  $('toggleLedgerDetailsBtn')?.addEventListener('click', () => {
    const visibleKeys = filteredTransactions().map(tx => tx._recordKey);
    const allExpanded = visibleKeys.length > 0 && visibleKeys.every(key => expandedRecordKeys.has(key));
    for (const key of visibleKeys) {
      if (allExpanded) expandedRecordKeys.delete(key);
      else expandedRecordKeys.add(key);
    }
    renderTransactions();
  });
  const toggleMarketPricing = () => {
    livePricingEnabled = !livePricingEnabled;
    updateMarketControls();
    if (livePricingEnabled) {
      updateMarketStatus('Coins.ph connecting…');
      syncMarketData(true);
    } else {
      stopMarketData({ clearPrices: true, resetStatus: false });
      updateMarketStatus('Live pricing off');
      renderHoldings();
      renderOverview();
    }
  };
  const refreshMarketPricing = () => {
    if (!livePricingEnabled) return toast('Turn live pricing on first.');
    syncMarketData(true);
  };
  $('marketToggleBtn')?.addEventListener('click', toggleMarketPricing);
  $('overviewMarketToggleBtn')?.addEventListener('click', toggleMarketPricing);
  $('marketRefreshBtn')?.addEventListener('click', refreshMarketPricing);
  $('overviewMarketRefreshBtn')?.addEventListener('click', refreshMarketPricing);
  updateMarketControls();
  const handleTransactionAction = async event => {
    const button = event.target.closest('button[data-action][data-key]');
    if (!button) return;
    const recordKey = button.dataset.key;
    const tx = transactions.find(item => item._recordKey === recordKey);
    if (!tx) return toast('Transaction was not found.');

    if (button.dataset.action === 'toggle-details') {
      if (expandedRecordKeys.has(recordKey)) expandedRecordKeys.delete(recordKey);
      else expandedRecordKeys.add(recordKey);
      renderTransactions();
      return;
    }

    if (button.dataset.action === 'copy-net') {
      try {
        await copyText(fixedCopyValue(netAcquiredForTransaction(tx).amount));
        toast('Net acquired amount copied.');
      } catch (error) {
        toast(error.message || 'Could not copy amount.');
      }
      return;
    }

    if (button.dataset.action === 'edit') {
      openEditTransaction(recordKey);
      return;
    }

    if (button.dataset.action === 'delete') {
      const label = `${tx.side} ${tx.pair} on ${shortDate(tx.date)}`;
      if (!confirm(`Delete ${label}?\n\nThis removes the encrypted local record and recalculates analytics.`)) return;
      try {
        button.disabled = true;
        await deleteTransaction(recordKey);
        renderAll();
        toast('Transaction deleted locally.');
      } catch (error) {
        console.error(error);
        toast(error.message || 'Could not delete transaction.');
      }
    }
  };
  $('transactionsBody')?.addEventListener('click', handleTransactionAction);
  $('transactionsCards')?.addEventListener('click', handleTransactionAction);
  $('openManualBtn')?.addEventListener('click', openManual);
  $('closeManualBtn')?.addEventListener('click', () => { editingRecordKey = null; $('manualDialog').close(); });
  $('cancelManualBtn')?.addEventListener('click', () => { editingRecordKey = null; $('manualDialog').close(); });
  const fillManualFormFromReceiptText = (sourceLabel = 'copied text') => {
    const input = $('receiptTextInput');
    if (!input || !input.value.trim()) return;
    try {
      applyParsedOrderToManualForm(parseOrderText(input.value), sourceLabel);
    } catch (error) {
      setManualStatus(error.message || 'Could not parse copied trade text.', 'error');
    }
  };
  $('parseReceiptTextBtn')?.addEventListener('click', () => fillManualFormFromReceiptText('copied text'));
  $('clearReceiptTextBtn')?.addEventListener('click', () => {
    const input = $('receiptTextInput');
    if (!input) return;
    input.value = '';
    setManualStatus('');
    input.focus();
  });
  $('receiptTextInput')?.addEventListener('paste', () => {
    // The textarea value is updated after the paste event itself. Waiting one
    // task lets us parse the final pasted text instead of the previous value.
    setTimeout(() => fillManualFormFromReceiptText('pasted text'), 0);
  });
  $('manualForm')?.addEventListener('input', event => {
    if (event.target.matches('input[name="price"], input[name="executed"]')) {
      autocorrectLeadingDecimalInput(event.target);
      event.currentTarget.elements.reportedTotal.value = '';
    }
    if (event.target.matches('input[name="pair"], select[name="side"]')) event.currentTarget.elements.reportedTotal.value = '';
    setManualStatus('');
    updateManualCalculations(event.currentTarget);
  });
  $('manualForm')?.addEventListener('change', event => {
    if (event.target.matches('input[name="price"], input[name="executed"], input[name="pair"], select[name="side"]')) {
      event.currentTarget.elements.reportedTotal.value = '';
    }
    setManualStatus('');
    updateManualCalculations(event.currentTarget);
  });
  $('manualForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('saveManualBtn');
    try {
      setBusy(button, true, 'Saving…');
      setManualStatus('');
      const tx = manualFormToTransaction(form);
      const duplicate = transactions.some(t => t.id === tx.id && t._recordKey !== editingRecordKey);
      if (duplicate) {
        if (!editingRecordKey) form.elements.id.value = makeUniqueKey('manual');
        throw new Error('Another transaction already uses this ID.');
      }

      if (editingRecordKey) {
        const original = transactions.find(item => item._recordKey === editingRecordKey);
        tx.source = original?.source || tx.source;
        tx.addedAt = original?.addedAt || tx.addedAt;
        tx.updatedAt = new Date().toISOString();
        await updateTransaction(editingRecordKey, tx);
      } else {
        await saveTransaction(tx);
      }

      const wasEditing = Boolean(editingRecordKey);
      editingRecordKey = null;
      form.reset();
      $('manualDialog').close();
      renderAll();
      toast(wasEditing ? 'Transaction updated locally.' : 'Transaction saved locally.');
    } catch (error) {
      console.error(error);
      const message = error.message || 'Could not save transaction.';
      setManualStatus(message, 'error');
      toast(message);
    } finally {
      setBusy(button, false);
    }
  });

  $('exportBtn')?.addEventListener('click', () => exportEncryptedBackup().catch(error => toast(error.message)));
  $('restoreInput')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await restoreEncryptedBackup(file); }
    catch (error) { console.error(error); toast(error.message || 'Restore failed.'); }
    finally { event.target.value = ''; }
  });

  $('clearBtn')?.addEventListener('click', async () => {
    const answer = prompt('This permanently removes the local vault and all encrypted transactions from this browser. Type CLEAR to continue.');
    if (answer !== 'CLEAR') return;
    await idbClear('records');
    await idbClear('meta');
    feeRatePercentBySide = { BUY: DEFAULT_BUY_FEE_RATE_PERCENT_TEXT, SELL: DEFAULT_SELL_FEE_RATE_PERCENT_TEXT };
    autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
    pinConfigured = false;
    stopMarketData({ clearPrices: true });
    selectedRecordKeys.clear();
    expandedRecordKeys.clear();
    holdingsPurpose = 'TRADE';
    overviewPurpose = 'TRADE';
    vaultKey = null;
    transactions = [];
    $('appShell').hidden = true;
    $('vaultGate').hidden = false;
    $('createVaultPanel').hidden = false;
    $('unlockVaultPanel').hidden = true;
    toast('Local vault cleared.');
  });
}

init().catch(error => {
  console.error(error);
  const status = $('startupStatus');
  if (status) {
    status.hidden = false;
    status.className = 'fine startup-status error';
    status.textContent = `Could not open the local vault: ${error.message}`;
  }
});
