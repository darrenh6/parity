(function () {
  const T = window.TeamMaker;
  const C = window.TeamMakerText;
  const t = (key, vars) => C.t(key, vars);
  const attr = (key, vars) => esc(C.plain(key, vars));

  let state = fresh();
  let result = null, error = '';

  function fresh() {
    return { games: T.defaultGames(), players: [], wide: false, teams: 2, seed: 0 };
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

  const ladderText = (g) => (state.wide && g.apex.length
    ? C.plain('game.ladderApex', { low: g.tiers[0], high: g.tiers[g.tiers.length - 1], apex: g.apex.join(', ') })
    : C.plain('game.ladder', { low: g.tiers[0], high: g.tiers[g.tiers.length - 1] }));

  function render() {
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
              <div class="muted">${t('game.ranks', { ladder: ladderText(g) })}</div>
            </div>`).join('')}
        </div>

        <label class="toggle field-toggle"><input type="checkbox" data-act="wide" ${state.wide ? 'checked' : ''}>
          <span><b>${t('wide.title')}</b> ${t('wide.examples')}
          <span class="hint">${t('wide.hint')}</span></span></label>

      </section>

      <section>
        <h2><span class="step">2</span> ${t('players.heading', { n: state.players.length })}</h2>
        <p class="muted">${t('players.intro')}</p>
        ${state.players.length ? `<div class="tablewrap"><table>
          <thead><tr><th>${t('players.col.name')}</th>${state.games.map((g) => `<th>${esc(g.name)}</th>`).join('')}<th title="${attr('players.col.skillTip')}">${t('players.col.skill')}</th><th></th></tr></thead>
          <tbody>
            ${state.players.map((p) => {
              const r = T.playerRating(p, state.games, state.wide);
              return `<tr>
                <td><input type="text" value="${esc(p.name)}" data-act="name" data-p="${p.id}" aria-label="${attr('players.nameAria')}"></td>
                ${state.games.map((g) => `<td>${rankSelect(p, g)}</td>`).join('')}
                <td class="num">${r == null ? t('players.noRanks') : Math.round(r)}</td>
                <td><button class="link" title="${attr('players.removeTip')}" data-act="delplayer" data-p="${p.id}">${t('players.remove')}</button></td></tr>`;
            }).join('')}
          </tbody>
        </table></div>` : `<p class="empty">${t('players.empty')}</p>`}
        <div class="row" style="margin-top:12px">
          <button data-act="addplayer">${t('players.add')}</button>
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
      </section>

      <section>
        <h2><span class="step">4</span> ${t('make.heading')}</h2>
        <div class="row"><button class="primary" data-act="generate">${t(result ? 'make.again' : 'make.button')}</button>
          ${result ? `<span class="muted">${t('make.againHint')}</span>` : ''}</div>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        ${result ? renderResult() : ''}
      </section>`;
  }

  const VERDICT = { good: 'verdict.good', ok: 'verdict.ok', bad: 'verdict.bad' };
  const verdictOf = (gap) => (gap < 40 ? 'good' : gap < 100 ? 'ok' : 'bad');

  function renderResult() {
    const { teams, stats } = result;
    const vSkill = verdictOf(stats.spread);
    const vClass = vSkill;
    const detail = '';
    return `
      <p class="verdict ${vClass}"><b>${t(VERDICT[vSkill])}</b> ${t('result.gap', { gap: Math.round(stats.spread), detail })}
        <span class="muted">${t('result.gapHint')}</span></p>
      <div class="teams" style="margin-top:12px">
        ${teams.map((team, i) => `
          <div class="team">
            <h3><span>${t('team.title', { i: i + 1 })} <span class="muted">${t('team.size', { n: team.players.length })}</span></span><span class="muted" title="${attr('team.skillTip')}">${t('team.skill', { n: Math.round(team.avg) })}</span></h3>
            <ul>${team.players.map((pl) => `<li><span>${esc(pl.name || 'Unnamed')}</span>
              <span class="muted" title="${attr('team.playerTip')}">${pl.rated ? Math.round(pl.rating) : t('team.noRank')}</span></li>`).join('')}</ul>
          </div>`).join('')}
      </div>
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
      return undefined;
    }
    if (isInput) return;

    if (e.type === 'change') {
      if (act === 'wide') state.wide = el.checked;
      else if (act === 'teams') state.teams = Math.min(10, Math.max(2, Math.round(Number(el.value)) || 2));
      else if (act === 'name') p.name = el.value.trim();
      else if (act === 'rank') { const r = parseRank(el.value); if (r) p.ratings[g.id] = r; else delete p.ratings[g.id]; }
      else return;
    } else if (e.type === 'click') {
      if (act === 'addplayer') state.players.push({ id: newId('p'), name: C.plain('players.defaultName', { n: state.players.length + 1 }), ratings: {} });
      else if (act === 'delplayer') state.players = state.players.filter((x) => x !== p);
      else if (act === 'delgame') {
        state.games = state.games.filter((x) => x !== g);
        state.players.forEach((pl) => { delete pl.ratings[g.id]; });
      } else if (act === 'clear') { if (!window.confirm(C.plain('players.clearConfirm'))) return; state.players = []; }
      else if (act === 'generate') {
        state.seed += 1;
        try {
          result = T.buildTeams(state.players, { games: state.games, wide: state.wide, teams: state.teams, seed: state.seed });
          error = '';
        } catch (err) { result = null; error = err.message; }
      } else return;
    } else return;

    render();
  }

  document.addEventListener('input', handle);
  document.addEventListener('change', handle);
  document.addEventListener('click', handle);

  render();
})();
