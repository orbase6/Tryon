// Hall layouts. Every screen is described by a "spec": the seat grid (like a
// box-office seat plan) plus a few physical measurements. From that one spec we
// build the 2D map, the 3D hall, the view score and the assistant's seat picks.
//
// Row plan format (one string per row, blocks separated by "_" = aisle):
//   S seat · R recliner (sold in pairs) · W wheelchair space · X broken/blocked seat · . empty space
//   A number means that many S (or R in a recliner row), e.g. "W3_12_3W"
import { mulberry32, hash } from './data.js';

const rowsOf = (letters, cls, plan) => letters.split('').map((r) => ({ r, cls, plan }));

export const HALLS = {
  classic: {
    en: 'Stadium + balcony', ta: 'ஸ்டேடியம் + பால்கனி', prices: { royal: 550, balcony: 320, prime: 240, classic: 160 },
    spec: {
      screen: { w: 20, h: 8.5, curve: 0.7, elev: 1.95 }, room: { halfW: 13.45, ceiling: 14, curve: 18.9 },
      geo: { firstRow: 6.9, rowGap: 1.15, recGap: 1.8, rise: 0.26, recRise: 0.45 },
      rows: [{ r: 'A', cls: 'classic', plan: 'W3_12_3W' }, ...rowsOf('BC', 'classic', '4_12_4'), ...rowsOf('DEFGHIJK', 'prime', '5_14_5'), ...rowsOf('LM', 'royal', '4_8_4'), ...rowsOf('NOPQ', 'balcony', '6_14_6')],
      balcony: { from: 'N', base: 6.0, gap: 3.05, rowGap: 1.2, rise: 0.4 },
    },
  },
  imax: {
    en: 'IMAX · steep stadium', ta: 'IMAX · செங்குத்தான ஸ்டேடியம்', prices: { premium: 450, standard: 350 },
    spec: {
      screen: { w: 27, h: 14.5, curve: 1.8, elev: 1.35 }, room: { halfW: 15, ceiling: 19, curve: 25.4 },
      geo: { firstRow: 9.1, rowGap: 1.2, recGap: 1.8, rise: 0.46, recRise: 0.5 },
      rows: [{ r: 'A', cls: 'standard', plan: 'W5_16_5W' }, ...rowsOf('BCD', 'standard', '6_16_6'), ...rowsOf('EFGHIJK', 'premium', '6_16_6'), ...rowsOf('LMN', 'standard', '6_16_6')],
      balcony: null,
    },
  },
  lounge: {
    en: 'All-recliner lounge', ta: 'முழு ரெக்லைனர் லவுஞ்ச்', prices: { couple: 900, recliner: 600 },
    spec: {
      screen: { w: 12, h: 5.1, curve: 0.3, elev: 1.15 }, room: { halfW: 9.2, ceiling: 8.5, curve: 50.2 },
      geo: { firstRow: 7.4, rowGap: 1.85, recGap: 1.85, rise: 0.36, recRise: 0.36 },
      rows: [...rowsOf('ABCDE', 'recliner', '4_6_4'), { r: 'F', cls: 'couple', plan: '2_4_2' }],
      balcony: null,
    },
  },
  single: {
    en: 'Old-style single screen', ta: 'பழைய ஒற்றைத் திரை', prices: { balcony: 150, back: 120, middle: 90, front: 60 },
    spec: {
      screen: { w: 18, h: 7.6, curve: 0, elev: 1.6 }, room: { halfW: 14, ceiling: 13, curve: 384.8 },
      geo: { firstRow: 5.7, rowGap: 1.02, recGap: 1.6, rise: 0.12, recRise: 0.3 },
      rows: [{ r: 'A', cls: 'front', plan: 'W5_16_5W' }, ...rowsOf('BCD', 'front', '6_16_6'), ...rowsOf('EFGHIJK', 'middle', '6_16_6'), ...rowsOf('LMNOP', 'back', '6_16_6'), ...rowsOf('QRST', 'balcony', '7_16_7')],
      balcony: { from: 'Q', base: 5.2, gap: 3.8, rowGap: 1.2, rise: 0.42 },
    },
  },
  multiplex: {
    en: 'Standard multiplex', ta: 'சாதாரண மல்டிப்ளெக்ஸ்', prices: { recliner: 400, prime: 220, classic: 170 },
    spec: {
      screen: { w: 16, h: 6.8, curve: 0.5, elev: 1.3 }, room: { halfW: 11, ceiling: 11, curve: 23.6 },
      geo: { firstRow: 6.2, rowGap: 1.1, recGap: 1.7, rise: 0.3, recRise: 0.7 },
      rows: [{ r: 'A', cls: 'classic', plan: 'W3_12_3W' }, ...rowsOf('BC', 'classic', '4_12_4'), ...rowsOf('DEFGHIJ', 'prime', '4_12_4'), { r: 'K', cls: 'recliner', plan: '4_6_4' }],
      balcony: null,
    },
  },
};

/* ---------- custom layouts saved from the admin editor (per screen) ---------- */
const custom = new Map();
export function setCustomLayouts(obj) { custom.clear(); for (const [k, v] of Object.entries(obj || {})) custom.set(k, v); cache.clear(); }
export const customFor = (screenId) => custom.get(screenId) || null;
const screenIdOf = (show) => `${show.theatreId}s${show.screenIdx}`;
export function layoutFor(screenId, hall) { const c = custom.get(screenId); return c ? buildLayout(c, 'custom:' + screenId + ':' + hash(JSON.stringify(c))) : getLayout(hall); }
const priceOv = new Map();
export function setPriceOverrides(obj) { priceOv.clear(); for (const [k, v] of Object.entries(obj || {})) priceOv.set(k, v); }
export function pricesFor(screenId, hall) {
  const c = custom.get(screenId), base = (c && c.prices) || HALLS[hall].prices, ov = priceOv.get(screenId) || {};
  const out = {}; for (const k of Object.keys(base)) out[k] = ov[k] ?? base[k]; return out;
}
export const layoutOf = (show) => layoutFor(screenIdOf(show), show.hall);
export const pricesOf = (show) => pricesFor(screenIdOf(show), show.hall);
export const hallName = (screenId, hall) => (custom.get(screenId)?.name ? { en: custom.get(screenId).name, ta: custom.get(screenId).name } : HALLS[hall]);

/* ---------- plan parsing ---------- */
export const REC_CLASSES = ['royal', 'recliner', 'couple'];
export function parsePlan(plan, recRow) {
  return plan.split('_').map((blk) => {
    const cells = [];
    for (const m of blk.toUpperCase().matchAll(/(\d+)|([SRWX.])/g)) {
      if (m[1]) for (let i = 0; i < +m[1]; i++) cells.push(recRow ? 'R' : 'S');
      else cells.push(m[2]);
    }
    return cells;
  }).filter((c) => c.length);
}

/* ---------- build a layout from a spec ---------- */
const cache = new Map();
export function getLayout(hallKey) { return buildLayout({ ...HALLS[hallKey].spec, prices: HALLS[hallKey].prices }, 'hall:' + hallKey, hallKey); }

export function buildLayout(spec, key = 'x', hallKey = null) {
  if (cache.has(key)) return cache.get(key);
  const S = spec.screen, G = spec.geo, room = spec.room;
  const screenZ = -15, CZ = screenZ - room.curve;
  const balcIdx = spec.balcony ? spec.rows.findIndex((r) => r.r === spec.balcony.from) : -1;
  // Row positions: distance and height grow row by row; recliner rows take more space
  let z = screenZ + G.firstRow, y = 0.12, prevRec = false;
  const rowsIn = spec.rows.map((r, i) => {
    const cells = parsePlan(r.plan, /R/i.test(r.plan) || REC_CLASSES.includes(r.cls));
    const rec = cells.flat().includes('R');
    const isBalc = balcIdx >= 0 && i >= balcIdx;
    if (i > 0) {
      if (i === balcIdx) { z += spec.balcony.gap; y = spec.balcony.base + 0.28; }
      else if (isBalc) { z += spec.balcony.rowGap; y += spec.balcony.rise; }
      else { z += rec || prevRec ? G.recGap : G.rowGap; y += rec ? G.recRise : G.rise; }
    }
    prevRec = rec;
    return { letter: r.r, cls: r.cls, z, y, cells, rec, balcony: isBalc };
  });
  const last = rowsIn[rowsIn.length - 1];
  const front = screenZ - 0.9, back = last.z + (last.rec ? 2.6 : 2.3);
  const lay = {
    key, hallKey, CZ, W: room.halfW, H: room.ceiling, front, back,
    screen: { z: screenZ, y: S.elev + S.h / 2, w: S.w, h: S.h, curve: S.curve },
    balcony: spec.balcony ? { frontZ: rowsIn[balcIdx].z - 1.3, base: spec.balcony.base } : null,
    prices: spec.prices || {},
  };
  const seats = [], disabled = new Set();
  const rows = rowsIn.map((row, ri) => {
    const R = row.z - CZ, pitch = row.rec ? 1.1 : 0.68;
    const blocks = [], gaps = [], items = [];
    let s = 0, num = 0, first = true;
    row.cells.forEach((cells, bi) => {
      if (bi > 0) { const g0 = s; s += pitch + 0.9 + (row.rec ? 0.2 : 0); gaps.push((g0 + s) / 2); }
      let block = [], k = 0, recRun = 0;
      cells.forEach((c, ci) => {
        if (!(first && ci === 0)) { if (!(bi > 0 && ci === 0)) s += row.rec ? (recRun % 2 ? 1.04 : 1.26) : pitch; }
        first = false;
        if (c === '.') { if (block.length) blocks.push(block); block = []; k = 0; recRun = 0; return; }
        num++;
        const seat = { row: row.letter, num, id: row.letter + num, cls: row.cls, kind: c === 'R' ? 'rec' : 'std', s, block: blocks.length, k: k++, ri };
        if (c === 'W') seat.acc = true;
        if (c === 'X') { seat.disabled = true; disabled.add(seat.id); }
        recRun = c === 'R' ? recRun + 1 : 0;
        block.push(seat); items.push(seat);
      });
      if (block.length) blocks.push(block);
    });
    const half = s / 2;
    for (const seat of items) {
      seat.s -= half; seat.theta = seat.s / R;
      seat.x = R * Math.sin(seat.theta); seat.y = row.y; seat.z = CZ + R * Math.cos(seat.theta);
      seats.push(seat);
    }
    // recliners are sold in pairs (side by side inside a block)
    for (const b of blocks) { const r = b.filter((x) => x.kind === 'rec'); for (let k = 0; k + 1 < r.length; k += 2) { r[k].partner = r[k + 1]; r[k + 1].partner = r[k]; } }
    blocks.forEach((b, i) => b.forEach((x, k) => { x.block = i; x.k = k; }));
    return { letter: row.letter, cls: row.cls, z: row.z, y: row.y, R, blocks, gaps: gaps.map((g) => g - half), half, seats: items, ri, pair: row.rec, pitch, balcony: row.balcony };
  });
  const main = rows.filter((r) => !r.balcony), balc = rows.filter((r) => r.balcony);
  main.forEach((r, i) => { r.frontR = main[i - 1] ? (main[i - 1].R + r.R) / 2 : r.R - 0.75; r.backR = main[i + 1] ? (r.R + main[i + 1].R) / 2 : (lay.balcony ? lay.balcony.frontZ - CZ : back - CZ + 50); });
  balc.forEach((r, i) => { r.frontR = balc[i - 1] ? (balc[i - 1].R + r.R) / 2 : lay.balcony.frontZ - CZ + 0.3; r.backR = balc[i + 1] ? (r.R + balc[i + 1].R) / 2 : null; });
  Object.assign(lay, { rows, main, balc, seats, disabled, byId: new Map(seats.map((s) => [s.id, s])) });
  for (const s of seats) Object.assign(s, viewScore(s, lay));
  cache.set(key, lay);
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
  // Comfortable: 0.75–1.9 screen widths away, under ~12° looking up, small side angle
  s -= Math.max(0, 0.75 - ratio) * 120;
  s -= Math.max(0, ratio - 1.9) * 35;
  s -= Math.max(0, side - 8) * 1.4;
  s -= Math.max(0, up - 12) * 2.4;
  s -= Math.max(0, -up - 14) * 1.2;
  const score = Math.max(8, Math.min(100, Math.round(s)));
  let note = 'centre';
  if (ratio < 0.75) note = 'close'; else if (up > 16) note = 'neck'; else if (side > 22) note = 'side'; else if (ratio > 1.9) note = 'far';
  return { score, ratio, side, up, note };
}
export function scoreLabel(score) {
  return score >= 88 ? 'perfect' : score >= 75 ? 'great' : score >= 60 ? 'good' : score >= 45 ? 'okay' : 'poor';
}
export function scoreColor(score) {
  // Blend of two brand colours: red (tough view) to yellow (great view)
  const k = Math.max(0, Math.min(1, (score - 35) / 60));
  return `color-mix(in srgb, var(--yel) ${Math.round(k * 100)}%, var(--red))`;
}
export function scoreHex(score) {
  const k = Math.max(0, Math.min(1, (score - 35) / 60));
  const a = [0xe5, 0x41, 0x4f], b = [0xff, 0xc7, 0x2c];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

// Which seats are taken for a show (deterministic), plus blocked seats and seats booked on this device
export function bookedFor(show, lay, extra = []) {
  const r = mulberry32(hash(show.id + 'seats'));
  const set = new Set([...extra, ...lay.disabled]);
  for (const row of lay.rows) {
    const half = row.half + 0.01;
    for (const s of row.seats) {
      if (s.partner && s.partner.num < s.num) continue;
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
      if (row.pair && b[i].partner && b[i].partner.k < b[i].k) continue;
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
    if (row.pair && b[i].partner && b[i].partner.k < b[i].k) continue;
    const run = b.slice(i, i + need);
    if (run.some((x) => booked.has(x.id))) continue;
    const d = Math.abs(i - seat.k);
    if (!best || d < best.d) best = { d, run };
  }
  return best ? best.run : null;
}

// Plan text <-> spec rows, for the admin editor
export function rowsToText(rows) { return rows.map((r) => `${r.r} ${r.cls} ${r.plan}`).join('\n'); }
export function textToRows(text) {
  const out = [], errors = [];
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const m = /^([A-Za-z]{1,2})\s+([a-z]+)\s+([0-9SRWXsrwx._]+)$/.exec(line);
    if (!m) { errors.push(`Line ${i + 1}: write it like "A classic 4_12_4"`); return; }
    out.push({ r: m[1].toUpperCase(), cls: m[2], plan: m[3] });
  });
  return { rows: out, errors };
}
export function specOfHall(hallKey) { return JSON.parse(JSON.stringify({ ...HALLS[hallKey].spec, prices: HALLS[hallKey].prices, base: hallKey })); }
