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
const SECTIONS = ['movies', 'hiddenMovies', 'schedule', 'theatres', 'offers', 'fees', 'layouts', 'prices', 'billing'];
const PARTNER_SECTIONS = ['schedule', 'layouts', 'prices']; // keyed by screen id
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8', '.bat': 'text/plain; charset=utf-8', '.sh': 'text/plain; charset=utf-8' };
const DAY = 864e5;

/* ---------------- storage ---------------- */
let db = { movies: [], hiddenMovies: [], schedule: {}, theatres: {}, offers: null, fees: null, layouts: {}, prices: {}, bookings: [],
  users: [], sessions: {}, newTheatres: [], media: { movies: {}, theatres: {} }, banners: [], payments: [], billing: null, settings: {}, messages: [], cities: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* first run */ }
db.payments ||= []; db.settings ||= {}; db.messages ||= []; db.cities ||= [];
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
const ownerOf = (u) => (u && u.ownerId ? db.users.find((x) => x.id === u.ownerId) : u);
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, status: u.status, theatreIds: u.theatreIds || [], request: u.request || null, note: u.note || '', createdAt: u.createdAt,
  sub: ownerOf(u)?.sub || null, staffRole: u.staffRole || null, ownerId: u.ownerId || null, trialUsed: !!u.trialUsed, trialRequested: !!u.trialRequested });

/* ---------------- partner plans (subscription) ---------------- */
// Prices are set by the admin (Console → Fees). Yearly = list price minus the yearly discount.
const plans = () => {
  const b = { monthly: 399, yearlyList: 5000, yearlyOffPct: 20, graceDays: 7, trialDays: 14, gstPct: 0, ...(db.billing || {}) };
  const yearly = Math.round(b.yearlyList * (1 - b.yearlyOffPct / 100));
  // GST is added on top only when Lumen turns it on (after GST registration)
  const withGst = (base) => ({ base, gst: Math.round(base * b.gstPct) / 100, amount: Math.round(base * (100 + b.gstPct)) / 100 });
  return { monthly: { id: 'monthly', ...withGst(b.monthly), days: 30, label: 'Monthly' },
    yearly: { id: 'yearly', ...withGst(yearly), list: b.yearlyList, offPct: b.yearlyOffPct, save: b.yearlyList - yearly, days: 365, label: 'Yearly' },
    graceDays: b.graceDays, trialDays: b.trialDays, gstPct: b.gstPct };
};
// Keys and passwords entered in Admin → Settings win over settings.env / environment variables
const cfg = (group, key, env) => (db.settings[group] && db.settings[group][key]) || (env ? process.env[env] : '') || '';
const RZP = () => { const id = cfg('razorpay', 'keyId', 'RAZORPAY_KEY_ID'), secret = cfg('razorpay', 'keySecret', 'RAZORPAY_KEY_SECRET'); return id && secret ? { id, secret } : null; };
const BASE_CITIES = ['chennai', 'coimbatore', 'madurai', 'bengaluru', 'kochi'];
const cityIndex = (id) => { const i = BASE_CITIES.indexOf(id); if (i >= 0) return i; const j = db.cities.findIndex((c) => c.id === id); return j >= 0 ? BASE_CITIES.length + j : -1; };
// Show start time from a show id (…d20261102h1845), in India time
function showStartMs(showId) {
  const m = /d(\d{4})(\d{2})(\d{2})h(\d{2})(\d{2})$/.exec(showId || ''); if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 5.5 * 3600000;
}
// Small HTTPS JSON client for WhatsApp / SMS providers
function httpsJson(url, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); const data = body ? JSON.stringify(body) : '';
    const r = require('https').request({ host: u.host, path: u.pathname + u.search, method, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers }, timeout: 15000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(b); } catch (e) {} res.statusCode < 300 ? resolve(j) : reject(new Error(j.error?.message || j.message || `HTTP ${res.statusCode}`)); });
    });
    r.on('timeout', () => r.destroy(new Error('Timed out'))); r.on('error', reject); r.end(data);
  });
}
// WhatsApp Cloud API (Meta). Business-started messages must use a template approved in WhatsApp Manager.
async function sendWhatsApp(phone10, template, params) {
  const token = cfg('whatsapp', 'token'), phoneId = cfg('whatsapp', 'phoneId'), lang = cfg('whatsapp', 'lang') || 'en';
  if (!token || !phoneId || !template) { console.log(`\n  [WhatsApp not set up] To: +91${phone10} · ${template || 'no template'} · ${params.join(' | ')}\n`); return { sent: false }; }
  await httpsJson(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, { headers: { authorization: 'Bearer ' + token },
    body: { messaging_product: 'whatsapp', to: '91' + phone10, type: 'template', template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t).slice(0, 200) })) }] } } });
  return { sent: true };
}
// OTP by SMS (MSG91), else by WhatsApp (authentication template), else printed in this window
async function sendPhoneOtp(phone10, code) {
  const key = cfg('sms', 'authKey'), tpl = cfg('sms', 'templateId');
  if (key && tpl) { await httpsJson(`https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(tpl)}&mobile=91${phone10}&otp=${code}`, { headers: { authkey: key }, body: {} }); return { sent: true, via: 'sms' }; }
  const wt = cfg('whatsapp', 'otpTemplate');
  if (wt && cfg('whatsapp', 'token')) {
    const token = cfg('whatsapp', 'token'), phoneId = cfg('whatsapp', 'phoneId'), lang = cfg('whatsapp', 'lang') || 'en';
    await httpsJson(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, { headers: { authorization: 'Bearer ' + token },
      body: { messaging_product: 'whatsapp', to: '91' + phone10, type: 'template', template: { name: wt, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }] } } });
    return { sent: true, via: 'whatsapp' };
  }
  console.log(`\n  [SMS not set up] Login code for +91${phone10}: ${code}\n`);
  return { sent: false, via: 'console' };
}
const SECRET_KEYS = { razorpay: ['keySecret'], smtp: ['pass'], whatsapp: ['token'], sms: ['authKey'] };
const SETTING_FIELDS = { razorpay: ['keyId', 'keySecret'], smtp: ['host', 'port', 'user', 'pass', 'from'], whatsapp: ['token', 'phoneId', 'lang', 'ticketTemplate', 'otpTemplate'], sms: ['authKey', 'templateId'], contact: ['email', 'phone', 'address', 'company'] };
function maskedSettings() {
  const out = {};
  for (const [g, keys] of Object.entries(SETTING_FIELDS)) {
    out[g] = {};
    for (const k of keys) { const v = (db.settings[g] || {})[k] || ''; out[g][k] = SECRET_KEYS[g]?.includes(k) ? (v ? '••••' + String(v).slice(-4) : '') : v; }
  }
  out.env = { razorpay: !!(process.env.RAZORPAY_KEY_ID), smtp: !!process.env.SMTP_HOST };
  return out;
}
function rzpOrder(amountPaise, receipt, notes) {
  const k = RZP();
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes });
    const r = require('https').request({ host: 'api.razorpay.com', path: '/v1/orders', method: 'POST', auth: `${k.id}:${k.secret}`, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, timeout: 15000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { const j = JSON.parse(b); res.statusCode < 300 ? resolve(j) : reject(new Error(j.error?.description || 'Payment gateway error')); } catch (e) { reject(new Error('Payment gateway error')); } });
    });
    r.on('timeout', () => r.destroy(new Error('Payment gateway timed out'))); r.on('error', reject); r.end(data);
  });
}
// Theatres whose owner's plan ran out more than graceDays ago are hidden from customers
function lapsedTheatres() {
  const g = plans().graceDays * DAY, now = Date.now(), out = new Set(), ok = new Set();
  for (const u of db.users) if (u.role === 'partner' && u.status === 'active' && !u.ownerId) for (const t of u.theatreIds || []) {
    if (u.sub && u.sub.until + g < now) out.add(t); else ok.add(t);
  }
  return [...out].filter((t) => !ok.has(t));
}
function activatePlan(user, pay) {
  const pl = plans()[pay.plan];
  const from = Math.max(Date.now(), user.sub?.until || 0);
  user.sub = { plan: pay.plan, amount: pay.amount, since: user.sub?.since || Date.now(), until: from + pl.days * DAY, lastPaymentId: pay.id };
  pay.status = 'paid'; pay.paidAt = Date.now(); pay.periodFrom = from; pay.periodTo = user.sub.until;
}

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
  if (u && u.ownerId) { const o = db.users.find((x) => x.id === u.ownerId); if (!o || o.status !== 'active') return null; u.theatreIds = o.theatreIds || []; }
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
  const SMTP_HOST = cfg('smtp', 'host', 'SMTP_HOST'), SMTP_USER = cfg('smtp', 'user', 'SMTP_USER'), SMTP_PASS = cfg('smtp', 'pass', 'SMTP_PASS');
  if (!SMTP_HOST) {
    console.log(`\n  [email not set up] To: ${to}\n  ${subject}\n  ${text.replace(/\r\n/g, '\n  ')}\n`);
    return Promise.resolve({ sent: false });
  }
  const port = +cfg('smtp', 'port', 'SMTP_PORT') || 465, from = cfg('smtp', 'from', 'MAIL_FROM') || SMTP_USER;
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
const ownsTheatre = (u, tid) => u && (u.role === 'admin' || (u.role === 'partner' && (u.theatreIds || []).includes(tid)));
const theatreOfScreen = (sid) => String(sid).replace(/s\d+$/, '');
const ip = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';

// What a visitor may see: no KYC details, no other people's bookings
function stateFor(u, client) {
  const theatres = {};
  for (const [id, t] of Object.entries(db.theatres)) theatres[id] = ownsTheatre(u, id) ? t : { status: t.status, kycStatus: t.kycStatus };
  const now = Date.now();
  const banners = db.banners.filter((b) => (u && u.role === 'admin') || (u && b.theatreId && ownsTheatre(u, b.theatreId)) || (b.status === 'live' && (!b.from || Date.parse(b.from) <= now + DAY) && (!b.to || Date.parse(b.to) + DAY >= now)));
  let bookings;
  const mine = (b) => b.client === client || (u && b.userId === u.id);
  if (u && u.role === 'admin') bookings = db.bookings;
  else bookings = db.bookings.filter((b) => mine(b) || (u && u.role === 'partner' && b.theatreId && ownsTheatre(u, b.theatreId)))
    .map((b) => (mine(b) ? b : { ...b, contact: b.contact ? { email: b.contact.email.replace(/^(.).*(@.*)$/, '$1•••$2'), phone: b.contact.phone ? '•••••' + b.contact.phone.slice(-4) : '' } : null }));
  return { movies: db.movies, hiddenMovies: db.hiddenMovies, schedule: db.schedule, theatres, offers: db.offers, fees: db.fees, layouts: db.layouts, prices: db.prices,
    newTheatres: db.newTheatres, media: db.media, banners, bookings, me: publicUser(u), billing: db.billing, lapsed: lapsedTheatres(),
    payments: u && u.role !== 'customer' ? db.payments.filter((x) => u.role === 'admin' || x.userId === ownerOf(u).id) : [], cities: db.cities,
    contact: { email: cfg('contact', 'email'), phone: cfg('contact', 'phone'), company: cfg('contact', 'company'), address: cfg('contact', 'address') },
    kycPublic: Object.fromEntries(Object.entries(db.theatres).filter(([, t]) => t.kycStatus === 'verified' && t.kyc).map(([id, t]) => [id, { legal: t.kyc.legal, gstin: t.kyc.gstin }])) };
}

/* ---------------- ticket messages (email + WhatsApp) ---------------- */
async function notifyTicket(b) {
  const sm = b.summary || {}, c = b.contact || {};
  const clean = (x, n = 120) => String(x || '').replace(/[\r\n]+/g, ' ').slice(0, n);
  const title = clean(sm.title), when = clean(sm.when), place = clean(sm.place), seats = clean(sm.seats || (b.seats || []).join(', '));
  const lines = [`Booking ID: ${b.id}`, title && `What: ${title}`, when && `When: ${when}`, place && `Where: ${place}`, seats && `Seats: ${seats}`, `Paid: Rs ${Math.round(+b.total || 0)}`].filter(Boolean);
  const jobs = [];
  if (emailOk(normEmail(c.email))) jobs.push(sendMail(normEmail(c.email), `Your Lumen ticket ${b.id}${title ? ': ' + title : ''}`, `Hi,\r\n\r\nYour booking is confirmed.\r\n\r\n${lines.join('\r\n')}\r\n\r\nShow this booking ID or the QR code in the Lumen app at the entrance.\r\nCancel online up to 1 hour before the show for a 75% refund of the ticket price.\r\n\r\nLumen Cinemas`));
  if (/^[6-9]\d{9}$/.test(c.phone || '')) jobs.push(sendWhatsApp(c.phone, cfg('whatsapp', 'ticketTemplate'), [b.id, title || 'Your booking', when || '-', place || '-', seats || '-']));
  await Promise.allSettled(jobs);
}

/* ---------------- API ---------------- */
async function apiRoute(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '');
  const u = currentUser(req);
  const m = req.method;
  let mm;
  // State-changing JSON requests must be JSON (blocks cross-site form posts)
  if (['POST', 'PUT', 'DELETE'].includes(m) && p !== 'upload' && !(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Send JSON' });
  const need = (role) => {
    if (!u) { send(res, 401, { error: 'Please sign in.' }); return false; }
    if (role && u.role !== role && !(role === 'staff' && ['admin', 'partner'].includes(u.role))) { send(res, 403, { error: 'You do not have access to this.' }); return false; }
    // Theatre staff: viewers only look; managers cannot touch bank details, billing or the team
    if (u.ownerId && !p.startsWith('auth/') && ((u.staffRole === 'viewer' && m !== 'GET') || (u.staffRole !== 'owner' && (/^(billing\/(order|verify|trial)|team)/.test(p) || (p === 'theatres' && m === 'PUT'))))) { send(res, 403, { error: 'Only the theatre owner can do this.' }); return false; }
    return true;
  };

  if (m === 'GET' && p === 'state') return send(res, 200, stateFor(u, url.searchParams.get('client')));

  /* ---- auth ---- */
  if (p === 'auth/me' && m === 'GET') return send(res, 200, { user: publicUser(u) });
  if (p === 'auth/login' && m === 'POST') {
    const { email: e, password } = await body(req); const email = normEmail(e);
    if (limited('login|' + ip(req) + '|' + email, 8, 15 * 60000)) return send(res, 429, { error: 'Too many tries. Wait 15 minutes and try again.' });
    const user = db.users.find((x) => x.email === email && x.role !== 'customer');
    if (!user || !checkPw(user, password || '')) return send(res, 401, { error: 'Email or password is wrong.' });
    if (user.status === 'unverified') return send(res, 403, { error: 'Verify your email first. We can send a new code.', code: 'unverified' });
    if (user.status === 'pending' && !user.sub && !user.trialRequested) { user.payToken = uid(18); save(); return send(res, 403, { error: 'Choose your plan and pay to finish registration.', code: 'unpaid', payToken: user.payToken, email: user.email }); }
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
    if (t.mode === 'new' && (String(t.name || '').trim().length < 3 || String(t.area || '').trim().length < 2 || !(t.cityId || String(t.cityName || '').trim().length >= 2) || !Array.isArray(t.screens) || !t.screens.length)) errs.push('Fill in your theatre name, area, city and screens.');
    if (t.mode === 'new' && t.cityId && cityIndex(t.cityId) < 0) errs.push('Pick your city from the list, or type a new one.');
    const geo = t.lat != null && Math.abs(+t.lat) <= 90 && Math.abs(+t.lng) <= 180 && !Number.isNaN(+t.lat) ? { lat: +t.lat, lng: +t.lng } : null;
    if (!['existing', 'new'].includes(t.mode)) errs.push('Tell us about your theatre.');
    if (errs.length) return send(res, 400, { error: errs.join(' ') });
    const existing = db.users.find((x) => x.email === email);
    if (existing && existing.status !== 'unverified') return send(res, 409, { error: 'An account with this email already exists. Sign in or reset your password.' });
    const rec = { id: existing?.id || uid(), email, name: String(b.name).trim(), phone: String(b.phone), role: 'partner', status: 'unverified', theatreIds: [],
      request: t.mode === 'existing' ? { mode: 'existing', theatreId: t.theatreId } : { mode: 'new', cityId: t.cityId || null, cityName: t.cityId ? null : String(t.cityName).trim().slice(0, 40), state: String(t.state || '').trim().slice(0, 40), geo, name: String(t.name).trim(), area: String(t.area).trim(), screens: t.screens.slice(0, 8).map((s) => ({ name: String(s.name || 'Screen').slice(0, 30), hall: ['classic', 'imax', 'lounge', 'single', 'multiplex'].includes(s.hall) ? s.hall : 'multiplex', fmt: String(s.fmt || '2D').slice(0, 20) })) },
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
    user.status = 'pending'; user.payToken = uid(18); save();
    return send(res, 200, { ok: true, payToken: user.payToken });
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

  /* ---- partner plans & payments ---- */
  // Who is paying: a signed-in partner (renewal) or a new partner finishing registration (payToken)
  const payer = async (b) => {
    if (u && u.ownerId) return null; // staff cannot pay or start trials; the owner does
    if (u && u.role === 'partner') return u;
    const t = String(b.payToken || ''); return t.length > 10 ? db.users.find((x) => x.payToken === t && x.role === 'partner' && ['pending', 'active'].includes(x.status)) : null;
  };
  if (p === 'billing/plans' && m === 'GET') { const pl = plans(); return send(res, 200, { monthly: pl.monthly, yearly: pl.yearly, graceDays: pl.graceDays, trialDays: pl.trialDays, gstPct: pl.gstPct, gateway: RZP() ? 'razorpay' : 'demo' }); }
  // New theatres: start with a free trial (begins when Lumen approves the theatre)
  if (p === 'billing/trial' && m === 'POST') {
    const b = await body(req); const user = await payer(b);
    if (!user) return send(res, 401, { error: 'Please sign in again.' });
    if (user.trialUsed || user.sub) return send(res, 400, { error: 'Your free trial has already been used. Choose a plan.' });
    user.trialRequested = true; save();
    return send(res, 200, { ok: true, trialDays: plans().trialDays, status: user.status });
  }
  if (p === 'billing/order' && m === 'POST') {
    const b = await body(req); const user = await payer(b);
    if (!user) return send(res, u?.ownerId ? 403 : 401, { error: u?.ownerId ? 'Only the theatre owner can pay for the plan.' : 'Please sign in again to pay.' });
    const pl = plans()[b.plan]; if (!pl || !pl.days) return send(res, 400, { error: 'Pick monthly or yearly.' });
    if (limited('pay|' + user.id, 10, 60 * 60000)) return send(res, 429, { error: 'Too many payment attempts. Try again in an hour.' });
    const pay = { id: 'PAY' + uid(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X'), userId: user.id, email: user.email, plan: pl.id, amount: pl.amount, base: pl.base, gst: pl.gst, status: 'created', gateway: RZP() ? 'razorpay' : 'demo', createdAt: Date.now() };
    if (RZP()) {
      try { const o = await rzpOrder(Math.round(pl.amount * 100), pay.id, { plan: pl.id, email: user.email }); pay.orderId = o.id; }
      catch (e) { return send(res, 502, { error: e.message }); }
    }
    db.payments.unshift(pay); save();
    return send(res, 200, { payId: pay.id, gateway: pay.gateway, amount: pay.amount, plan: pl, orderId: pay.orderId || null, key: RZP()?.id || null, name: user.name, email: user.email, phone: user.phone || '' });
  }
  if (p === 'billing/verify' && m === 'POST') {
    const b = await body(req); const user = await payer(b);
    const pay = db.payments.find((x) => x.id === b.payId);
    if (!user || !pay || pay.userId !== user.id) return send(res, 404, { error: 'Payment not found.' });
    if (pay.status === 'paid') return send(res, 200, { ok: true, sub: user.sub });
    if (pay.gateway === 'razorpay') {
      const k = RZP(); if (!k) return send(res, 400, { error: 'Payment gateway is not set up.' });
      const want = crypto.createHmac('sha256', k.secret).update(`${pay.orderId}|${b.razorpay_payment_id}`).digest('hex');
      const got = String(b.razorpay_signature || '');
      if (b.razorpay_order_id !== pay.orderId || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) { pay.status = 'failed'; save(); return send(res, 400, { error: 'We could not confirm this payment. If money was taken, it will be refunded automatically.' }); }
      pay.gatewayPaymentId = b.razorpay_payment_id;
    } else if (RZP()) return send(res, 400, { error: 'Demo payments are turned off.' });
    activatePlan(user, pay); save();
    sendMail(user.email, `Lumen receipt ${pay.id}: ₹${pay.amount}`, `Hi ${user.name},\r\n\r\nThanks for your payment of Rs ${pay.amount} for the Lumen ${pay.plan} plan.\r\nReceipt: ${pay.id}${pay.gateway === 'demo' ? ' (demo payment, no money taken)' : ''}\r\nValid until: ${new Date(user.sub.until).toDateString()}\r\n\r\nLumen Cinemas`).catch(() => {});
    return send(res, 200, { ok: true, sub: user.sub, status: user.status });
  }

  /* ---- customers: sign in with mobile OTP ---- */
  if (p === 'auth/phone-otp' && m === 'POST') {
    const { phone } = await body(req); const ph = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(ph)) return send(res, 400, { error: 'Enter a 10-digit mobile number.' });
    if (limited('potp|' + ph, 1, 45000)) return send(res, 429, { error: 'Please wait a little before asking for another code.' });
    if (limited('potph|' + ph, 6, 60 * 60000) || limited('potip|' + ip(req), 20, 60 * 60000)) return send(res, 429, { error: 'Too many codes asked for. Try again in an hour.' });
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    otps.set(ph + '|login', { hash: crypto.createHash('sha256').update(code).digest('hex'), exp: Date.now() + 10 * 60000, tries: 0 });
    try { const r = await sendPhoneOtp(ph, code); return send(res, 200, { ok: true, sent: r.sent, via: r.via }); }
    catch (e) { return send(res, 502, { error: 'Could not send the code. ' + e.message }); }
  }
  if (p === 'auth/phone-login' && m === 'POST') {
    const { phone, otp, name, email: em, client } = await body(req); const ph = String(phone || '').replace(/\D/g, '').slice(-10);
    const err = useOtp(ph, 'login', otp); if (err) return send(res, 400, { error: err });
    let c = db.users.find((x) => x.role === 'customer' && x.phone === ph);
    if (!c) { c = { id: uid(), role: 'customer', status: 'active', phone: ph, name: String(name || '').trim().slice(0, 60), email: emailOk(normEmail(em)) ? normEmail(em) : '', createdAt: Date.now() }; db.users.push(c); }
    if (c.status !== 'active') return send(res, 403, { error: 'This account is turned off. Contact Lumen support.' });
    // Tickets booked on this device before signing in now belong to the account
    if (client) for (const b of db.bookings) if (b.client === client && !b.userId) b.userId = c.id;
    startSession(req, res, c); save();
    return send(res, 200, { user: publicUser(c) });
  }
  if (p === 'auth/profile' && m === 'POST') {
    if (!need()) return;
    const { name, email: em } = await body(req);
    if (name != null) u.name = String(name).trim().slice(0, 60);
    if (em != null && u.role === 'customer') { const e2 = normEmail(em); if (e2 && !emailOk(e2)) return send(res, 400, { error: 'Enter a valid email.' }); u.email = e2; }
    save(); return send(res, 200, { user: publicUser(u) });
  }

  /* ---- contact messages from the website ---- */
  if (p === 'contact' && m === 'POST') {
    const b = await body(req);
    if (limited('contact|' + ip(req), 5, 60 * 60000)) return send(res, 429, { error: 'Too many messages. Please try again later.' });
    const email = normEmail(b.email), text = String(b.message || '').trim();
    if (String(b.name || '').trim().length < 2 || !emailOk(email) || text.length < 5) return send(res, 400, { error: 'Enter your name, a valid email and your message.' });
    const msg = { id: uid(6), name: String(b.name).trim().slice(0, 60), email, phone: String(b.phone || '').replace(/\D/g, '').slice(-10), topic: String(b.topic || 'General').slice(0, 40),
      bookingId: String(b.bookingId || '').slice(0, 20), message: text.slice(0, 3000), status: 'open', replies: [], at: Date.now(), userId: u?.id || null };
    db.messages.unshift(msg); save();
    const to = cfg('contact', 'email') || db.users.find((x) => x.role === 'admin')?.email;
    if (to) sendMail(to, `[Lumen contact] ${msg.topic}: ${msg.name}`, `${msg.name} <${msg.email}> ${msg.phone ? '+91 ' + msg.phone : ''}\r\n${msg.bookingId ? 'Booking: ' + msg.bookingId + '\r\n' : ''}\r\n${msg.message}\r\n\r\nReply from Admin console → Messages.`).catch(() => {});
    sendMail(msg.email, 'We got your message · Lumen Cinemas', `Hi ${msg.name},\r\n\r\nThanks for writing to Lumen. We usually reply within one working day.\r\n\r\nYour message:\r\n${msg.message}\r\n\r\nLumen Cinemas`).catch(() => {});
    return send(res, 200, { ok: true, id: msg.id });
  }
  if (p === 'admin/messages' && m === 'GET') { if (!need('admin')) return; return send(res, 200, { messages: db.messages }); }
  if ((mm = /^admin\/messages\/([\w-]+)$/.exec(p)) && m === 'POST') {
    if (!need('admin')) return;
    const msg = db.messages.find((x) => x.id === mm[1]); if (!msg) return send(res, 404, { error: 'No such message.' });
    const { action, text } = await body(req);
    if (action === 'reply') {
      const t = String(text || '').trim(); if (t.length < 2) return send(res, 400, { error: 'Write your reply.' });
      try { await sendMail(msg.email, `Re: ${msg.topic} · Lumen Cinemas`, `Hi ${msg.name},\r\n\r\n${t}\r\n\r\n— ${u.name || 'Lumen'}, Lumen Cinemas\r\n\r\n> ${msg.message.replace(/\n/g, '\r\n> ')}`); }
      catch (e) { return send(res, 502, { error: 'Email could not be sent: ' + e.message }); }
      msg.replies.push({ text: t, by: u.email, at: Date.now() }); msg.status = 'replied';
    } else if (action === 'close') msg.status = 'closed';
    else if (action === 'open') msg.status = 'open';
    else return send(res, 400, { error: 'Unknown action' });
    save(); return send(res, 200, { message: msg });
  }

  /* ---- theatre staff (added by the owner) ---- */
  if (p === 'team' && m === 'GET') { if (!need('partner')) return; return send(res, 200, { staff: db.users.filter((x) => x.ownerId === u.id).map(publicUser) }); }
  if (p === 'team' && m === 'POST') {
    if (!need('partner')) return;
    const b = await body(req); const email = normEmail(b.email), role = b.role === 'viewer' ? 'viewer' : 'manager';
    if (String(b.name || '').trim().length < 2 || !emailOk(email)) return send(res, 400, { error: 'Enter the staff member’s name and email.' });
    if (db.users.some((x) => x.email === email)) return send(res, 409, { error: 'Someone already uses this email on Lumen.' });
    if (db.users.filter((x) => x.ownerId === u.id).length >= 20) return send(res, 400, { error: 'You can add up to 20 staff.' });
    const pw = uid(12);
    const st = { id: uid(), email, name: String(b.name).trim().slice(0, 60), phone: '', role: 'partner', ownerId: u.id, staffRole: role, status: 'active', theatreIds: u.theatreIds, ...hashPw(pw), createdAt: Date.now() };
    db.users.push(st); save();
    sendMail(email, 'You were added to Lumen Partners', `Hi ${st.name},\r\n\r\n${u.name} added you as ${role === 'manager' ? 'a manager' : 'a viewer'} for their theatre on Lumen.\r\nTo sign in, open the Lumen website, go to Sign in → Forgot password, enter ${email} and set your own password.\r\n\r\nLumen Cinemas`).catch(() => {});
    return send(res, 200, { user: publicUser(st) });
  }
  if ((mm = /^team\/([\w-]+)$/.exec(p)) && m === 'POST') {
    if (!need('partner')) return;
    const st = db.users.find((x) => x.id === mm[1] && x.ownerId === u.id); if (!st) return send(res, 404, { error: 'No such staff member.' });
    const { action, role } = await body(req);
    if (action === 'remove') { db.users = db.users.filter((x) => x !== st); for (const [k, s2] of Object.entries(db.sessions)) if (s2.userId === st.id) delete db.sessions[k]; }
    else if (action === 'role') st.staffRole = role === 'viewer' ? 'viewer' : 'manager';
    else return send(res, 400, { error: 'Unknown action' });
    save(); return send(res, 200, { ok: true });
  }

  /* ---- admin: keys & settings ---- */
  if (p === 'admin/settings' && m === 'GET') { if (!need('admin')) return; return send(res, 200, maskedSettings()); }
  if (p === 'admin/settings' && m === 'PUT') {
    if (!need('admin')) return;
    const v = await body(req);
    for (const [g, keys] of Object.entries(SETTING_FIELDS)) {
      if (!v[g]) continue; db.settings[g] ||= {};
      for (const k of keys) {
        if (!(k in v[g])) continue;
        const val = String(v[g][k] ?? '').trim();
        if (SECRET_KEYS[g]?.includes(k) && (val.startsWith('••••') || val === '')) { if (v[g][k] === null) delete db.settings[g][k]; continue; } // keep the saved secret
        db.settings[g][k] = val.slice(0, 500);
      }
    }
    save(); return send(res, 200, maskedSettings());
  }
  if (p === 'admin/settings/test' && m === 'POST') {
    if (!need('admin')) return;
    const { kind, to } = await body(req);
    try {
      if (kind === 'email') { const r = await sendMail(normEmail(to) || u.email, 'Lumen test email', 'This is a test email from your Lumen admin console. Email is working.'); return send(res, 200, { ok: true, sent: r.sent }); }
      const ph = String(to || '').replace(/\D/g, '').slice(-10); if (!/^[6-9]\d{9}$/.test(ph)) return send(res, 400, { error: 'Enter a 10-digit mobile number to test.' });
      if (kind === 'whatsapp') { const r = await sendWhatsApp(ph, cfg('whatsapp', 'ticketTemplate'), ['TEST123', 'Lumen test ticket', 'Today, 7:00 PM', 'Lumen Talkies', 'A1, A2']); return send(res, 200, { ok: true, sent: r.sent }); }
      if (kind === 'sms') { const r = await sendPhoneOtp(ph, '123456'); return send(res, 200, { ok: true, sent: r.sent, via: r.via }); }
      if (kind === 'razorpay') { if (!RZP()) return send(res, 400, { error: 'Add both Razorpay keys first.' }); const o = await rzpOrder(100, 'test' + Date.now(), { test: 'yes' }); return send(res, 200, { ok: true, order: o.id }); }
    } catch (e) { return send(res, 502, { error: e.message }); }
    return send(res, 400, { error: 'Unknown test' });
  }

  /* ---- admin: partners ---- */
  if (p === 'admin/users' && m === 'GET') { if (!need('admin')) return; return send(res, 200, { users: db.users.map(publicUser) }); }
  if ((mm = /^admin\/users\/([\w-]+)$/.exec(p)) && m === 'POST') {
    if (!need('admin')) return;
    const { action, note, theatreIds, days } = await body(req);
    const user = db.users.find((x) => x.id === mm[1]); if (!user || user.role === 'admin') return send(res, 404, { error: 'No such partner.' });
    if (action === 'approve') {
      let ids = Array.isArray(theatreIds) ? theatreIds.filter((x) => /^c\d+t\d+$/.test(x)) : [];
      const rq = user.request || {};
      if (!ids.length && rq.mode === 'existing') ids = [rq.theatreId];
      if (!ids.length && rq.mode === 'new') {
        let cityId = rq.cityId;
        if (!cityId) {
          // A city Lumen did not have yet: add it (customers see it from now on)
          const slug = String(rq.cityName).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'city';
          cityId = BASE_CITIES.includes(slug) || db.cities.some((c) => c.id === slug) ? slug : slug;
          if (cityIndex(cityId) < 0) db.cities.push({ id: cityId, en: rq.cityName, ta: rq.cityName, state: rq.state || '', lat: rq.geo?.lat ?? null, lng: rq.geo?.lng ?? null, areas: [rq.area], addedAt: Date.now() });
        }
        const inCity = db.newTheatres.filter((t) => t.cityId === cityId).length;
        const base = BASE_CITIES.includes(cityId) ? 4 : 0;
        const id = `c${cityIndex(cityId)}t${base + inCity}`;
        db.newTheatres.push({ id, cityId, name: rq.name, area: rq.area, screens: rq.screens, lat: rq.geo?.lat ?? null, lng: rq.geo?.lng ?? null, addedAt: Date.now() });
        ids = [id];
      }
      user.status = 'active'; user.theatreIds = ids; user.note = note || '';
      if (!user.sub && user.trialRequested && !user.trialUsed) { user.sub = { plan: 'trial', amount: 0, since: Date.now(), until: Date.now() + plans().trialDays * DAY }; user.trialUsed = true; }
      sendMail(user.email, 'Your Lumen partner account is approved', `Hi ${user.name},\r\n\r\nYour Lumen partner account is approved. Sign in to manage your shows, prices and seat layouts.\r\n\r\nLumen Cinemas`).catch(() => {});
    } else if (action === 'reject') { if (!note || note.length < 5) return send(res, 400, { error: 'Add a short reason.' }); user.status = 'rejected'; user.note = note; }
    else if (action === 'disable') { user.status = 'disabled'; for (const [k, s] of Object.entries(db.sessions)) if (s.userId === user.id) delete db.sessions[k]; }
    else if (action === 'enable') user.status = 'active';
    else if (action === 'grant') { const nd = Math.max(1, Math.min(730, +days || 30)); const from = Math.max(Date.now(), user.sub?.until || 0); user.sub = { ...(user.sub || { since: Date.now() }), plan: user.sub?.plan || 'free', amount: user.sub?.amount || 0, until: from + nd * DAY }; }
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
    if (u && u.role === 'customer') b.userId = u.id;
    db.bookings.unshift(b); save();
    notifyTicket(b).catch((e) => console.log('Ticket message failed:', e.message));
    return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === 'cancel') {
    const { id, refund, client } = await body(req); const b = db.bookings.find((x) => x.id === id);
    if (!b) return send(res, 404, { error: 'No such booking' });
    const staffSide = u && (u.role === 'admin' || (b.theatreId && ownsTheatre(u, b.theatreId)));
    if (b.client !== client && !(u && b.userId === u.id) && !staffSide) return send(res, 403, { error: 'Not your booking.' });
    if (b.cancelled) return send(res, 400, { error: 'This booking is already cancelled.' });
    let amount = Math.max(0, +refund || 0);
    if (!staffSide) {
      // Customers: online cancellation up to 1 hour before the show, 75% of the ticket price back
      const start = showStartMs(b.showId);
      if (b.kind === 'movie' && (!start || start - Date.now() < 3600000)) return send(res, 400, { error: 'Online cancellation closes 1 hour before the show.' });
      amount = Math.min(amount, Math.round((+b.ticketAmount || 0) * 0.75));
    }
    b.cancelled = true; b.refund = amount; b.cancelledAt = Date.now(); save();
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
    if (!file.startsWith(ROOT + path.sep) || [DATA, path.join(ROOT, 'data')].some((d) => file === d || file.startsWith(d + path.sep)) || /server\.js$|settings(\.example)?\.env$/.test(file) || /[\\/]\.git([\\/]|$)/.test(file)) { res.writeHead(403); return res.end('Forbidden'); }
    serveFile(req, res, file, 'no-cache');
  } catch (e) { if (!res.headersSent) send(res, e.status || 400, { error: e.message }); }
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Port ${PORT} is already used by another program (VS Code Live Server or "python -m http.server"?).\n  Stop it first (Live Server: click "Port: ${PORT}" in VS Code's bottom bar; Python: press Ctrl+C in its window),\n  then run start.bat again. Or use another port: set PORT=5600 in settings.env.\n  Windows PowerShell, to stop whatever holds the port:\n    Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
  else console.log(e);
  process.exit(1);
}).listen(PORT, HOST, () => console.log(`Lumen running on http://${HOST}:${PORT}  (data in ${DB_FILE})${process.env.SMTP_HOST ? '' : '\n  Email is not set up: OTP codes will be printed here.'}`));
