import fs from 'fs';
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(new URL(u))) });
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.performance ??= { now: () => Date.now() };
const { loadNLU, nluParse } = await import('../nlu.js');
await loadNLU(new URL('../nlu-model.json', import.meta.url));
const rows = JSON.parse(fs.readFileSync(new URL('./parity.json', import.meta.url)));
let same = 0, sameI = 0, t = 0;
for (const r of rows) { const p = nluParse(r.w.join(' ')); t += p.ms; if (JSON.stringify(p.tags) === JSON.stringify(r.tags)) same++; if (p.intent === r.intent) sameI++; }
console.log(`JS vs PyTorch: tags identical ${same}/${rows.length}, intent identical ${sameI}/${rows.length}, avg ${(t / rows.length).toFixed(2)} ms per sentence`);
