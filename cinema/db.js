// Data layer shared by the customer app, the theatre partner panel and the admin console.
// With server.js running, everything is stored on the server and shared by every device
// (seat holds, bookings, schedules, KYC, logins, uploads…). Without it (e.g. the static preview
// link), it falls back to this browser's storage so the customer demo still works.
import { applyLive } from './data.js';
import { setCustomLayouts, setPriceOverrides } from './layout.js';

const LS = 'lumen.db';
const blank = () => ({ movies: [], hiddenMovies: [], schedule: {}, theatres: {}, offers: null, fees: null, layouts: {}, prices: {}, bookings: [],
  newTheatres: [], media: { movies: {}, theatres: {} }, banners: [], me: null, billing: null, lapsed: [], payments: [], cities: [], contact: {}, kycPublic: {} });
const clientId = (() => {
  try { let id = localStorage.getItem('lumen.client'); if (!id) { id = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem('lumen.client', id); } return id; }
  catch (e) { return 'u' + Math.random().toString(36).slice(2, 10); }
})();
const localHolds = new Map(); // showId -> { seats, until }

function apply(state) {
  applyLive(state);
  setCustomLayouts(state.layouts || {});
  setPriceOverrides(state.prices || {});
}
async function api(path, opts = {}) {
  const r = await fetch('api/' + path, { headers: { 'content-type': 'application/json' }, cache: 'no-store', credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; e.data = j; throw e; }
  return j;
}

export const db = {
  mode: 'local',
  demo: true, // shows the "demo, no real payment" notice
  client: clientId,
  state: blank(),
  get me() { return this.state.me || null; },
  async init() {
    try {
      // config.json says { server: false } on static hosting; server.js answers { server: true }
      const cfg = await fetch('config.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      this.demo = cfg.demo !== false;
      if (cfg.server) { this.state = { ...blank(), ...(await api('state?client=' + this.client)) }; this.mode = 'server'; }
    } catch (e) { /* server unreachable: stay local */ }
    if (this.mode === 'local') {
      try { this.state = { ...blank(), ...JSON.parse(localStorage.getItem(LS) || '{}'), me: null }; } catch (e) { this.state = blank(); }
      try { const old = JSON.parse(localStorage.getItem('lumen.layouts') || 'null'); if (old && !Object.keys(this.state.layouts).length) this.state.layouts = old; } catch (e) {}
      try { const mine = JSON.parse(localStorage.getItem('lumen.bookings') || '[]'); if (!this.state.bookings.length && mine.length) this.state.bookings = mine; } catch (e) {}
    }
    apply(this.state);
    return this;
  },
  saveLocal() { try { const { me, ...rest } = this.state; localStorage.setItem(LS, JSON.stringify(rest)); } catch (e) {} },
  async put(section, value) {
    if (this.mode === 'server') await api(section, { method: 'PUT', body: value });
    this.state[section] = value; apply(this.state);
    if (this.mode === 'local') this.saveLocal();
  },
  async refresh() { if (this.mode === 'server') { this.state = { ...blank(), ...(await api('state?client=' + this.client)) }; apply(this.state); } },

  /* ---- accounts (server only) ---- */
  async login(email, password) { const r = await api('auth/login', { method: 'POST', body: { email, password } }); await this.refresh(); return r.user; },
  async logout() { await api('auth/logout', { method: 'POST', body: {} }).catch(() => {}); await this.refresh(); },
  register(data) { return api('auth/register', { method: 'POST', body: data }); },
  sendOtp(email, purpose) { return api('auth/otp', { method: 'POST', body: { email, purpose } }); },
  verify(email, otp) { return api('auth/verify', { method: 'POST', body: { email, otp } }); },
  reset(email, otp, password) { return api('auth/reset', { method: 'POST', body: { email, otp, password } }); },
  changePassword(current, password) { return api('auth/password', { method: 'POST', body: { current, password } }); },
  users() { return api('admin/users').then((r) => r.users); },
  userAction(id, action, extra = {}) { return api('admin/users/' + id, { method: 'POST', body: { action, ...extra } }); },

  /* ---- customers (mobile OTP) ---- */
  phoneOtp(phone) { return api('auth/phone-otp', { method: 'POST', body: { phone } }); },
  async phoneLogin(phone, otp, name, email) { const r = await api('auth/phone-login', { method: 'POST', body: { phone, otp, name, email, client: this.client } }); await this.refresh(); return r.user; },
  async profile(data) { const r = await api('auth/profile', { method: 'POST', body: data }); await this.refresh(); return r.user; },
  contact(msg) { return api('contact', { method: 'POST', body: msg }); },
  messages() { return api('admin/messages').then((r) => r.messages); },
  messageAction(id, action, text) { return api('admin/messages/' + id, { method: 'POST', body: { action, text } }); },
  team() { return api('team').then((r) => r.staff); },
  teamAdd(data) { return api('team', { method: 'POST', body: data }); },
  teamAction(id, action, role) { return api('team/' + id, { method: 'POST', body: { action, role } }); },
  settings() { return api('admin/settings'); },
  saveSettings(v) { return api('admin/settings', { method: 'PUT', body: v }); },
  testSetting(kind, to) { return api('admin/settings/test', { method: 'POST', body: { kind, to } }); },
  mediaRequest(id, action) { return api('admin/media-requests/' + id, { method: 'POST', body: { action } }); },
  startTrial(payToken) { return api('billing/trial', { method: 'POST', body: { payToken } }); },

  /* ---- partner plans (server only) ---- */
  plans() { return api('billing/plans'); },
  payOrder(plan, payToken) { return api('billing/order', { method: 'POST', body: { plan, payToken } }); },
  payVerify(data) { return api('billing/verify', { method: 'POST', body: data }); },

  /* ---- media & banners (server only) ---- */
  // Upload one image or video file; returns 'uploads/<name>'
  async upload(file, onProgress) {
    if (this.mode !== 'server') throw new Error('Uploads need the Lumen server (run start.bat or node server.js).');
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', 'api/upload');
      x.setRequestHeader('content-type', file.type);
      x.setRequestHeader('x-lumen-upload', '1');
      x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) {} x.status === 200 ? resolve(j.url) : reject(new Error(j.error || 'Upload failed')); };
      x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
      x.send(file);
    });
  },
  async setMedia(kind, id, fields) {
    const r = await api(`media/${kind}/${id}`, { method: 'PUT', body: fields });
    const bag = kind === 'movie' ? this.state.media.movies : this.state.media.theatres;
    bag[id] = r.media; apply(this.state); return { ...r.media, pending: r.pending || [] };
  },
  async addBanner(b) { const r = await api('banners', { method: 'POST', body: b }); this.state.banners.unshift(r.banner); apply(this.state); return r.banner; },
  async reviewBanner(id, status, note) { const r = await api('banners/' + id, { method: 'PUT', body: { status, note } }); Object.assign(this.state.banners.find((x) => x.id === id) || {}, r.banner); apply(this.state); return r.banner; },
  async deleteBanner(id) { await api('banners/' + id, { method: 'DELETE', body: {} }); this.state.banners = this.state.banners.filter((x) => x.id !== id); apply(this.state); },

  /* ---- seats & bookings ---- */
  // Seats taken by other people for a show (sold + held right now)
  async taken(showId) {
    if (this.mode !== 'server') return { booked: [], held: [] };
    try { return await api(`taken?show=${encodeURIComponent(showId)}&client=${this.client}`); } catch (e) { return { booked: [], held: [] }; }
  },
  // Hold seats while the person pays. Returns { ok, until } or { ok:false, taken:[ids] }
  async hold(showId, seats, minutes) {
    if (this.mode === 'server') {
      try { return { ok: true, ...(await api('hold', { method: 'POST', body: { show: showId, seats, client: this.client } })) }; }
      catch (e) { if (e.status === 409) return { ok: false, taken: e.data.taken || [] }; throw e; }
    }
    const h = { seats, until: Date.now() + minutes * 60000 }; localHolds.set(showId, h); return { ok: true, until: h.until };
  },
  async release(showId) {
    localHolds.delete(showId);
    if (this.mode === 'server') { try { await api('release', { method: 'POST', body: { show: showId, client: this.client } }); } catch (e) {} }
  },
  // Save a confirmed booking. Server re-checks the seats are still free.
  async book(b) {
    b.client = this.client;
    if (this.mode === 'server') {
      try { await api('book', { method: 'POST', body: b }); }
      catch (e) { if (e.status === 409) return { ok: false, taken: e.data.taken || [] }; throw e; }
    }
    this.state.bookings.unshift(b); if (this.mode === 'local') this.saveLocal();
    return { ok: true };
  },
  async cancel(id, refund) {
    if (this.mode === 'server') await api('cancel', { method: 'POST', body: { id, refund, client: this.client } });
    const b = this.state.bookings.find((x) => x.id === id); if (b) { b.cancelled = true; b.refund = refund; b.cancelledAt = Date.now(); }
    if (this.mode === 'local') this.saveLocal();
  },
  myBookings() { const me = this.state.me; return this.state.bookings.filter((b) => b.client === this.client || !b.client || (me && b.userId === me.id)); },
  allBookings() { return this.state.bookings; },
};
