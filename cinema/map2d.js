// Flat seat map in the familiar ticketing style: straight rows grouped into price sections
// ("₹190 PRIME"), small outlined seats with numbers, the screen at the bottom.
// Seats keep their real left/right position, so aisles and gaps match the theatre.
// Plain buttons, one per seat: fast on any phone. The 3D hall shows the real curve and view.
import { CLASS_META } from './data.js';
import { scoreColor } from './layout.js';
import { icon, t, clsName, inr, esc, state } from './ui.js';

export function mountMap(host, lay, { booked, selected, prices, best = new Set(), counter = new Set(), onTap, onHover }) {
  host.innerHTML = '<div class="map-scroll"><div class="map-inner"></div></div>';
  const scroll = host.firstElementChild, inner = scroll.firstElementChild;
  let mode = 'class', zoom = 1, K = 30;
  const xs = lay.seats.map((s) => s.x);
  const xMin = Math.min(...xs) - 0.5, xMax = Math.max(...xs) + 0.5;
  const ta = state.lang === 'ta';
  // Typical gap between neighbouring seats (metres), for normal seats and recliners
  const pitchOf = (rec) => {
    const d = [];
    for (const r of lay.rows) { const xs2 = lay.seats.filter((s) => s.row === r.letter && (s.kind === 'rec') === rec).map((s) => s.x).sort((a, b) => a - b); for (let i = 1; i < xs2.length; i++) d.push(xs2[i] - xs2[i - 1]); }
    d.sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : null;
  };
  const P = pitchOf(false) || pitchOf(true) || 0.6, PR = pitchOf(true) || P;

  // Back rows on top, front rows at the bottom next to the screen
  const rows = [...lay.rows].reverse().map((r) => ({ r, seats: lay.seats.filter((s) => s.row === r.letter) })).filter((x) => x.seats.length);
  const groups = [];
  for (const x of rows) {
    const cls = x.seats[0].cls, g = groups[groups.length - 1];
    if (g && g.cls === cls) g.rows.push(x); else groups.push({ cls, rows: [x] });
  }

  const els = new Map(), heads = [], letters = [];
  const frag = document.createDocumentFragment();
  for (const g of groups) {
    const h = document.createElement('div'); h.className = 'm-sec' + (counter.has(g.cls) ? ' off' : '');
    h.innerHTML = counter.has(g.cls)
      ? `<span>${esc(clsName(g.cls))}</span><em>${ta ? 'திரையரங்கு கவுண்டரில் மட்டும்' : 'Sold at the theatre counter only'}</em>`
      : `<span>${inr(prices[g.cls] ?? 0)} ${esc(clsName(g.cls))}</span>`;
    heads.push([h, g]); frag.appendChild(h);
    for (const x of g.rows) {
      const el = document.createElement('span'); el.className = 'm-row'; el.textContent = x.r.letter; letters.push([el, x]); frag.appendChild(el);
      for (const s of x.seats) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'm-seat'; b.dataset.id = s.id;
        els.set(s.id, b); frag.appendChild(b);
      }
    }
  }
  const scr = document.createElement('div'); scr.className = 'm-screen';
  scr.innerHTML = `<i></i><span>${ta ? 'திரை இந்தப் பக்கம்' : 'All eyes this way please'}</span>`;
  frag.appendChild(scr);
  inner.appendChild(frag);

  function place() {
    const avail = scroll.clientWidth - 16;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const LBL = 34; // row-letter gutter on the left
    // one seat step = 26–34 px on screen (wider halls scroll sideways on phones)
    const step = Math.max(coarse ? 28 : 24, Math.min(34, (avail - LBL * 2) / ((xMax - xMin) / P))) * zoom;
    const k = step / P; K = step;
    const seatW = Math.min(step - 5, 30 * zoom), rowH = seatW + 10, headH = 46;
    const X = (x) => LBL + (x - xMin) * k;
    const W = LBL * 2 + (xMax - xMin) * k;
    inner.style.width = Math.max(W, avail) + 'px';
    const off = Math.max(0, (avail - W) / 2);
    let y = 6;
    for (const [h, g] of heads) {
      h.style.cssText = `top:${y}px;left:${off}px;width:${W}px`; y += headH + (counter.has(g.cls) ? 18 : 0);
      for (const x of g.rows) {
        const lt = letters.find((l) => l[1] === x)[0];
        lt.style.cssText = `top:${y}px;left:${off}px;width:${LBL - 6}px;height:${seatW}px;line-height:${seatW}px`;
        for (const s of x.seats) {
          const b = els.get(s.id), rec = s.kind === 'rec';
          const w = rec ? Math.max(seatW, PR * k - 6) : seatW;
          b.style.cssText = `left:${off + X(s.x) - w / 2}px;top:${y}px;width:${w}px;height:${seatW}px;font-size:${Math.max(9, Math.min(12, seatW * 0.42))}px`;
        }
        y += rowH;
      }
      y += 8;
    }
    scr.style.cssText = `top:${y + 18}px;left:${off + X((xMin + xMax) / 2) - Math.min(W * 0.7, lay.screen.w * k) / 2}px;width:${Math.min(W * 0.7, lay.screen.w * k)}px`;
    inner.style.height = y + 86 + 'px';
    paintAll();
  }
  function paint(s) {
    const b = els.get(s.id); if (!b) return;
    const isOff = !!s.disabled, isC = counter.has(s.cls), isB = !isOff && !isC && booked.has(s.id), isS = selected.has(s.id);
    b.className = 'm-seat' + (isOff ? ' is-off' : isC ? ' is-counter' : isB ? ' is-booked' : isS ? ' is-picked' : best.has(s.id) ? ' is-best' : '') + (s.acc && !isB && !isS ? ' is-acc' : '');
    b.style.setProperty('--sc', mode === 'view' && !isB && !isC ? scoreColor(s.score) : '');
    b.classList.toggle('by-view', mode === 'view' && !isB && !isS && !isC);
    b.innerHTML = isOff ? '' : s.acc && !isB && !isS ? icon('wheel') : mode === 'view' && !isB && !isC && !isS ? `<b>${s.score}</b>` : `<b>${s.num}</b>`;
    b.disabled = isOff && !host.dataset.edit;
    b.setAttribute('aria-pressed', String(isS));
    b.setAttribute('aria-label', `Row ${s.row} seat ${s.num}, ${isOff ? 'Not a seat' : isC ? 'Sold at the theatre counter' : isB ? t('booked') : `${clsName(s.cls)} ${inr(prices[s.cls] ?? 0)}, ${t('score')} ${s.score}`}`);
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
    setMode(m) { mode = m; host.classList.toggle('mode-view', m === 'view'); paintAll(); },
    zoom(f) {
      const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth;
      zoom = f ? Math.max(0.7, Math.min(2.4, zoom * f)) : 1; place();
      scroll.scrollLeft = cx * scroll.scrollWidth - scroll.clientWidth / 2;
    },
    focus(seat) {
      const b = els.get(seat.id); if (!b) return;
      const x = b.offsetLeft - scroll.clientWidth / 2, y = b.offsetTop - scroll.clientHeight / 2;
      scroll.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    get K() { return K; },
    destroy() { ro.disconnect(); },
  };
}
