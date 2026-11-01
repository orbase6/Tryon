// Lumen admin console: run the platform. Theatres & KYC, movie catalogue, offers, fees, bookings.
import { CITIES, theatresFor, baseMovies, MOVIES, movieById, baseOffers, bookingMoney, showById, fromKey, hmLabel, isNowShowing, releaseDate, dayKey, today } from './data.js';
import { icon, esc, inr, $, $$, toast, fmtDate, poster } from './ui.js';

const TABS = [['overview', 'Overview'], ['theatres', 'Theatres'], ['movies', 'Movies'], ['offers', 'Offers'], ['fees', 'Fees'], ['bookings', 'Bookings']];
const money = (v) => '₹' + (Math.round(v * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const chip = (label, tone) => `<span class="st st-${tone}">${esc(label)}</span>`;
const KYC = { not_submitted: ['Not submitted', 'warn'], pending: ['Needs review', 'warn'], verified: ['Verified', 'ok'], rejected: ['Rejected', 'bad'] };
const LANGS = ['Tamil', 'English', 'Telugu', 'Hindi', 'Malayalam', 'Kannada'];
const CERTS = ['U', 'U/A 7+', 'U/A 13+', 'U/A 16+', 'A'];
const MOTIFS = ['sun', 'waves', 'leaf', 'stars', 'flame', 'arc', 'moon', 'road'];

export function consoleView(view, tab, ctx) {
  if (!TABS.some(([k]) => k === tab)) tab = 'overview';
  const pending = CITIES.flatMap((c) => theatresFor(c.id, { all: true })).filter((t) => (ctx.db.state.theatres[t.id]?.kycStatus) === 'pending').length;
  view.innerHTML = `
    <div class="topbar"><a class="iconbtn" href="#home" aria-label="Back">${icon('back')}</a><div class="sb-t"><b>Lumen admin console</b><small>Demo: no login yet. In production this is only for Lumen staff.</small></div>
      <span class="st st-${ctx.db.mode === 'server' ? 'ok' : 'warn'}">${ctx.db.mode === 'server' ? 'Live server data' : 'Browser-only demo data'}</span></div>
    <nav class="tabs" aria-label="Admin sections">${TABS.map(([k, l]) => `<a href="#console-${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}${k === 'theatres' && pending ? ` <i class="cnt">${pending}</i>` : ''}</a>`).join('')}</nav>
    <div id="ac"></div>`;
  ({ overview, theatres, movies, offers, fees, bookings })[tab]($('#ac'), ctx);
}
async function save(ctx, section, value, msg) {
  try { await ctx.db.put(section, value); toast(msg); ctx.route(); return true; }
  catch (e) { toast('Could not save. Check the connection and try again.'); return false; }
}

/* ---------- overview ---------- */
function overview(host, ctx) {
  const bs = ctx.db.allBookings();
  const sum = (k) => bs.reduce((a, b) => a + bookingMoney(b)[k], 0);
  const gmv = bs.filter((b) => !b.cancelled).reduce((a, b) => a + (b.total || 0), 0);
  const ths = CITIES.flatMap((c) => theatresFor(c.id, { all: true }));
  const st = (k) => ths.filter((t) => (ctx.db.state.theatres[t.id]?.kycStatus || 'not_submitted') === k).length;
  host.innerHTML = `
    <div class="tiles">
      <div class="tile"><small>Bookings</small><b>${bs.length}</b><span>${bs.filter((b) => b.cancelled).length} cancelled</span></div>
      <div class="tile"><small>Gross booking value</small><b>${money(gmv)}</b><span>What customers paid</span></div>
      <div class="tile"><small>Lumen revenue</small><b>${money(sum('platform'))}</b><span>Booking fees after offers, excl. GST</span></div>
      <div class="tile"><small>GST on fees</small><b>${money(sum('gst'))}</b><span>To be filed</span></div>
      <div class="tile"><small>Owed to theatres</small><b>${money(sum('theatre'))}</b><span>Tickets + food after refunds</span></div>
      <div class="tile"><small>Donations</small><b>${money(sum('donation'))}</b><span>For young musicians</span></div>
    </div>
    <h2 class="sec">Theatres</h2>
    <div class="tiles">
      <div class="tile"><small>Live</small><b>${ths.filter((t) => t.status !== 'suspended').length}</b><span>of ${ths.length} theatres</span></div>
      <div class="tile"><small>KYC to review</small><b>${st('pending')}</b><span><a href="#console-theatres">Review now</a></span></div>
      <div class="tile"><small>KYC verified</small><b>${st('verified')}</b><span>${st('not_submitted')} not submitted</span></div>
      <div class="tile"><small>Movies in catalogue</small><b>${MOVIES.length}</b><span>${MOVIES.filter(isNowShowing).length} in cinemas</span></div>
    </div>`;
}

/* ---------- theatres & KYC ---------- */
function theatres(host, ctx) {
  const T = ctx.db.state.theatres;
  host.innerHTML = CITIES.map((c) => `<h2 class="sec">${esc(c.en)}</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Theatre</th><th>Screens</th><th>KYC</th><th>Status</th><th></th></tr></thead><tbody>
    ${theatresFor(c.id, { all: true }).map((t) => { const k = KYC[T[t.id]?.kycStatus || 'not_submitted']; return `<tr><td><b>${esc(t.name)}</b><small>${esc(t.area)} · ${t.id}</small></td><td>${t.screens.map((s) => esc(s.name)).join(', ')}</td><td>${chip(k[0], k[1])}</td><td>${t.status === 'suspended' ? chip('Suspended', 'bad') : chip('Live', 'ok')}</td>
      <td class="acts">${T[t.id]?.kyc ? `<button type="button" class="btn ghost sm" data-kyc="${t.id}">Review KYC</button>` : ''}<button type="button" class="btn ghost sm" data-sus="${t.id}">${t.status === 'suspended' ? 'Make live' : 'Suspend'}</button><a class="btn ghost sm" href="#partner-${t.id}-overview">Partner view</a></td></tr>`; }).join('')}
  </tbody></table></div>`).join('');
  host.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sus]'), k = e.target.closest('[data-kyc]');
    if (s) { const id = s.dataset.sus, cur = T[id] || {}; const next = cur.status === 'suspended' ? 'active' : 'suspended';
      save(ctx, 'theatres', { ...T, [id]: { ...cur, status: next } }, next === 'suspended' ? 'Theatre suspended. Customers no longer see it.' : 'Theatre is live again.'); }
    if (k) reviewKyc(k.dataset.kyc, ctx);
  });
}
function reviewKyc(id, ctx) {
  const T = ctx.db.state.theatres, cur = T[id] || {}, k = cur.kyc || {};
  const row = (a, b) => `<tr><td>${esc(a)}</td><td><b>${esc(b || '—')}</b></td></tr>`;
  ctx.openSheet(`<h2 class="sh-t">Review KYC · ${esc(id)}</h2>
    <table class="sum"><tbody>${row('Legal name', k.legal)}${row('GSTIN', k.gstin)}${row('PAN', k.pan)}${row('Account holder', k.holder)}${row('Account', k.acctLast4 ? '•••• ' + k.acctLast4 : '')}${row('IFSC', k.ifsc)}${row('UPI', k.upi)}${row('Payout cycle', k.cycle === '3day' ? 'Every 3 days' : 'Weekly')}${row('Submitted', k.submittedAt ? new Date(k.submittedAt).toLocaleString('en-IN') : '')}</tbody></table>
    <label class="af"><span>Note to the theatre (needed when rejecting)</span><input class="input" id="kNote" value="${esc(cur.kycNote || '')}"></label>
    <div class="sh-actions"><button type="button" class="btn ghost danger" id="kRej">Reject</button><button type="button" class="btn primary" id="kOk">${icon('check')}Approve</button></div>`, (sh) => {
    sh.querySelector('#kOk').addEventListener('click', async () => { ctx.closeSheet(); await save(ctx, 'theatres', { ...T, [id]: { ...cur, kycStatus: 'verified', kycNote: 'Verified by Lumen' } }, 'KYC approved. Payouts are released.'); });
    sh.querySelector('#kRej').addEventListener('click', async () => {
      const note = sh.querySelector('#kNote').value.trim();
      if (note.length < 5) { toast('Tell the theatre what to fix before rejecting.'); return; }
      ctx.closeSheet(); await save(ctx, 'theatres', { ...T, [id]: { ...cur, kycStatus: 'rejected', kycNote: note } }, 'KYC rejected. The theatre will see your note.');
    });
  });
}

/* ---------- movie catalogue ---------- */
function movies(host, ctx) {
  const hidden = new Set(ctx.db.state.hiddenMovies || []);
  const custom = ctx.db.state.movies || [];
  const row = (m, isCustom) => `<tr><td class="tb-post">${poster(m)}</td><td><b>${esc(m.title)}</b><small>${esc(m.lang)} · ${esc(m.cert)} · ${m.mins} min · ${esc((m.genres || []).join(', '))}</small></td>
    <td>${isCustom ? fmtDate(releaseDate(movieById(m.id) || { rel: 0 })) : m.rel <= 0 ? 'In cinemas' : fmtDate(releaseDate(m))}</td>
    <td>${hidden.has(m.id) ? chip('Hidden', 'bad') : chip(isCustom ? 'Added by Lumen' : 'Live', 'ok')}</td>
    <td class="acts">${isCustom ? `<button type="button" class="btn ghost sm" data-edit="${m.id}">Edit</button><button type="button" class="btn ghost sm danger" data-delm="${m.id}">Remove</button>` : `<button type="button" class="btn ghost sm" data-hide="${m.id}">${hidden.has(m.id) ? 'Show' : 'Hide'}</button>`}</td></tr>`;
  host.innerHTML = `<div class="sec-row"><h2 class="sec">Movie catalogue</h2><button type="button" class="btn primary sm" id="addMovie">${icon('plus')}Add movie</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Movie</th><th>Release</th><th>Status</th><th></th></tr></thead><tbody>
    ${custom.map((m) => row(m, true)).join('')}${baseMovies().map((m) => row(m, false)).join('')}</tbody></table></div>
    <p class="hint">Hidden movies disappear from the app. Theatres can schedule any movie that is in cinemas or releases within 14 days.</p>`;
  $('#addMovie').addEventListener('click', () => movieForm(null, ctx));
  host.addEventListener('click', (e) => {
    const h = e.target.closest('[data-hide]'), ed = e.target.closest('[data-edit]'), d = e.target.closest('[data-delm]');
    if (h) { const id = h.dataset.hide; const next = hidden.has(id) ? [...hidden].filter((x) => x !== id) : [...hidden, id]; save(ctx, 'hiddenMovies', next, hidden.has(id) ? 'Movie is visible again.' : 'Movie hidden from the app.'); }
    if (ed) movieForm(custom.find((m) => m.id === ed.dataset.edit), ctx);
    if (d) { const id = d.dataset.delm; if (ctx.db.allBookings().some((b) => !b.cancelled && showById(b.showId || '')?.movieId === id)) { toast('This movie has bookings. Hide it from theatres’ schedules first.'); return; } save(ctx, 'movies', custom.filter((m) => m.id !== id), 'Movie removed.'); }
  });
}
function movieForm(m, ctx) {
  const v = m || { title: '', sub: '', lang: 'Tamil', langs: [], genres: [], cert: 'U/A 13+', mins: 140, release: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), imax: false, c1: '#14161f', c2: '#e5414f', motif: 'stars', cast: [], about: '' };
  ctx.openSheet(`<h2 class="sh-t">${m ? 'Edit movie' : 'Add a movie'}</h2>
    <form id="mvForm" class="pt-form" novalidate>
      <div class="af-grid"><label class="af"><span>Title</span><input class="input" name="title" value="${esc(v.title)}" maxlength="40" required></label><label class="af"><span>Subtitle (optional)</span><input class="input" name="sub" value="${esc(v.sub || '')}" maxlength="40"></label></div>
      <div class="af-grid"><label class="af"><span>Language</span><span class="dd"><select name="lang">${LANGS.map((l) => `<option ${l === v.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></span></label>
        <label class="af"><span>Certificate</span><span class="dd"><select name="cert">${CERTS.map((c) => `<option ${c === v.cert ? 'selected' : ''}>${c}</option>`).join('')}</select></span></label></div>
      <div class="af-grid"><label class="af"><span>Genres (comma separated)</span><input class="input" name="genres" value="${esc((v.genres || []).join(', '))}" placeholder="Action, Drama" required></label>
        <label class="af"><span>Runtime</span><span class="af-in"><input type="number" name="mins" min="40" max="240" value="${v.mins}" required><small>min</small></span></label></div>
      <div class="af-grid"><label class="af"><span>Release date</span><input class="input" type="date" name="release" value="${esc(v.release)}" required></label>
        <label class="af"><span>Also dubbed in (comma separated)</span><input class="input" name="langs" value="${esc((v.langs || []).filter((x) => x !== v.lang).join(', '))}" placeholder="Telugu, Hindi"></label></div>
      <label class="af"><span>Cast (comma separated)</span><input class="input" name="cast" value="${esc((v.cast || []).join(', '))}"></label>
      <label class="af"><span>Story in one or two lines</span><textarea class="input" name="about" rows="3" maxlength="240" style="padding:10px 12px">${esc(v.about)}</textarea></label>
      <div class="af-grid"><label class="af"><span>Poster colours</span><span class="af-in"><input type="color" name="c1" value="${esc(v.c1)}" aria-label="Poster colour 1"><input type="color" name="c2" value="${esc(v.c2)}" aria-label="Poster colour 2"></span></label>
        <label class="af"><span>Poster art</span><span class="dd"><select name="motif">${MOTIFS.map((x) => `<option ${x === v.motif ? 'selected' : ''}>${x}</option>`).join('')}</select></span></label></div>
      <label class="af chk"><input type="checkbox" name="imax" ${v.imax ? 'checked' : ''}> Available in IMAX</label>
      <p class="err" id="mErr"></p>
      <button type="submit" class="btn primary">${icon('check')}${m ? 'Save changes' : 'Add to catalogue'}</button></form>`, (sh) => {
    sh.querySelector('#mvForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const list = (x) => String(x || '').split(',').map((y) => y.trim()).filter(Boolean);
      const errs = [];
      if (String(f.title).trim().length < 2) errs.push('Enter a title.');
      if (!list(f.genres).length) errs.push('Add at least one genre.');
      const mins = +f.mins; if (!(mins >= 40 && mins <= 240)) errs.push('Runtime must be 40–240 minutes.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.release)) errs.push('Pick a release date.');
      const id = m ? m.id : String(f.title).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'movie';
      const custom = ctx.db.state.movies || [];
      if (!m && (movieById(id) || custom.some((x) => x.id === id))) errs.push('A movie with this name already exists.');
      if (errs.length) { sh.querySelector('#mErr').textContent = errs.join(' '); return; }
      const mv = { id, title: String(f.title).trim(), sub: String(f.sub || '').trim(), lang: f.lang, langs: [f.lang, ...list(f.langs).filter((x) => x !== f.lang)], genres: list(f.genres), cert: f.cert, mins,
        release: f.release, imax: !!f.imax, c1: f.c1, c2: f.c2, motif: f.motif, cast: list(f.cast), about: String(f.about || '').trim() || 'Story coming soon.', rating: m?.rating || 0, votes: m?.votes || 0, interest: m?.interest || 0 };
      if (mv.langs.length === 1) delete mv.langs;
      ctx.closeSheet();
      await save(ctx, 'movies', m ? custom.map((x) => (x.id === id ? mv : x)) : [mv, ...custom], m ? 'Movie updated.' : `${mv.title} added. Theatres can now schedule it.`);
    });
  });
}

/* ---------- offers ---------- */
function offers(host, ctx) {
  const list = ctx.db.state.offers || baseOffers().map((o) => ({ ...o, active: true }));
  host.innerHTML = `<div class="sec-row"><h2 class="sec">Offers</h2><button type="button" class="btn primary sm" id="addOffer">${icon('plus')}New offer</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>What customers get</th><th>Rules</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((o, i) => `<tr><td class="mono-s"><b>${esc(o.code)}</b></td><td>${esc(o.en)}<small>${o.flat ? `Flat ${inr(o.flat)} off` : `${o.pct}% off, up to ${inr(o.max)}`}</small></td><td><small>${[o.morning && 'Morning shows', o.upi && 'UPI only', o.minSeats && `${o.minSeats}+ tickets`, o.code === 'FIRST50' && 'First booking'].filter(Boolean).join(' · ') || 'None'}</small></td>
      <td>${o.active === false ? chip('Paused', 'warn') : chip('Live', 'ok')}</td><td class="acts"><button type="button" class="btn ghost sm" data-tog="${i}">${o.active === false ? 'Resume' : 'Pause'}</button><button type="button" class="btn ghost sm danger" data-del="${i}">Delete</button></td></tr>`).join('')}
    </tbody></table></div><p class="hint">Offers are paid by Lumen: the discount comes out of the booking fee revenue, not the theatre’s share.</p>`;
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tog]'), d = e.target.closest('[data-del]');
    if (t) { const i = +t.dataset.tog; save(ctx, 'offers', list.map((o, j) => (j === i ? { ...o, active: o.active === false } : o)), 'Offer updated.'); }
    if (d) { const i = +d.dataset.del; save(ctx, 'offers', list.filter((_, j) => j !== i), 'Offer deleted.'); }
  });
  $('#addOffer').addEventListener('click', () => ctx.openSheet(`<h2 class="sh-t">New offer</h2>
    <form id="ofForm" class="pt-form" novalidate>
      <div class="af-grid"><label class="af"><span>Code</span><input class="input" name="code" maxlength="12" placeholder="WEEKEND30" required></label>
        <label class="af"><span>Type</span><span class="dd"><select name="type"><option value="pct">Percentage off</option><option value="flat">Flat amount off</option></select></span></label></div>
      <div class="af-grid"><label class="af"><span>Value (% or ₹)</span><span class="af-in"><input type="number" name="value" min="1" max="1000" value="20" required></span></label>
        <label class="af"><span>Max discount (₹, for %)</span><span class="af-in"><input type="number" name="max" min="1" max="5000" value="150"></span></label></div>
      <label class="af"><span>Description customers see</span><input class="input" name="en" maxlength="80" placeholder="20% off up to ₹150 on weekend shows" required></label>
      <div class="af-grid"><label class="af chk"><input type="checkbox" name="morning"> Morning shows only</label><label class="af chk"><input type="checkbox" name="upi"> UPI only</label>
        <label class="af"><span>Minimum tickets</span><span class="af-in"><input type="number" name="minSeats" min="0" max="10" value="0"></span></label></div>
      <p class="err" id="oErr"></p><button type="submit" class="btn primary">${icon('check')}Create offer</button></form>`, (sh) => {
    sh.querySelector('#ofForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      const code = String(f.code).trim().toUpperCase(), value = +f.value, errs = [];
      if (!/^[A-Z0-9]{3,12}$/.test(code)) errs.push('Code must be 3–12 letters or numbers.');
      if (list.some((o) => o.code === code)) errs.push('That code already exists.');
      if (f.type === 'pct' && !(value > 0 && value <= 90)) errs.push('Percentage must be 1–90.');
      if (f.type === 'flat' && !(value > 0 && value <= 1000)) errs.push('Flat amount must be ₹1–₹1,000.');
      if (String(f.en).trim().length < 5) errs.push('Add a short description.');
      if (errs.length) { sh.querySelector('#oErr').textContent = errs.join(' '); return; }
      const o = { code, en: String(f.en).trim(), active: true, min: 0, ...(f.type === 'flat' ? { flat: value } : { pct: value, max: +f.max || 150 }) };
      if (f.morning) o.morning = true; if (f.upi) o.upi = true; if (+f.minSeats > 0) o.minSeats = +f.minSeats;
      ctx.closeSheet(); await save(ctx, 'offers', [o, ...list], `${code} is live.`);
    });
  }));
}

/* ---------- fees ---------- */
function fees(host, ctx) {
  const f = { conv: 18, gst: 0.18, holdMinutes: 5, demoCrowd: true, ...(ctx.db.state.fees || {}) };
  host.innerHTML = `<section class="panel narrow"><h2>Fees & rules</h2>
    <form id="feeForm" class="pt-form" novalidate>
      <div class="af-grid"><label class="af"><span>Booking fee per ticket</span><span class="af-in"><small>₹</small><input type="number" name="conv" min="0" max="200" step="1" value="${f.conv}"></span></label>
        <label class="af"><span>GST on booking fee</span><span class="af-in"><input type="number" name="gst" min="0" max="28" step="1" value="${Math.round(f.gst * 100)}"><small>%</small></span></label></div>
      <label class="af"><span>How long seats are held during payment</span><span class="af-in"><input type="number" name="hold" min="2" max="15" value="${f.holdMinutes}"><small>minutes</small></span></label>
      <label class="af chk"><input type="checkbox" name="demoCrowd" ${f.demoCrowd ? 'checked' : ''}> Show demo crowd (simulated sales from the theatre counter and other apps)</label>
      <p class="muted">Customers will pay ${inr(Math.round(f.conv * (1 + f.gst)))} per ticket in fees (fee + GST), shown up front on every showtime.</p>
      <p class="err" id="fErr"></p><button type="submit" class="btn primary">${icon('check')}Save</button></form></section>`;
  $('#feeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const x = Object.fromEntries(new FormData(e.target).entries());
    const conv = +x.conv, gst = +x.gst, hold = +x.hold;
    if (!(conv >= 0 && conv <= 200) || !(gst >= 0 && gst <= 28) || !(hold >= 2 && hold <= 15)) { $('#fErr').textContent = 'Fee ₹0–200, GST 0–28%, hold 2–15 minutes.'; return; }
    await save(ctx, 'fees', { conv, gst: gst / 100, holdMinutes: hold, demoCrowd: !!x.demoCrowd }, 'Fees saved. New bookings use them right away.');
  });
}

/* ---------- bookings ---------- */
function bookings(host, ctx) {
  let city = 'all';
  const render = () => {
    const bs = ctx.db.allBookings().filter((b) => city === 'all' || b.city === city);
    host.innerHTML = `<div class="sec-row"><h2 class="sec">All bookings</h2><label class="dd"><select id="bCity" aria-label="City"><option value="all">All cities</option>${CITIES.map((c) => `<option value="${c.id}" ${c.id === city ? 'selected' : ''}>${esc(c.en)}</option>`).join('')}</select></label></div>
      ${bs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Booked</th><th>ID</th><th>What</th><th>Customer</th><th>Paid</th><th>Lumen fee</th><th>Status</th><th></th></tr></thead><tbody>
      ${bs.map((b) => { const mm = bookingMoney(b); const sh = b.showId && showById(b.showId); return `<tr><td>${new Date(b.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td><td class="mono-s">${esc(b.id)}</td>
        <td>${sh ? `${esc(movieById(sh.movieId).title)}<small>${fmtDate(fromKey(sh.dk))} ${hmLabel(sh.hm)} · ${esc((b.seats || []).join(', '))}</small>` : esc(b.kind === 'event' ? 'Event tickets' : b.kind === 'rent' ? 'Premiere rental' : 'Past show')}</td>
        <td><small>${esc(b.contact?.email || '—')}<br>${b.contact?.phone ? '+91 ' + esc(b.contact.phone) : ''}</small></td><td>${money(b.total || 0)}<small>${esc(b.method || '')}</small></td><td>${money(mm.platform)}</td>
        <td>${b.cancelled ? chip(`Cancelled · ${money(mm.refund)} refunded`, 'bad') : chip('Confirmed', 'ok')}</td>
        <td>${b.cancelled ? '' : `<button type="button" class="btn ghost sm danger" data-cx="${esc(b.id)}">Cancel</button>`}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="empty">No bookings yet.</p>'}
      <p class="hint">Cancelling here gives the customer a full ticket refund (used when a show is called off).</p>`;
    $('#bCity').addEventListener('change', (e) => { city = e.target.value; render(); });
    host.querySelectorAll('[data-cx]').forEach((b) => b.addEventListener('click', async () => {
      const bk = ctx.db.allBookings().find((x) => x.id === b.dataset.cx); if (!bk) return;
      try { await ctx.db.cancel(bk.id, bookingMoney(bk).ticket); toast('Booking cancelled with a full ticket refund.'); render(); } catch (e) { toast('Could not cancel. Check the connection and try again.'); }
    }));
  };
  render();
}
