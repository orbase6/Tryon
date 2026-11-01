// Seat layout editor for theatre staff. Build a screen's layout from a seat grid
// plus a few measurements, see it live in 2D and 3D, and save it for that screen.
import { CLASS_META, MOVIES, theatresFor, theatreById } from './data.js';
import { HALLS, buildLayout, specOfHall, rowsToText, textToRows, parsePlan, REC_CLASSES, customFor, scoreColor } from './layout.js';
import { mountMap } from './map2d.js';
import { icon, esc, inr, $, $$, toast, clsName, state, tx } from './ui.js';

const FIELDS = [
  ['Screen', [['screen.w', 'Screen width', 'm', 4, 40, 0.5], ['screen.h', 'Screen height', 'm', 2, 22, 0.5], ['screen.elev', 'Screen bottom above floor', 'm', 0.3, 5, 0.05], ['screen.curve', 'Screen curve depth', 'm', 0, 3, 0.1]]],
  ['Hall', [['room.halfW', 'Half of hall width', 'm', 5, 26, 0.5], ['room.ceiling', 'Ceiling height', 'm', 5, 26, 0.5], ['room.curve', 'Row curve radius (big = straight rows)', 'm', 10, 400, 1]]],
  ['Rows', [['geo.firstRow', 'Screen to row A', 'm', 2, 20, 0.1], ['geo.rowGap', 'Row to row', 'm', 0.8, 2.5, 0.05], ['geo.recGap', 'Recliner row to row', 'm', 1.2, 3, 0.05], ['geo.rise', 'Step height per row', 'm', 0, 0.9, 0.01], ['geo.recRise', 'Step height, recliner rows', 'm', 0, 1.2, 0.01]]],
];
const BALC = [['balcony.base', 'Balcony floor height', 'm', 2, 12, 0.1], ['balcony.gap', 'Gap before balcony', 'm', 1.5, 8, 0.05], ['balcony.rowGap', 'Balcony row to row', 'm', 0.8, 2.5, 0.05], ['balcony.rise', 'Balcony step height', 'm', 0, 0.9, 0.01]];
const TOOLS = [['X', 'Block seat'], ['W', 'Wheelchair'], ['.', 'Remove (gap)'], ['S', 'Normal seat']];
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const set = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { a = a[k] ??= {}; }); a[ks[ks.length - 1]] = v; };

function cellsToPlan(blocks, rec) {
  const def = rec ? 'R' : 'S';
  return blocks.map((cells) => {
    let out = '', run = 0;
    const flush = () => { if (run) out += String(run); run = 0; };
    for (const c of cells) { if (c === def) run++; else { flush(); out += c; } }
    flush(); return out;
  }).join('_');
}

export function adminView(view, screenId, ctx) {
  const ths = theatresFor(ctx.city(), { all: true });
  const all = ths.flatMap((th) => th.screens.map((sc) => ({ th, sc })));
  if (!screenId || !theatreById(screenId.replace(/s\d+$/, ''))) screenId = all[0].sc.id;
  const th = theatreById(screenId.replace(/s\d+$/, ''));
  const sc = th.screens[+screenId.match(/s(\d+)$/)[1]];
  let spec = customFor(screenId) ? JSON.parse(JSON.stringify(customFor(screenId))) : specOfHall(sc.hall);
  spec.name ??= tx(HALLS[sc.hall]);
  let tool = 'X', map = null, hall = null, show3d = false, lay = null, errors = [], t3 = 0, version = 0;
  const movie = MOVIES[0];

  const num = ([path, label, unit, min, max, step]) => `<label class="af"><span>${esc(label)}</span><span class="af-in"><input type="number" data-p="${path}" min="${min}" max="${max}" step="${step}" value="${get(spec, path) ?? ''}"><small>${unit}</small></span></label>`;
  view.innerHTML = `
    <div class="topbar"><a class="iconbtn" href="#theatre-${th.id}" aria-label="Back">${icon('back')}</a>
      <div class="sb-t"><b>${state.lang === 'ta' ? 'இருக்கை அமைப்பு எடிட்டர்' : 'Seat layout editor'}</b><small>${esc(th.name)}, ${esc(th.area)} · ${esc(sc.name)}</small></div>
      <label class="dd"><select id="adScreen" aria-label="Screen">${all.map(({ th: t2, sc: s2 }) => `<option value="${s2.id}" ${s2.id === screenId ? 'selected' : ''}>${esc(t2.name)} · ${esc(s2.name)}${customFor(s2.id) ? ' ✓' : ''}</option>`).join('')}</select></label></div>
    <div class="admin-grid">
      <section class="panel ad-form">
        <div class="af-row"><label class="af"><span>Layout name</span><input class="input" id="adName" value="${esc(spec.name)}"></label>
          <label class="af"><span>Start from a template</span><span class="dd"><select id="adTpl">${Object.entries(HALLS).map(([k, h]) => `<option value="${k}" ${spec.base === k ? 'selected' : ''}>${esc(h.en)}</option>`).join('')}</select></span></label></div>
        <details open><summary>Seat rows</summary>
          <p class="hint">One line per row: <code>letter class plan</code>. In the plan, a number is that many seats, <code>_</code> is an aisle, <code>.</code> an empty space, <code>W</code> wheelchair, <code>X</code> blocked seat. Classes: ${Object.keys(CLASS_META).map((k) => `<code>${k}</code>`).join(' ')}. Royal / recliner / couple rows are recliners sold in pairs.</p>
          <textarea id="adRows" class="input mono" rows="10" spellcheck="false"></textarea>
          <p class="err" id="adErr"></p>
          <div class="gen"><b>Quick add</b><span><input type="number" id="gN" value="5" min="1" max="26" aria-label="Rows"> rows</span><span>blocks <input id="gB" value="4,12,4" aria-label="Seats per block" style="width:90px"></span>
            <span class="dd"><select id="gC">${Object.keys(CLASS_META).map((k) => `<option value="${k}">${k}</option>`).join('')}</select></span><button type="button" class="btn ghost sm" id="gGo">${icon('plus')}Add rows</button></div>
        </details>
        ${FIELDS.map(([title, fs]) => `<details ${title === 'Screen' ? 'open' : ''}><summary>${title}</summary><div class="af-grid">${fs.map(num).join('')}</div></details>`).join('')}
        <details><summary>Balcony</summary><label class="af chk"><input type="checkbox" id="adBalc" ${spec.balcony ? 'checked' : ''}> This screen has a balcony, starting at row <input id="adBalcFrom" value="${esc(spec.balcony?.from || '')}" maxlength="2" style="width:50px"></label><div class="af-grid">${BALC.map(num).join('')}</div></details>
        <details open><summary>Prices</summary><div class="af-grid" id="adPrices"></div></details>
        <div class="sh-actions"><button type="button" class="btn ghost" id="adReset">Use template</button><button type="button" class="btn ghost" id="adJson">JSON</button><button type="button" class="btn primary" id="adSave">${icon('check')}Save for this screen</button></div>
      </section>
      <section class="ad-preview">
        <div class="map-card"><div class="map-tools"><div class="seg" id="adTools" role="group" aria-label="Tap a seat to">${TOOLS.map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${tool === k}">${esc(l)}</button>`).join('')}</div>
          <button type="button" class="btn ghost sm" id="ad3d">${icon('cube')}3D preview</button></div>
          <div id="adMap" class="map"></div><div class="legend" id="adStats"></div></div>
        <div class="preview ad3d" id="ad3dBox" hidden><div class="pv-host" id="ad3dHost"></div><div class="pv-score" id="ad3dTip">Tap a seat in the 3D view to see its view</div></div>
      </section>
    </div>`;
  const rowsEl = $('#adRows'); rowsEl.value = rowsToText(spec.rows);

  function prices() {
    const used = [...new Set(spec.rows.map((r) => r.cls))];
    spec.prices ||= {};
    for (const k of used) spec.prices[k] ??= 200;
    for (const k of Object.keys(spec.prices)) if (!used.includes(k)) delete spec.prices[k];
    $('#adPrices').innerHTML = used.map((k) => `<label class="af"><span><i class="sw" style="background:${CLASS_META[k]?.color}"></i>${esc(clsName(k))}</span><span class="af-in"><small>₹</small><input type="number" data-price="${k}" min="0" step="10" value="${spec.prices[k]}"></span></label>`).join('');
  }
  function rebuild() {
    const { rows, errors: errs } = textToRows(rowsEl.value);
    errors = [...errs];
    rows.forEach((r) => { if (!CLASS_META[r.cls]) errors.push(`Row ${r.r}: unknown class "${r.cls}"`); });
    const seen = new Set(); rows.forEach((r) => { if (seen.has(r.r)) errors.push(`Row ${r.r} appears twice`); seen.add(r.r); });
    if (!rows.length) errors.push('Add at least one row.');
    if ($('#adBalc').checked) {
      const from = ($('#adBalcFrom').value || '').toUpperCase();
      if (!rows.some((r) => r.r === from)) errors.push('Balcony start row must be one of your rows.');
      spec.balcony = { from, base: get(spec, 'balcony.base') ?? 6, gap: get(spec, 'balcony.gap') ?? 3, rowGap: get(spec, 'balcony.rowGap') ?? 1.2, rise: get(spec, 'balcony.rise') ?? 0.4 };
    } else spec.balcony = null;
    $('#adErr').textContent = errors.join(' · ');
    $('#adSave').disabled = errors.length > 0;
    if (errors.length) return;
    spec.rows = rows; spec.name = $('#adName').value.trim() || spec.name;
    prices();
    lay = buildLayout(spec, `preview:${screenId}:${++version}`);
    map?.destroy();
    map = mountMap($('#adMap'), lay, { booked: new Set(), selected: new Set(), prices: spec.prices, onTap: edit });
    map.setMode('view');
    const byCls = {}; lay.seats.forEach((s) => { if (!s.disabled) byCls[s.cls] = (byCls[s.cls] || 0) + 1; });
    const live = lay.seats.filter((s) => !s.disabled);
    const avg = Math.round(live.reduce((a, s) => a + s.score, 0) / Math.max(1, live.length));
    const poor = live.filter((s) => s.score < 45).length;
    $('#adStats').innerHTML = `<span><b>${live.length}</b>&nbsp;seats · ${lay.rows.length} rows</span>${Object.entries(byCls).map(([k, n]) => `<span><i style="background:${CLASS_META[k].color}"></i>${esc(clsName(k))} ${n} × ${inr(spec.prices[k])}</span>`).join('')}<span>Average view <b style="color:${scoreColor(avg)}">&nbsp;${avg}/100</b></span><span>${poor} seats with a tough view</span><span>Max takings ${inr(live.reduce((a, s) => a + (spec.prices[s.cls] || 0), 0))}</span>`;
    if (show3d) { clearTimeout(t3); t3 = setTimeout(mount3d, 500); }
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
  function edit(seat) {
    const lines = textToRows(rowsEl.value).rows;
    const row = lines.find((r) => r.r === seat.row); if (!row) return;
    const rec = /R/i.test(row.plan) || REC_CLASSES.includes(row.cls);
    const blocks = parsePlan(row.plan, rec);
    let n = 0;
    for (const cells of blocks) for (let i = 0; i < cells.length; i++) {
      if (cells[i] === '.') continue;
      if (++n === seat.num) cells[i] = tool === 'S' ? (rec ? 'R' : 'S') : tool;
    }
    row.plan = cellsToPlan(blocks, rec);
    rowsEl.value = rowsToText(lines);
    rebuild();
  }
  let tmr = 0;
  const later = () => { clearTimeout(tmr); tmr = setTimeout(rebuild, 200); };
  rowsEl.addEventListener('input', later);
  $('#adName').addEventListener('input', later);
  view.querySelector('.ad-form').addEventListener('input', (e) => {
    const p = e.target.dataset.p, pr = e.target.dataset.price;
    if (p) { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) { set(spec, p, v); later(); } }
    if (pr) { spec.prices[pr] = Math.max(0, +e.target.value || 0); later(); }
    if (e.target.id === 'adBalc' || e.target.id === 'adBalcFrom') later();
  });
  $('#adTools').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tool = b.dataset.t; $$('#adTools button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('#ad3d').addEventListener('click', () => { show3d = !show3d; if (show3d) mount3d(); else { hall?.dispose(); hall = null; $('#ad3dBox').hidden = true; } });
  $('#adScreen').addEventListener('change', (e) => { location.hash = 'admin-' + e.target.value; });
  $('#adTpl').addEventListener('change', (e) => { const name = spec.name; spec = specOfHall(e.target.value); spec.name = name; ctx.refreshForm(); });
  $('#adReset').addEventListener('click', async () => {
    const L = { ...ctx.db.state.layouts }; delete L[screenId];
    try { await ctx.db.put('layouts', L); } catch (e) { toast('Could not save. Check the connection and try again.'); return; }
    toast('This screen is back on its template layout.'); adminView(view, screenId, ctx);
  });
  $('#gGo').addEventListener('click', () => {
    const lines = textToRows(rowsEl.value).rows;
    const n = Math.max(1, Math.min(26, +$('#gN').value || 1));
    const blocks = $('#gB').value.split(/[,\s]+/).map((x) => +x).filter((x) => x > 0);
    if (!blocks.length) { toast('Write seats per block like 4,12,4'); return; }
    const used = new Set(lines.map((r) => r.r));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => !used.has(l)).slice(0, n);
    letters.forEach((l) => lines.push({ r: l, cls: $('#gC').value, plan: blocks.join('_') }));
    rowsEl.value = rowsToText(lines); rebuild();
  });
  $('#adSave').addEventListener('click', async () => {
    rebuild(); if (errors.length) return;
    try { await ctx.db.put('layouts', { ...ctx.db.state.layouts, [screenId]: JSON.parse(JSON.stringify(spec)) }); }
    catch (e) { toast('Could not save. Check the connection and try again.'); return; }
    toast(`Saved. ${sc.name} at ${th.name} now uses this layout for every show.`);
    const o = $('#adScreen').selectedOptions[0]; if (o && !o.textContent.endsWith('✓')) o.textContent += ' ✓';
  });
  $('#adJson').addEventListener('click', () => {
    ctx.openSheet(`<h2 class="sh-t">Layout JSON</h2><p class="muted">Copy this to back it up or share it, or paste a layout here and apply it.</p><textarea id="jTxt" class="input mono" rows="14" spellcheck="false">${esc(JSON.stringify(spec, null, 1))}</textarea>
      <div class="sh-actions"><button type="button" class="btn ghost" id="jCopy">Copy</button><button type="button" class="btn primary" id="jApply">Apply pasted JSON</button></div>`, (sh) => {
      sh.querySelector('#jCopy').addEventListener('click', () => { const tA = sh.querySelector('#jTxt'); navigator.clipboard?.writeText(tA.value).then(() => toast('Copied'), () => { tA.select(); toast('Press Ctrl+C to copy'); }); });
      sh.querySelector('#jApply').addEventListener('click', () => {
        try { const j = JSON.parse(sh.querySelector('#jTxt').value); if (!Array.isArray(j.rows) || !j.screen || !j.geo || !j.room) throw new Error('missing parts'); spec = j; ctx.closeSheet(); ctx.refreshForm(); }
        catch (e) { toast('That JSON is not a layout. It needs screen, room, geo and rows.'); }
      });
    });
  });
  ctx.refreshForm = () => {
    rowsEl.value = rowsToText(spec.rows);
    $('#adName').value = spec.name || '';
    $$('[data-p]', view).forEach((i) => { const v = get(spec, i.dataset.p); if (v != null) i.value = v; });
    $('#adBalc').checked = !!spec.balcony; $('#adBalcFrom').value = spec.balcony?.from || '';
    rebuild();
  };
  ctx.onLeave(() => { map?.destroy(); hall?.dispose(); clearTimeout(t3); clearTimeout(tmr); });
  rebuild();
}
