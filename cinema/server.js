// Lumen server: serves the app and a small JSON API shared by every device.
// No packages needed. Run:  node server.js   (then open http://127.0.0.1:5500)
// Data is kept in data/db.json. This is a demo server: there is no login yet,
// so do not put it on the public internet with real customer data.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = +process.env.PORT || 5500;
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const SECTIONS = ['movies', 'hiddenMovies', 'schedule', 'theatres', 'offers', 'fees', 'layouts', 'prices'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

let db = { movies: [], hiddenMovies: [], schedule: {}, theatres: {}, offers: null, fees: null, layouts: {}, prices: {}, bookings: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* first run */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  }, 150);
}

// Seat holds live in memory: show -> seat -> { client, until }
const holds = new Map();
const holdMinutes = () => (db.fees && db.fees.holdMinutes) || 5;
function soldSeats(show) {
  const out = new Set();
  for (const b of db.bookings) if (b.showId === show && !b.cancelled) for (const s of b.seats || []) out.add(s);
  return out;
}
function heldByOthers(show, client) {
  const m = holds.get(show); const out = new Set(); if (!m) return out;
  const now = Date.now();
  for (const [seat, h] of m) { if (h.until < now) m.delete(seat); else if (h.client !== client) out.add(seat); }
  return out;
}

function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 5e6) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}

async function apiRoute(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '');
  if (req.method === 'GET' && p === 'state') return send(res, 200, db);
  if (req.method === 'PUT' && SECTIONS.includes(p)) { db[p] = await body(req); save(); return send(res, 200, { ok: true }); }
  if (req.method === 'GET' && p === 'taken') {
    const show = url.searchParams.get('show'), client = url.searchParams.get('client');
    return send(res, 200, { booked: [...soldSeats(show)], held: [...heldByOthers(show, client)] });
  }
  if (req.method === 'POST' && p === 'hold') {
    const { show, seats = [], client } = await body(req);
    const taken = seats.filter((s) => soldSeats(show).has(s) || heldByOthers(show, client).has(s));
    if (taken.length) return send(res, 409, { error: 'Some seats were just taken', taken });
    if (!holds.has(show)) holds.set(show, new Map());
    const m = holds.get(show);
    for (const [seat, h] of m) if (h.client === client) m.delete(seat); // one hold per person per show
    const until = Date.now() + holdMinutes() * 60000;
    for (const s of seats) m.set(s, { client, until });
    return send(res, 200, { until });
  }
  if (req.method === 'POST' && p === 'release') {
    const { show, client } = await body(req); const m = holds.get(show);
    if (m) for (const [seat, h] of m) if (h.client === client) m.delete(seat);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === 'book') {
    const b = await body(req);
    if (b.showId) {
      const taken = (b.seats || []).filter((s) => soldSeats(b.showId).has(s) || heldByOthers(b.showId, b.client).has(s));
      if (taken.length) return send(res, 409, { error: 'Some seats were just taken', taken });
      const m = holds.get(b.showId); if (m) for (const s of b.seats) m.delete(s);
    }
    db.bookings.unshift(b); save();
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === 'cancel') {
    const { id, refund } = await body(req); const b = db.bookings.find((x) => x.id === id);
    if (!b) return send(res, 404, { error: 'No such booking' });
    b.cancelled = true; b.refund = refund; b.cancelledAt = Date.now(); save();
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Unknown API route' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await apiRoute(req, res, url);
    if (url.pathname === '/config.json') return send(res, 200, { server: true });
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}data${path.sep}`) || file.endsWith('server.js')) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(buf);
    });
  } catch (e) { send(res, 400, { error: e.message }); }
}).listen(PORT, HOST, () => console.log(`Lumen running on http://${HOST}:${PORT}  (data in ${DB_FILE})`));
