(function (root) {
  // same range for every game so top tiers compare
  const BASE = 800;
  const SPAN = 1600;
  const APEX_STEP = 150;

  function defaultGames() {
    const third = 1 / 3;
    return [
      { id: 'lol', name: 'League of Legends', weight: third, divisions: 4,
        tiers: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'],
        apex: ['Master', 'Grandmaster', 'Challenger'] },
      { id: 'ow', name: 'Overwatch', weight: third, divisions: 5,
        tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        apex: ['Master', 'Grandmaster', 'Champion'] },
      { id: 'val', name: 'Valorant', weight: third, divisions: 3,
        tiers: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant'],
        apex: ['Immortal', 'Radiant'] },
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

  const api = { BASE, SPAN, APEX_STEP, defaultGames, rankToElo, ladder, normalizedWeights, playerRating };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamMaker = api;
})(typeof window !== 'undefined' ? window : globalThis);
