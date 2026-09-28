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

test('default 0.33 weights normalize to equal thirds', () => {
  const w = T.normalizedWeights(games);
  Object.values(w).forEach((x) => assert.ok(Math.abs(x - 1 / 3) < 1e-9));
});

test('weights shift the composite rating toward the heavier game', () => {
  const person = { ratings: { lol: { tier: 'Diamond', division: 1 }, val: { tier: 'Iron', division: 3 } } };
  const even = T.playerRating(person, games, false);
  const lolHeavy = T.playerRating(person, games.map((g) => (g.id === 'lol' ? { ...g, weight: 1 } : g)), false);
  assert.ok(lolHeavy > even);
});

test('weight 0 ignores a game; unrated players return null', () => {
  const person = { ratings: { lol: { tier: 'Gold', division: 2 }, val: { tier: 'Diamond', division: 1 } } };
  const noVal = games.map((g) => (g.id === 'val' ? { ...g, weight: 0 } : g));
  assert.ok(Math.abs(T.playerRating(person, noVal, false) - T.rankToElo(lol, { tier: 'Gold', division: 2 }, false)) < 1e-9);
  assert.strictEqual(T.playerRating({ ratings: {} }, games, false), null);
});

