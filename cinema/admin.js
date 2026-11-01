// Seat layout editor for theatre owners. Made for people who have never used a design tool:
//  1. Quick start: answer 4 questions (rows, seats per row, walkways, recliner rows) → a full layout.
//  2. Tap seats to change them (seat / wheelchair / not for sale / empty / walkway), add or remove seats and rows.
//  3. Hall size & floor in plain words (exact metres are optional), prices per seat type.
// The live 2D map, view scores and 3D preview update as you edit. Experts can still type rows as text.
import { CLASS_META, MOVIES, CITIES, theatresFor, theatreById } from './data.js';
import { HALLS, buildLayout, specOfHall, rowsToText, textToRows, parsePlan, REC_CLASSES, customFor, scoreColor } from './layout.js';
import { mountMap } from './map2d.js';
import { icon, esc, inr, $, $$, toast, clsName, state, tx } from './ui.js';

const FIELDS = [
  ['Screen', [['screen.w', 'Screen width', 'm', 4, 40, 0.5], ['screen.h', 'Screen height', 'm', 2, 22, 0.5], ['screen.elev', 'Screen bottom above floor', 'm', 0.3, 5, 0.05], ['screen.curve', 'Screen curve depth', 'm', 0, 3, 0.1]]],
  ['Hall', [['room.halfW', 'Half of hall width', 'm', 5, 26, 0.5], ['room.ceiling', 'Ceiling height', 'm', 5, 26, 0.5], ['room.curve', 'Row curve radius (big = straight rows)', 'm', 10, 400, 1]]],
  ['Rows', [['geo.firstRow', 'Screen to first row', 'm', 2, 20, 0.1], ['geo.rowGap', 'Row to row', 'm', 0.8, 2.5, 0.05], ['geo.recGap', 'Recliner row to row', 'm', 1.2, 3, 0.05], ['geo.rise', 'Step height per row', 'm', 0, 0.9, 0.01], ['geo.recRise', 'Step height, recliner rows', 'm', 0, 1.2, 0.01]]],
];
const BALC = [['balcony.base', 'Balcony floor height', 'm', 2, 12, 0.1], ['balcony.gap', 'Gap before balcony', 'm', 1.5, 8, 0.05], ['balcony.rowGap', 'Balcony row to row', 'm', 0.8, 2.5, 0.05], ['balcony.rise', 'Balcony step height', 'm', 0, 0.9, 0.01]];
// What a tap does. '|' is a walkway between seats.
const TOOLS = [['S', 'Seat', 'seat'], ['W', 'Wheelchair', 'wheel'], ['X', 'Not for sale', 'x'], ['.', 'Empty', 'minus'], ['|', 'Walkway', 'grid']];
const SIZES = {
  small: { label: 'Small (up to 150 seats)', screen: { w: 10, h: 4.2 }, room: { halfW: 8 }, firstRow: 4 },
  medium: { label: 'Medium (150–350 seats)', screen: { w: 14, h: 6 }, room: { halfW: 11 }, firstRow: 5.5 },
  large: { label: 'Large (350+ seats)', screen: { w: 18, h: 7.6 }, room: { halfW: 14 }, firstRow: 7 },
  giant: { label: 'Giant screen (IMAX type)', screen: { w: 22, h: 12 }, room: { halfW: 14 }, firstRow: 6 },
};
const FLOORS = { flat: ['Flat floor (old halls)', 0.05, 0.1], gentle: ['Small steps', 0.18, 0.3], stadium: ['Stadium steps (each row clearly higher)', 0.36, 0.45] };
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const set = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { a = a[k] ??= {}; }); a[ks[ks.length - 1]] = v; };
const letter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
const isRec = (cls) => REC_CLASSES.includes(cls);

// plan text <-> list of cells, where '|' marks a walkway
const toCells = (row) => parsePlan(row.plan, isRec(row.cls)).flatMap((b, i) => (i ? ['|', ...b] : b));
function toPlan(cells, rec) {
  const def = rec ? 'R' : 'S';
  const blocks = []; let cur = [];
  for (const c of cells) { if (c === '|') { if (cur.length) blocks.push(cur); cur = []; } else cur.push(c === 'S' || c === 'R' ? def : c); }
  if (cur.length) blocks.push(cur);
  return blocks.map((cs) => { let out = '', run = 0; const flush = () => { if (run) out += run; run = 0; }; for (const c of cs) { if (c === def) run++; else { flush(); out += c; } } flush(); return out; }).join('_');
}
const seatCount = (cells) => cells.filter((c) => c !== '|' && c !== '.').length;
function blocksFor(n, walk) {
  if (walk === 'none' || n < 6) return [n];
  if (walk === 'middle') return [Math.ceil(n / 2), Math.floor(n / 2)];
  const side = Math.max(2, Math.round(n / 4)); return [side, n - 2 * side, side];
}

export function adminView(view, screenId, ctx) {
  const me = ctx.db.me;
  const mine = me && me.role !== 'admin' ? (me.theatreIds || []).map(theatreById).filter(Boolean) : theatresFor(ctx.city(), { all: true });
  const all = mine.flatMap((th) => th.screens.map((sc) => ({ th, sc })));
  if (!all.length) { view.innerHTML = '<p class="empty">No screens to edit yet.</p>'; return; }
  if (!screenId || !all.some((x) => x.sc.id === screenId)) screenId = all[0].sc.id;
  const th = theatreById(screenId.replace(/s\d+$/, ''));
  const sc = th.screens[+screenId.match(/s(\d+)$/)[1]];
  let spec = customFor(screenId) ? JSON.parse(JSON.stringify(customFor(screenId))) : specOfHall(sc.hall);
  spec.name ??= tx(HALLS[sc.hall]);
  let tool = 'S', map = null, hall = null, show3d = false, lay = null, errors = [], t3 = 0, version = 0, tab = 'easy', dirty = false;
  const movie = MOVIES[0];
  const back = me && me.role !== 'admin' ? `#partner-${th.id}-layouts` : `#theatre-${th.id}`;

  const num = ([path, label, unit, min, max, step]) => `<label class="af"><span>${esc(label)}</span><span class="af-in"><input type="number" data-p="${path}" min="${min}" max="${max}" step="${step}" value="${get(spec, path) ?? ''}"><small>${unit}</small></span></label>`;
  view.innerHTML = `
    <div class="topbar"><a class="iconbtn" href="${back}" aria-label="Back">${icon('back')}</a>
      <div class="sb-t"><b>${state.lang === 'ta' ? 'இருக்கை அமைப்பு' : 'Seat layout'}</b><small>${esc(th.name)}, ${esc(th.area)} · ${esc(sc.name)}</small></div>
      ${all.length > 1 ? `<label class="dd"><select id="adScreen" aria-label="Screen">${all.map(({ th: t2, sc: s2 }) => `<option value="${s2.id}" ${s2.id === screenId ? 'selected' : ''}>${esc(t2.name)} · ${esc(s2.name)}${customFor(s2.id) ? ' ✓' : ''}</option>`).join('')}</select></label>` : ''}</div>
    <div class="admin-grid">
      <section class="panel ad-form">
        <div class="seg wide3" role="tablist" id="adTabs"><button type="button" data-tab="easy" aria-pressed="true">${icon('seat')}Seats</button><button type="button" data-tab="hall" aria-pressed="false">${icon('cube')}Hall size</button><button type="button" data-tab="text" aria-pressed="false">${icon('grid')}Text</button></div>

        <div data-pane="easy">
          <details class="qs" ${customFor(screenId) ? '' : 'open'}><summary>${icon('spark')}Quick start: make a layout in 4 answers</summary>
            <div class="qs-grid">
              <label class="af"><span>1. How many rows of seats?</span><input class="input" type="number" id="qRows" min="1" max="40" value="12"></label>
              <label class="af"><span>2. Seats in each row?</span><input class="input" type="number" id="qSeats" min="2" max="60" value="20"></label>
              <div class="af"><span>3. Walkways between seats</span><div class="seg wide3" id="qWalk"><button type="button" data-w="none" aria-pressed="false">None</button><button type="button" data-w="middle" aria-pressed="true">1 in middle</button><button type="button" data-w="two" aria-pressed="false">2 (sides)</button></div></div>
              <label class="af"><span>4. Recliner rows at the back? (0 if none)</span><input class="input" type="number" id="qRec" min="0" max="10" value="2"></label>
              <label class="af"><span>Balcony rows? (0 if none)</span><input class="input" type="number" id="qBal" min="0" max="20" value="0"></label>
            </div>
            <div class="walk-pic" id="qPic" aria-hidden="true"></div>
            <button type="button" class="btn primary wide" id="qGo">${icon('check')}Make this layout</button>
            <p class="hint">This replaces the rows below. You can then tap any seat to change it.</p>
          </details>

          <div class="tools-bar"><b>Tap a seat to make it:</b><div class="paint" id="adTools" role="group">${TOOLS.map(([k, l, ic]) => `<button type="button" data-t="${k}" aria-pressed="${tool === k}"><i class="pc pc-${k === '|' ? 'walk' : k === '.' ? 'gap' : k}">${icon(ic)}</i>${esc(l)}</button>`).join('')}</div></div>
          <div class="ge" id="ge"></div>
          <div class="ge-add"><button type="button" class="btn ghost sm" id="addBack">${icon('plus')}Add a row at the back</button><button type="button" class="btn ghost sm" id="addFront">${icon('plus')}Add a row at the front</button></div>
          <label class="af"><span>Balcony starts at row</span><span class="dd"><select id="adBalcSel"></select></span></label>
          <h3 class="ad-h">Ticket prices</h3><div class="af-grid" id="adPrices"></div>
        </div>

        <div data-pane="hall" hidden>
          <label class="af"><span>Layout name</span><input class="input" id="adName" value="${esc(spec.name)}"></label>
          <div class="af"><span>How big is the hall?</span><div class="choice" id="hSize">${Object.entries(SIZES).map(([k, v]) => `<button type="button" data-size="${k}">${esc(v.label)}</button>`).join('')}</div></div>
          <div class="af"><span>Floor</span><div class="choice" id="hFloor">${Object.entries(FLOORS).map(([k, v]) => `<button type="button" data-floor="${k}">${esc(v[0])}</button>`).join('')}</div></div>
          <label class="af"><span>Or start from one of our hall types</span><span class="dd"><select id="adTpl"><option value="">Choose…</option>${Object.entries(HALLS).map(([k, h]) => `<option value="${k}">${esc(h.en)}</option>`).join('')}</select></span></label>
          <p class="hint">Exact measurements make the 3D view and the view scores more accurate. Leave them if you are not sure.</p>
          ${FIELDS.map(([title, fs]) => `<details><summary>Exact measurements: ${title.toLowerCase()}</summary><div class="af-grid">${fs.map(num).join('')}</div></details>`).join('')}
          <details><summary>Exact measurements: balcony</summary><div class="af-grid">${BALC.map(num).join('')}</div></details>
        </div>

        <div data-pane="text" hidden>
          <p class="hint">For experts. One line per row: <code>letter type plan</code>. A number is that many seats, <code>_</code> a walkway, <code>.</code> empty, <code>W</code> wheelchair, <code>X</code> not for sale. Types: ${Object.keys(CLASS_META).map((k) => `<code>${k}</code>`).join(' ')}.</p>
          <textarea id="adRows" class="input mono" rows="12" spellcheck="false"></textarea>
          <div class="sh-actions"><button type="button" class="btn ghost" id="adJson">Backup / paste (JSON)</button></div>
        </div>

        <p class="err" id="adErr"></p>
        <div class="sh-actions sticky-save"><button type="button" class="btn ghost" id="adReset">Undo all changes</button><button type="button" class="btn primary" id="adSave">${icon('check')}Save layout</button></div>
      </section>
      <section class="ad-preview">
        <div class="map-card"><div class="map-tools"><b class="small">Preview · colours show how good the view is from each seat</b><button type="button" class="btn ghost sm" id="ad3d">${icon('cube')}3D preview</button></div>
          <div id="adMap" class="map"></div><div class="legend" id="adStats"></div></div>
        <div class="preview ad3d" id="ad3dBox" hidden><div class="pv-host" id="ad3dHost"></div><div class="pv-score" id="ad3dTip">Tap a seat in the 3D view to see its view</div></div>
      </section>
    </div>`;
  const rowsEl = $('#adRows');

  /* ---------- quick start ---------- */
  let walk = 'middle';
  const pic = () => {
    const n = Math.max(2, Math.min(60, +$('#qSeats').value || 20)), b = blocksFor(n, walk);
    $('#qPic').innerHTML = `<span class="wp-screen">SCREEN</span>${[0, 1, 2].map(() => `<span class="wp-row">${b.map((k) => `<span class="wp-blk">${'<i></i>'.repeat(Math.min(k, 14))}</span>`).join('<span class="wp-walk"></span>')}</span>`).join('')}`;
  };
  $('#qWalk').addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (!b) return; walk = b.dataset.w; $$('#qWalk button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); pic(); });
  $('#qSeats').addEventListener('input', pic); pic();
  $('#qGo').addEventListener('click', () => {
    const nRows = Math.max(1, Math.min(40, +$('#qRows').value || 1)), n = Math.max(2, Math.min(60, +$('#qSeats').value || 2));
    const nRec = Math.max(0, Math.min(nRows, +$('#qRec').value || 0)), nBal = Math.max(0, Math.min(20, +$('#qBal').value || 0));
    const rows = [];
    const normal = nRows - nRec;
    for (let i = 0; i < normal; i++) rows.push({ cls: i < Math.ceil(normal / 3) ? 'classic' : 'prime', plan: blocksFor(n, walk).join('_') });
    const nr = Math.max(2, Math.round(n * 0.55));
    for (let i = 0; i < nRec; i++) rows.push({ cls: 'recliner', plan: blocksFor(nr, walk === 'none' ? 'none' : 'middle').join('_') });
    for (let i = 0; i < nBal; i++) rows.push({ cls: 'balcony', plan: blocksFor(n, walk).join('_') });
    rows.forEach((r, i) => { r.r = letter(i); });
    spec.rows = rows;
    spec.balcony = nBal ? { from: letter(nRows), base: 6, gap: 3, rowGap: 1.15, rise: 0.4 } : null;
    const size = n * (nRows + nBal) <= 150 ? 'small' : n * (nRows + nBal) <= 350 ? 'medium' : 'large';
    applySize(size);
    $('.qs').open = false; dirty = true;
    toast(`Made ${rows.length} rows. Now tap seats to change any of them.`);
    render();
  });

  /* ---------- visual row editor ---------- */
  const classOpts = (cur) => Object.keys(CLASS_META).map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(clsName(k))}</option>`).join('');
  function drawRows() {
    const balFrom = spec.balcony?.from;
    $('#ge').innerHTML = `<div class="ge-screen">${icon('eye')}Screen is this side</div>` + spec.rows.map((r, ri) => {
      const cells = toCells(r), rec = isRec(r.cls);
      return `${r.r === balFrom ? '<div class="ge-bal">Balcony (upstairs)</div>' : ''}<div class="ge-row" data-ri="${ri}">
        <span class="ge-l">${esc(r.r)}</span>
        <span class="dd ge-cls"><select data-cls="${ri}" aria-label="Seat type for row ${esc(r.r)}">${classOpts(r.cls)}</select></span>
        <span class="ge-cells">${cells.map((c, ci) => `<button type="button" class="gc gc-${c === '|' ? 'walk' : c === '.' ? 'gap' : c}${rec ? ' rec' : ''}" data-ci="${ci}" style="--cc:${CLASS_META[r.cls]?.color || '#ccc'}" aria-label="Row ${esc(r.r)} place ${ci + 1}: ${c === '|' ? 'walkway' : c === '.' ? 'empty' : c === 'W' ? 'wheelchair' : c === 'X' ? 'not for sale' : 'seat'}"></button>`).join('')}</span>
        <span class="ge-n">${seatCount(cells)}</span>
        <span class="ge-act"><button type="button" class="iconbtn sm" data-less="${ri}" aria-label="One seat less">${icon('minus')}</button><button type="button" class="iconbtn sm" data-more="${ri}" aria-label="One seat more">${icon('plus')}</button><button type="button" class="iconbtn sm" data-del="${ri}" aria-label="Delete row ${esc(r.r)}">${icon('trash')}</button></span></div>`;
    }).join('');
    $('#adBalcSel').innerHTML = `<option value="">No balcony</option>${spec.rows.map((r) => `<option value="${r.r}" ${r.r === balFrom ? 'selected' : ''}>Row ${r.r}</option>`).join('')}`;
  }
  const relabel = () => {
    const old = spec.balcony?.from, idx = spec.rows.findIndex((r) => r.r === old);
    spec.rows.forEach((r, i) => { r.r = letter(i); });
    if (spec.balcony) { if (idx < 0) spec.balcony = null; else spec.balcony.from = letter(idx); }
  };
  const setCells = (ri, cells) => { const r = spec.rows[ri]; r.plan = toPlan(cells, isRec(r.cls)) || (isRec(r.cls) ? '1' : '1'); };
  $('#ge').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-ci]'), row = e.target.closest('.ge-row'); if (!row) return;
    const ri = +row.dataset.ri, r = spec.rows[ri], cells = toCells(r);
    if (cell) {
      const ci = +cell.dataset.ci;
      cells[ci] = tool;
      if (seatCount(cells) === 0) { toast('A row needs at least one seat. Delete the row instead.'); return; }
    } else if (e.target.closest('[data-more]')) {
      const last = cells.length - 1 - [...cells].reverse().findIndex((c) => c !== '|' && c !== '.');
      cells.splice(last + 1, 0, 'S');
    } else if (e.target.closest('[data-less]')) {
      if (seatCount(cells) <= 1) { toast('A row needs at least one seat. Delete the row instead.'); return; }
      for (let i = cells.length - 1; i >= 0; i--) if (cells[i] !== '|' && cells[i] !== '.') { cells.splice(i, 1); break; }
      while (cells.length && cells[cells.length - 1] === '|') cells.pop();
    } else if (e.target.closest('[data-del]')) {
      if (spec.rows.length <= 1) { toast('Keep at least one row.'); return; }
      spec.rows.splice(ri, 1); relabel(); dirty = true; return render();
    } else return;
    setCells(ri, cells); dirty = true; render();
  });
  $('#ge').addEventListener('change', (e) => {
    const s = e.target.closest('[data-cls]'); if (!s) return;
    const r = spec.rows[+s.dataset.cls], cells = toCells(r);
    r.cls = s.value; setCells(+s.dataset.cls, cells); dirty = true; render();
  });
  const copyRow = (r) => ({ r: '', cls: r?.cls || 'classic', plan: r?.plan || '8_8' });
  $('#addBack').addEventListener('click', () => { spec.rows.push(copyRow(spec.rows[spec.rows.length - 1])); relabel(); dirty = true; render(); });
  $('#addFront').addEventListener('click', () => { spec.rows.unshift(copyRow(spec.rows[0])); relabel(); dirty = true; render(); });
  $('#adBalcSel').addEventListener('change', (e) => { const v = e.target.value; spec.balcony = v ? { base: 6, gap: 3, rowGap: 1.15, rise: 0.4, ...(spec.balcony || {}), from: v } : null; dirty = true; render(); });
  $('#adTools').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tool = b.dataset.t; $$('#adTools button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });

  /* ---------- hall size, floor ---------- */
  function applySize(k) {
    const z = SIZES[k];
    spec.screen = { ...spec.screen, w: z.screen.w, h: z.screen.h };
    spec.room = { ...spec.room, halfW: Math.max(z.room.halfW, widest() / 2 + 1.5) };
    spec.geo = { ...spec.geo, firstRow: z.firstRow };
  }
  const widest = () => Math.max(...spec.rows.map((r) => toCells(r).length * (isRec(r.cls) ? 0.95 : 0.55)), 4);
  $('#hSize').addEventListener('click', (e) => { const b = e.target.closest('[data-size]'); if (!b) return; applySize(b.dataset.size); mark('#hSize', b); dirty = true; syncNums(); render(); });
  $('#hFloor').addEventListener('click', (e) => { const b = e.target.closest('[data-floor]'); if (!b) return; const f = FLOORS[b.dataset.floor]; spec.geo = { ...spec.geo, rise: f[1], recRise: f[2] }; mark('#hFloor', b); dirty = true; syncNums(); render(); });
  const mark = (sel, b) => $$(sel + ' button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#adTpl').addEventListener('change', (e) => { if (!e.target.value) return; const name = spec.name; spec = specOfHall(e.target.value); spec.name = name; dirty = true; syncNums(); render(); });
  const syncNums = () => $$('[data-p]', view).forEach((i) => { const v = get(spec, i.dataset.p); if (v != null) i.value = v; });
  view.querySelector('[data-pane="hall"]').addEventListener('input', (e) => {
    const p = e.target.dataset.p;
    if (p) { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) { if (p.startsWith('balcony.') && !spec.balcony) return; set(spec, p, v); dirty = true; later(); } }
    if (e.target.id === 'adName') { spec.name = e.target.value.trim() || spec.name; dirty = true; }
  });

  /* ---------- text mode ---------- */
  rowsEl.addEventListener('input', () => {
    const { rows, errors: errs } = textToRows(rowsEl.value);
    const bad = [...errs, ...rows.filter((r) => !CLASS_META[r.cls]).map((r) => `Row ${r.r}: unknown type "${r.cls}"`)];
    $('#adErr').textContent = bad.join(' · ');
    if (bad.length || !rows.length) return;
    spec.rows = rows; dirty = true; clearTimeout(tmr); tmr = setTimeout(() => render(true), 250);
  });

  /* ---------- tabs ---------- */
  $('#adTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab;
    $$('#adTabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $$('[data-pane]', view).forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'text') rowsEl.value = rowsToText(spec.rows);
  });

  /* ---------- prices ---------- */
  function prices() {
    const used = [...new Set(spec.rows.map((r) => r.cls))];
    spec.prices ||= {};
    const DEF = { royal: 450, recliner: 380, couple: 600, balcony: 180, premium: 250, prime: 200, back: 150, standard: 160, classic: 120, middle: 100, front: 80 };
    for (const k of used) spec.prices[k] ??= DEF[k] || 150;
    for (const k of Object.keys(spec.prices)) if (!used.includes(k)) delete spec.prices[k];
    $('#adPrices').innerHTML = used.map((k) => `<label class="af"><span><i class="sw" style="background:${CLASS_META[k]?.color}"></i>${esc(clsName(k))}</span><span class="af-in"><small>₹</small><input type="number" data-price="${k}" min="0" step="10" value="${spec.prices[k]}"></span></label>`).join('');
  }
  $('#adPrices').addEventListener('input', (e) => { const k = e.target.dataset.price; if (k) { spec.prices[k] = Math.max(0, +e.target.value || 0); dirty = true; later(); } });

  /* ---------- render ---------- */
  function check() {
    const errs = [];
    if (!spec.rows.length) errs.push('Add at least one row.');
    const seen = new Set(); spec.rows.forEach((r) => { if (seen.has(r.r)) errs.push(`Row ${r.r} appears twice`); seen.add(r.r); if (!CLASS_META[r.cls]) errs.push(`Row ${r.r}: unknown type`); });
    if (spec.balcony && !spec.rows.some((r) => r.r === spec.balcony.from)) spec.balcony = null;
    return errs;
  }
  function render(fromText = false) {
    errors = check();
    $('#adErr').textContent = errors.join(' · ');
    $('#adSave').disabled = errors.length > 0;
    if (!fromText) drawRows();
    if (errors.length) return;
    if (tab === 'text' && !fromText) rowsEl.value = rowsToText(spec.rows);
    prices();
    lay = buildLayout(spec, `preview:${screenId}:${++version}`);
    map?.destroy();
    map = mountMap($('#adMap'), lay, { booked: new Set(), selected: new Set(), prices: spec.prices, onTap: tapMap });
    map.setMode('view');
    const byCls = {}; lay.seats.forEach((s) => { if (!s.disabled) byCls[s.cls] = (byCls[s.cls] || 0) + 1; });
    const live = lay.seats.filter((s) => !s.disabled);
    const avg = Math.round(live.reduce((a, s) => a + s.score, 0) / Math.max(1, live.length));
    const poor = live.filter((s) => s.score < 45).length;
    const full = live.reduce((a, s) => a + (spec.prices[s.cls] || 0), 0);
    $('#adStats').innerHTML = `<span><b>${live.length}</b>&nbsp;seats for sale · ${lay.rows.length} rows</span>${Object.entries(byCls).map(([k, n]) => `<span><i style="background:${CLASS_META[k].color}"></i>${esc(clsName(k))} ${n} × ${inr(spec.prices[k])}</span>`).join('')}<span>Full house: <b>&nbsp;${inr(full)}</b></span><span>Average view <b style="color:${scoreColor(avg)}">&nbsp;${avg}/100</b></span>${poor ? `<span>${poor} seats with a tough view</span>` : ''}`;
    if (show3d) { clearTimeout(t3); t3 = setTimeout(mount3d, 500); }
  }
  let tmr = 0;
  const later = () => { clearTimeout(tmr); tmr = setTimeout(() => render(), 200); };
  // Tapping the preview map works too (except walkways, which need the row editor)
  function tapMap(seat) {
    if (tool === '|') { toast('Add walkways in the rows on the left.'); return; }
    const ri = spec.rows.findIndex((r) => r.r === seat.row); if (ri < 0) return;
    const cells = toCells(spec.rows[ri]); let n = 0;
    for (let i = 0; i < cells.length; i++) { if (cells[i] === '|' || cells[i] === '.') continue; if (++n === seat.num) { cells[i] = tool; break; } }
    if (seatCount(cells) === 0) return;
    setCells(ri, cells); dirty = true; render();
  }
  async function mount3d() {
    const box = $('#ad3dBox'); if (!box) return;
    box.hidden = false;
    hall?.dispose(); hall = null;
    const { mountHall } = await import('./hall3d.js');
    if (!$('#ad3dHost')) return;
    hall = await mountHall($('#ad3dHost'), lay, { movie, booked: new Set(), selected: new Set(), tier: ctx.tier, onSeatTap: (s) => { hall.seatView(s); $('#ad3dTip').innerHTML = `<b>${s.id}</b> · view <b style="color:${scoreColor(s.score)}">&nbsp;${s.score}/100</b>`; } });
    hall?.preset('overview');
  }
  $('#ad3d').addEventListener('click', () => { show3d = !show3d; if (show3d) mount3d(); else { hall?.dispose(); hall = null; $('#ad3dBox').hidden = true; } });
  $('#adScreen')?.addEventListener('change', (e) => { if (dirty && !confirm('You have changes that are not saved. Leave anyway?')) { e.target.value = screenId; return; } location.hash = 'admin-' + e.target.value; });
  $('#adReset').addEventListener('click', () => { if (dirty && !confirm('Undo all changes since the last save?')) return; adminView(view, screenId, ctx); });
  $('#adSave').addEventListener('click', async () => {
    render(); if (errors.length) return;
    try { await ctx.db.put('layouts', { ...ctx.db.state.layouts, [screenId]: JSON.parse(JSON.stringify(spec)) }); }
    catch (e) { toast(e.message || 'Could not save. Check the connection and try again.'); return; }
    dirty = false;
    toast(`Saved. ${sc.name} now uses this layout for every show.`);
    const o = $('#adScreen')?.selectedOptions[0]; if (o && !o.textContent.endsWith('✓')) o.textContent += ' ✓';
  });
  $('#adJson').addEventListener('click', () => {
    ctx.openSheet(`<h2 class="sh-t">Layout backup</h2><p class="muted">Copy this to keep a backup, or paste a saved layout and apply it.</p><textarea id="jTxt" class="input mono" rows="14" spellcheck="false">${esc(JSON.stringify(spec, null, 1))}</textarea>
      <div class="sh-actions"><button type="button" class="btn ghost" id="jCopy">Copy</button><button type="button" class="btn primary" id="jApply">Apply pasted layout</button></div>`, (sh) => {
      sh.querySelector('#jCopy').addEventListener('click', () => { const tA = sh.querySelector('#jTxt'); navigator.clipboard?.writeText(tA.value).then(() => toast('Copied'), () => { tA.select(); toast('Press Ctrl+C to copy'); }); });
      sh.querySelector('#jApply').addEventListener('click', () => {
        try { const j = JSON.parse(sh.querySelector('#jTxt').value); if (!Array.isArray(j.rows) || !j.screen || !j.geo || !j.room) throw new Error('missing parts'); spec = j; dirty = true; ctx.closeSheet(); syncNums(); render(); }
        catch (e) { toast('That is not a layout backup.'); }
      });
    });
  });
  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', warn);
  ctx.onLeave(() => { removeEventListener('beforeunload', warn); map?.destroy(); hall?.dispose(); clearTimeout(t3); clearTimeout(tmr); });
  render();
}
