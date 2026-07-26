const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('initial page uses one eager versioned core script and lazy-loads live sync', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['src/picklepulse-core.js?v=8']);
  assert.doesNotMatch(html, /src="src\/live-sync\.js/);

  const core = read('src/picklepulse-core.js');
  assert.match(core, /LIVE_SCRIPT_URL = 'src\/live-sync\.js\?v=8'/);
  assert.doesNotMatch(core, /class LiveController/);
});

test('service worker caches only versioned application assets', () => {
  const worker = read('sw.js');
  assert.match(worker, /picklepulse-v8/);
  assert.match(worker, /\.\/src\/picklepulse-core\.js\?v=8/);
  assert.match(worker, /\.\/src\/live-sync\.js\?v=8/);
  assert.doesNotMatch(worker, /\.\/src\/app\.js/);
});

test('timer tick path performs a focused clock update', () => {
  const app = read('src/app.js');
  assert.match(app, /this\.updateClockDisplay\(\);\n\s*\}, 1000\);/);
  assert.match(app, /querySelectorAll\('\[data-role="match-clock"\]'\)/);
});

test('security policy is self-only and local server exposes an allowlist', () => {
  const html = read('index.html');
  const server = read('serve.py');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /script-src-attr 'none'/);
  assert.doesNotMatch(html, /jsdelivr|unpkg|peerjs/i);
  assert.match(server, /\/api\/live\//);
  assert.match(server, /X-Content-Type-Options/);
  assert.match(server, /Permissions-Policy/);
  assert.match(server, /ALLOWED_STATIC_PATHS/);
  assert.match(server, /invalid-host/);
});

test('visual fixture uses the optimized versioned bundle and icon sprite', () => {
  const fixture = read('visual-game.html');
  assert.match(fixture, /id="pp-icon-ball"/);
  assert.match(fixture, /src="src\/picklepulse-core\.js\?v=8"/);
  assert.doesNotMatch(fixture, /src="src\/app\.js"/);
});
