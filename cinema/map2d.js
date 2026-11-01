// Flat seat map: plain buttons, one per seat. Fast on any phone.
import { CLASS_META } from './data.js';
import { scoreColor } from './layout.js';
import { icon, t, clsName, inr, esc } from './ui.js';

export function mountMap(host, lay, { booked, selected, prices, best = new Set(), onTap, onHover }) {
  host.innerHTML = `<div class="map-scroll"><div class="map-inner"><div class="m-screen"><span>${t('screen')}</span></div></div></div>`;
  const scroll = host.firstElementChild, inner = scroll.firstElementChild, scr = inner.firstElementChild;
  let mode = 'class', zoom = 1, K = 24;
  const xMin = -lay.W - 0.6, xMax = lay.W + 0.6;
  const zMin = Math.min(...lay.seats.map((s) => s.z)) - 2.6, zMax = Math.max(...lay.seats.map((s) => s.z)) + 1;
  const els = new Map();
  const frag = document.createDocumentFragment();
  for (const r of lay.rows) for (const side of [-1, 1]) {
    const el = document.createElement('span'); el.className = 'm-row'; el.textContent = r.letter;
    const th = (side * (r.half + (r.pair ? 1.0 : 0.7))) / r.R;
    el._x = r.R * Math.sin(th); el._z = lay.CZ + r.R * Math.cos(th);
    frag.appendChild(el);
  }
  let balcLabel = null;
  if (lay.balcony) { balcLabel = document.createElement('div'); balcLabel.className = 'm-label'; balcLabel.textContent = clsName('balcony'); frag.appendChild(balcLabel); }
  for (const s of lay.seats) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'm-seat'; b.dataset.id = s.id;
    els.set(s.id, b); frag.appendChild(b);
  }
  inner.appendChild(frag);

  function place() {
    const avail = scroll.clientWidth - 24;
    const minPx = matchMedia('(pointer: coarse)').matches ? 28 : 22;
    const k = Math.max(minPx, Math.min(54, avail / (xMax - xMin))) * zoom; K = k;
    const X = (x) => (x - xMin) * k, Y = (z) => (z - zMin) * k;
    inner.style.width = (xMax - xMin) * k + 'px';
    inner.style.height = (zMax - zMin) * k + 'px';
    scr.style.width = lay.screen.w * k * 0.9 + 'px'; scr.style.height = 1.2 * k + 'px';
    inner.querySelectorAll('.m-row').forEach((el) => { el.style.left = X(el._x) + 'px'; el.style.top = Y(el._z) + 'px'; el.style.fontSize = Math.max(10, k * 0.36) + 'px'; });
    if (balcLabel) balcLabel.style.top = Y(lay.balcony.frontZ - 0.1) + 'px';
    for (const s of lay.seats) {
      const b = els.get(s.id), rec = s.kind === 'rec';
      b.style.cssText = `left:${X(s.x)}px;top:${Y(s.z)}px;width:${(rec ? 0.9 : 0.56) * k}px;height:${(rec ? 0.78 : 0.5) * k}px;--rot:${-s.theta}rad;--cc:${mode === 'view' ? scoreColor(s.score) : CLASS_META[s.cls].color};--ci:${mode === 'view' ? '#fff' : CLASS_META[s.cls].ink};font-size:${Math.max(8, k * 0.3)}px`;
    }
    if (typeof paintAll === 'function') paintAll();
  }
  function paint(s) {
    const b = els.get(s.id); if (!b) return;
    const isB = booked.has(s.id), isS = selected.has(s.id);
    b.classList.toggle('is-booked', isB); b.classList.toggle('is-off', !!s.disabled); b.classList.toggle('is-picked', isS); b.classList.toggle('is-acc', !!s.acc && !isB && !isS); b.classList.toggle('is-best', best.has(s.id));
    b.style.setProperty('--cc', mode === 'view' ? scoreColor(s.score) : CLASS_META[s.cls].color);
    b.innerHTML = s.disabled ? icon('x') : isB ? icon('person') : isS ? icon('check') : s.acc ? icon('wheel') : mode === 'view' ? (K >= 26 ? `<b>${s.score}</b>` : '') : (K >= 28 ? `<b>${s.num}</b>` : '');
    b.setAttribute('aria-pressed', String(isS));
    b.setAttribute('aria-label', `Row ${s.row} seat ${s.num}, ${s.disabled ? 'Not available' : isB ? t('booked') : `${clsName(s.cls)} ${inr(prices[s.cls])}, ${t('score')} ${s.score}`}`);
  }
  function paintAll() { lay.seats.forEach(paint); }
  inner.addEventListener('click', (e) => { const b = e.target.closest('.m-seat'); if (b) onTap(lay.byId.get(b.dataset.id), e); });
  inner.addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') return; const b = e.target.closest('.m-seat'); if (b && onHover) onHover(lay.byId.get(b.dataset.id), e); });
  inner.addEventListener('pointerout', (e) => { if (e.target.closest('.m-seat') && onHover) onHover(null, e); });
  const ro = new ResizeObserver(() => place()); ro.observe(scroll);
  place();
  requestAnimationFrame(() => { scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2; });
  return {
    paint, paintAll,
    setMode(m) { mode = m; host.classList.toggle('mode-view', m === 'view'); place(); paintAll(); },
    zoom(f) {
      const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth;
      zoom = f ? Math.max(0.7, Math.min(2.6, zoom * f)) : 1; place();
      scroll.scrollLeft = cx * scroll.scrollWidth - scroll.clientWidth / 2;
    },
    focus(seat) {
      const b = els.get(seat.id); if (!b) return;
      const x = b.offsetLeft - scroll.clientWidth / 2, y = b.offsetTop - scroll.clientHeight / 2;
      scroll.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    destroy() { ro.disconnect(); },
  };
}
