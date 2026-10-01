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

function pool(n, rng) {
  const tiers = lol.tiers;
  const roles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'];
  return Array.from({ length: n }, (_, i) => ({
    name: `P${i}`, roles: { lol: [roles[i % 5]] },
    ratings: { lol: { tier: tiers[Math.floor(rng() * tiers.length)], division: 1 + Math.floor(rng() * 4) } },
  }));
}
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('teams are balanced on ELO with sizes differing by at most one', () => {
  const { teams, stats } = T.buildTeams(pool(11, seeded(7)), { games, teams: 2, roleWeight: 0 });
  assert.strictEqual(teams[0].players.length + teams[1].players.length, 11);
  assert.ok(Math.abs(teams[0].players.length - teams[1].players.length) <= 1);
  assert.ok(stats.spread < 25, `spread ${stats.spread}`);
});

test('supports more than two teams and rejects bad input', () => {
  const { teams } = T.buildTeams(pool(15, seeded(5)), { games, teams: 3 });
  assert.deepStrictEqual(teams.map((t) => t.players.length), [5, 5, 5]);
  assert.throws(() => T.buildTeams(pool(2, seeded(5)), { games, teams: 3 }));
});

test('same seed gives same teams', () => {
  const players = pool(10, seeded(9));
  const names = (r) => r.teams.map((t) => t.players.map((p) => p.name).sort().join());
  const o = { games, seed: 4 };
  assert.deepStrictEqual(names(T.buildTeams(players, o)), names(T.buildTeams(players, o)));
});

test('30 players across 3 teams runs quickly', () => {
  const t0 = Date.now();
  T.buildTeams(pool(30, seeded(2)), { games, teams: 3 });
  assert.ok(Date.now() - t0 < 5000);
});

