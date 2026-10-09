// One-Euro filter (Casiez et al.) — low jitter when still, low lag when moving.
const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);

class LowPass { y: number | null = 0; s = 0; filter(v: number, a: number) { this.s = this.y === null ? v : a * v + (1 - a) * this.s; this.y = this.s; return this.s; } }

export class OneEuro {
  private x = new LowPass(); private dx = new LowPass(); private last = 0; private prev: number | null = null;
  constructor(private minCutoff = 1.2, private beta = 0.012, private dCutoff = 1) {}
  filter(v: number, tMs: number) {
    const dt = this.last ? Math.max(1e-3, (tMs - this.last) / 1000) : 1 / 30;
    this.last = tMs;
    const d = this.prev === null ? 0 : (v - this.prev) / dt;
    this.prev = v;
    const edx = this.dx.filter(d, alpha(this.dCutoff, dt));
    return this.x.filter(v, alpha(this.minCutoff + this.beta * Math.abs(edx), dt));
  }
}

export class PointSmoother {
  private f = new Map<string, [OneEuro, OneEuro]>();
  get(key: string, x: number, y: number, t: number): [number, number] {
    let p = this.f.get(key);
    if (!p) { p = [new OneEuro(), new OneEuro()]; this.f.set(key, p); }
    return [p[0].filter(x, t), p[1].filter(y, t)];
  }
  reset() { this.f.clear(); }
}
