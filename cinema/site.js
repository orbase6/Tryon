// Customer pages: explore (movies, events, plays, sports, activities, stream) with filters,
// offers, gift cards, corporates, list your show, the city picker and the site footer.
import { MOVIES, EVENTS, EVENT_CATS, PREMIERES, OFFERS, OFFER_TYPES, GIFT_DESIGNS, POPULAR_CITIES, CITIES, cityById, allCities, nearestCity, LIVE,
  isNowShowing, today, addDays, hmLabel, theatresFor, releaseDate } from './data.js';
import { icon, esc, inr, $, $$, toast, state, tx, fmtDate, poster, posterArt } from './ui.js';

const L = (en, ta) => (state.lang === 'ta' && ta ? ta : en);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ---------- posters for events and gift cards ---------- */
export function eventPoster(e, big = false) {
  if (e.img || e.poster) return `<img class="poster-img" src="${esc(e.poster || e.img)}" alt="${esc(e.title)}" loading="${big ? 'eager' : 'lazy'}" decoding="async">`;
  return posterArt({ id: 'ev' + e.id, title: e.title, lang: (e.langs && e.langs[0]) || e.kind, cert: e.type || '', c1: e.c1, c2: e.c2, motif: e.motif || 'stars' }, { big });
}
export function eventCard(e) {
  const d = addDays(today(), e.day);
  return `<a class="pcard" href="#event-${e.id}"><div class="poster">${eventPoster(e)}<span class="pc-date">${fmtDate(d, true)}${e.tags?.includes('fast') ? ' · Filling fast' : ''}</span>${e.promoted ? '<span class="pill-tag">PROMOTED</span>' : ''}</div>
    <b class="card-t">${esc(e.title)}</b><small class="pc-m">${esc(e.venue)}</small><small class="pc-m">${esc(e.type || e.kind)}</small><small class="pc-p">${e.price ? `${inr(e.price)} onwards` : 'Free'}</small></a>`;
}
function giftArt(g, label = '') {
  return `<div class="gift" style="--c1:${g.c1};--c2:${g.c2}"><span class="gift-brand"><span class="logo-dot"></span>Lumen <i>gift card</i></span><b>${esc(g.title)}</b>${label ? `<small>${esc(label)}</small>` : ''}<span class="gift-art">${posterArt({ id: 'g' + g.id, title: '', lang: '', cert: '', c1: g.c1, c2: g.c2, motif: g.motif })}</span></div>`;
}

/* ---------- explore pages with filters ---------- */
const F = {}; // remembered filters per page
const DATE_OPTS = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'This weekend'], ['range', 'Date range']];
const MORE = [['outdoor', 'Outdoor events'], ['fast', 'Fast filling'], ['must', 'Must attend'], ['kids', 'Kids allowed']];
const PRICE = [['free', 'Free'], ['0-500', '₹0 – 500'], ['501-2000', '₹501 – 2000'], ['2000+', 'Above ₹2000']];
const FORMATS = ['2D', 'IMAX', '4DX', 'Dolby Atmos', 'Recliner'];

function inDate(day, f) {
  const d = addDays(today(), day), t0 = today();
  if (f.date === 'today') return day === 0;
  if (f.date === 'tomorrow') return day === 1;
  if (f.date === 'weekend') { const wd = d.getDay(); return day >= 0 && day <= 7 && (wd === 0 || wd === 6) && (d - t0) / 864e5 < 7; }
  if (f.date === 'range') return (!f.from || iso(d) >= f.from) && (!f.to || iso(d) <= f.to);
  return true;
}
function inPrice(p, f) {
  if (!f.price.length) return true;
  return f.price.some((k) => (k === 'free' ? p === 0 : k === '0-500' ? p <= 500 : k === '501-2000' ? p > 500 && p <= 2000 : p > 2000));
}
export function exploreView(view, kind, ctx) {
  const city = cityById(ctx.app.city());
  const isMovies = kind === 'movies', isStream = kind === 'stream';
  const cat = EVENT_CATS.find((c) => c.id === kind);
  F[kind] ||= { types: [], langs: [], genres: [], formats: [], more: [], price: [], date: '', from: '', to: '', status: 'now', venue: '' };
  const f = F[kind];
  const source = isMovies ? MOVIES : isStream ? PREMIERES : EVENTS.filter((e) => e.cat === kind && e.day >= 0);
  const langs = [...new Set(source.flatMap((x) => (isMovies || isStream ? x.langs || [x.lang] : x.langs || [])))].filter(Boolean).sort();
  const genres = [...new Set(source.flatMap((x) => x.genres || []))].sort();
  const types = cat ? cat.types.filter((t) => source.some((e) => e.type === t)) : [];
  const title = isMovies ? L(`Movies in ${tx(city)}`, `${tx(city)} படங்கள்`) : isStream ? 'Premiere: watch at home' : L(`${cat.en} in ${tx(city)}`, `${tx(city)} ${cat.ta}`);
  const chip = (group, val, label, on) => `<button type="button" class="fchip sm" data-g="${group}" data-v="${esc(val)}" aria-pressed="${on}">${esc(label)}</button>`;
  const group = (key, label, body, open = true) => `<details class="fgroup" ${open ? 'open' : ''}><summary><span>${label}</span><button type="button" class="link sm" data-clear="${key}">Clear</button></summary><div class="fbody">${body}</div></details>`;
  const filtersHTML = () => [
    isMovies && group('status', 'Show', ['now', 'soon'].map((v) => chip('status', v, v === 'now' ? 'Now showing' : 'Coming soon', f.status === v)).join('')),
    types.length && group('types', cat.id === 'sports' ? 'Sports type' : cat.id === 'plays' ? 'Play type' : 'Categories', types.map((t) => chip('types', t, t, f.types.includes(t))).join('')),
    !isMovies && !isStream && group('date', 'Date', DATE_OPTS.map(([v, l]) => chip('date', v, l, f.date === v)).join('') + (f.date === 'range' ? `<div class="drange"><input class="input" type="date" data-r="from" value="${f.from}" aria-label="From"><input class="input" type="date" data-r="to" value="${f.to}" aria-label="To"></div>` : '')),
    langs.length && group('langs', 'Languages', langs.map((l) => chip('langs', l, l, f.langs.includes(l))).join('')),
    (isMovies || isStream) && genres.length && group('genres', 'Genres', genres.map((g) => chip('genres', g, g, f.genres.includes(g))).join(''), false),
    isMovies && group('formats', 'Format', FORMATS.map((x) => chip('formats', x, x, f.formats.includes(x))).join(''), false),
    !isMovies && !isStream && group('more', 'More filters', MORE.map(([v, l]) => chip('more', v, l, f.more.includes(v))).join(''), false),
    !isMovies && !isStream && group('price', 'Price', PRICE.map(([v, l]) => chip('price', v, l, f.price.includes(v))).join(''), false),
  ].filter(Boolean).join('') + (!isMovies && !isStream ? `<button type="button" class="btn ghost block" id="byVenue">${icon('pin')}${f.venue ? esc(f.venue) : L('Browse by venues', 'இடங்கள்')}</button>` : '');
  const results = () => {
    if (isMovies) {
      const theatreFmts = new Set(theatresFor(city.id).flatMap((t) => t.screens.map((s) => s.fmt)));
      return source.filter((m) => (f.status === 'now' ? isNowShowing(m) : !isNowShowing(m))
        && (!f.langs.length || (m.langs || [m.lang]).some((l) => f.langs.includes(l)))
        && (!f.genres.length || m.genres.some((g) => f.genres.includes(g)))
        && (!f.formats.length || f.formats.some((x) => (x === 'IMAX' ? m.imax && theatreFmts.has('IMAX') : theatreFmts.has(x)))))
        .sort((a, b) => (f.status === 'now' ? b.rating * Math.log(b.votes + 2) - a.rating * Math.log(a.votes + 2) : a.rel - b.rel));
    }
    if (isStream) return source.filter((m) => (!f.langs.length || f.langs.includes(m.lang)) && (!f.genres.length || m.genres.some((g) => f.genres.includes(g))));
    return source.filter((e) => (!f.types.length || f.types.includes(e.type)) && inDate(e.day, f) && (!f.langs.length || (e.langs || []).some((l) => f.langs.includes(l)))
      && f.more.every((t) => (e.tags || []).includes(t)) && inPrice(e.price, f) && (!f.venue || e.venue === f.venue)).sort((a, b) => a.day - b.day);
  };
  const cardOf = (x) => (isMovies ? ctx.card(x) : isStream ? ctx.card(x, `#premiere-${x.id}`, 'PREMIERE') : eventCard(x));
  const draw = () => {
    const list = results(), nf = f.types.length + f.langs.length + f.genres.length + f.formats.length + f.more.length + f.price.length + (f.date ? 1 : 0) + (f.venue ? 1 : 0);
    view.innerHTML = `<div class="explore">
      <aside class="fside"><div class="fside-h"><h2>${L('Filters', 'வடிகட்டிகள்')}</h2>${nf ? `<button type="button" class="link sm" data-clear="all">${L('Clear all', 'அனைத்தையும் நீக்கு')}</button>` : ''}</div>${filtersHTML()}</aside>
      <section class="xmain"><div class="xhead"><h1>${esc(title)}</h1><button type="button" class="btn ghost sm fbtn" id="fOpen">${icon('grid')}${L('Filters', 'வடிகட்டி')}${nf ? ` <i class="cnt">${nf}</i>` : ''}</button></div>
        ${types.length ? `<div class="xchips">${types.map((t) => chip('types', t, t, f.types.includes(t))).join('')}</div>` : isMovies ? `<div class="xchips">${langs.map((l) => chip('langs', l, l, f.langs.includes(l))).join('')}</div>` : ''}
        ${list.length ? `<div class="pgrid">${list.map(cardOf).join('')}</div>` : `<div class="empty-box">${icon('search')}<b>${L('Nothing matches these filters', 'பொருத்தம் இல்லை')}</b><button type="button" class="btn ghost sm" data-clear="all">${L('Clear filters', 'நீக்கு')}</button></div>`}
        ${isMovies && f.status === 'now' ? `<button type="button" class="soon-link" data-g="status" data-v="soon">${icon('clock')}<span><b>${L('Coming soon', 'விரைவில்')}</b><small>${L('Explore upcoming movies', 'வரவிருக்கும் படங்கள்')}</small></span>${icon('right')}</button>` : ''}
      </section></div>`;
  };
  const toggle = (arr, v) => (arr.includes(v) ? arr.splice(arr.indexOf(v), 1) : arr.push(v));
  view.onclick = (e) => {
    const c = e.target.closest('[data-clear]');
    if (c) { e.preventDefault(); const k = c.dataset.clear; if (k === 'all') { F[kind] = null; exploreView(view, kind, ctx); return; } if (Array.isArray(f[k])) f[k] = []; else if (k === 'date') Object.assign(f, { date: '', from: '', to: '' }); else if (k === 'status') f.status = 'now'; draw(); return; }
    const b = e.target.closest('[data-g]');
    if (b) {
      const g = b.dataset.g, v = b.dataset.v;
      if (g === 'date') f.date = f.date === v ? '' : v; else if (g === 'status') f.status = v; else toggle(f[g], v);
      draw(); if (window.innerWidth < 900 && e.target.closest('.sheet-card')) ctx.closeSheet(); return;
    }
    if (e.target.closest('#fOpen')) { ctx.openSheet(`<h2 class="sh-t">${icon('grid')}${L('Filters', 'வடிகட்டிகள்')}</h2><div class="fside in-sheet">${filtersHTML()}</div>`, (sh) => { sh.onclick = view.onclick; sh.onchange = view.onchange; }); return; }
    if (e.target.closest('#byVenue')) {
      const venues = [...new Set(source.map((x) => x.venue))].sort();
      ctx.openSheet(`<h2 class="sh-t">${icon('pin')}${L('Browse by venues', 'இடங்கள்')}</h2><div class="venue-list"><button type="button" data-ven="">${L('All venues', 'அனைத்தும்')}</button>${venues.map((v) => `<button type="button" data-ven="${esc(v)}" aria-pressed="${f.venue === v}">${esc(v)}<small>${source.filter((x) => x.venue === v).length} ${L('listings', 'நிகழ்வுகள்')}</small></button>`).join('')}</div>`,
        (sh) => sh.addEventListener('click', (ev) => { const b2 = ev.target.closest('[data-ven]'); if (!b2) return; f.venue = b2.dataset.ven; ctx.closeSheet(); draw(); }));
    }
  };
  view.onchange = (e) => { const r = e.target.closest('[data-r]'); if (r) { f[r.dataset.r] = r.value; draw(); } };
  ctx.onLeave(() => { view.onclick = null; view.onchange = null; });
  draw();
}

/* ---------- offers ---------- */
let offerType = 'all';
export function offersView(view, ctx) {
  const icons = { credit: 'ticket', debit: 'ticket', upi: 'send', wallet: 'popcorn', cinema: 'seat', lumen: 'spark', later: 'clock' };
  const draw = (q = '') => {
    const list = OFFERS.filter((o) => (offerType === 'all' || (o.type || 'lumen') === offerType) && (!q || (o.en + o.code).toLowerCase().includes(q.toLowerCase())));
    view.innerHTML = `<div class="explore offers-page"><aside class="fside"><input class="input" id="ofQ" type="search" placeholder="${L('Search offers', 'சலுகை தேடு')}" value="${esc(q)}">
      <nav class="olist">${OFFER_TYPES.map(([k, l]) => `<button type="button" data-ot="${k}" aria-pressed="${offerType === k}">${esc(l)}<small>${k === 'all' ? OFFERS.length : OFFERS.filter((o) => (o.type || 'lumen') === k).length}</small></button>`).join('')}</nav></aside>
      <section class="xmain"><div class="xhead"><h1>${L('Offers', 'சலுகைகள்')}</h1></div>
      ${list.length ? `<div class="ogrid">${list.map((o) => `<article class="ocard"><span class="oc-ic">${icon(icons[o.type] || 'spark')}</span><span class="oc-type">${esc((OFFER_TYPES.find((t) => t[0] === (o.type || 'lumen')) || [0, 'Lumen'])[1])}</span>
        <b>${esc(o.en)}</b><small>Code <code>${esc(o.code)}</code>${o.min ? ` · Min. order ${inr(o.min)}` : ''}</small><button type="button" class="link" data-od="${esc(o.code)}">${L('View details', 'விவரம்')} ${icon('right')}</button></article>`).join('')}</div>`
        : `<div class="empty-box">${icon('spark')}<b>${L('No offers here right now', 'இப்போது சலுகைகள் இல்லை')}</b></div>`}</section></div>`;
    $('#ofQ').addEventListener('input', (e) => { const v = e.target.value; draw(v); const i = $('#ofQ'); i.focus(); i.setSelectionRange(v.length, v.length); });
  };
  view.onclick = (e) => {
    const t = e.target.closest('[data-ot]'); if (t) { offerType = t.dataset.ot; draw($('#ofQ')?.value || ''); return; }
    const d = e.target.closest('[data-od]'); if (!d) return;
    const o = OFFERS.find((x) => x.code === d.dataset.od);
    const rules = [o.flat ? `Flat ${inr(o.flat)} off.` : `${o.pct}% off, up to ${inr(o.max)}.`, o.min ? `Minimum order ${inr(o.min)}.` : '', o.minSeats ? `Book ${o.minSeats} or more tickets.` : '', o.morning ? 'Shows before 12 PM only.' : '', o.upi ? 'Pay by UPI.' : '', o.card === 'credit' ? 'Pay with a credit card.' : '', o.card === 'debit' ? 'Pay with a debit card.' : '', o.wallet ? 'Pay with a wallet.' : '', o.code === 'FIRST50' ? 'First booking on Lumen only.' : '', 'One offer per booking. Lumen can change or stop offers at any time.'].filter(Boolean);
    ctx.openSheet(`<h2 class="sh-t">${icon('spark')}${esc(o.en)}</h2><p>Use code <code class="big-code">${esc(o.code)}</code> on the payment page.</p><h3 class="ad-h">Terms</h3><ul class="plan-inc">${rules.map((r) => `<li>${icon('check')}${esc(r)}</li>`).join('')}</ul><a class="btn primary wide" href="#movies">${icon('ticket')}${L('Book now', 'இப்போது புக் செய்')}</a>`);
  };
  ctx.onLeave(() => { view.onclick = null; });
  draw();
}

/* ---------- gift cards ---------- */
export function giftCardsView(view, ctx) {
  view.innerHTML = `<section class="gc-hero"><div><h1>${L('Lumen gift cards', 'Lumen பரிசு அட்டைகள்')}</h1><p>${L('Movies, concerts, plays and more. Send one in a minute; it reaches their inbox with your message.', 'ஒரு நிமிடத்தில் அனுப்புங்கள்.')}</p>
    <div class="row-btns"><button type="button" class="btn primary" data-gd="movie">${icon('ticket')}${L('Send a gift card', 'அனுப்பு')}</button><button type="button" class="btn glass" id="gcBal">${L('Check balance', 'இருப்பு')}</button></div></div>${giftArt(GIFT_DESIGNS[6], '₹1,000')}</section>
    <h2 class="sec">${L('Pick a design', 'வடிவமைப்பு')}</h2><div class="gc-grid">${GIFT_DESIGNS.map((g) => `<button type="button" class="gc-pick" data-gd="${g.id}">${giftArt(g)}</button>`).join('')}</div>
    <div class="steps3"><div>${icon('image')}<b>1. Pick a design</b><small>Choose the occasion.</small></div><div>${icon('mail')}<b>2. Add a message</b><small>We email it with the code.</small></div><div>${icon('ticket')}<b>3. They book</b><small>Use it as "Gift voucher" at payment. Valid 1 year.</small></div></div>`;
  view.onclick = (e) => {
    if (e.target.closest('#gcBal')) {
      ctx.openSheet(`<h2 class="sh-t">${icon('ticket')}${L('Check balance', 'இருப்பு')}</h2><form id="gbF" class="snacks" novalidate><input class="input" id="gbC" placeholder="Gift card code" autocomplete="off"><p class="err" id="gbE"></p><button class="btn primary block" type="submit">${L('Check', 'சரிபார்')}</button></form>`, (sh) => {
        sh.querySelector('#gbF').addEventListener('submit', async (ev) => { ev.preventDefault(); try { const r = await ctx.db.giftCheck(sh.querySelector('#gbC').value.trim().toUpperCase()); sh.querySelector('#gbE').innerHTML = `<span class="ok-t">Balance ${inr(r.balance)} · valid till ${new Date(r.valid).toLocaleDateString('en-IN')}</span>`; } catch (x) { sh.querySelector('#gbE').textContent = x.message; } });
      });
      return;
    }
    const b = e.target.closest('[data-gd]'); if (!b) return;
    const g = GIFT_DESIGNS.find((x) => x.id === b.dataset.gd) || GIFT_DESIGNS[0];
    let amount = 1000;
    ctx.openSheet(`<h2 class="sh-t">${icon('ticket')}${esc(g.title)}</h2>${giftArt(g)}
      <form id="gcF" class="pt-form" novalidate><div class="af"><span>Amount</span><div class="choice" id="gcAmt">${[500, 1000, 2000, 5000].map((a) => `<button type="button" data-a="${a}" aria-pressed="${a === amount}">${inr(a)}</button>`).join('')}</div><input class="input" id="gcOther" type="number" min="100" max="10000" placeholder="Other amount (₹100 – ₹10,000)"></div>
        <div class="af-grid"><label class="af"><span>Their name</span><input class="input" name="toName" autocomplete="off"></label><label class="af"><span>Their email</span><input class="input" name="toEmail" type="email" autocomplete="off"></label></div>
        <label class="af"><span>Your name</span><input class="input" name="fromName" value="${esc(ctx.db.me?.name || '')}"></label>
        <label class="af"><span>Message (optional)</span><textarea class="input" name="message" rows="2" maxlength="200" style="padding:10px 12px"></textarea></label>
        <p class="err" id="gcE"></p><button type="submit" class="btn primary block" id="gcPay">Pay ${inr(amount)}</button><p class="muted small center">${ctx.db.demo ? 'Demo payment: no money is taken.' : ''}</p></form>`, (sh) => {
      const setAmt = (a) => { amount = a; sh.querySelector('#gcPay').textContent = `Pay ${inr(a)}`; sh.querySelectorAll('#gcAmt button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.a === a))); };
      sh.querySelector('#gcAmt').addEventListener('click', (ev) => { const x = ev.target.closest('[data-a]'); if (x) { sh.querySelector('#gcOther').value = ''; setAmt(+x.dataset.a); } });
      sh.querySelector('#gcOther').addEventListener('input', (ev) => { const v = Math.round(+ev.target.value); if (v >= 100) setAmt(v); });
      sh.querySelector('#gcF').addEventListener('submit', async (ev) => {
        ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target).entries());
        if (ctx.db.mode !== 'server') { sh.querySelector('#gcE').textContent = 'Gift cards work on the live Lumen site.'; return; }
        try {
          const r = await ctx.db.giftBuy({ design: g.id, amount, ...fd });
          ctx.openSheet(`<h2 class="sh-t">${icon('check')}${L('Gift card sent', 'அனுப்பப்பட்டது')}</h2>${giftArt(g, inr(r.amount))}<p>We emailed <b>${esc(fd.toEmail)}</b> with your message.</p><p>Code: <code class="big-code">${esc(r.code)}</code></p><p class="muted small">Keep this code. It works as "Gift voucher" on the payment page for 1 year.</p>`);
        } catch (x) { sh.querySelector('#gcE').textContent = x.message; }
      });
    });
  };
  ctx.onLeave(() => { view.onclick = null; });
}

/* ---------- corporates and list your show (enquiry forms) ---------- */
function enquiry(view, ctx, { hero, sub, img, topic, perks, fields, extra = '' }) {
  view.innerHTML = `<section class="enq-hero"${img ? ` style="--bg:url('${img}')"` : ''}><div class="enq-copy"><h1>${hero}</h1><p>${sub}</p></div>
    <form class="enq-form" id="enqF" novalidate><h2>${L('Talk to us', 'எங்களிடம் பேசுங்கள்')}</h2>${fields.map(([n, l, t = 'text']) => `<label class="af"><span>${l}</span><input class="input" name="${n}" type="${t}" ${t === 'tel' ? 'inputmode="numeric" maxlength="10"' : ''}></label>`).join('')}
      <p class="err" id="enqE"></p><button type="submit" class="btn primary block">${L('Receive a callback', 'அழைக்கவும்')}</button></form></section>
    <div class="perks">${perks.map(([ic, t, d]) => `<div class="perk">${icon(ic)}<b>${t}</b><small>${d}</small></div>`).join('')}</div>${extra}`;
  $('#enqF').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target).entries());
    if (ctx.db.mode !== 'server') { $('#enqE').textContent = 'This form works on the live Lumen site.'; return; }
    const message = Object.entries(f).filter(([k]) => !['name', 'email', 'phone'].includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n') || topic;
    try { await ctx.db.contact({ name: f.name, email: f.email, phone: f.phone, topic, message }); e.target.innerHTML = `<div class="notice ok">${icon('check')}<span>${L('Thanks! Our team will call you within one working day.', 'நன்றி! விரைவில் அழைப்போம்.')}</span></div>`; }
    catch (x) { $('#enqE').textContent = x.message; }
  });
}
export function corporatesView(view, ctx) {
  enquiry(view, ctx, { hero: L('Entertainment you can gift', 'பரிசாக பொழுதுபோக்கு'), sub: L('Movie and event vouchers for your team and customers: rewards, festivals, loyalty and promotions.', 'உங்கள் குழுவுக்கு வவுச்சர்கள்.'), img: 'img/samples/cover-hall.jpg', topic: 'Corporate vouchers',
    fields: [['name', 'Full name'], ['email', 'Company email', 'email'], ['company', 'Company name'], ['phone', 'Mobile number', 'tel']],
    perks: [['ticket', 'Bulk gift cards', 'Any amount, your company’s message, sent in one go.'], ['spark', 'Promotions', 'Movie tickets as rewards for your customers.'], ['user', 'Employee events', 'Book a full show or a private screening.'], ['check', 'GST invoice', 'One invoice for every order.']] });
}
export function listShowView(view, ctx) {
  enquiry(view, ctx, { hero: L('List your show on Lumen', 'உங்கள் நிகழ்வைப் பட்டியலிடுங்கள்'), sub: L('Concerts, comedy, plays, workshops, sports or tours: sell tickets to people near you, with seat maps, QR entry and weekly payouts.', 'டிக்கெட்டுகளை விற்கவும்.'), img: 'img/kadal-beats.jpg', topic: 'List my show',
    fields: [['name', 'Your name'], ['email', 'Email', 'email'], ['phone', 'Mobile number', 'tel'], ['event', 'What do you want to host?'], ['city', 'City']],
    perks: [['grid', 'Event setup in minutes', 'Dates, ticket types and prices, with a live preview.'], ['ticket', 'QR ticket scanning', 'Fast entry at the gate from any phone.'], ['image', 'Your banners', 'Promote on the home page of your city.'], ['send', 'Weekly payouts', 'Straight to your bank account.']],
    extra: `<h2 class="sec center">${L('What can you host?', 'எதை நடத்தலாம்?')}</h2><div class="hosts">${[['speaker', 'Concerts'], ['spark', 'Comedy'], ['ticket', 'Plays'], ['image', 'Workshops'], ['star', 'Sports'], ['pin', 'Tours & activities'], ['user', 'Conferences'], ['seat', 'Movie theatres']].map(([ic, l]) => `<div class="host">${icon(ic)}<b>${l}</b></div>`).join('')}</div>
      <div class="notice">${icon('seat')}<span><b>Run a movie theatre?</b> Register as a theatre partner to sell seats with your real seat layout.</span><a class="btn primary sm" href="#register">Register your theatre</a></div>` });
}

/* ---------- city picker ---------- */
const CITY_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 42h36M10 42V22h8v20M22 42V12l4-6 4 6v30M34 42V26h6v16M13 26h2M13 31h2M13 36h2M25 18h2M25 24h2M25 30h2M25 36h2"/></svg>';
export function cityPicker(ctx, first = false) {
  const draw = (q = '', showAll = false) => {
    const list = allCities(), ql = q.trim().toLowerCase();
    const popular = POPULAR_CITIES.map(cityById).filter(Boolean);
    const others = list.filter((c) => !POPULAR_CITIES.includes(c.id)).sort((a, b) => a.en.localeCompare(b.en));
    const found = ql ? list.filter((c) => c.en.toLowerCase().includes(ql)) : [];
    return `<div class="cp"><div class="cp-search">${icon('search')}<input class="input" id="cpQ" type="search" placeholder="${L('Search for your city', 'உங்கள் நகரத்தைத் தேடுங்கள்')}" value="${esc(q)}" autocomplete="off"></div>
      <button type="button" class="link cp-detect" id="cpLoc">${icon('locate')}${L('Detect my location', 'என் இருப்பிடத்தைக் கண்டறி')}</button>
      ${ql ? `<div class="cp-list">${found.length ? found.map((c) => `<button type="button" data-c="${c.id}">${esc(tx(c))}${c.other ? '' : ' <small>· Lumen theatres</small>'}</button>`).join('') : `<p class="muted">${L('No city found', 'நகரம் இல்லை')}</p>`}</div>`
      : `<h3 class="cp-h">${L('Popular cities', 'பிரபல நகரங்கள்')}</h3><div class="cp-pop">${popular.map((c) => `<button type="button" data-c="${c.id}" aria-pressed="${ctx.app.city() === c.id}">${CITY_ICON}<span>${esc(tx(c))}</span></button>`).join('')}</div>
        <h3 class="cp-h">${L('Other cities', 'மற்ற நகரங்கள்')}</h3><div class="cp-list">${(showAll ? others : others.slice(0, 15)).map((c) => `<button type="button" data-c="${c.id}" aria-pressed="${ctx.app.city() === c.id}">${esc(tx(c))}</button>`).join('')}</div>
        <button type="button" class="link cp-all" id="cpAll">${showAll ? L('Hide all cities', 'மறை') : L('View all cities', 'அனைத்து நகரங்கள்')}</button>`}</div>`;
  };
  let showAll = false;
  ctx.openSheet(draw(), (sh) => {
    sh.closest('.sheet-card')?.classList.add('wide');
    const redraw = () => { const q = sh.querySelector('#cpQ').value; sh.innerHTML = draw(q, showAll); const i = sh.querySelector('#cpQ'); i.focus(); i.setSelectionRange(q.length, q.length); };
    sh.addEventListener('input', (e) => { if (e.target.id === 'cpQ') redraw(); });
    sh.addEventListener('click', (e) => {
      if (e.target.closest('#cpAll')) { showAll = !showAll; redraw(); return; }
      if (e.target.closest('#cpLoc')) { ctx.closeSheet(); ctx.locate(); return; }
      const b = e.target.closest('[data-c]'); if (!b) return;
      const c = cityById(b.dataset.c);
      if (LIVE.userLoc && nearestCity(LIVE.userLoc)?.[0].id !== c.id) { LIVE.userLoc = null; ctx.store.set('loc', null); }
      ctx.app.setCity(c.id); ctx.closeSheet(); toast(L(`Your location is updated to ${c.en}`, `உங்கள் நகரம்: ${tx(c)}`)); ctx.route();
    });
  });
  if (first && !ctx.S.city) ctx.app.setCity('chennai');
}

/* ---------- footer ---------- */
export function footerHTML(ctx) {
  const city = cityById(ctx.app.city());
  const now = MOVIES.filter(isNowShowing), soon = MOVIES.filter((m) => !isNowShowing(m));
  const genres = [...new Set(MOVIES.flatMap((m) => m.genres))].sort().slice(0, 14), langs = [...new Set(MOVIES.flatMap((m) => m.langs || [m.lang]))].sort();
  const ths = theatresFor(city.id).slice(0, 8);
  const links = (title, items) => items.length ? `<div class="sf-col"><b>${title}</b><p>${items.join('<i>|</i>')}</p></div>` : '';
  return `<section class="lys"><span>${icon('speaker')}<b>${L('List your show', 'உங்கள் நிகழ்வு')}</b> ${L('Got a show, event, activity or a great experience? Partner with us and get listed on Lumen.', 'எங்களுடன் இணையுங்கள்.')}</span><a class="btn primary sm" href="#list-your-show">${L('Contact today!', 'தொடர்பு கொள்ளுங்கள்')}</a></section>
  <section class="svc"><a href="#contact">${icon('user')}<span>${L('24/7 customer care', '24/7 உதவி')}</span></a><button type="button" id="ftResend">${icon('ticket')}<span>${L('Resend booking confirmation', 'உறுதிப்படுத்தலை மீண்டும் அனுப்பு')}</span></button><button type="button" id="ftNews">${icon('mail')}<span>${L('Subscribe to the newsletter', 'செய்திமடல்')}</span></button></section>
  <footer class="sfoot">
    ${links(L(`Movies now showing in ${tx(city)}`, `${tx(city)}-இல் இப்போது`), now.map((m) => `<a href="#movie-${m.id}">${esc(m.title)}</a>`))}
    ${links(L('Upcoming movies', 'வரவிருக்கும் படங்கள்'), soon.map((m) => `<a href="#movie-${m.id}">${esc(m.title)}</a>`))}
    ${links(L('Movies by genre', 'வகைகள்'), genres.map((g) => `<a href="#movies" data-fg="${esc(g)}">${esc(g)} movies</a>`))}
    ${links(L('Movies by language', 'மொழிகள்'), langs.map((l) => `<a href="#movies" data-fl="${esc(l)}">${esc(l)} movies</a>`))}
    ${links(L(`Top cinemas in ${tx(city)}`, `${tx(city)} திரையரங்குகள்`), ths.map((t) => `<a href="#theatre-${t.id}">${esc(t.name)}, ${esc(t.area)}</a>`))}
    ${links(L('Events, plays & more', 'நிகழ்வுகள்'), EVENT_CATS.map((c) => `<a href="#cat-${c.id}">${esc(tx(c))} in ${esc(city.en)}</a>`))}
    ${links(L('Help', 'உதவி'), [['contact', 'Contact us'], ['refunds', 'Cancellation & refunds'], ['terms', 'Terms & conditions'], ['privacy', 'Privacy policy'], ['tickets', 'My tickets']].map(([h, t]) => `<a href="#${h}">${t}</a>`))}
    ${links(L('Lumen exclusives', 'Lumen சிறப்புகள்'), [['offers', 'Offers'], ['giftcards', 'Gift cards'], ['corporates', 'Corporate vouchers'], ['list-your-show', 'List your show'], ['register', 'Register your theatre'], ['login', 'Lumen Business sign in']].map(([h, t]) => `<a href="#${h}">${t}</a>`))}
    <div class="sf-brand"><a class="logo" href="#home"><span class="logo-dot"></span>Lumen</a><p>${L('See the view from your seat before you book.', 'பதிவுக்கு முன் உங்கள் இருக்கையிலிருந்து காட்சி.')}</p>
      <small>© ${new Date().getFullYear()} ${esc(LIVE.contact?.company || 'Lumen Cinemas')}. ${L('Movies, theatres and events shown here are demo data unless marked by a partner.', '')} ${ctx.db.mode === 'server' ? '' : '· Demo data saved in this browser'}</small></div>
  </footer>`;
}
export function bindFooter(root, ctx) {
  root.querySelector('#ftResend')?.addEventListener('click', () => ctx.openSheet(`<h2 class="sh-t">${icon('ticket')}${L('Resend booking confirmation', 'மீண்டும் அனுப்பு')}</h2>
    <form id="rsF" class="snacks" novalidate><input class="input" name="id" placeholder="Booking ID, e.g. LMABC12" autocomplete="off"><input class="input" name="contact" placeholder="Email or mobile used for booking"><p class="err" id="rsE"></p><button class="btn primary block" type="submit">${L('Send again', 'அனுப்பு')}</button></form>`, (sh) => {
    sh.querySelector('#rsF').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target).entries()); if (ctx.db.mode !== 'server') { sh.querySelector('#rsE').textContent = 'Works on the live Lumen site.'; return; } try { await ctx.db.resend(f.id, f.contact); e.target.innerHTML = `<div class="notice ok">${icon('check')}<span>If the details match a booking, we have sent it again by email and WhatsApp.</span></div>`; } catch (x) { sh.querySelector('#rsE').textContent = x.message; } });
  }));
  root.querySelector('#ftNews')?.addEventListener('click', () => ctx.openSheet(`<h2 class="sh-t">${icon('mail')}${L('Newsletter', 'செய்திமடல்')}</h2><p class="muted">${L('New releases, offers and events in your city. No spam.', 'புதிய வெளியீடுகள், சலுகைகள்.')}</p>
    <form id="nlF" class="snacks" novalidate><input class="input" name="email" type="email" placeholder="you@example.com"><p class="err" id="nlE"></p><button class="btn primary block" type="submit">${L('Subscribe', 'சேர்')}</button></form>`, (sh) => {
    sh.querySelector('#nlF').addEventListener('submit', async (e) => { e.preventDefault(); if (ctx.db.mode !== 'server') { sh.querySelector('#nlE').textContent = 'Works on the live Lumen site.'; return; } try { await ctx.db.subscribe(new FormData(e.target).get('email'), ctx.app.city()); e.target.innerHTML = `<div class="notice ok">${icon('check')}<span>Subscribed. Thank you!</span></div>`; } catch (x) { sh.querySelector('#nlE').textContent = x.message; } });
  }));
  root.querySelectorAll('[data-fg],[data-fl]').forEach((a) => a.addEventListener('click', () => { F.movies = { types: [], langs: a.dataset.fl ? [a.dataset.fl] : [], genres: a.dataset.fg ? [a.dataset.fg] : [], formats: [], more: [], price: [], date: '', from: '', to: '', status: 'now', venue: '' }; }));
}
