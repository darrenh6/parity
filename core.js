(function (root) {
  const Copy = typeof module !== 'undefined' && module.exports ? require('./text.js') : root.TeamMakerText;
  // same range for every game so top tiers compare
  const BASE = 800;
  const SPAN = 1600;
  const APEX_STEP = 150;
  const ROLE_SCALE = 100; // elo cost of one missing role

  const playsGame = () => true;

  const GAIN = { primary: 1, secondary: 0.85, fill: 0.7, off: 0.15 };

  function defaultGames() {
    const third = 1 / 3;
    return [
      { id: 'lol', name: 'League of Legends', weight: third, divisions: 4, roleImportance: 1,
        tiers: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'],
        apex: ['Master', 'Grandmaster', 'Challenger'],
        roles: [{ name: 'Top', slots: 1 }, { name: 'Jungle', slots: 1 }, { name: 'Mid', slots: 1 },
                { name: 'Bot', slots: 1 }, { name: 'Support', slots: 1 }] },
      { id: 'ow', name: 'Overwatch', weight: third, divisions: 5, roleImportance: 1,
        tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        apex: ['Master', 'Grandmaster', 'Champion'],
        roles: [{ name: 'Tank', slots: 1 }, { name: 'DPS', slots: 2 }, { name: 'Support', slots: 2 }] },
      { id: 'val', name: 'Valorant', weight: third, divisions: 3, divisionsAscend: true, roleImportance: 0.3,
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

  // league and overwatch count down, valorant up
  function divisionPos(game, d) {
    const D = game.divisions;
    return game.divisionsAscend ? (d - 1) / D : (D - d) / D;
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
        const d = game.divisionsAscend ? i + 1 : game.divisions - i;
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

  // exact dp over slots. gain excludes the priority bonus
  function assignTeam(members, game, allGames) {
    const cands = members.filter((m) => playsGame(m, game));
    const units = [];
    ((game && game.roles) || []).forEach((r) => {
      for (let i = 0; i < r.slots; i++) units.push({ role: r.name, accepts: [r.name].concat(r.alsoFilledBy || []) });
    });
    const S = units.length, P = cands.length;
    if (!S) return { gain: 0, ideal: 0, assigned: [], bench: [], missing: [] };

    const bonus = cands.map(() => 0);
    const base = cands.map((m) => {
      const pr = (m.roles && m.roles[game.id]) || [];
      return units.map((u) => {
        if (!pr.length) return GAIN.fill;
        let idx = -1;
        pr.forEach((r, i) => { if (u.accepts.includes(r) && (idx < 0 || i < idx)) idx = i; });
        return idx < 0 ? GAIN.off : idx === 0 ? GAIN.primary : GAIN.secondary;
      });
    });

    const size = 1 << S;
    let cur = new Float64Array(size).fill(-Infinity);
    cur[0] = 0;
    const choices = [];
    for (let i = 0; i < P; i++) {
      const next = cur.slice(), ch = new Int8Array(size).fill(-1);
      for (let mask = 0; mask < size; mask++) {
        if (cur[mask] === -Infinity) continue;
        for (let j = 0; j < S; j++) {
          if (mask & (1 << j)) continue;
          const v = cur[mask] + base[i][j] + bonus[i], nm = mask | (1 << j);
          if (v > next[nm] + 1e-12) { next[nm] = v; ch[nm] = j; }
        }
      }
      choices.push(ch);
      cur = next;
    }
    let bestMask = 0;
    for (let m = 1; m < size; m++) if (cur[m] > cur[bestMask]) bestMask = m;

    const assigned = [], bench = [];
    let mask = bestMask, gain = 0;
    for (let i = P - 1; i >= 0; i--) {
      const j = choices[i][mask];
      if (j >= 0) { assigned.unshift({ player: cands[i], role: units[j].role }); gain += base[i][j]; mask ^= 1 << j; }
      else bench.unshift(cands[i]);
    }
    const missing = units.filter((_, j) => !(bestMask & (1 << j))).map((u) => u.role);
    return { gain, ideal: S, assigned, bench, missing };
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

  // minimizes skew, role shortfall and uneven all-game counts
  function buildTeams(players, opts) {
    const { games, wide = false, teams: k = 2, roleWeight = 0.5, seed = 1 } = opts;
    const n = players.length;
    if (k < 2) throw new Error(Copy.plain('err.minTeams'));
    if (n < k) throw new Error(Copy.plain('err.needPlayers', { k, n }));
    const restarts = opts.restarts || (n > 20 ? 12 : 30);

    const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const raw = players.map((p) => playerRating(p, games, wide));
    const fallback = meanOf(raw.filter((r) => r != null)) ?? BASE + SPAN / 2;
    const ratings = raw.map((r) => (r == null ? fallback : r));

    const nw = normalizedWeights(games);
    const perGame = [];
    games.forEach((g) => {
      if (!(nw[g.id] > 0)) return;
      const inc = players.map((p) => playsGame(p, g));
      const elos = players.map((p, i) => (inc[i] ? rankToElo(g, p.ratings && p.ratings[g.id], wide) : null));
      const m = meanOf(elos.filter((e) => e != null));
      if (m == null) return;
      perGame.push({ game: g, w: nw[g.id], inc, elos: elos.map((e) => (e == null ? m : e)) });
    });

    const importance = (g) => (g.roleImportance == null ? 1 : g.roleImportance);
    const roleGames = games.filter((g) => (g.roles || []).length && importance(g) > 0);

    // swap touches two teams, rest hit cache
    const cache = new Map();
    const shortfall = (assign, t, g) => {
      const idx = [];
      for (let i = 0; i < n; i++) if (assign[i] === t) idx.push(i);
      const key = g.id + ':' + idx.join(',');
      let v = cache.get(key);
      if (v === undefined) {
        const a = assignTeam(idx.map((i) => players[i]), g, games);
        v = a.ideal - a.gain;
        cache.set(key, v);
      }
      return v;
    };
    const cost = (assign) => {
      let c = 0.5 * avgStd(assign, ratings, k).std;
      perGame.forEach((pg) => { c += 0.5 * pg.w * avgStd(assign, pg.elos, k, pg.inc).std; });
      if (roleWeight > 0) {
        roleGames.forEach((g) => {
          let s = 0;
          for (let t = 0; t < k; t++) s += shortfall(assign, t, g);
          c += roleWeight * importance(g) * ROLE_SCALE * (s / k);
        });
      }
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
    const gameAvgs = perGame.map((pg) => ({ pg, ...avgStd(best, pg.elos, k, pg.inc) }));
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
      games: games.map((g) => {
        const ga = gameAvgs.find((x) => x.pg.game === g);
        const a = assignTeam(idx.map((i) => players[i]), g, games);
        return {
          id: g.id, name: g.name, avg: ga ? ga.avgs[t] : null,
          assigned: a.assigned.map((x) => ({ name: x.player.name, role: x.role })),
          bench: a.bench.map((x) => x.name),
          missing: a.missing,
        };
      }),
    }));
    const missingRoles = result.reduce((s, t) => s + t.games.reduce((x, g) => x + g.missing.length, 0), 0);
    return {
      teams: result,
      stats: {
        spread: spreadOf(comp.avgs),
        perGame: gameAvgs.map((x) => ({ id: x.pg.game.id, name: x.pg.game.name, spread: spreadOf(x.avgs) })),
        missingRoles,
        cost: bestCost,
      },
    };
  }

  const api = { BASE, SPAN, APEX_STEP, defaultGames, rankToElo, ladder, normalizedWeights, playerRating, playsGame, assignTeam, buildTeams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamMaker = api;
})(typeof window !== 'undefined' ? window : globalThis);
