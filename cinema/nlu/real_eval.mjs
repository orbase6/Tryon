// Hand-written sentences (not produced by gen_data.py). Expected values are what a person means.
import fs from 'fs';
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(new URL(u))) });
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { loadNLU } = await import('../nlu.js');
await loadNLU(new URL('../nlu-model.json', import.meta.url));
const { parse, understand } = await import('../agent.js');
const { dayKey, addDays, today } = await import('../data.js');
const T0 = dayKey(today()), T1 = dayKey(addDays(today(), 1));
const C = [
  ['2 tickets for kaalam tomorrow evening', { movieId: 'kaalam', count: 2, dk: T1, part: 'evening' }],
  ['naalaikku maalai neon kadal rendu ticket venum', { movieId: 'neonkadal', count: 2, dk: T1, part: 'evening' }],
  ['kalaam padam innaikku night 3 per', { movieId: 'kaalam', count: 3, dk: T0, part: 'night' }],
  ['book orbit nine in imax for 4 people', { movieId: 'orbit9', count: 4, imax: true }],
  ['paati kitchen family ku 5 seat sunday morning', { movieId: 'paati', count: 5, part: 'morning' }],
  ['raja rumbel 2 recliner seats tonight', { movieId: 'rajarumble', count: 2, pref: 'recliner', dk: T0 }],
  ['i want to watch the last ferry at 9 pm', { movieId: 'lastferry', hour: 21 }],
  ['mazhavil couple seats balcony', { movieId: 'mazhavil', count: 2, pref: 'balcony' }],
  ['little kanna moonu ticket kaalai show', { movieId: 'kanna', count: 3, part: 'morning' }],
  ['dhool express cheapest seats 6 per', { movieId: 'dhool', count: 6, pref: 'cheap' }],
  ['silent valley second show', { movieId: 'silentvalley', part: 'night' }],
  ['neon kadal anna nagar la 2 tickets', { movieId: 'neonkadal', count: 2, theatreId: 'c0t0' }],
  ['kaalam velachery ganga cinemas 4 seats tomorrow', { movieId: 'kaalam', count: 4, dk: T1 }],
  ['orbit 9 starline la naalu ticket', { movieId: 'orbit9', count: 4, theatreId: 'c0t1' }],
  ['naalaikku iravu kaalam rendu', { movieId: 'kaalam', count: 2, dk: T1, part: 'night' }],
  ['நாளை மாலை காலம் 2 டிக்கெட்', { movieId: 'kaalam', count: 2, dk: T1, part: 'evening' }],
  ['இன்று இரவு குயில்', { movieId: 'kuyil', dk: T0, part: 'night' }],
  ['2 seats for neon kadl tomorow', { movieId: 'neonkadal', count: 2, dk: T1 }],
  ['kaalm 3 tickts evenig', { movieId: 'kaalam', count: 3, part: 'evening' }],
  ['back row la paati kitchen 2', { movieId: 'paati', count: 2, pref: 'back' }],
  ['orbit nine nadu seat 2 per', { movieId: 'orbit9', count: 2, pref: 'centre' }],
  ['raja rumble at 7:30 pm 2 tickets', { movieId: 'rajarumble', count: 2, hour: 19.5 }],
  ['can you get me tickets for mazhavil this saturday', { movieId: 'mazhavil' }],
  ['remind me when agni paravai releases', { notify: true, movieId: 'agniparavai' }],
  ['starfall eppo release', { notify: true, movieId: 'starfall' }],
  ['aama book pannu', { yes: true }],
  ['sari podu', { yes: true }],
  ['vendam vera time', { no: true }],
  ['show my tickets', { myTickets: true }],
  ['en booking cancel pannu', { myTickets: true }],
  ['vanakkam', { help: true }],
  ['evening show venum', { part: 'evening' }],
  ['make it 4 tickets', { count: 4 }],
  ['imax la venum', { imax: true }],
  ['kanna padam pathu per sunday', { movieId: 'kanna', count: 10 }],
  ['tmrw neon kadal 1 ticket late night', { movieId: 'neonkadal', count: 1, dk: T1, part: 'night' }],
  ['silent valley 2 tickets in kochi', { movieId: 'silentvalley', count: 2, cityId: 'kochi' }],
  ['dhool 4 per budget la', { movieId: 'dhool', count: 4, pref: 'cheap' }],
  ['kaalam the last monsoon two tickets today', { movieId: 'kaalam', count: 2, dk: T0 }],
  ['paati kitchen ku oru ticket madhiyam', { movieId: 'paati', count: 1, part: 'afternoon' }],
];
function score(fn) {
  let fields = 0, okF = 0, okS = 0; const fails = [];
  for (const [s, exp] of C) {
    const got = fn(s, 'chennai'); let all = true;
    for (const [k, v] of Object.entries(exp)) { fields++; if (got[k] === v) okF++; else { all = false; } }
    if (all) okS++; else fails.push(`${s} → ${JSON.stringify(Object.fromEntries(Object.keys(exp).map((k) => [k, got[k]])))}`);
  }
  return { sentences: `${okS}/${C.length}`, fields: `${okF}/${fields}`, fieldAcc: (okF / fields * 100).toFixed(1) + '%', fails };
}
const r1 = score(parse), r2 = score(understand);
console.log('Rules only     :', r1.sentences, 'sentences fully right,', r1.fieldAcc, 'of fields');
console.log('Our model+rules:', r2.sentences, 'sentences fully right,', r2.fieldAcc, 'of fields');
console.log('Model misses:\n  ' + r2.fails.join('\n  '));
fs.writeFileSync(new URL('./real_eval.json', import.meta.url), JSON.stringify({ rules: r1, model: r2 }, null, 1));
