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
const P = (name, lolRoles, extra = {}) => ({ name, roles: { lol: lolRoles, ...extra }, ratings: {} });

test('assignTeam fills one of each League role when possible', () => {
  const team = [P('a', ['Top']), P('b', ['Jungle']), P('c', ['Mid']), P('d', ['Bot']), P('e', ['Support'])];
  const r = T.assignTeam(team, lol);
  assert.strictEqual(r.missing.length, 0);
  assert.deepStrictEqual(r.assigned.map((x) => x.role), ['Top', 'Jungle', 'Mid', 'Bot', 'Support']);
});

test('flexible players resolve conflicts: a multi-role player covers the gap', () => {
  const team = [P('a', ['Top']), P('b', ['Top', 'Jungle']), P('c', ['Mid']), P('d', ['Bot']), P('e', ['Support'])];
  const r = T.assignTeam(team, lol);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.assigned[1].role, 'Jungle');
});

test('Overwatch wants 1 tank, 2 dps, 2 support', () => {
  const ow = games[1];
  const mk = (n, role) => ({ name: n, roles: { ow: [role] }, ratings: {} });
  const r = T.assignTeam([mk('t', 'Tank'), mk('d1', 'DPS'), mk('d2', 'DPS'), mk('s1', 'Support'), mk('s2', 'Support')], ow);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.assigned.filter((x) => x.role === 'DPS').length, 2);
});

test('a duelist can fill the Valorant Flex slot', () => {
  const val = games[2];
  const mk = (n, role) => ({ name: n, roles: { val: [role] }, ratings: {} });
  const r = T.assignTeam([mk('a', 'Duelist'), mk('b', 'Duelist'), mk('c', 'Initiator'), mk('d', 'Controller'), mk('e', 'Sentinel')], val);
  assert.strictEqual(r.missing.length, 0);
});

test('too few players leaves the least-coverable roles unfilled, never a crash', () => {
  const r = T.assignTeam([P('a', ['Top']), P('b', ['Top'])], lol);
  assert.strictEqual(r.ideal, 5);
  assert.strictEqual(r.missing.length, 3);
  assert.ok(!r.missing.includes('Top'));
  assert.ok(r.assigned.every((x) => x.role));
});

test('teams are balanced on ELO with sizes differing by at most one', () => {
  const { teams, stats } = T.buildTeams(pool(11, seeded(7)), { games, teams: 2, roleWeight: 0 });
  assert.strictEqual(teams[0].players.length + teams[1].players.length, 11);
  assert.ok(Math.abs(teams[0].players.length - teams[1].players.length) <= 1);
  assert.ok(stats.spread < 25, `spread ${stats.spread}`);
});

test('role priority gives every team one of each League role', () => {
  const { teams, stats } = T.buildTeams(pool(10, seeded(3)), { games, teams: 2, roleWeight: 1 });
  assert.strictEqual(stats.missingRoles, 0);
  teams.forEach((t) => assert.deepStrictEqual(t.games[0].assigned.map((a) => a.role).sort(), ['Bot', 'Jungle', 'Mid', 'Support', 'Top']));
});

test('roles trade off against ELO by priority', () => {
  const players = pool(10, seeded(11));
  const strict = T.buildTeams(players, { games, teams: 2, roleWeight: 1 });
  const loose = T.buildTeams(players, { games, teams: 2, roleWeight: 0 });
  assert.ok(strict.stats.missingRoles <= loose.stats.missingRoles);
  assert.ok(loose.stats.spread <= strict.stats.spread + 1e-9);
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

function multi(n, rng) {
  const pick = (g) => ({ tier: g.tiers[Math.floor(rng() * g.tiers.length)], division: 1 + Math.floor(rng() * g.divisions) });
  const lolRoles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'], ow = ['Tank', 'DPS', 'DPS', 'Support', 'Support'];
  const val = ['Duelist', 'Initiator', 'Controller', 'Sentinel', 'Flex'];
  return Array.from({ length: n }, (_, i) => ({
    name: `M${i}`,
    ratings: { lol: pick(games[0]), ow: pick(games[1]), val: pick(games[2]) },
    roles: { lol: [lolRoles[i % 5]], ow: [ow[i % 5]], val: [val[i % 5]] },
  }));
}

test('one set of teams is level in every game, not just overall', () => {
  const { stats } = T.buildTeams(multi(10, seeded(21)), { games, teams: 2, roleWeight: 0 });
  stats.perGame.forEach((g) => assert.ok(g.spread < 150, `${g.name} spread ${g.spread}`));
  assert.ok(stats.spread < 60);
});

test('the same teams field roles in every game', () => {
  const { teams, stats } = T.buildTeams(multi(10, seeded(4)), { games, teams: 2, roleWeight: 1 });
  teams.forEach((t) => assert.strictEqual(t.games.length, 3));
  assert.strictEqual(stats.missingRoles, 0);
});

test('League/Overwatch: division 1 is highest; Valorant: division 3 is highest', () => {
  const [lolG, owG, valG] = games;
  assert.ok(T.rankToElo(lolG, { tier: 'Gold', division: 1 }) > T.rankToElo(lolG, { tier: 'Gold', division: 4 }));
  assert.ok(T.rankToElo(owG, { tier: 'Gold', division: 1 }) > T.rankToElo(owG, { tier: 'Gold', division: 5 }));
  assert.ok(T.rankToElo(valG, { tier: 'Gold', division: 3 }) > T.rankToElo(valG, { tier: 'Gold', division: 1 }));
  assert.ok(T.rankToElo(valG, { tier: 'Gold', division: 3 }) < T.rankToElo(valG, { tier: 'Platinum', division: 1 }));
  assert.deepStrictEqual(T.ladder(valG, false).slice(0, 3).map((r) => r.label), ['Iron 1', 'Iron 2', 'Iron 3']);
  assert.deepStrictEqual(T.ladder(lolG, false).slice(0, 4).map((r) => r.label), ['Iron 4', 'Iron 3', 'Iron 2', 'Iron 1']);
});

