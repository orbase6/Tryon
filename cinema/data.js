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

export const CITIES = [
  { id: 'chennai', en: 'Chennai', ta: 'சென்னை', areas: ['Anna Nagar', 'Vadapalani', 'OMR', 'Velachery'] },
  { id: 'coimbatore', en: 'Coimbatore', ta: 'கோயம்புத்தூர்', areas: ['RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony'] },
  { id: 'madurai', en: 'Madurai', ta: 'மதுரை', areas: ['KK Nagar', 'Anna Nagar', 'Simmakkal', 'Bypass Road'] },
  { id: 'bengaluru', en: 'Bengaluru', ta: 'பெங்களூரு', areas: ['Koramangala', 'Indiranagar', 'Whitefield', 'Jayanagar'] },
  { id: 'kochi', en: 'Kochi', ta: 'கொச்சி', areas: ['Edappally', 'Kakkanad', 'Marine Drive', 'Vyttila'] },
];

// Seat classes shared by all halls
export const CLASS_META = {
  // Seat classes use shades of the brand teal only (darker = premium)
  royal: { en: 'Royal Recliner', ta: 'ராயல் ரெக்லைனர்', color: '#0a6464', ink: '#ffffff' },
  recliner: { en: 'Recliner', ta: 'ரெக்லைனர்', color: '#0a6464', ink: '#ffffff' },
  couple: { en: 'Couple Sofa', ta: 'ஜோடி சோஃபா', color: '#0a6464', ink: '#ffffff' },
  balcony: { en: 'Balcony', ta: 'பால்கனி', color: '#11807f', ink: '#ffffff' },
  premium: { en: 'Premium', ta: 'பிரீமியம்', color: '#11807f', ink: '#ffffff' },
  prime: { en: 'Prime', ta: 'பிரைம்', color: '#2aa3a3', ink: '#06302f' },
  back: { en: 'Back stalls', ta: 'பின் வரிசை', color: '#2aa3a3', ink: '#06302f' },
  standard: { en: 'Standard', ta: 'ஸ்டாண்டர்ட்', color: '#6cc3c3', ink: '#06302f' },
  classic: { en: 'Classic', ta: 'கிளாசிக்', color: '#6cc3c3', ink: '#06302f' },
  middle: { en: 'Middle stalls', ta: 'நடு வரிசை', color: '#6cc3c3', ink: '#06302f' },
  front: { en: 'Front stalls', ta: 'முன் வரிசை', color: '#a8dede', ink: '#06302f' },
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

export function theatresFor(cityId) {
  const ci = CITIES.findIndex((c) => c.id === cityId);
  const city = CITIES[ci];
  return CHAINS.map((ch, i) => {
    const r = mulberry32(hash(city.id + ch.key));
    return {
      id: `c${ci}t${i}`, cityId: city.id, chain: ch.key, name: ch.name, area: city.areas[i % city.areas.length],
      km: Math.round((1.2 + r() * 9) * 10) / 10, amen: ch.amen,
      screens: ch.screens.map((s, si) => ({ ...s, idx: si, id: `c${ci}t${i}s${si}` })),
    };
  });
}
export function theatreById(id) {
  const m = /^c(\d+)t(\d+)$/.exec(id); if (!m) return null;
  const city = CITIES[+m[1]]; if (!city) return null;
  return theatresFor(city.id)[+m[2]] || null;
}

// Movies (fictional titles). rel = days from today (negative = already released)
export const MOVIES = [
  { id: 'kaalam', title: 'Kaalam', sub: 'The Last Monsoon', lang: 'Tamil', genres: ['Drama', 'Thriller'], cert: 'U/A 13+', mins: 161, rating: 8.7, votes: 41200, rel: -9, imax: false,
    c1: '#2a1640', c2: '#c86a2a', motif: 'sun', cast: ['Arun Vel', 'Meera Das', 'Karthik Raj'], about: 'A boatman races a cyclone to bring his daughter home, and finds the village he left behind.' },
  { id: 'neonkadal', title: 'Neon Kadal', sub: '', lang: 'Tamil', genres: ['Action', 'Crime'], cert: 'A', mins: 148, rating: 8.1, votes: 28600, rel: -16, imax: true,
    c1: '#04203a', c2: '#ff2e88', motif: 'waves', cast: ['Vijay Kumar R', 'Nila S', 'Bose'], about: 'A night-shift fisherman stumbles into a smuggling war on the neon-lit Chennai coast.' },
  { id: 'paati', title: "Paati's Kitchen", sub: '', lang: 'Tamil', genres: ['Family', 'Comedy'], cert: 'U', mins: 125, rating: 9.0, votes: 52800, rel: -23, imax: false,
    c1: '#5a2b0c', c2: '#ffb347', motif: 'leaf', cast: ['Kamala Devi', 'Surya Prakash', 'Baby Anu'], about: 'Three cousins try to save their grandmother\'s 60-year-old mess from a highway project.' },
  { id: 'orbit9', title: 'Orbit Nine', sub: '', lang: 'English', genres: ['Sci-Fi', 'Adventure'], cert: 'U/A 13+', mins: 154, rating: 8.4, votes: 96100, rel: -4, imax: true, langs: ['English', 'Tamil', 'Hindi'],
    c1: '#030712', c2: '#4fe3d6', motif: 'stars', cast: ['Elena Ward', 'Sam Okafor', 'Ivo Lind'], about: 'A repair crew on a dying space station has nine orbits to bring everyone home.' },
  { id: 'rajarumble', title: 'Raja Rumble', sub: '', lang: 'Telugu', genres: ['Action', 'Masala'], cert: 'U/A 16+', mins: 167, rating: 7.6, votes: 33900, rel: -2, imax: true, langs: ['Telugu', 'Tamil'],
    c1: '#2b0505', c2: '#ff7a00', motif: 'flame', cast: ['Ravi Teja K', 'Lakshmi P', 'Murali'], about: 'A lorry driver takes on a mining baron to win back his town\'s river.' },
  { id: 'mazhavil', title: 'Mazhavil', sub: '', lang: 'Malayalam', genres: ['Romance', 'Drama'], cert: 'U', mins: 138, rating: 8.8, votes: 19400, rel: -12, imax: false,
    c1: '#0c3b2e', c2: '#f2c14e', motif: 'arc', cast: ['Anjali Menon', 'Fahad N', 'Siddiq'], about: 'Two strangers keep meeting at the same Kochi ferry, one monsoon at a time.' },
  { id: 'lastferry', title: 'The Last Ferry', sub: '', lang: 'English', genres: ['Thriller', 'Mystery'], cert: 'A', mins: 119, rating: 7.9, votes: 44300, rel: -6, imax: false,
    c1: '#0d1117', c2: '#7d8da8', motif: 'moon', cast: ['Hugo Marsh', 'Priya Lal', 'Jon Aria'], about: 'Eleven passengers. One storm. Someone on board is not who they claim to be.' },
  { id: 'kanna', title: 'Little Kanna', sub: '', lang: 'Tamil', genres: ['Animation', 'Family'], cert: 'U', mins: 102, rating: 8.5, votes: 12700, rel: -18, imax: false,
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
export const movieById = (id) => MOVIES.find((m) => m.id === id);
export const isNowShowing = (m) => m.rel <= 0;

// Dates
export function dayKey(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; }
export function addDays(d, n) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; }
export function fromKey(k) { return new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8), 12); }
export const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
export function releaseDate(m) { return addDays(today(), m.rel); }

const SLOTS = ['0930', '1215', '1500', '1830', '2140'];
const SLOTS_LOUNGE = ['1100', '1445', '1900', '2230'];

// Which two movies each screen plays on a given day. Every movie in cinemas
// gets at least one regular screen in every city, every day.
function lineup(screen, cityIdx, dk) {
  const showing = MOVIES.filter(isNowShowing);
  if (screen.hall === 'imax') {
    const big = showing.filter((m) => m.imax);
    const r = mulberry32(hash(screen.id + dk));
    const i = Math.floor(r() * big.length);
    return [big[i], big[(i + 1) % big.length]];
  }
  const city = CITIES[cityIdx];
  const regular = theatresFor(city.id).flatMap((t) => t.screens).filter((s) => s.hall !== 'imax');
  const order = [...showing];
  const r = mulberry32(hash(city.id + dk));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const k = regular.findIndex((s) => s.id === screen.id);
  return [order[(2 * k) % order.length], order[(2 * k + 1) % order.length]];
}

export function showsFor({ cityId, dk, movieId = null, theatreId = null }) {
  const out = [];
  const ci = CITIES.findIndex((c) => c.id === cityId);
  const now = new Date();
  for (const th of theatresFor(cityId)) {
    if (theatreId && th.id !== theatreId) continue;
    for (const sc of th.screens) {
      const [a, b] = lineup(sc, ci, dk);
      const slots = sc.hall === 'lounge' ? SLOTS_LOUNGE : SLOTS;
      slots.forEach((hm, i) => {
        const mv = i % 2 === 0 ? a : b;
        if (movieId && mv.id !== movieId) return;
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
  const occ = Math.min(0.92, 0.12 + r() * 0.5 + prime + weekend);
  const langs = mv.langs || [mv.lang];
  const lang = langs[Math.floor(r() * langs.length)];
  return { id, theatreId: th.id, screenIdx: sc.idx, hall: sc.hall, fmt: sc.fmt, movieId: mv.id, dk, hm, occ, lang };
}
export function showById(id) {
  const m = /^(c\d+t\d+)s(\d+)d(\d{8})h(\d{4})$/.exec(id); if (!m) return null;
  const th = theatreById(m[1]); if (!th) return null;
  const sc = th.screens[+m[2]]; if (!sc) return null;
  const ci = CITIES.findIndex((c) => c.id === th.cityId);
  const [a, b] = lineup(sc, ci, m[3]);
  const slots = sc.hall === 'lounge' ? SLOTS_LOUNGE : SLOTS;
  const i = slots.indexOf(m[4]); if (i < 0) return null;
  return makeShow(th, sc, i % 2 === 0 ? a : b, m[3], m[4]);
}
export function hmLabel(hm) {
  let h = +hm.slice(0, 2); const mm = hm.slice(2); const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12; return `${h}:${mm} ${ap}`;
}
export function partOfDay(hm) { const h = +hm.slice(0, 2); return h < 12 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night'; }

export const SNACKS = [
  { id: 'pop', en: 'Salted popcorn (L)', ta: 'உப்பு பாப்கார்ன் (L)', price: 280, tone: 'var(--teal-soft)' },
  { id: 'car', en: 'Caramel popcorn (L)', ta: 'கேரமல் பாப்கார்ன் (L)', price: 320, tone: 'var(--red-soft)' },
  { id: 'nac', en: 'Nachos with cheese', ta: 'சீஸ் நாச்சோஸ்', price: 260, tone: 'var(--teal-soft)' },
  { id: 'cof', en: 'Cold coffee', ta: 'குளிர் காபி', price: 220, tone: 'var(--red-soft)' },
  { id: 'cmb', en: 'Combo · 2 popcorn + 2 drinks', ta: 'காம்போ · 2 பாப்கார்ன் + 2 பானம்', price: 690, tone: 'var(--teal-soft)' },
];
export const FEE_PER_TICKET = 21; // ₹18 fee + 18% GST, shown all-in

// Events, plays, sports and activities (fictional). day = days from today.
export const EVENT_CATS = [
  { id: 'events', en: 'Events', ta: 'நிகழ்வுகள்', icon: 'spark', c1: '#14161f', c2: '#e5414f' },
  { id: 'plays', en: 'Plays', ta: 'நாடகங்கள்', icon: 'ticket', c1: '#14161f', c2: '#0e9f9f' },
  { id: 'sports', en: 'Sports', ta: 'விளையாட்டு', icon: 'star', c1: '#e5414f', c2: '#14161f' },
  { id: 'activities', en: 'Activities', ta: 'செயல்பாடுகள்', icon: 'pin', c1: '#0e9f9f', c2: '#14161f' },
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
export const OFFERS = [
  { code: 'FIRST50', en: '50% off up to ₹150 on your first booking', pct: 50, max: 150, min: 0 },
  { code: 'MORNING20', en: '20% off morning shows (before 12 PM)', pct: 20, max: 200, min: 0, morning: true },
  { code: 'UPI40', en: 'Flat ₹40 off when you pay by UPI', flat: 40, min: 300, upi: true },
  { code: 'GROUP4', en: '₹100 off when you book 4 or more seats', flat: 100, min: 0, minSeats: 4 },
];
export const CONV_FEE = 18;   // base convenience fee per ticket
export const GST = 0.18;      // tax on the fee
export const HOLD_MINUTES = 5;
