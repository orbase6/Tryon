// Realistic 3D hall, loaded on demand: navy fabric seats with wooden armrest
// trays, dark acoustic walls with speakers, starry ceiling, grey carpeted steps
// with LED step lights. Renders only when something changes (cool on low-end phones).
import { mulberry32, hash } from './data.js';
import { groundY } from './layout.js';

let THREE = null, OrbitControls = null, mergeGeometries = null, RoundedBoxGeometry = null;
async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js'));
  ({ RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js'));
}

export async function mountHall(host, lay, { movie, booked, selected, tier = 'mid', onSeatTap = null }) {
  await loadThree();
  const low = tier === 'low';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: low ? 'low-power' : 'default' }); } catch (e) { return null; }
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, tier === 'mid' ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement; canvas.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0c0f');
  if (!low) scene.fog = new THREE.Fog('#0b0c0f', 50, 110);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 160);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !low; controls.dampingFactor = 0.1;
  controls.minDistance = 0.5; controls.maxDistance = 34; controls.rotateSpeed = 0.6;
  const { CZ, W, H, front, back, screen } = lay;
  let video = null, vtex = null, soundBtn = null;
  const geos = [], mats = [], texs = [];
  const track = (o) => { if (o.geometry) geos.push(o.geometry); return o; };
  const mat = (opt) => { const m = low ? new THREE.MeshLambertMaterial(opt) : new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opt }); mats.push(m); return m; };
  const tex = (w, h, draw, rx, ry) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); texs.push(t); return t; };

  /* materials: dark acoustic panels, grey carpet, black ceiling */
  const wallMat = low ? mat({ color: '#2c2f36' }) : mat({ map: tex(256, 256, (g, w, h) => {
    g.fillStyle = '#2b2e35'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#30333b' : '#282a31'; g.fillRect(i * 64 + 2, 0, 60, h); }
    g.fillStyle = '#17181c'; for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 2, h);
    g.fillRect(0, h * 0.62, w, 3);
  }, 14, 2), roughness: 0.95 });
  const carpet = low ? mat({ color: '#4a4e57' }) : mat({ map: tex(128, 128, (g, w, h) => {
    g.fillStyle = '#4b4f58'; g.fillRect(0, 0, w, h); const r = mulberry32(5);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  }, 18, 18), roughness: 1 });
  const riser = mat({ color: '#2a2c32' });
  const ceil = mat({ color: '#08090b' });

  /* room */
  const D = back - front, MZ = (back + front) / 2;
  const plane = (w, h, m, p, r) => { const o = track(new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)); o.position.set(...p); o.rotation.set(...r); scene.add(o); return o; };
  plane(D, H, wallMat, [-W - 0.05, H / 2, MZ], [0, Math.PI / 2, 0]);
  plane(D, H, wallMat, [W + 0.05, H / 2, MZ], [0, -Math.PI / 2, 0]);
  plane(2 * W + 0.1, H, wallMat, [0, H / 2, back], [0, Math.PI, 0]);
  plane(2 * W + 0.1, H, ceil, [0, H / 2, front], [0, 0, 0]);
  plane(2 * W + 0.1, D, ceil, [0, H, MZ], [Math.PI / 2, 0, 0]);
  plane(2 * W + 0.1, D, carpet, [0, 0, MZ], [-Math.PI / 2, 0, 0]);
  // starry ceiling (fibre-optic stars)
  if (!low) {
    const r = mulberry32(42), n = 380, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (r() * 2 - 1) * W; pos[i * 3 + 1] = H - 0.03; pos[i * 3 + 2] = front + r() * D; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: '#fff6e0', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85 }); mats.push(pm);
    scene.add(track(new THREE.Points(g, pm)));
  }

  /* stepped, curved tiers */
  const zArc = (R) => (x) => CZ + Math.sqrt(Math.max(R * R - x * x, 0));
  const flat = (z) => () => z;
  function tier(f, b, y0, y1, ms = [carpet, riser]) {
    const N = low ? 24 : 48, pts = [];
    for (let i = 0; i <= N; i++) { const x = -W + (2 * W * i) / N; pts.push(new THREE.Vector2(x, -Math.min(f(x), back))); }
    for (let i = N; i >= 0; i--) { const x = -W + (2 * W * i) / N; pts.push(new THREE.Vector2(x, -Math.min(Math.max(b(x), f(x) + 0.01), back))); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(y1 - y0, 0.01), bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
    scene.add(track(new THREE.Mesh(g, ms)));
  }
  lay.main.forEach((r, i) => tier(zArc(r.frontR), lay.main[i + 1] || lay.balcony ? zArc(r.backR) : flat(back), 0, r.y));
  if (lay.balcony) {
    const fr = lay.balcony.frontZ - CZ;
    tier(zArc(fr), flat(back), 0, lay.balcony.base, [carpet, wallMat]);
    tier(zArc(fr), zArc(fr + 0.3), lay.balcony.base, lay.balcony.base + 1, [riser, riser]);
    lay.balc.forEach((r, i) => tier(zArc(r.frontR), lay.balc[i + 1] ? zArc(r.backR) : flat(back), lay.balcony.base, r.y));
  }
  // LED step lights: on every riser at each aisle and along both side stairs
  {
    const spots = [];
    for (const r of lay.rows) {
      for (const gp of r.gaps) spots.push([gp / r.R, r.frontR, r.y, 0.5]);
      const side = (r.half + (r.pair ? 1.3 : 1.0)) / r.R;
      spots.push([-side, r.frontR, r.y, 0.9], [side, r.frontR, r.y, 0.9]);
    }
    const g = new THREE.BoxGeometry(1, 0.025, 0.02); geos.push(g);
    const m = new THREE.MeshBasicMaterial({ color: '#f4f8ff' }); mats.push(m);
    const im = new THREE.InstancedMesh(g, m, spots.length), o = new THREE.Object3D();
    spots.forEach(([th, R, y, w], i) => { o.position.set(R * Math.sin(th), y - 0.05, CZ + R * Math.cos(th) - 0.012); o.rotation.set(0, th, 0); o.scale.set(w, 1, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    scene.add(im);
  }
  // stage
  { const o = track(new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.8, 2.4), mat({ color: '#111216' }))); o.position.set(0, 0.4, screen.z + 1.0); scene.add(o); }

  /* screen with black masking; shows the movie's art */
  const sc = document.createElement('canvas');
  sc.width = low ? 512 : 1024; sc.height = Math.round(sc.width * screen.h / screen.w);
  {
    const g = sc.getContext('2d'), w = sc.width, h = sc.height;
    const gr = g.createLinearGradient(0, 0, w * 0.3, h); gr.addColorStop(0, movie.c1); gr.addColorStop(1, movie.c2);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rr = mulberry32(hash(movie.id));
    g.globalAlpha = 0.16; for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#fff' : movie.c2; g.beginPath(); g.arc(rr() * w, rr() * h, rr() * w * 0.08, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(h * 0.2)}px Figtree, Arial, sans-serif`; g.fillText(movie.title.toUpperCase(), w / 2, h * 0.48);
    g.font = `600 ${Math.round(h * 0.06)}px Figtree, Arial, sans-serif`; g.globalAlpha = 0.8; g.fillText(`${movie.lang.toUpperCase()}  ·  NOW SHOWING`, w / 2, h * 0.66);
  }
  const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace; texs.push(stx);
  {
    const g = new THREE.PlaneGeometry(screen.w, screen.h, low ? 12 : 32, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (screen.w / 2); p.setZ(i, x * x * screen.curve); }
    const m = new THREE.MeshBasicMaterial({ map: stx, toneMapped: false, color: '#e8e8e8' }); mats.push(m);
    const o = track(new THREE.Mesh(g, m)); o.position.set(0, screen.y, screen.z); scene.add(o);
    // The movie's trailer plays on the theatre screen (muted until the person turns sound on)
    if (movie.trailer) {
      video = document.createElement('video');
      Object.assign(video, { src: movie.trailer, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
      video.setAttribute('playsinline', '');
      video.addEventListener('playing', () => {
        if (!vtex) { vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace; texs.push(vtex); m.map = vtex; m.needsUpdate = true; }
        kick();
      });
      video.play().catch(() => {});
      soundBtn = document.createElement('button');
      soundBtn.type = 'button'; soundBtn.className = 'h3-sound'; soundBtn.setAttribute('aria-pressed', 'false');
      const label = () => { soundBtn.innerHTML = video.muted ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>Trailer sound' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>Mute'; soundBtn.setAttribute('aria-pressed', String(!video.muted)); };
      label();
      soundBtn.addEventListener('click', (e) => { e.stopPropagation(); video.muted = !video.muted; if (video.paused) video.play().catch(() => {}); label(); });
      host.appendChild(soundBtn);
    }
    const black = new THREE.MeshBasicMaterial({ color: '#030304' }); mats.push(black);
    const mask = track(new THREE.Mesh(new THREE.PlaneGeometry(2 * W, H), black)); mask.position.set(0, H / 2, screen.z - 0.08); scene.add(mask);
  }
  // wall speakers, angled at the audience
  {
    const g = new THREE.BoxGeometry(0.55, 0.85, 0.45); geos.push(g);
    const m = mat({ color: '#0c0d10', roughness: 0.6 });
    const list = []; for (let z = screen.z + 4; z < back - 1.5; z += 4.2) for (const sx of [-1, 1]) list.push([sx, z]);
    const im = new THREE.InstancedMesh(g, m, list.length), o = new THREE.Object3D();
    list.forEach(([sx, z], i) => { o.position.set(sx * (W - 0.3), Math.min(H - 1.2, groundY(lay, sx * (W - 2), z) + 4.2), z); o.rotation.set(0, sx * -0.45, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    scene.add(im);
  }
  // light: dim house lights + the glow of the screen
  scene.add(new THREE.HemisphereLight('#e6ecff', '#2a2622', low ? 2.2 : 1.7));
  const dl = new THREE.DirectionalLight('#cfd8ff', 0.75); dl.position.set(0, screen.y, screen.z + 1); dl.target.position.set(0, 0, back); scene.add(dl, dl.target);
  if (!low) for (const [x, z] of [[-W * 0.5, (front + back) / 2], [W * 0.5, (front + back) / 2], [0, back - 3]]) { const l = new THREE.PointLight('#ffe3bd', 40, 30, 1.6); l.position.set(x, H - 0.5, z); scene.add(l); }

  /* seats: rounded navy fabric, wooden tray with cup holder on the armrest */
  function part(geo, shade, x, y, z, rx = 0) {
    geo = geo.index ? geo.toNonIndexed() : geo; geo.deleteAttribute('uv'); geo.rotateX(rx); geo.translate(x, y, z);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(shade), 3)); return geo;
  }
  const B = (w, h, d, r = 0.05) => (low ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r));
  const stdGeo = mergeGeometries([
    part(B(0.36, 0.34, 0.3, 0.03), 0.25, 0, 0.17, 0.06),
    part(B(0.54, 0.17, 0.52, 0.07), 1, 0, 0.43, -0.02),
    part(B(0.56, 0.78, 0.16, 0.07), 0.92, 0, 0.86, 0.27, 0.12),
    part(B(0.07, 0.12, 0.5, 0.03), 0.3, -0.31, 0.6, 0.02),
    part(B(0.07, 0.12, 0.5, 0.03), 0.3, 0.31, 0.6, 0.02),
  ]);
  const recGeo = mergeGeometries([
    part(B(0.96, 0.38, 0.86, 0.06), 0.28, 0, 0.21, 0.02),
    part(B(0.8, 0.24, 0.78, 0.1), 1, 0, 0.5, -0.04),
    part(B(0.8, 1.0, 0.26, 0.1), 0.92, 0, 0.98, 0.4, 0.22),
    part(B(0.15, 0.34, 0.86, 0.06), 0.85, -0.48, 0.6, 0.02),
    part(B(0.15, 0.34, 0.86, 0.06), 0.85, 0.48, 0.6, 0.02),
    part(B(0.72, 0.12, 0.34, 0.05), 0.85, 0, 0.34, -0.57, -0.55),
  ]);
  geos.push(stdGeo, recGeo);
  const seatMat = mat({ vertexColors: true, roughness: 0.95 });
  const stdList = lay.seats.filter((s) => s.kind === 'std'), recList = lay.seats.filter((s) => s.kind === 'rec');
  const meshOf = new Map(), lists = new Map();
  const tmpO = new THREE.Object3D();
  for (const [geo, list] of [[stdGeo, stdList], [recGeo, recList]]) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(geo, seatMat, list.length);
    list.forEach((s, i) => { tmpO.position.set(s.x, s.y, s.z); tmpO.rotation.set(0, s.theta, 0); tmpO.updateMatrix(); m.setMatrixAt(i, tmpO.matrix); meshOf.set(s.id, [m, i]); });
    m.computeBoundingSphere(); scene.add(m); lists.set(m, list);
  }
  // wooden trays + cup holders (one per seat, on the right armrest)
  {
    const trayG = low ? new THREE.BoxGeometry(0.2, 0.035, 0.3) : new RoundedBoxGeometry(0.2, 0.035, 0.3, 2, 0.015);
    const cupG = new THREE.CylinderGeometry(0.045, 0.045, 0.04, low ? 8 : 14); geos.push(trayG, cupG);
    const wood = mat({ color: '#b98a55', roughness: 0.55 }), cupM = mat({ color: '#0b0b0c', roughness: 0.4 });
    const all = lay.seats.filter((s) => !s.acc);
    const tm = new THREE.InstancedMesh(trayG, wood, all.length), cm = new THREE.InstancedMesh(cupG, cupM, all.length);
    const o = new THREE.Object3D(), local = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    all.forEach((s, i) => {
      const rec = s.kind === 'rec';
      q.setFromAxisAngle(up, s.theta);
      local.set(rec ? 0.48 : 0.34, rec ? 0.79 : 0.68, -0.08).applyQuaternion(q);
      o.position.set(s.x + local.x, s.y + local.y, s.z + local.z); o.quaternion.copy(q); o.scale.setScalar(rec ? 1.2 : 1); o.updateMatrix();
      tm.setMatrixAt(i, o.matrix); o.position.y += 0.005; o.updateMatrix(); cm.setMatrixAt(i, o.matrix);
    });
    scene.add(tm, cm);
  }
  const col = new THREE.Color(), C_SEAT = new THREE.Color('#284870'), C_BOOK = new THREE.Color('#284870'), C_PICK = new THREE.Color('#ffc72c'), C_OFF = new THREE.Color('#3a3c42');
  const C_REC = new THREE.Color('#2a4366');
  function paintSeats() {
    for (const s of lay.seats) {
      const [m, i] = meshOf.get(s.id);
      m.setColorAt(i, selected.has(s.id) ? C_PICK : s.disabled ? C_OFF : booked.has(s.id) ? C_BOOK : col.copy(s.kind === 'rec' ? C_REC : C_SEAT));
    }
    for (const m of lists.keys()) m.instanceColor.needsUpdate = true;
  }
  paintSeats();

  /* audience in booked seats (simple shapes, instanced) */
  const people = new THREE.Group(); scene.add(people);
  function buildPeople() {
    people.children.slice().forEach((c) => { people.remove(c); c.dispose(); });
    const list = lay.seats.filter((s) => booked.has(s.id) && !selected.has(s.id) && !s.disabled);
    if (!list.length) return;
    const seg = low ? 6 : 10;
    const body = mergeGeometries([
      (() => { const g = new THREE.CapsuleGeometry(0.15, 0.3, 2, seg); g.scale(1.2, 1, 0.8); g.translate(0, 0.84, 0.1); return g.toNonIndexed(); })(),
      ...(low ? [] : [-1, 1].map((sx) => { const g = new THREE.BoxGeometry(0.13, 0.13, 0.42); g.translate(sx * 0.09, 0.58, -0.15); return g.toNonIndexed(); })),
    ]);
    const head = new THREE.SphereGeometry(0.1, seg, Math.round(seg * 0.75)); head.scale(0.9, 1.12, 1); head.translate(0, 1.24, 0.1);
    const hair = new THREE.SphereGeometry(0.108, seg, 5, 0, Math.PI * 2, 0, Math.PI * 0.5); hair.scale(0.94, 1.08, 1.05); hair.rotateX(0.5); hair.translate(0, 1.25, 0.11);
    geos.push(body, head, hair);
    const cloth = mat({}), skin = mat({ roughness: 0.6 }), hairM = mat({ side: THREE.DoubleSide, roughness: 0.5 });
    const mb = new THREE.InstancedMesh(body, cloth, list.length), mh = new THREE.InstancedMesh(head, skin, list.length), mr = new THREE.InstancedMesh(hair, hairM, list.length);
    const SK = ['#5c3a24', '#7d4f2e', '#8a5a35', '#a8784c', '#c49468'], TOP = ['#f1ede4', '#9fb6cf', '#2c3b57', '#6d2730', '#56653a', '#c79c3c', '#a3123a', '#1f6b4a', '#d39a10', '#5a2378', '#e3779a'], HR = ['#0f0c0b', '#1d1714', '#8c8782'];
    list.forEach((s, i) => {
      const r = mulberry32(hash(s.id));
      tmpO.position.set(s.x, s.y + (s.kind === 'rec' ? 0.07 : 0), s.z); tmpO.rotation.set(s.kind === 'rec' ? 0.14 : 0, s.theta + (r() - 0.5) * 0.15, 0); tmpO.scale.setScalar(0.94 + r() * 0.12); tmpO.updateMatrix();
      mb.setMatrixAt(i, tmpO.matrix); mh.setMatrixAt(i, tmpO.matrix); mr.setMatrixAt(i, tmpO.matrix);
      mb.setColorAt(i, col.set(TOP[(r() * TOP.length) | 0])); mh.setColorAt(i, col.set(SK[(r() * SK.length) | 0])); mr.setColorAt(i, col.set(HR[r() < 0.85 ? (r() < 0.5 ? 0 : 1) : 2]));
    });
    tmpO.scale.setScalar(1);
    for (const m of [mb, mh, mr]) { m.frustumCulled = false; people.add(m); }
  }
  buildPeople();

  /* camera limits: always inside the hall */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function keepInside(v) {
    v.x = clamp(v.x, -W + 0.5, W - 0.5); v.z = clamp(v.z, screen.z + 2.5, back - 0.45);
    v.y = clamp(v.y, groundY(lay, v.x, v.z) + 0.55, H - 0.45); return v;
  }
  const lastRow = lay.rows[lay.rows.length - 1];
  const PRESETS = {
    overview: [[-W * 0.82, Math.min(H - 1, lastRow.y + 6), back - 0.8], [0, 1.5, (screen.z + lastRow.z) / 2 - 2]],
    front: [[W * 0.75, screen.y - 1, screen.z + 3.2], [-W * 0.2, 2, back]],
    back: [[0, lastRow.y + 2.2, back - 0.6], [0, screen.y, screen.z]],
  };

  /* render on demand */
  let raf = 0, fly = null, alive = true, idleUntil = 0;
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function frame(now) {
    raf = 0; if (!alive) return;
    let moving = false;
    if (fly) {
      const k = Math.min((now - fly.t) / fly.d, 1), e = ease(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.q0, fly.q1, e);
      moving = k < 1; if (!moving) fly = null;
    }
    const changed = controls.update();
    keepInside(camera.position); camera.lookAt(controls.target);
    renderer.render(scene, camera);
    // keep drawing while the trailer plays (about 30 frames a second is enough for video)
    const playing = video && vtex && !video.paused && !document.hidden;
    if (moving || changed || now < idleUntil) kick(); else if (playing) setTimeout(kick, tier === 'low' ? 60 : 30);
  }
  function kick() { if (!raf && alive) raf = requestAnimationFrame(frame); }
  controls.addEventListener('change', () => { idleUntil = performance.now() + 300; kick(); });
  controls.addEventListener('start', () => { fly = null; });
  function flyTo(p, q, d = 1.2, instant = false) {
    const p1 = keepInside(new THREE.Vector3(...p)), q1 = new THREE.Vector3(...q);
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(p1); controls.target.copy(q1); fly = null; }
    else fly = { p0: camera.position.clone(), q0: controls.target.clone(), p1, q1, t: performance.now(), d: d * 1000 };
    kick();
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 72 : 60; camera.updateProjectionMatrix(); kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  /* tap a seat in 3D */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !onSeatTap) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null; if (moved > 8) return;
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...lists.keys()], false)[0];
    if (hit) onSeatTap(lists.get(hit.object)[hit.instanceId]);
  });

  flyTo(...PRESETS.overview, 0, true);
  return {
    seatView(s, instant = false) {
      const eye = [s.x + Math.sin(s.theta) * 0.12, s.y + (s.kind === 'rec' ? 1.22 : 1.15), s.z + Math.cos(s.theta) * 0.12];
      const v = new THREE.Vector3(0, screen.y, screen.z).sub(new THREE.Vector3(...eye)).normalize().multiplyScalar(1.2);
      flyTo(eye, [eye[0] + v.x, eye[1] + v.y, eye[2] + v.z], 1.1, instant);
    },
    preset(n) { flyTo(...PRESETS[n]); },
    refresh() { paintSeats(); buildPeople(); kick(); },
    resize,
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); } soundBtn?.remove();
      people.children.forEach((c) => c.dispose());
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
      for (const m of lists.keys()) m.dispose();
      renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove();
    },
  };
}
