(function () {
  const T = window.TeamMaker;
  const C = window.TeamMakerText;
  const t = (key, vars) => C.t(key, vars);
  const attr = (key, vars) => esc(C.plain(key, vars));
  const KEY = 'teammaker.v2';

  // first role listed is the primary
  const SAMPLE = [
    ['Alex', { lol: ['Gold', 2], ow: ['Silver', 3], val: ['Silver', 1] }, { lol: ['Top', 'Mid'], ow: ['Support'], val: ['Sentinel'] }, []],
    ['Blair', { lol: ['Platinum', 3], ow: ['Gold', 1], val: ['Gold', 2] }, { lol: ['Jungle'], ow: ['DPS', 'Tank'], val: ['Initiator', 'Controller'] }, []],
    ['Casey', { lol: ['Diamond', 4], ow: ['Platinum', 2], val: ['Platinum', 3] }, { lol: ['Mid'], ow: ['DPS'], val: ['Duelist'] }, []],
    ['Drew', { lol: ['Emerald', 2], ow: ['Gold', 4], val: ['Diamond', 1] }, { lol: ['Bot'], ow: ['Tank'], val: ['Duelist', 'Flex'] }, []],
    ['Eli', { lol: ['Silver', 1], ow: ['Platinum', 5], val: ['Gold', 3] }, { lol: ['Support', 'Bot'], ow: ['Support'], val: ['Controller'] }, []],
    ['Fran', { lol: ['Emerald', 4], ow: ['Diamond', 3], val: ['Ascendant', 3] }, { lol: ['Jungle', 'Top'], ow: ['DPS'], val: ['Initiator'] }, []],
    ['Gale', { lol: ['Bronze', 1], ow: ['Gold', 2] }, { lol: ['Top'], ow: ['Support', 'Tank'] }, ['val']],
    ['Hollis', { lol: ['Platinum', 1], ow: ['Diamond', 5], val: ['Platinum', 1] }, { lol: ['Mid', 'Support'], ow: ['DPS'], val: ['Controller'] }, []],
    ['Indy', { lol: ['Gold', 4] }, { lol: ['Support'] }, ['ow', 'val']],
    ['Jules', { lol: ['Diamond', 1], ow: ['Platinum', 4], val: ['Diamond', 2] }, { lol: ['Bot', 'Mid'], ow: ['Tank', 'DPS'], val: ['Duelist', 'Initiator'] }, []],
    ['Kai', { ow: ['Gold', 3], val: ['Platinum', 2] }, { ow: ['DPS'], val: ['Duelist'] }, ['lol']],
  ];

  let state = load();
  let result = null, analysis = null, error = '';

  function fresh() {
    return { games: T.defaultGames(), players: [], wide: false, teams: 2, roleWeight: 0.5, seed: 0 };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.games) && Array.isArray(s.players)) { const st = { ...fresh(), ...s };
        st.games.forEach((g) => { if (g.id === 'val' && g.divisionsAscend === undefined) g.divisionsAscend = true; });
        return st; }
    } catch (e) { /* corrupt storage, start fresh */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage can be blocked */ }
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (g) => Math.round(g.weight * 100);

  const gameById = (id) => state.games.find((g) => g.id === id);
  const rankKey = (r) => (r ? `${r.tier}|${r.division == null ? '' : r.division}` : '');
  function parseRank(v) {
    if (!v) return null;
    const [tier, d] = v.split('|');
    return { tier, division: d === '' ? null : Number(d) };
  }

  function rankSelect(player, g) {
    const cur = player.ratings[g.id];
    const opts = T.ladder(g, state.wide);
    const curKey = rankKey(cur);
    let html = `<option value="">${attr('rank.notSet')}</option>`;
    // keep out-of-range rank visible
    if (cur && !opts.some((o) => rankKey(o) === curKey)) {
      html += `<option value="${esc(curKey)}" selected>${attr('rank.capped', { tier: cur.tier })}</option>`;
    }
    opts.forEach((o) => {
      const k = rankKey(o);
      html += `<option value="${esc(k)}"${k === curKey ? ' selected' : ''}>${esc(o.label)}</option>`;
    });
    return `<select data-act="rank" data-p="${player.id}" data-g="${g.id}">${html}</select>`;
  }

  function roleChips(player, g) {
    if (!(g.roles || []).length) return '';
    const mine = (player.roles && player.roles[g.id]) || [];
    return `<div class="chips">${g.roles.map((r) => {
      const i = mine.indexOf(r.name);
      return `<button class="chip${i >= 0 ? ' on' : ''}" data-act="role" data-p="${player.id}" data-g="${g.id}" data-r="${esc(r.name)}" title="${attr(i === 0 ? 'role.mainTip' : i > 0 ? 'role.alsoTip' : 'role.addTip')}">${i === 0 ? '★ ' : ''}${esc(r.name)}</button>`;
    }).join('')}</div>`;
  }

  const importanceKey = (v) => (v < 0.25 ? 'game.importance.low' : v < 0.6 ? 'game.importance.mid' : 'game.importance.high');
  const ladderText = (g) => (state.wide && g.apex.length
    ? C.plain('game.ladderApex', { low: g.tiers[0], high: g.tiers[g.tiers.length - 1], apex: g.apex.join(', ') })
    : C.plain('game.ladder', { low: g.tiers[0], high: g.tiers[g.tiers.length - 1] }));
  const rolesText = (g) => (g.roles || []).map((r) => (r.slots > 1 ? `${r.slots} ${r.name}` : r.name)).join(', ');

  function render() {
    const everyGame = state.players.filter((p) => state.games.every((g) => T.playsGame(p, g))).length;
    const app = document.getElementById('app');
    document.title = C.plain('app.title');
    app.innerHTML = `
      <h1>${t('app.title')}</h1>
      <p class="sub">${t('app.subtitle')}</p>

      <section>
        <h2><span class="step">1</span> ${t('games.heading')}</h2>
        <p class="muted">${t('games.intro')}</p>
        <div class="grid">
          ${state.games.map((g, gi) => `
            <div class="game">
              <header><span>${esc(g.name)}</span>
                <button class="link" title="${attr('game.removeTip')}" data-act="delgame" data-g="${g.id}">${t('game.remove')}</button></header>
              <div class="muted">${t('game.countsLabel')}</div>
              <div class="wrow"><input type="range" min="0" max="100" step="1" value="${pct(g)}" ${''} data-act="weight" data-g="${g.id}" aria-label="${attr('game.countsAria', { game: g.name })}">
                <b data-wl="${g.id}">${pct(g)}%</b></div>
              ${(g.roles || []).length ? `
                <div class="muted">${t('game.rolesLabel')} <b data-il="${g.id}">${t(importanceKey(g.roleImportance == null ? 1 : g.roleImportance))}</b></div>
                <div class="wrow"><input type="range" min="0" max="1" step="0.05" value="${g.roleImportance == null ? 1 : g.roleImportance}" data-act="importance" data-g="${g.id}" aria-label="${attr('game.rolesAria', { game: g.name })}"></div>
                <div class="muted">${t('game.needs', { roles: rolesText(g) })}</div>` : `<div class="muted">${t('game.noRoles')}</div>`}
              <div class="muted">${t('game.ranks', { ladder: ladderText(g) })}</div>
            </div>`).join('')}
        </div>

        <label class="toggle field-toggle"><input type="checkbox" data-act="wide" ${state.wide ? 'checked' : ''}>
          <span><b>${t('wide.title')}</b> ${t('wide.examples')}
          <span class="hint">${t('wide.hint')}</span></span></label>

        <details class="addgame-box">
          <summary>${t('addgame.summary')}</summary>
          <form class="addgame" data-act="addgame">
            <label>${t('addgame.name')} <input type="text" name="name" placeholder="${attr('addgame.namePh')}" required></label>
            <label>${t('addgame.tiers')} <input type="text" name="tiers" placeholder="${attr('addgame.tiersPh')}" required></label>
            <label>${t('addgame.apex')} <input type="text" name="apex" placeholder="${attr('addgame.apexPh')}"></label>
            <label>${t('addgame.roles')} <input type="text" name="roles" placeholder="${attr('addgame.rolesPh')}"></label>
            <label>${t('addgame.divs')} <input type="number" name="divs" min="1" max="9" value="3"></label>
            <label class="toggle"><input type="checkbox" name="asc"> ${t('addgame.asc')}</label>
            <button class="primary">${t('addgame.button')}</button>
          </form>
        </details>
      </section>

      <section>
        <h2><span class="step">2</span> ${t('players.heading', { n: state.players.length })}</h2>
        <p class="muted">${t('players.intro')}
        ${state.players.length ? t('players.everyGame', { n: everyGame, total: state.players.length }) : ''} ${t('players.roundNumber')}</p>
        ${state.players.length ? `<div class="tablewrap"><table>
          <thead><tr><th>${t('players.col.name')}</th>${state.games.map((g) => `<th>${esc(g.name)}</th>`).join('')}<th title="${attr('players.col.skillTip')}">${t('players.col.skill')}</th><th></th></tr></thead>
          <tbody>
            ${state.players.map((p) => {
              const r = T.playerRating(p, state.games, state.wide);
              return `<tr>
                <td><input type="text" value="${esc(p.name)}" data-act="name" data-p="${p.id}" aria-label="${attr('players.nameAria')}"></td>
                ${state.games.map((g) => { const on = T.playsGame(p, g);
                  return `<td><label class="plays"><input type="checkbox" data-act="plays" data-p="${p.id}" data-g="${g.id}" ${on ? 'checked' : ''}> ${t('players.plays')}</label>
                    ${on ? rankSelect(p, g) + roleChips(p, g) : `<div class="muted">${t('players.notPlaying')}</div>`}</td>`; }).join('')}
                <td class="num">${r == null ? t('players.noRanks') : Math.round(r)}</td>
                <td><button class="link" title="${attr('players.removeTip')}" data-act="delplayer" data-p="${p.id}">${t('players.remove')}</button></td></tr>`;
            }).join('')}
          </tbody>
        </table></div>` : `<p class="empty">${t('players.empty')}</p>`}
        <div class="row" style="margin-top:12px">
          <button data-act="addplayer">${t('players.add')}</button>
          <button data-act="sample">${t('players.sample')}</button>
          ${state.players.length ? `<button data-act="clear">${t('players.clear')}</button>` : ''}
        </div>
      </section>

      <section>
        <h2><span class="step">3</span> ${t('settings.heading')}</h2>
        <div class="field">
          <label><b>${t('teams.label')}</b>
            <input type="number" min="2" max="10" value="${state.teams}" data-act="teams"></label>
          <span class="hint">${t('teams.hint')}</span>
        </div>
        <div class="field">
          <b>${t('priority.title')}</b>
          <div class="scale"><span>${t('priority.left')}</span>
            <input type="range" min="0" max="1" step="0.05" value="${state.roleWeight}" data-act="roleWeight" aria-label="${attr('priority.aria')}">
            <span>${t('priority.right')}</span></div>
          <span class="hint">${t('priority.hint')}</span>
        </div>
      </section>

      ${checksHtml()}

      <section>
        <h2><span class="step">4</span> ${t('make.heading')}</h2>
        <div class="row"><button class="primary" data-act="generate">${t(result ? 'make.again' : 'make.button')}</button>
          ${result ? `<span class="muted">${t('make.againHint')}</span>` : ''}</div>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        ${result ? renderResult() : ''}
      </section>`;
  }

  const ICON = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
  function checksHtml() {
    if (state.players.length < 2) return '';
    const k = state.teams;
    const list = T.staticWarnings(state.players, { games: state.games, teams: k, wide: state.wide })
      .concat(analysis ? analysis.advice : []);
    list.sort((a, b) => ['error', 'warn', 'info'].indexOf(a.level) - ['error', 'warn', 'info'].indexOf(b.level));
    return `<section>
      <h2>${t('checks.heading')}</h2>
      <p class="muted">${t('checks.intro')}</p>
      ${list.length ? `<ul class="warnings">${list.map((w) => `<li class="${w.level}"><span>${ICON[w.level]}</span> ${t(w.key, w.vars)}</li>`).join('')}</ul>`
        : `<p class="good">${t('checks.okTeams', { k })}</p>`}
    </section>`;
  }

  const VERDICT = { good: 'verdict.good', ok: 'verdict.ok', bad: 'verdict.bad' };
  const verdictOf = (gap) => (gap < 40 ? 'good' : gap < 100 ? 'ok' : 'bad');

  function renderResult() {
    const { teams, stats } = result;
    const vSkill = verdictOf(stats.spread);
    const vClass = stats.missingRoles && vSkill === 'good' ? 'ok' : vSkill; // empty roles shouldn't look clean
    const detail = stats.perGame.length > 1 ? ` (${stats.perGame.map((g) => `${g.name}: ${Math.round(g.spread)}`).join(', ')})` : '';
    return `
      <p class="verdict ${vClass}"><b>${t(VERDICT[vSkill])}</b> ${t('result.gap', { gap: Math.round(stats.spread), detail })}
        ${stats.missingRoles ? t('result.rolesMissing', { n: stats.missingRoles }) : t('result.rolesOk')}
        <span class="muted">${t('result.gapHint')}</span></p>
      <div class="teams" style="margin-top:12px">
        ${teams.map((team, i) => `
          <div class="team">
            <h3><span>${t('team.title', { i: i + 1 })} <span class="muted">${t('team.size', { n: team.players.length })}</span></span><span class="muted" title="${attr('team.skillTip')}">${t('team.skill', { n: Math.round(team.avg) })}</span></h3>
            <ul>${team.players.map((pl) => `<li><span>${esc(pl.name || 'Unnamed')} <span class="muted">${pl.playsAll ? '' : t('team.plays', { games: pl.gamesPlayed.join(' + ') || C.plain('team.noGames') })}</span></span>
              <span class="muted" title="${attr('team.playerTip')}">${pl.rated ? Math.round(pl.rating) : t('team.noRank')}</span></li>`).join('')}</ul>
            ${team.games.map((g) => `
              <div class="gline"><b>${esc(g.name)}</b>${g.avg == null ? '' : ` <span class="muted">${t('team.gameAvg', { n: Math.round(g.avg) })}</span>`}
                ${g.assigned.length ? `<div class="muted">${g.assigned.map((a) => `${esc(a.role)}: ${esc(a.name || 'Unnamed')}`).join(' · ')}</div>` : ''}
                ${g.bench.length ? `<div class="muted">${t('team.backups', { names: g.bench.map((n) => n || 'Unnamed').join(', ') })}</div>` : ''}
                ${g.missing.length ? `<div class="chips"><span class="muted">${t('team.nobody')}</span>${g.missing.map((r) => `<span class="chip miss">${esc(r)}</span>`).join('')}</div>` : ''}
              </div>`).join('')}
          </div>`).join('')}
      </div>
      <p class="muted" style="margin-top:8px">${t('team.allGame', { counts: stats.allGameCounts.join(' / ') })}</p>
      `;
  }

  function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function handle(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const p = state.players.find((x) => x.id === el.dataset.p);
    const g = gameById(el.dataset.g);
    const isInput = e.type === 'input';

    // no re-render, keeps dragging smooth
    if (isInput && act === 'weight') {
      g.weight = Number(el.value) / 100;
      document.querySelector(`[data-wl="${g.id}"]`).textContent = pct(g) + '%';
      return save();
    }
    if (isInput && act === 'importance') {
      g.roleImportance = Number(el.value);
      document.querySelector(`[data-il="${g.id}"]`).innerHTML = t(importanceKey(g.roleImportance));
      return save();
    }
    if (isInput && act === 'roleWeight') {
      state.roleWeight = Number(el.value);
      return save();
    }
    if (isInput) return;

    if (e.type === 'change') {
      if (act === 'wide') state.wide = el.checked;
      else if (act === 'teams') state.teams = Math.min(10, Math.max(2, Math.round(Number(el.value)) || 2));
      else if (act === 'plays') { p.plays = p.plays || {}; if (el.checked) delete p.plays[g.id]; else p.plays[g.id] = false; }
      else if (act === 'name') p.name = el.value.trim();
      else if (act === 'rank') { const r = parseRank(el.value); if (r) p.ratings[g.id] = r; else delete p.ratings[g.id]; }
      else return;
    } else if (e.type === 'click') {
      if (act === 'addplayer') state.players.push({ id: newId('p'), name: C.plain('players.defaultName', { n: state.players.length + 1 }), ratings: {}, roles: {}, plays: {} });
      else if (act === 'delplayer') state.players = state.players.filter((x) => x !== p);
      else if (act === 'delgame') {
        state.games = state.games.filter((x) => x !== g);
        state.players.forEach((pl) => { delete pl.ratings[g.id]; delete pl.roles[g.id]; if (pl.plays) delete pl.plays[g.id]; });
      } else if (act === 'role') {
        const list = (p.roles[g.id] = p.roles[g.id] || []);
        const name = el.dataset.r, i = list.indexOf(name);
        if (e.shiftKey) { if (i >= 0) list.splice(i, 1); list.unshift(name); }
        else if (i >= 0) list.splice(i, 1);
        else list.push(name);
        if (!list.length) delete p.roles[g.id];
      } else if (act === 'clear') { if (!window.confirm(C.plain('players.clearConfirm'))) return; state.players = []; }
      else if (act === 'sample') {
        SAMPLE.forEach(([name, r, roles, out]) => {
          const ratings = {}, rl = {}, plays = {};
          out.forEach((gid) => { if (gameById(gid)) plays[gid] = false; });
          Object.entries(r).forEach(([gid, [tier, division]]) => { if (gameById(gid)) ratings[gid] = { tier, division }; });
          Object.entries(roles).forEach(([gid, list]) => { if (gameById(gid)) rl[gid] = list.slice(); });
          state.players.push({ id: newId('p'), name, ratings, roles: rl, plays });
        });
      } else if (act === 'generate') {
        state.seed += 1;
        try {
          ({ result, analysis } = T.planTeams(state.players, { games: state.games, wide: state.wide, teams: state.teams, roleWeight: state.roleWeight, seed: state.seed }));
          error = '';
        } catch (err) { result = null; analysis = null; error = err.message; }
      } else return;
    } else return;

    if (act !== 'generate') analysis = null; // old advice is stale after any edit
    save();
    render();
  }

  document.addEventListener('input', handle);
  document.addEventListener('change', handle);
  document.addEventListener('click', handle);
  document.addEventListener('submit', (e) => {
    if (e.target.dataset.act !== 'addgame') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
    const tiers = list(f.get('tiers'));
    if (!tiers.length) return;
    const roles = list(f.get('roles')).map((s) => {
      const [name, n] = s.split(':').map((x) => x.trim());
      return { name, slots: Math.max(1, Math.round(Number(n)) || 1) };
    });
    const n = Math.max(1, Math.round(Number(f.get('divs'))) || 1);
    const gid = newId('g');
    state.games.push({ id: gid, name: String(f.get('name')).trim(), weight: 1 / 3, divisions: n, divisionsAscend: f.get('asc') === 'on', tiers, apex: list(f.get('apex')), roles, roleImportance: 1 });
    save();
    render();
  });

  render();
})();
