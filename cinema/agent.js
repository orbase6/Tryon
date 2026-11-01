// "Ask Lumen" booking assistant. Understands English, Tamil and Tanglish
// requests on the device (no server), asks only for what is missing, picks the
// best show and seats, and books after the person says yes.
import { MOVIES, CITIES, movieById, isNowShowing, theatresFor, theatreById, showsFor, today, addDays, dayKey, fromKey, hmLabel, partOfDay, FEE_PER_TICKET, releaseDate } from './data.js';
import { layoutOf, pricesOf, bookedFor, bestBlock, scoreLabel, HALLS } from './layout.js';
import { t, tx, state, icon, inr, esc, clsName, fmtDate, $ } from './ui.js';
import { loadNLU, nluParse } from './nlu.js';

const norm = (s) => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s:.]/gu, ' ').replace(/\s+/g, ' ').trim();
const ALIASES = {
  kaalam: ['kaalam', 'kalam', 'kaalan', 'காலம்', 'last monsoon'], neonkadal: ['neon kadal', 'neon', 'kadal', 'நியான்'], paati: ['paati', 'patti', 'paatti', 'kitchen', 'பாட்டி'],
  orbit9: ['orbit nine', 'orbit 9', 'orbit', 'ஆர்பிட்'], rajarumble: ['raja rumble', 'raja', 'rumble', 'ராஜா'], mazhavil: ['mazhavil', 'mazhai vil', 'mazhavillu', 'rainbow', 'மழவில்'],
  lastferry: ['last ferry', 'ferry'], kanna: ['little kanna', 'kanna', 'கண்ணா'], dhool: ['dhool', 'dhool express', 'express'], silentvalley: ['silent valley', 'silent', 'valley'],
  agniparavai: ['agni paravai', 'agni', 'paravai', 'அக்னி'], moonlit: ['moonlit', 'moonlit market', 'market'], kuyil: ['kuyil', 'குயில்'], starfall: ['starfall', 'star fall'],
};
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, onnu: 1, oru: 1, ondru: 1, rendu: 2, irandu: 2, randu: 2, moonu: 3, munu: 3, moondru: 3, naalu: 4, nalu: 4, naangu: 4, anju: 5, ainthu: 5, aaru: 6, ezhu: 7, elu: 7, ettu: 8, onbathu: 9, pathu: 10, 'ஒன்று': 1, 'ஒரு': 1, 'இரண்டு': 2, 'ரெண்டு': 2, 'மூன்று': 3, 'மூணு': 3, 'நான்கு': 4, 'நாலு': 4, 'ஐந்து': 5, 'அஞ்சு': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10, couple: 2, jodi: 2, pair: 2 };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const has = (s, list) => list.some((w) => new RegExp(`(^|\\s)${w}(\\s|$)`).test(s) || (/[^\x00-\x7F]/.test(w) && s.includes(w)));

export function parse(text, cityId) {
  const s = ' ' + norm(text) + ' ';
  const out = {};
  // movie
  let best = null;
  for (const [id, al] of Object.entries(ALIASES)) for (const a of al) if (s.includes(' ' + a + ' ') || (/[^\x00-\x7F]/.test(a) && s.includes(a))) { if (!best || a.length > best.len) best = { id, len: a.length }; }
  if (best) out.movieId = best.id;
  // count
  const m = s.match(/(?:^|\s)(\d{1,2})\s*(?:tickets?|seats?|per(?:son|sons)?|pere?|people|peru|டிக்கெட்|இருக்கை|பேர்)?(?=\s)/);
  if (m && +m[1] >= 1 && +m[1] <= 10 && !/\d\s*(?:pm|am|mani|:)/.test(s.slice(s.indexOf(m[1]), s.indexOf(m[1]) + 6))) out.count = +m[1];
  if (!out.count) for (const [w, n] of Object.entries(NUM)) if (has(s, [w])) { out.count = n; break; }
  if (has(s, ['family'])) out.count = out.count || 4;
  // date
  const td = today();
  if (has(s, ['day after tomorrow', 'nalannaikku', 'naalanniku', 'மறுநாள்'])) out.dk = dayKey(addDays(td, 2));
  else if (has(s, ['tomorrow', 'tmrw', 'naalaikku', 'nalaiku', 'naalai', 'நாளை', 'நாளைக்கு'])) out.dk = dayKey(addDays(td, 1));
  else if (has(s, ['today', 'tonight', 'inniki', 'innaikku', 'indru', 'இன்று', 'இன்னைக்கு', 'now'])) out.dk = dayKey(td);
  else DAYS.forEach((d, i) => { if (has(s, [d, d.slice(0, 3)])) { let k = (i - td.getDay() + 7) % 7; if (k === 0) k = 7; out.dk = dayKey(addDays(td, k)); } });
  // time of day / exact time
  if (has(s, ['morning', 'kaalai', 'காலை'])) out.part = 'morning';
  else if (has(s, ['afternoon', 'noon', 'madhiyam', 'mathiyam', 'மதியம்'])) out.part = 'afternoon';
  else if (has(s, ['evening', 'maalai', 'saayangalam', 'first show', 'மாலை', 'சாயங்காலம்'])) out.part = 'evening';
  else if (has(s, ['night', 'tonight', 'iravu', 'late', 'second show', 'இரவு', 'ராத்திரி'])) out.part = 'night';
  const tm = s.match(/(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm|mani)/);
  if (tm) { let h = +tm[1]; if (tm[3] === 'pm' && h < 12) h += 12; if (tm[3] === 'mani' && h < 9) h += 12; out.hour = h + (tm[2] ? +tm[2] / 60 : 0); }
  // place
  const city = CITIES.find((c) => has(s, [c.en.toLowerCase()]) || s.includes(c.ta));
  if (city) out.cityId = city.id;
  const ths = theatresFor(out.cityId || cityId);
  const th = ths.find((x) => has(s, [x.name.toLowerCase(), x.name.toLowerCase().split(' ')[0], x.area.toLowerCase()]));
  if (th) out.theatreId = th.id;
  // seat preference
  if (has(s, ['recliner', 'recliners', 'sofa', 'couple sofa', 'ரெக்லைனர்'])) out.pref = 'recliner';
  else if (has(s, ['balcony', 'பால்கனி'])) out.pref = 'balcony';
  else if (has(s, ['cheap', 'cheapest', 'budget', 'kammi', 'low price', 'கம்மி', 'குறைந்த'])) out.pref = 'cheap';
  else if (has(s, ['back', 'last row', 'pinnadi', 'பின்'])) out.pref = 'back';
  else if (has(s, ['front', 'munnadi', 'முன்'])) out.pref = 'front';
  else if (has(s, ['centre', 'center', 'middle', 'nadu', 'naduvula', 'best', 'நடு', 'நடுவில்'])) out.pref = 'centre';
  if (has(s, ['imax', 'big screen', 'periya screen'])) out.imax = true;
  // replies
  if (has(s, ['yes', 'ok', 'okay', 'confirm', 'book it', 'book', 'sari', 'seri', 'aama', 'podu', 'ஆமா', 'சரி', 'ஆம்', 'பண்ணு'])) out.yes = true;
  if (has(s, ['no', 'illa', 'vendam', 'change', 'other', 'vera', 'வேண்டாம்', 'இல்லை', 'வேற'])) out.no = true;
  if (has(s, ['my tickets', 'my ticket', 'bookings', 'en ticket'])) out.myTickets = true;
  return out;
}

// Edit distance, for spelling mistakes in movie names and numbers
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function fuzzyMovie(span) {
  const s = norm(span); let best = null;
  for (const [id, al] of Object.entries(ALIASES)) for (const a of al) {
    const d = lev(s, a), lim = Math.max(1, Math.floor(a.length / 4));
    if (d <= lim && (!best || d < best.d)) best = { id, d };
  }
  return best?.id || null;
}
function fuzzyCount(span) {
  const s = norm(span).split(' ')[0];
  if (/^\d{1,2}$/.test(s)) return Math.min(10, +s);
  let best = null; for (const [w, n] of Object.entries(NUM)) { const d = lev(s, w); if (d <= (w.length > 4 ? 1 : 0) && (!best || d < best.d)) best = { n, d }; }
  return best?.n || null;
}
const DATE_W = { today: 0, tonight: 0, inniki: 0, innaikku: 0, indru: 0, tomorrow: 1, naalaikku: 1, nalaiku: 1, naalai: 1 };
const PART_W = { morning: 'morning', kaalai: 'morning', afternoon: 'afternoon', madhiyam: 'afternoon', evening: 'evening', maalai: 'evening', saayangalam: 'evening', night: 'night', iravu: 'night' };
const PREF_W = { recliner: 'recliner', balcony: 'balcony', back: 'back', front: 'front', centre: 'centre', center: 'centre', middle: 'centre', cheap: 'cheap', cheapest: 'cheap', budget: 'cheap' };
function fuzzyWord(span, dict) {
  for (const w of norm(span).split(' ')) {
    if (w.length < 4 || !/^[a-z]+$/.test(w)) continue;
    let best = null; for (const [k, v] of Object.entries(dict)) { const d = lev(w, k); if (d <= (k.length > 6 ? 2 : 1) && (!best || d < best.d)) best = { v, d }; }
    if (best) return best.v;
  }
  return null;
}
// Our model finds the slots; the catalogue resolver turns each slot into a real movie, date, theatre…
export function understand(text, cityId) {
  const rule = parse(text, cityId);
  const n = nluParse(text);
  if (!n || n.conf < 0.45) return { ...rule, via: 'rules' };
  const out = { via: 'model', ms: n.ms, conf: n.conf, intent: n.intent };
  const S = n.slots, one = (k) => (S[k] || []).join(' ');
  if (S.MOVIE) out.movieId = parse(one('MOVIE'), cityId).movieId || fuzzyMovie(one('MOVIE'));
  if (S.COUNT) out.count = parse(one('COUNT') + ' ', cityId).count || fuzzyCount(one('COUNT'));
  if (S.DATE) { out.dk = parse(one('DATE'), cityId).dk; if (!out.dk) { const k = fuzzyWord(one('DATE'), DATE_W); if (k != null) out.dk = dayKey(addDays(today(), k)); } }
  if (S.TIME) { const r = parse(one('TIME'), cityId); out.part = r.part; out.hour = r.hour; if (/second show|late/.test(one('TIME'))) out.part = 'night'; if (/first show|matinee|noon/.test(one('TIME'))) out.part = out.part || (/first/.test(one('TIME')) ? 'evening' : 'afternoon'); }
  if (S.PLACE) { const r = parse(one('PLACE'), cityId); out.theatreId = r.theatreId; out.cityId = r.cityId; }
  if (S.PREF) out.pref = parse(one('PREF'), cityId).pref || fuzzyWord(one('PREF'), PREF_W) || 'centre';
  if (S.TIME && !out.part && out.hour == null) out.part = fuzzyWord(one('TIME'), PART_W);
  if (S.FORMAT && /imax|big|periya/.test(one('FORMAT'))) out.imax = true;
  // anything the model did not tag but the rules are sure about
  for (const k of ['movieId', 'dk', 'part', 'hour', 'theatreId', 'cityId', 'pref']) if (out[k] == null && rule[k] != null) out[k] = rule[k];
  if (out.count == null && rule.count != null && !S.TIME) out.count = rule.count;
  out.yes = n.intent === 'confirm'; out.no = n.intent === 'deny';
  out.myTickets = n.intent === 'my_tickets' || n.intent === 'cancel_booking';
  out.notify = n.intent === 'notify'; out.help = n.intent === 'help';
  return out;
}

const L = () => state.lang;
const say = { // reply templates
  hello: () => (L() === 'ta' ? 'வணக்கம்! எந்த படம், எந்த நாள், எத்தனை இருக்கை என்று சொல்லுங்கள். உதாரணம்: "நாளை மாலை Kaalam 2 டிக்கெட்".' : 'Hi! Tell me the movie, the day and how many seats. For example: "2 tickets for Kaalam tomorrow evening".'),
  whichMovie: () => (L() === 'ta' ? 'எந்த படம் பார்க்க வேண்டும்?' : 'Which movie would you like to watch?'),
  howMany: (m) => (L() === 'ta' ? `${m.title} — எத்தனை இருக்கைகள்?` : `${m.title}. How many seats?`),
  upcoming: (m) => (L() === 'ta' ? `${m.title} ${fmtDate(releaseDate(m))} அன்று வெளியாகிறது. நினைவூட்டவா?` : `${m.title} releases on ${fmtDate(releaseDate(m))}. Want a reminder when bookings open?`),
  noShows: (m) => (L() === 'ta' ? `${m.title}-க்கு அந்த நேரத்தில் காட்சி இல்லை. அடுத்த வாய்ப்புகள்:` : `No ${m.title} shows match that. Here are the next options:`),
  propose: (p) => (L() === 'ta'
    ? `${p.movie.title} · ${p.day} ${hmLabel(p.show.hm)} · ${p.th.name}, ${p.th.area}. இருக்கைகள் ${p.seatsTxt} (${clsName(p.seats[0].cls)}), பார்வை மதிப்பு ${p.score}/100. மொத்தம் ${inr(p.total)}. புக் செய்யவா?`
    : `${p.movie.title} · ${p.day} at ${hmLabel(p.show.hm)} · ${p.th.name}, ${p.th.area}. Seats ${p.seatsTxt} (${clsName(p.seats[0].cls)}), view score ${p.score}/100. Total ${inr(p.total)}. Shall I book it?`),
  booked: (p) => (L() === 'ta' ? `முடிந்தது! ${p.seatsTxt} உங்களுக்கு. டிக்கெட் கீழே.` : `Done! ${p.seatsTxt} are yours. Your ticket is below.`),
  full: () => (L() === 'ta' ? 'அந்த காட்சியில் அவ்வளவு இருக்கைகள் சேர்ந்து இல்லை. வேறு நேரம் பார்க்கலாம்:' : 'That show has no seats together for your group. Other times:'),
  notUnderstood: () => (L() === 'ta' ? 'மன்னிக்கவும், புரியவில்லை. படத்தின் பெயரைச் சொல்லுங்கள், அல்லது கீழே ஒன்றைத் தொடுங்கள்.' : 'Sorry, I didn’t catch that. Say a movie name, or tap one below.'),
  reminder: () => (L() === 'ta' ? 'சரி, நினைவூட்டுவோம்.' : 'Done. I’ll remind you.'),
};

export function createAgent(app) {
  let ctx = {}, proposal = null, alts = [];
  const sheet = $('#agent');
  const log = $('#agentLog'), chipsEl = $('#agentChips'), input = $('#agentInput');
  let speakOn = false;
  try { speakOn = localStorage.getItem('lumen.speak') === '1'; } catch (e) {}

  function bubble(text, who = 'bot', html = null) {
    const d = document.createElement('div'); d.className = 'msg ' + who;
    if (html) d.innerHTML = html; else d.textContent = text;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    if (who === 'bot' && speakOn && 'speechSynthesis' in window) {
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = L() === 'ta' ? 'ta-IN' : 'en-IN'; u.rate = 1.02; speechSynthesis.speak(u); } catch (e) {}
    }
  }
  function chips(list) {
    chipsEl.innerHTML = list.map((c, i) => `<button type="button" class="chip-btn${c.primary ? ' primary' : ''}" data-i="${i}">${c.icon ? icon(c.icon) : ''}${esc(c.label)}</button>`).join('');
    chipsEl._list = list;
  }
  chipsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const c = chipsEl._list[+b.dataset.i]; if (c.say) handle(c.say, true); else c.run(); });

  function movieChips() {
    return MOVIES.filter(isNowShowing).sort((a, b) => b.rating - a.rating).slice(0, 6).map((m) => ({ label: m.title, run: () => handle(m.title, true) }));
  }
  function plan() {
    const m = movieById(ctx.movieId);
    if (!m) { bubble(say.whichMovie()); chips(movieChips()); return; }
    if (!isNowShowing(m)) {
      bubble(say.upcoming(m));
      chips([{ label: t('notify'), icon: 'bell', primary: true, run: () => { app.setNotify(m.id, true); bubble(say.reminder()); chips(movieChips()); ctx = {}; } }, ...movieChips().slice(0, 3)]);
      return;
    }
    if (!ctx.count) { bubble(say.howMany(m)); chips([1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), say: String(n) }))); return; }
    const cityId = ctx.cityId || app.city();
    let dks = ctx.dk ? [ctx.dk] : [dayKey(today()), dayKey(addDays(today(), 1))];
    let shows = [];
    for (const dk of dks) { shows = showsFor({ cityId, dk, movieId: m.id }); if (shows.length) break; }
    const filtered = shows.filter((s) => (!ctx.part || partOfDay(s.hm) === ctx.part) && (!ctx.theatreId || s.theatreId === ctx.theatreId) && (!ctx.imax || s.hall === 'imax'));
    let pool = filtered.length ? filtered : shows;
    if (!filtered.length && shows.length && (ctx.part || ctx.theatreId || ctx.imax)) bubble(say.noShows(m));
    if (!pool.length) {
      // look ahead up to 4 days
      for (let i = 1; i <= 4 && !pool.length; i++) pool = showsFor({ cityId, dk: dayKey(addDays(ctx.dk ? fromKey(ctx.dk) : today(), i)), movieId: m.id });
      if (!pool.length) { bubble(say.noShows(m)); chips(movieChips()); return; }
    }
    if (ctx.hour != null) pool = [...pool].sort((a, b) => Math.abs(+a.hm.slice(0, 2) + +a.hm.slice(2) / 60 - ctx.hour) - Math.abs(+b.hm.slice(0, 2) + +b.hm.slice(2) / 60 - ctx.hour));
    else pool = [...pool].sort((a, b) => (ctx.theatreId ? 0 : theatreById(a.theatreId).km - theatreById(b.theatreId).km) * 0.3 + (a.dk + a.hm).localeCompare(b.dk + b.hm));
    alts = pool;
    propose(pool.find((s) => seatsFor(s)) || null);
  }
  function seatsFor(show) {
    const lay = layoutOf(show);
    const booked = bookedFor(show, lay, app.mySeats(show.id));
    const prices = pricesOf(show);
    let cls = null;
    const classes = Object.keys(prices);
    if (ctx.pref === 'recliner') cls = classes.find((c) => ['recliner', 'royal', 'couple'].includes(c));
    if (ctx.pref === 'balcony') cls = classes.find((c) => c === 'balcony');
    if (ctx.pref === 'cheap') cls = classes.sort((a, b) => prices[a] - prices[b])[0];
    let run = null;
    if (ctx.pref === 'back' || ctx.pref === 'front') {
      const rows = ctx.pref === 'back' ? [...lay.rows].reverse() : lay.rows;
      for (const r of rows) { run = bestBlock({ ...lay, rows: [r] }, booked, ctx.count); if (run) break; }
    } else run = bestBlock(lay, booked, ctx.count, cls) || bestBlock(lay, booked, ctx.count);
    return run;
  }
  function propose(show) {
    if (!show) { bubble(say.full()); chips(altChips()); return; }
    const seats = seatsFor(show);
    if (!seats) { bubble(say.full()); chips(altChips(show)); return; }
    const m = movieById(show.movieId), th = theatreById(show.theatreId);
    const prices = pricesOf(show);
    const total = seats.reduce((a, s) => a + prices[s.cls], 0) + seats.length * FEE_PER_TICKET;
    const score = Math.round(seats.reduce((a, s) => a + s.score, 0) / seats.length);
    const d = fromKey(show.dk);
    const day = show.dk === dayKey(today()) ? t('today') : show.dk === dayKey(addDays(today(), 1)) ? t('tomorrow') : fmtDate(d);
    const seatsTxt = seats.length > 2 ? `${seats[0].id}–${seats[seats.length - 1].id}` : seats.map((s) => s.id).join(', ');
    proposal = { show, seats, movie: m, th, total, score, day, seatsTxt };
    const text = say.propose(proposal);
    bubble(text, 'bot', `<div class="prop"><div class="prop-top"><b>${esc(m.title)}</b><span>${esc(day)} · ${hmLabel(show.hm)}</span></div>
      <div class="prop-row">${icon('pin')}<span>${esc(th.name)}, ${esc(th.area)} · ${esc(tx(HALLS[show.hall]))}</span></div>
      <div class="prop-row">${icon('seat')}<span>${esc(seatsTxt)} · ${esc(clsName(seats[0].cls))}</span></div>
      <div class="prop-row">${icon('eye')}<span>${t('score')} <b>${score}/100</b> · ${t('l_' + scoreLabel(score))}</span></div>
      <div class="prop-total"><span>${t('total')}</span><b>${inr(proposal.total)}</b></div></div><p>${esc(L() === 'ta' ? 'புக் செய்யவா?' : 'Shall I book it?')}</p>`);
    // speak the plain text version
    if (speakOn && 'speechSynthesis' in window) try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = L() === 'ta' ? 'ta-IN' : 'en-IN'; speechSynthesis.speak(u); } catch (e) {}
    chips([
      { label: L() === 'ta' ? 'ஆமா, புக் செய்' : 'Yes, book it', icon: 'check', primary: true, run: confirm },
      { label: L() === 'ta' ? 'இருக்கைப் பார்வை' : 'See seat view', icon: 'eye', run: () => app.openSeats(show.id, seats.map((s) => s.id)) },
      { label: L() === 'ta' ? 'வேறு நேரம்' : 'Other time', icon: 'clock', run: () => chips(altChips(show)) },
    ]);
  }
  function altChips(except) {
    return alts.filter((s) => s !== except).slice(0, 5).map((s) => {
      const th = theatreById(s.theatreId);
      return { label: `${hmLabel(s.hm)} · ${th.name.split(' ')[0]} ${th.area}`, run: () => propose(s) };
    });
  }
  async function confirm() {
    if (!proposal) return;
    const pr = proposal; proposal = null;
    let b = null;
    try { b = await app.book(pr.show, pr.seats.map((s) => s.id), {}, 'UPI'); } catch (e) { b = undefined; }
    if (!b) {
      bubble(b === undefined ? (L() === 'ta' ? 'இணைப்பு இல்லை. மீண்டும் முயற்சிக்கவும்.' : 'I could not reach the server. Please try again.')
        : (L() === 'ta' ? 'அந்த இருக்கைகள் இப்போதுதான் எடுக்கப்பட்டன. வேறு இருக்கைகளைத் தேடுகிறேன்.' : 'Someone just took those seats. Let me find others.'));
      if (b === null) propose(pr.show); return;
    }
    bubble(say.booked(pr), 'bot');
    chips([{ label: L() === 'ta' ? 'டிக்கெட் பார்' : 'Open ticket', icon: 'ticket', primary: true, run: () => { close(); app.go('ticket-' + b.id); } }, { label: L() === 'ta' ? 'இன்னொன்று' : 'Book another', run: () => { ctx = {}; bubble(say.hello()); chips(movieChips()); } }]);
    ctx = {};
  }
  async function handle(text, fromChip = false) {
    if (!text.trim()) return;
    try { await loadNLU(); } catch (e) { /* rules still work offline */ }
    bubble(text, 'me');
    const p = understand(text, app.city());
    const stat = $('#agentStat'); if (stat) stat.textContent = p.via === 'model' ? `On-device AI · ${p.ms.toFixed(1)} ms` : (L() === 'ta' ? 'விதிமுறை' : 'Rules');
    if (p.help && !p.movieId) { bubble(say.hello()); chips(movieChips()); return; }
    if (p.notify && p.movieId) { app.setNotify(p.movieId, true); bubble(say.reminder()); chips(movieChips()); return; }
    if (p.myTickets) { close(); app.go('tickets'); return; }
    if (proposal && p.yes && !p.movieId) { confirm(); return; }
    if (proposal && p.no && !p.movieId && !p.dk && !p.part) { chips(altChips(proposal.show)); bubble(L() === 'ta' ? 'வேறு எது வேண்டும்? நேரம் அல்லது இருக்கை வகையைச் சொல்லுங்கள்.' : 'What should I change? Say a time, a day, or a seat type like recliner or back row.'); return; }
    // If only a number was said while waiting for count
    if (!p.count && /^\s*\d{1,2}\s*$/.test(text)) p.count = Math.min(10, Math.max(1, +text));
    if (p.movieId && p.movieId !== ctx.movieId) { ctx = { count: ctx.count }; }
    if (p.cityId) app.setCity(p.cityId);
    const before = JSON.stringify(ctx);
    ['movieId', 'count', 'dk', 'part', 'hour', 'theatreId', 'pref', 'imax', 'cityId'].forEach((k) => { if (p[k] != null) ctx[k] = p[k]; });
    if (p.count > 10) ctx.count = 10;
    if (JSON.stringify(ctx) === before && !fromChip && !proposal) { bubble(say.notUnderstood()); chips(movieChips()); return; }
    proposal = null;
    plan();
  }

  /* voice input */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('#agentMic');
  let rec = null, listening = false;
  if (!SR) micBtn.dataset.off = '1';
  micBtn.addEventListener('click', () => {
    if (!SR) { bubble(L() === 'ta' ? 'இந்த உலாவியில் குரல் வசதி இல்லை. Chrome அல்லது Edge-ல் முயற்சிக்கவும், அல்லது டைப் செய்யுங்கள்.' : 'Voice isn’t available in this browser. Try Chrome or Edge, or type instead.'); return; }
    if (listening) { rec?.stop(); return; }
    rec = new SR(); rec.lang = L() === 'ta' ? 'ta-IN' : 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; input.value = s; if (e.results[e.results.length - 1].isFinal) finalText = s; };
    rec.onerror = (e) => { bubble(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? (L() === 'ta' ? 'மைக் அனுமதி இல்லை. டைப் செய்யுங்கள்.' : 'Microphone permission was blocked. You can type instead.') : (L() === 'ta' ? 'கேட்கவில்லை. மீண்டும் முயற்சிக்கவும்.' : 'I couldn’t hear that. Try again.')); };
    rec.onend = () => { listening = false; micBtn.classList.remove('on'); if (finalText) { input.value = ''; handle(finalText); } };
    try { rec.start(); listening = true; micBtn.classList.add('on'); } catch (e) { listening = false; }
  });
  $('#agentForm').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; handle(v); });
  const spk = $('#agentSpeak');
  const setSpk = () => { spk.setAttribute('aria-pressed', String(speakOn)); };
  spk.addEventListener('click', () => { speakOn = !speakOn; try { localStorage.setItem('lumen.speak', speakOn ? '1' : '0'); } catch (e) {} if (!speakOn) try { speechSynthesis.cancel(); } catch (e) {} setSpk(); });
  setSpk();
  $('#agentClose').addEventListener('click', () => close());
  function open(prefill) {
    loadNLU().catch(() => {});
    sheet.hidden = false; document.body.classList.add('lock');
    if (!log.children.length) { bubble(say.hello()); chips(movieChips()); }
    if (prefill) handle(prefill);
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  }
  function close() { sheet.hidden = true; document.body.classList.remove('lock'); try { rec?.stop(); speechSynthesis.cancel(); } catch (e) {} }
  return { open, close, isOpen: () => !sheet.hidden };
}
