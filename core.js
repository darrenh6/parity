(function (root) {
  const Copy = typeof module !== 'undefined' && module.exports ? require('./text.js') : root.TeamMakerText;
  // same range for every game so top tiers compare
  const BASE = 800;
  const SPAN = 1600;
  const APEX_STEP = 150;

  const playsGame = () => true;

  function defaultGames() {
    const third = 1 / 3;
    return [
      { id: 'lol', name: 'League of Legends', weight: third, divisions: 4,
        tiers: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'],
        apex: ['Master', 'Grandmaster', 'Challenger'],
        roles: [{ name: 'Top', slots: 1 }, { name: 'Jungle', slots: 1 }, { name: 'Mid', slots: 1 },
                { name: 'Bot', slots: 1 }, { name: 'Support', slots: 1 }] },
      { id: 'ow', name: 'Overwatch', weight: third, divisions: 5,
        tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        apex: ['Master', 'Grandmaster', 'Champion'],
        roles: [{ name: 'Tank', slots: 1 }, { name: 'DPS', slots: 2 }, { name: 'Support', slots: 2 }] },
      { id: 'val', name: 'Valorant', weight: third, divisions: 3,
        tiers: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant'],
        apex: ['Immortal', 'Radiant'],
        // flex is usually a second duelist
        roles: [{ name: 'Duelist', slots: 1 }, { name: 'Initiator', slots: 1 }, { name: 'Controller', slots: 1 },
                { name: 'Sentinel', slots: 1 }, { name: 'Flex', slots: 1, alsoFilledBy: ['Duelist'] }] },
    ];
  }

  function topSubApexElo(game) {
    const n = game.tiers.length;
    return BASE + (SPAN * (n - 1 + (game.divisions - 1) / game.divisions)) / n;
  }

  function divisionPos(game, d) {
    return (game.divisions - d) / game.divisions;
  }

  // apex capped at top tier unless wide, skews balance
  function rankToElo(game, rank, wide) {
    if (!rank || !rank.tier) return null;
    const ai = game.apex.indexOf(rank.tier);
    if (ai >= 0) return wide ? BASE + SPAN + APEX_STEP * (ai + 1) : topSubApexElo(game);
    const ti = game.tiers.indexOf(rank.tier);
    if (ti < 0) return null;
    const D = game.divisions;
    const d = Math.min(Math.max(Math.round(rank.division) || 1, 1), D);
    return BASE + (SPAN * (ti + divisionPos(game, d))) / game.tiers.length;
  }

  function ladder(game, wide) {
    const out = [];
    game.tiers.forEach((tier) => {
      for (let i = 0; i < game.divisions; i++) {
        const d = game.divisions - i;
        const label = game.divisions > 1 ? `${tier} ${d}` : tier;
        out.push({ tier, division: d, label });
      }
    });
    if (wide) game.apex.forEach((tier) => out.push({ tier, division: null, label: tier }));
    return out;
  }

  function normalizedWeights(games) {
    const total = games.reduce((s, g) => s + Math.max(0, g.weight), 0);
    const out = {};
    games.forEach((g) => { out[g.id] = total > 0 ? Math.max(0, g.weight) / total : 0; });
    return out;
  }

  // weights renormalized over rated games
  function playerRating(person, games, wide) {
    let sum = 0, wsum = 0;
    games.forEach((g) => {
      const elo = rankToElo(g, person.ratings && person.ratings[g.id], wide);
      if (elo == null || !(g.weight > 0)) return;
      sum += g.weight * elo;
      wsum += g.weight;
    });
    return wsum > 0 ? sum / wsum : null;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function avgStd(assign, vals, k, inc) {
    const sums = new Array(k).fill(0), cnt = new Array(k).fill(0);
    let tot = 0, tc = 0;
    assign.forEach((t, i) => {
      if (inc && !inc[i]) return;
      sums[t] += vals[i]; cnt[t]++; tot += vals[i]; tc++;
    });
    const gm = tc ? tot / tc : 0;
    const avgs = sums.map((s, t) => (cnt[t] ? s / cnt[t] : gm));
    const mean = avgs.reduce((a, b) => a + b, 0) / k;
    return { avgs, std: Math.sqrt(avgs.reduce((s, a) => s + (a - mean) ** 2, 0) / k) };
  }

  function buildTeams(players, opts) {
    const { games, wide = false, teams: k = 2, seed = 1 } = opts;
    const n = players.length;
    if (k < 2) throw new Error(Copy.plain('err.minTeams'));
    if (n < k) throw new Error(Copy.plain('err.needPlayers', { k, n }));
    const restarts = opts.restarts || (n > 20 ? 12 : 30);

    const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const raw = players.map((p) => playerRating(p, games, wide));
    const fallback = meanOf(raw.filter((r) => r != null)) ?? BASE + SPAN / 2;
    const ratings = raw.map((r) => (r == null ? fallback : r));

    const cost = (assign) => {
      let c = avgStd(assign, ratings, k).std;
      return c;
    };

    const slots = [];
    for (let t = 0; t < k; t++) for (let j = 0; j < Math.floor(n / k) + (t < n % k ? 1 : 0); j++) slots.push(t);

    const rand = mulberry32(seed);
    let best = null, bestCost = Infinity;
    for (let r = 0; r < restarts; r++) {
      const assign = slots.slice();
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [assign[i], assign[j]] = [assign[j], assign[i]];
      }
      let cur = cost(assign), improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (assign[i] === assign[j]) continue;
            [assign[i], assign[j]] = [assign[j], assign[i]];
            const c = cost(assign);
            if (c < cur - 1e-9) { cur = c; improved = true; }
            else [assign[i], assign[j]] = [assign[j], assign[i]];
          }
        }
      }
      if (cur < bestCost) { bestCost = cur; best = assign.slice(); }
    }

    const comp = avgStd(best, ratings, k);
    const members = [];
    for (let t = 0; t < k; t++) {
      const idx = [];
      best.forEach((tt, i) => { if (tt === t) idx.push(i); });
      members.push(idx);
    }
    const spreadOf = (avgs) => Math.max(...avgs) - Math.min(...avgs);
    const result = members.map((idx, t) => ({
      players: idx.map((i) => ({ ...players[i], rating: ratings[i], rated: raw[i] != null }))
        .sort((x, y) => y.rating - x.rating),
      avg: comp.avgs[t],
    }));
    return {
      teams: result,
      stats: {
        spread: spreadOf(comp.avgs),
        cost: bestCost,
      },
    };
  }

  const api = { BASE, SPAN, APEX_STEP, defaultGames, rankToElo, ladder, normalizedWeights, playerRating, playsGame, buildTeams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamMaker = api;
})(typeof window !== 'undefined' ? window : globalThis);
