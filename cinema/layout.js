// Hall layouts: one function per hall type. Pure data (no Three.js) so the
// 2D map, the 3D view, the view score and the voice assistant all share it.
import { mulberry32, hash } from './data.js';

const L = (s) => s.split('');

export const HALLS = {
  classic: {
    en: 'Stadium + balcony', ta: 'ஸ்டேடியம் + பால்கனி', prices: { royal: 550, balcony: 320, prime: 240, classic: 160 },
    build() {
      const rows = [];
      L('ABCDEFGHIJK').forEach((r, i) => rows.push({ letter: r, cls: i < 3 ? 'classic' : 'prime', z: -8.2 + i * 1.15, y: 0.12 + i * 0.26, blocks: i < 3 ? [4, 12, 4] : [5, 14, 5], pitch: 0.68, kind: 'std' }));
      rows.push({ letter: 'L', cls: 'royal', z: 4.85, y: 3.15, blocks: [4, 8, 4], pitch: 1.1, kind: 'rec', pair: true });
      rows.push({ letter: 'M', cls: 'royal', z: 6.65, y: 3.6, blocks: [4, 8, 4], pitch: 1.1, kind: 'rec', pair: true });
      L('NOPQ').forEach((r, i) => rows.push({ letter: r, cls: 'balcony', z: 9.7 + i * 1.2, y: 6.25 + i * 0.4, blocks: [6, 14, 6], pitch: 0.68, kind: 'std', balcony: true }));
      return { CZ: -34, W: 13.45, H: 14, front: -16, back: 15.5, screen: { z: -15.1, y: 6.2, w: 20, h: 8.5, curve: 0.7 }, rows, balcony: { frontZ: 8.4, base: 6.0 } };
    },
  },
  imax: {
    en: 'IMAX · steep stadium', ta: 'IMAX · செங்குத்தான ஸ்டேடியம்', prices: { premium: 450, standard: 350 },
    build() {
      const rows = L('ABCDEFGHIJKLMN').map((r, i) => ({ letter: r, cls: i >= 4 && i <= 10 ? 'premium' : 'standard', z: -7.5 + i * 1.2, y: 0.1 + i * 0.46, blocks: [6, 16, 6], pitch: 0.7, kind: 'std' }));
      return { CZ: -42, W: 15, H: 19, front: -17.5, back: 10.6, screen: { z: -16.6, y: 8.6, w: 27, h: 14.5, curve: 1.8 }, rows, balcony: null };
    },
  },
  lounge: {
    en: 'All-recliner lounge', ta: 'முழு ரெக்லைனர் லவுஞ்ச்', prices: { couple: 900, recliner: 600 },
    build() {
      const rows = L('ABCDE').map((r, i) => ({ letter: r, cls: 'recliner', z: -2.4 + i * 1.85, y: 0.12 + i * 0.36, blocks: [4, 6, 4], pitch: 1.1, kind: 'rec', pair: true }));
      rows.push({ letter: 'F', cls: 'couple', z: -2.4 + 5 * 1.85, y: 0.12 + 5 * 0.36, blocks: [2, 4, 2], pitch: 1.1, kind: 'rec', pair: true });
      return { CZ: -60, W: 9.2, H: 8.5, front: -10.5, back: 9.4, screen: { z: -9.8, y: 3.7, w: 12, h: 5.1, curve: 0.3 }, rows, balcony: null };
    },
  },
  single: {
    en: 'Old-style single screen', ta: 'பழைய ஒற்றைத் திரை', prices: { balcony: 150, back: 120, middle: 90, front: 60 },
    build() {
      const rows = L('ABCDEFGHIJKLMNOP').map((r, i) => ({ letter: r, cls: i < 4 ? 'front' : i < 11 ? 'middle' : 'back', z: -9.5 + i * 1.02, y: 0.05 + i * 0.12, blocks: [6, 16, 6], pitch: 0.66, kind: 'std' }));
      L('QRST').forEach((r, i) => rows.push({ letter: r, cls: 'balcony', z: 9.6 + i * 1.2, y: 5.5 + i * 0.42, blocks: [7, 16, 7], pitch: 0.66, kind: 'std', balcony: true }));
      return { CZ: -400, W: 14, H: 13, front: -16, back: 15.6, screen: { z: -15.2, y: 5.4, w: 18, h: 7.6, curve: 0 }, rows, balcony: { frontZ: 8.2, base: 5.2 } };
    },
  },
  multiplex: {
    en: 'Standard multiplex', ta: 'சாதாரண மல்டிப்ளெக்ஸ்', prices: { recliner: 400, prime: 220, classic: 170 },
    build() {
      const rows = L('ABCDEFGHIJ').map((r, i) => ({ letter: r, cls: i < 3 ? 'classic' : 'prime', z: -6.2 + i * 1.1, y: 0.1 + i * 0.3, blocks: [4, 12, 4], pitch: 0.68, kind: 'std' }));
      rows.push({ letter: 'K', cls: 'recliner', z: 5.4, y: 3.5, blocks: [4, 6, 4], pitch: 1.1, kind: 'rec', pair: true });
      return { CZ: -36, W: 11, H: 11, front: -13.2, back: 7.6, screen: { z: -12.4, y: 4.7, w: 16, h: 6.8, curve: 0.5 }, rows, balcony: null };
    },
  },
};

const cache = new Map();
export function getLayout(hallKey) {
  if (cache.has(hallKey)) return cache.get(hallKey);
  const spec = HALLS[hallKey].build();
  const { CZ } = spec;
  const seats = [];
  const rows = spec.rows.map((row, ri) => {
    const R = row.z - CZ;
    const blocks = [], gaps = [], items = [];
    let s = 0, num = 0;
    row.blocks.forEach((n, bi) => {
      const block = [];
      if (bi > 0) { const g0 = s; s += row.pitch + 0.9 + (row.pair ? 0.2 : 0); gaps.push((g0 + s) / 2); }
      for (let k = 0; k < n; k++) {
        if (k > 0) s += row.pair ? (k % 2 ? 1.04 : 1.26) : row.pitch;
        num++;
        const seat = { row: row.letter, num, id: row.letter + num, cls: row.cls, kind: row.kind, s, block: bi, k, ri };
        block.push(seat); items.push(seat);
      }
      blocks.push(block);
    });
    const half = s / 2;
    for (const seat of items) {
      seat.s -= half;
      seat.theta = seat.s / R;
      seat.x = R * Math.sin(seat.theta); seat.y = row.y; seat.z = CZ + R * Math.cos(seat.theta);
      seats.push(seat);
    }
    if (row.pair) for (const b of blocks) for (let k = 0; k + 1 < b.length; k += 2) { b[k].partner = b[k + 1]; b[k + 1].partner = b[k]; }
    return { ...row, R, blocks, gaps: gaps.map((g) => g - half), half, seats: items, ri };
  });
  // Wheelchair spaces: aisle-end seats of the first row on step-free halls
  if (hallKey !== 'lounge') { const a = rows[0].seats; a[0].acc = true; a[a.length - 1].acc = true; }
  // Tier boundaries (radius) for floors and camera limits
  const main = rows.filter((r) => !r.balcony), balc = rows.filter((r) => r.balcony);
  main.forEach((r, i) => { r.frontR = main[i - 1] ? (main[i - 1].R + r.R) / 2 : r.R - 0.75; r.backR = main[i + 1] ? (r.R + main[i + 1].R) / 2 : (spec.balcony ? spec.balcony.frontZ - CZ : spec.back - CZ + 50); });
  balc.forEach((r, i) => { r.frontR = balc[i - 1] ? (balc[i - 1].R + r.R) / 2 : spec.balcony.frontZ - CZ + 0.3; r.backR = balc[i + 1] ? (r.R + balc[i + 1].R) / 2 : null; });
  const byId = new Map(seats.map((s) => [s.id, s]));
  const lay = { key: hallKey, ...spec, rows, main, balc, seats, byId };
  for (const s of seats) Object.assign(s, viewScore(s, lay));
  cache.set(hallKey, lay);
  return lay;
}

export function groundY(lay, x, z) {
  if (z < lay.screen.z + 2.2) return 0.8;
  const r = Math.hypot(x, z - lay.CZ);
  let g = 0;
  for (const row of lay.main) if (r >= row.frontR) g = row.y;
  if (lay.balcony && r >= lay.balcony.frontZ - lay.CZ) {
    g = lay.balcony.base + 1;
    for (const row of lay.balc) if (r >= row.frontR) g = row.y;
  }
  return g;
}

// How good is the view from a seat? Distance vs screen width, side angle and neck angle.
export function viewScore(seat, lay) {
  const eyeY = seat.y + (seat.kind === 'rec' ? 1.2 : 1.15);
  const dz = seat.z - lay.screen.z, dx = seat.x;
  const dist = Math.hypot(dx, dz);
  const ratio = dist / lay.screen.w;
  const side = Math.abs(Math.atan2(dx, dz)) * 57.3;
  const up = Math.atan2(lay.screen.y - eyeY, dz) * 57.3;
  let s = 100;
  s -= Math.max(0, 0.9 - ratio) * 110;
  s -= Math.max(0, ratio - 1.9) * 35;
  s -= Math.max(0, side - 7) * 1.5;
  s -= Math.max(0, up - 9) * 2.6;
  s -= Math.max(0, -up - 14) * 1.2;
  const score = Math.max(8, Math.min(100, Math.round(s)));
  let note = 'centre';
  if (ratio < 0.9) note = 'close'; else if (up > 14) note = 'neck'; else if (side > 22) note = 'side'; else if (ratio > 1.9) note = 'far';
  return { score, ratio, side, up, note };
}
export function scoreLabel(score) {
  return score >= 88 ? 'perfect' : score >= 75 ? 'great' : score >= 60 ? 'good' : score >= 45 ? 'okay' : 'poor';
}
export function scoreColor(score) {
  // Blend of the two brand accents: red (tough view) to teal (great view)
  const k = Math.max(0, Math.min(1, (score - 35) / 60));
  return `color-mix(in srgb, var(--teal) ${Math.round(k * 100)}%, var(--red))`;
}
export function scoreHex(score) {
  const k = Math.max(0, Math.min(1, (score - 35) / 60));
  const a = [0xe5, 0x41, 0x4f], b = [0x0e, 0x9f, 0x9f];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

// Which seats are taken for a show (deterministic) plus seats booked on this device
export function bookedFor(show, lay, extra = []) {
  const r = mulberry32(hash(show.id + 'seats'));
  const set = new Set(extra);
  for (const row of lay.rows) {
    const half = row.half + 0.01;
    for (const s of row.seats) {
      if (row.pair && s.k % 2) continue;
      const central = 1 - Math.abs(s.s) / half;
      const p = show.occ * (0.55 + 0.75 * central) * (s.score > 75 ? 1.15 : 0.85);
      if (r() < p) { set.add(s.id); if (s.partner) set.add(s.partner.id); }
    }
  }
  return set;
}

// Best block of n seats side by side (same row, same block). Prefers best view score.
export function bestBlock(lay, booked, n, cls = null) {
  let best = null;
  for (const row of lay.rows) {
    if (cls && row.cls !== cls) continue;
    const need = row.pair ? n + (n % 2) : n;
    for (const b of row.blocks) for (let i = 0; i + need <= b.length; i++) {
      if (row.pair && i % 2) continue;
      const run = b.slice(i, i + need);
      if (run.some((x) => booked.has(x.id))) continue;
      const score = run.reduce((a, x) => a + x.score, 0) / need - (row.pair && need > n ? 3 : 0);
      if (!best || score > best.score) best = { score, run };
    }
  }
  return best ? best.run : null;
}
// n seats next to a tapped seat, inside its block
export function blockAround(lay, booked, seat, n) {
  const row = lay.rows[seat.ri]; const b = row.blocks[seat.block];
  const need = row.pair ? n + (n % 2) : n;
  let best = null;
  for (let i = Math.max(0, seat.k - need + 1); i <= seat.k && i + need <= b.length; i++) {
    if (row.pair && i % 2) continue;
    const run = b.slice(i, i + need);
    if (run.some((x) => booked.has(x.id))) continue;
    const d = Math.abs(i - seat.k);
    if (!best || d < best.d) best = { d, run };
  }
  return best ? best.run : null;
}
export function priceOf(seat, hallKey) { return HALLS[hallKey].prices[seat.cls]; }
