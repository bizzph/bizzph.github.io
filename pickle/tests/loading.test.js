const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('initial page uses one eager core script and lazy-loads live sync', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['src/picklepulse-core.js']);
  assert.doesNotMatch(html, /src="src\/live-sync\.js"/);

  const core = read('src/picklepulse-core.js');
  assert.match(core, /LIVE_SCRIPT_URL = 'src\/live-sync\.js'/);
  assert.doesNotMatch(core, /class LiveController/);
});

test('service worker caches the optimized core and lazy live module', () => {
  const worker = read('sw.js');
  assert.match(worker, /picklepulse-v7/);
  assert.match(worker, /\.\/src\/picklepulse-core\.js/);
  assert.match(worker, /\.\/src\/live-sync\.js/);
  assert.doesNotMatch(worker, /\.\/src\/app\.js/);
});

test('timer tick path performs a focused clock update', () => {
  const app = read('src/app.js');
  assert.match(app, /this\.updateClockDisplay\(\);\n\s*\}, 1000\);/);
  assert.match(app, /querySelectorAll\('\[data-role="match-clock"\]'\)/);
});


test('visual fixture uses the optimized bundle and icon sprite', () => {
  const fixture = read('visual-game.html');
  assert.match(fixture, /id="pp-icon-ball"/);
  assert.match(fixture, /src="src\/picklepulse-core\.js"/);
  assert.doesNotMatch(fixture, /src="src\/app\.js"/);
});
