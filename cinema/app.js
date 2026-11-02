// Lumen Cinemas: screens, routing and the full booking flow.
import {
  CITIES, MOVIES, CLASS_META, SNACKS, FEE_PER_TICKET, CONV_FEE, GST, COMMISSION, HOLD_MINUTES, OFFERS, EVENT_CATS, EVENTS, PREMIERES,
  movieById, eventById, premiereById, isNowShowing, theatresFor, theatreById, showsFor, showById, today, addDays, dayKey, fromKey,
  hmLabel, partOfDay, releaseDate, mulberry32, hash, leavingSoon, liveBanners, nearestCity, LIVE,
} from './data.js';
import { HALLS, getLayout, buildLayout, layoutOf, pricesOf, layoutFor, pricesFor, hallName, setCustomLayouts, customFor, specOfHall, rowsToText, textToRows, parsePlan, REC_CLASSES, bookedFor, bestBlock, blockAround, scoreLabel, scoreColor } from './layout.js';
import { mountMap } from './map2d.js';
import { t, tx, state, icon, inr, esc, clsName, poster, posterArt, ticketArt, $, $$, toast, fmtDate, compact, deviceTier } from './ui.js';
import { loginView, forgotView, registerView, openAccount, gate } from './auth.js';
import { customerSignIn, customerAccount, invoiceView, contactView, policyView } from './pages.js';
import { createAgent } from './agent.js';
import { adminView as renderAdmin } from './admin.js';
import { partnerView as renderPartner } from './partner.js';
import { consoleView as renderConsole } from './console.js';
import { db } from './db.js';

const TIER = deviceTier();
const view = $('#view');
const store = {
  get(k, d) { try { const v = localStorage.getItem('lumen.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lumen.' + k, JSON.stringify(v)); } catch (e) {} },
};
const S = {
  city: store.get('city', null),
  notify: new Set(store.get('notify', [])),
  favs: new Set(store.get('favs', [])),
  contact: store.get('contact', { email: '', phone: '' }),
  points: store.get('points', 240),
  langFilter: 'all',
};
const holds = new Map(); // showId -> { seats, until }
Object.defineProperty(S, 'bookings', { get: () => db.myBookings() });
let cleanup = [];
const onLeave = (fn) => cleanup.push(fn);
const money = (v) => '₹' + (Math.round(v * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
const endTime = (hm, mins) => { const tot = +hm.slice(0, 2) * 60 + +hm.slice(2) + mins + 15; const h = Math.floor(tot / 60) % 24, m = tot % 60; return hmLabel(String(h).padStart(2, '0') + String(m).padStart(2, '0')); };
// How full a show really is, from the same seat map the customer sees
const fillCache = new Map();
function fillOf(show) {
  const key = show.id + '|' + db.allBookings().length;
  if (fillCache.has(key)) return fillCache.get(key);
  const lay = layoutOf(show), booked = bookedFor(show, lay, app.mySeats(show.id));
  const sellable = lay.seats.filter((x) => !x.disabled), taken = sellable.filter((x) => booked.has(x.id)).length;
  const k = sellable.length ? taken / sellable.length : 1;
  const st = taken >= sellable.length ? 'full' : k >= 0.85 ? 'almost' : k >= 0.6 ? 'fast' : 'avail';
  const out = { st, left: sellable.length - taken, k };
  if (fillCache.size > 500) fillCache.clear();
  fillCache.set(key, out); return out;
}
const timeTag = (s, inner, extra = '') => { const f = fillOf(s); return f.st === 'full' ? `<span class="time full" aria-disabled="true" title="Sold out">${inner}<small class="so">Sold out</small></span>` : `<a class="time ${extra || f.st}" href="#show-${s.id}" title="${f.left} seats left">${inner}</a>`; };
const showStart = (show) => { const d = fromKey(show.dk); d.setHours(+show.hm.slice(0, 2), +show.hm.slice(2), 0, 0); return d; };
const LANG3 = { Tamil: 'TAM', English: 'ENG', Telugu: 'TEL', Hindi: 'HIN', Malayalam: 'MAL' };

/* ---------- app API (also used by the assistant) ---------- */
const app = {
  city: () => S.city || 'chennai',
  setCity(id) { S.city = id; store.set('city', id); renderHeader(); },
  setNotify(id, on) { on ? S.notify.add(id) : S.notify.delete(id); store.set('notify', [...S.notify]); },
  // seats sold for a show (every booking this app knows about)
  mySeats(showId) { return db.allBookings().filter((b) => b.showId === showId && !b.cancelled).flatMap((b) => b.seats || []); },
  async hold(showId, seats) { const r = await db.hold(showId, seats, HOLD_MINUTES); if (r.ok) holds.set(showId, { seats, until: r.until || Date.now() + HOLD_MINUTES * 60000 }); return r; },
  release(showId) { holds.delete(showId); db.release(showId); },
  // Quick booking used by the voice assistant (holds, then pays with UPI, no snacks)
  async book(show, seats, snacks = {}, method = 'UPI') {
    const h = await app.hold(show.id, seats); if (!h.ok) return null;
    const order = movieOrder(show, seats, snacks);
    const b = await saveBooking(order, method, priceOrder(order, { donate: false, offer: null }).total);
    app.release(show.id); return b;
  },
  go(route) { location.hash = route; },
  openSeats(showId, seatIds) { pendingPick = { showId, seatIds }; agent.close(); location.hash = 'show-' + showId; },
};
let pendingPick = null;

/* ---------- header ---------- */
const CATS = [['home', 'Movies', 'படங்கள்'], ['cat-stream', 'Stream', 'ஸ்ட்ரீம்'], ...EVENT_CATS.map((c) => ['cat-' + c.id, c.en, c.ta])];
function renderHeader() {
  const c = CITIES.find((x) => x.id === app.city());
  $('#cityLbl').textContent = tx(c);
  $('#langBtn').textContent = t('lang_btn');
  $('#searchBtn').setAttribute('aria-label', t('search'));
  const n = S.bookings.filter((b) => !b.cancelled).length;
  $('#ticketsBtn').innerHTML = `${icon('ticket')}<span class="hide-sm">${t('my_tickets')}</span>${n ? `<i class="badge">${n}</i>` : ''}`;
  $('#askFab').innerHTML = `${icon('mic')}<span>${t('voice')}</span>`;
  // Account button: sign in for customers (mobile OTP), or the signed-in person's account
  const me = db.me; $('#acctBtn').hidden = db.mode !== 'server' && !me;
  $('#acctBtn').classList.toggle('icon-only', !!me);
  $('#acctBtn').innerHTML = me ? icon('user') : `${icon('user')}<span class="hide-sm">${state.lang === 'ta' ? 'உள்நுழை' : 'Sign in'}</span>`;
  $('#acctBtn').setAttribute('aria-label', me ? `Account: ${me.name || me.phone || me.email}` : 'Sign in');
  const cur = (location.hash.slice(1) || 'home');
  $('#cats').innerHTML = CATS.map(([r, en, ta]) => `<a href="#${r}" ${cur === r || (r === 'home' && /^(movie|shows|show)-/.test(cur)) ? 'aria-current="page"' : ''}>${state.lang === 'ta' ? ta : en}</a>`).join('');
  document.documentElement.lang = state.lang === 'ta' ? 'ta' : 'en';
}

/* ---------- router ---------- */
function route() {
  cleanup.forEach((f) => { try { f(); } catch (e) {} }); cleanup = [];
  const h = location.hash.slice(1) || 'home';
  let m;
  window.scrollTo(0, 0);
  closeSheet();
  renderHeader();
  $('#askFab').hidden = !(h === 'home' || /^(movie|shows)-/.test(h));
  if (h === 'home') return homeView();
  if ((m = /^login(?:-(.+))?$/.exec(h))) return loginView(view, panelCtx(), m[1] ? '#' + decodeURIComponent(m[1]) : '');
  if (h === 'forgot') return forgotView(view, panelCtx());
  if ((m = /^invoice-([A-Z0-9]+)$/.exec(h))) { const b = S.bookings.find((x) => x.id === m[1]); return b ? invoiceView(view, b) : ticketsView(); }
  if (h === 'contact') return contactView(view, panelCtx(), S.bookings);
  if (['terms', 'privacy', 'refunds'].includes(h)) return policyView(view, h);
  if (h === 'register-pay') return registerView(view, panelCtx(), '@pay');
  if ((m = /^register(?:-verify-(.+))?$/.exec(h))) return registerView(view, panelCtx(), m[1] ? decodeURIComponent(m[1]) : '');
  if ((m = /^movie-([a-z0-9]+)$/.exec(h))) return movieView(m[1]);
  if ((m = /^shows-([a-z0-9]+)$/.exec(h))) return showsView(m[1]);
  if ((m = /^show-([a-z0-9]+)$/.exec(h))) return seatsView(m[1]);
  if (h === 'pay') return payView();
  if ((m = /^theatre-(c\d+t\d+)$/.exec(h))) return theatreView(m[1]);
  if ((m = /^ticket-([A-Z0-9]+)$/.exec(h))) return ticketView(m[1]);
  if (h === 'tickets') return ticketsView();
  if ((m = /^cat-([a-z]+)$/.exec(h))) return catView(m[1]);
  if ((m = /^event-([a-z0-9]+)$/.exec(h))) return eventView(m[1]);
  if ((m = /^premiere-([a-z0-9]+)$/.exec(h))) return premiereView(m[1]);
  if (h === 'admin') return adminView(null);
  if ((m = /^admin-(c\d+t\d+s\d+)$/.exec(h))) return adminView(m[1]);
  if ((m = /^partner(?:-(c\d+t\d+))?(?:-([a-z]+))?$/.exec(h))) return renderPartner(view, m[1] || null, m[2] || 'overview', panelCtx());
  if ((m = /^console(?:-([a-z]+))?$/.exec(h))) return renderConsole(view, m[1] || 'overview', panelCtx());
  homeView();
}

/* ---------- home ---------- */
const L = (en, ta) => (state.lang === 'ta' && ta ? ta : en);
const daysAgo = (m) => (m.rel === 0 ? L('Out today', 'இன்று வெளியீடு') : m.rel === -1 ? L('Released yesterday', 'நேற்று வெளியீடு') : L(`Released ${-m.rel} days ago`, `${-m.rel} நாள் முன் வெளியீடு`));
const leftLabel = (m) => (m.left === 1 ? L('Last day today', 'இன்றே கடைசி நாள்') : L(`Last ${m.left} days`, `கடைசி ${m.left} நாட்கள்`));
function card(m, href = `#movie-${m.id}`, tag = '', sub = '') {
  const up = m.rel > 0, leaving = leavingSoon(m);
  return `<a class="card" href="${href}">
    <div class="poster">${poster(m)}${up ? `<span class="pill-date">${fmtDate(releaseDate(m), true)}</span>` : m.rating ? `<span class="pill-rate">${icon('star')}${m.rating.toFixed(1)}</span>` : ''}${m.imax ? '<span class="pill-imax">IMAX</span>' : ''}${leaving ? `<span class="pill-leave">${icon('clock')}${leftLabel(m)}</span>` : tag ? `<span class="pill-tag">${tag}</span>` : ''}</div>
    <div class="card-t">${esc(m.title)}</div>
    <div class="card-m">${sub ? esc(sub) : `${esc(m.lang)} · ${esc((m.genres || [])[0] || '')}`}</div></a>`;
}
function row(title, items, sub = '', id = '') {
  if (!items.length) return '';
  return `<section class="row"${id ? ` id="${id}"` : ''}><div class="row-h"><h2>${esc(title)}</h2>${sub ? `<small>${esc(sub)}</small>` : ''}</div><div class="rail">${items.join('')}</div></section>`;
}
const catCount = (id) => EVENTS.filter((e) => e.cat === id).length;
// Slides for the home carousel: banners approved by Lumen first, then movies with an uploaded banner, then the top movie
function slides(city, now) {
  const out = liveBanners('home', { cityId: city.id }).map((b) => {
    const mv = b.movieId && movieById(b.movieId);
    return { img: b.image, title: b.title, sub: b.sub, href: mv ? `#movie-${mv.id}` : b.theatreId ? `#theatre-${b.theatreId}` : '#home', by: b.theatreId ? theatreById(b.theatreId)?.name : '', book: mv && isNowShowing(mv) ? mv.id : '' };
  });
  for (const m of now.filter((x) => x.banner)) out.push({ img: m.banner, title: m.title, sub: `${m.lang} · ${m.cert} · ${mins(m.mins)}`, href: `#movie-${m.id}`, book: m.id, trailer: m.trailer ? m.id : '' });
  // Events with a picture are featured too
  for (const e of EVENTS.filter((x) => x.img)) out.push({ img: e.img, title: e.title, sub: `${e.kind} · ${fmtDate(addDays(today(), e.day))} · ${hmLabel(e.hm)} · ${e.venue}`, href: `#event-${e.id}`, by: L('Live event', 'நேரலை நிகழ்வு'), cta: L('Get tickets', 'டிக்கெட் வாங்க') });
  return out.slice(0, 6);
}
function homeView() {
  const city = CITIES.find((c) => c.id === app.city());
  const pass = (m) => S.langFilter === 'all' || m.lang === S.langFilter || (m.langs || []).includes(S.langFilter);
  const now = MOVIES.filter((m) => isNowShowing(m) && pass(m)).sort((a, b) => b.rating * Math.log(b.votes + 2) - a.rating * Math.log(a.votes + 2));
  const soon = MOVIES.filter((m) => !isNowShowing(m) && pass(m)).sort((a, b) => a.rel - b.rel);
  const fresh = now.filter((m) => m.rel >= -14).sort((a, b) => b.rel - a.rel);
  const leaving = now.filter(leavingSoon).sort((a, b) => a.left - b.left);
  const hero = now[0] || MOVIES[0];
  const langs = ['all', ...new Set(MOVIES.flatMap((m) => m.langs || [m.lang]))];
  const ths = theatresFor(city.id).sort((a, b) => a.km - b.km);
  const sl = slides(city, now);
  const todayShows = showsFor({ cityId: city.id, dk: dayKey(today()) });
  const heroHTML = sl.length ? `<section class="carousel" aria-roledescription="carousel" aria-label="Featured">
      <div class="car-track" id="carTrack">${sl.map((x, i) => `<article class="slide" aria-label="${i + 1} of ${sl.length}"><img src="${esc(x.img)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">
        <div class="slide-txt">${x.by ? `<small class="eyebrow">${esc(x.by)}</small>` : ''}<h2>${esc(x.title)}</h2>${x.sub ? `<p>${esc(x.sub)}</p>` : ''}
        <div class="hero-cta">${x.book ? `<button type="button" class="btn primary" data-book="${x.book}">${icon('ticket')}${t('book')}</button>` : `<a class="btn primary" href="${x.href}">${x.cta ? icon('ticket') + x.cta : L('See more', 'மேலும்') + icon('right')}</a>`}${x.trailer ? `<button type="button" class="btn glass" data-trailer="${x.trailer}">${icon('play')}${L('Trailer', 'டிரெய்லர்')}</button>` : ''}</div></div></article>`).join('')}</div>
      ${sl.length > 1 ? `<div class="car-dots">${sl.map((_, i) => `<button type="button" data-slide="${i}" aria-label="Slide ${i + 1}" aria-current="${i === 0}"></button>`).join('')}</div>` : ''}</section>`
    : `<section class="hero" style="--c1:${hero.c1};--c2:${hero.c2}">
      <div class="hero-art">${poster(hero, { big: true })}</div>
      <div class="hero-txt">
        <p class="eyebrow">${t('now')} · ${esc(tx(city))}</p>
        <h1>${esc(hero.title)}</h1>
        <p class="meta">${icon('star')} ${hero.rating.toFixed(1)} · ${esc(hero.lang)} · ${esc(hero.cert)} · ${mins(hero.mins)}</p>
        <p class="about">${esc(hero.about)}</p>
        <div class="hero-cta"><button type="button" class="btn primary" data-book="${hero.id}">${icon('ticket')}${t('book')}</button>
        ${hero.trailer ? `<button type="button" class="btn ghost" data-trailer="${hero.id}">${icon('play')}${L('Trailer', 'டிரெய்லர்')}</button>` : `<button type="button" class="btn ghost" data-ask="${esc(hero.title)}">${icon('mic')}${t('voice')}</button>`}</div>
      </div>
    </section>`;
  view.innerHTML = `
    ${heroHTML}
    <div class="locbar"><button type="button" class="loc-btn" id="locBtn">${icon('locate')}<span><b>${LIVE.userLoc ? L('Using your location', 'உங்கள் இருப்பிடம்') : L('Use my current location', 'என் இருப்பிடத்தைப் பயன்படுத்து')}</b><small>${LIVE.userLoc ? L(`Distances from you · ${tx(city)}`, `உங்களிடமிருந்து தூரம் · ${tx(city)}`) : L('See the nearest theatres first', 'அருகிலுள்ள திரையரங்குகள் முதலில்')}</small></span></button>
      <button type="button" class="ask-card" data-ask=""><span class="ask-ic">${icon('mic')}</span><span class="ask-txt"><b>${t('voice')}</b><small>“${state.lang === 'ta' ? 'நாளை மாலை Kaalam 2 டிக்கெட்' : '2 tickets for Kaalam tomorrow evening'}”</small></span></button></div>
    <div class="filters" role="group" aria-label="Language">${langs.map((l) => `<button type="button" class="fchip" data-lang="${l}" aria-pressed="${S.langFilter === l}">${l === 'all' ? t('all') : esc(l)}</button>`).join('')}</div>
    ${fresh.length ? `<section class="row"><div class="row-h"><h2>${L('New releases', 'புதிய வெளியீடுகள்')}</h2><small>${L('In cinemas from the last 2 weeks', 'கடந்த 2 வாரங்களில் வெளியானவை')}</small></div>
      <div class="new-grid">${fresh.slice(0, 4).map((m) => `<article class="nr"><a class="nr-post" href="#movie-${m.id}" aria-label="${esc(m.title)}">${poster(m)}</a><span class="nr-txt"><span class="nr-tag">${m.rel === 0 ? `<i class="dot"></i>` : ''}${esc(daysAgo(m))}</span><a href="#movie-${m.id}"><b>${esc(m.title)}</b></a><small>${esc(m.lang)} · ${esc(m.cert)} · ${mins(m.mins)}</small>
        <small>${m.rating ? `${icon('star')} ${m.rating.toFixed(1)} · ${compact(m.votes)} ${L('votes', 'வாக்குகள்')}` : esc(m.genres.join(', '))}</small><span class="nr-act"><button type="button" class="btn primary sm" data-book="${m.id}">${t('book')}</button>${m.trailer ? `<button type="button" class="btn ghost sm" data-trailer="${m.id}">${icon('play')}${L('Trailer', 'டிரெய்லர்')}</button>` : ''}</span></span></article>`).join('')}</div></section>` : ''}
    ${row(L('Last few days in cinemas', 'திரையரங்கில் கடைசி சில நாட்கள்'), leaving.map((m) => card(m)), L('Catch them before they leave', 'போவதற்கு முன் பாருங்கள்'), 'leaving')}
    ${row(t('now'), now.map((m) => card(m)))}
    ${row(t('soon'), soon.map((m) => card(m)))}
    ${row(t('imax'), now.filter((m) => m.imax).map((m) => card(m)))}
    <section class="row"><div class="row-h"><h2>${state.lang === 'ta' ? 'நேரலை நிகழ்வுகள்' : 'Live events'}</h2></div><div class="rail">${EVENT_CATS.map((c) => `<a class="ecard" href="#cat-${c.id}" style="--c1:${c.c1};--c2:${c.c2}"><span class="e-ic">${icon(c.icon)}</span><b>${esc(tx(c))}</b><small>${catCount(c.id)}+ ${state.lang === 'ta' ? 'நிகழ்வுகள்' : 'events'}</small></a>`).join('')}</div></section>
    ${row(t('family'), now.filter((m) => m.genres.some((g) => ['Family', 'Animation', 'Comedy'].includes(g))).map((m) => card(m)))}
    ${row('Premiere', PREMIERES.map((p) => card(p, `#premiere-${p.id}`, 'PREMIERE')), state.lang === 'ta' ? 'வீட்டிலேயே புதுப் படங்கள்' : 'New movies to watch at home')}
    <section class="row"><div class="row-h"><h2>${t('near')}</h2><small>${LIVE.userLoc ? L('Nearest first, from your location', 'உங்கள் இருப்பிடத்திலிருந்து') : esc(tx(city))}</small></div>
      <div class="rail th-rail">${ths.map((th) => theatreCard(th, todayShows.filter((s) => s.theatreId === th.id).length)).join('')}</div></section>
    <section class="biz">
      <div class="biz-txt"><small class="eyebrow">${L('For theatres', 'திரையரங்குகளுக்கு')}</small><h2>${L('Sell your seats on Lumen', 'Lumen-இல் உங்கள் இருக்கைகளை விற்கவும்')}</h2>
        <ul><li>${icon('grid')}${L('Draw your real seat layout. Customers see the view from every seat in 3D.', 'உண்மையான இருக்கை அமைப்பு, ஒவ்வொரு இருக்கையிலிருந்தும் 3D காட்சி.')}</li><li>${icon('clock')}${L('Set your own shows and prices in minutes.', 'காட்சிகள், விலைகளை நீங்களே அமைக்கவும்.')}</li><li>${icon('image')}${L('Upload photos and banners to bring people in.', 'புகைப்படங்கள், பேனர்கள் பதிவேற்றவும்.')}</li><li>${icon('ticket')}${L('Weekly payouts to your bank account.', 'வாரந்தோறும் வங்கிக் கணக்கில் பணம்.')}</li></ul>
        <div class="hero-cta"><a class="btn primary" href="#register">${L('Register your theatre', 'பதிவு செய்')}${icon('right')}</a><a class="btn glass" href="#login">${icon('lock')}${L('Partner sign in', 'உள்நுழை')}</a></div></div>
      <div class="biz-art" aria-hidden="true"><svg viewBox="0 0 280 150"><path d="M30 18q110-16 220 0" stroke="#ffc72c" stroke-width="3" fill="none"/><path d="M30 18q110-16 220 0" stroke="#ffc72c" stroke-width="14" opacity=".15" fill="none"/><rect x="18" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="0.35"/><rect x="35" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="52" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="69" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="94" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="111" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="0.35"/><rect x="128" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="145" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="162" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="179" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="204" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="0.35"/><rect x="221" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="238" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="255" y="40" width="13" height="11" rx="3" fill="#ffeaa6" opacity="1"/><rect x="18" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="35" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="0.35"/><rect x="52" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="69" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="94" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="111" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="128" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="0.35"/><rect x="145" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="162" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="179" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="204" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="221" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="0.35"/><rect x="238" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="255" y="57" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="18" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="35" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="52" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="0.35"/><rect x="69" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="94" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="111" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="128" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="145" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="0.35"/><rect x="162" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="179" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="204" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="221" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="238" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="0.35"/><rect x="255" y="74" width="13" height="11" rx="3" fill="#ffd966" opacity="1"/><rect x="18" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="35" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="52" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="69" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="0.35"/><rect x="94" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="111" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="128" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="145" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="162" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="0.35"/><rect x="179" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="204" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="221" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="238" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="1"/><rect x="255" y="91" width="13" height="11" rx="3" fill="#ffc72c" opacity="0.35"/><rect x="18" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="35" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="52" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="69" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="94" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="0.35"/><rect x="111" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="128" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="145" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="162" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="179" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="0.35"/><rect x="204" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="221" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="238" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="255" y="108" width="13" height="11" rx="3" fill="#f0b400" opacity="1"/><rect x="18" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="0.35"/><rect x="35" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="52" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="69" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="94" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="111" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="0.35"/><rect x="128" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="145" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="162" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="179" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="204" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="0.35"/><rect x="221" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="238" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><rect x="255" y="125" width="13" height="11" rx="3" fill="#d99a00" opacity="1"/><circle cx="140" cy="118" r="9" fill="#14161f" stroke="#fff" stroke-width="2"/><path d="M135 118l3.5 3.5 6.5-7" stroke="#ffc72c" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg></div></section>
    <footer class="foot">
      <div class="foot-cols">
        <div><a class="logo" href="#home"><span class="logo-dot"></span>Lumen</a><p class="muted">${L('See the view from your seat before you book.', 'பதிவுக்கு முன் உங்கள் இருக்கையிலிருந்து காட்சியைப் பாருங்கள்.')}</p></div>
        <div><b>${L('Movies', 'படங்கள்')}</b><a href="#home">${t('now')}</a><a href="#cat-stream">Premiere</a>${CITIES.map((c) => `<button type="button" class="link" data-city="${c.id}">${esc(tx(c))}</button>`).join('')}</div>
        <div><b>${L('Help', 'உதவி')}</b><a href="#tickets">${t('my_tickets')}</a><button type="button" class="link" data-ask="">${t('voice')}</button><a href="#contact">${L('Contact us', 'தொடர்பு கொள்ள')}</a><a href="#refunds">${L('Cancellation & refunds', 'ரத்து & பணம் திரும்ப')}</a><a href="#terms">${L('Terms', 'விதிமுறைகள்')}</a><a href="#privacy">${L('Privacy', 'தனியுரிமை')}</a></div>
        <div><b>${L('Business', 'வணிகம்')}</b><a href="#register">${L('List your theatre', 'திரையரங்கைச் சேர்')}</a><a href="#login">${L('Partner & admin sign in', 'பங்குதாரர் / நிர்வாகி உள்நுழைவு')}</a></div>
      </div>
      <p class="foot-note">© ${new Date().getFullYear()} Lumen Cinemas · ${L('All movies, theatres and events are fictional demo data. No money is taken.', 'அனைத்தும் மாதிரி தரவு.')} · ${db.mode === 'server' ? L('Live data', 'நேரடி தரவு') : L('Demo data saved in this browser', 'இந்த உலாவியில் சேமிக்கப்பட்ட தரவு')}</p>
    </footer>`;
  view.querySelector('.filters').addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (!b) return; S.langFilter = b.dataset.lang; homeView(); });
  view.querySelector('.foot').addEventListener('click', (e) => { const b = e.target.closest('[data-city]'); if (b) { app.setCity(b.dataset.city); route(); } });
  $('#locBtn').addEventListener('click', locate);
  bindCarousel();
  if (!S.city) setTimeout(() => openCitySheet(true), 300);
}
function bindCarousel() {
  const tr = $('#carTrack'); if (!tr) return;
  const dots = $$('.car-dots button');
  let i = 0, timer = 0;
  const go = (n) => { i = (n + dots.length) % dots.length; tr.scrollTo({ left: tr.clientWidth * i, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  tr.addEventListener('scroll', () => { const n = Math.round(tr.scrollLeft / tr.clientWidth); if (n !== i) i = n; dots.forEach((d, k) => d.setAttribute('aria-current', String(k === n))); }, { passive: true });
  dots.forEach((d, k) => d.addEventListener('click', () => { go(k); restart(); }));
  const restart = () => { clearInterval(timer); if (dots.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { if (!document.hidden) go(i + 1); }, 6000); };
  tr.addEventListener('pointerdown', () => clearInterval(timer));
  restart(); onLeave(() => clearInterval(timer));
}
// Current location: nearest city + real distances to theatres
function locate() {
  if (!navigator.geolocation) { toast(L('Location is not available on this device.', 'இந்த சாதனத்தில் இருப்பிடம் இல்லை.')); return; }
  const btn = $('#locBtn'); if (btn) btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition((p) => {
    const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
    LIVE.userLoc = loc; store.set('loc', { ...loc, at: Date.now() });
    const [c, km] = nearestCity(loc);
    app.setCity(c.id);
    toast(km > 120 ? L(`Lumen is not in your city yet. Showing the nearest: ${c.en} (${Math.round(km)} km).`, `அருகிலுள்ள நகரம்: ${c.ta}`) : L(`Showing theatres near you in ${c.en}`, `${c.ta}-இல் அருகிலுள்ள திரையரங்குகள்`));
    route();
  }, (err) => {
    if (btn) btn.classList.remove('busy');
    toast(err.code === 1 ? L('Location permission was blocked. Allow it in your browser settings, or pick a city.', 'இருப்பிட அனுமதி மறுக்கப்பட்டது. நகரத்தைத் தேர்வு செய்யுங்கள்.') : L('Could not find your location. Pick a city instead.', 'இருப்பிடம் கிடைக்கவில்லை.'));
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}
function theatreCard(th, nShows = null) {
  const fmts = [...new Set(th.screens.map((s) => s.fmt))];
  return `<a class="tcard" href="#theatre-${th.id}"><span class="tcard-img">${th.cover ? `<img src="${esc(th.cover)}" alt="" loading="lazy" decoding="async">` : ticketArt(th.name.split(' ')[0])}<span class="tcard-km">${icon('pin')}${t('km', { k: th.km })}</span></span>
    <span class="tcard-b"><b>${esc(th.name)}</b><small>${esc(th.area)} · ${th.screens.length} ${th.screens.length > 1 ? L('screens', 'திரைகள்') : L('screen', 'திரை')}</small>
    <span class="tcard-tags">${fmts.slice(0, 3).map((f) => `<i>${esc(f)}</i>`).join('')}</span>
    ${nShows != null ? `<small class="tcard-shows">${nShows ? L(`${nShows} shows left today`, `இன்று ${nShows} காட்சிகள்`) : L('No more shows today', 'இன்று காட்சிகள் இல்லை')}</small>` : ''}</span></a>`;
}
function hallGlyph(hall) {
  const lay = getLayout(hall);
  const zs = lay.seats.map((s) => s.z);
  const x0 = -lay.W, w = lay.W * 2, z0 = Math.min(...zs) - 2, h = Math.max(...zs) - z0 + 1;
  const dots = lay.seats.filter((_, i) => i % 3 === 0).map((s) => `<circle cx="${((s.x - x0) / w * 60).toFixed(1)}" cy="${(8 + (s.z - z0) / h * 34).toFixed(1)}" r="1.1" fill="${CLASS_META[s.cls].color}"/>`).join('');
  return `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M8 4q22-4 44 0" stroke="#ffc72c" stroke-width="2" fill="none"/>${dots}</svg>`;
}
// Trailer player (uploaded by Lumen admins)
function openTrailer(id) {
  const m = movieById(id); if (!m?.trailer) return;
  openSheet(`<h2 class="sh-t">${icon('play')}${esc(m.title)}</h2><video class="trailer" src="${esc(m.trailer)}" controls autoplay playsinline preload="metadata"></video>
    ${isNowShowing(m) ? `<button type="button" class="btn primary wide" data-book="${m.id}">${icon('ticket')}${t('book')}</button>` : ''}`, (sh) => {
    const v = sh.querySelector('video'); const stop = () => { v.pause(); v.removeAttribute('src'); v.load(); };
    const obs = new MutationObserver(() => { if ($('#sheet').hidden) { stop(); obs.disconnect(); } }); obs.observe($('#sheet'), { attributes: true, attributeFilter: ['hidden'] });
  });
}
const mins = (n) => t('mins', { h: Math.floor(n / 60), m: n % 60 });

/* ---------- movie details ---------- */
function movieView(id) {
  const m = movieById(id); if (!m) return homeView();
  const up = !isNowShowing(m);
  const more = MOVIES.filter((x) => x.id !== m.id && isNowShowing(x) && x.genres.some((g) => m.genres.includes(g))).slice(0, 8);
  view.innerHTML = `
    <div class="topbar"><a class="iconbtn" href="#home" aria-label="${t('back')}">${icon('back')}</a></div>
    <section class="mhead${m.banner ? ' has-banner' : ''}" style="--c1:${m.c1};--c2:${m.c2}">${m.banner ? `<img class="mh-bg" src="${esc(m.banner)}" alt="" decoding="async">` : ''}
      <div class="mposter">${poster(m, { big: true })}${m.trailer ? `<button type="button" class="mp-play" data-trailer="${m.id}" aria-label="Play trailer">${icon('play')}</button>` : ''}</div>
      <div class="minfo">
        <h1>${esc(m.title)}${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</h1>
        ${up ? `<p class="meta">${t('releases', { d: fmtDate(releaseDate(m)) })} · ${t('interested', { n: compact(m.interest) })}</p>`
             : `<p class="meta">${m.rating ? `<span class="rate">${icon('star')} ${m.rating.toFixed(1)}/10</span> · ${t('votes', { n: compact(m.votes) })} · ` : ''}${esc(daysAgo(m))}</p>`}
        ${leavingSoon(m) ? `<p class="leave-note">${icon('clock')}<span><b>${leftLabel(m)}</b> ${L('in cinemas. Theatres remove this movie after', 'மட்டும். பிறகு திரையரங்குகளில் இருக்காது:')} ${fmtDate(addDays(today(), m.left - 1))}.</span></p>` : ''}
        <div class="tags">${[...(m.langs || [m.lang]), m.cert, mins(m.mins), ...m.genres, ...(m.imax ? ['IMAX'] : [])].map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
        <p class="about">${esc(m.about)}</p>
        <p class="cast"><b>Cast</b> ${m.cast.map(esc).join(', ')}</p>
        <div class="mh-cta">${up ? `<button type="button" class="btn primary" id="notifyBtn">${icon('bell')}${S.notify.has(m.id) ? t('notified') : t('notify')}</button>`
             : `<button type="button" class="btn primary" data-book="${m.id}">${icon('ticket')}${t('book')}</button><button type="button" class="btn ghost" data-ask="${esc(m.title)}">${icon('mic')}${t('voice')}</button>`}${m.trailer ? `<button type="button" class="btn ghost" data-trailer="${m.id}">${icon('play')}${L('Watch trailer', 'டிரெய்லர்')}</button>` : ''}</div>
      </div>
    </section>
    ${row(state.lang === 'ta' ? 'இதுவும் பிடிக்கும்' : 'You might also like', more.map((x) => card(x)))}`;
  $('#notifyBtn')?.addEventListener('click', (e) => { const on = !S.notify.has(m.id); app.setNotify(m.id, on); e.currentTarget.innerHTML = icon('bell') + (on ? t('notified') : t('notify')); toast(on ? t('notified') : '✓'); });
}

// "Select language and format" before showtimes
const SF = { movie: null, lang: null, fmt: 'all', dk: null, price: 'any', part: 'any', sort: 'distance', q: '', late: false, early: false };
function openFormatSheet(movieId) {
  const m = movieById(movieId);
  // Only languages and formats that really have shows in the next 7 days
  const byLang = new Map();
  for (let i = 0; i < 7; i++) showsFor({ cityId: app.city(), dk: dayKey(addDays(today(), i)), movieId }).forEach((s) => { if (!byLang.has(s.lang)) byLang.set(s.lang, new Set()); byLang.get(s.lang).add(s.fmt); });
  const langs = (m.langs || [m.lang]).filter((l) => byLang.has(l));
  openSheet(`<div><small class="muted">${esc(m.title)}</small><h2 class="sh-t">${state.lang === 'ta' ? 'மொழி மற்றும் வடிவத்தைத் தேர்வு செய்யுங்கள்' : 'Select language and format'}</h2></div>
    ${langs.map((l) => `<div class="fmt-lang">${esc(l.toUpperCase())}</div><div class="fmt-row">${[...byLang.get(l)].map((f) => `<button type="button" data-l="${esc(l)}" data-f="${esc(f)}">${esc(f)}</button>`).join('')}${byLang.get(l).size > 1 ? `<button type="button" data-l="${esc(l)}" data-f="all">${state.lang === 'ta' ? 'அனைத்தும்' : 'Select all'}</button>` : ''}</div>`).join('')}
    ${langs.length ? '' : `<p class="muted">${state.lang === 'ta' ? 'இந்த வாரம் உங்கள் நகரத்தில் காட்சிகள் இல்லை.' : 'No shows in your city this week. Try another city.'}</p>`}`,
  (sh) => sh.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    Object.assign(SF, { movie: movieId, lang: b.dataset.l, fmt: b.dataset.f, dk: null });
    closeSheet(); if (location.hash === '#shows-' + movieId) route(); else location.hash = 'shows-' + movieId;
  }));
}

/* ---------- showtimes ---------- */
function showsView(id) {
  const m = movieById(id); if (!m) return homeView();
  if (SF.movie !== id) Object.assign(SF, { movie: id, lang: (m.langs || [m.lang])[0], fmt: 'all', dk: null });
  if (!SF.dk) {
    SF.dk = dayKey(today());
    for (let i = 0; i < 7; i++) { const dk = dayKey(addDays(today(), i)); if (showsFor({ cityId: app.city(), dk, movieId: id }).some((s) => s.lang === SF.lang && (SF.fmt === 'all' || s.fmt === SF.fmt))) { SF.dk = dk; break; } }
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  const sel = (id2, opts, val) => `<label class="dd"><select id="${id2}" aria-label="${id2}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  view.innerHTML = `
    <div class="topbar"><a class="iconbtn" href="#movie-${m.id}" aria-label="${t('back')}">${icon('back')}</a><div class="sb-t"><b>${esc(m.title)} - (${esc(SF.lang)})</b><small>${mins(m.mins)} · ${esc(m.cert)} · ${m.genres.map(esc).join(', ')}</small></div>
      <button type="button" class="btn ghost sm" data-ask="${esc(m.title)}">${icon('mic')}<span class="hide-sm">${t('voice')}</span></button></div>
    <div class="days" role="group" aria-label="Date">${days.map((d, i) => `<button type="button" class="day" data-dk="${dayKey(d)}" aria-pressed="${SF.dk === dayKey(d)}"><small>${i === 0 ? t('today') : d.toLocaleDateString(state.lang === 'ta' ? 'ta-IN' : 'en-IN', { weekday: 'short' })}</small><b>${String(d.getDate()).padStart(2, '0')}</b><small>${d.toLocaleDateString('en-IN', { month: 'short' })}</small></button>`).join('')}</div>
    <div class="filterbar">
      ${sel('fFmt', [['all', `${SF.lang} - ${state.lang === 'ta' ? 'அனைத்து வடிவம்' : 'All formats'}`], ['2D', `${SF.lang} - 2D`], ['IMAX', `${SF.lang} - IMAX`], ['4DX', `${SF.lang} - 4DX`], ['Dolby Atmos', `${SF.lang} - Dolby Atmos`], ['Recliner', `${SF.lang} - Recliner`]], SF.fmt)}
      ${sel('fPrice', [['any', state.lang === 'ta' ? 'விலை வரம்பு' : 'Price range'], ['lo', 'Under ₹200'], ['mid', '₹200 – ₹400'], ['hi', '₹400 +']], SF.price)}
      ${sel('fPart', [['any', state.lang === 'ta' ? 'விருப்ப நேரம்' : 'Preferred time'], ['morning', t('morning')], ['afternoon', t('afternoon')], ['evening', t('evening')], ['night', t('night')]], SF.part)}
      ${sel('fSort', [['distance', state.lang === 'ta' ? 'அருகில் முதலில்' : 'Sort: Nearest'], ['time', 'Sort: Earliest show'], ['price', 'Sort: Lowest price'], ['view', 'Sort: Best view']], SF.sort)}
      <input id="fQ" class="input" style="min-height:38px;max-width:200px" placeholder="${state.lang === 'ta' ? 'திரையரங்கு தேடு' : 'Search theatre'}" value="${esc(SF.q)}">
    </div>
    <div class="filters" style="padding-top:8px">
      <button type="button" class="fchip" id="fLate" aria-pressed="${SF.late}">${icon('clock')}${state.lang === 'ta' ? 'இரவுக் காட்சிகள்' : 'Late night shows'}</button>
      <button type="button" class="fchip" id="fEarly" aria-pressed="${SF.early}">${icon('clock')}${state.lang === 'ta' ? 'அதிகாலைக் காட்சிகள்' : 'Early morning shows'}</button>
    </div>
    <div class="legend-line"><span><i style="background:var(--t-av)"></i>${t('avail').toUpperCase()}</span><span><i style="background:var(--t-fast)"></i>${t('fast').toUpperCase()}</span><span><i style="background:var(--bad)"></i>${t('almost').toUpperCase()}</span><span><i style="background:var(--t-full)"></i>${state.lang === 'ta' ? 'நிரம்பியது' : 'SOLD OUT'}</span></div>
    <div id="theatreList"></div>`;
  const list = $('#theatreList');
  const lowPrice = (s) => Math.min(...Object.values(pricesOf(s)));
  function renderList() {
    let shows = showsFor({ cityId: app.city(), dk: SF.dk, movieId: m.id }).filter((s) => s.lang === SF.lang || !(m.langs || []).length);
    shows = shows.filter((s) => (SF.fmt === 'all' || s.fmt === SF.fmt)
      && (SF.part === 'any' || partOfDay(s.hm) === SF.part)
      && (SF.price === 'any' || (SF.price === 'lo' ? lowPrice(s) < 200 : SF.price === 'mid' ? lowPrice(s) >= 200 && lowPrice(s) <= 400 : lowPrice(s) > 400))
      && (!SF.late || +s.hm >= 2100) && (!SF.early || +s.hm < 1000));
    const byTh = new Map();
    shows.forEach((s) => { if (!byTh.has(s.theatreId)) byTh.set(s.theatreId, []); byTh.get(s.theatreId).push(s); });
    let rows = [...byTh.entries()].map(([tid, ss]) => [theatreById(tid), ss]).filter(([th]) => !SF.q || (th.name + ' ' + th.area).toLowerCase().includes(SF.q.toLowerCase()));
    const sorters = {
      distance: (a, b) => (S.favs.has(b[0].id) - S.favs.has(a[0].id)) || a[0].km - b[0].km,
      time: (a, b) => a[1][0].hm.localeCompare(b[1][0].hm),
      price: (a, b) => Math.min(...a[1].map(lowPrice)) - Math.min(...b[1].map(lowPrice)),
      view: (a, b) => (b[1][0].hall === 'imax') - (a[1][0].hall === 'imax'),
    };
    rows.sort(sorters[SF.sort]);
    if (!rows.length) { list.innerHTML = `<p class="empty">${t('no_shows')}</p>`; return; }
    list.innerHTML = rows.map(([th, ss]) => {
      const halls = [...new Set(ss.map((s) => s.hall))];
      return `<article class="th">
        <div class="th-h"><span class="th-ic">${hallGlyph(halls[0])}</span><div><b>${esc(th.name)}: ${esc(th.area)}</b><small>${t('km', { k: th.km })} · ${halls.map((h) => esc(tx(HALLS[h]))).join(' / ')}</small></div>
          <button type="button" class="fav" data-fav="${th.id}" aria-pressed="${S.favs.has(th.id)}" aria-label="Favourite"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg></button></div>
        <div class="th-feat"><span class="ok">${icon('check')}${state.lang === 'ta' ? 'ரத்து செய்யலாம்' : 'Cancellation available'}</span><span>${icon('popcorn')}${state.lang === 'ta' ? 'உணவு' : 'Food & beverages'}</span><span>${icon('ticket')}M-Ticket</span>${th.amen.includes('Wheelchair access') ? `<span>${icon('wheel')}${t('wheelchair')}</span>` : ''}<a class="link" href="#theatre-${th.id}">${t('hall')} ${icon('right')}</a></div>
        <div class="times">${ss.map((s) => {
          const lo = lowPrice(s) + FEE_PER_TICKET;
          return timeTag(s, `<b>${hmLabel(s.hm)} <small>${LANG3[s.lang] || ''}</small></b><small>${esc(s.fmt)} · ${state.lang === 'ta' ? 'முடிவு' : 'ends'} ${endTime(s.hm, m.mins)}</small><small>${t('from', { p: inr(lo) })}${+s.hm < 1200 ? ' · ☀ saver' : ''}</small>${+s.hm >= 2100 ? `<span class="moon">${icon('clock')}</span>` : ''}`);
        }).join('')}</div></article>`;
    }).join('') + `<p class="note">${icon('check')} ${t('all_in')}</p>`;
  }
  renderList();
  view.querySelector('.days').addEventListener('click', (e) => { const b = e.target.closest('[data-dk]'); if (!b) return; SF.dk = b.dataset.dk; $$('.day', view).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderList(); });
  [['fFmt', 'fmt'], ['fPrice', 'price'], ['fPart', 'part'], ['fSort', 'sort']].forEach(([i, k]) => $('#' + i).addEventListener('change', (e) => { SF[k] = e.target.value; renderList(); }));
  $('#fQ').addEventListener('input', (e) => { SF.q = e.target.value; renderList(); });
  $('#fLate').addEventListener('click', (e) => { SF.late = !SF.late; SF.early = false; e.currentTarget.setAttribute('aria-pressed', SF.late); $('#fEarly').setAttribute('aria-pressed', 'false'); renderList(); });
  $('#fEarly').addEventListener('click', (e) => { SF.early = !SF.early; SF.late = false; e.currentTarget.setAttribute('aria-pressed', SF.early); $('#fLate').setAttribute('aria-pressed', 'false'); renderList(); });
  list.addEventListener('click', (e) => { const f = e.target.closest('[data-fav]'); if (!f) return; const id2 = f.dataset.fav; S.favs.has(id2) ? S.favs.delete(id2) : S.favs.add(id2); store.set('favs', [...S.favs]); f.setAttribute('aria-pressed', S.favs.has(id2)); });
}

/* ---------- theatre ---------- */
function theatreView(id) {
  const th = theatreById(id); if (!th) return homeView();
  const shows = showsFor({ cityId: th.cityId, dk: dayKey(today()), theatreId: th.id });
  const canEdit = db.me && (db.me.role === 'admin' || (db.me.theatreIds || []).includes(th.id));
  view.innerHTML = `<div class="topbar"><button class="iconbtn" type="button" id="thBack" aria-label="${t('back')}">${icon('back')}</button></div>
    <section class="theatre-h"><div class="th-cover">${th.cover ? `<img src="${esc(th.cover)}" alt="${esc(th.name)}" decoding="async">` : ticketArt(th.name)}</div>
    <div class="th-info"><h1>${esc(th.name)}</h1><p class="meta">${icon('pin')} ${esc(th.area)}, ${esc(tx(CITIES.find((c) => c.id === th.cityId)))} · ${t('km', { k: th.km })}${LIVE.userLoc ? ' ' + L('from you', 'உங்களிடமிருந்து') : ''}</p>
    <div class="tags">${th.amen.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
    <a class="link" href="https://www.google.com/maps/search/?api=1&query=${th.lat.toFixed(5)},${th.lng.toFixed(5)}" target="_blank" rel="noopener">${icon('pin')}${L('Directions', 'வழி')}</a></div></section>
    ${th.photos.length ? `<div class="ph-rail">${th.photos.map((p) => `<img src="${esc(p)}" alt="" loading="lazy" decoding="async">`).join('')}</div>` : ''}
    ${liveBanners('theatre', { theatreId: th.id }).concat(liveBanners('home', { theatreId: th.id })).slice(0, 3).map((b) => { const mv = b.movieId && movieById(b.movieId); return `<a class="banner" href="${mv ? '#movie-' + mv.id : '#theatre-' + th.id}"><img src="${esc(b.image)}" alt="" loading="lazy"><div class="banner-txt"><b>${esc(b.title)}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}</div></a>`; }).join('')}
    <h2 class="sec">${t('screens')}</h2>
    <div class="screens">${th.screens.map((sc) => {
      const lay = layoutFor(sc.id, sc.hall);
      const ss = shows.filter((s) => s.screenIdx === sc.idx);
      return `<article class="screen-card"><div class="sc-map">${hallGlyph(sc.hall)}</div>
        <div class="sc-body"><b>${esc(sc.name)} · ${esc(sc.fmt)}</b><small>${esc(tx(hallName(sc.id, sc.hall)))}${customFor(sc.id) ? ' · custom layout' : ''} · ${lay.seats.length} seats · ${lay.rows.length} rows · screen ${lay.screen.w} m wide</small>
        <div class="prices">${Object.entries(pricesFor(sc.id, sc.hall)).map(([k, p]) => `<span><i style="background:${CLASS_META[k].color}"></i>${esc(clsName(k))} ${inr(p)}</span>`).join('')}</div>
        <span class="mh-cta"><button type="button" class="btn ghost sm" data-explore="${sc.idx}">${icon('cube')}${t('explore')}</button>${canEdit ? `<a class="btn ghost sm" href="#admin-${sc.id}">${icon('grid')}${state.lang === 'ta' ? 'இருக்கை அமைப்பைத் திருத்து' : 'Edit seat layout'}</a>` : ''}</span>
        ${ss.length ? `<div class="times">${ss.map((s) => timeTag(s, `<b>${hmLabel(s.hm)}</b><small>${esc(movieById(s.movieId).title)}</small>`)).join('')}</div>` : ''}</div></article>`;
    }).join('')}</div>`;
  $('#thBack').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = 'home')));
  view.querySelector('.screens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-explore]'); if (!b) return;
    const sc = th.screens[+b.dataset.explore];
    const s = shows.find((x) => x.screenIdx === sc.idx);
    const lay = layoutFor(sc.id, sc.hall);
    openViewer({ lay, movie: s ? movieById(s.movieId) : MOVIES[0], booked: s ? bookedFor(s, lay, app.mySeats(s.id)) : new Set(), selected: new Set(), seat: null, title: `${th.name} · ${sc.name}` });
  });
}

/* ---------- seat selection ---------- */
const VEHICLES = [
  '<circle cx="22" cy="44" r="12"/><circle cx="78" cy="44" r="12"/><path d="M22 44l18-24h20l18 24M40 20l-6-8h-8M60 20l4-10h8"/>',
  '<circle cx="24" cy="46" r="10"/><circle cx="80" cy="46" r="10"/><path d="M24 46h20l10-20h16l10 20M54 26l-4-14h-8M70 26c8 0 12 6 12 14"/>',
  '<rect x="14" y="16" width="70" height="28" rx="10"/><circle cx="30" cy="48" r="8"/><circle cx="72" cy="48" r="8"/><path d="M84 30h8v14"/>',
  '<path d="M8 40v-8l12-14h44l14 14h12v8z"/><circle cx="28" cy="44" r="8"/><circle cx="74" cy="44" r="8"/><path d="M24 30h52"/>',
  '<rect x="6" y="12" width="86" height="30" rx="6"/><circle cx="26" cy="46" r="8"/><circle cx="74" cy="46" r="8"/><path d="M6 26h86M30 12v14M52 12v14M74 12v14"/>',
];
const vehicleFor = (n) => VEHICLES[n <= 1 ? 0 : n === 2 ? 1 : n === 3 ? 2 : n <= 5 ? 3 : 4];
function seatsView(showId) {
  const show = showById(showId);
  if (!show) { toast('This show has already started or is no longer available.'); return homeView(); }
  const m = movieById(show.movieId), th = theatreById(show.theatreId), lay = layoutOf(show);
  const prices = pricesOf(show);
  const booked = bookedFor(show, lay, app.mySeats(show.id));
  const selected = new Set();
  let count = 0, focus = null, viewMode = 'class';
  const best = new Set([...lay.seats].sort((a, b) => b.score - a.score).slice(0, Math.round(lay.seats.length * 0.12)).map((s) => s.id));
  const sameDay = showsFor({ cityId: th.cityId, dk: show.dk, movieId: m.id, theatreId: th.id }).filter((s) => s.screenIdx === show.screenIdx);
  const d = fromKey(show.dk);
  view.innerHTML = `
    <div class="topbar seatbar"><a class="iconbtn" href="#shows-${m.id}" aria-label="${t('back')}">${icon('back')}</a>
      <div class="sb-t"><b>${esc(m.title)} (${esc(show.fmt)}) - ${esc(show.lang)}</b><small>${esc(th.name)}: ${esc(th.area)} | ${fmtDate(d)} | ${hmLabel(show.hm)}</small></div>
      <button type="button" class="btn ghost sm" id="countBtn"></button></div>
    <div class="times inline">${sameDay.map((s) => timeTag(s, `<b>${hmLabel(s.hm)}</b><small>${esc(s.fmt)}</small>`, s.id === show.id ? 'on' : '')).join('')}</div>
    <div class="seat-layout">
      <section class="map-card">
        <div class="map-tools">
          <div class="seg dim" id="dimSeg" role="group" aria-label="2D or 3D"><button type="button" data-dim="2d" aria-pressed="true">${icon('grid')}2D</button><button type="button" data-dim="3d" aria-pressed="false">${icon('cube')}3D</button></div>
          <div class="seg" id="modeSeg" role="group"><button type="button" data-mode="class" aria-pressed="true">${t('by_class')}</button><button type="button" data-mode="view" aria-pressed="false">${icon('eye')}${t('view_quality')}</button></div>
          <div class="zoom" id="zoomBox"><button type="button" class="iconbtn sm" data-z="out" aria-label="Zoom out">${icon('minus')}</button><button type="button" class="iconbtn sm" data-z="in" aria-label="Zoom in">${icon('plus')}</button></div>
        </div>
        <div id="map" class="map"></div>
        <div id="map3d" class="map3d" hidden><div class="m3-host" id="m3Host"></div><div class="pv-score m3-score" id="m3Score">${state.lang === 'ta' ? '3D-யில் இருக்கையைத் தொட்டு தேர்வு செய்யுங்கள்' : 'Tap seats in the hall to pick them. Drag to look around.'}</div>
          <div class="m3-ctl"><div class="seg" id="m3Presets"><button type="button" data-p="overview">${t('v_overview')}</button><button type="button" data-p="front">${t('v_front')}</button><button type="button" data-p="back">${t('v_back')}</button></div><button type="button" class="btn primary sm" id="m3Mine">${icon('eye')}${state.lang === 'ta' ? 'என் இருக்கைப் பார்வை' : 'View from my seat'}</button></div></div>
        <div class="legend" id="legend"></div>
        <div class="offers">${OFFERS.map((o) => `<span><b>${o.code}</b> · ${esc(o.en)}</span>`).join('')}</div>
      </section>
      <aside class="side">
        <div class="preview" id="preview"><div class="pv-host" id="pvHost"></div><div class="pv-empty" id="pvEmpty">${icon('eye')}<span>${t('pick_seats')}</span></div><div class="pv-score" id="pvScore" hidden></div></div>
        <div class="sel"><div class="sel-h"><b>${t('your_seats')}</b><button type="button" class="link" id="clearSel">${t('clear')}</button></div><div class="sel-list" id="selList"></div></div>
        <div class="paybar"><div><b id="totalLbl">${inr(0)}</b><small id="countLbl"></small></div>
          <button type="button" class="btn ghost sm view-btn" id="viewBtn">${icon('eye')}<span></span></button>
          <button type="button" class="btn primary" id="goPay" disabled>${t('continue')}${icon('right')}</button></div>
      </aside>
    </div>`;
  const map = mountMap($('#map'), lay, { booked, selected, prices, best, onTap, onHover: hoverTip });
  onLeave(() => map.destroy());
  function legend() {
    $('#legend').innerHTML = viewMode === 'view'
      ? `<span><i style="background:${scoreColor(95)}"></i>${t('l_perfect')}</span><span><i style="background:${scoreColor(70)}"></i>${t('l_good')}</span><span><i style="background:${scoreColor(40)}"></i>${t('l_poor')}</span><span><i class="lg-b">${icon('person')}</i>${state.lang === 'ta' ? 'விற்றது' : 'Sold'}</span>`
      : Object.entries(prices).map(([k, p]) => `<span><i style="background:${CLASS_META[k].color}"></i>${esc(clsName(k))} ${inr(p)}</span>`).join('') + `<span><i class="lg-b">${icon('person')}</i>${state.lang === 'ta' ? 'விற்றது' : 'Sold'}</span><span><i class="lg-s"></i>${state.lang === 'ta' ? 'சிறந்த பார்வை' : 'Bestseller (best view)'}</span><span><i class="lg-p"></i>${state.lang === 'ta' ? 'தேர்வு' : 'Selected'}</span><span><i class="lg-a">${icon('wheel')}</i>${t('wheelchair')}</span>`;
  }
  legend();
  $('#modeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; viewMode = b.dataset.mode; $$('#modeSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); map.setMode(viewMode); legend(); });
  view.querySelector('.zoom').addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (b) map.zoom(b.dataset.z === 'in' ? 1.25 : 0.8); });

  function setSel(ids) {
    const old = [...selected]; selected.clear(); ids.forEach((id) => selected.add(id));
    old.forEach((id) => map.paint(lay.byId.get(id))); ids.forEach((id) => map.paint(lay.byId.get(id)));
    refresh();
  }
  function onTap(seat) {
    if (booked.has(seat.id)) { toast(t('t_taken', { id: seat.id })); return; }
    if (!count) { askCount(() => onTap(seat)); return; }
    const grp = seat.partner ? [seat, seat.partner] : [seat];
    if (selected.has(seat.id)) { setSel([...selected].filter((id) => !grp.some((g) => g.id === id))); focus = [...selected].map((id) => lay.byId.get(id)).pop() || null; updatePreview(); return; }
    let cur = [...selected];
    if (cur.length >= count) cur = [];
    const need = count - cur.length;
    const taken = new Set([...booked, ...cur]);
    let run = blockAround(lay, taken, seat, need);
    if (!run) { for (let k = need - 1; k >= 1 && !run; k--) run = blockAround(lay, taken, seat, k); if (run) toast(t('t_partial', { k: run.length })); }
    if (!run) run = grp.filter((g) => !booked.has(g.id));
    if (run.length + cur.length > count) { toast(t('t_pairs')); count = run.length + cur.length; }
    setSel([...cur, ...run.map((s) => s.id)]);
    focus = seat; updatePreview();
  }
  function total() { const list = [...selected].map((id) => lay.byId.get(id)); return list.reduce((a, s) => a + prices[s.cls], 0); }
  function refresh() {
    const list = [...selected].map((id) => lay.byId.get(id)).sort((a, b) => a.ri - b.ri || a.num - b.num);
    $('#totalLbl').textContent = inr(total());
    $('#countLbl').textContent = (list.length === 1 ? t('ticket_1') : t('tickets_n', { n: list.length })) + (list.length ? ` · + fees ${inr(list.length * FEE_PER_TICKET)}` : '');
    $('#selList').innerHTML = list.length ? list.map((s) => `<button type="button" class="seatchip" data-id="${s.id}" style="--cc:${CLASS_META[s.cls].color}"><b>${s.id}</b><small>${esc(clsName(s.cls))} · ${inr(prices[s.cls])}</small><span class="sc-score" style="--sc:${scoreColor(s.score)}">${icon('eye')}${s.score}</span></button>`).join('') : `<p class="muted">${t('pick_seats')}</p>`;
    $('#goPay').disabled = list.length === 0;
    $('#goPay').innerHTML = list.length ? `${state.lang === 'ta' ? 'செலுத்து' : 'Pay'} ${inr(total())}${icon('right')}` : `${t('continue')}${icon('right')}`;
    $('#countBtn').innerHTML = `${icon('seat')}${count ? `${count} ${state.lang === 'ta' ? 'டிக்கெட்' : count === 1 ? 'Ticket' : 'Tickets'}` : t('how_many')}`;
    const vb = $('#viewBtn'); vb.hidden = !focus; if (focus) vb.querySelector('span').textContent = t('view_from', { id: focus.id });
    $('#clearSel').hidden = !list.length;
    hall?.refresh?.(); hall3?.refresh?.();
  }
  $('#selList').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; focus = lay.byId.get(b.dataset.id); map.focus(focus); updatePreview(true); });
  $('#clearSel').addEventListener('click', () => { setSel([]); focus = null; updatePreview(); });
  $('#countBtn').addEventListener('click', () => askCount());

  // Seat view: inline on wide screens, full screen on phones
  let hall = null, loading = false;
  const wide = () => matchMedia('(min-width: 980px)').matches;
  async function ensureInline() {
    if (hall || loading) return; loading = true;
    $('#pvEmpty').innerHTML = `<span class="spin"></span><span>${t('loading3d')}</span>`;
    try {
      const { mountHall } = await import('./hall3d.js');
      hall = await mountHall($('#pvHost'), lay, { movie: m, booked, selected, tier: TIER });
    } catch (e) { hall = null; }
    loading = false;
    if (!hall) { $('#pvEmpty').innerHTML = `<span>${t('no3d')}</span>`; return; }
    onLeave(() => hall.dispose());
    $('#pvEmpty').hidden = true;
    if (focus) hall.seatView(focus, true); else hall.preset('back');
  }
  const scoreCard = (s) => `<b>${s.id}</b><span class="sc-big" style="--sc:${scoreColor(s.score)}">${s.score}<small>/100</small></span><span>${t('l_' + scoreLabel(s.score))}<small>${t('n_' + s.note)}</small></span>`;
  function updatePreview(open = false) {
    refresh();
    const ps = $('#pvScore');
    if (!focus) { ps.hidden = true; if (!hall) $('#pvEmpty').hidden = false; return; }
    ps.hidden = false; ps.innerHTML = scoreCard(focus);
    if (wide()) { if (hall) hall.seatView(focus); else if (TIER !== 'low' || open) ensureInline(); }
    else if (open) openViewer({ lay, movie: m, booked, selected, seat: focus, title: `${m.title} · ${th.name}` });
  }
  $('#viewBtn').addEventListener('click', () => { if (wide()) ensureInline(); else updatePreview(true); });
  $('#preview').addEventListener('click', () => { if (!hall && wide()) ensureInline(); });
  $('#goPay').addEventListener('click', () => startCheckout(movieOrder(show, [...selected], {})));

  // 2D / 3D: pick seats directly inside the 3D hall
  let hall3 = null, loading3 = false;
  async function set3d(on) {
    $$('#dimSeg button').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.dim === '3d') === on)));
    $('#map').hidden = on; $('#modeSeg').hidden = on; $('#zoomBox').hidden = on; $('#map3d').hidden = !on;
    if (!on) { hall3?.dispose(); hall3 = null; return; }
    if (hall3 || loading3) return;
    if (hall) { hall.dispose(); hall = null; $('#pvEmpty').hidden = false; $('#pvEmpty').innerHTML = `${icon('cube')}<span>${state.lang === 'ta' ? '3D பார்வை இடப்பக்கம் திறந்துள்ளது' : '3D view is open on the left'}</span>`; }
    loading3 = true; $('#m3Host').innerHTML = `<div class="pv-empty"><span class="spin"></span><span>${t('loading3d')}</span></div>`;
    let h = null;
    try { const { mountHall } = await import('./hall3d.js'); $('#m3Host').innerHTML = ''; h = await mountHall($('#m3Host'), lay, { movie: m, booked, selected, tier: TIER, onSeatTap: (s) => { onTap(s); show3Score(s); } }); } catch (e) { h = null; }
    loading3 = false;
    if (!$('#map3d') || $('#map3d').hidden) { h?.dispose(); return; }
    if (!h) { $('#m3Host').innerHTML = `<div class="pv-empty"><span>${t('no3d')}</span></div>`; return; }
    hall3 = h; onLeave(() => { hall3?.dispose(); hall3 = null; });
    hall3.preset('overview');
  }
  function show3Score(s) { $('#m3Score').innerHTML = `<b>${s.id}</b><span class="sc-big" style="--sc:${scoreColor(s.score)}">${s.score}<small>/100</small></span><span>${booked.has(s.id) ? t('booked') : t('l_' + scoreLabel(s.score))}<small>${esc(clsName(s.cls))} · ${inr(prices[s.cls])}</small></span>`; }
  $('#dimSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-dim]'); if (b) set3d(b.dataset.dim === '3d'); });
  $('#m3Presets').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && hall3) hall3.preset(b.dataset.p); });
  $('#m3Mine').addEventListener('click', () => { const s = focus || lay.byId.get([...selected][0]); if (!s) { toast(t('pick_seats')); return; } hall3?.seatView(s); show3Score(s); });

  // Seats sold or being paid for by other people right now (live when the server runs)
  async function syncTaken() {
    const tk = await db.taken(show.id); let changed = false, lost = [];
    for (const id of [...tk.booked, ...tk.held]) if (lay.byId.has(id) && !booked.has(id)) { booked.add(id); changed = true; if (selected.has(id)) { selected.delete(id); lost.push(id); } }
    if (!changed) return;
    map.paintAll(); hall?.refresh?.(); hall3?.refresh?.(); refresh();
    if (lost.length) toast(state.lang === 'ta' ? `${lost.join(', ')} இப்போது வேறொருவரால் எடுக்கப்பட்டது.` : `${lost.join(', ')} was just taken by someone else.`);
  }
  syncTaken(); const takenTimer = setInterval(syncTaken, 15000); onLeave(() => clearInterval(takenTimer));

  function askCount(after) {
    const clsAvail = (k) => { const all = lay.seats.filter((s) => s.cls === k); const free = all.filter((s) => !booked.has(s.id)).length / all.length; return free < 0.1 ? ['bad', state.lang === 'ta' ? 'நிரம்பியது' : 'Almost full'] : free < 0.4 ? ['', t('fast')] : ['ok', t('avail')]; };
    let pick = count || 2;
    const render = () => openSheet(`<h2 class="sh-t" style="justify-content:center;padding:0">${t('how_many')}</h2>
      <div class="count-art"><svg viewBox="0 0 100 60" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${vehicleFor(pick)}</svg></div>
      <div class="count-grid">${Array.from({ length: 10 }, (_, i) => `<button type="button" class="count" data-n="${i + 1}" aria-pressed="${pick === i + 1}">${i + 1}</button>`).join('')}</div>
      <div class="price-list">${Object.entries(prices).map(([k, p]) => { const [c, l] = clsAvail(k); return `<div><span>${esc(clsName(k))}</span><b>${inr(p)}</b><em class="${c}">${esc(l)}</em></div>`; }).join('')}</div>
      <button type="button" class="btn primary block" id="selSeats">${state.lang === 'ta' ? 'இருக்கைகளைத் தேர்வு செய்' : 'Select seats'}</button>`,
    (sh) => sh.addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (b) { pick = +b.dataset.n; render(); return; }
      if (e.target.closest('#selSeats')) {
        count = pick; closeSheet();
        if (after) after();
        else { const run = bestBlock(lay, booked, count); if (run) { setSel(run.map((s) => s.id)); focus = run[Math.floor(run.length / 2)]; map.focus(focus); updatePreview(); } else { toast(t('t_none', { n: count })); refresh(); } }
      }
    }));
    render();
  }
  if (pendingPick && pendingPick.showId === show.id) {
    const ids = pendingPick.seatIds.filter((id) => !booked.has(id)); pendingPick = null;
    count = ids.length; setSel(ids); focus = lay.byId.get(ids[Math.floor(ids.length / 2)]); updatePreview(true);
  } else { refresh(); askCount(); }

  const tipEl = $('#tip');
  function hoverTip(s, e) {
    if (!s) { tipEl.hidden = true; return; }
    tipEl.innerHTML = `<b>${s.id}</b> · ${booked.has(s.id) ? t('booked') : `${esc(clsName(s.cls))} ${inr(prices[s.cls])}`}<br><span style="color:${scoreColor(s.score)}">${icon('eye')} ${s.score}/100</span> ${t('l_' + scoreLabel(s.score))}`;
    tipEl.style.left = e.clientX + 'px'; tipEl.style.top = e.clientY + 'px'; tipEl.hidden = false;
  }
  onLeave(() => { tipEl.hidden = true; });
}

/* ---------- 3D viewer (full screen) ---------- */
let viewerHall = null;
async function openViewer({ lay, movie, booked, selected, seat, title }) {
  const v = $('#viewer');
  v.hidden = false; document.body.classList.add('lock');
  $('#vwTitle').textContent = title;
  $('#vwTip').textContent = TIER === 'low' ? t('low_mode') : t('explore_tip');
  $$('#vwPresets button').forEach((b) => { b.textContent = t({ overview: 'v_overview', front: 'v_front', back: 'v_back' }[b.dataset.p]); });
  const host = $('#vwHost'); host.innerHTML = `<div class="pv-empty"><span class="spin"></span><span>${t('loading3d')}</span></div>`;
  const sc = $('#vwScore');
  const showScore = (s) => { sc.hidden = !s; if (s) sc.innerHTML = `<b>${s.id}</b><span class="sc-big" style="--sc:${scoreColor(s.score)}">${s.score}<small>/100</small></span><span>${t('l_' + scoreLabel(s.score))}<small>${t('n_' + s.note)}</small></span>`; };
  showScore(seat);
  try {
    const { mountHall } = await import('./hall3d.js');
    if (v.hidden) return;
    host.innerHTML = '';
    viewerHall?.dispose();
    viewerHall = await mountHall(host, lay, { movie, booked, selected, tier: TIER, onSeatTap: (s) => { viewerHall.seatView(s); showScore(s); } });
  } catch (e) { viewerHall = null; }
  if (!viewerHall) { host.innerHTML = `<div class="pv-empty"><span>${t('no3d')}</span></div>`; return; }
  if (seat) viewerHall.seatView(seat, true); else viewerHall.preset('overview');
}
function closeViewer() { $('#viewer').hidden = true; document.body.classList.remove('lock'); viewerHall?.dispose(); viewerHall = null; }
$('#vwClose').addEventListener('click', closeViewer);
$('#vwPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && viewerHall) viewerHall.preset(b.dataset.p); });

/* ---------- orders: movie, event or rental ---------- */
function movieOrder(show, seats, snacks) {
  const lay = layoutOf(show), prices = pricesOf(show), m = movieById(show.movieId), th = theatreById(show.theatreId);
  const list = seats.map((id) => lay.byId.get(id));
  const lines = [...new Set(list.map((s) => s.cls))].map((k) => { const l = list.filter((s) => s.cls === k); return { label: `${clsName(k)} × ${l.length}`, sub: l.map((s) => s.id).join(', '), amount: prices[k] * l.length }; });
  return { kind: 'movie', showId: show.id, seats, snacks, qty: seats.length, lines, title: m.title, c1: m.c1, c2: m.c2,
    sub: `${fmtDate(fromKey(show.dk))} | ${hmLabel(show.hm)}`, detail: `${show.lang} (${show.fmt})`, place: `${th.name}: ${th.area} (${th.screens[show.screenIdx].name})`,
    morning: +show.hm < 1200, cancellable: true, start: showStart(show).getTime(), pickup: 'interval' };
}
function eventOrder(ev, tiers) {
  const d = addDays(today(), ev.day); d.setHours(+ev.hm.slice(0, 2), +ev.hm.slice(2));
  const lines = Object.entries(tiers).filter(([, n]) => n).map(([name, n]) => ({ label: `${name} × ${n}`, amount: ev.tiers.find((x) => x[0] === name)[1] * n }));
  return { kind: 'event', eventId: ev.id, tiers, qty: Object.values(tiers).reduce((a, b) => a + b, 0), lines, title: ev.title, c1: ev.c1, c2: ev.c2,
    sub: `${fmtDate(d)} | ${hmLabel(ev.hm)}`, detail: ev.kind, place: `${ev.venue}, ${tx(CITIES.find((c) => c.id === app.city()))}`, cancellable: false, start: d.getTime(), snacks: {} };
}
function rentOrder(p) {
  return { kind: 'rent', premiereId: p.id, qty: 1, lines: [{ label: `${state.lang === 'ta' ? 'வாடகை' : 'Rent'} · HD`, amount: p.rent }], title: p.title, c1: p.c1, c2: p.c2,
    sub: state.lang === 'ta' ? '30 நாட்களுக்குள் பாருங்கள்' : 'Watch within 30 days · 48 h once started', detail: `${p.lang} · ${p.cert}`, place: 'Lumen Premiere', cancellable: false, snacks: {}, noFee: true };
}
function priceOrder(o, { donate, offer }) {
  const base = o.lines.reduce((a, l) => a + l.amount, 0);
  const food = Object.entries(o.snacks || {}).reduce((a, [k, n]) => a + SNACKS.find((s) => s.id === k).price * n, 0);
  const conv = o.noFee ? 0 : o.qty * CONV_FEE, gst = Math.round(conv * GST * 100) / 100;
  const don = donate ? o.qty : 0;
  let disc = 0;
  if (offer) disc = offer.flat ? offer.flat : Math.min(offer.max, Math.round((base * offer.pct) / 100));
  const total = Math.max(0, base + food + conv + gst + don - disc);
  return { base, food, conv, gst, don, disc, total };
}
function offerOk(o, order, method) {
  if (o.morning && !order.morning) return state.lang === 'ta' ? 'காலைக் காட்சிகளுக்கு மட்டும்' : 'Only for shows before 12 PM';
  if (o.upi && method !== 'UPI') return state.lang === 'ta' ? 'UPI-க்கு மட்டும்' : 'Pay by UPI to use this';
  if (o.minSeats && order.qty < o.minSeats) return `Needs ${o.minSeats}+ tickets`;
  if (o.code === 'FIRST50' && S.bookings.length) return state.lang === 'ta' ? 'முதல் புக்கிங்கிற்கு மட்டும்' : 'Only for your first booking';
  return null;
}

// Terms → contact details → snacks (movies) → payment
const TERMS = [
  'Seat layouts are shown as built; the 3D view is an approximation of the real view.',
  'Tickets are needed for children aged 3 and above.',
  'Entry is only for 18+ for A-certified films. Carry a photo ID.',
  'Outside food and drinks are not allowed.',
  'Bags, helmets and laptops may be checked at entry.',
  'Entry may be refused to anyone under the influence of alcohol or drugs.',
  'Cancellation: cancel online up to 1 hour before the show and get 75% of the ticket price back to your payment method. No refund in the last hour. Booking fees are not refunded.',
];
let currentOrder = null;
async function startCheckout(order) {
  if (order.kind === 'movie') {
    const r = await app.hold(order.showId, order.seats).catch(() => ({ ok: false, error: true }));
    if (!r.ok) {
      toast(r.error ? (state.lang === 'ta' ? 'இணைப்பு இல்லை. மீண்டும் முயற்சிக்கவும்.' : 'Could not reach the server. Check your connection and try again.')
        : (state.lang === 'ta' ? `${r.taken.join(', ')} இப்போதுதான் வேறொருவரால் எடுக்கப்பட்டது.` : `${r.taken.join(', ')} was just taken by someone else. Please pick again.`));
      if (!r.error) route();
      return;
    }
  }
  openSheet(`<h2 class="sh-t">${state.lang === 'ta' ? 'விதிமுறைகள்' : 'Terms & Conditions'}</h2>
    <ol class="terms">${TERMS.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="sh-actions"><button type="button" class="btn ghost" data-go="cancel">${state.lang === 'ta' ? 'ரத்து' : 'Cancel'}</button><button type="button" class="btn primary" data-go="accept">${state.lang === 'ta' ? 'ஏற்கிறேன்' : 'Accept'}</button></div>`,
  (sh) => sh.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    if (b.dataset.go === 'cancel') { if (order.showId) app.release(order.showId); closeSheet(); }
    else contactStep(order);
  }));
}
function contactStep(order) {
  const c = S.contact;
  openSheet(`<h2 class="sh-t">${state.lang === 'ta' ? 'தொடர்பு விவரங்கள்' : 'Contact details'}</h2>
    <form id="cForm" class="snacks" novalidate>
      <div class="field"><label for="cEmail">${state.lang === 'ta' ? 'உங்கள் மின்னஞ்சல்' : 'Your email'}</label><input id="cEmail" class="input" type="email" inputmode="email" autocomplete="email" value="${esc(c.email)}" required><small>${state.lang === 'ta' ? 'டிக்கெட் இந்த மின்னஞ்சலுக்கு அனுப்பப்படும்' : 'We send the ticket here'}</small></div>
      <div class="field"><label for="cPhone">${state.lang === 'ta' ? 'மொபைல் எண்' : 'Mobile number'}</label><div class="phone"><span>+91</span><input id="cPhone" class="input" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="${esc(c.phone)}" required></div><small>${state.lang === 'ta' ? 'டிக்கெட் அனுப்ப மட்டும்' : 'Only used to send your ticket'}</small></div>
      <p class="field"><small class="err" id="cErr"></small></p>
      <button type="submit" class="btn primary block">${state.lang === 'ta' ? 'தொடர்' : 'Continue'}</button>
    </form>`,
  (sh) => sh.querySelector('#cForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = sh.querySelector('#cEmail').value.trim(), phone = sh.querySelector('#cPhone').value.replace(/\D/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { sh.querySelector('#cErr').textContent = state.lang === 'ta' ? 'சரியான மின்னஞ்சலை உள்ளிடுங்கள்.' : 'Enter a valid email, like name@gmail.com.'; return; }
    if (!/^[6-9]\d{9}$/.test(phone)) { sh.querySelector('#cErr').textContent = state.lang === 'ta' ? '10 இலக்க மொபைல் எண்ணை உள்ளிடுங்கள்.' : 'Enter a 10-digit Indian mobile number.'; return; }
    S.contact = { email, phone }; store.set('contact', S.contact);
    if (order.kind === 'movie') snackStep(order); else { currentOrder = order; closeSheet(); location.hash = 'pay'; }
  }));
}
function snackStep(order) {
  const cart = order.snacks;
  const render = () => openSheet(`<h2 class="sh-t">${icon('popcorn')}${t('snacks')}</h2><p class="muted">${t('snacks_sub')}</p>
    <div class="snacks">${SNACKS.map((s) => `<div class="snack"><span class="sn-ic" style="background:${s.tone}">${icon('popcorn')}</span><span><b>${esc(tx(s))}</b><small>${inr(s.price)}</small></span>
    <span class="stepper"><button type="button" data-s="${s.id}" data-d="-1" aria-label="Less">${icon('minus')}</button><output>${cart[s.id] || 0}</output><button type="button" data-s="${s.id}" data-d="1" aria-label="More">${icon('plus')}</button></span></div>`).join('')}</div>
    <div class="toggle-row"><span>${state.lang === 'ta' ? 'எப்போது வாங்குவீர்கள்?' : 'Pick up'}</span><span class="pickup">${[['start', state.lang === 'ta' ? 'படத்திற்கு முன்' : 'Before the show'], ['interval', state.lang === 'ta' ? 'இடைவேளையில்' : 'At the interval']].map(([k, l]) => `<button type="button" class="fchip" data-p="${k}" aria-pressed="${order.pickup === k}">${l}</button>`).join('')}</span></div>
    <div class="sh-actions"><button type="button" class="btn ghost" data-go="skip">${t('skip')}</button><button type="button" class="btn primary" data-go="next">${t('next')}</button></div>`,
  (sh) => sh.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s) { cart[b.dataset.s] = Math.max(0, Math.min(9, (cart[b.dataset.s] || 0) + +b.dataset.d)); render(); }
    if (b.dataset.p) { order.pickup = b.dataset.p; render(); }
    if (b.dataset.go === 'skip') { Object.keys(cart).forEach((k) => delete cart[k]); }
    if (b.dataset.go) { currentOrder = order; closeSheet(); location.hash = 'pay'; }
  }));
  render();
}

/* ---------- payment page ---------- */
const METHODS = [
  ['UPI', 'Pay by any UPI app', 'UPI செயலி மூலம்', 'send'], ['Card', 'Debit / Credit card', 'டெபிட் / கிரெடிட் கார்டு', 'ticket'], ['Wallet', 'Mobile wallets', 'மொபைல் வாலெட்', 'popcorn'],
  ['Gift', 'Gift voucher', 'பரிசு வவுச்சர்', 'star'], ['NetBanking', 'Net banking', 'நெட் பேங்கிங்', 'home'], ['Later', 'Pay later', 'பின்னர் செலுத்து', 'clock'], ['Points', 'Redeem points', 'புள்ளிகள்', 'spark'],
];
function payView() {
  const o = currentOrder;
  if (!o) { location.hash = 'tickets'; return; }
  const P = { method: 'UPI', donate: false, offer: null, feesOpen: false };
  const hold = o.kind === 'movie' ? holds.get(o.showId) : null;
  view.innerHTML = `<div class="topbar"><button type="button" class="iconbtn" id="payBack" aria-label="${t('back')}">${icon('back')}</button><div class="sb-t"><b>${esc(o.title)} ${o.kind === 'movie' ? `(${esc(o.detail)})` : ''}</b><small>${esc(o.place)} | ${esc(o.sub)}</small></div><b id="holdLbl" class="muted"></b></div>
    <div class="pay-grid">
      <section class="panel"><h2>${state.lang === 'ta' ? 'செலுத்தும் முறைகள்' : 'Payment options'}</h2><div class="paymethods" id="pms" role="radiogroup"></div><div class="pm-detail" id="pmd"></div></section>
      <section class="panel" id="summary"></section>
    </div>`;
  $('#payBack').addEventListener('click', () => { if (o.showId) app.release(o.showId); history.back(); });
  function methods() {
    $('#pms').innerHTML = METHODS.map(([k, en, ta, ic]) => `<button type="button" class="pm" role="radio" aria-checked="${P.method === k}" data-m="${k}"><span class="pm-ic">${icon(ic)}</span><span>${state.lang === 'ta' ? ta : en}${k === 'Points' ? `<small>${S.points} pts = ${inr(S.points / 4)}</small>` : ''}</span>${icon('right')}</button>`).join('');
    const d = $('#pmd');
    if (P.method === 'UPI') { d.innerHTML = `<div class="qr-box"><canvas width="25" height="25" id="upiQr"></canvas><div><b>${state.lang === 'ta' ? 'QR-ஐ ஸ்கேன் செய்யுங்கள்' : 'Scan QR code'}</b><p class="muted" style="margin:4px 0 8px">${state.lang === 'ta' ? 'எந்த UPI செயலியிலும்' : 'With any UPI app'}</p><input class="input" id="upiId" placeholder="or enter UPI ID, e.g. name@okaxis"></div></div>`; drawQR($('#upiQr'), 'upi' + o.title); }
    else if (P.method === 'Card') d.innerHTML = `<input class="input" inputmode="numeric" placeholder="Card number" maxlength="19"><div class="phone" style="grid-template-columns:1fr 1fr"><input class="input" placeholder="MM / YY" maxlength="7"><input class="input" placeholder="CVV" maxlength="4" inputmode="numeric"></div><input class="input" placeholder="Name on card">`;
    else if (P.method === 'Wallet') d.innerHTML = `<div class="fmt-row">${['PayFast', 'Mobikash', 'ZipWallet'].map((w) => `<button type="button">${w}</button>`).join('')}</div>`;
    else if (P.method === 'Gift') d.innerHTML = `<div class="offer-row"><input class="input" placeholder="Voucher code"><button type="button" class="btn ghost">Apply</button></div>`;
    else if (P.method === 'NetBanking') d.innerHTML = `<label class="dd"><select class="input">${['State Bank', 'HDFC', 'ICICI', 'Axis', 'Indian Bank', 'Canara'].map((b) => `<option>${b}</option>`).join('')}</select></label>`;
    else if (P.method === 'Later') d.innerHTML = `<p class="muted" style="margin:0">${state.lang === 'ta' ? '15 நாட்களுக்குள் செலுத்துங்கள்.' : 'Pay within 15 days. No extra charge if paid on time.'}</p>`;
    else d.innerHTML = `<p class="muted" style="margin:0">${S.points} points available. ${inr(Math.min(S.points / 4, priceOrder(o, P).total))} will be taken off.</p>`;
  }
  function summary() {
    const p = priceOrder(o, P);
    const pts = P.method === 'Points' ? Math.min(S.points / 4, p.total) : 0;
    const payable = p.total - pts;
    $('#summary').innerHTML = `
      <div class="tk-top" style="--c1:${o.c1};--c2:${o.c2};border-radius:12px;grid-template-columns:minmax(0,1fr) auto"><div><b>${esc(o.title)}</b><small>${esc(o.sub)}</small><small>${esc(o.detail)}</small>${o.seats ? `<small>${esc(o.seats.join(', '))}</small>` : ''}<small>${esc(o.place)}</small></div><b style="font-size:22px">${o.qty}</b></div>
      ${o.cancellable ? `<div class="cancel-ok"><b>${state.lang === 'ta' ? 'ரத்து செய்யலாம்' : 'Cancellation available'}</b>${state.lang === 'ta' ? 'காட்சிக்கு 1 மணி நேரம் முன் வரை 75% திரும்ப.' : '75% of the ticket price back if you cancel up to 1 hour before the show.'}</div>` : ''}
      <table class="sum"><tbody>
        ${o.lines.map((l) => `<tr><td>${esc(l.label)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</td><td>${money(l.amount)}</td></tr>`).join('')}
        ${p.food ? `<tr><td>${state.lang === 'ta' ? 'உணவு & பானம்' : 'Food & beverages'}<small>${o.pickup === 'interval' ? (state.lang === 'ta' ? 'இடைவேளையில் வாங்கலாம்' : 'Pick up at the interval') : (state.lang === 'ta' ? 'படத்திற்கு முன்' : 'Pick up before the show')}</small></td><td>${money(p.food)}</td></tr>` : ''}
        ${p.conv ? `<tr><td><button type="button" class="link" id="feeTog" style="color:var(--fg)">${state.lang === 'ta' ? 'வசதிக் கட்டணம்' : 'Convenience fees'} ${icon('chev')}</button></td><td>${money(p.conv + p.gst)}</td></tr>
        ${P.feesOpen ? `<tr class="sub"><td>Base fee (${inr(CONV_FEE)} × ${o.qty})</td><td>${money(p.conv)}</td></tr>${p.gst ? `<tr class="sub"><td>GST @ ${Math.round(GST * 100)}%</td><td>${money(p.gst)}</td></tr>` : ''}` : ''}` : ''}
        ${o.kind !== 'rent' ? `<tr><td>${state.lang === 'ta' ? 'இசைக் கலைஞர்களுக்கு நன்கொடை' : 'Give to young musicians'}<small>₹1 per ticket</small></td><td><button type="button" class="switch" role="switch" aria-checked="${P.donate}" id="donTog" aria-label="Donate"></button></td></tr>` : ''}
        ${p.disc ? `<tr class="disc"><td>Offer ${esc(P.offer.code)}</td><td>− ${money(p.disc)}</td></tr>` : ''}
        ${pts ? `<tr class="disc"><td>Points</td><td>− ${money(pts)}</td></tr>` : ''}
        <tr class="tot"><td>${state.lang === 'ta' ? 'மொத்தம்' : 'Order total'}</td><td>${money(payable)}</td></tr></tbody></table>
      <div><b>${state.lang === 'ta' ? 'புக்கிங் விவரம் அனுப்ப' : 'For sending booking details'}</b> <button type="button" class="link" id="editC">Edit</button><p class="muted" style="margin:4px 0 0">+91-${esc(S.contact.phone)} | ${esc(S.contact.email)}</p></div>
      <div class="offer-list"><b>${icon('spark')} ${state.lang === 'ta' ? 'சலுகைகள்' : 'Apply offers'}</b>${OFFERS.map((of) => { const why = offerOk(of, o, P.method); return `<button type="button" class="offer" data-of="${of.code}" aria-pressed="${P.offer?.code === of.code}" ${why ? 'aria-disabled="true"' : ''}><span><b>${of.code}</b><small>${esc(of.en)}${why ? ` · ${esc(why)}` : ''}</small></span>${P.offer?.code === of.code ? icon('check') : ''}</button>`; }).join('')}</div>
      <p class="consent">${state.lang === 'ta' ? 'தொடர்வதன் மூலம் இந்த பரிவர்த்தனையை முடிக்க ஒப்புக்கொள்கிறேன்.' : 'By proceeding, I agree to complete this transaction.'}</p>
      <div class="payable"><span>${state.lang === 'ta' ? 'செலுத்த வேண்டியது' : 'Amount payable'}</span><b>${money(payable)}</b></div>
      <button type="button" class="btn primary block" id="payNow">${state.lang === 'ta' ? 'செலுத்து' : 'Pay'} ${money(payable)}</button>
      <p class="muted center" style="margin:0;font-size:12.5px">${t('demo')}</p>`;
    $('#feeTog')?.addEventListener('click', () => { P.feesOpen = !P.feesOpen; summary(); });
    $('#donTog')?.addEventListener('click', () => { P.donate = !P.donate; summary(); });
    $('#editC').addEventListener('click', () => contactStep({ ...o, kind: 'edit' }));
    $('#summary .offer-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-of]'); if (!b) return;
      const of = OFFERS.find((x) => x.code === b.dataset.of); const why = offerOk(of, o, P.method);
      if (why) { toast(why); return; }
      P.offer = P.offer?.code === of.code ? null : of; summary();
    });
    $('#payNow').addEventListener('click', async (e) => {
      const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true;
      let b = null;
      try { b = await saveBooking(o, P.method, payable, { donate: P.donate, offer: P.offer?.code || null, fees: p.conv + p.gst, discount: p.disc }); }
      catch (err) { btn.disabled = false; toast(state.lang === 'ta' ? 'இணைப்பு இல்லை. மீண்டும் முயற்சிக்கவும்.' : 'Payment could not be completed. Check your connection and try again.'); return; }
      if (!b) { toast(state.lang === 'ta' ? 'இருக்கைகள் இனி கிடைக்காது.' : 'Those seats are no longer available. Please pick again.'); if (o.showId) location.hash = 'show-' + o.showId; return; }
      if (P.method === 'Points') { S.points -= Math.round(pts * 4); store.set('points', S.points); }
      if (o.showId) app.release(o.showId);
      currentOrder = null; location.hash = 'ticket-' + b.id;
    });
  }
  $('#pms').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; P.method = b.dataset.m; if (P.offer && offerOk(P.offer, o, P.method)) P.offer = null; methods(); summary(); });
  methods(); summary();
  if (hold) {
    const tick = () => {
      const left = Math.max(0, hold.until - Date.now());
      const el = $('#holdLbl'); if (!el) return;
      el.textContent = `${state.lang === 'ta' ? 'இருக்கை வைத்திருப்பு' : 'Seats held'} ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      if (!left) { toast(state.lang === 'ta' ? 'நேரம் முடிந்தது. இருக்கைகள் விடுவிக்கப்பட்டன.' : 'Time ran out and the seats were released. Pick them again.'); app.release(o.showId); location.hash = 'show-' + o.showId; }
    };
    tick(); const iv = setInterval(tick, 1000); onLeave(() => clearInterval(iv));
  }
}
// The contact sheet reopened from the payment page only needs to save
const _contactStep = contactStep;
async function saveBooking(o, method, total, extra = {}) {
  const b = { id: 'LM' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 4).toUpperCase(), kind: o.kind, showId: o.showId || null, eventId: o.eventId || null, premiereId: o.premiereId || null,
    seats: o.seats || null, tiers: o.tiers || null, snacks: o.snacks || {}, pickup: o.pickup || null, qty: o.qty, method, total, at: Date.now(),
    contact: { ...S.contact }, city: app.city(), ...extra };
  if (o.kind === 'movie') { const sh = showById(o.showId); if (sh) { const pr = pricesOf(sh), lay = layoutOf(sh); b.theatreId = sh.theatreId; b.ticketAmount = b.seats.reduce((a, id) => a + (pr[lay.byId.get(id)?.cls] || 0), 0); } }
  else if (o.kind === 'event') b.ticketAmount = o.lines.reduce((a, l) => a + l.amount, 0);
  else b.ticketAmount = o.lines.reduce((a, l) => a + l.amount, 0);
  b.commissionPct = COMMISSION * 100;
  const info = ticketInfo(b); if (info) b.summary = { title: info.title, when: info.when, place: info.where, seats: (b.seats || []).join(', ') || info.rows[0]?.[1] || '' };
  const r = await db.book(b);
  if (!r.ok) return null;
  renderHeader();
  return b;
}

/* ---------- tickets ---------- */
function refundFor(b) {
  if (b.kind !== 'movie') return null;
  const show = showById(b.showId); if (!show) return null;
  const hrs = (showStart(show) - Date.now()) / 3600000;
  const lay = layoutOf(show), prices = pricesOf(show);
  const ticket = b.seats.reduce((a, id) => a + (prices[lay.byId.get(id)?.cls] || 0), 0);
  const pct = hrs >= 1 ? 0.75 : 0; // online cancellation up to 1 hour before the show
  return { pct, amount: Math.round(ticket * pct) };
}
function ticketInfo(b) {
  if (b.kind === 'movie') {
    const show = showById(b.showId); if (!show) return null;
    const m = movieById(show.movieId), th = theatreById(show.theatreId), lay = layoutOf(show);
    const avg = Math.round(b.seats.reduce((a, id) => a + (lay.byId.get(id)?.score || 0), 0) / b.seats.length);
    return { m, title: m.title, when: `${fmtDate(fromKey(show.dk))} · ${hmLabel(show.hm)}`, where: `${th.name}, ${th.area} · ${th.screens[show.screenIdx].name}`,
      rows: [['Seats', b.seats.join(', ')], [t('score'), `${avg}/100`], ['Format', `${show.lang} · ${show.fmt}`], ['Ends', endTime(show.hm, m.mins)]], show, lay, th };
  }
  if (b.kind === 'event') {
    const ev = eventById(b.eventId); if (!ev) return null; const d = addDays(new Date(b.at), 0);
    return { m: ev, title: ev.title, when: `${fmtDate(addDays(today(), ev.day))} · ${hmLabel(ev.hm)}`, where: ev.venue, rows: [['Tickets', Object.entries(b.tiers).filter(([, n]) => n).map(([k, n]) => `${k} × ${n}`).join(', ')]] };
  }
  const p = premiereById(b.premiereId); if (!p) return null;
  return { m: p, title: p.title, when: state.lang === 'ta' ? '30 நாட்கள் வாடகை' : 'Rented for 30 days', where: 'Lumen Premiere', rows: [['Quality', 'HD']] };
}
function ticketHTML(b, full = false) {
  const i = ticketInfo(b); if (!i) return '';
  return `<article class="ticket${b.cancelled ? ' cancelled' : ''}">
    <div class="tk-top" style="--c1:${i.m.c1};--c2:${i.m.c2}"><div class="tk-post">${i.m.motif ? poster(i.m) : ''}</div><div><b>${esc(i.title)}</b><small>${esc(i.when)}</small><small>${esc(i.where)}</small></div></div>
    <div class="tk-body"><dl>${i.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}<dt>${t('total')}</dt><dd>${money(b.total)}</dd><dt>ID</dt><dd>${b.id}</dd></dl>
    ${full ? '<canvas class="qr" width="25" height="25" aria-label="Entry QR code"></canvas>' : `<a class="btn ghost sm" href="#ticket-${b.id}" aria-label="Open ticket">${icon('right')}</a>`}</div>
    ${full && b.kind === 'movie' && Object.values(b.snacks || {}).some(Boolean) ? `<div class="tk-extra"><span>${icon('popcorn')}${Object.entries(b.snacks).filter(([, n]) => n).map(([k, n]) => `${n}× ${tx(SNACKS.find((s) => s.id === k))}`).join(', ')} · ${b.pickup === 'interval' ? (state.lang === 'ta' ? 'இடைவேளையில்' : 'pick up at the interval') : (state.lang === 'ta' ? 'படத்திற்கு முன்' : 'pick up before the show')}</span></div>` : ''}
    ${full && b.contact ? `<div class="tk-extra"><span>${icon('send')}${state.lang === 'ta' ? 'அனுப்பப்பட்டது' : 'Sent to'} ${esc(b.contact.email)} · +91 ${esc(b.contact.phone)}</span></div>` : ''}</article>`;
}
function drawQR(canvas, id) {
  const g = canvas.getContext('2d'); const r = mulberry32(hash(id));
  g.fillStyle = '#fff'; g.fillRect(0, 0, 25, 25); g.fillStyle = '#10121a';
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if (r() > 0.5) g.fillRect(x, y, 1, 1);
  for (const [fx, fy] of [[0, 0], [18, 0], [0, 18]]) { g.fillStyle = '#10121a'; g.fillRect(fx, fy, 7, 7); g.fillStyle = '#fff'; g.fillRect(fx + 1, fy + 1, 5, 5); g.fillStyle = '#10121a'; g.fillRect(fx + 2, fy + 2, 3, 3); }
}
function ticketView(id) {
  const b = S.bookings.find((x) => x.id === id);
  const info = b && ticketInfo(b);
  if (!info) { location.hash = 'tickets'; return; }
  const rf = refundFor(b);
  view.innerHTML = `<div class="topbar"><a class="iconbtn" href="#tickets" aria-label="${t('back')}">${icon('back')}</a></div>
    <section class="done"><h1>${b.cancelled ? t('cancelled') : t('done_title')}</h1>${b.cancelled ? '' : `<p class="muted">${b.kind === 'rent' ? (state.lang === 'ta' ? 'உங்கள் நூலகத்தில் சேர்க்கப்பட்டது.' : 'Added to your library.') : t('done_sub')}</p>`}
    ${ticketHTML(b, true)}
    <div class="done-actions">${b.cancelled ? '' : b.kind === 'movie' ? `<button type="button" class="btn primary" id="tkView">${icon('eye')}${t('see_view')}</button>` : b.kind === 'rent' ? `<button type="button" class="btn primary" id="tkWatch">${icon('play')}${state.lang === 'ta' ? 'மெய்நிகர் அரங்கில் பார்' : 'Watch in a virtual theatre'}</button>` : ''}
      <button type="button" class="btn ghost" id="tkCopy">${t('copy')}</button>
      ${!b.cancelled && rf ? (rf.pct ? `<button type="button" class="btn ghost danger" id="tkCancel">${t('cancel')} · ${inr(rf.amount)} back</button>` : `<span class="muted small">${state.lang === 'ta' ? 'காட்சிக்கு 1 மணி நேரத்திற்குள் ரத்து செய்ய முடியாது.' : 'Online cancellation closes 1 hour before the show.'}</span>`) : ''}
      ${b.kind === 'movie' && !b.cancelled ? `<a class="btn ghost" href="#invoice-${b.id}">${icon('ticket')}${state.lang === 'ta' ? 'விலைப்பட்டியல்' : 'Invoice'}</a>` : ''}</div></section>`;
  const q = $('.qr', view); if (q) drawQR(q, b.id);
  $('#tkView')?.addEventListener('click', () => {
    const sel = new Set(b.seats);
    openViewer({ lay: info.lay, movie: info.m, booked: bookedFor(info.show, info.lay, app.mySeats(info.show.id).filter((x) => !sel.has(x))), selected: sel, seat: info.lay.byId.get(b.seats[Math.floor(b.seats.length / 2)]) || null, title: `${info.title} · ${b.seats.join(', ')}` });
  });
  $('#tkWatch')?.addEventListener('click', () => {
    const lay = getLayout('lounge');
    openViewer({ lay, movie: { ...info.m, lang: info.m.lang }, booked: new Set(), selected: new Set(['C7', 'C8']), seat: lay.byId.get('C7'), title: `${info.title} · ${state.lang === 'ta' ? 'உங்கள் தனி அரங்கு' : 'Your private screening'}` });
  });
  $('#tkCopy').addEventListener('click', () => {
    const txt = `${info.title} · ${info.when} · ${info.where} · ${info.rows.map((r) => r.join(': ')).join(' · ')} · Booking ${b.id}`;
    navigator.clipboard?.writeText(txt).then(() => toast(t('copied')), () => toast(txt));
  });
  $('#tkCancel')?.addEventListener('click', async () => {
    if (!confirm(`Cancel booking ${b.id}? ${inr(rf.amount)} (75% of the ticket price) will be refunded. Booking fees are not refunded.`)) return;
    try { await db.cancel(b.id, rf.amount); } catch (e) { toast(e.message); return; }
    renderHeader(); toast(`${t('cancelled')} ${rf.amount ? inr(rf.amount) + ' will reach your account in 5–7 days.' : ''}`); ticketView(id); });
}
function ticketsView() {
  const list = S.bookings.filter((b) => ticketInfo(b));
  const nudge = db.mode === 'server' && !db.me ? `<div class="notice">${icon('user')}<span><b>${state.lang === 'ta' ? 'உள்நுழைந்தால் டிக்கெட்டுகள் எல்லா சாதனத்திலும் கிடைக்கும்.' : 'Sign in with your mobile number to keep your tickets on every phone and computer.'}</b></span><button type="button" class="btn primary sm" id="tkSign">${state.lang === 'ta' ? 'உள்நுழை' : 'Sign in'}</button></div>` : '';
  view.innerHTML = `<div class="topbar"><a class="iconbtn" href="#home" aria-label="${t('back')}">${icon('back')}</a><h1 class="tb-t">${t('my_tickets')}</h1></div>${nudge}
    ${list.length ? `<div class="tickets">${list.map((b) => ticketHTML(b)).join('')}</div>` : `<p class="empty">${t('no_tickets')}</p>`}`;
  $('#tkSign')?.addEventListener('click', () => customerSignIn(panelCtx()));
}

/* ---------- events, plays, sports, activities, stream ---------- */
function catView(id) {
  if (id === 'stream') {
    view.innerHTML = `<div class="topbar"><h1 class="tb-t">Premiere</h1></div><p class="muted">${state.lang === 'ta' ? 'புதிய படங்களை வீட்டிலேயே வாடகைக்குப் பாருங்கள்.' : 'Brand new movies to rent and watch at home.'}</p>
      <div class="rail" style="grid-auto-flow:row;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${PREMIERES.map((p) => card(p, `#premiere-${p.id}`, 'PREMIERE')).join('')}</div>`;
    return;
  }
  const c = EVENT_CATS.find((x) => x.id === id); if (!c) return homeView();
  const list = EVENTS.filter((e) => e.cat === id);
  view.innerHTML = `<div class="topbar"><h1 class="tb-t">${esc(tx(c))}</h1></div>
    <div class="rail" style="grid-auto-flow:row;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${list.map((e) => `<a class="ecard${e.img ? ' has-img' : ''}" href="#event-${e.id}" style="--c1:${e.c1};--c2:${e.c2};min-height:180px">${e.img ? `<img class="ec-img" src="${e.img}" alt="" loading="lazy">` : ''}<span class="e-ic">${icon(c.icon)}</span><small>${esc(e.kind)}</small><b>${esc(e.title)}</b><small>${fmtDate(addDays(today(), e.day))} · ${hmLabel(e.hm)} · ${esc(e.venue)}</small><small>${t('from', { p: inr(Math.min(...e.tiers.map((x) => x[1]))) })}</small></a>`).join('')}</div>`;
}
function eventView(id) {
  const ev = eventById(id); if (!ev) return homeView();
  const tiers = {};
  view.innerHTML = `<div class="topbar"><a class="iconbtn" href="#cat-${ev.cat}" aria-label="${t('back')}">${icon('back')}</a></div>
    <section class="ev-head${ev.img ? ' has-img' : ''}" style="--c1:${ev.c1};--c2:${ev.c2}">${ev.img ? `<img class="ec-img" src="${ev.img}" alt="" decoding="async">` : ''}<small>${esc(ev.kind)}</small><h1>${esc(ev.title)}</h1>
      <p class="meta">${icon('clock')} ${fmtDate(addDays(today(), ev.day))} · ${hmLabel(ev.hm)} · ${Math.round(ev.mins / 60 * 10) / 10} h</p><p class="meta">${icon('pin')} ${esc(ev.venue)}, ${esc(tx(CITIES.find((c) => c.id === app.city())))}</p><p class="about">${esc(ev.about)}</p></section>
    <h2 class="sec">${state.lang === 'ta' ? 'டிக்கெட் வகைகள்' : 'Choose tickets'}</h2>
    <div class="tiers">${ev.tiers.map(([n, p]) => `<div class="tier"><span><b>${esc(n)}</b><small>${inr(p)}</small></span><span class="stepper"><button type="button" data-t="${esc(n)}" data-d="-1" aria-label="Less">${icon('minus')}</button><output data-o="${esc(n)}">0</output><button type="button" data-t="${esc(n)}" data-d="1" aria-label="More">${icon('plus')}</button></span></div>`).join('')}</div>
    <div class="paybar"><div><b id="evTot">${inr(0)}</b><small id="evCnt">0 tickets</small></div><button type="button" class="btn primary" id="evGo" disabled>${t('continue')}${icon('right')}</button></div>`;
  view.querySelector('.tiers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const k = b.dataset.t; tiers[k] = Math.max(0, Math.min(10, (tiers[k] || 0) + +b.dataset.d));
    view.querySelector(`[data-o="${CSS.escape(k)}"]`).textContent = tiers[k];
    const n = Object.values(tiers).reduce((a, x) => a + x, 0), tot = ev.tiers.reduce((a, [nm, p]) => a + (tiers[nm] || 0) * p, 0);
    $('#evTot').textContent = inr(tot); $('#evCnt').textContent = `${n} tickets`; $('#evGo').disabled = !n;
  });
  $('#evGo').addEventListener('click', () => startCheckout(eventOrder(ev, { ...tiers })));
}
function premiereView(id) {
  const p = premiereById(id); if (!p) return homeView();
  const owned = S.bookings.find((b) => b.premiereId === id && !b.cancelled);
  view.innerHTML = `<div class="topbar"><a class="iconbtn" href="#cat-stream" aria-label="${t('back')}">${icon('back')}</a></div>
    <section class="mhead" style="--c1:${p.c1};--c2:${p.c2}"><div class="mposter">${poster(p, { big: true })}</div>
      <div class="minfo"><h1>${esc(p.title)}</h1><p class="meta"><span class="rate">${icon('star')} ${p.rating}/10</span> · ${esc(p.lang)} · ${esc(p.cert)} · ${mins(p.mins)}</p><p class="about">${esc(p.about)}</p>
      <div class="mh-cta">${owned ? `<a class="btn primary" href="#ticket-${owned.id}">${icon('play')}${state.lang === 'ta' ? 'இப்போது பார்' : 'Watch now'}</a>` : `<button type="button" class="btn primary" id="rentBtn">${state.lang === 'ta' ? 'வாடகை' : 'Rent'} ${inr(p.rent)}</button>`}</div>
      <p class="muted" style="margin:0;font-size:13px">${state.lang === 'ta' ? '30 நாட்களுக்குள் தொடங்குங்கள்; தொடங்கியதும் 48 மணி நேரம்.' : 'Start within 30 days. You get 48 hours once you start.'}</p></div></section>`;
  $('#rentBtn')?.addEventListener('click', () => contactStep(rentOrder(p)));
}

/* ---------- seat layout editor ---------- */
function adminView(id) {
  if (!gate(view, panelCtx(), 'staff', 'admin' + (id ? '-' + id : ''))) return;
  const me = db.me, tid = id && id.replace(/s\d+$/, '');
  if (me.role !== 'admin' && tid && !(me.theatreIds || []).includes(tid)) { toast('You can only edit your own screens.'); location.hash = 'partner'; return; }
  renderAdmin(view, id, { city: app.city, db, tier: TIER, onLeave, openSheet, closeSheet, refreshForm: null });
}
// isCurrent(): false once the person has moved to another screen (async panels check it before drawing)
const panelCtx = () => { const h = location.hash; return { city: app.city, setCity: app.setCity, db, tier: TIER, onLeave, openSheet, closeSheet, route, isCurrent: () => location.hash === h, contactEmail: () => S.contact.email }; };

/* ---------- sheets: city, search, generic ---------- */
function openSheet(html, bind) {
  const sh = $('#sheet'); const body = $('#sheetBody');
  const fresh = body.cloneNode(false); fresh.innerHTML = html; body.replaceWith(fresh);
  sh.hidden = false; document.body.classList.add('lock');
  if (bind) bind(fresh);
  fresh.querySelector('button, input, a')?.focus({ preventScroll: true });
}
function closeSheet() { $('#sheet').hidden = true; if ($('#viewer').hidden && $('#agent').hidden) document.body.classList.remove('lock'); }
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('#sheetClose')) closeSheet(); });
function openCitySheet(first = false) {
  openSheet(`<h2 class="sh-t">${icon('pin')}${t('city')}</h2><button type="button" class="loc-btn wide" id="locBtn2">${icon('locate')}<span><b>${L('Use my current location', 'என் இருப்பிடத்தைப் பயன்படுத்து')}</b><small>${L('Finds your city and the nearest theatres', 'நகரம் மற்றும் அருகிலுள்ள திரையரங்குகள்')}</small></span></button><div class="cities">${CITIES.map((c) => `<button type="button" class="city" data-c="${c.id}" aria-pressed="${app.city() === c.id}"><b>${esc(tx(c))}</b><small>${c.areas.slice(0, 3).map(esc).join(' · ')}</small></button>`).join('')}</div>`,
    (sh) => sh.addEventListener('click', (e) => {
      if (e.target.closest('#locBtn2')) { closeSheet(); locate(); return; }
      const b = e.target.closest('[data-c]'); if (!b) return;
      // A city picked by hand: distances are only real when you are in that city
      if (LIVE.userLoc && nearestCity(LIVE.userLoc)[0].id !== b.dataset.c) { LIVE.userLoc = null; store.set('loc', null); }
      app.setCity(b.dataset.c); closeSheet(); route();
    }));
  if (first && !S.city) app.setCity('chennai');
}
function openSearch() {
  openSheet(`<h2 class="sh-t">${icon('search')}${t('search')}</h2><input id="q" class="input" type="search" placeholder="${t('search_ph')}" autocomplete="off"><div id="qres" class="qres"></div>`,
    (sh) => {
      const q = sh.querySelector('#q'), res = sh.querySelector('#qres');
      const run = () => {
        const s = q.value.trim().toLowerCase();
        const ms = MOVIES.filter((m) => !s || [m.title, m.lang, ...(m.langs || []), ...m.genres].some((x) => x.toLowerCase().includes(s)));
        const ths = theatresFor(app.city()).filter((th) => s && [th.name, th.area].some((x) => x.toLowerCase().includes(s)));
        const evs = EVENTS.filter((e) => s && [e.title, e.kind, e.venue].some((x) => x.toLowerCase().includes(s)));
        res.innerHTML = (ms.length || ths.length || evs.length)
          ? ms.map((m) => `<a class="qrow" href="#movie-${m.id}"><span class="q-post">${poster(m)}</span><span><b>${esc(m.title)}</b><small>${esc(m.lang)} · ${esc(m.genres.join(', '))}</small></span></a>`).join('')
            + ths.map((th) => `<a class="qrow" href="#theatre-${th.id}"><span class="q-post th">${hallGlyph(th.screens[0].hall)}</span><span><b>${esc(th.name)}</b><small>${esc(th.area)}</small></span></a>`).join('')
            + evs.map((e) => `<a class="qrow" href="#event-${e.id}"><span class="q-post th" style="background:linear-gradient(135deg,${e.c1},${e.c2})"></span><span><b>${esc(e.title)}</b><small>${esc(e.kind)} · ${esc(e.venue)}</small></span></a>`).join('')
          : `<p class="muted">${t('no_results')}</p>`;
      };
      q.addEventListener('input', run); run(); setTimeout(() => q.focus(), 30);
      res.addEventListener('click', (e) => { if (e.target.closest('a')) closeSheet(); });
    });
}

/* ---------- boot ---------- */
const agent = createAgent(app);
$('#cityBtn').addEventListener('click', () => openCitySheet());
$('#searchBtn').addEventListener('click', openSearch);
$('#ticketsBtn').addEventListener('click', () => { location.hash = 'tickets'; });
$('#acctBtn').addEventListener('click', () => { const me = db.me; if (!me) customerSignIn(panelCtx()); else if (me.role === 'customer') customerAccount(panelCtx()); else openAccount(panelCtx()); });
{ const l = store.get('loc', null); if (l && Date.now() - l.at < 7 * 864e5) LIVE.userLoc = { lat: l.lat, lng: l.lng }; }
function setThemeBtn() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
$('#themeBtn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
  store.set('theme', dark ? 'dark' : 'light'); setThemeBtn();
});
setThemeBtn();
$('#langBtn').addEventListener('click', () => { state.lang = state.lang === 'ta' ? 'en' : 'ta'; try { localStorage.setItem('lumen.lang', state.lang); } catch (e) {} route(); });
$('#askFab').addEventListener('click', () => agent.open());
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-ask]'); if (a) { agent.open(a.dataset.ask || ''); return; }
  const tr = e.target.closest('[data-trailer]'); if (tr) { e.preventDefault(); openTrailer(tr.dataset.trailer); return; }
  const bk = e.target.closest('[data-book]'); if (bk) { e.preventDefault(); openFormatSheet(bk.dataset.book); }
});
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!$('#viewer').hidden) closeViewer(); else if (!$('#sheet').hidden) closeSheet(); else if (agent.isOpen()) agent.close(); });
addEventListener('hashchange', route);
await db.init();
if (db.demo) {
  const bar = $('#demoBar');
  bar.innerHTML = `${icon('bell')}<span>${state.lang === 'ta' ? 'இது மாதிரி தளம்: டிக்கெட்டுகள் உண்மையானவை அல்ல, பணம் எடுக்கப்படாது.' : 'Demo version: tickets are not real and no money is charged.'}</span>`;
  bar.hidden = false;
}
route();
// Installable app (Android, iPhone, Windows): offline support and home-screen icon
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') && !/claude|claudeusercontent/.test(location.hostname)) {
  const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
}
