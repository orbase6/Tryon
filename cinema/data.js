// Catalogue: cities, theatres, halls, movies and show schedules.
// Everything is generated deterministically so every visitor sees the same shows.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

export const CITIES = [ // the first 5 are built in; registration can add more
  { id: 'chennai', en: 'Chennai', ta: 'சென்னை', lat: 13.0827, lng: 80.2707, areas: ['Anna Nagar', 'Vadapalani', 'OMR', 'Velachery'] },
  { id: 'coimbatore', en: 'Coimbatore', ta: 'கோயம்புத்தூர்', lat: 11.0168, lng: 76.9558, areas: ['RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony'] },
  { id: 'madurai', en: 'Madurai', ta: 'மதுரை', lat: 9.9252, lng: 78.1198, areas: ['KK Nagar', 'Anna Nagar', 'Simmakkal', 'Bypass Road'] },
  { id: 'bengaluru', en: 'Bengaluru', ta: 'பெங்களூரு', lat: 12.9716, lng: 77.5946, areas: ['Koramangala', 'Indiranagar', 'Whitefield', 'Jayanagar'] },
  { id: 'kochi', en: 'Kochi', ta: 'கொச்சி', lat: 9.9312, lng: 76.2673, areas: ['Edappally', 'Kakkanad', 'Marine Drive', 'Vyttila'] },
];

const BASE_CITY_COUNT = 5;

// Seat classes shared by all halls
export const CLASS_META = {
  // Seat classes use shades of the brand yellow only (deeper = premium); text is always ink
  royal: { en: 'Royal Recliner', ta: 'ராயல் ரெக்லைனர்', color: '#d99a00', ink: '#14161f' },
  recliner: { en: 'Recliner', ta: 'ரெக்லைனர்', color: '#d99a00', ink: '#14161f' },
  couple: { en: 'Couple Sofa', ta: 'ஜோடி சோஃபா', color: '#d99a00', ink: '#14161f' },
  balcony: { en: 'Balcony', ta: 'பால்கனி', color: '#f0b400', ink: '#14161f' },
  premium: { en: 'Premium', ta: 'பிரீமியம்', color: '#f0b400', ink: '#14161f' },
  prime: { en: 'Prime', ta: 'பிரைம்', color: '#ffc72c', ink: '#14161f' },
  back: { en: 'Back stalls', ta: 'பின் வரிசை', color: '#ffc72c', ink: '#14161f' },
  standard: { en: 'Standard', ta: 'ஸ்டாண்டர்ட்', color: '#ffd966', ink: '#14161f' },
  classic: { en: 'Classic', ta: 'கிளாசிக்', color: '#ffd966', ink: '#14161f' },
  middle: { en: 'Middle stalls', ta: 'நடு வரிசை', color: '#ffd966', ink: '#14161f' },
  front: { en: 'Front stalls', ta: 'முன் வரிசை', color: '#ffeaa6', ink: '#14161f' },
};

// Theatre chains (fictional). Each screen uses one hall type from layout.js
export const CHAINS = [
  { key: 'lumen', name: 'Lumen Talkies', amen: ['Dolby Atmos', 'Food court', 'Parking', 'Wheelchair access'],
    screens: [{ name: 'Screen 1', hall: 'classic', fmt: 'Dolby Atmos' }, { name: 'Screen 2', hall: 'multiplex', fmt: '2D' }] },
  { key: 'starline', name: 'Starline IMAX', amen: ['IMAX laser', '4DX', 'Food court', 'Parking', 'Wheelchair access'],
    screens: [{ name: 'IMAX', hall: 'imax', fmt: 'IMAX' }, { name: 'Screen 2', hall: 'multiplex', fmt: '4DX' }] },
  { key: 'velvet', name: 'Velvet Lounge', amen: ['All recliners', 'Food served at seat', 'Valet parking'],
    screens: [{ name: 'Lounge', hall: 'lounge', fmt: 'Recliner' }] },
  { key: 'ganga', name: 'Ganga Cinemas', amen: ['Single screen', 'Big balcony', 'Budget friendly'],
    screens: [{ name: 'Main screen', hall: 'single', fmt: '2D' }] },
];

const HALL_AMEN = { classic: 'Dolby Atmos', imax: 'IMAX laser', lounge: 'All recliners', single: 'Big balcony', multiplex: 'Food court' };
export function theatresFor(cityId, { all = false } = {}) {
  const ci = CITIES.findIndex((c) => c.id === cityId);
  const city = CITIES[ci];
  if (!city) return [];
  const live = (id) => LIVE.theatres[id] || {};
  const place = (id) => { if (city.lat == null) return { lat: null, lng: null }; const r = mulberry32(hash(id + 'geo')); return { lat: city.lat + (r() - 0.5) * 0.14, lng: city.lng + (r() - 0.5) * 0.14 }; };
  const list = ci >= BASE_CITY_COUNT ? [] : CHAINS.map((ch, i) => {
    const id = `c${ci}t${i}`;
    const r = mulberry32(hash(city.id + ch.key));
    return {
      id, cityId: city.id, chain: ch.key, name: ch.name, area: city.areas[i % city.areas.length],
      demoKm: Math.round((1.2 + r() * 9) * 10) / 10, amen: ch.amen, ...place(id),
      screens: ch.screens.map((s, si) => ({ ...s, idx: si, id: `${id}s${si}` })),
    };
  });
  // Theatres that joined through partner registration (approved by a Lumen admin)
  for (const nt of LIVE.newTheatres.filter((x) => x.cityId === city.id)) {
    list.push({ id: nt.id, cityId: city.id, chain: 'partner', name: nt.name, area: nt.area, demoKm: 4 + (hash(nt.id) % 50) / 10, ...(nt.lat != null ? { lat: nt.lat, lng: nt.lng } : place(nt.id)),
      amen: [...new Set(nt.screens.map((s) => HALL_AMEN[s.hall]).filter(Boolean)), 'Parking'],
      screens: nt.screens.map((s, si) => ({ name: s.name, hall: s.hall, fmt: s.fmt, idx: si, id: `${nt.id}s${si}` })), isNew: true });
  }
  for (const th of list) {
    th.status = live(th.id).status || 'active';
    th.kycStatus = live(th.id).kycStatus || 'not_submitted';
    const md = LIVE.media.theatres[th.id] || {};
    th.cover = md.cover || null; th.photos = md.photos || [];
    th.km = LIVE.userLoc && th.lat != null ? Math.round(kmBetween(LIVE.userLoc, th) * 10) / 10 : th.demoKm;
  }
  // Hidden from customers: suspended by Lumen, or the owner's plan has run out
  return all ? list : list.filter((t) => t.status !== 'suspended' && !LIVE.lapsed.has(t.id));
}
export function theatreById(id) {
  const m = /^c(\d+)t(\d+)$/.exec(id); if (!m) return null;
  const city = CITIES[+m[1]]; if (!city) return null;
  return theatresFor(city.id, { all: true }).find((t) => t.id === id) || null;
}
// Distance on the earth's surface in km
export function kmBetween(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const nearestCity = (loc) => CITIES.filter((c) => c.lat != null).map((c) => [c, kmBetween(loc, c)]).sort((a, b) => a[1] - b[1])[0];

// Movies (fictional titles). rel = days from today (negative = already released)
export const MOVIES = [
  { id: 'kaalam', title: 'Kaalam', sub: 'The Last Monsoon', lang: 'Tamil', genres: ['Drama', 'Thriller'], cert: 'U/A 13+', mins: 161, rating: 8.7, votes: 41200, rel: -9, run: 40, imax: false,
    c1: '#2a1640', c2: '#c86a2a', motif: 'sun', cast: ['Arun Vel', 'Meera Das', 'Karthik Raj'], about: 'A boatman races a cyclone to bring his daughter home, and finds the village he left behind.' },
  { id: 'neonkadal', title: 'Neon Kadal', sub: '', lang: 'Tamil', genres: ['Action', 'Crime'], cert: 'A', mins: 148, rating: 8.1, votes: 28600, rel: -16, run: 45, imax: true,
    c1: '#04203a', c2: '#ff2e88', motif: 'waves', cast: ['Vijay Kumar R', 'Nila S', 'Bose'], about: 'A night-shift fisherman stumbles into a smuggling war on the neon-lit Chennai coast.' },
  { id: 'paati', title: "Paati's Kitchen", sub: '', lang: 'Tamil', genres: ['Family', 'Comedy'], cert: 'U', mins: 125, rating: 9.0, votes: 52800, rel: -23, run: 25, imax: false,
    c1: '#5a2b0c', c2: '#ffb347', motif: 'leaf', cast: ['Kamala Devi', 'Surya Prakash', 'Baby Anu'], about: 'Three cousins try to save their grandmother\'s 60-year-old mess from a highway project.' },
  { id: 'orbit9', title: 'Orbit Nine', sub: '', lang: 'English', genres: ['Sci-Fi', 'Adventure'], cert: 'U/A 13+', mins: 154, rating: 8.4, votes: 96100, rel: -4, imax: true, langs: ['English', 'Tamil', 'Hindi'],
    c1: '#030712', c2: '#4fe3d6', motif: 'stars', cast: ['Elena Ward', 'Sam Okafor', 'Ivo Lind'], about: 'A repair crew on a dying space station has nine orbits to bring everyone home.' },
  { id: 'rajarumble', title: 'Raja Rumble', sub: '', lang: 'Telugu', genres: ['Action', 'Masala'], cert: 'U/A 16+', mins: 167, rating: 7.6, votes: 33900, rel: -2, imax: true, langs: ['Telugu', 'Tamil'],
    c1: '#2b0505', c2: '#ff7a00', motif: 'flame', cast: ['Ravi Teja K', 'Lakshmi P', 'Murali'], about: 'A lorry driver takes on a mining baron to win back his town\'s river.' },
  { id: 'mazhavil', title: 'Mazhavil', sub: '', lang: 'Malayalam', genres: ['Romance', 'Drama'], cert: 'U', mins: 138, rating: 8.8, votes: 19400, rel: -12, imax: false,
    c1: '#0c3b2e', c2: '#f2c14e', motif: 'arc', cast: ['Anjali Menon', 'Fahad N', 'Siddiq'], about: 'Two strangers keep meeting at the same Kochi ferry, one monsoon at a time.' },
  { id: 'lastferry', title: 'The Last Ferry', sub: '', lang: 'English', genres: ['Thriller', 'Mystery'], cert: 'A', mins: 119, rating: 7.9, votes: 44300, rel: -6, imax: false,
    c1: '#0d1117', c2: '#7d8da8', motif: 'moon', cast: ['Hugo Marsh', 'Priya Lal', 'Jon Aria'], about: 'Eleven passengers. One storm. Someone on board is not who they claim to be.' },
  { id: 'kanna', title: 'Little Kanna', sub: '', lang: 'Tamil', genres: ['Animation', 'Family'], cert: 'U', mins: 102, rating: 8.5, votes: 12700, rel: -18, run: 21, imax: false,
    c1: '#1e3a8a', c2: '#ffd166', motif: 'stars', cast: ['Voice: Aditi', 'Voice: Ramesh'], about: 'A cowherd boy and a talking peacock set out to find the lost flute of their village.' },
  { id: 'dhool', title: 'Dhool Express', sub: '', lang: 'Hindi', genres: ['Comedy', 'Road'], cert: 'U/A 7+', mins: 131, rating: 7.2, votes: 21500, rel: -11, imax: false,
    c1: '#3b1d00', c2: '#ffd400', motif: 'road', cast: ['Raj Malhotra', 'Simran K', 'Pankaj T'], about: 'A wedding band misses its train and has 48 hours to cross three states.' },
  { id: 'silentvalley', title: 'Silent Valley', sub: '', lang: 'Malayalam', genres: ['Horror'], cert: 'A', mins: 112, rating: 7.8, votes: 15800, rel: -7, imax: false,
    c1: '#06120c', c2: '#5fb36b', motif: 'leaf', cast: ['Nivin J', 'Remya', 'Unni'], about: 'A forest guard hears a voice in the one valley where no birds sing.' },
  // Coming soon
  { id: 'agniparavai', title: 'Agni Paravai', sub: '', lang: 'Tamil', genres: ['Action', 'Drama'], cert: 'U/A 13+', mins: 158, rating: 0, votes: 0, rel: 5, imax: true, interest: 182000,
    c1: '#250400', c2: '#ff5a1f', motif: 'flame', cast: ['Vikram S', 'Tara', 'Prakash'], about: 'A retired air force pilot is pulled into one last rescue over the Western Ghats.' },
  { id: 'moonlit', title: 'Moonlit Market', sub: '', lang: 'English', genres: ['Fantasy', 'Family'], cert: 'U', mins: 121, rating: 0, votes: 0, rel: 12, imax: true, interest: 64000,
    c1: '#1b1036', c2: '#b892ff', motif: 'moon', cast: ['Ada Quinn', 'Leo Park'], about: 'Once a year a market appears at midnight, and a girl trades her shadow for a wish.' },
  { id: 'kuyil', title: 'Kuyil', sub: '', lang: 'Tamil', genres: ['Musical', 'Romance'], cert: 'U', mins: 140, rating: 0, votes: 0, rel: 9, imax: false, interest: 47000,
    c1: '#0b2a2a', c2: '#ffc6d9', motif: 'arc', cast: ['Shreya V', 'Harish'], about: 'A temple singer and a street drummer form the unlikeliest band in Madurai.' },
  { id: 'starfall', title: 'Starfall', sub: '', lang: 'English', genres: ['Sci-Fi', 'Action'], cert: 'U/A 13+', mins: 149, rating: 0, votes: 0, rel: 19, imax: true, interest: 251000,
    c1: '#020617', c2: '#60a5fa', motif: 'stars', cast: ['Mira Holt', 'Dev Anand R'], about: 'When the moon cracks, a pilot has eight days to land the pieces.' },
];
export const movieById = (id) => MOVIES.find((m) => m.id === id) || ALL_MOVIES.find((m) => m.id === id) || BASE_MOVIES.find((m) => m.id === id) || null;
const BASE_MOVIES = MOVIES.slice();
export const baseMovies = () => BASE_MOVIES;

/* ---------- live data from the partner panel and admin console (see db.js) ---------- */
export const LIVE = { theatres: {}, schedule: {}, demoCrowd: true, newTheatres: [], media: { movies: {}, theatres: {} }, banners: [], userLoc: null, lapsed: new Set() };
const dayDiff = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((new Date(y, m - 1, d, 12) - today()) / 86400000); };
const ALL_MOVIES = [];
export function applyLive(st) {
  LIVE.theatres = st.theatres || {};
  LIVE.schedule = st.schedule || {};
  LIVE.newTheatres = Array.isArray(st.newTheatres) ? st.newTheatres : [];
  LIVE.media = { movies: {}, theatres: {}, ...(st.media || {}) };
  LIVE.banners = Array.isArray(st.banners) ? st.banners : [];
  LIVE.lapsed = new Set(st.lapsed || []);
  LIVE.kyc = st.kycPublic || {}; LIVE.contact = st.contact || {};
  // Cities added when theatres register in a new city
  CITIES.splice(BASE_CITY_COUNT, CITIES.length, ...(st.cities || []).map((c) => ({ id: c.id, en: c.en, ta: c.ta || c.en, lat: c.lat, lng: c.lng, areas: c.areas || [], state: c.state || '', added: true })));
  const f = st.fees || {};
  CONV_FEE = f.conv ?? 18; GST = f.gst ?? 0; HOLD_MINUTES = f.holdMinutes ?? 5; COMMISSION = (f.commissionPct ?? 0.5) / 100;
  FEE_PER_TICKET = Math.round(CONV_FEE * (1 + GST));
  LIVE.demoCrowd = f.demoCrowd ?? true;
  const hidden = new Set(st.hiddenMovies || []);
  const custom = (st.movies || []).map((m) => ({ rating: 0, votes: 0, interest: 0, sub: '', motif: 'stars', cast: [], genres: [], ...m, custom: true, rel: m.release ? dayDiff(m.release) : 0 }));
  const all = [...BASE_MOVIES.filter((m) => !hidden.has(m.id)).map((m) => ({ ...m })), ...custom];
  for (const m of all) {
    const md = LIVE.media.movies[m.id] || {};
    m.poster = md.poster || null; m.banner = md.banner || null; m.trailer = md.trailer || null;
    // Days left in cinemas, counting today (1 = today is the last day). null = no end date yet.
    const last = md.lastDay || m.lastDay;
    m.left = last ? dayDiff(last) + 1 : m.run ? m.rel + m.run : null;
  }
  ALL_MOVIES.splice(0, ALL_MOVIES.length, ...all);
  // A movie leaves the app's listings the day after its last day in cinemas
  MOVIES.splice(0, MOVIES.length, ...all.filter((m) => m.left == null || m.left > 0));
  if (Array.isArray(st.offers)) OFFERS.splice(0, OFFERS.length, ...st.offers.filter((o) => o.active !== false));
  else OFFERS.splice(0, OFFERS.length, ...BASE_OFFERS);
}
// "Last 3 days" badge: true when the movie leaves cinemas within 3 days
export const leavingSoon = (m) => m.rel <= 0 && m.left != null && m.left > 0 && m.left <= 3;
// Shows only up to the movie's last day
const playsOn = (m, dk) => m.left == null || dayDiff(`${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}`) < m.left;
// Banners users see right now on a placement ('home' or 'theatre'), newest first
export function liveBanners(placement, { cityId = null, theatreId = null } = {}) {
  const now = Date.now(), D = 864e5;
  return LIVE.banners.filter((b) => b.status === 'live' && b.placement === placement
    && (!b.from || Date.parse(b.from) <= now) && (!b.to || Date.parse(b.to) + D > now)
    && (!theatreId || b.theatreId === theatreId)
    && (!cityId || !b.theatreId || b.theatreId.startsWith('c' + CITIES.findIndex((c) => c.id === cityId) + 't')));
}
export const isNowShowing = (m) => m.rel <= 0;

// Dates
export function dayKey(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
export function addDays(d, n) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; }
export function fromKey(k) { return new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), 12); }
export const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
export function releaseDate(m) { return addDays(today(), m.rel); }

// Shows are 3h15 apart: longest movie (2h47) + 20 minutes to clean the hall fits between them
const SLOTS = ['0900', '1215', '1530', '1845', '2200'];
const SLOTS_LOUNGE = ['1030', '1400', '1730', '2100'];

// Which two movies each screen plays on a given day. Every movie in cinemas
// gets at least one regular screen in every city, every day.
function lineup(screen, cityIdx, dk) {
  const showing = MOVIES.filter((m) => isNowShowing(m) && playsOn(m, dk));
  if (!showing.length) return [];
  if (screen.hall === 'imax') {
    const big = showing.filter((m) => m.imax);
    if (!big.length) return [showing[0], showing[1 % showing.length]];
    const r = mulberry32(hash(screen.id + dk));
    const i = Math.floor(r() * big.length);
    return [big[i], big[(i + 1) % big.length]];
  }
  const city = CITIES[cityIdx];
  const regular = theatresFor(city.id).flatMap((t) => t.screens).filter((s) => s.hall !== 'imax');
  const order = [...showing];
  const r = mulberry32(hash(city.id + dk));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const k = Math.max(0, regular.findIndex((s) => s.id === screen.id));
  return [order[(2 * k) % order.length], order[(2 * k + 1) % order.length]];
}
// The shows on one screen for one day: the partner's own schedule if they set one, else the default lineup
export function screenDay(screen, cityIdx, dk) {
  const sch = LIVE.schedule[screen.id];
  if (sch && sch.custom) return (sch.shows || []).filter((x) => x.dk === dk).map((x) => ({ hm: x.hm, movie: movieById(x.movieId) })).filter((x) => x.movie && playsOn(x.movie, dk)).sort((a, b) => a.hm.localeCompare(b.hm));
  const pair = lineup(screen, cityIdx, dk); if (!pair.length) return [];
  const slots = screen.hall === 'lounge' ? SLOTS_LOUNGE : SLOTS;
  return slots.map((hm, i) => ({ hm, movie: pair[i % 2] }));
}

export function showsFor({ cityId, dk, movieId = null, theatreId = null }) {
  const out = [];
  const ci = CITIES.findIndex((c) => c.id === cityId);
  const now = new Date();
  for (const th of theatresFor(cityId)) {
    if (theatreId && th.id !== theatreId) continue;
    for (const sc of th.screens) {
      screenDay(sc, ci, dk).forEach(({ hm, movie: mv }) => {
        if (movieId && mv.id !== movieId) return;
        if (!isNowShowing(mv) && fromKey(dk) < releaseDate(mv)) return;
        const d = fromKey(dk); d.setHours(+hm.slice(0, 2), +hm.slice(2), 0, 0);
        if (d < now) return; // already started
        out.push(makeShow(th, sc, mv, dk, hm));
      });
    }
  }
  return out.sort((x, y) => x.hm.localeCompare(y.hm));
}
function makeShow(th, sc, mv, dk, hm) {
  const id = `${sc.id}d${dk}h${hm}`;
  const r = mulberry32(hash(id));
  const prime = +hm >= 1800 ? 0.25 : 0;
  const weekend = [0, 6].includes(fromKey(dk).getDay()) ? 0.2 : 0;
  const occ = LIVE.demoCrowd ? Math.min(0.92, 0.12 + r() * 0.5 + prime + weekend) : 0;
  const langs = mv.langs || [mv.lang];
  const lang = langs[Math.floor(r() * langs.length)];
  return { id, theatreId: th.id, screenIdx: sc.idx, hall: sc.hall, fmt: sc.fmt, movieId: mv.id, dk, hm, occ, lang };
}
export function showById(id) {
  const m = /^(c\d+t\d+)s(\d+)d(\d{8})h(\d{4})$/.exec(id); if (!m) return null;
  const th = theatreById(m[1]); if (!th) return null;
  const sc = th.screens[+m[2]]; if (!sc) return null;
  const ci = CITIES.findIndex((c) => c.id === th.cityId);
  const x = screenDay(sc, ci, m[3]).find((y) => y.hm === m[4]);
  return x ? makeShow(th, sc, x.movie, m[3], m[4]) : null;
}
export function hmLabel(hm) {
  let h = +hm.slice(0, 2); const mm = hm.slice(2); const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12; return `${h}:${mm} ${ap}`;
}
export function partOfDay(hm) { const h = +hm.slice(0, 2); return h < 12 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night'; }

export const SNACKS = [
  { id: 'pop', en: 'Salted popcorn (L)', ta: 'உப்பு பாப்கார்ன் (L)', price: 280, tone: 'var(--yel-soft)' },
  { id: 'car', en: 'Caramel popcorn (L)', ta: 'கேரமல் பாப்கார்ன் (L)', price: 320, tone: 'var(--card-2)' },
  { id: 'nac', en: 'Nachos with cheese', ta: 'சீஸ் நாச்சோஸ்', price: 260, tone: 'var(--yel-soft)' },
  { id: 'cof', en: 'Cold coffee', ta: 'குளிர் காபி', price: 220, tone: 'var(--card-2)' },
  { id: 'cmb', en: 'Combo · 2 popcorn + 2 drinks', ta: 'காம்போ · 2 பாப்கார்ன் + 2 பானம்', price: 690, tone: 'var(--yel-soft)' },
];
export let FEE_PER_TICKET = 21; // fee + GST per ticket, shown all-in

// Events, plays, sports and activities (fictional). day = days from today.
export const EVENT_CATS = [
  { id: 'events', en: 'Events', ta: 'நிகழ்வுகள்', icon: 'spark', c1: '#14161f', c2: '#ffc72c' },
  { id: 'plays', en: 'Plays', ta: 'நாடகங்கள்', icon: 'ticket', c1: '#14161f', c2: '#d99a00' },
  { id: 'sports', en: 'Sports', ta: 'விளையாட்டு', icon: 'star', c1: '#2a2c36', c2: '#ffc72c' },
  { id: 'activities', en: 'Activities', ta: 'செயல்பாடுகள்', icon: 'pin', c1: '#2a2c36', c2: '#d99a00' },
];
export const EVENTS = [
  { id: 'kadalbeats', cat: 'events', title: 'Kadal Beats Live', kind: 'Concert', day: 6, hm: '1900', venue: 'Island Grounds', mins: 180, c1: '#2a0b3d', c2: '#ff2e88', about: 'An evening of indie Tamil and fusion bands by the sea.', tiers: [['Fan pit', 2499], ['Gold', 1499], ['Silver', 799]] },
  { id: 'madrasmornings', cat: 'events', title: 'Madras Mornings', kind: 'Stand-up comedy', day: 3, hm: '2000', venue: 'Lumen Studio', mins: 90, c1: '#3b1d00', c2: '#ffd400', about: 'Ninety minutes of jokes about filter coffee, traffic and family WhatsApp groups.', tiers: [['Front rows', 999], ['Regular', 599]] },
  { id: 'kuthukalai', cat: 'plays', title: 'Kuthu Kalai', kind: 'Tamil play', day: 2, hm: '1830', venue: 'Museum Theatre', mins: 120, c1: '#4a0d0d', c2: '#ff7a00', about: 'A street theatre troupe stages its last show before the hall is sold.', tiers: [['Balcony', 400], ['Stalls', 250]] },
  { id: 'paperboats', cat: 'plays', title: 'Paper Boats', kind: 'English play', day: 8, hm: '1930', venue: 'Alliance Hall', mins: 100, c1: '#0b2a4a', c2: '#a0d8ff', about: 'Two brothers, one monsoon and a box of letters nobody was meant to read.', tiers: [['Premium', 700], ['Standard', 450]] },
  { id: 'supersixes', cat: 'sports', title: 'City Super Sixes', kind: 'T20 cricket (local league)', day: 4, hm: '1500', venue: 'Marina Cricket Ground', mins: 240, c1: '#05304a', c2: '#ffc53d', about: 'Final of the city six-a-side league. Gates open two hours early.', tiers: [['Pavilion', 1200], ['East stand', 450], ['Gallery', 200]] },
  { id: 'citymarathon', cat: 'sports', title: 'Sunrise 10K Run', kind: 'Running', day: 13, hm: '0530', venue: 'Beach Road', mins: 120, c1: '#3a1500', c2: '#ff9a3c', about: 'A flat 10K along the beach with a 5K fun-run option.', tiers: [['10K', 900], ['5K fun run', 500]] },
  { id: 'potterywknd', cat: 'activities', title: 'Weekend Pottery', kind: 'Workshop', day: 5, hm: '1100', venue: 'Clay Studio', mins: 150, c1: '#3d2314', c2: '#d9a441', about: 'Make two pieces on the wheel and take them home after firing.', tiers: [['One seat', 1800]] },
  { id: 'kayakdawn', cat: 'activities', title: 'Backwater Kayak at Dawn', kind: 'Outdoor', day: 7, hm: '0600', venue: 'Lake Club', mins: 120, c1: '#06303a', c2: '#4fe3d6', about: 'A guided paddle through quiet backwaters, with breakfast after.', tiers: [['Single kayak', 1400], ['Double kayak', 2400]] },
];
export const eventById = (id) => EVENTS.find((e) => e.id === id);

// Premieres you can rent and watch at home (fictional)
export const PREMIERES = [
  { id: 'tuner9', title: 'Low Signal', lang: 'English', genres: ['Thriller'], cert: 'U/A 16+', mins: 104, rating: 7.4, votes: 8200, rel: -30, rent: 149, c1: '#0a1a2a', c2: '#ffd400', motif: 'waves', cast: ['Kai Ross'], about: 'A radio engineer hears a call for help on a frequency that went dead years ago.' },
  { id: 'redrope', title: 'Red Rope', lang: 'Hindi', genres: ['Drama'], cert: 'U/A 13+', mins: 128, rating: 7.9, votes: 5600, rel: -40, rent: 129, c1: '#2b0505', c2: '#ff4d6d', motif: 'arc', cast: ['Neha R'], about: 'A circus acrobat tries to keep her troupe together after the big top burns down.' },
  { id: 'vaanam', title: 'Vaanam Pesum', lang: 'Tamil', genres: ['Family'], cert: 'U', mins: 117, rating: 8.3, votes: 9900, rel: -35, rent: 99, c1: '#0b2a4a', c2: '#ffc6d9', motif: 'stars', cast: ['Revathi K'], about: 'A grandmother teaches her grandson to read the night sky before she moves away.' },
  { id: 'cliffline', title: 'Cliffline', lang: 'English', genres: ['Adventure'], cert: 'U/A 13+', mins: 99, rating: 7.1, votes: 4300, rel: -28, rent: 149, c1: '#1c2b3a', c2: '#9fd6ff', motif: 'road', cast: ['Ava Stone'], about: 'Two climbers. One rope. A storm moving faster than they can.' },
];
export const premiereById = (id) => PREMIERES.find((p) => p.id === id);

// Offers that can be applied at payment
const BASE_OFFERS = [
  { code: 'FIRST50', en: '50% off up to ₹150 on your first booking', pct: 50, max: 150, min: 0 },
  { code: 'MORNING20', en: '20% off morning shows (before 12 PM)', pct: 20, max: 200, min: 0, morning: true },
  { code: 'UPI40', en: 'Flat ₹40 off when you pay by UPI', flat: 40, min: 300, upi: true },
  { code: 'GROUP4', en: '₹100 off when you book 4 or more seats', flat: 100, min: 0, minSeats: 4 },
];
export const OFFERS = BASE_OFFERS.slice();
export let CONV_FEE = 18;   // base convenience fee per ticket (admin can change)
export let GST = 0;         // tax on the fee: 0 until Lumen is GST registered (admin turns it on)
export let COMMISSION = 0.005; // Lumen's share of each theatre's ticket sales (0.5%)
export let HOLD_MINUTES = 5;
export const baseOffers = () => BASE_OFFERS;
// Money for one booking: what the theatre gets and what the platform keeps
export function bookingMoney(b) {
  const ticket = b.ticketAmount || 0;
  const food = Object.entries(b.snacks || {}).reduce((a, [k, n]) => a + (SNACKS.find((s) => s.id === k)?.price || 0) * n, 0);
  const fees = b.fees || 0, gst = fees - fees / (1 + GST), convNet = fees - gst;
  const discount = b.discount || 0, donation = b.donate ? b.qty || 0 : 0;
  const refund = b.cancelled ? b.refund || 0 : 0;
  // On cancellation the customer gets `refund` back from the ticket price and food is refunded in full;
  // the theatre keeps the rest of the ticket price, the platform keeps its fee.
  const kept = b.cancelled ? ticket - refund : ticket;
  const commission = Math.round(kept * (b.commissionPct ?? COMMISSION * 100)) / 100; // Lumen's 0.5% of ticket sales
  const theatre = (b.cancelled ? kept : ticket + food) - commission;
  return { ticket, food, fees, gst, convNet, discount, donation, refund, commission, theatre: Math.max(0, theatre), platform: convNet - discount + commission };
}
