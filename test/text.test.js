const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Text = require('../text.js');
const COPY = require('../copy.js');

test('fills in values and escapes them for the page', () => {
  assert.strictEqual(Text.plain('game.countsAria', { game: 'Valorant' }), 'How much Valorant counts');
  assert.strictEqual(Text.t('info.unranked', { names: '<i>Al</i>', game: 'LoL' }), '&lt;i&gt;Al&lt;/i&gt;: no LoL rank entered, so average skill is assumed there.');
});

test('**double stars** become bold on the page and vanish in plain text', () => {
  assert.ok(Text.t('how.step4').startsWith('Press <b>&quot;Make teams&quot;.</b>'));
  assert.ok(!Text.plain('how.step4').includes('*'));
});

test('{n:one|many} switches between singular and plural', () => {
  assert.strictEqual(Text.plain('result.rolesMissing', { n: 1 }), '1 role across all teams has nobody to play it.');
  assert.strictEqual(Text.plain('result.rolesMissing', { n: 3 }), '3 roles across all teams have nobody to play them.');
});

test('text that cannot be filled in is left visible and unknown keys show their name', () => {
  assert.strictEqual(Text.plain('team.title'), 'Team {i}');
  assert.strictEqual(Text.plain('no.such.key'), 'no.such.key');
});

test('every key used by the code exists, and every key in copy.js is used', () => {
  const src = ['app.js', 'core.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  const used = new Set([...src.matchAll(/'((?:app|how|games|game|wide|addgame|players|rank|role|settings|teams|auto|priority|checks|make|verdict|result|team|compare|warn|info|advice|err)\.[\w.]+)'/g)].map((m) => m[1]));
  used.forEach((k) => assert.ok(k in COPY, `missing from copy.js: ${k}`));
  Object.keys(COPY).forEach((k) => assert.ok(used.has(k), `unused in code: ${k}`));
});
