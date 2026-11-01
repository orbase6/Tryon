// 3D hall, loaded on demand. Renders only when something changes, so it stays
// cool and smooth on low-end phones.
import { CLASS_META, mulberry32, hash } from './data.js';
import { groundY } from './layout.js';

let THREE = null, OrbitControls = null, mergeGeometries = null;
async function loadThree() {
  if (THREE) return;
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js'));
}

export async function mountHall(host, lay, { movie, booked, selected, tier = 'mid', onSeatTap = null }) {
  await loadThree();
  const low = tier === 'low';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: low ? 'low-power' : 'default' });
  } catch (e) { return null; }
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(low ? 1 : Math.min(dpr, tier === 'mid' ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e0f14');
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 140);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !low; controls.dampingFactor = 0.1;
  controls.minDistance = 0.5; controls.maxDistance = 30; controls.rotateSpeed = 0.6;
  const { CZ, W, H, front, back, screen } = lay;
  const geos = [], mats = [], texs = [];
  const track = (o) => { if (o.geometry) geos.push(o.geometry); return o; };

  /* materials */
  const lam = (opt) => { const m = new THREE.MeshLambertMaterial(opt); mats.push(m); return m; };
  let wallMat;
  if (!low) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#140904'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) { const gr = g.createLinearGradient(i * 64, 0, i * 64 + 64, 0); gr.addColorStop(0, '#4a2412'); gr.addColorStop(0.5, '#7b4120'); gr.addColorStop(1, '#3e1d0d'); g.fillStyle = gr; g.fillRect(i * 64 + 3, 0, 58, 256); }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(12, 2); texs.push(tx);
    wallMat = lam({ map: tx });
  } else wallMat = lam({ color: '#5a2e17' });
  const carpet = lam({ color: '#3c1610' }), riser = lam({ color: '#24100a' }), dark = lam({ color: '#0b0b10' });

  /* room */
  const D = back - front, MZ = (back + front) / 2;
  const plane = (w, h, m, p, r) => { const o = track(new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)); o.position.set(...p); o.rotation.set(...r); scene.add(o); return o; };
  plane(D, H, wallMat, [-W - 0.05, H / 2, MZ], [0, Math.PI / 2, 0]);
  plane(D, H, wallMat, [W + 0.05, H / 2, MZ], [0, -Math.PI / 2, 0]);
  plane(2 * W + 0.1, H, wallMat, [0, H / 2, back], [0, Math.PI, 0]);
  plane(2 * W + 0.1, H, dark, [0, H / 2, front], [0, 0, 0]);
  plane(2 * W + 0.1, D, lam({ color: '#0d0e14' }), [0, H, MZ], [Math.PI / 2, 0, 0]);
  plane(2 * W + 0.1, D, carpet, [0, 0, MZ], [-Math.PI / 2, 0, 0]);

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
  // stage
  { const o = track(new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.8, 2.4), lam({ color: '#1c0e07' }))); o.position.set(0, 0.4, screen.z + 1.0); scene.add(o); }

  /* screen shows the movie's poster art */
  const sc = document.createElement('canvas');
  sc.width = low ? 512 : 1024; sc.height = Math.round(sc.width * screen.h / screen.w);
  {
    const g = sc.getContext('2d'), w = sc.width, h = sc.height;
    const gr = g.createLinearGradient(0, 0, w * 0.3, h); gr.addColorStop(0, movie.c1); gr.addColorStop(1, movie.c2);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rr = mulberry32(hash(movie.id));
    g.globalAlpha = 0.18; for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#fff' : movie.c2; g.beginPath(); g.arc(rr() * w, rr() * h, rr() * w * 0.08, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
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
    const m = new THREE.MeshBasicMaterial({ map: stx, toneMapped: false }); mats.push(m);
    const o = track(new THREE.Mesh(g, m)); o.position.set(0, screen.y, screen.z); scene.add(o);
    const mask = track(new THREE.Mesh(new THREE.PlaneGeometry(screen.w + 1.4, screen.h + 1.2), lam({ color: '#000' }))); mask.position.set(0, screen.y, screen.z - 0.05); scene.add(mask);
    const cur = lam({ color: '#7d0f16', side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const cw = Math.max(1.2, W - screen.w / 2 - 0.6);
      const cg = new THREE.PlaneGeometry(cw, screen.h + 3, low ? 8 : 40, 1);
      const cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, 0.2 * Math.sin(cp.getX(i) * 7)); cg.computeVertexNormals();
      const c = track(new THREE.Mesh(cg, cur)); c.position.set(sx * (W - cw / 2), screen.y, screen.z - 0.2); scene.add(c);
    }
  }
  // lights: house light + the screen's glow
  scene.add(new THREE.HemisphereLight('#ffe2c4', '#2a1410', 1.35));
  const dl = new THREE.DirectionalLight(movie.c2, 0.9); dl.position.set(0, screen.y, screen.z + 1); dl.target.position.set(0, 0, back); scene.add(dl, dl.target);

  /* seats (instanced) */
  function part(geo, shade, x, y, z, rx = 0) {
    geo = geo.index ? geo.toNonIndexed() : geo; geo.deleteAttribute('uv'); geo.rotateX(rx); geo.translate(x, y, z);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(shade), 3)); return geo;
  }
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const stdGeo = mergeGeometries([part(B(0.34, 0.34, 0.3), 0.25, 0, 0.17, 0.05), part(B(0.54, 0.15, 0.5), 1, 0, 0.42, -0.02), part(B(0.54, 0.7, 0.12), 0.88, 0, 0.82, 0.27, 0.14), part(B(0.06, 0.07, 0.46), 0.45, -0.31, 0.62, 0.02), part(B(0.06, 0.07, 0.46), 0.45, 0.31, 0.62, 0.02)]);
  const recGeo = mergeGeometries([part(B(0.94, 0.36, 0.82), 0.28, 0, 0.2, 0.02), part(B(0.78, 0.2, 0.74), 1, 0, 0.47, -0.04), part(B(0.78, 0.92, 0.22), 0.92, 0, 0.94, 0.38, 0.22), part(B(0.13, 0.3, 0.82), 0.5, -0.46, 0.58, 0.02), part(B(0.13, 0.3, 0.82), 0.5, 0.46, 0.58, 0.02), part(B(0.7, 0.1, 0.32), 0.65, 0, 0.33, -0.55, -0.55)]);
  geos.push(stdGeo, recGeo);
  const seatMat = lam({ vertexColors: true });
  const stdList = lay.seats.filter((s) => s.kind === 'std'), recList = lay.seats.filter((s) => s.kind === 'rec');
  const meshOf = new Map(), lists = new Map();
  const tmpO = new THREE.Object3D();
  for (const [geo, list] of [[stdGeo, stdList], [recGeo, recList]]) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(geo, seatMat, list.length);
    list.forEach((s, i) => { tmpO.position.set(s.x, s.y, s.z); tmpO.rotation.set(0, s.theta, 0); tmpO.updateMatrix(); m.setMatrixAt(i, tmpO.matrix); meshOf.set(s.id, [m, i]); });
    m.computeBoundingSphere(); scene.add(m); lists.set(m, list);
  }
  const col = new THREE.Color(), C_BOOK = new THREE.Color('#2b2f3b'), C_PICK = new THREE.Color('#e5414f');
  const clsCol = Object.fromEntries(Object.entries(CLASS_META).map(([k, v]) => [k, new THREE.Color(v.color)]));
  function paintSeats() {
    for (const s of lay.seats) {
      const [m, i] = meshOf.get(s.id);
      m.setColorAt(i, selected.has(s.id) ? C_PICK : booked.has(s.id) ? C_BOOK : col.copy(clsCol[s.cls]));
    }
    for (const m of lists.keys()) m.instanceColor.needsUpdate = true;
  }
  paintSeats();

  /* audience in booked seats (simple shapes, instanced) */
  const people = new THREE.Group(); scene.add(people);
  function buildPeople() {
    people.children.slice().forEach((c) => { people.remove(c); c.dispose(); });
    const list = lay.seats.filter((s) => booked.has(s.id) && !selected.has(s.id));
    if (!list.length) return;
    const seg = low ? 6 : 10;
    const body = mergeGeometries([
      (() => { const g = new THREE.CapsuleGeometry(0.15, 0.3, 2, seg); g.scale(1.2, 1, 0.8); g.translate(0, 0.82, 0.1); return g.toNonIndexed(); })(),
      ...(low ? [] : [-1, 1].map((sx) => { const g = new THREE.BoxGeometry(0.13, 0.13, 0.42); g.translate(sx * 0.09, 0.56, -0.15); return g.toNonIndexed(); })),
    ]);
    const head = new THREE.SphereGeometry(0.1, seg, Math.round(seg * 0.75)); head.scale(0.9, 1.12, 1); head.translate(0, 1.22, 0.1);
    const hair = new THREE.SphereGeometry(0.108, seg, 5, 0, Math.PI * 2, 0, Math.PI * 0.5); hair.scale(0.94, 1.08, 1.05); hair.rotateX(0.5); hair.translate(0, 1.23, 0.11);
    geos.push(body, head, hair);
    const cloth = lam({}), skin = lam({}), hairM = lam({ side: THREE.DoubleSide });
    const mb = new THREE.InstancedMesh(body, cloth, list.length), mh = new THREE.InstancedMesh(head, skin, list.length), mr = new THREE.InstancedMesh(hair, hairM, list.length);
    const SK = ['#5c3a24', '#7d4f2e', '#8a5a35', '#a8784c', '#c49468'], TOP = ['#f1ede4', '#9fb6cf', '#2c3b57', '#6d2730', '#56653a', '#c79c3c', '#a3123a', '#1f6b4a', '#d39a10', '#5a2378', '#e3779a'], HR = ['#0f0c0b', '#1d1714', '#8c8782'];
    list.forEach((s, i) => {
      const r = mulberry32(hash(s.id));
      const sc2 = 0.94 + r() * 0.12;
      tmpO.position.set(s.x, s.y + (s.kind === 'rec' ? 0.07 : 0), s.z); tmpO.rotation.set(s.kind === 'rec' ? 0.14 : 0, s.theta + (r() - 0.5) * 0.15, 0); tmpO.scale.setScalar(sc2); tmpO.updateMatrix();
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
    front: [[0, screen.y - 1, screen.z + 3.2], [0, 2, back]],
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
    if (moving || changed || now < idleUntil) kick();
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
      people.children.forEach((c) => c.dispose());
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
      for (const m of lists.keys()) m.dispose();
      renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove();
    },
  };
}
