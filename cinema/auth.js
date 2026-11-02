// One sign-in page for Lumen admins and theatre partners, password reset by email OTP,
// and partner registration (account → theatre → email code → Lumen approval).
import { CITIES, theatresFor } from './data.js';
import { HALLS } from './layout.js';
import { icon, esc, $, toast, state, tx } from './ui.js';
import { planCards, bindPlanCards, payPlan, rupees, fmtDay } from './billing.js';

const L = (en, ta) => (state.lang === 'ta' && ta ? ta : en);
const home = (u) => (u.role === 'admin' ? '#console' : '#partner');
const pwHint = () => L('At least 8 characters, with letters and numbers.', 'குறைந்தது 8 எழுத்துகள், எழுத்தும் எண்ணும் சேர்த்து.');
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
const pwOk = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

function shell(title, sub, body) {
  return `<div class="auth"><div class="auth-card">
    <a class="auth-logo" href="#home"><span class="logo-dot"></span>Lumen <small>Partners & Admin</small></a>
    <h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}${body}</div></div>`;
}
const field = (id, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input class="input" id="${id}" type="${type}" ${extra}><small class="err" data-for="${id}"></small></label>`;
const pwField = (id, label, auto) => `<label class="field"><span>${label}</span><span class="pw"><input class="input" id="${id}" type="password" autocomplete="${auto}"><button type="button" class="pw-eye" data-eye="${id}" aria-label="Show password">${icon('eye')}</button></span><small class="err" data-for="${id}"></small></label>`;
function setErr(root, id, msg) { const e = root.querySelector(`[data-for="${id}"]`); if (e) e.textContent = msg || ''; root.querySelector('#' + id)?.setAttribute('aria-invalid', msg ? 'true' : 'false'); return !msg; }
function bindEyes(root) { root.addEventListener('click', (e) => { const b = e.target.closest('[data-eye]'); if (!b) return; const i = root.querySelector('#' + b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; }); }
async function busy(btn, fn) { const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin sm"></span>'; try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; } }
function needServer(view) {
  view.innerHTML = shell(L('Sign-in needs the Lumen server'), '', `<div class="notice">${icon('lock')}${/^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? `<span>This page is being served by a plain file server (VS Code Live Server or Python), so sign-in, uploads and banners can't work.</span></div>
  <ol class="fix-steps"><li>Stop that server: in VS Code click <b>Port: ${location.port || 5500}</b> in the bottom bar, or press <b>Ctrl+C</b> in the Python window.</li>
  <li>Double-click <b>start.bat</b> in the <b>cinema</b> folder and keep its black window open.</li>
  <li>Open <b>http://127.0.0.1:5500/#login</b>. The address must <b>not</b> contain <code>/cinema/</code>.</li></ol>` : `<span>This online preview has no server, so partner and admin sign-in are turned off. Run Lumen on your computer with <b>start.bat</b> to use them.</span></div>`}<a class="btn ghost" href="#home">${icon('back')}Back to movies</a>`);
}

/* ---------- sign in ---------- */
export function loginView(view, ctx, next = '') {
  const { db } = ctx;
  if (db.mode !== 'server') return needServer(view);
  if (db.me) { location.hash = next || home(db.me); return; }
  view.innerHTML = shell(L('Sign in', 'உள்நுழைக'), L('For theatre partners and Lumen staff. Same page for both.', 'திரையரங்கு பங்குதாரர்கள் மற்றும் Lumen பணியாளர்களுக்கு.'), `
    <form id="lf" novalidate>${field('lEmail', 'Email', 'email', 'autocomplete="username" inputmode="email"')}${pwField('lPw', L('Password', 'கடவுச்சொல்'), 'current-password')}
    <p class="err" id="lErr" role="alert"></p>
    <button class="btn primary wide" type="submit">${icon('lock')}${L('Sign in', 'உள்நுழைக')}</button></form>
    <div class="auth-links"><a href="#forgot">${L('Forgot password?', 'கடவுச்சொல் மறந்ததா?')}</a><a href="#register">${L('New theatre? Register', 'புதிய திரையரங்கா? பதிவு செய்')}</a></div>`);
  const f = $('#lf'); bindEyes(f);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#lEmail').value.trim(), pw = $('#lPw').value;
    let ok = setErr(f, 'lEmail', emailOk(email) ? '' : 'Enter your email.');
    ok = setErr(f, 'lPw', pw ? '' : 'Enter your password.') && ok;
    if (!ok) return;
    busy(f.querySelector('[type=submit]'), async () => {
      try { const u = await db.login(email, pw); toast(`Welcome, ${u.name}`); location.hash = next || home(u); }
      catch (err) {
        if (err.data?.code === 'unpaid') { try { sessionStorage.setItem('lumen.pay', JSON.stringify({ email: err.data.email, payToken: err.data.payToken })); } catch (x) {} location.hash = 'register-pay'; return; }
        $('#lErr').innerHTML = esc(err.message) + (err.data?.code === 'unverified' ? ` <a href="#register-verify-${encodeURIComponent(email)}">Enter code</a>` : '');
      }
    });
  });
  setTimeout(() => $('#lEmail')?.focus(), 30);
}

/* ---------- forgot password: email → code → new password ---------- */
export function forgotView(view, ctx) {
  const { db } = ctx;
  if (db.mode !== 'server') return needServer(view);
  let email = '';
  const step1 = () => {
    view.innerHTML = shell(L('Reset your password', 'கடவுச்சொல்லை மாற்று'), L('We will email you a 6-digit code.', '6 இலக்க குறியீட்டை மின்னஞ்சல் செய்வோம்.'), `
      <form id="ff" novalidate>${field('fEmail', 'Email', 'email', `autocomplete="username" inputmode="email" value="${esc(email)}"`)}<p class="err" id="fErr" role="alert"></p>
      <button class="btn primary wide" type="submit">${icon('mail')}${L('Send code', 'குறியீடு அனுப்பு')}</button></form>
      <div class="auth-links"><a href="#login">${icon('back')}${L('Back to sign in', 'உள்நுழைவுக்குத் திரும்பு')}</a></div>`);
    const f = $('#ff');
    f.addEventListener('submit', (e) => {
      e.preventDefault(); email = $('#fEmail').value.trim();
      if (!setErr(f, 'fEmail', emailOk(email) ? '' : 'Enter a valid email.')) return;
      busy(f.querySelector('[type=submit]'), async () => { try { const r = await db.sendOtp(email, 'reset'); step2(r.emailed); } catch (err) { $('#fErr').textContent = err.message; } });
    });
  };
  const step2 = (emailed) => {
    view.innerHTML = shell(L('Enter the code', 'குறியீட்டை உள்ளிடு'), `If an account exists for <b>${esc(email)}</b>, a code is on its way. It works for 10 minutes.${emailed === false ? '<br><small>(Email is not set up on this server yet: the code is printed in the server window.)</small>' : ''}`, `
      <form id="rf" novalidate>${field('rOtp', L('6-digit code', '6 இலக்க குறியீடு'), 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"')}
      ${pwField('rPw', L('New password', 'புதிய கடவுச்சொல்'), 'new-password')}<small class="muted">${pwHint()}</small>
      ${pwField('rPw2', L('Type it again', 'மீண்டும் உள்ளிடு'), 'new-password')}
      <p class="err" id="rErr" role="alert"></p><button class="btn primary wide" type="submit">${icon('check')}${L('Save new password', 'புதிய கடவுச்சொல்லைச் சேமி')}</button></form>
      <div class="auth-links"><button type="button" class="link" id="resend">${L('Send a new code', 'புதிய குறியீடு')}</button><a href="#login">${L('Back to sign in', 'உள்நுழைவு')}</a></div>`);
    const f = $('#rf'); bindEyes(f);
    $('#resend').addEventListener('click', (e) => busy(e.currentTarget, async () => { try { await db.sendOtp(email, 'reset'); toast('New code sent'); } catch (err) { $('#rErr').textContent = err.message; } }));
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const otp = $('#rOtp').value.trim(), pw = $('#rPw').value, pw2 = $('#rPw2').value;
      let ok = setErr(f, 'rOtp', /^\d{6}$/.test(otp) ? '' : 'Enter the 6-digit code.');
      ok = setErr(f, 'rPw', pwOk(pw) ? '' : pwHint()) && ok;
      ok = setErr(f, 'rPw2', pw === pw2 ? '' : 'The two passwords are different.') && ok;
      if (!ok) return;
      busy(f.querySelector('[type=submit]'), async () => { try { await db.reset(email, otp, pw); toast('Password changed. Please sign in.'); location.hash = 'login'; } catch (err) { $('#rErr').textContent = err.message; } });
    });
    setTimeout(() => $('#rOtp')?.focus(), 30);
  };
  step1();
}

/* ---------- partner registration ---------- */
export function registerView(view, ctx, verifyEmail = '') {
  const { db } = ctx;
  if (db.mode !== 'server') return needServer(view);
  const R = { name: '', email: '', phone: '', password: '', mode: 'existing', cityId: ctx.city(), cityName: '', state: '', geo: null, theatreId: '', tName: '', tArea: '', screens: [{ name: 'Screen 1', hall: 'multiplex', fmt: '2D' }] };
  const steps = (n) => `<ol class="steps">${['Your details', 'Your theatre', 'Verify email', 'Plan & payment'].map((s, i) => `<li class="${i < n ? 'done' : i === n ? 'on' : ''}"><b>${i + 1}</b>${s}</li>`).join('')}</ol>`;
  const s1 = () => {
    view.innerHTML = shell(L('Register your theatre', 'உங்கள் திரையரங்கைப் பதிவு செய்'), L('Sell tickets on Lumen with your real seat layout and 3D seat views.', ''), `${steps(0)}
      <form id="g1" novalidate>${field('gName', L('Your name', 'உங்கள் பெயர்'), 'text', `autocomplete="name" value="${esc(R.name)}"`)}
      ${field('gEmail', 'Work email', 'email', `autocomplete="email" inputmode="email" value="${esc(R.email)}"`)}
      ${field('gPhone', L('Mobile number', 'மொபைல் எண்'), 'tel', `inputmode="numeric" maxlength="10" autocomplete="tel-national" value="${esc(R.phone)}"`)}
      ${pwField('gPw', L('Create a password', 'கடவுச்சொல் உருவாக்கு'), 'new-password')}<small class="muted">${pwHint()}</small>
      <button class="btn primary wide" type="submit">${L('Next: your theatre', 'அடுத்து')}${icon('right')}</button></form>
      <div class="auth-links"><a href="#login">${L('Already registered? Sign in', 'ஏற்கனவே பதிவு செய்தீர்களா? உள்நுழை')}</a></div>`);
    const f = $('#g1'); bindEyes(f); $('#gPw').value = R.password;
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      Object.assign(R, { name: $('#gName').value.trim(), email: $('#gEmail').value.trim(), phone: $('#gPhone').value.replace(/\D/g, ''), password: $('#gPw').value });
      let ok = setErr(f, 'gName', R.name.length >= 2 ? '' : 'Enter your name.');
      ok = setErr(f, 'gEmail', emailOk(R.email) ? '' : 'Enter a valid email.') && ok;
      ok = setErr(f, 'gPhone', /^[6-9]\d{9}$/.test(R.phone) ? '' : 'Enter a 10-digit mobile number.') && ok;
      ok = setErr(f, 'gPw', pwOk(R.password) ? '' : pwHint()) && ok;
      if (ok) s2();
    });
  };
  const s2 = () => {
    if (R.cityId === '__other') R.mode = 'new';
    const ths = R.cityId === '__other' ? [] : theatresFor(R.cityId, { all: true });
    const hallOpts = (v) => Object.keys(HALLS).map((k) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(tx(HALLS[k]))}</option>`).join('');
    view.innerHTML = shell(L('Your theatre', 'உங்கள் திரையரங்கு'), '', `${steps(1)}
      <form id="g2" novalidate>
      <label class="field"><span>City</span><select class="input" id="gCity">${CITIES.map((c) => `<option value="${c.id}" ${c.id === R.cityId ? 'selected' : ''}>${esc(tx(c))}</option>`).join('')}<option value="__other" ${R.cityId === '__other' ? 'selected' : ''}>My city is not in this list</option></select></label>
      ${R.cityId === '__other' ? `<div class="af-grid">${field('gCityName', 'City / town', 'text', `value="${esc(R.cityName)}"`)}${field('gState', 'State', 'text', `value="${esc(R.state)}"`)}</div>` : ''}
      ${R.cityId === '__other' ? '' : `<div class="seg wide" role="group"><button type="button" data-mode="existing" aria-pressed="${R.mode === 'existing'}">Already on Lumen</button><button type="button" data-mode="new" aria-pressed="${R.mode === 'new'}">New theatre</button></div>`}
      ${R.mode === 'existing' ? `<label class="field"><span>Pick your theatre</span><select class="input" id="gTh"><option value="">Choose…</option>${ths.map((t) => `<option value="${t.id}" ${t.id === R.theatreId ? 'selected' : ''}>${esc(t.name)} · ${esc(t.area)}</option>`).join('')}</select><small class="err" data-for="gTh"></small></label>
        <p class="muted small">Lumen checks that you run this theatre before giving you access.</p>`
      : `${field('gTName', 'Theatre name', 'text', `value="${esc(R.tName)}"`)}${field('gTArea', 'Area / locality', 'text', `value="${esc(R.tArea)}"`)}
        <div class="field"><span>Screens</span><div id="gScreens">${R.screens.map((s, i) => `<div class="scr-row" data-i="${i}"><input class="input" data-k="name" value="${esc(s.name)}" aria-label="Screen name"><select class="input" data-k="hall" aria-label="Hall shape">${hallOpts(s.hall)}</select><input class="input" data-k="fmt" value="${esc(s.fmt)}" aria-label="Format" placeholder="2D / IMAX / 4DX"><button type="button" class="iconbtn" data-rm="${i}" aria-label="Remove screen" ${R.screens.length < 2 ? 'disabled' : ''}>${icon('trash')}</button></div>`).join('')}</div>
        <button type="button" class="btn ghost sm" id="gAdd" ${R.screens.length >= 8 ? 'disabled' : ''}>${icon('plus')}Add screen</button>
        <button type="button" class="loc-btn wide" id="gGeo">${icon('locate')}<span><b>${R.geo ? 'Location saved ✓' : 'I am at the theatre: use my location'}</b><small>${R.geo ? `${R.geo.lat.toFixed(4)}, ${R.geo.lng.toFixed(4)}` : 'Helps customers find you and see the distance'}</small></span></button><small class="muted">You can draw the exact seat layout of each screen after approval.</small><small class="err" data-for="gScreens"></small></div>`}
      <p class="err" id="gErr" role="alert"></p>
      <div class="row-btns"><button type="button" class="btn ghost" id="gBack">${icon('back')}Back</button><button class="btn primary" type="submit">${icon('mail')}Create account & send code</button></div></form>`);
    const f = $('#g2');
    const readScreens = () => { R.screens = [...f.querySelectorAll('.scr-row')].map((r) => ({ name: r.querySelector('[data-k=name]').value.trim() || 'Screen', hall: r.querySelector('[data-k=hall]').value, fmt: r.querySelector('[data-k=fmt]').value.trim() || '2D' })); };
    const keep = () => { if (R.cityId === '__other') { R.cityName = $('#gCityName').value.trim(); R.state = $('#gState').value.trim(); } if (R.mode === 'new') { R.tName = $('#gTName').value.trim(); R.tArea = $('#gTArea').value.trim(); readScreens(); } else R.theatreId = $('#gTh').value; };
    $('#gGeo')?.addEventListener('click', () => {
      if (!navigator.geolocation) { toast('Location is not available on this device.'); return; }
      navigator.geolocation.getCurrentPosition((p) => { keep(); R.geo = { lat: p.coords.latitude, lng: p.coords.longitude }; s2(); }, () => toast('Could not get your location. You can skip this.'), { timeout: 10000 });
    });
    $('#gCity').addEventListener('change', (e) => { keep(); R.cityId = e.target.value; R.theatreId = ''; s2(); });
    f.querySelector('.seg')?.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; keep(); R.mode = b.dataset.mode; s2(); });
    $('#gAdd')?.addEventListener('click', () => { keep(); R.screens.push({ name: `Screen ${R.screens.length + 1}`, hall: 'multiplex', fmt: '2D' }); s2(); });
    f.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; keep(); R.screens.splice(+b.dataset.rm, 1); s2(); });
    $('#gBack').addEventListener('click', () => { keep(); s1(); });
    f.addEventListener('submit', (e) => {
      e.preventDefault(); keep();
      let ok = true;
      if (R.mode === 'existing') ok = setErr(f, 'gTh', R.theatreId ? '' : 'Pick your theatre.');
      else {
        if (R.cityId === '__other') { ok = setErr(f, 'gCityName', R.cityName.length >= 2 ? '' : 'Enter your city.') && ok; ok = setErr(f, 'gState', R.state.length >= 2 ? '' : 'Enter your state.') && ok; }
        ok = setErr(f, 'gTName', R.tName.length >= 3 ? '' : 'Enter the theatre name.') && ok;
        ok = setErr(f, 'gTArea', R.tArea.length >= 2 ? '' : 'Enter the area.') && ok;
      }
      if (!ok) return;
      const theatre = R.mode === 'existing' ? { mode: 'existing', theatreId: R.theatreId } : { mode: 'new', ...(R.cityId === '__other' ? { cityName: R.cityName, state: R.state } : { cityId: R.cityId }), name: R.tName, area: R.tArea, screens: R.screens, lat: R.geo?.lat, lng: R.geo?.lng };
      busy(f.querySelector('[type=submit]'), async () => {
        try { const r = await db.register({ name: R.name, email: R.email, phone: R.phone, password: R.password, theatre }); s3(R.email, r.emailed); }
        catch (err) { $('#gErr').textContent = err.message; }
      });
    });
  };
  const s3 = (email, emailed) => {
    view.innerHTML = shell(L('Check your email', 'மின்னஞ்சலைப் பாருங்கள்'), `We sent a 6-digit code to <b>${esc(email)}</b>.${emailed === false ? '<br><small>(Email is not set up on this server yet: the code is printed in the server window.)</small>' : ''}`, `${steps(2)}
      <form id="g3" novalidate>${field('gOtp', L('6-digit code', '6 இலக்க குறியீடு'), 'text', 'inputmode="numeric" autocomplete="one-time-code" maxlength="6"')}<p class="err" id="g3Err" role="alert"></p>
      <button class="btn primary wide" type="submit">${icon('check')}Verify email</button></form>
      <div class="auth-links"><button type="button" class="link" id="gResend">Send a new code</button></div>`);
    const f = $('#g3');
    $('#gResend').addEventListener('click', (e) => busy(e.currentTarget, async () => { try { await db.sendOtp(email, 'verify'); toast('New code sent'); } catch (err) { $('#g3Err').textContent = err.message; } }));
    f.addEventListener('submit', (e) => {
      e.preventDefault(); const otp = $('#gOtp').value.trim();
      if (!setErr(f, 'gOtp', /^\d{6}$/.test(otp) ? '' : 'Enter the 6-digit code.')) return;
      busy(f.querySelector('[type=submit]'), async () => {
        try {
          const r = await db.verify(email, otp);
          s4(email, r.payToken);
        } catch (err) { $('#g3Err').textContent = err.message; }
      });
    });
    setTimeout(() => $('#gOtp')?.focus(), 30);
  };
  // Step 4: choose a plan and pay. Then Lumen reviews the theatre.
  const s4 = async (email, payToken) => {
    let plans;
    try { plans = await db.plans(); } catch (e) { view.innerHTML = shell('Could not load plans', esc(e.message), `<a class="btn primary wide" href="#register-pay">Try again</a>`); return; }
    let chosen = 'yearly';
    try { sessionStorage.setItem('lumen.pay', JSON.stringify({ email, payToken })); } catch (e) {}
    view.innerHTML = shell(L('Start free, pay later', 'இலவசமாகத் தொடங்குங்கள்'), L('Your email is verified.', ''), `${steps(3)}
      ${plans.trialDays ? `<div class="trial-box">${icon('spark')}<div><b>${plans.trialDays} days free</b><span>No payment now. Your trial starts when Lumen approves your theatre. Choose a plan any time before it ends.</span></div></div>
      <button type="button" class="btn primary wide" id="g4Trial">${icon('check')}Start my ${plans.trialDays}-day free trial</button>
      <p class="or"><span>or pay now</span></p>` : ''}
      ${planCards(plans, chosen)}<p class="err" id="g4Err" role="alert"></p>
      <button type="button" class="btn ${plans.trialDays ? 'ghost' : 'primary'} wide" id="g4Pay"></button>
      <p class="muted small center">You pay once now. Lumen then checks your theatre (usually within one working day) and emails you.</p>`);
    const label = () => { const pl = plans[chosen]; $('#g4Pay').innerHTML = `${icon('lock')}Pay ${rupees(pl.amount)} · ${pl.label}`; };
    bindPlanCards(view, (p) => { chosen = p; label(); }); label();
    $('#g4Trial')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      try {
        await db.startTrial(payToken);
        try { sessionStorage.removeItem('lumen.pay'); } catch (x) {}
        view.innerHTML = shell(L('You’re registered', 'பதிவு முடிந்தது'), '', `${steps(4)}<div class="notice ok">${icon('check')}<span><b>Free trial booked.</b> Your ${plans.trialDays} free days start when Lumen approves your theatre.</span></div>
          <div class="notice">${icon('clock')}<span>A Lumen admin will check your theatre, usually within one working day. We will email <b>${esc(email)}</b> when it’s approved, then you can sign in.</span></div><a class="btn primary wide" href="#home">Back to Lumen</a>`);
      } catch (err) { $('#g4Err').textContent = err.message; }
    }));
    $('#g4Pay').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      try {
        const r = await payPlan(db, chosen, payToken);
        try { sessionStorage.removeItem('lumen.pay'); } catch (x) {}
        const ok = r.status === 'active';
        view.innerHTML = shell(L('Payment received', 'பணம் பெறப்பட்டது'), '', `${steps(4)}<div class="notice ok">${icon('check')}<span><b>${rupees(plans[chosen].amount)} paid</b> · ${plans[chosen].label} plan, valid until ${fmtDay(r.sub.until)}. A receipt was sent to <b>${esc(email)}</b>.</span></div>
          <div class="notice">${icon('clock')}<span>${ok ? 'Your account is active. Sign in to set up your shows.' : 'A Lumen admin will now check your theatre, usually within one working day. We will email you when it’s approved, then you can sign in.'}</span></div>
          <a class="btn primary wide" href="${ok ? '#login' : '#home'}">${ok ? 'Sign in' : 'Back to Lumen'}</a>`);
      } catch (err) { $('#g4Err').textContent = err.message; }
    }));
  };
  if (verifyEmail === '@pay') {
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('lumen.pay') || 'null'); } catch (e) {}
    if (saved && saved.payToken) s4(saved.email, saved.payToken); else { toast('Sign in to finish your payment.'); location.hash = 'login'; }
    return;
  }
  if (verifyEmail) s3(verifyEmail, null); else s1();
}

/* ---------- gate for panels ---------- */
// Returns the signed-in user when they may open this panel; otherwise shows the right message.
export function gate(view, ctx, role, back) {
  const { db } = ctx;
  if (db.mode !== 'server') { needServer(view); return null; }
  const u = db.me;
  if (!u) { location.replace('#login-' + encodeURIComponent(back)); return null; }
  if (u.role === 'customer') {
    view.innerHTML = shell('This page is for theatres and Lumen staff', `You are signed in with your mobile number (${esc(u.phone)}). Sign out first, then sign in with a partner email.`, `<a class="btn primary wide" href="#home">Back to movies</a>`);
    return null;
  }
  if (role === 'admin' && u.role !== 'admin') {
    view.innerHTML = shell('This page is for Lumen admins', `You are signed in as ${esc(u.email)} (theatre partner).`, `<a class="btn primary wide" href="#partner">Open Lumen Business</a>`);
    return null;
  }
  return u;
}

/* ---------- account sheet ---------- */
export function openAccount(ctx) {
  const { db } = ctx; const u = db.me; if (!u) { location.hash = 'login'; return; }
  ctx.openSheet(`<h2 class="sh-t">${icon('user')}${esc(u.name)}</h2><p class="muted">${esc(u.email)} · ${u.role === 'admin' ? 'Lumen admin' : 'Theatre partner'}</p>
    <div class="acct-links"><a class="btn ghost" href="${home(u)}">${icon('grid')}${u.role === 'admin' ? 'Admin console' : 'Lumen Business'}</a>${u.role === 'admin' ? `<a class="btn ghost" href="#partner">${icon('ticket')}Lumen Business</a>` : ''}</div>
    <form id="cp" novalidate><h3>Change password</h3>${pwField('cpCur', 'Current password', 'current-password')}${pwField('cpNew', 'New password', 'new-password')}<small class="muted">${pwHint()}</small>
    <p class="err" id="cpErr" role="alert"></p><button class="btn ghost" type="submit">${icon('lock')}Change password</button></form>
    <button type="button" class="btn danger wide" id="logout">${icon('logout')}Sign out</button>`, (sh) => {
    const f = sh.querySelector('#cp'); bindEyes(f);
    f.addEventListener('submit', (e) => {
      e.preventDefault(); const cur = f.querySelector('#cpCur').value, pw = f.querySelector('#cpNew').value;
      if (!setErr(f, 'cpNew', pwOk(pw) ? '' : pwHint())) return;
      busy(f.querySelector('[type=submit]'), async () => { try { await db.changePassword(cur, pw); toast('Password changed'); ctx.closeSheet(); } catch (err) { f.querySelector('#cpErr').textContent = err.message; } });
    });
    sh.querySelector('#logout').addEventListener('click', async () => { await db.logout(); ctx.closeSheet(); toast('Signed out'); location.hash = 'home'; ctx.route(); });
  });
}
