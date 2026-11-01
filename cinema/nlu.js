// Lumen NLU: our own small transformer (trained with PyTorch in nlu/train.py),
// running in the browser with plain JavaScript. No external AI service.
// Input: a sentence. Output: intent + slot spans (movie, count, date, time, place, seat preference, format).

let M = null, loading = null;

function fnv(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export const tokenize = (s) => s.toLowerCase().split(/[\s,!?;"()]+/).filter(Boolean);
function grams(w, buckets) {
  const s = Array.from('<' + w + '>');
  const g = ['w:' + w];
  for (const n of [2, 3, 4]) for (let i = 0; i + n <= s.length; i++) g.push(s.slice(i, i + n).join(''));
  return g.slice(0, 32).map((x) => fnv(x) % buckets);
}
function decode(t) {
  const bin = atob(t.data), n = bin.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(i); if (v > 127) v -= 256; out[i] = v * t.scale; }
  return { shape: t.shape, d: out };
}
export function loadNLU(url = new URL('./nlu-model.json', import.meta.url)) {
  if (M) return Promise.resolve(M);
  if (!loading) loading = fetch(url).then((r) => r.json()).then((j) => {
    const W = {}; for (const [k, v] of Object.entries(j.weights)) W[k] = decode(v);
    M = { cfg: j.config, W }; return M;
  }).catch((e) => { loading = null; throw e; });
  return loading;
}
export const nluReady = () => !!M;

// y = x W^T + b   (x: T×inD, W: outD×inD)
function linear(x, T, inD, W, b) {
  const outD = W.shape[0], y = new Float32Array(T * outD), w = W.d, bb = b.d;
  for (let t = 0; t < T; t++) for (let o = 0; o < outD; o++) {
    let s = bb[o]; const xo = t * inD, wo = o * inD;
    for (let i = 0; i < inD; i++) s += x[xo + i] * w[wo + i];
    y[t * outD + o] = s;
  }
  return y;
}
function layerNorm(x, T, D, g, b) {
  const y = new Float32Array(T * D);
  for (let t = 0; t < T; t++) {
    let m = 0; for (let i = 0; i < D; i++) m += x[t * D + i]; m /= D;
    let v = 0; for (let i = 0; i < D; i++) { const d = x[t * D + i] - m; v += d * d; } v /= D;
    const r = 1 / Math.sqrt(v + 1e-5);
    for (let i = 0; i < D; i++) y[t * D + i] = (x[t * D + i] - m) * r * g.d[i] + b.d[i];
  }
  return y;
}

export function nluParse(text) {
  if (!M) return null;
  const t0 = performance.now();
  const { cfg, W } = M, D = cfg.dim, H = cfg.heads, hd = D / H;
  const words = tokenize(text).slice(0, cfg.maxlen);
  const T = words.length;
  if (!T) return null;
  // embeddings: mean of hashed word + character n-gram vectors, plus position
  let x = new Float32Array(T * D);
  const E = W['emb.weight'].d, P = W['pos'].d;
  words.forEach((w, t) => {
    const ids = grams(w, cfg.buckets);
    for (const id of ids) for (let i = 0; i < D; i++) x[t * D + i] += E[id * D + i] / ids.length;
    for (let i = 0; i < D; i++) x[t * D + i] += P[t * D + i];
  });
  for (let l = 0; l < cfg.layers; l++) {
    const p = (n) => W[`blocks.${l}.${n}`];
    const h = layerNorm(x, T, D, p('n1.g'), p('n1.b'));
    const qkv = linear(h, T, D, p('qkv.weight'), p('qkv.bias'));
    const att = new Float32Array(T * D);
    for (let hh = 0; hh < H; hh++) {
      for (let i = 0; i < T; i++) {
        const sc = new Float32Array(T); let mx = -1e30;
        for (let j = 0; j < T; j++) {
          let s = 0; for (let k = 0; k < hd; k++) s += qkv[i * 3 * D + hh * hd + k] * qkv[j * 3 * D + D + hh * hd + k];
          sc[j] = s / Math.sqrt(hd); if (sc[j] > mx) mx = sc[j];
        }
        let sum = 0; for (let j = 0; j < T; j++) { sc[j] = Math.exp(sc[j] - mx); sum += sc[j]; }
        for (let k = 0; k < hd; k++) { let s = 0; for (let j = 0; j < T; j++) s += sc[j] * qkv[j * 3 * D + 2 * D + hh * hd + k]; att[i * D + hh * hd + k] = s / sum; }
      }
    }
    const o = linear(att, T, D, p('o.weight'), p('o.bias'));
    for (let i = 0; i < x.length; i++) x[i] += o[i];
    const h2 = layerNorm(x, T, D, p('n2.g'), p('n2.b'));
    const f1 = linear(h2, T, D, p('f1.weight'), p('f1.bias')); for (let i = 0; i < f1.length; i++) if (f1[i] < 0) f1[i] = 0;
    const f2 = linear(f1, T, cfg.ff, p('f2.weight'), p('f2.bias'));
    for (let i = 0; i < x.length; i++) x[i] += f2[i];
  }
  x = layerNorm(x, T, D, W['nf.g'], W['nf.b']);
  const tl = linear(x, T, D, W['tag.weight'], W['tag.bias']);
  const pooled = new Float32Array(D); for (let t = 0; t < T; t++) for (let i = 0; i < D; i++) pooled[i] += x[t * D + i] / T;
  const il = linear(pooled, 1, D, W['intent.weight'], W['intent.bias']);
  // intent with confidence
  let best = 0; for (let i = 1; i < il.length; i++) if (il[i] > il[best]) best = i;
  let z = 0; for (const v of il) z += Math.exp(v - il[best]);
  const intent = cfg.intents[best], conf = 1 / z;
  // slot spans
  const NT = cfg.tags.length, tags = [];
  for (let t = 0; t < T; t++) { let b = 0; for (let k = 1; k < NT; k++) if (tl[t * NT + k] > tl[t * NT + b]) b = k; tags.push(cfg.tags[b]); }
  const slots = {}; let cur = null;
  tags.forEach((tg, i) => {
    if (tg === 'O') { cur = null; return; }
    const [bi, lab] = tg.split('-');
    if (bi === 'B' || !cur || cur.lab !== lab) { cur = { lab, words: [] }; (slots[lab] ||= []).push(cur); }
    cur.words.push(words[i]);
  });
  const out = {}; for (const [k, v] of Object.entries(slots)) out[k] = v.map((s) => s.words.join(' '));
  return { intent, conf, slots: out, tags, words, ms: performance.now() - t0 };
}
