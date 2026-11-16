/* Token Radar dashboard: reads window.RADAR (written beside dashboard/ by
   main.ts) and renders the ranked board, a per-protocol detail view with the
   model's factor breakdown and the farm plan, a live-peers view (the traded
   protocols the category multiples come from) and the set-aside list.
   Filters and the detail view are deep-linkable (?category=Lending,
   ?detail=<slug>, ?tab=live) so a reader can share one exact view. */
(function () {
  'use strict';
  var DATA = window.RADAR;
  var boardEl = document.getElementById('board');
  var detailEl = document.getElementById('detail');
  if (!DATA) {
    boardEl.innerHTML = '<div class="empty">No radar data: run main.ts first — it writes data.js beside this page.</div>';
    return;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="slug">n/a</span>';
    var cls = v >= 0 ? 'up' : 'down';
    return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unrecorded';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yrs';
  }

  var rows = DATA.rows;
  var state = { tab: 'board', q: '', category: '', chain: '', minTvl: 0, sort: 'rank', watchOnly: false };

  /* stats + model note */
  var watchCount = rows.filter(function (r) { return r.watchlist; }).length;
  var totalTvl = rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
  document.getElementById('stats').innerHTML = [
    [rows.length, 'protocols ranked'],
    [watchCount + ' / ' + DATA.watchlist.length, 'watchlist covered'],
    [money(totalTvl), 'TVL under watch'],
    ['x' + DATA.model.global_multiple.toFixed(3), 'median mcap / TVL'],
    [DATA.aside.length, 'set aside (wrapped, CEX…)'],
  ].map(function (s) { return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join('');
  document.getElementById('model-note').textContent = DATA.model.early_note;
  document.getElementById('as-of').textContent = DATA.as_of;

  /* filter option lists from the data itself */
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  var catSel = document.getElementById('f-category');
  catSel.innerHTML = '<option value="">all categories</option>' + cats.map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');
  var chainSel = document.getElementById('f-chain');
  chainSel.innerHTML = '<option value="">all chains</option>' + chains.map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');

  function visibleRows() {
    var out = rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (state.sort === 'tvl') out.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (state.sort === 'growth') out.sort(function (a, b) { return (b.change_7d || -1e9) - (a.change_7d || -1e9); });
    else if (state.sort === 'age') out.sort(function (a, b) { return (b.age_days || -1) - (a.age_days || -1); });
    else out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }

  function renderBoard() {
    detailEl.hidden = true;
    boardEl.hidden = false;
    if (state.tab === 'live') {
      boardEl.innerHTML = '<table><thead><tr><th>Protocol</th><th>Category</th>' +
        '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>' +
        DATA.live.map(function (r) {
          return '<tr data-live="' + esc(r.slug) + '"><td><span class="name">' + esc(r.name) + '</span> ' +
            '<span class="slug">' + esc(r.slug) + '</span></td><td>' + esc(r.category || '—') + '</td>' +
            '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
            '<td class="num">x' + r.multiple.toFixed(3) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="empty" style="margin-top:12px">These are the traded peers each category multiple is the median of. Their tokens already exist — the radar’s board is the other tab.</div>';
      return;
    }
    if (state.tab === 'aside') {
      boardEl.innerHTML = '<div class="aside-list">' + DATA.aside.map(function (r) {
        return '<div class="aside-row"><b>' + esc(r.name) + '</b> <span class="slug">' + esc(r.slug) + '</span> — set aside: ' + esc(r.reason) + '.</div>';
      }).join('') + '</div>';
      return;
    }
    var vis = visibleRows();
    if (!vis.length) {
      boardEl.innerHTML = '<div class="empty">No protocol matches those filters. Loosen one and sweep again.</div>';
      return;
    }
    boardEl.innerHTML = '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>' +
      vis.map(function (r) {
        return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">' + r.rank + '</td>' +
          '<td><span class="name">' + esc(r.name) + '</span>' +
          (r.watchlist ? '<span class="watch-badge">WATCHLIST</span>' : '') +
          '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + ageText(r.age_days) + '</td>' +
          '<td class="num value">' + money(r.implied_value_usd) + '</td></tr>';
      }).join('') + '</tbody></table>';
    Array.prototype.forEach.call(boardEl.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function factor(label, value, note, frac) {
    return '<div class="factor"><span>' + esc(label) + '</span><b>' + esc(value) + '</b><i>' + esc(note) + '</i>' +
      '<div class="track"><div class="fill" style="width:' + Math.max(3, Math.min(100, frac * 100)) + '%"></div></div></div>';
  }

  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    boardEl.hidden = true;
    detailEl.hidden = false;
    detailEl.innerHTML =
      '<button class="back" type="button" id="back">← Back to the board</button>' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="watch-badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · live on ' + esc(r.chains.join(', ')) +
      ' · records no token in the snapshot</p>' +
      '<div class="factors">' +
      factor('Implied value', money(r.implied_value_usd), 'rank #' + r.rank + ' of ' + rows.length, r.implied_value_usd / rows[0].implied_value_usd) +
      factor('TVL', money(r.tvl_usd), 'total value locked, snapshot figure', Math.min(1, r.tvl_usd / rows[0].tvl_usd)) +
      factor('Category multiple', 'x' + r.multiple.toFixed(3), 'median mcap/TVL of traded ' + (r.category || '') + ' peers', Math.min(1, r.multiple / 1.5)) +
      factor('Momentum', 'x' + r.momentum.toFixed(2), '7d TVL change ' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '%') + ', clamped', (r.momentum - 0.5) / 1.4) +
      factor('Maturity', 'x' + r.maturity.toFixed(2), 'tracked ' + ageText(r.age_days) + ' with no token', (r.maturity - 0.75) / 0.5) +
      factor('Breadth', 'x' + r.breadth.toFixed(2), r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains'), (r.breadth - 1) / 0.15) +
      '</div>' +
      '<h3>How to farm it</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    document.getElementById('back').addEventListener('click', function () { renderBoard(); });
    detailEl.scrollIntoView();
  }

  /* controls */
  function bindTabs() {
    ['board', 'live', 'aside'].forEach(function (t) {
      document.getElementById('tab-' + t).addEventListener('click', function () {
        state.tab = t;
        ['board', 'live', 'aside'].forEach(function (x) {
          document.getElementById('tab-' + x).classList.toggle('active', x === t);
        });
        renderBoard();
      });
    });
  }
  bindTabs();
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; if (state.tab === 'board') renderBoard(); });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  document.getElementById('f-tvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); renderBoard(); });
  document.getElementById('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  document.getElementById('f-watch').addEventListener('change', function (e) { state.watchOnly = e.target.checked; renderBoard(); });

  /* deep links */
  var params = new URLSearchParams(window.location.search);
  if (params.get('category')) { state.category = params.get('category'); catSel.value = state.category; }
  if (params.get('chain')) { state.chain = params.get('chain'); chainSel.value = state.chain; }
  if (params.get('watch') === '1') { state.watchOnly = true; document.getElementById('f-watch').checked = true; }
  if (params.get('tab') === 'live' || params.get('tab') === 'aside') {
    state.tab = params.get('tab');
    ['board', 'live', 'aside'].forEach(function (x) {
      document.getElementById('tab-' + x).classList.toggle('active', x === state.tab);
    });
  }
  renderBoard();
  if (params.get('detail')) openDetail(params.get('detail'));
})();
