// Strings, icons, posters and small helpers shared by every screen.
import { CLASS_META } from './data.js';

export const STR = {
  en: {
    app_tag: 'See your seat before you book',
    now: 'Now showing', soon: 'Coming soon', imax: 'Big screens & IMAX', family: 'For the family', near: 'Theatres near you',
    all: 'All', search: 'Search movies, theatres, languages', search_ph: 'Movie, theatre or language', no_results: 'Nothing found. Try a movie name or a language.',
    book: 'Book tickets', voice: 'Book by voice', voice_sub: 'Just say the movie, day and how many seats', ask: 'Ask Lumen',
    notify: 'Notify me', notified: 'We’ll remind you', releases: 'Releases {d}', interested: '{n} interested',
    in_cinemas: 'In cinemas', rating: 'rating', votes: '{n} votes', mins: '{h}h {m}m',
    shows_in: 'Shows in {c}', no_shows: 'No shows match. Try another date or remove a filter.', filters_all: 'All formats',
    morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night',
    fast: 'Filling fast', almost: 'Almost full', avail: 'Available', from: 'from {p}',
    hall: 'Hall', explore: 'Explore hall in 3D', km: '{k} km', today: 'Today', tomorrow: 'Tomorrow',
    how_many: 'How many seats?', seats_n: '{n} seats', seat_1: '1 seat', change: 'Change',
    screen: 'Screen', view_quality: 'View score', by_class: 'Seat type', best: 'Best seats', clear: 'Clear',
    your_seats: 'Your seats', pick_seats: 'Tap a seat on the map. We pick seats next to it.', view_from: 'See view from {id}',
    view_title: 'View from {id}', score: 'View score', continue: 'Continue', pay: 'Pay {p}', total: 'Total',
    tickets_n: '{n} tickets', ticket_1: '1 ticket', all_in: 'All-in price · no hidden fees',
    l_perfect: 'Perfect view', l_great: 'Great view', l_good: 'Good view', l_okay: 'Okay view', l_poor: 'Tough view',
    n_centre: 'Centred, comfortable distance', n_close: 'Very close to the screen', n_neck: 'You look up a lot', n_side: 'Side angle', n_far: 'Far from the screen',
    booked: 'Booked', yours: 'Your pick', wheelchair: 'Wheelchair space', pairs: 'Sold in pairs',
    t_taken: 'Seat {id} is already booked.', t_full: 'You picked {n} seats. Tap a chosen seat to remove it, or change the count.', t_none: 'No {n} seats together here. Try fewer seats.',
    t_pairs: 'Recliners come in pairs.', t_partial: 'Only {k} seats together here. Tap another seat for the rest.',
    snacks: 'Add snacks', snacks_sub: 'Skip if you like. Ready at the counter before the interval.', skip: 'Skip', next: 'Next',
    review: 'Review & pay', split: 'Split with friends', per_person: '{p} each', method: 'Pay with', upi: 'UPI', card: 'Card', wallet: 'Wallet',
    fees: 'Booking fee', demo: 'Demo checkout. No money is taken.', confirm: 'Confirm booking',
    done_title: 'You’re booked', done_sub: 'Show this QR at the entry.', see_view: 'See my seat view', directions: 'Directions', copy: 'Copy details', copied: 'Copied',
    my_tickets: 'My tickets', no_tickets: 'No tickets yet. Your bookings will show here.', upcoming: 'Upcoming', cancel: 'Cancel booking', cancelled: 'Booking cancelled.',
    city: 'Choose your city', lang_btn: 'தமிழ்', back: 'Back', close: 'Close',
    amenities: 'Facilities', screens: 'Screens', playing: 'Playing today',
    v_overview: 'Hall', v_front: 'Front', v_back: 'Back', explore_tip: 'Drag to look around. Tap a seat to see its view.',
    loading3d: 'Loading 3D view…', no3d: '3D is not supported on this device. Use the view score instead.',
    low_mode: 'Light mode on for smooth 3D',
  },
  ta: {
    app_tag: 'புக் பண்ணும் முன் உங்கள் இருக்கையைப் பாருங்கள்',
    now: 'இப்போது திரையில்', soon: 'விரைவில்', imax: 'பெரிய திரை & IMAX', family: 'குடும்பத்துடன்', near: 'அருகிலுள்ள திரையரங்குகள்',
    all: 'அனைத்தும்', search: 'படம், திரையரங்கு, மொழி தேடுங்கள்', search_ph: 'படம், திரையரங்கு அல்லது மொழி', no_results: 'எதுவும் கிடைக்கவில்லை. படத்தின் பெயரை முயற்சிக்கவும்.',
    book: 'டிக்கெட் புக் செய்', voice: 'குரலில் புக் செய்', voice_sub: 'படம், நாள், எத்தனை இருக்கை என்று சொல்லுங்கள்', ask: 'லுமெனிடம் கேளுங்கள்',
    notify: 'நினைவூட்டு', notified: 'நினைவூட்டுவோம்', releases: '{d} வெளியீடு', interested: '{n} பேர் ஆர்வம்',
    in_cinemas: 'திரையரங்குகளில்', rating: 'மதிப்பீடு', votes: '{n} வாக்குகள்', mins: '{h}ம {m}நி',
    shows_in: '{c} காட்சிகள்', no_shows: 'காட்சிகள் இல்லை. வேறு நாளை தேர்வு செய்யுங்கள்.', filters_all: 'அனைத்து வகை',
    morning: 'காலை', afternoon: 'மதியம்', evening: 'மாலை', night: 'இரவு',
    fast: 'வேகமாக நிரம்புகிறது', almost: 'கிட்டத்தட்ட நிரம்பியது', avail: 'இடம் உள்ளது', from: '{p} முதல்',
    hall: 'அரங்கு', explore: '3D-யில் அரங்கைப் பாருங்கள்', km: '{k} கி.மீ', today: 'இன்று', tomorrow: 'நாளை',
    how_many: 'எத்தனை இருக்கைகள்?', seats_n: '{n} இருக்கைகள்', seat_1: '1 இருக்கை', change: 'மாற்று',
    screen: 'திரை', view_quality: 'பார்வை மதிப்பு', by_class: 'இருக்கை வகை', best: 'சிறந்த இருக்கைகள்', clear: 'அழி',
    your_seats: 'உங்கள் இருக்கைகள்', pick_seats: 'வரைபடத்தில் ஒரு இருக்கையைத் தொடுங்கள். அருகிலுள்ளவற்றை நாங்கள் தேர்வு செய்வோம்.', view_from: '{id} பார்வை',
    view_title: '{id} இருக்கையிலிருந்து பார்வை', score: 'பார்வை மதிப்பு', continue: 'தொடர்', pay: '{p} செலுத்து', total: 'மொத்தம்',
    tickets_n: '{n} டிக்கெட்', ticket_1: '1 டிக்கெட்', all_in: 'முழு விலை · மறைமுக கட்டணம் இல்லை',
    l_perfect: 'அருமையான பார்வை', l_great: 'சிறந்த பார்வை', l_good: 'நல்ல பார்வை', l_okay: 'பரவாயில்லை', l_poor: 'கடினமான பார்வை',
    n_centre: 'நடுவில், சரியான தூரம்', n_close: 'திரைக்கு மிக அருகில்', n_neck: 'அதிகம் மேலே பார்க்க வேண்டும்', n_side: 'பக்கவாட்டு கோணம்', n_far: 'திரையிலிருந்து தூரம்',
    booked: 'பதிவானது', yours: 'உங்கள் தேர்வு', wheelchair: 'சக்கர நாற்காலி இடம்', pairs: 'ஜோடியாக மட்டும்',
    t_taken: '{id} ஏற்கனவே பதிவாகிவிட்டது.', t_full: '{n} இருக்கைகள் தேர்வானது. நீக்க தேர்வான இருக்கையைத் தொடுங்கள்.', t_none: 'இங்கே {n} இருக்கைகள் சேர்ந்து இல்லை.',
    t_pairs: 'ரெக்லைனர் ஜோடியாக மட்டும்.', t_partial: 'இங்கே {k} இருக்கைகள் மட்டுமே சேர்ந்து உள்ளன. மீதிக்கு வேறு இருக்கையைத் தொடுங்கள்.',
    snacks: 'சிற்றுண்டி சேர்க்கவும்', snacks_sub: 'வேண்டாமென்றால் தவிர்க்கலாம்.', skip: 'தவிர்', next: 'அடுத்து',
    review: 'சரிபார்த்து செலுத்து', split: 'நண்பர்களுடன் பிரிக்க', per_person: 'ஒருவருக்கு {p}', method: 'செலுத்தும் முறை', upi: 'UPI', card: 'கார்டு', wallet: 'வாலெட்',
    fees: 'புக்கிங் கட்டணம்', demo: 'இது டெமோ. பணம் எடுக்கப்படாது.', confirm: 'பதிவை உறுதி செய்',
    done_title: 'பதிவு முடிந்தது', done_sub: 'நுழைவில் இந்த QR-ஐக் காட்டுங்கள்.', see_view: 'என் இருக்கைப் பார்வை', directions: 'வழி', copy: 'விவரம் நகலெடு', copied: 'நகலெடுக்கப்பட்டது',
    my_tickets: 'என் டிக்கெட்டுகள்', no_tickets: 'இன்னும் டிக்கெட் இல்லை.', upcoming: 'வரவிருக்கும்', cancel: 'பதிவை ரத்து செய்', cancelled: 'பதிவு ரத்து செய்யப்பட்டது.',
    city: 'உங்கள் நகரத்தைத் தேர்வு செய்யுங்கள்', lang_btn: 'English', back: 'பின்', close: 'மூடு',
    amenities: 'வசதிகள்', screens: 'திரைகள்', playing: 'இன்று ஓடுபவை',
    v_overview: 'அரங்கு', v_front: 'முன்', v_back: 'பின்', explore_tip: 'இழுத்து சுற்றிப் பாருங்கள். இருக்கையைத் தொட்டால் அதன் பார்வை.',
    loading3d: '3D ஏற்றப்படுகிறது…', no3d: 'இந்த சாதனத்தில் 3D இல்லை. பார்வை மதிப்பைப் பயன்படுத்துங்கள்.',
    low_mode: 'மென்மையான 3D-க்காக லைட் மோடு',
  },
};
export const state = { lang: 'en' };
try { if (localStorage.getItem('lumen.lang') === 'ta') state.lang = 'ta'; } catch (e) {}
export function t(k, v = {}) { return String(STR[state.lang][k] ?? STR.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); }
export const tx = (o) => (state.lang === 'ta' && o.ta ? o.ta : o.en);
export const clsName = (k) => tx(CLASS_META[k]);
export const inr = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const compact = (n) => (n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));

const P = {
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', chev: '<path d="M6 9l6 6 6-6"/>', right: '<path d="M9 5l7 7-7 7"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  cube: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  seat: '<path d="M7 3h10a1 1 0 0 1 1 1v8H6V4a1 1 0 0 1 1-1z"/><path d="M4 10v6h16v-6M6 16v4M18 16v4"/>',
  person: '<circle cx="12" cy="7.5" r="4" fill="currentColor" stroke="none"/><path d="M3.5 22c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5z" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  wheel: '<circle cx="10" cy="15" r="5"/><circle cx="11" cy="4" r="1.5" fill="currentColor"/><path d="M11 6v6h5l2 5"/>',
  send: '<path d="M4 12l16-8-6 16-2-6z"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  popcorn: '<path d="M6 9l1.5 12h9L18 9z"/><path d="M6 9a2.5 2.5 0 0 1 3-4 3 3 0 0 1 6 0 2.5 2.5 0 0 1 3 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  fire: '<path d="M12 3c3 4 6 6.5 6 11a6 6 0 0 1-12 0c0-3 1.5-4.5 3-6 0 2 1 3 2 3-1-3 0-6 1-8z"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>', grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
};
export const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// Posters drawn as small inline SVGs: no image downloads at all.
function motif(m, c2) {
  switch (m) {
    case 'sun': return `<circle cx="140" cy="150" r="46" fill="${c2}" opacity=".95"/><rect y="168" width="200" height="132" fill="#000" opacity=".45"/><path d="M0 200q50-14 100 0t100 0v100H0z" fill="#000" opacity=".5"/>`;
    case 'waves': return [0, 1, 2, 3].map((i) => `<path d="M-10 ${150 + i * 28}q25-16 50 0t50 0 50 0 50 0 50 0" stroke="${c2}" stroke-width="5" fill="none" opacity="${0.9 - i * 0.18}"/>`).join('');
    case 'leaf': return `<path d="M100 60c55 30 60 110 0 160-60-50-55-130 0-160z" fill="${c2}" opacity=".85"/><path d="M100 70v150" stroke="#000" stroke-opacity=".35" stroke-width="3"/>`;
    case 'stars': { let s = ''; for (let i = 0; i < 26; i++) { const x = (i * 73) % 200, y = (i * 131) % 210 + 10, r = (i % 3) + 1; s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.4 + (i % 4) * 0.15}"/>`; } return s + `<circle cx="150" cy="70" r="30" fill="none" stroke="${c2}" stroke-width="4"/><ellipse cx="150" cy="70" rx="52" ry="12" fill="none" stroke="${c2}" stroke-width="2" opacity=".7"/>`; }
    case 'flame': return `<path d="M100 40c30 40 60 70 40 120-10 25-30 40-40 40s-30-15-40-40c-12-30 5-55 20-75 2 20 10 30 20 30-10-30 0-55 0-75z" fill="${c2}"/><path d="M100 110c14 18 20 34 10 52-5 8-15 10-20 0-8-16 0-30 10-52z" fill="#fff3" />`;
    case 'arc': return [0, 1, 2, 3, 4].map((i) => `<path d="M${20 + i * 10} 220a${80 - i * 10} ${80 - i * 10} 0 0 1 ${160 - i * 20} 0" stroke="${c2}" stroke-width="7" fill="none" opacity="${1 - i * 0.16}"/>`).join('');
    case 'moon': return `<circle cx="120" cy="90" r="44" fill="${c2}"/><circle cx="138" cy="78" r="40" fill="#000" opacity=".55"/><path d="M0 230h200v70H0z" fill="#000" opacity=".5"/>`;
    case 'road': return `<path d="M70 300L96 120h8l26 180z" fill="#000" opacity=".5"/><path d="M100 300v-170" stroke="${c2}" stroke-width="4" stroke-dasharray="14 12"/><circle cx="100" cy="100" r="30" fill="${c2}" opacity=".9"/>`;
    default: return '';
  }
}
// Uploaded poster if there is one, else a drawn one. Images load lazily so rails stay fast.
export function poster(m, { big = false } = {}) {
  if (m.poster) return `<img class="poster-img" src="${esc(m.poster)}" alt="${esc(m.title)} poster" loading="${big ? 'eager' : 'lazy'}" decoding="async">`;
  return posterArt(m, { big });
}
// Default picture when a theatre has no photo yet: a ticket on the brand colours
export const ticketArt = (label = '') => `<span class="ticket-art" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>${label ? `<b>${esc(label)}</b>` : ''}</span>`;
export function posterArt(m, { big = false } = {}) {
  const words = m.title.split(' ');
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 11) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  const fs = lines.some((l) => l.length > 8) ? 26 : 32;
  const y0 = 268 - (lines.length - 1) * (fs + 2);
  return `<svg class="poster-svg" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(m.title)} poster">
    <defs><linearGradient id="g-${m.id}${big ? 'b' : ''}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${m.c1}"/><stop offset="1" stop-color="${m.c2}" stop-opacity=".55"/></linearGradient>
    <linearGradient id="s-${m.id}${big ? 'b' : ''}" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></linearGradient></defs>
    <rect width="200" height="300" fill="${m.c1}"/><rect width="200" height="300" fill="url(#g-${m.id}${big ? 'b' : ''})"/>
    ${motif(m.motif, m.c2)}
    <rect width="200" height="300" fill="url(#s-${m.id}${big ? 'b' : ''})"/>
    ${lines.map((l, i) => `<text x="14" y="${y0 + i * (fs + 2)}" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="${fs}" fill="#fff" letter-spacing="-0.5">${esc(l.toUpperCase())}</text>`).join('')}
    <text x="14" y="288" font-family="Figtree, Arial, sans-serif" font-weight="600" font-size="10" fill="#fff" opacity=".75" letter-spacing="1.5">${esc(m.lang.toUpperCase())} · ${esc(m.cert)}</text>
  </svg>`;
}

// Device capability tier: keeps 3D smooth on low-end phones
export function deviceTier() {
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(screen.width, screen.height) < 420;
  if (mem <= 2 || cores <= 4 || (small && mem <= 4)) return 'low';
  if (mem <= 4 || cores <= 6) return 'mid';
  return 'high';
}

let toastTimer = 0;
export function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
export function fmtDate(d, short = false) {
  const loc = state.lang === 'ta' ? 'ta-IN' : 'en-IN';
  return d.toLocaleDateString(loc, short ? { weekday: 'short', day: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
}
