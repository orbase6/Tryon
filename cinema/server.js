// Lumen server: serves the app and a JSON API shared by every device.
// No packages needed (Node 18+).  Run:  node server.js   then open http://127.0.0.1:5500
//
// Data: data/db.json (+ uploaded files in data/uploads). Logins for Lumen staff (admin) and
// theatre partners, with hashed passwords, sessions, email OTP for verification and password reset.
//
// Optional environment variables:
//   PORT, HOST                         where to listen (default 127.0.0.1:5500; use HOST=0.0.0.0 on a server)
//   DATA_DIR                           where db.json and uploads live (default ./data)
//   FORCE_HTTPS=1                      redirect http to https behind a hosting proxy
//   DEMO_MODE=0                        hide the "demo, no real payment" notice (only once real payments work)
//   ADMIN_EMAIL, ADMIN_PASSWORD        first admin account (otherwise one is created and printed once)
//   SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS, MAIL_FROM   to send OTP emails
//   (SMTP_SECURE=1 forces direct TLS on a port other than 465)
//   (without SMTP settings the OTP is printed in this window instead of being emailed)
//   Put them in settings.env (copy settings.example.env) instead of typing them each time.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');

const ROOT = __dirname;
// Settings can also live in settings.env next to this file (KEY=value per line; kept out of git)
try {
  for (const line of fs.readFileSync(path.join(ROOT, 'settings.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) { /* no settings file */ }
const PORT = +process.env.PORT || 5500;
const HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const UPLOADS = path.join(DATA, 'uploads');
const SECTIONS = ['movies', 'hiddenMovies', 'schedule', 'theatres', 'offers', 'fees', 'layouts', 'prices'];
const PARTNER_SECTIONS = ['schedule', 'layouts', 'prices']; // keyed by screen id
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8', '.bat': 'text/plain; charset=utf-8', '.sh': 'text/plain; charset=utf-8' };
const DAY = 864e5;

/* ---------------- storage ---------------- */
let db = { movies: [], hiddenMovies: [], schedule: {}, theatres: {}, offers: null, fees: null, layouts: {}, prices: {}, bookings: [],
  users: [], sessions: {}, newTheatres: [], media: { movies: {}, theatres: {} }, banners: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* first run */ }
db.media ||= { movies: {}, theatres: {} }; db.media.movies ||= {}; db.media.theatres ||= {};
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  }, 150);
}
const uid = (n = 9) => crypto.randomBytes(n).toString('base64url');

/* ---------------- passwords, sessions ---------------- */
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') });
function checkPw(user, pw) {
  const h = Buffer.from(crypto.scryptSync(String(pw), user.salt, 64).toString('hex'));
  const k = Buffer.from(user.hash);
  return h.length === k.length && crypto.timingSafeEqual(h, k);
}
const pwProblem = (pw) => (typeof pw !== 'string' || pw.length < 8 ? 'Use at least 8 characters.' : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Use both letters and numbers.' : null);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, status: u.status, theatreIds: u.theatreIds || [], request: u.request || null, note: u.note || '', createdAt: u.createdAt });

if (!db.users.some((u) => u.role === 'admin')) {
  const email = normEmail(process.env.ADMIN_EMAIL || 'admin@lumen.local');
  const pw = process.env.ADMIN_PASSWORD || ('Lumen' + crypto.randomInt(100000, 999999) + 'x');
  db.users.push({ id: uid(), email, name: 'Lumen admin', role: 'admin', status: 'active', ...hashPw(pw), createdAt: Date.now() });
  save();
  console.log(`\n  First admin account created\n    email:    ${email}\n    password: ${pw}\n  Sign in at /#login and change this password (Account → Change password).\n`);
}

function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])); }
function currentUser(req) {
  const t = cookies(req).lumen_sid; if (!t) return null;
  const s = db.sessions[t]; if (!s || s.exp < Date.now()) { if (s) { delete db.sessions[t]; save(); } return null; }
  const u = db.users.find((x) => x.id === s.userId);
  return u && u.status === 'active' ? u : null;
}
function startSession(req, res, u) {
  const t = uid(32);
  db.sessions[t] = { userId: u.id, exp: Date.now() + 7 * DAY };
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < Date.now()) delete db.sessions[k];
  save();
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('set-cookie', `lumen_sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 86400}${secure}`);
}

/* ---------------- rate limits & OTP ---------------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); const a = (hits.get(key) || []).filter((t) => t > now - windowMs);
  a.push(now); hits.set(key, a); return a.length > max;
}
const otps = new Map(); // email|purpose -> { hash, exp, tries }
async function issueOtp(email, purpose, name) {
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  otps.set(email + '|' + purpose, { hash: crypto.createHash('sha256').update(code).digest('hex'), exp: Date.now() + 10 * 60000, tries: 0 });
  const what = purpose === 'reset' ? 'reset your Lumen password' : 'verify your email for Lumen Partners';
  return sendMail(email, `Your Lumen code: ${code}`, `Hi${name ? ' ' + name : ''},\r\n\r\nUse this code to ${what}: ${code}\r\n\r\nIt expires in 10 minutes. If you did not ask for it, you can ignore this email.\r\n\r\nLumen Cinemas`);
}
function useOtp(email, purpose, code) {
  const k = email + '|' + purpose, o = otps.get(k);
  if (!o || o.exp < Date.now()) return 'That code has expired. Ask for a new one.';
  if (++o.tries > 5) { otps.delete(k); return 'Too many wrong tries. Ask for a new code.'; }
  const h = crypto.createHash('sha256').update(String(code || '').trim()).digest('hex');
  if (h !== o.hash) return 'That code is not right. Check the latest email.';
  otps.delete(k); return null;
}

/* ---------------- email (SMTP over TLS, no packages) ---------------- */
function sendMail(to, subject, text) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) {
    console.log(`\n  [email not set up] To: ${to}\n  ${subject}\n  ${text.replace(/\r\n/g, '\n  ')}\n`);
    return Promise.resolve({ sent: false });
  }
  const port = +process.env.SMTP_PORT || 465, from = process.env.MAIL_FROM || SMTP_USER;
  const secure = port === 465 || process.env.SMTP_SECURE === '1'; // implicit TLS; otherwise STARTTLS
  const tlsOpt = { servername: SMTP_HOST, rejectUnauthorized: process.env.SMTP_INSECURE !== '1' };
  return new Promise((resolve, reject) => {
    let sock = secure ? tls.connect({ host: SMTP_HOST, port, ...tlsOpt }) : net.connect({ host: SMTP_HOST, port });
    let buf = '', waiting = null;
    const timer = setTimeout(() => fail(new Error('Email server timed out')), 20000);
    const fail = (e) => { clearTimeout(timer); try { sock.destroy(); } catch (x) {} reject(e); };
    const onData = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split('\r\n'); if (lines.length < 2) return;
      const last = lines[lines.length - 2];
      if (/^\d{3} /.test(last)) { const resp = buf; buf = ''; const w = waiting; waiting = null; if (w) w(resp); }
    };
    const attach = (s) => { s.on('data', onData); s.on('error', fail); };
    attach(sock);
    const read = () => new Promise((r) => { waiting = r; });
    const cmd = async (line, ok) => {
      if (line != null) sock.write(line + '\r\n');
      const resp = await read(); const code = +resp.slice(0, 3);
      if (!ok.includes(code)) throw new Error(`Email server said: ${resp.trim().split('\r\n').pop()}`);
      return resp;
    };
    (async () => {
      await cmd(null, [220]);
      await cmd('EHLO lumen', [250]);
      if (!secure) {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, ...tlsOpt }); attach(sock);
        await new Promise((r, j) => { sock.once('secureConnect', r); sock.once('error', j); });
        await cmd('EHLO lumen', [250]);
      }
      if (SMTP_USER) {
        await cmd('AUTH LOGIN', [334]);
        await cmd(Buffer.from(SMTP_USER).toString('base64'), [334]);
        await cmd(Buffer.from(SMTP_PASS || '').toString('base64'), [235]);
      }
      await cmd(`MAIL FROM:<${from}>`, [250]);
      await cmd(`RCPT TO:<${to}>`, [250, 251]);
      await cmd('DATA', [354]);
      const msg = [`From: Lumen Cinemas <${from}>`, `To: <${to}>`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${uid()}@lumen>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', text]
        .join('\r\n').replace(/\r\n\./g, '\r\n..');
      await cmd(msg + '\r\n.', [250]);
      sock.write('QUIT\r\n'); clearTimeout(timer); sock.end();
      resolve({ sent: true });
    })().catch(fail);
  });
}

/* ---------------- seats ---------------- */
const holds = new Map(); // show -> seat -> { client, until }
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

/* ---------------- helpers ---------------- */
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 5e6) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); } });
  });
}
const ownsTheatre = (u, tid) => u && (u.role === 'admin' || (u.theatreIds || []).includes(tid));
const theatreOfScreen = (sid) => String(sid).replace(/s\d+$/, '');
const ip = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';

// What a visitor may see: no KYC details, no other people's bookings
function stateFor(u, client) {
  const theatres = {};
  for (const [id, t] of Object.entries(db.theatres)) theatres[id] = ownsTheatre(u, id) ? t : { status: t.status, kycStatus: t.kycStatus };
  const now = Date.now();
  const banners = db.banners.filter((b) => (u && u.role === 'admin') || (u && b.theatreId && ownsTheatre(u, b.theatreId)) || (b.status === 'live' && (!b.from || Date.parse(b.from) <= now + DAY) && (!b.to || Date.parse(b.to) + DAY >= now)));
  let bookings;
  if (u && u.role === 'admin') bookings = db.bookings;
  else bookings = db.bookings.filter((b) => b.client === client || (u && b.theatreId && ownsTheatre(u, b.theatreId)))
    .map((b) => (b.client === client ? b : { ...b, contact: b.contact ? { email: b.contact.email.replace(/^(.).*(@.*)$/, '$1•••$2'), phone: b.contact.phone ? '•••••' + b.contact.phone.slice(-4) : '' } : null }));
  return { movies: db.movies, hiddenMovies: db.hiddenMovies, schedule: db.schedule, theatres, offers: db.offers, fees: db.fees, layouts: db.layouts, prices: db.prices,
    newTheatres: db.newTheatres, media: db.media, banners, bookings, me: publicUser(u) };
}

/* ---------------- API ---------------- */
async function apiRoute(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '');
  const u = currentUser(req);
  const m = req.method;
  // State-changing JSON requests must be JSON (blocks cross-site form posts)
  if (['POST', 'PUT', 'DELETE'].includes(m) && p !== 'upload' && !(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Send JSON' });
  const need = (role) => {
    if (!u) { send(res, 401, { error: 'Please sign in.' }); return false; }
    if (role && u.role !== role && !(role === 'staff' && ['admin', 'partner'].includes(u.role))) { send(res, 403, { error: 'You do not have access to this.' }); return false; }
    return true;
  };

  if (m === 'GET' && p === 'state') return send(res, 200, stateFor(u, url.searchParams.get('client')));

  /* ---- auth ---- */
  if (p === 'auth/me' && m === 'GET') return send(res, 200, { user: publicUser(u) });
  if (p === 'auth/login' && m === 'POST') {
    const { email: e, password } = await body(req); const email = normEmail(e);
    if (limited('login|' + ip(req) + '|' + email, 8, 15 * 60000)) return send(res, 429, { error: 'Too many tries. Wait 15 minutes and try again.' });
    const user = db.users.find((x) => x.email === email);
    if (!user || !checkPw(user, password || '')) return send(res, 401, { error: 'Email or password is wrong.' });
    if (user.status === 'unverified') return send(res, 403, { error: 'Verify your email first. We can send a new code.', code: 'unverified' });
    if (user.status === 'pending') return send(res, 403, { error: 'Your account is waiting for Lumen’s approval. We’ll email you once it’s approved.' });
    if (user.status === 'rejected') return send(res, 403, { error: `Your registration was not approved${user.note ? ': ' + user.note : '.'}` });
    if (user.status === 'disabled') return send(res, 403, { error: 'This account is turned off. Contact Lumen support.' });
    startSession(req, res, user);
    return send(res, 200, { user: publicUser(user) });
  }
  if (p === 'auth/logout' && m === 'POST') {
    const t = cookies(req).lumen_sid; if (t) { delete db.sessions[t]; save(); }
    res.setHeader('set-cookie', 'lumen_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (p === 'auth/register' && m === 'POST') {
    const b = await body(req); const email = normEmail(b.email);
    if (limited('reg|' + ip(req), 5, 60 * 60000)) return send(res, 429, { error: 'Too many registrations from here. Try again later.' });
    const errs = [];
    if (String(b.name || '').trim().length < 2) errs.push('Enter your name.');
    if (!emailOk(email)) errs.push('Enter a valid email.');
    if (!/^[6-9]\d{9}$/.test(String(b.phone || ''))) errs.push('Enter a 10-digit mobile number.');
    const pp = pwProblem(b.password); if (pp) errs.push(pp);
    const t = b.theatre || {};
    if (t.mode === 'existing' && !/^c\d+t\d+$/.test(t.theatreId || '')) errs.push('Pick your theatre.');
    if (t.mode === 'new' && (String(t.name || '').trim().length < 3 || String(t.area || '').trim().length < 2 || !t.cityId || !Array.isArray(t.screens) || !t.screens.length)) errs.push('Fill in your theatre name, area, city and screens.');
    if (!['existing', 'new'].includes(t.mode)) errs.push('Tell us about your theatre.');
    if (errs.length) return send(res, 400, { error: errs.join(' ') });
    const existing = db.users.find((x) => x.email === email);
    if (existing && existing.status !== 'unverified') return send(res, 409, { error: 'An account with this email already exists. Sign in or reset your password.' });
    const rec = { id: existing?.id || uid(), email, name: String(b.name).trim(), phone: String(b.phone), role: 'partner', status: 'unverified', theatreIds: [],
      request: t.mode === 'existing' ? { mode: 'existing', theatreId: t.theatreId } : { mode: 'new', cityId: t.cityId, name: String(t.name).trim(), area: String(t.area).trim(), screens: t.screens.slice(0, 8).map((s) => ({ name: String(s.name || 'Screen').slice(0, 30), hall: ['classic', 'imax', 'lounge', 'single', 'multiplex'].includes(s.hall) ? s.hall : 'multiplex', fmt: String(s.fmt || '2D').slice(0, 20) })) },
      ...hashPw(b.password), createdAt: Date.now() };
    if (existing) Object.assign(existing, rec); else db.users.push(rec);
    save();
    const r = await issueOtp(email, 'verify', rec.name).catch((e) => ({ error: e.message }));
    if (r.error) return send(res, 502, { error: 'We could not send the email. ' + r.error });
    return send(res, 200, { ok: true, emailed: r.sent });
  }
  if (p === 'auth/otp' && m === 'POST') {
    const { email: e, purpose } = await body(req); const email = normEmail(e);
    if (!['reset', 'verify'].includes(purpose) || !emailOk(email)) return send(res, 400, { error: 'Enter a valid email.' });
    if (limited('otp|' + email, 1, 60000)) return send(res, 429, { error: 'Please wait a minute before asking for another code.' });
    if (limited('otph|' + email, 5, 60 * 60000)) return send(res, 429, { error: 'Too many codes asked for. Try again in an hour.' });
    const user = db.users.find((x) => x.email === email);
    const okFor = purpose === 'reset' ? user && user.status !== 'disabled' : user && user.status === 'unverified';
    let r = { sent: false };
    if (okFor) r = await issueOtp(email, purpose, user.name).catch((err) => ({ error: err.message }));
    if (r.error) return send(res, 502, { error: 'We could not send the email. ' + r.error });
    // Same answer whether or not the account exists, so emails cannot be guessed
    return send(res, 200, { ok: true, emailed: r.sent });
  }
  if (p === 'auth/verify' && m === 'POST') {
    const { email: e, otp } = await body(req); const email = normEmail(e);
    const user = db.users.find((x) => x.email === email && x.status === 'unverified');
    if (!user) return send(res, 400, { error: 'Nothing to verify for this email.' });
    const err = useOtp(email, 'verify', otp); if (err) return send(res, 400, { error: err });
    user.status = 'pending'; save();
    return send(res, 200, { ok: true });
  }
  if (p === 'auth/reset' && m === 'POST') {
    const { email: e, otp, password } = await body(req); const email = normEmail(e);
    const pp = pwProblem(password); if (pp) return send(res, 400, { error: pp });
    const user = db.users.find((x) => x.email === email);
    const err = useOtp(email, 'reset', otp); if (err || !user) return send(res, 400, { error: err || 'That code is not right.' });
    Object.assign(user, hashPw(password));
    for (const [k, s] of Object.entries(db.sessions)) if (s.userId === user.id) delete db.sessions[k];
    save();
    return send(res, 200, { ok: true });
  }
  if (p === 'auth/password' && m === 'POST') {
    if (!need()) return;
    const { current, password } = await body(req);
    if (!checkPw(u, current || '')) return send(res, 400, { error: 'Your current password is wrong.' });
    const pp = pwProblem(password); if (pp) return send(res, 400, { error: pp });
    Object.assign(u, hashPw(password)); save();
    return send(res, 200, { ok: true });
  }

  /* ---- admin: partners ---- */
  if (p === 'admin/users' && m === 'GET') { if (!need('admin')) return; return send(res, 200, { users: db.users.map(publicUser) }); }
  let mm;
  if ((mm = /^admin\/users\/([\w-]+)$/.exec(p)) && m === 'POST') {
    if (!need('admin')) return;
    const { action, note, theatreIds } = await body(req);
    const user = db.users.find((x) => x.id === mm[1]); if (!user || user.role === 'admin') return send(res, 404, { error: 'No such partner.' });
    if (action === 'approve') {
      let ids = Array.isArray(theatreIds) ? theatreIds.filter((x) => /^c\d+t\d+$/.test(x)) : [];
      const rq = user.request || {};
      if (!ids.length && rq.mode === 'existing') ids = [rq.theatreId];
      if (!ids.length && rq.mode === 'new') {
        const ci = Math.max(0, +String(rq.cityId).replace(/\D/g, '') || 0);
        const cityIdx = ['chennai', 'coimbatore', 'madurai', 'bengaluru', 'kochi'].indexOf(rq.cityId);
        const inCity = db.newTheatres.filter((t) => t.cityId === rq.cityId).length;
        const id = `c${cityIdx < 0 ? ci : cityIdx}t${4 + inCity}`;
        db.newTheatres.push({ id, cityId: rq.cityId, name: rq.name, area: rq.area, screens: rq.screens, addedAt: Date.now() });
        ids = [id];
      }
      user.status = 'active'; user.theatreIds = ids; user.note = note || '';
      sendMail(user.email, 'Your Lumen partner account is approved', `Hi ${user.name},\r\n\r\nYour Lumen partner account is approved. Sign in to manage your shows, prices and seat layouts.\r\n\r\nLumen Cinemas`).catch(() => {});
    } else if (action === 'reject') { if (!note || note.length < 5) return send(res, 400, { error: 'Add a short reason.' }); user.status = 'rejected'; user.note = note; }
    else if (action === 'disable') { user.status = 'disabled'; for (const [k, s] of Object.entries(db.sessions)) if (s.userId === user.id) delete db.sessions[k]; }
    else if (action === 'enable') user.status = 'active';
    else return send(res, 400, { error: 'Unknown action' });
    save(); return send(res, 200, { user: publicUser(user) });
  }

  /* ---- catalogue & panel data ---- */
  if (m === 'PUT' && SECTIONS.includes(p)) {
    if (!need('staff')) return;
    const value = await body(req);
    if (u.role === 'admin') { db[p] = value; save(); return send(res, 200, { ok: true }); }
    if (PARTNER_SECTIONS.includes(p)) {
      // partners can only change their own screens
      const cur = db[p] || {}, next = { ...cur };
      for (const k of Object.keys(cur)) if (ownsTheatre(u, theatreOfScreen(k)) && !(k in value)) delete next[k];
      for (const [k, v] of Object.entries(value || {})) if (ownsTheatre(u, theatreOfScreen(k))) next[k] = v;
      db[p] = next; save(); return send(res, 200, { ok: true });
    }
    if (p === 'theatres') {
      // partners can only submit their own KYC; approval stays with Lumen
      for (const [k, v] of Object.entries(value || {})) if (ownsTheatre(u, k) && v && v.kyc && JSON.stringify(v.kyc) !== JSON.stringify(db.theatres[k]?.kyc)) {
        db.theatres[k] = { ...(db.theatres[k] || {}), kyc: v.kyc, kycStatus: 'pending', kycNote: '' };
      }
      save(); return send(res, 200, { ok: true });
    }
    return send(res, 403, { error: 'Only Lumen admins can change this.' });
  }
  if ((mm = /^media\/(movie|theatre)\/([\w-]+)$/.exec(p)) && m === 'PUT') {
    if (!need('staff')) return;
    if (mm[1] === 'movie' && u.role !== 'admin') return send(res, 403, { error: 'Only Lumen admins can change movie media.' });
    if (mm[1] === 'theatre' && !ownsTheatre(u, mm[2])) return send(res, 403, { error: 'Not your theatre.' });
    const v = await body(req), clean = {};
    for (const k of ['poster', 'banner', 'trailer', 'cover']) if (k in v) clean[k] = typeof v[k] === 'string' && /^uploads\/[\w.-]+$/.test(v[k]) ? v[k] : null;
    if (mm[1] === 'movie' && 'lastDay' in v) clean.lastDay = /^\d{4}-\d{2}-\d{2}$/.test(v.lastDay || '') ? v.lastDay : null;
    if ('photos' in v) clean.photos = (Array.isArray(v.photos) ? v.photos : []).filter((x) => /^uploads\/[\w.-]+$/.test(x)).slice(0, 8);
    const bag = mm[1] === 'movie' ? db.media.movies : db.media.theatres;
    bag[mm[2]] = { ...(bag[mm[2]] || {}), ...clean }; save();
    return send(res, 200, { ok: true, media: bag[mm[2]] });
  }
  if (p === 'banners' && m === 'POST') {
    if (!need('staff')) return;
    const b = await body(req);
    if (b.theatreId && !ownsTheatre(u, b.theatreId)) return send(res, 403, { error: 'Not your theatre.' });
    if (!b.theatreId && u.role !== 'admin') return send(res, 400, { error: 'Pick your theatre.' });
    if (!/^uploads\/[\w.-]+$/.test(b.image || '')) return send(res, 400, { error: 'Upload a banner image first.' });
    if (String(b.title || '').trim().length < 3) return send(res, 400, { error: 'Add a short title.' });
    const banner = { id: uid(), theatreId: b.theatreId || null, cityId: b.cityId || null, image: b.image, title: String(b.title).trim().slice(0, 60), sub: String(b.sub || '').trim().slice(0, 90),
      movieId: b.movieId || null, placement: b.placement === 'theatre' ? 'theatre' : 'home', from: b.from || null, to: b.to || null,
      status: u.role === 'admin' ? 'live' : 'pending', note: '', by: u.id, createdAt: Date.now() };
    db.banners.unshift(banner); save(); return send(res, 200, { banner });
  }
  if ((mm = /^banners\/([\w-]+)$/.exec(p))) {
    if (!need('staff')) return;
    const b = db.banners.find((x) => x.id === mm[1]); if (!b) return send(res, 404, { error: 'No such banner.' });
    if (m === 'DELETE') { if (u.role !== 'admin' && !(b.theatreId && ownsTheatre(u, b.theatreId))) return send(res, 403, { error: 'Not your banner.' }); db.banners = db.banners.filter((x) => x !== b); save(); return send(res, 200, { ok: true }); }
    if (m === 'PUT') {
      if (u.role !== 'admin') return send(res, 403, { error: 'Only Lumen admins review banners.' });
      const { status, note } = await body(req);
      if (!['live', 'rejected', 'pending'].includes(status)) return send(res, 400, { error: 'Unknown status' });
      if (status === 'rejected' && (!note || note.length < 5)) return send(res, 400, { error: 'Tell the theatre why.' });
      b.status = status; b.note = note || ''; save(); return send(res, 200, { banner: b });
    }
  }
  if (p === 'upload' && m === 'POST') {
    if (!need('staff')) return;
    if (req.headers['x-lumen-upload'] !== '1') return send(res, 400, { error: 'Bad upload' });
    const type = String(req.headers['content-type'] || '');
    const kinds = { 'image/jpeg': ['.jpg', 6e6], 'image/png': ['.png', 6e6], 'image/webp': ['.webp', 6e6], 'video/mp4': ['.mp4', 150e6], 'video/webm': ['.webm', 150e6] };
    const k = kinds[type]; if (!k) return send(res, 415, { error: 'Upload a JPG, PNG or WebP image, or an MP4 or WebM video.' });
    if (+req.headers['content-length'] > k[1]) return send(res, 413, { error: `That file is too big (max ${k[1] / 1e6} MB).` });
    fs.mkdirSync(UPLOADS, { recursive: true });
    const name = uid(12) + k[0], file = path.join(UPLOADS, name);
    const out = fs.createWriteStream(file); let size = 0, head = Buffer.alloc(0), aborted = false;
    await new Promise((resolve) => {
      req.on('data', (c) => { size += c.length; if (head.length < 16) head = Buffer.concat([head, c]).subarray(0, 16); if (size > k[1] && !aborted) { aborted = true; out.destroy(); req.destroy(); } else if (!aborted) out.write(c); });
      req.on('end', () => out.end(resolve)); req.on('close', resolve);
    });
    const magic = { '.jpg': head[0] === 0xff && head[1] === 0xd8, '.png': head.subarray(0, 4).toString('hex') === '89504e47', '.webp': head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP',
      '.mp4': head.subarray(4, 8).toString() === 'ftyp', '.webm': head.subarray(0, 4).toString('hex') === '1a45dfa3' }[k[0]];
    if (aborted || !magic || !size) { fs.rm(file, () => {}); return send(res, 400, { error: aborted ? 'That file is too big.' : 'That file does not look like a real image or video.' }); }
    return send(res, 200, { url: 'uploads/' + name, size });
  }

  /* ---- seats & bookings ---- */
  if (m === 'GET' && p === 'taken') {
    const show = url.searchParams.get('show'), client = url.searchParams.get('client');
    return send(res, 200, { booked: [...soldSeats(show)], held: [...heldByOthers(show, client)] });
  }
  if (m === 'POST' && p === 'hold') {
    const { show, seats = [], client } = await body(req);
    if (!show || !client || !Array.isArray(seats) || seats.length > 12) return send(res, 400, { error: 'Bad request' });
    const taken = seats.filter((s) => soldSeats(show).has(s) || heldByOthers(show, client).has(s));
    if (taken.length) return send(res, 409, { error: 'Some seats were just taken', taken });
    if (!holds.has(show)) holds.set(show, new Map());
    const hm = holds.get(show);
    for (const [seat, h] of hm) if (h.client === client) hm.delete(seat);
    const until = Date.now() + holdMinutes() * 60000;
    for (const s of seats) hm.set(s, { client, until });
    return send(res, 200, { until });
  }
  if (m === 'POST' && p === 'release') {
    const { show, client } = await body(req); const hm = holds.get(show);
    if (hm) for (const [seat, h] of hm) if (h.client === client) hm.delete(seat);
    return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === 'book') {
    const b = await body(req);
    if (!b.id || !b.client || !b.kind) return send(res, 400, { error: 'Bad booking' });
    if (db.bookings.some((x) => x.id === b.id)) return send(res, 409, { error: 'Duplicate booking' });
    if (b.showId) {
      const taken = (b.seats || []).filter((s) => soldSeats(b.showId).has(s) || heldByOthers(b.showId, b.client).has(s));
      if (taken.length) return send(res, 409, { error: 'Some seats were just taken', taken });
      const hm = holds.get(b.showId); if (hm) for (const s of b.seats) hm.delete(s);
    }
    db.bookings.unshift(b); save();
    return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === 'cancel') {
    const { id, refund, client } = await body(req); const b = db.bookings.find((x) => x.id === id);
    if (!b) return send(res, 404, { error: 'No such booking' });
    if (b.client !== client && !(u && (u.role === 'admin' || (b.theatreId && ownsTheatre(u, b.theatreId))))) return send(res, 403, { error: 'Not your booking.' });
    b.cancelled = true; b.refund = Math.max(0, +refund || 0); b.cancelledAt = Date.now(); save();
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Unknown API route' });
}

/* ---------------- static files ---------------- */
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && /^video/.test(type)) {
      let start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : st.size - 1;
      if (!range[1] && range[2]) { start = st.size - +range[2]; end = st.size - 1; }
      if (start >= st.size || end >= st.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'cache-control': cache });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': cache, 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('x-frame-options', 'SAMEORIGIN'); res.setHeader('referrer-policy', 'same-origin');
  try {
    if (url.pathname.startsWith('/api/')) return await apiRoute(req, res, url);
    // Behind a hosting proxy: send http visitors to https
    if (process.env.FORCE_HTTPS === '1' && req.headers['x-forwarded-proto'] === 'http') { res.writeHead(301, { location: 'https://' + req.headers.host + req.url }); return res.end(); }
    if (url.pathname === '/config.json') return send(res, 200, { server: true, demo: process.env.DEMO_MODE !== '0' });
    const rel = decodeURIComponent(url.pathname);
    if (rel.startsWith('/uploads/')) {
      const f = path.normalize(path.join(UPLOADS, rel.slice(9)));
      if (!f.startsWith(UPLOADS + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
      return serveFile(req, res, f, 'public, max-age=31536000, immutable');
    }
    const file = path.normalize(path.join(ROOT, rel === '/' ? '/index.html' : rel));
    if (!file.startsWith(ROOT + path.sep) || file === DATA || file.startsWith(DATA + path.sep) || /server\.js$|settings(\.example)?\.env$/.test(file) || /[\\/]\.git([\\/]|$)/.test(file)) { res.writeHead(403); return res.end('Forbidden'); }
    serveFile(req, res, file, 'no-cache');
  } catch (e) { if (!res.headersSent) send(res, e.status || 400, { error: e.message }); }
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Port ${PORT} is already used by another program (VS Code Live Server or "python -m http.server"?).\n  Stop it first (Live Server: click "Port: ${PORT}" in VS Code's bottom bar; Python: press Ctrl+C in its window),\n  then run start.bat again. Or use another port: set PORT=5600 in settings.env.\n  Windows PowerShell, to stop whatever holds the port:\n    Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
  else console.log(e);
  process.exit(1);
}).listen(PORT, HOST, () => console.log(`Lumen running on http://${HOST}:${PORT}  (data in ${DB_FILE})${process.env.SMTP_HOST ? '' : '\n  Email is not set up: OTP codes will be printed here.'}`));
