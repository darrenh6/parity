const test = require('node:test');
const assert = require('node:assert');
const T = require('../core.js');

const games = T.defaultGames();
const lol = games[0];

test('ranks increase monotonically through the ladder', () => {
  const elos = T.ladder(lol, false).map((r) => T.rankToElo(lol, r, false));
  for (let i = 1; i < elos.length; i++) assert.ok(elos[i] > elos[i - 1]);
});

test('apex ranks are capped unless wide-skill is on', () => {
  const diamond1 = T.rankToElo(lol, { tier: 'Diamond', division: 1 }, false);
  assert.strictEqual(T.rankToElo(lol, { tier: 'Challenger' }, false), diamond1);
  assert.ok(T.rankToElo(lol, { tier: 'Master' }, true) > diamond1);
  assert.ok(T.rankToElo(lol, { tier: 'Challenger' }, true) > T.rankToElo(lol, { tier: 'Master' }, true));
});

test('ladder only lists apex tiers in wide mode', () => {
  assert.ok(!T.ladder(lol, false).some((r) => r.tier === 'Master'));
  assert.ok(T.ladder(lol, true).some((r) => r.tier === 'Master'));
});

