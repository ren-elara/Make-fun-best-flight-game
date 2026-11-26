/* The sealed-data dashboard: accessible filtering, sorting, comparison details and farm plans. */
(function () {
  'use strict';

  var data = window.RADAR;
  var fmt = window.RadarFormat;
  var main = document.getElementById('main');
  var body = document.getElementById('rows');
  var dialog = document.getElementById('detail-dialog');
  var detail = document.getElementById('detail-content');
  var search = document.getElementById('search');
  var categoryFilter = document.getElementById('category-filter');
  var chainFilter = document.getElementById('chain-filter');
  var resetButton = document.getElementById('reset-filters');
  var emptyState = document.getElementById('empty-state');
  var state = { tab: 'candidates', query: '', category: 'all', chain: 'all', sort: 'rank', direction: 1 };

  if (!data || !fmt) {
    main.setAttribute('aria-busy', 'false');
    document.getElementById('board-heading').textContent = 'Radar data is unavailable.';
    return;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function append(parent, child) {
    if (child) parent.appendChild(child);
    return parent;
  }

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    state.tab = params.get('view') === 'live' ? 'live' : 'candidates';
    state.query = params.get('q') || '';
    state.category = params.get('category') || 'all';
    state.chain = params.get('chain') || 'all';
    search.value = state.query;
  }

  function writeUrl(slug) {
    var params = new URLSearchParams();
    if (state.tab === 'live') params.set('view', 'live');
    if (state.query.trim()) params.set('q', state.query.trim());
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (slug) params.set('protocol', slug);
    var query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }

  function currentRows() {
    return state.tab === 'live' ? data.live : data.rows;
  }

  function matches(row) {
    if (state.category !== 'all' && (row.category || 'Other') !== state.category) return false;
    if (state.chain !== 'all' && !(row.chains || []).includes(state.chain)) return false;
    var query = state.query.trim().toLocaleLowerCase();
    if (!query) return true;
    return [row.name, row.slug, row.category || '', (row.chains || []).join(' '), row.symbol || ''].join(' ').toLocaleLowerCase().includes(query);
  }

  function sortValue(row, key) {
    if (key === 'category') return (row.category || 'Other').toLocaleLowerCase();
    if (key === 'name') return row.name.toLocaleLowerCase();
    if (key === 'change_7d') return row.change_7d === null ? -Infinity : row.change_7d;
    if (key === 'age_days') return state.tab === 'live' ? (row.listed_at ? Date.parse(row.listed_at + 'T00:00:00Z') : -1) : (row.age_days === null ? -1 : row.age_days);
    if (key === 'rank' && state.tab === 'live') return row.mcap_usd === null ? -1 : row.mcap_usd;
    if (key === 'implied_value_usd' && state.tab === 'live') return row.mcap_usd === null ? -1 : row.mcap_usd;
    return row[key] === null || row[key] === undefined ? -1 : row[key];
  }

  function visibleRows() {
    var rows = currentRows().filter(matches);
    rows.sort(function (left, right) {
      var a = sortValue(left, state.sort);
      var b = sortValue(right, state.sort);
      if (a < b) return -state.direction;
      if (a > b) return state.direction;
      return left.slug.localeCompare(right.slug);
    });
    return rows;
  }

  function fillSelect(select, values, selected, firstLabel) {
    select.textContent = '';
    var first = element('option', '', firstLabel);
    first.value = 'all';
    select.appendChild(first);
    values.forEach(function (value) {
      var option = element('option', '', value);
      option.value = value;
      select.appendChild(option);
    });
    select.value = values.includes(selected) ? selected : 'all';
  }

  function populateFilters() {
    var rows = currentRows();
    var categories = Array.from(new Set(rows.map(function (row) { return row.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(rows.flatMap(function (row) { return row.chains || []; }))).sort();
    fillSelect(categoryFilter, categories, state.category, 'All sectors');
    fillSelect(chainFilter, chains, state.chain, 'All chains');
    state.category = categoryFilter.value;
    state.chain = chainFilter.value;
  }

  function updateHeader() {
    var live = state.tab === 'live';
    document.getElementById('tab-candidates').classList.toggle('is-active', !live);
    document.getElementById('tab-candidates').setAttribute('aria-selected', String(!live));
    document.getElementById('tab-live').classList.toggle('is-active', live);
    document.getElementById('tab-live').setAttribute('aria-selected', String(live));
    document.getElementById('board-heading').textContent = live ? 'Tokens already on the market.' : 'Activity with an open question.';
    document.querySelector('.board-legend').textContent = live ? 'TOKEN RECORDED · MARKET DATA, NOT A MODEL' : 'NO TOKEN DATA RECORDED · RANKED BY IMPLIED VALUE';
    document.getElementById('footer-note').textContent = live ? 'Live-token references are not ranked with pre-token estimates.' : 'Select a protocol to inspect its valuation and farming plan.';
    var headers = document.querySelectorAll('.radar-table thead th');
    headers[4].querySelector('button').childNodes[0].textContent = '7D FLOW ';
    headers[5].querySelector('button').childNodes[0].textContent = live ? 'LISTED ' : 'TRACKED ';
    headers[6].querySelector('button').childNodes[0].textContent = live ? 'RECORDED MKT CAP ' : 'IMPLIED VALUE ';
    document.querySelector('.radar-table thead th:last-child').textContent = live ? 'TOKEN' : 'SUPPORT';
  }

  function renderRow(row, maxValue) {
    var live = state.tab === 'live';
    var tr = element('tr');
    var rank = element('td', 'rank-cell', live ? 'LIVE' : '#' + row.rank);
    append(tr, rank);

    var protocolCell = element('td');
    var open = element('button', 'protocol-button');
    open.type = 'button';
    open.setAttribute('data-protocol', row.slug);
    open.setAttribute('aria-label', 'Open details for ' + row.name);
    append(open, element('strong', '', row.name));
    append(open, element('span', '', row.slug));
    append(protocolCell, open);
    append(tr, protocolCell);

    var categoryCell = element('td', 'category-cell');
    append(categoryCell, document.createTextNode(row.category || 'Other'));
    append(categoryCell, element('span', 'chain-sub', (row.chains || []).slice(0, 2).join(' · ') || 'Chain not listed'));
    append(tr, categoryCell);

    append(tr, element('td', 'numeric mono-cell', fmt.compactUsd(row.tvl_usd, 1)));
    var changeClass = row.change_7d === null ? 'numeric muted-cell mono-cell' : 'numeric mono-cell ' + (row.change_7d >= 0 ? 'flow-positive' : 'flow-negative');
    append(tr, element('td', changeClass, fmt.percent(row.change_7d)));
    append(tr, element('td', 'numeric muted-cell mono-cell', live ? fmt.date(row.listed_at, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : fmt.duration(row.age_days)));

    var value = live ? row.mcap_usd : row.implied_value_usd;
    var valueCell = element('td', 'value-cell');
    var valueMain = element('div', 'value-main');
    append(valueMain, element('span', '', fmt.compactUsd(value, 2)));
    append(valueMain, element('span', 'value-mini-label', live ? fmt.ratio(row.market_cap_to_tvl) : fmt.compactUsd(row.value_range_usd.low, 1) + '–' + fmt.compactUsd(row.value_range_usd.high, 1)));
    append(valueCell, valueMain);
    var track = element('div', 'value-track');
    var fill = element('i');
    var share = maxValue > 0 ? Math.sqrt(Math.max(value || 0, 0) / maxValue) * 100 : 0;
    fill.style.width = Math.max(3, Math.min(100, share)) + '%';
    append(track, fill);
    append(valueCell, track);
    append(tr, valueCell);

    var supportCell = element('td');
    if (live) {
      append(supportCell, element('span', 'support-chip', row.symbol || row.gecko_id || 'Token recorded'));
    } else {
      var level = row.confidence === 'High' ? '' : row.confidence === 'Moderate' ? ' moderate' : ' thin';
      append(supportCell, element('span', 'support-chip' + level, row.confidence));
    }
    append(tr, supportCell);
    return tr;
  }

  function renderTable() {
    updateHeader();
    var rows = visibleRows();
    var maxValue = Math.max.apply(null, rows.map(function (row) {
      return state.tab === 'live' ? (row.mcap_usd || 0) : row.implied_value_usd;
    }).concat([1]));
    body.textContent = '';
    rows.forEach(function (row) { append(body, renderRow(row, maxValue)); });
    emptyState.hidden = rows.length !== 0;
    document.querySelector('.table-scroll').classList.toggle('is-empty', rows.length === 0);
    document.getElementById('result-count').textContent = fmt.whole.format(rows.length);
    document.getElementById('result-total').textContent = fmt.whole.format(currentRows().length);
    resetButton.hidden = state.query.length === 0 && state.category === 'all' && state.chain === 'all';
    document.querySelectorAll('.radar-table th button').forEach(function (button) {
      var active = button.getAttribute('data-sort') === state.sort;
      var mark = button.querySelector('.sort-mark');
      mark.textContent = active ? (state.direction < 0 ? '↓' : '↑') : '';
      button.closest('th').setAttribute('aria-sort', active ? (state.direction < 0 ? 'descending' : 'ascending') : 'none');
    });
  }

  function addDetailStat(parent, label, value) {
    var stat = element('div', 'detail-stat');
    append(stat, element('span', '', label));
    append(stat, element('strong', '', value));
    append(parent, stat);
  }

  function factor(parent, label, width, value) {
    var row = element('div', 'factor-row');
    append(row, element('span', '', label));
    var bar = element('span', 'factor-bar');
    var fill = element('i');
    fill.style.width = Math.max(5, Math.min(100, width)) + '%';
    append(bar, fill);
    append(row, bar);
    append(row, element('strong', '', value));
    append(parent, row);
  }

  function addFarmPlan(parent, row) {
    var section = element('section', 'detail-section');
    var heading = element('div', 'detail-section-heading');
    append(heading, element('h3', '', 'A careful farming route'));
    append(heading, element('span', '', 'EVIDENCE FIRST · NO PROMISED DROP'));
    append(section, heading);
    var list = element('ol', 'farm-list');
    row.farm_plan.forEach(function (step) {
      var item = element('li', 'farm-step');
      var content = element('div');
      append(content, element('h4', '', step.title));
      append(content, element('p', '', step.action));
      var meta = element('div', 'farm-meta');
      append(meta, element('span', '', 'COST · ' + step.cost));
      append(meta, element('span', '', 'TIME · ' + step.time));
      append(content, meta);
      append(item, content);
      append(list, item);
    });
    append(section, list);
    append(parent, section);
  }

  function showCandidate(row, content) {
    var valueCard = element('section', 'detail-value-card');
    append(valueCard, element('div', 'detail-value-label', 'IMPLIED TOKEN MARKET CAP · SNAPSHOT MODEL'));
    append(valueCard, element('div', 'detail-value-number', fmt.compactUsd(row.implied_value_usd, 2)));
    append(valueCard, element('div', 'detail-value-range', 'Peer range  ' + fmt.compactUsd(row.value_range_usd.low, 2) + ' — ' + fmt.compactUsd(row.value_range_usd.high, 2)));
    var range = element('div', 'range-track');
    var low = Math.max(0, Math.min(95, (row.value_range_usd.low / row.value_range_usd.high) * 100));
    var high = 100;
    var band = element('i');
    band.style.left = low + '%';
    band.style.width = Math.max(4, high - low) + '%';
    append(range, band);
    var marker = element('b');
    marker.style.left = Math.max(0, Math.min(99, (row.implied_value_usd / row.value_range_usd.high) * 100)) + '%';
    append(range, marker);
    append(valueCard, range);
    var rangeCaption = element('div', 'range-caption');
    append(rangeCaption, element('span', '', 'LOWER PEER QUARTILE'));
    append(rangeCaption, element('span', '', 'UPPER PEER QUARTILE'));
    append(valueCard, rangeCaption);
    append(content, valueCard);

    var stats = element('div', 'detail-grid');
    addDetailStat(stats, 'TOTAL VALUE LOCKED', fmt.compactUsd(row.tvl_usd, 2));
    addDetailStat(stats, '7-DAY CHANGE', fmt.percent(row.change_7d));
    addDetailStat(stats, 'TRACKED FOR', fmt.duration(row.age_days));
    addDetailStat(stats, 'PEER SUPPORT', row.confidence + ' · ' + row.model.peer_count);
    append(content, stats);

    var model = element('section', 'detail-section');
    var modelHeading = element('div', 'detail-section-heading');
    append(modelHeading, element('h3', '', 'The estimate, unpacked'));
    append(modelHeading, element('span', '', 'MODEL ' + data.model.version.toUpperCase()));
    append(model, modelHeading);
    var factors = element('div', 'factor-list');
    factor(factors, 'TVL base', Math.min(100, 22 + Math.log10(Math.max(row.tvl_usd, 1)) * 7), fmt.compactUsd(row.tvl_usd, 1));
    factor(factors, 'Peer ratio', Math.min(100, row.model.peer_ratio_median * 18), fmt.ratio(row.model.peer_ratio_median));
    factor(factors, '7d flow', Math.min(100, row.model.growth_multiplier * 50), row.model.growth_multiplier.toFixed(2) + '×');
    factor(factors, 'Tenure', Math.min(100, row.model.tenure_multiplier * 75), row.model.tenure_multiplier.toFixed(2) + '×');
    factor(factors, 'Chain breadth', Math.min(100, row.model.breadth_multiplier * 75), row.model.breadth_multiplier.toFixed(2) + '×');
    append(model, factors);
    append(model, element('p', 'peer-note', 'Benchmark: ' + row.model.peer_set + ' · ' + row.model.peer_count + ' live-token peers. Category estimate is shrunk toward the market-wide median (weight ' + Math.round(row.model.shrinkage_weight * 100) + '%). ' + row.confidence_note));
    append(model, element('p', 'formula-note', data.model.formula + '. Growth is bounded; missing inputs are neutral, not guessed.'));
    append(content, model);

    var caveat = element('p', 'disclaimer', 'This is a peer-relative market-cap estimate from one dated snapshot—not a launch prediction, a token-absence guarantee or an expected return. Verify current deployments, incentives and eligibility from the protocol itself.');
    append(content, caveat);
    addFarmPlan(content, row);
  }

  function showLive(row, content) {
    var card = element('section', 'detail-value-card');
    append(card, element('div', 'detail-value-label', 'RECORDED TOKEN MARKET CAP'));
    append(card, element('div', 'detail-value-number', fmt.compactUsd(row.mcap_usd, 2)));
    append(card, element('div', 'detail-value-range', 'Market-cap / TVL  ' + fmt.ratio(row.market_cap_to_tvl)));
    append(content, card);
    var stats = element('div', 'detail-grid');
    addDetailStat(stats, 'TOTAL VALUE LOCKED', fmt.compactUsd(row.tvl_usd, 2));
    addDetailStat(stats, 'TOKEN SYMBOL', row.symbol || 'Not recorded');
    addDetailStat(stats, '7-DAY CHANGE', fmt.percent(row.change_7d));
    addDetailStat(stats, 'TRACKED SINCE', fmt.date(row.listed_at));
    append(content, stats);
    append(content, element('p', 'disclaimer', 'This protocol is shown as a live-token reference, not ranked among pre-token estimates. Market capitalization and TVL are the values in the sealed snapshot.'));
  }

  function openDetail(slug, shouldWriteUrl) {
    var row = data.rows.find(function (candidate) { return candidate.slug === slug; });
    var live = false;
    if (!row) {
      row = data.live.find(function (candidate) { return candidate.slug === slug; });
      live = true;
    }
    if (!row) return;
    detail.textContent = '';
    var kicker = element('div', 'detail-kicker');
    if (!live) append(kicker, element('span', 'detail-rank', String(row.rank).padStart(2, '0')));
    append(kicker, element('span', '', live ? 'Live-token reference' : row.category || 'Unclassified sector'));
    append(kicker, element('span', '', '·'));
    append(kicker, element('span', '', live ? 'Token recorded' : 'No token data recorded'));
    append(detail, kicker);
    append(detail, element('h2', '', row.name));
    append(detail, element('div', 'detail-slug', row.slug));

    var tags = element('div', 'detail-tags');
    append(tags, element('span', 'detail-tag status', live ? (row.symbol || 'Live token') : row.confidence + ' peer support'));
    (row.chains || []).forEach(function (chain) { append(tags, element('span', 'detail-tag', chain)); });
    append(detail, tags);
    if (live) showLive(row, detail); else showCandidate(row, detail);

    var footer = element('div', 'detail-footer');
    append(footer, element('span', '', 'SNAPSHOT ' + data.as_of));
    append(footer, element('span', '', 'SOURCE · DEFILLAMA INDEX'));
    append(detail, footer);
    if (shouldWriteUrl !== false) writeUrl(slug);
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.setAttribute('open', 'open');
    document.getElementById('detail-close').focus();
  }

  function closeDetail() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    writeUrl(null);
  }

  function reset() {
    state.query = '';
    state.category = 'all';
    state.chain = 'all';
    search.value = '';
    populateFilters();
    writeUrl(null);
    renderTable();
  }

  function render() {
    populateFilters();
    renderTable();
    main.setAttribute('aria-busy', 'false');
  }

  function updateSort(button) {
    var next = button.getAttribute('data-sort');
    if (state.sort === next) state.direction *= -1;
    else {
      state.sort = next;
      state.direction = next === 'name' || next === 'category' ? 1 : -1;
    }
    renderTable();
  }

  document.getElementById('snapshot-date').textContent = 'AS OF ' + fmt.date(data.as_of, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
  document.getElementById('snapshot-card-date').textContent = fmt.date(data.as_of);
  document.getElementById('snapshot-source').textContent = data.source;
  document.getElementById('snapshot-floor').textContent = fmt.compactUsd(data.floor_usd, 0) + ' TVL';
  document.getElementById('model-version').textContent = data.model.version;
  document.getElementById('coverage-count').textContent = data.watchlist_size + ' / ' + data.watchlist_size;
  document.getElementById('candidate-count').textContent = fmt.whole.format(data.board_size);
  document.getElementById('peer-count').textContent = fmt.whole.format(data.peer_size);
  document.getElementById('tab-candidate-count').textContent = fmt.whole.format(data.board_size);
  document.getElementById('tab-live-count').textContent = fmt.whole.format(data.live.length);
  document.getElementById('footer-date').textContent = data.as_of;

  readUrl();
  document.getElementById('tab-candidates').addEventListener('click', function () { state.tab = 'candidates'; state.category = 'all'; state.chain = 'all'; state.sort = 'rank'; state.direction = 1; writeUrl(null); render(); });
  document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; state.category = 'all'; state.chain = 'all'; state.sort = 'rank'; state.direction = -1; writeUrl(null); render(); });
  search.addEventListener('input', function () { state.query = search.value; writeUrl(null); renderTable(); });
  categoryFilter.addEventListener('change', function () { state.category = categoryFilter.value; writeUrl(null); renderTable(); });
  chainFilter.addEventListener('change', function () { state.chain = chainFilter.value; writeUrl(null); renderTable(); });
  resetButton.addEventListener('click', reset);
  document.getElementById('empty-reset').addEventListener('click', reset);
  document.querySelectorAll('.radar-table th button').forEach(function (button) { button.addEventListener('click', function () { updateSort(button); }); });
  body.addEventListener('click', function (event) {
    var button = event.target.closest('[data-protocol]');
    if (button) openDetail(button.getAttribute('data-protocol'));
  });
  document.getElementById('detail-close').addEventListener('click', closeDetail);
  dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDetail(); });
  dialog.addEventListener('close', function () { writeUrl(null); });
  document.getElementById('method-link').addEventListener('click', function () { document.getElementById('method-title').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && !dialog.open) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === 'Escape' && dialog.open) closeDetail();
  });

  render();
  var requested = new URLSearchParams(window.location.search).get('protocol');
  if (requested) openDetail(requested, false);
}());
