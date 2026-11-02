// Lumen Cinemas: screens, routing and the full booking flow.
import {
  CITIES, MOVIES, CLASS_META, SNACKS, FEE_PER_TICKET, CONV_FEE, GST, COMMISSION, HOLD_MINUTES, OFFERS, EVENT_CATS, EVENTS, PREMIERES,
  movieById, eventById, premiereById, isNowShowing, theatresFor, theatreById, showsFor, showById, today, addDays, dayKey, fromKey,
  hmLabel, partOfDay, releaseDate, mulberry32, hash, leavingSoon, liveBanners, nearestCity, LIVE, cityById,
} from './data.js';
import { HALLS, getLayout, buildLayout, layoutOf, pricesOf, counterOf, layoutFor, pricesFor, hallName, setCustomLayouts, customFor, specOfHall, rowsToText, textToRows, parsePlan, REC_CLASSES, bookedFor, bestBlock, blockAround, scoreLabel, scoreColor } from './layout.js';
import { mountMap } from './map2d.js';
import { t, tx, state, icon, inr, esc, clsName, poster, posterArt, ticketArt, $, $$, toast, fmtDate, compact, deviceTier } from './ui.js';
import { loginView, forgotView, registerView, openAccount, gate } from './auth.js';
import { customerSignIn, customerAccount, invoiceView, contactView, policyView } from './pages.js';
import { exploreView, offersView, giftCardsView, corporatesView, listShowView, cityPicker, footerHTML, bindFooter, eventCard, eventPoster } from './site.js';
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
  const lay = layoutOf(show), booked = bookedFor(show, lay, app.mySeats(show.id)), off = new Set(counterOf(show));
  const sellable = lay.seats.filter((x) => !x.disabled && !off.has(x.cls)), taken = sellable.filter((x) => booked.has(x.id)).length;
  const k = sellable.length ? taken / sellable.length : 1;
  // green under half sold, orange from half, red from 70% sold, grey when nothing is left
  const st = taken >= sellable.length ? 'full' : k >= 0.7 ? 'almost' : k >= 0.5 ? 'fast' : 'avail';
  const out = { st, left: sellable.length - taken, k };
  if (fillCache.size > 500) fillCache.clear();
  fillCache.set(key, out); return out;
}
function classBoard(show) {
  const lay = layoutOf(show), booked = bookedFor(show, lay, app.mySeats(show.id)), off = new Set(counterOf(show)), pr = pricesOf(show), ta = state.lang === 'ta';
  return `<div class="cb">${Object.entries(pr).map(([k, p]) => {
    const all = lay.seats.filter((x) => x.cls === k && !x.disabled), free = all.filter((x) => !booked.has(x.id)).length;
    const [c, l] = off.has(k) ? ['off', ta ? 'கவுண்டரில்' : 'At counter'] : !free ? ['full', ta ? 'நிரம்பியது' : 'Sold out'] : free / all.length < 0.3 ? ['fast', ta ? 'வேகமாக நிரம்புகிறது' : 'Filling fast'] : ['ok', ta ? 'கிடைக்கும்' : 'Available'];
    return `<div class="cb-r"><b>${inr(p)}</b><span>${esc(clsName(k)).toUpperCase()}</span><em class="${c}">${l}</em></div>`;
  }).join('')}</div>`;
}
const timeTag = (s, inner, extra = '') => { const f = fillOf(s); return f.st === 'full' ? `<span class="time full" aria-disabled="true" data-show="${s.id}">${inner}<small class="so">Sold out</small></span>` : `<a class="time ${extra || f.st}" href="#show-${s.id}">${inner}${f.st === 'almost' ? `<small class="left">${f.left} left</small>` : ''}</a>`; };
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
const CATS = [['movies', 'Movies', 'படங்கள்'], ['cat-stream', 'Stream', 'ஸ்ட்ரீம்'], ...EVENT_CATS.map((c) => ['cat-' + c.id, c.en, c.ta])];
function renderHeader() {
  const c = cityById(app.city());
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
  const LINKS2 = [['list-your-show', 'List your show', 'நிகழ்வு பட்டியல்'], ['corporates', 'Corporates', 'நிறுவனங்கள்'], ['offers', 'Offers', 'சலுகைகள்'], ['giftcards', 'Gift cards', 'பரிசு அட்டைகள்']];
  const on = (r) => cur === r || (r === 'movies' && /^(home|movie|shows|show)(-|$)/.test(cur));
  $('#cats').innerHTML = `<span class="cats-l">${CATS.map(([r, en, ta]) => `<a href="#${r}" ${on(r) ? 'aria-current="page"' : ''}>${state.lang === 'ta' ? ta : en}</a>`).join('')}</span><span class="cats-r">${LINKS2.map(([r, en, ta]) => `<a href="#${r}" ${on(r) ? 'aria-current="page"' : ''}>${state.lang === 'ta' ? ta : en}</a>`).join('')}</span>`;
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
  if (h === 'cinemas') return cinemasView();
  if ((m = /^cat-([a-z]+)$/.exec(h))) return exploreView(view, m[1], siteCtx());
  if (h === 'movies') return exploreView(view, 'movies', siteCtx());
  if (h === 'offers') return offersView(view, siteCtx());
  if (h === 'giftcards') return giftCardsView(view, siteCtx());
  if (h === 'corporates') return corporatesView(view, siteCtx());
  if (h === 'list-your-show') return listShowView(view, siteCtx());
  if ((m = /^event-([a-z0-9]+)$/.exec(h))) return eventView(m[1]);
  if ((m = /^premiere-([a-z0-9]+)$/.exec(h))) return premiereView(m[1]);
  if (h === 'admin') return adminView(null);
  if ((m = /^admin-(c\d+t\d+s\d+)$/.exec(h))) return adminView(m[1]);
  if (h === 'business') { location.replace('#partner'); return; }
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
// Promotion banners at the top: banners approved by Lumen, then events with a photo, then offer and gift-card promos
function promoSlides(city) {
  const out = liveBanners('home', { cityId: city.id }).map((b) => {
    const mv = b.movieId && movieById(b.movieId);
    return { img: b.image, title: b.title, sub: b.sub, href: mv ? `#movie-${mv.id}` : b.theatreId ? `#theatre-${b.theatreId}` : '#home', by: b.theatreId ? theatreById(b.theatreId)?.name : '' };
  });
  for (const e of EVENTS.filter((x) => x.img && x.day >= 0)) out.push({ img: e.img, title: e.title, sub: `${e.kind} · ${fmtDate(addDays(today(), e.day))} · ${hmLabel(e.hm)} · ${e.venue}`, href: `#event-${e.id}`, by: L('Live event', 'நேரலை நிகழ்வு'), cta: L('Get tickets', 'டிக்கெட் வாங்க') });
  const of = OFFERS[0];
  if (of) out.push({ art: 'offer', title: of.en, sub: L(`Use code ${of.code} at payment`, `குறியீடு ${of.code}`), href: '#offers', by: L('Offer', 'சலுகை'), cta: L('See all offers', 'அனைத்து சலுகைகள்') });
  out.push({ art: 'gift', title: L('The perfect gift for movie lovers', 'திரைப்பட ரசிகர்களுக்கு சிறந்த பரிசு'), sub: L('Lumen gift cards from ₹100, sent by email in a minute', '₹100 முதல் பரிசு அட்டைகள்'), href: '#giftcards', by: L('Gift cards', 'பரிசு அட்டைகள்'), cta: L('Buy now', 'வாங்கு') });
  return out.slice(0, 8);
}
function homeView() {
  const city = cityById(app.city());
  const now = MOVIES.filter(isNowShowing).sort((a, b) => b.rating * Math.log(b.votes + 2) - a.rating * Math.log(a.votes + 2));
  const soon = MOVIES.filter((m) => !isNowShowing(m)).sort((a, b) => a.rel - b.rel);
  const fresh = MOVIES.filter((m) => isNowShowing(m) && m.rel >= -21).sort((a, b) => b.rel - a.rel).slice(0, 6);
  const leaving = now.filter(leavingSoon).sort((a, b) => a.left - b.left);
  const ths = theatresFor(city.id).sort((a, b) => a.km - b.km);
  const todayShows = showsFor({ cityId: city.id, dk: dayKey(today()) });
  const promos = promoSlides(city);
  const events = EVENTS.filter((e) => e.day >= 0).sort((a, b) => (b.tags?.includes('must') - a.tags?.includes('must')) || a.day - b.day).slice(0, 12);
  const see = (href) => `<a class="see-all" href="${href}">${L('See all', 'அனைத்தும்')} ${icon('right')}</a>`;
  const sec = (title, items, href = '', id = '') => (items.length ? `<section class="row"${id ? ` id="${id}"` : ''}><div class="row-h"><h2>${esc(title)}</h2>${href ? see(href) : ''}</div><div class="rail">${items.join('')}</div></section>` : '');
  view.innerHTML = `
    ${promos.length ? `<section class="promo" aria-roledescription="carousel" aria-label="Offers and promotions"><div class="promo-track" id="promoTrack">${promos.map((x, i) => `<a class="promo-slide${x.art ? ' art-' + x.art : ''}" href="${x.href}">${x.img ? `<img src="${esc(x.img)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">` : `<span class="promo-art" aria-hidden="true">${icon(x.art === 'gift' ? 'ticket' : 'spark')}</span>`}
        <span class="promo-txt">${x.by ? `<small>${esc(x.by)}</small>` : ''}<b>${esc(x.title)}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}${x.cta ? `<em>${esc(x.cta)} ${icon('right')}</em>` : ''}</span></a>`).join('')}</div>
      <button type="button" class="promo-nav prev" data-pn="-1" aria-label="Previous">${icon('back')}</button><button type="button" class="promo-nav next" data-pn="1" aria-label="Next">${icon('right')}</button>
      <div class="car-dots">${promos.map((_, i) => `<button type="button" data-slide="${i}" aria-label="Slide ${i + 1}" aria-current="${i === 0}"></button>`).join('')}</div></section>` : ''}
    ${fresh.length ? `<section class="row"><div class="row-h"><h2>${L('Latest releases', 'புதிய வெளியீடுகள்')}</h2>${see('#movies')}</div>
      <div class="hero-car" id="heroTrack">${fresh.map((m) => `<article class="hslide" style="--c1:${m.c1};--c2:${m.c2}">${m.banner ? `<img class="hs-bg" src="${esc(m.banner)}" alt="" loading="lazy">` : `<span class="hs-bg art">${posterArt(m, { big: true })}</span>`}
        <a class="hs-post" href="#movie-${m.id}">${poster(m)}</a><div class="hs-info"><small>${esc(daysAgo(m))}</small><h3><a href="#movie-${m.id}">${esc(m.title)}</a></h3>
        <p>${m.rating ? `${icon('star')} ${m.rating.toFixed(1)}/10 · ` : ''}${esc((m.langs || [m.lang]).join(', '))} · ${esc(m.cert)} · ${mins(m.mins)}</p><p class="hs-g">${m.genres.map(esc).join(' · ')}</p>
        <div class="hero-cta"><button type="button" class="btn primary" data-book="${m.id}">${icon('ticket')}${t('book')}</button>${m.trailer ? `<button type="button" class="btn glass" data-trailer="${m.id}">${icon('play')}${L('Trailer', 'டிரெய்லர்')}</button>` : ''}</div></div></article>`).join('')}</div></section>` : ''}
    ${sec(L('Recommended movies', 'பரிந்துரைக்கப்பட்ட படங்கள்'), now.map((m) => card(m)), '#movies')}
    ${sec(L('Last few days in cinemas', 'கடைசி சில நாட்கள்'), leaving.map((m) => card(m)), '', 'leaving')}
    <section class="row"><div class="row-h"><h2>${L('The best of live events', 'சிறந்த நேரலை நிகழ்வுகள்')}</h2></div><div class="cat-tiles">${EVENT_CATS.map((c) => `<a class="ctile" href="#cat-${c.id}" style="--c1:${c.c1};--c2:${c.c2}"><span>${icon(c.icon)}</span><b>${esc(tx(c))}</b><small>${EVENTS.filter((e) => e.cat === c.id && e.day >= 0).length}+ ${L('events', 'நிகழ்வுகள்')}</small></a>`).join('')}</div></section>
    ${sec(L('Popular events', 'பிரபல நிகழ்வுகள்'), events.map(eventCard), '#cat-events')}
    ${sec(L('Coming soon', 'விரைவில்'), soon.map((m) => card(m)), '#movies')}
    ${sec(L('Premiere: new movies at home', 'பிரீமியர்'), PREMIERES.map((p) => card(p, `#premiere-${p.id}`, 'PREMIERE')), '#cat-stream')}
    ${ths.length ? `<section class="row" id="near"><div class="row-h"><h2>${L('Theatres near you', 'அருகிலுள்ள திரையரங்குகள்')}</h2>${see('#cinemas')}</div>
      <div class="locbar">${icon('pin')}<span>${LIVE.userLoc ? L('Using your location · nearest first', 'உங்கள் இருப்பிடம் · அருகில் முதலில்') : L(`Distances from the centre of ${city.en}`, `${tx(city)} மையத்திலிருந்து தூரம்`)}</span><button type="button" class="link" id="locBtn">${icon('locate')}${LIVE.userLoc ? L('Update', 'புதுப்பி') : L('Use my location', 'என் இருப்பிடம்')}</button></div>
      <div class="rail th-rail">${ths.map((th) => theatreCard(th, todayShows.filter((s) => s.theatreId === th.id).length)).join('')}</div></section>` : ''}
    ${footerHTML(siteCtx())}`;
  bindFooter(view, siteCtx());
  bindCarousel();
  $('#locBtn')?.addEventListener('click', locate);
  if (!S.city) setTimeout(() => openCitySheet(true), 300);
}
function bindCarousel() {
  const tr = $('#promoTrack'); if (!tr) return;
  const slides = $$('.promo-slide', tr), dots = $$('.car-dots button');
  let i = 0, timer = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (n) => { i = (n + slides.length) % slides.length; const sl = slides[i]; tr.scrollTo({ left: sl.offsetLeft - (tr.clientWidth - sl.clientWidth) / 2, behavior: reduce ? 'auto' : 'smooth' }); };
  tr.addEventListener('scroll', () => {
    const mid = tr.scrollLeft + tr.clientWidth / 2; let best = 0, bd = 1e9;
    slides.forEach((sl, k) => { const d = Math.abs(sl.offsetLeft + sl.clientWidth / 2 - mid); if (d < bd) { bd = d; best = k; } });
    i = best; dots.forEach((d, k) => d.setAttribute('aria-current', String(k === best)));
  }, { passive: true });
  dots.forEach((d, k) => d.addEventListener('click', () => { go(k); restart(); }));
  $$('[data-pn]').forEach((b) => b.addEventListener('click', () => { go(i + +b.dataset.pn); restart(); }));
  const restart = () => { clearInterval(timer); if (slides.length > 1 && !reduce) timer = setInterval(() => { if (!document.hidden) go(i + 1); }, 5000); };
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
// Crew for the demo movies (fictional names), so every movie page has a crew section
const CREW_NAMES = ['Karthik Subbu', 'Anitha Raman', 'Vetri Selvan', 'Priya Nair', 'Arjun Das', 'Meena Iyer', 'Rahul Menon', 'Divya Krishnan', 'Suresh Babu', 'Lakshmi Prasad', 'Imran Khan R', 'Nisha Thomas'];
const crewOf = (m) => m.crew || [['Director', 0], ['Music', 3], ['Cinematography', 6], ['Editor', 9]].map(([role, k]) => [CREW_NAMES[(hash(m.id) + k) % CREW_NAMES.length], role]);
const initials = (n) => n.replace(/^Voice:\s*/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const TAGS = ['Blockbuster', 'GreatActing', 'AwesomeStory', 'GreatMusic', 'MustWatch', 'FamilyFriendly', 'Slow', 'Average'];
function movieView(id) {
  const m = movieById(id); if (!m) return homeView();
  const up = !isNowShowing(m);
  const more = MOVIES.filter((x) => x.id !== m.id && isNowShowing(x) && x.genres.some((g) => m.genres.includes(g))).slice(0, 10);
  const person = ([name, role]) => `<div class="person"><span class="avatar" style="--h:${hash(name) % 360}">${esc(initials(name))}</span><b>${esc(name.replace(/^Voice:\s*/, ''))}</b><small>${esc(role)}</small></div>`;
  const booked = S.bookings.some((b) => !b.cancelled && b.movieId === m.id);
  view.innerHTML = `
    <section class="mbig" style="--c1:${m.c1};--c2:${m.c2}">${m.banner ? `<img class="mb-bg" src="${esc(m.banner)}" alt="" decoding="async">` : `<span class="mb-bg art">${posterArt(m, { big: true })}</span>`}
      <div class="mb-in">
        <div class="mb-post">${poster(m, { big: true })}${m.trailer ? `<button type="button" class="mb-trailer" data-trailer="${m.id}">${icon('play')}${L('Trailer', 'டிரெய்லர்')}</button>` : ''}<span class="mb-state">${up ? L('Releasing on ', 'வெளியீடு ') + fmtDate(releaseDate(m)) : L('In cinemas', 'திரையரங்குகளில்')}</span></div>
        <div class="mb-info">
          <h1>${esc(m.title)}</h1>
          ${up ? `<p class="mb-rate">${icon('bell')} ${t('interested', { n: compact(m.interest) })}</p>` : m.rating ? `<p class="mb-rate">${icon('star')} <b>${m.rating.toFixed(1)}/10</b> <span>(${compact(m.votes)} ${L('votes', 'வாக்குகள்')})</span>${booked ? `<button type="button" class="btn glass sm" id="rateBtn">${L('Rate now', 'மதிப்பிடு')}</button>` : ''}</p>` : ''}
          <div class="mb-tags">${[...(m.imax ? ['2D', 'IMAX'] : ['2D']), ...(m.langs || [m.lang])].map((x) => `<span>${esc(x)}</span>`).join('')}</div>
          <p class="mb-meta">${mins(m.mins)} • ${m.genres.map(esc).join(', ')} • ${esc(m.cert)} • ${fmtDate(releaseDate(m))}</p>
          ${leavingSoon(m) ? `<p class="leave-note">${icon('clock')}<span><b>${leftLabel(m)}</b> ${L('in cinemas.', 'மட்டும்.')}</span></p>` : ''}
          <div class="mh-cta">${up ? `<button type="button" class="btn primary lg" id="notifyBtn">${icon('bell')}${S.notify.has(m.id) ? t('notified') : t('notify')}</button>`
            : `<button type="button" class="btn primary lg" data-book="${m.id}">${t('book')}</button>`}</div>
        </div>
        <button type="button" class="btn glass sm mb-share" id="shareBtn">${icon('send')}${L('Share', 'பகிர்')}</button>
      </div></section>
    <div class="mbody">
      <section class="msec"><h2>${L('About the movie', 'படம் பற்றி')}</h2><p>${esc(m.about)}</p></section>
      ${OFFERS.length && !up ? `<section class="msec"><h2>${L('Top offers for you', 'உங்களுக்கான சலுகைகள்')}</h2><div class="ostrip">${OFFERS.slice(0, 4).map((o) => `<a class="ochip" href="#offers">${icon('check')}<span><b>${esc(o.en)}</b><small>${L('Tap to view details', 'விவரம் பார்க்க')}</small></span></a>`).join('')}</div></section>` : ''}
      ${m.cast?.length ? `<section class="msec"><h2>${L('Cast', 'நடிகர்கள்')}</h2><div class="people">${m.cast.map((n) => person([n, n.startsWith('Voice') ? 'Voice' : 'Actor'])).join('')}</div></section>` : ''}
      <section class="msec"><h2>${L('Crew', 'படக்குழு')}</h2><div class="people">${crewOf(m).map(person).join('')}</div></section>
      ${up ? '' : `<section class="msec" id="revSec"><div class="row-h"><h2>${L('Top reviews', 'சிறந்த விமர்சனங்கள்')}</h2></div><div id="revBox" class="muted">${db.mode === 'server' ? L('Loading reviews…', 'ஏற்றுகிறது…') : L('Reviews appear on the live Lumen site.', '')}</div></section>`}
      ${row(L('You might also like', 'இதுவும் பிடிக்கும்'), more.map((x) => card(x)))}
    </div>`;
  $('#notifyBtn')?.addEventListener('click', (e) => { const on = !S.notify.has(m.id); app.setNotify(m.id, on); e.currentTarget.innerHTML = icon('bell') + (on ? t('notified') : t('notify')); toast(on ? t('notified') : '✓'); });
  $('#shareBtn').addEventListener('click', async () => {
    const data = { title: m.title, text: `${m.title} on Lumen`, url: location.href };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); toast(L('Link copied', 'இணைப்பு நகலெடுக்கப்பட்டது')); } } catch (e) {}
  });
  const rate = () => {
    let rating = 8; const tags = new Set();
    openSheet(`<h2 class="sh-t">${icon('star')}${L('Rate', 'மதிப்பிடு')} ${esc(m.title)}</h2>
      <div class="rate-row" id="rRow">${Array.from({ length: 10 }, (_, k) => `<button type="button" data-r="${k + 1}" aria-pressed="${k + 1 === rating}">${k + 1}</button>`).join('')}</div>
      <div class="xchips" id="rTags">${TAGS.map((x) => `<button type="button" class="fchip sm" data-t="${x}" aria-pressed="false">#${x}</button>`).join('')}</div>
      <textarea class="input" id="rText" rows="3" maxlength="600" placeholder="${L('What did you think? (optional)', 'உங்கள் கருத்து')}" style="padding:10px 12px"></textarea><p class="err" id="rErr"></p>
      <button type="button" class="btn primary block" id="rGo">${L('Submit review', 'சமர்ப்பி')}</button>`, (sh) => {
      sh.querySelector('#rRow').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; rating = +b.dataset.r; sh.querySelectorAll('#rRow button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.r === rating))); });
      sh.querySelector('#rTags').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; tags.has(b.dataset.t) ? tags.delete(b.dataset.t) : tags.size < 3 && tags.add(b.dataset.t); b.setAttribute('aria-pressed', String(tags.has(b.dataset.t))); });
      sh.querySelector('#rGo').addEventListener('click', async () => {
        if (!db.me) { closeSheet(); customerSignIn(panelCtx(), () => rate()); return; }
        try { await db.review({ movieId: m.id, rating, tags: [...tags], text: sh.querySelector('#rText').value }); closeSheet(); toast(L('Thanks for your review!', 'நன்றி!')); loadReviews(); }
        catch (e) { sh.querySelector('#rErr').textContent = e.message; }
      });
    });
  };
  $('#rateBtn')?.addEventListener('click', rate);
  async function loadReviews() {
    const box = $('#revBox'); if (!box || db.mode !== 'server') return;
    try {
      const r = await db.reviews(m.id); if (!$('#revBox')) return;
      const tagRow = Object.entries(r.tags).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="fchip sm">#${esc(k)} <b>${n}</b></span>`).join('');
      box.className = '';
      box.innerHTML = r.count ? `<p class="muted">${L(`${r.count} reviews · average ${r.avg}/10 from people who booked on Lumen`, `${r.count} விமர்சனங்கள்`)}</p>${tagRow ? `<div class="xchips">${tagRow}</div>` : ''}
        <div class="rv-rail">${r.reviews.map((x) => `<article class="rv"><header><span class="avatar sm" style="--h:${hash(x.name) % 360}">${esc(initials(x.name))}</span><span><b>${esc(x.name)}</b><small>${L('Booked on Lumen', 'Lumen-இல் பதிவு')}</small></span><span class="rv-score">${icon('star')}${x.rating}/10</span></header>
          ${x.tags?.length ? `<p class="rv-tags">${x.tags.map((t2) => '#' + esc(t2)).join(' ')}</p>` : ''}${x.text ? `<p>${esc(x.text)}</p>` : ''}<small class="muted">${fmtDate(new Date(x.at))}</small></article>`).join('')}</div>`
        : `<div class="empty-box">${icon('star')}<b>${L('No reviews yet', 'இன்னும் விமர்சனங்கள் இல்லை')}</b><small>${L('People who book this movie on Lumen can rate it after the show.', 'பதிவு செய்தவர்கள் மதிப்பிடலாம்.')}</small>${booked ? `<button type="button" class="btn primary sm" id="rateBtn2">${L('Rate now', 'மதிப்பிடு')}</button>` : ''}</div>`;
      $('#rateBtn2')?.addEventListener('click', rate);
    } catch (e) { box.textContent = ''; }
  }
  loadReviews();
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
      ${sel('fPart', [['any', state.lang === 'ta' ? 'விருப்ப நேரம்' : 'Preferred time'], ['morning', t('morning')], ['afternoon', t('afternoon')], ['evening', t('evening')], ['night', t('night')], ['early', state.lang === 'ta' ? 'அதிகாலை (10 AM முன்)' : 'Early morning'], ['late', state.lang === 'ta' ? 'இரவு (9 PM பின்)' : 'Late night']], SF.part)}
      ${sel('fSort', [['distance', state.lang === 'ta' ? 'அருகில் முதலில்' : 'Sort: Nearest'], ['time', 'Sort: Earliest show'], ['price', 'Sort: Lowest price'], ['view', 'Sort: Best view']], SF.sort)}
      <input id="fQ" class="input" style="min-height:38px;max-width:200px" placeholder="${state.lang === 'ta' ? 'திரையரங்கு தேடு' : 'Search theatre'}" value="${esc(SF.q)}">
    </div>
    <div class="legend-line"><span><i style="background:var(--t-av)"></i>${t('avail').toUpperCase()}</span><span><i style="background:var(--t-fast)"></i>${t('fast').toUpperCase()}</span><span><i style="background:var(--bad)"></i>${t('almost').toUpperCase()}</span><span><i style="background:var(--t-full)"></i>${state.lang === 'ta' ? 'நிரம்பியது' : 'SOLD OUT'}</span></div>
    <div id="theatreList"></div>`;
  const list = $('#theatreList');
  const lowPrice = (s) => Math.min(...Object.values(pricesOf(s)));
  function renderList() {
    let shows = showsFor({ cityId: app.city(), dk: SF.dk, movieId: m.id }).filter((s) => s.lang === SF.lang || !(m.langs || []).length);
    shows = shows.filter((s) => (SF.fmt === 'all' || s.fmt === SF.fmt)
      && (SF.part === 'any' || (SF.part === 'early' ? +s.hm < 1000 : SF.part === 'late' ? +s.hm >= 2100 : partOfDay(s.hm) === SF.part))
      && (SF.price === 'any' || (SF.price === 'lo' ? lowPrice(s) < 200 : SF.price === 'mid' ? lowPrice(s) >= 200 && lowPrice(s) <= 400 : lowPrice(s) > 400)));
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
    const ta = state.lang === 'ta';
    list.innerHTML = rows.map(([th, ss]) => {
      const halls = [...new Set(ss.map((s) => s.hall))];
      return `<article class="th2">
        <div class="th2-l"><button type="button" class="fav" data-fav="${th.id}" aria-pressed="${S.favs.has(th.id)}" aria-label="Favourite"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg></button>
          <div><a class="th2-n" href="#theatre-${th.id}">${esc(th.name)}: ${esc(th.area)}</a>
          <small>${t('km', { k: th.km })} · ${halls.map((h) => esc(tx(HALLS[h]))).join(' / ')}</small>
          <span class="th2-f"><span class="ok">${icon('check')}${ta ? 'ரத்து செய்யலாம்' : 'Cancellation available'}</span><span>${icon('popcorn')}${ta ? 'உணவு' : 'Food'}</span>${th.amen.includes('Wheelchair access') ? `<span>${icon('wheel')}</span>` : ''}</span></div></div>
        <div class="times th2-t">${ss.map((s) => timeTag(s, `<b>${hmLabel(s.hm)}</b><small>${esc(s.fmt)}${s.lang !== SF.lang ? ' · ' + (LANG3[s.lang] || '') : ''}</small>`)).join('')}</div></article>`;
    }).join('') + `<p class="note">${icon('check')} ${t('all_in')}</p>`;
  }
  renderList();
  view.querySelector('.days').addEventListener('click', (e) => { const b = e.target.closest('[data-dk]'); if (!b) return; SF.dk = b.dataset.dk; $$('.day', view).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderList(); });
  [['fFmt', 'fmt'], ['fPrice', 'price'], ['fPart', 'part'], ['fSort', 'sort']].forEach(([i, k]) => $('#' + i).addEventListener('change', (e) => { SF[k] = e.target.value; renderList(); }));
  $('#fQ').addEventListener('input', (e) => { SF.q = e.target.value; renderList(); });
  // Hover a time: price and seats left per section (like a ticket counter board)
  const tipEl = $('#tip');
  list.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const a = e.target.closest('.time'); if (!a) return;
    const id2 = (a.getAttribute('href') || a.dataset.show || '').replace('#show-', ''); const s = showById(id2); if (!s) return;
    tipEl.innerHTML = classBoard(s); tipEl.classList.add('tip-board');
    const r = a.getBoundingClientRect(); tipEl.style.left = r.left + r.width / 2 + 'px'; tipEl.style.top = r.top - 6 + 'px'; tipEl.hidden = false;
  });
  list.addEventListener('pointerout', (e) => { if (e.target.closest('.time')) { tipEl.hidden = true; tipEl.classList.remove('tip-board'); } });
  onLeave(() => { tipEl.hidden = true; tipEl.classList.remove('tip-board'); });
  list.addEventListener('click', (e) => { const f = e.target.closest('[data-fav]'); if (!f) return; const id2 = f.dataset.fav; S.favs.has(id2) ? S.favs.delete(id2) : S.favs.add(id2); store.set('favs', [...S.favs]); f.setAttribute('aria-pressed', S.favs.has(id2)); });
}

/* ---------- cinemas in the city ---------- */
function cinemasView() {
  const city = cityById(app.city()), ta = state.lang === 'ta';
  const ths = theatresFor(city.id).sort((a, b) => (S.favs.has(b.id) - S.favs.has(a.id)) || a.km - b.km);
  view.innerHTML = `<div class="page-h"><h1>${ta ? `${tx(city)} திரையரங்குகள்` : `Cinemas in ${esc(city.en)}`}</h1><small class="muted">${ths.length} ${ta ? 'திரையரங்குகள்' : 'cinemas'} · ${LIVE.userLoc ? (ta ? 'அருகில் முதலில்' : 'nearest first') : (ta ? 'நகர மையத்திலிருந்து' : 'from the city centre')}</small></div>
    <input class="input" id="cnQ" placeholder="${ta ? 'திரையரங்கு அல்லது பகுதி தேடு' : 'Search cinema or area'}" style="max-width:420px;margin:6px 0 10px">
    <div class="cn-list" id="cnList"></div>`;
  const draw = (q = '') => { $('#cnList').innerHTML = ths.filter((th) => !q || (th.name + ' ' + th.area).toLowerCase().includes(q.toLowerCase())).map((th) => `<div class="cn">
      <button type="button" class="fav" data-fav="${th.id}" aria-pressed="${S.favs.has(th.id)}" aria-label="Favourite"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg></button>
      <a href="#theatre-${th.id}"><b>${esc(th.name)}: ${esc(th.area)}</b><small>${esc(th.area)}, ${esc(tx(city))} · ${t('km', { k: th.km })} · ${[...new Set(th.screens.map((x) => x.fmt))].map(esc).join(', ')}</small></a>
      <a class="iconbtn sm" href="#theatre-${th.id}" aria-label="Open">${icon('right')}</a></div>`).join('') || `<p class="empty">${t('no_shows')}</p>`; };
  draw();
  $('#cnQ').addEventListener('input', (e) => draw(e.target.value));
  $('#cnList').addEventListener('click', (e) => { const f = e.target.closest('[data-fav]'); if (!f) return; const id = f.dataset.fav; S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id); store.set('favs', [...S.favs]); f.setAttribute('aria-pressed', S.favs.has(id)); });
}

/* ---------- theatre ---------- */
function theatreView(id) {
  const th = theatreById(id); if (!th) return homeView();
  let tdk = dayKey(today());
  const shows = showsFor({ cityId: th.cityId, dk: tdk, theatreId: th.id });
  const canEdit = db.me && (db.me.role === 'admin' || (db.me.theatreIds || []).includes(th.id));
  view.innerHTML = `<div class="topbar"><button class="iconbtn" type="button" id="thBack" aria-label="${t('back')}">${icon('back')}</button></div>
    <section class="theatre-h"><div class="th-cover">${th.cover ? `<img src="${esc(th.cover)}" alt="${esc(th.name)}" decoding="async">` : ticketArt(th.name)}</div>
    <div class="th-info"><h1>${esc(th.name)}</h1><p class="meta">${icon('pin')} ${esc(th.area)}, ${esc(tx(CITIES.find((c) => c.id === th.cityId)))} · ${t('km', { k: th.km })}${LIVE.userLoc ? ' ' + L('from you', 'உங்களிடமிருந்து') : ''}</p>
    <div class="tags">${th.amen.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>
    <a class="link" href="https://www.google.com/maps/search/?api=1&query=${th.lat.toFixed(5)},${th.lng.toFixed(5)}" target="_blank" rel="noopener">${icon('pin')}${L('Directions', 'வழி')}</a></div></section>
    <div class="days" id="thDays" role="group" aria-label="Date">${Array.from({ length: 7 }, (_, i) => addDays(today(), i)).map((d, i) => `<button type="button" class="day" data-dk="${dayKey(d)}" aria-pressed="${i === 0}"><small>${i === 0 ? t('today') : d.toLocaleDateString(state.lang === 'ta' ? 'ta-IN' : 'en-IN', { weekday: 'short' })}</small><b>${String(d.getDate()).padStart(2, '0')}</b><small>${d.toLocaleDateString('en-IN', { month: 'short' })}</small></button>`).join('')}</div>
    <div id="thMovies"></div>
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
  // Movie-wise showtimes for the picked day
  function drawMovies() {
    const ss = showsFor({ cityId: th.cityId, dk: tdk, theatreId: th.id }), by = new Map();
    ss.forEach((x) => { if (!by.has(x.movieId)) by.set(x.movieId, []); by.get(x.movieId).push(x); });
    $('#thMovies').innerHTML = by.size ? [...by.entries()].map(([mid, list]) => { const mv = movieById(mid); return `<article class="th2">
      <div class="th2-l"><a class="th2-p" href="#movie-${mv.id}">${poster(mv)}</a><div><a class="th2-n" href="#movie-${mv.id}">${esc(mv.title)}</a><small>${esc(mv.cert)} · ${esc([...new Set(list.map((x) => x.lang))].join(', '))} · ${mins(mv.mins)}</small></div></div>
      <div class="times th2-t">${list.map((x) => timeTag(x, `<b>${hmLabel(x.hm)}</b><small>${esc(x.fmt)} · ${esc(th.screens[x.screenIdx]?.name || '')}</small>`)).join('')}</div></article>`; }).join('')
      : `<p class="empty">${t('no_shows')}</p>`;
  }
  drawMovies();
  $('#thDays').addEventListener('click', (e) => { const b = e.target.closest('[data-dk]'); if (!b) return; tdk = b.dataset.dk; $$('#thDays .day').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawMovies(); });
  const tipEl = $('#tip');
  $('#thMovies').addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') return; const a = e.target.closest('.time'); if (!a) return; const x = showById((a.getAttribute('href') || a.dataset.show || '').replace('#show-', '')); if (!x) return; tipEl.innerHTML = classBoard(x); tipEl.classList.add('tip-board'); const r = a.getBoundingClientRect(); tipEl.style.left = r.left + r.width / 2 + 'px'; tipEl.style.top = r.top - 6 + 'px'; tipEl.hidden = false; });
  $('#thMovies').addEventListener('pointerout', (e) => { if (e.target.closest('.time')) { tipEl.hidden = true; tipEl.classList.remove('tip-board'); } });
  onLeave(() => { tipEl.hidden = true; tipEl.classList.remove('tip-board'); });
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
  const counter = new Set(counterOf(show));
  const counterIds = lay.seats.filter((x) => counter.has(x.cls)).map((x) => x.id);
  const booked = bookedFor(show, lay, app.mySeats(show.id));
  const selected = new Set();
  let count = 0, focus = null, viewMode = 'class';
  const best = new Set([...lay.seats].filter((s) => !counter.has(s.cls)).sort((a, b) => b.score - a.score).slice(0, Math.round(lay.seats.length * 0.12)).map((s) => s.id));
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
  const map = mountMap($('#map'), lay, { booked, selected, prices, best, counter, onTap, onHover: hoverTip });
  onLeave(() => map.destroy());
  function legend() {
    const ta = state.lang === 'ta';
    $('#legend').innerHTML = viewMode === 'view'
      ? `<span><i style="background:${scoreColor(95)}"></i>${t('l_perfect')}</span><span><i style="background:${scoreColor(70)}"></i>${t('l_good')}</span><span><i style="background:${scoreColor(40)}"></i>${t('l_poor')}</span><span><i class="lg-sold"></i>${ta ? 'விற்றது' : 'Sold'}</span>`
      : `<span><i class="lg-av"></i>${ta ? 'கிடைக்கும்' : 'Available'}</span><span><i class="lg-sel"></i>${ta ? 'தேர்வு' : 'Selected'}</span><span><i class="lg-sold"></i>${ta ? 'விற்றது' : 'Sold'}</span><span><i class="lg-best"></i>${ta ? 'சிறந்த பார்வை' : 'Bestseller'}</span>${counter.size ? `<span><i class="lg-cnt"></i>${ta ? 'கவுண்டரில் மட்டும்' : 'Counter only'}</span>` : ''}`;
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
    if (seat.disabled) return;
    if (counter.has(seat.cls)) { toast(state.lang === 'ta' ? 'இந்தப் பகுதி திரையரங்கு கவுண்டரில் மட்டும் விற்கப்படுகிறது.' : `${clsName(seat.cls)} is sold only at the theatre counter.`); return; }
    if (booked.has(seat.id)) { toast(t('t_taken', { id: seat.id })); return; }
    if (!count) { askCount(() => onTap(seat)); return; }
    const grp = seat.partner ? [seat, seat.partner] : [seat];
    if (selected.has(seat.id)) { setSel([...selected].filter((id) => !grp.some((g) => g.id === id))); focus = [...selected].map((id) => lay.byId.get(id)).pop() || null; updatePreview(); return; }
    let cur = [...selected];
    if (cur.length >= count) cur = [];
    const need = count - cur.length;
    const taken = new Set([...booked, ...cur, ...counterIds]);
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
    const clsAvail = (k) => { if (counter.has(k)) return ['', state.lang === 'ta' ? 'கவுண்டரில் மட்டும்' : 'Counter only']; const all = lay.seats.filter((s) => s.cls === k); const free = all.filter((s) => !booked.has(s.id)).length / all.length; return free < 0.1 ? ['bad', state.lang === 'ta' ? 'நிரம்பியது' : 'Almost full'] : free < 0.4 ? ['', t('fast')] : ['ok', t('avail')]; };
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
        else { const run = bestBlock(lay, new Set([...booked, ...counterIds]), count); if (run) { setSel(run.map((s) => s.id)); focus = run[Math.floor(run.length / 2)]; map.focus(focus); updatePreview(); } else { toast(t('t_none', { n: count })); refresh(); } }
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
    sub: `${fmtDate(d)} | ${hmLabel(ev.hm)}`, detail: ev.kind, place: `${ev.venue}, ${tx(cityById(app.city()))}`, cancellable: false, start: d.getTime(), snacks: {} };
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
  if (o.card && method !== 'Card') return o.card === 'debit' ? 'Pay with a debit card to use this' : 'Pay with a credit card to use this';
  if (o.wallet && method !== 'Wallet') return 'Pay with a wallet to use this';
  if (o.later && method !== 'Later') return 'Choose Pay later to use this';
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
    else if (P.method === 'Gift') {
      d.innerHTML = `<div class="offer-row"><input class="input" id="gcCode" placeholder="Gift card code, e.g. LG3F9A…" value="${esc(P.gift?.code || '')}" autocomplete="off"><button type="button" class="btn ghost" id="gcApply">Apply</button></div>${P.gift ? `<p class="ok-t">${icon('check')}Balance ${inr(P.gift.balance)}</p>` : ''}<p class="muted small">Don’t have one? <a class="link" href="#giftcards">Buy a gift card</a></p>`;
      $('#gcApply').addEventListener('click', async () => {
        const code = $('#gcCode').value.trim().toUpperCase(); if (!code) return;
        if (db.mode !== 'server') { toast('Gift cards work on the live Lumen site.'); return; }
        try { const r = await db.giftCheck(code); P.gift = { code, balance: r.balance }; if (!r.balance) toast('This gift card has no balance left.'); methods(); summary(); } catch (e) { P.gift = null; toast(e.message); methods(); summary(); }
      });
    }
    else if (P.method === 'NetBanking') d.innerHTML = `<label class="dd"><select class="input">${['State Bank', 'HDFC', 'ICICI', 'Axis', 'Indian Bank', 'Canara'].map((b) => `<option>${b}</option>`).join('')}</select></label>`;
    else if (P.method === 'Later') d.innerHTML = `<p class="muted" style="margin:0">${state.lang === 'ta' ? '15 நாட்களுக்குள் செலுத்துங்கள்.' : 'Pay within 15 days. No extra charge if paid on time.'}</p>`;
    else d.innerHTML = `<p class="muted" style="margin:0">${S.points} points available. ${inr(Math.min(S.points / 4, priceOrder(o, P).total))} will be taken off.</p>`;
  }
  function summary() {
    const p = priceOrder(o, P);
    const pts = P.method === 'Points' ? Math.min(S.points / 4, p.total) : 0;
    const gc = P.method === 'Gift' && P.gift ? Math.min(P.gift.balance, p.total - pts) : 0;
    const payable = Math.round((p.total - pts - gc) * 100) / 100;
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
        ${gc ? `<tr class="disc"><td>Gift card ${esc(P.gift.code)}</td><td>− ${money(gc)}</td></tr>` : ''}
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
      try { b = await saveBooking(o, P.method, payable, { donate: P.donate, offer: P.offer?.code || null, fees: p.conv + p.gst, discount: p.disc, ...(gc ? { gift: { code: P.gift.code, amount: gc } } : {}) }); }
      catch (err) { btn.disabled = false; toast(err.status === 400 ? err.message : state.lang === 'ta' ? 'இணைப்பு இல்லை. மீண்டும் முயற்சிக்கவும்.' : 'Payment could not be completed. Check your connection and try again.'); return; }
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
  if (o.kind === 'movie') { const sh = showById(o.showId); if (sh) { const pr = pricesOf(sh), lay = layoutOf(sh); b.theatreId = sh.theatreId; b.movieId = sh.movieId; b.ticketAmount = b.seats.reduce((a, id) => a + (pr[lay.byId.get(id)?.cls] || 0), 0); } }
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
      <p class="meta">${icon('clock')} ${fmtDate(addDays(today(), ev.day))} · ${hmLabel(ev.hm)} · ${Math.round(ev.mins / 60 * 10) / 10} h</p><p class="meta">${icon('pin')} ${esc(ev.venue)}, ${esc(tx(cityById(app.city())))}</p><p class="about">${esc(ev.about)}</p></section>
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
function openCitySheet(first = false) { cityPicker(siteCtx(), first); }
// What the shared site pages need from the app
const siteCtx = () => ({ ...panelCtx(), app, S, store, card, locate, mins });
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
