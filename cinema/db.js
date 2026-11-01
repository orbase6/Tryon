// Data layer shared by the customer app, the theatre partner panel and the admin console.
// With server.js running, everything is stored on the server and shared by every device
// (seat holds, bookings, schedules, KYC…). Without it (e.g. the static preview link),
// it falls back to this browser's storage so the demo still works.
import { applyLive } from './data.js';
import { setCustomLayouts, setPriceOverrides } from './layout.js';

const LS = 'lumen.db';
const blank = () => ({ movies: [], hiddenMovies: [], schedule: {}, theatres: {}, offers: null, fees: null, layouts: {}, prices: {}, bookings: [] });
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
  const r = await fetch('api/' + path, { headers: { 'content-type': 'application/json' }, cache: 'no-store', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.status = r.status; e.data = j; throw e; }
  return j;
}

export const db = {
  mode: 'local',
  client: clientId,
  state: blank(),
  async init() {
    try {
      // config.json says { server: false } on static hosting; server.js answers { server: true }
      const cfg = await fetch('config.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      if (cfg.server) { this.state = { ...blank(), ...(await api('state')) }; this.mode = 'server'; }
    } catch (e) { /* server unreachable: stay local */ }
    if (this.mode === 'local') {
      try { this.state = { ...blank(), ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch (e) { this.state = blank(); }
      // move layouts saved by older versions into the shared store
      try { const old = JSON.parse(localStorage.getItem('lumen.layouts') || 'null'); if (old && !Object.keys(this.state.layouts).length) this.state.layouts = old; } catch (e) {}
      try { const mine = JSON.parse(localStorage.getItem('lumen.bookings') || '[]'); if (!this.state.bookings.length && mine.length) this.state.bookings = mine; } catch (e) {}
    }
    apply(this.state);
    return this;
  },
  saveLocal() { try { localStorage.setItem(LS, JSON.stringify(this.state)); } catch (e) {} },
  async put(section, value) {
    this.state[section] = value; apply(this.state);
    if (this.mode === 'server') await api(section, { method: 'PUT', body: value });
    else this.saveLocal();
  },
  async refresh() { if (this.mode === 'server') { this.state = { ...blank(), ...(await api('state')) }; apply(this.state); } },

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
    const b = this.state.bookings.find((x) => x.id === id); if (b) { b.cancelled = true; b.refund = refund; b.cancelledAt = Date.now(); }
    if (this.mode === 'server') await api('cancel', { method: 'POST', body: { id, refund } }); else this.saveLocal();
  },
  myBookings() { return this.state.bookings.filter((b) => b.client === this.client || !b.client); },
  allBookings() { return this.state.bookings; },
};
