// Theatre partner panel: what a theatre owner uses to run their screens on Lumen.
import { CITIES, MOVIES, CLASS_META, movieById, isNowShowing, theatresFor, theatreById, showsFor, today, addDays, dayKey, fromKey, hmLabel, releaseDate, screenDay, bookingMoney, showById } from './data.js';
import { HALLS, layoutFor, pricesFor, customFor, hallName } from './layout.js';
import { icon, esc, inr, $, $$, toast, clsName, tx, fmtDate, state } from './ui.js';

const TABS = [['overview', 'Overview'], ['shows', 'Shows'], ['prices', 'Prices'], ['layouts', 'Seat layouts'], ['kyc', 'Bank & KYC'], ['sales', 'Sales & payouts']];
const KYC_LABEL = { not_submitted: ['Not submitted', 'warn'], pending: ['Under review', 'warn'], verified: ['Verified', 'ok'], rejected: ['Rejected', 'bad'] };
const money = (v) => '₹' + (Math.round(v * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const chip = ([label, tone]) => `<span class="st st-${tone}">${esc(label)}</span>`;
const cityOf = (th) => CITIES.find((c) => c.id === th.cityId);
const bookingsOf = (db, th) => db.allBookings().filter((b) => b.kind === 'movie' && (b.theatreId || (showById(b.showId) || {}).theatreId) === th.id);
const weekStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

export function partnerView(view, theatreId, tab, ctx) {
  const all = CITIES.flatMap((c) => theatresFor(c.id, { all: true }));
  const th = (theatreId && theatreById(theatreId)) || theatresFor(ctx.city(), { all: true })[0];
  if (!TABS.some(([k]) => k === tab)) tab = 'overview';
  const info = ctx.db.state.theatres[th.id] || {};
  const kyc = KYC_LABEL[info.kycStatus || 'not_submitted'];
  view.innerHTML = `
    <div class="topbar"><a class="iconbtn" href="#home" aria-label="Back">${icon('back')}</a>
      <div class="sb-t"><b>Partner panel</b><small>Signed in as the owner of ${esc(th.name)}, ${esc(th.area)} (demo: no login yet)</small></div>
      <label class="dd"><select id="ptTheatre" aria-label="Theatre">${CITIES.map((c) => `<optgroup label="${esc(c.en)}">${theatresFor(c.id, { all: true }).map((t2) => `<option value="${t2.id}" ${t2.id === th.id ? 'selected' : ''}>${esc(t2.name)} · ${esc(t2.area)}</option>`).join('')}</optgroup>`).join('')}</select></label></div>
    <div class="pt-head"><h1>${esc(th.name)}</h1><span class="muted">${esc(th.area)}, ${esc(cityOf(th).en)}</span>
      ${chip(th.status === 'suspended' ? ['Suspended by Lumen', 'bad'] : ['Live on Lumen', 'ok'])} ${chip(['KYC: ' + kyc[0], kyc[1]])}</div>
    <nav class="tabs" aria-label="Partner sections">${TABS.map(([k, l]) => `<a href="#partner-${th.id}-${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="pt"></div>`;
  $('#ptTheatre').addEventListener('change', (e) => { location.hash = `partner-${e.target.value}-${tab}`; });
  const host = $('#pt');
  ({ overview, shows, prices, layouts, kyc: kycTab, sales })[tab](host, th, ctx);
}

/* ---------- overview ---------- */
function overview(host, th, ctx) {
  const bs = bookingsOf(ctx.db, th);
  const live = bs.filter((b) => !b.cancelled);
  const tickets = live.reduce((a, b) => a + (b.seats || []).length, 0);
  const earned = bs.reduce((a, b) => a + bookingMoney(b).theatre, 0);
  const todays = showsFor({ cityId: th.cityId, dk: dayKey(today()), theatreId: th.id });
  const tomorrow = showsFor({ cityId: th.cityId, dk: dayKey(addDays(today(), 1)), theatreId: th.id });
  const soldFor = (id) => live.filter((b) => b.showId === id).reduce((a, b) => a + b.seats.length, 0);
  const due = payouts(ctx.db, th).find((p) => p.state !== 'paid');
  host.innerHTML = `
    <div class="tiles">
      <div class="tile"><small>Tickets sold on Lumen</small><b>${tickets}</b><span>${live.length} bookings</span></div>
      <div class="tile"><small>Your earnings</small><b>${money(earned)}</b><span>Tickets + food, after refunds</span></div>
      <div class="tile"><small>Shows left today</small><b>${todays.length}</b><span>${tomorrow.length} tomorrow</span></div>
      <div class="tile"><small>Next payout</small><b>${due ? money(due.amount) : '—'}</b><span>${due ? esc(due.note) : 'Nothing due'}</span></div>
    </div>
    ${(ctx.db.state.theatres[th.id]?.kycStatus || 'not_submitted') !== 'verified' ? `<div class="notice">${icon('bell')}<span><b>Add your bank details</b> so we can send your money. Payouts stay on hold until KYC is verified.</span><a class="btn ghost sm" href="#partner-${th.id}-kyc">Bank & KYC</a></div>` : ''}
    <h2 class="sec">Today’s shows</h2>
    ${todays.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Movie</th><th>Screen</th><th>Sold on Lumen</th><th>Hall fill (all channels)</th></tr></thead><tbody>
      ${todays.map((s) => { const lay = layoutFor(`${th.id}s${s.screenIdx}`, s.hall); const n = soldFor(s.id); return `<tr><td><b>${hmLabel(s.hm)}</b></td><td>${esc(movieById(s.movieId).title)}<small>${esc(s.lang)} · ${esc(s.fmt)}</small></td><td>${esc(th.screens[s.screenIdx].name)}</td><td>${n} / ${lay.seats.length}</td><td><span class="bar"><i style="width:${Math.round(s.occ * 100)}%"></i></span> ${Math.round(s.occ * 100)}%</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="empty">No more shows today. Add shows in the Shows tab.</p>'}`;
}

/* ---------- show scheduler ---------- */
function shows(host, th, ctx) {
  let si = 0, dk = dayKey(today());
  const sch = () => ctx.db.state.schedule;
  const ci = CITIES.findIndex((c) => c.id === th.cityId);
  function render() {
    const sc = th.screens[si], own = sch()[sc.id]?.custom;
    const list = screenDay(sc, ci, dk);
    const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));
    const movies = MOVIES.filter((m) => isNowShowing(m) || m.rel <= 14);
    host.innerHTML = `
      <div class="filters">${th.screens.map((s2, i) => `<button type="button" class="fchip" data-sc="${i}" aria-pressed="${i === si}">${esc(s2.name)} · ${esc(s2.fmt)}</button>`).join('')}</div>
      ${own ? '' : `<div class="notice">${icon('clock')}<span><b>${esc(sc.name)} uses Lumen’s suggested schedule.</b> Switch to your own schedule to add, move or remove shows. We copy the next 14 days so nothing disappears.</span><button type="button" class="btn primary sm" id="ownSch">Use my own schedule</button></div>`}
      <div class="days">${days.map((d, i) => `<button type="button" class="day" data-dk="${dayKey(d)}" aria-pressed="${dayKey(d) === dk}"><small>${i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</small><b>${String(d.getDate()).padStart(2, '0')}</b><small>${d.toLocaleDateString('en-IN', { month: 'short' })}</small></button>`).join('')}</div>
      <div class="pt-cols">
        <section class="panel"><h2>${esc(sc.name)} · ${fmtDate(fromKey(dk))}</h2>
          ${list.length ? `<div class="sched">${list.map((x) => { const end = endOf(x.hm, x.movie.mins); return `<div class="sched-row"><b>${hmLabel(x.hm)}</b><span>${esc(x.movie.title)}<small>${esc(x.movie.lang)} · ${x.movie.mins} min · ends ${hmLabel(end)}</small></span>${own ? `<button type="button" class="iconbtn sm" data-del="${x.hm}" aria-label="Remove ${hmLabel(x.hm)} show">${icon('x')}</button>` : ''}</div>`; }).join('')}</div>` : '<p class="muted">No shows on this day.</p>'}
        </section>
        <section class="panel"><h2>Add shows</h2>
          <form id="addForm" class="pt-form" novalidate>
            <label class="af"><span>Movie</span><span class="dd"><select id="aMovie">${movies.map((m) => `<option value="${m.id}">${esc(m.title)} (${esc(m.lang)}, ${m.mins} min)${isNowShowing(m) ? '' : ' · releases ' + fmtDate(releaseDate(m))}</option>`).join('')}</select></span></label>
            <label class="af"><span>Start times (24-hour, comma separated)</span><input class="input" id="aTimes" value="10:00, 13:30, 17:15, 21:00" autocomplete="off"></label>
            <div class="af-grid"><label class="af"><span>From</span><span class="dd"><select id="aFrom">${days.map((d) => `<option value="${dayKey(d)}" ${dayKey(d) === dk ? 'selected' : ''}>${fmtDate(d)}</option>`).join('')}</select></span></label>
              <label class="af"><span>For how many days</span><span class="af-in"><input type="number" id="aDays" min="1" max="14" value="7"><small>days</small></span></label></div>
            <p class="err" id="aErr"></p>
            <button type="submit" class="btn primary">${icon('plus')}Add shows</button>
            <p class="hint">We check that shows don’t overlap: each show needs the movie’s length plus 20 minutes for cleaning.</p>
          </form>
        </section>
      </div>`;
    host.querySelector('.filters').addEventListener('click', (e) => { const b = e.target.closest('[data-sc]'); if (b) { si = +b.dataset.sc; render(); } });
    host.querySelector('.days').addEventListener('click', (e) => { const b = e.target.closest('[data-dk]'); if (b) { dk = b.dataset.dk; render(); } });
    $('#ownSch')?.addEventListener('click', async () => {
      const copy = [];
      for (let i = 0; i < 14; i++) { const k = dayKey(addDays(today(), i)); screenDay(sc, ci, k).forEach((x) => copy.push({ dk: k, hm: x.hm, movieId: x.movie.id })); }
      await save({ ...sch(), [sc.id]: { custom: true, shows: copy } }, 'Your own schedule is on. Add or remove shows below.');
    });
    host.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const hm = b.dataset.del; const id = `${sc.id}d${dk}h${hm}`;
      const sold = ctx.db.allBookings().some((x) => x.showId === id && !x.cancelled);
      if (sold) { toast('This show already has bookings. Cancel those first, then remove the show.'); return; }
      const cur = sch()[sc.id];
      await save({ ...sch(), [sc.id]: { ...cur, shows: cur.shows.filter((x) => !(x.dk === dk && x.hm === hm)) } }, `Removed the ${hmLabel(hm)} show.`);
    }));
    $('#addForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#aErr'); err.textContent = '';
      if (!own) { err.textContent = 'Switch to your own schedule first (button above).'; return; }
      const mv = movieById($('#aMovie').value);
      const times = $('#aTimes').value.split(/[,\s]+/).filter(Boolean);
      const bad = times.filter((x) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(x));
      if (!times.length || bad.length) { err.textContent = `Write times like 10:00, 18:45${bad.length ? ` (check: ${bad.join(', ')})` : ''}.`; return; }
      const n = Math.max(1, Math.min(14, +$('#aDays').value || 1));
      const from = fromKey($('#aFrom').value);
      const cur = sch()[sc.id]; const next = [...cur.shows]; const clashes = [];
      for (let i = 0; i < n; i++) {
        const k = dayKey(addDays(from, i));
        if (fromKey(k) < releaseDate(mv)) { clashes.push(`${fmtDate(fromKey(k))}: ${mv.title} is not released yet`); continue; }
        for (const tm of times) {
          const hm = tm.replace(':', '').padStart(4, '0');
          const start = toMin(hm), end = start + mv.mins + 20;
          const hit = next.filter((x) => x.dk === k).find((x) => { const m2 = movieById(x.movieId); const s2 = toMin(x.hm), e2 = s2 + (m2?.mins || 120) + 20; return start < e2 && s2 < end; });
          if (hit) clashes.push(`${fmtDate(fromKey(k))} ${tm} overlaps ${hmLabel(hit.hm)}`);
          else next.push({ dk: k, hm, movieId: mv.id });
        }
      }
      if (clashes.length && next.length === cur.shows.length) { err.textContent = clashes.slice(0, 4).join(' · '); return; }
      await save({ ...sch(), [sc.id]: { ...cur, shows: next } }, `${next.length - cur.shows.length} shows added.${clashes.length ? ` ${clashes.length} skipped because they overlap.` : ''}`);
    });
  }
  async function save(value, msg) {
    try { await ctx.db.put('schedule', value); toast(msg); render(); } catch (e) { toast('Could not save. Check the connection and try again.'); }
  }
  render();
}
const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(2);
const endOf = (hm, mins) => { const t = (toMin(hm) + mins) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + String(t % 60).padStart(2, '0'); };

/* ---------- prices ---------- */
function prices(host, th, ctx) {
  host.innerHTML = `<div class="pt-cols">${th.screens.map((sc) => {
    const pr = pricesFor(sc.id, sc.hall), lay = layoutFor(sc.id, sc.hall);
    return `<section class="panel"><h2>${esc(sc.name)} · ${esc(sc.fmt)}</h2><p class="muted">${esc(tx(hallName(sc.id, sc.hall)))} · ${lay.seats.length} seats</p>
      <form class="pt-form" data-sc="${sc.id}" novalidate><div class="af-grid">${Object.entries(pr).map(([k, v]) => `<label class="af"><span><i class="sw" style="background:${CLASS_META[k]?.color}"></i>${esc(clsName(k))} · ${lay.seats.filter((s) => s.cls === k).length} seats</span><span class="af-in"><small>₹</small><input type="number" name="${k}" min="0" max="5000" step="5" value="${v}" required></span></label>`).join('')}</div>
      <p class="err"></p><button type="submit" class="btn primary sm">${icon('check')}Save prices</button></form></section>`;
  }).join('')}</div><p class="hint">Customers see these prices plus Lumen’s booking fee, shown up front.</p>`;
  host.querySelectorAll('form').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = {}; let bad = false;
    f.querySelectorAll('input').forEach((i) => { const v = +i.value; if (!(v >= 0 && v <= 5000)) bad = true; vals[i.name] = Math.round(v); });
    if (bad) { f.querySelector('.err').textContent = 'Prices must be between ₹0 and ₹5,000.'; return; }
    try { await ctx.db.put('prices', { ...ctx.db.state.prices, [f.dataset.sc]: vals }); toast('Prices saved. New bookings use them right away.'); f.querySelector('.err').textContent = ''; }
    catch (err) { toast('Could not save. Check the connection and try again.'); }
  }));
}

/* ---------- seat layouts ---------- */
function layouts(host, th) {
  host.innerHTML = `<div class="pt-cols">${th.screens.map((sc) => {
    const lay = layoutFor(sc.id, sc.hall), own = !!customFor(sc.id);
    const byCls = {}; lay.seats.forEach((s) => { if (!s.disabled) byCls[s.cls] = (byCls[s.cls] || 0) + 1; });
    return `<section class="panel"><h2>${esc(sc.name)}</h2><p class="muted">${own ? 'Your own layout' : 'Template: ' + esc(HALLS[sc.hall].en)} · ${lay.rows.length} rows · ${lay.seats.length} seats · screen ${lay.screen.w} m</p>
      <div class="prices">${Object.entries(byCls).map(([k, n]) => `<span><i style="background:${CLASS_META[k].color}"></i>${esc(clsName(k))} ${n}</span>`).join('')}</div>
      <a class="btn primary sm" href="#admin-${sc.id}">${icon('grid')}Edit seat layout</a></section>`;
  }).join('')}</div>
  <p class="hint">Changing a layout affects new bookings only. Seats already sold keep their seat numbers on the ticket.</p>`;
}

/* ---------- bank & KYC ---------- */
function kycTab(host, th, ctx) {
  const cur = ctx.db.state.theatres[th.id] || {}; const k = cur.kyc || {};
  const status = cur.kycStatus || 'not_submitted';
  host.innerHTML = `<section class="panel narrow"><h2>Bank & KYC</h2>
    <p class="muted">We pay your share of every ticket to this bank account. Lumen’s team checks these details before the first payout.</p>
    <div>${chip(['Status: ' + KYC_LABEL[status][0], KYC_LABEL[status][1]])}${cur.kycNote ? ` <span class="muted">${esc(cur.kycNote)}</span>` : ''}</div>
    <form id="kycForm" class="pt-form" novalidate>
      <label class="af"><span>Legal business name</span><input class="input" name="legal" value="${esc(k.legal || '')}" autocomplete="organization" required></label>
      <div class="af-grid"><label class="af"><span>GSTIN</span><input class="input" name="gstin" value="${esc(k.gstin || '')}" maxlength="15" placeholder="33ABCDE1234F1Z5" required></label>
        <label class="af"><span>PAN</span><input class="input" name="pan" value="${esc(k.pan || '')}" maxlength="10" placeholder="ABCDE1234F" required></label></div>
      <label class="af"><span>Account holder name</span><input class="input" name="holder" value="${esc(k.holder || '')}" required></label>
      <div class="af-grid"><label class="af"><span>Account number</span><input class="input" name="acct" inputmode="numeric" value="" placeholder="${k.acctLast4 ? '•••• ' + esc(k.acctLast4) : '9 to 18 digits'}" ${k.acctLast4 ? '' : 'required'}></label>
        <label class="af"><span>Confirm account number</span><input class="input" name="acct2" inputmode="numeric" value=""></label></div>
      <div class="af-grid"><label class="af"><span>IFSC</span><input class="input" name="ifsc" value="${esc(k.ifsc || '')}" maxlength="11" placeholder="SBIN0001234" required></label>
        <label class="af"><span>UPI ID (optional)</span><input class="input" name="upi" value="${esc(k.upi || '')}" placeholder="theatre@okaxis"></label></div>
      <label class="af"><span>Payout cycle</span><span class="dd"><select name="cycle"><option value="weekly" ${k.cycle !== '3day' ? 'selected' : ''}>Weekly (every Wednesday)</option><option value="3day" ${k.cycle === '3day' ? 'selected' : ''}>Every 3 days</option></select></span></label>
      <p class="err" id="kErr"></p>
      <button type="submit" class="btn primary">${icon('check')}${status === 'not_submitted' ? 'Submit for verification' : 'Update and resubmit'}</button>
      <p class="hint">Demo: details are stored for this prototype only. A live version must encrypt bank details and verify them with a penny-drop check.</p>
    </form></section>`;
  $('#kycForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    Object.keys(f).forEach((x) => { f[x] = String(f[x]).trim(); });
    f.gstin = f.gstin.toUpperCase(); f.pan = f.pan.toUpperCase(); f.ifsc = f.ifsc.toUpperCase();
    const errs = [];
    if (f.legal.length < 3) errs.push('Enter the legal business name.');
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(f.gstin)) errs.push('GSTIN should look like 33ABCDE1234F1Z5.');
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(f.pan)) errs.push('PAN should look like ABCDE1234F.');
    if (f.gstin && f.pan && f.gstin.slice(2, 12) !== f.pan) errs.push('The PAN must match characters 3–12 of the GSTIN.');
    if (f.holder.length < 3) errs.push('Enter the account holder name.');
    if (f.acct || !k.acctLast4) {
      if (!/^\d{9,18}$/.test(f.acct)) errs.push('Account number must be 9 to 18 digits.');
      else if (f.acct !== f.acct2) errs.push('The two account numbers don’t match.');
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc)) errs.push('IFSC should look like SBIN0001234.');
    if (f.upi && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(f.upi)) errs.push('UPI ID should look like name@bank.');
    if (errs.length) { $('#kErr').textContent = errs.join(' '); return; }
    const kyc = { legal: f.legal, gstin: f.gstin, pan: f.pan, holder: f.holder, ifsc: f.ifsc, upi: f.upi, cycle: f.cycle, acctLast4: f.acct ? f.acct.slice(-4) : k.acctLast4, submittedAt: Date.now() };
    try {
      await ctx.db.put('theatres', { ...ctx.db.state.theatres, [th.id]: { ...cur, kyc, kycStatus: 'pending', kycNote: '' } });
      toast('Submitted. Lumen will verify your details, usually within 2 working days.'); ctx.route();
    } catch (err) { toast('Could not save. Check the connection and try again.'); }
  });
}

/* ---------- sales & payouts ---------- */
function payouts(db, th) {
  const bs = bookingsOf(db, th);
  const verified = (db.state.theatres[th.id]?.kycStatus) === 'verified';
  const weeks = new Map();
  for (const b of bs) { const w = weekStart(b.at).getTime(); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(b); }
  return [...weeks.entries()].sort((a, b) => b[0] - a[0]).map(([w, list]) => {
    const end = addDays(new Date(w), 6), payDay = addDays(new Date(w), 9);
    const amount = list.reduce((a, b) => a + bookingMoney(b).theatre, 0);
    const done = end < new Date();
    const st = !verified ? 'hold' : done && payDay <= new Date() ? 'paid' : 'due';
    return { week: new Date(w), end, payDay, amount, count: list.length, state: st,
      note: st === 'hold' ? 'On hold until KYC is verified' : st === 'paid' ? `Paid on ${fmtDate(payDay)}` : `Due on ${fmtDate(payDay)}` };
  });
}
function sales(host, th, ctx) {
  const bs = bookingsOf(ctx.db, th);
  const sum = (k) => bs.reduce((a, b) => a + bookingMoney(b)[k], 0);
  const pays = payouts(ctx.db, th);
  host.innerHTML = `
    <div class="tiles">
      <div class="tile"><small>Ticket sales</small><b>${money(sum('ticket'))}</b><span>${bs.length} bookings</span></div>
      <div class="tile"><small>Food & drinks</small><b>${money(bs.filter((b) => !b.cancelled).reduce((a, b) => a + bookingMoney(b).food, 0))}</b><span>Pre-ordered</span></div>
      <div class="tile"><small>Refunds</small><b>${money(sum('refund'))}</b><span>${bs.filter((b) => b.cancelled).length} cancelled</span></div>
      <div class="tile"><small>Your share</small><b>${money(sum('theatre'))}</b><span>Lumen’s booking fee is not part of this</span></div>
    </div>
    <h2 class="sec">Payouts</h2>
    ${pays.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Week</th><th>Bookings</th><th>Amount</th><th>Status</th></tr></thead><tbody>${pays.map((p) => `<tr><td>${fmtDate(p.week)} – ${fmtDate(p.end)}</td><td>${p.count}</td><td><b>${money(p.amount)}</b></td><td>${chip([p.note, p.state === 'paid' ? 'ok' : p.state === 'due' ? 'warn' : 'bad'])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No bookings yet. Payouts appear here once tickets are sold.</p>'}
    <h2 class="sec">Bookings</h2>
    ${bs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Booked</th><th>ID</th><th>Show</th><th>Seats</th><th>Tickets</th><th>Food</th><th>Status</th><th>Your share</th></tr></thead><tbody>
      ${bs.map((b) => { const sh = showById(b.showId); const mm = bookingMoney(b); return `<tr><td>${new Date(b.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td><td class="mono-s">${esc(b.id)}</td><td>${sh ? `${esc(movieById(sh.movieId).title)}<small>${fmtDate(fromKey(sh.dk))} ${hmLabel(sh.hm)} · ${esc(th.screens[sh.screenIdx].name)}</small>` : 'Past show'}</td><td>${esc((b.seats || []).join(', '))}</td><td>${money(mm.ticket)}</td><td>${money(mm.food)}</td><td>${b.cancelled ? chip([`Cancelled · ${money(mm.refund)} refunded`, 'bad']) : chip(['Confirmed', 'ok'])}</td><td><b>${money(mm.theatre)}</b></td></tr>`; }).join('')}
    </tbody></table></div>` : ''}
    <p class="hint">Payouts are simulated in this prototype. In production they are sent by the payment gateway’s split settlement to your verified bank account.</p>`;
}
