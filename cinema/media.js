// Shared pieces for the partner panel and admin console: file uploads with preview,
// a movie dropdown that shows posters, and a preview of how a banner looks to customers.
import { icon, esc, poster, toast, ticketArt } from './ui.js';

const IMG = 'image/jpeg,image/png,image/webp', VID = 'video/mp4,video/webm';

// An upload box. kind: 'image' | 'video'. ratio: CSS aspect-ratio for the preview.
// Calls onDone(url | null) after an upload or when "Remove" is pressed.
export function uploadBox({ label, hint = '', kind = 'image', value = null, ratio = '16 / 9', id }) {
  const prev = value ? (kind === 'video' ? `<video src="${esc(value)}" muted playsinline preload="metadata" controls></video>` : `<img src="${esc(value)}" alt="">`) : `<span class="up-empty">${icon(kind === 'video' ? 'film' : 'image')}<small>${kind === 'video' ? 'MP4 or WebM, up to 150 MB' : 'JPG, PNG or WebP, up to 6 MB'}</small></span>`;
  return `<div class="up" id="${id}" data-kind="${kind}"><span class="up-l">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <div class="up-prev" style="aspect-ratio:${ratio}">${prev}<span class="up-bar" hidden><i></i></span></div>
    <div class="up-act"><label class="btn ghost sm">${icon('upload')}${value ? 'Replace' : 'Upload'}<input type="file" accept="${kind === 'video' ? VID : IMG}" hidden></label>${value ? `<button type="button" class="btn ghost sm danger" data-up-rm>${icon('trash')}Remove</button>` : ''}</div></div>`;
}
export function bindUpload(root, id, db, onDone) {
  const box = root.querySelector('#' + id); if (!box) return;
  const bar = box.querySelector('.up-bar'), fill = bar.querySelector('i');
  box.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const isVid = box.dataset.kind === 'video';
    const max = isVid ? 150e6 : 6e6;
    if (!(isVid ? VID : IMG).split(',').includes(f.type)) { toast(isVid ? 'Choose an MP4 or WebM video.' : 'Choose a JPG, PNG or WebP image.'); return; }
    if (f.size > max) { toast(`That file is too big (max ${max / 1e6} MB).`); return; }
    bar.hidden = false; fill.style.width = '0%';
    try { const url = await db.upload(f, (p) => { fill.style.width = Math.round(p * 100) + '%'; }); await onDone(url); }
    catch (err) { toast(err.message); }
    finally { bar.hidden = true; }
  });
  box.querySelector('[data-up-rm]')?.addEventListener('click', async () => { try { await onDone(null); } catch (err) { toast(err.message); } });
}

// A dropdown of movies with their posters (a native <select> cannot show pictures)
export function moviePicker(id, movies, value, note = (m) => `${m.lang} · ${m.mins} min`) {
  const cur = movies.find((m) => m.id === value) || movies[0];
  const opt = (m) => `<span class="mp-post">${m.id ? poster(m) : ticketArt()}</span><span class="mp-t"><b>${esc(m.title)}</b><small>${esc(note(m))}</small></span>`;
  return `<div class="mp" id="${id}" data-value="${cur ? cur.id : ''}">
    <button type="button" class="mp-btn" aria-haspopup="listbox" aria-expanded="false">${cur ? opt(cur) : '<span class="mp-t">No movies</span>'}${icon('chev')}</button>
    <div class="mp-list" role="listbox" hidden>${movies.map((m) => `<button type="button" role="option" data-id="${m.id}" aria-selected="${cur && m.id === cur.id}">${opt(m)}</button>`).join('')}</div></div>`;
}
export function bindMoviePicker(root, id, onChange = () => {}) {
  const el = root.querySelector('#' + id); if (!el) return;
  const btn = el.querySelector('.mp-btn'), list = el.querySelector('.mp-list');
  const close = () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { list.hidden = !list.hidden; btn.setAttribute('aria-expanded', String(!list.hidden)); if (!list.hidden) list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); });
  list.addEventListener('click', (e) => {
    const o = e.target.closest('[data-id]'); if (!o) return;
    el.dataset.value = o.dataset.id;
    list.querySelectorAll('[role=option]').forEach((x) => x.setAttribute('aria-selected', String(x === o)));
    btn.innerHTML = o.innerHTML + icon('chev'); close(); onChange(o.dataset.id);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
  document.addEventListener('click', (e) => { if (!el.contains(e.target)) close(); });
}

// What customers will see: the banner on the home page or on the theatre page
export function bannerPreview(b, placement = b.placement || 'home') {
  return `<div class="bp"><small class="bp-l">${placement === 'theatre' ? 'Preview · on your theatre page' : 'Preview · on the home page'}</small>
    <div class="bp-phone"><div class="bp-hdr"><span class="logo-dot"></span>Lumen</div>
    <div class="banner bp-banner">${b.image ? `<img src="${esc(b.image)}" alt="">` : ticketArt()}<div class="banner-txt"><b>${esc(b.title || 'Your banner title')}</b>${b.sub ? `<small>${esc(b.sub)}</small>` : ''}</div></div>
    <div class="bp-rail"><i></i><i></i><i></i></div></div></div>`;
}
export const STATUS = { pending: ['Waiting for Lumen review', 'warn'], live: ['Live: customers see this', 'ok'], rejected: ['Not approved', 'bad'], expired: ['Ended', 'warn'], scheduled: ['Approved · starts later', 'warn'] };
export function bannerState(b) {
  const now = Date.now();
  if (b.status !== 'live') return b.status;
  if (b.to && Date.parse(b.to) + 864e5 < now) return 'expired';
  if (b.from && Date.parse(b.from) > now) return 'scheduled';
  return 'live';
}
