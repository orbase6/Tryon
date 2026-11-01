// Customer sign-in (mobile OTP), customer account, ticket invoice, contact form and policy pages.
import { CITIES, LIVE, SNACKS, CONV_FEE, GST, theatreById, showById, movieById, fromKey, hmLabel } from './data.js';
import { layoutOf, pricesOf } from './layout.js';
import { icon, esc, $, toast, state, clsName, fmtDate, tx } from './ui.js';

const L = (en, ta) => (state.lang === 'ta' && ta ? ta : en);
const money = (v) => '₹' + (Math.round(v * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const company = () => LIVE.contact?.company || 'Lumen Cinemas';

/* ---------- customer sign in with mobile OTP ---------- */
export function customerSignIn(ctx, after) {
  const { db } = ctx;
  if (db.mode !== 'server') { toast(L('Sign-in works on the live Lumen site.', 'உள்நுழைவு நேரடி தளத்தில் மட்டும்.')); return; }
  let phone = '';
  const step1 = () => ctx.openSheet(`<h2 class="sh-t">${icon('user')}${L('Sign in with your mobile', 'மொபைல் மூலம் உள்நுழைக')}</h2>
    <p class="muted">${L('Your tickets stay with you on every phone and computer.', 'உங்கள் டிக்கெட்டுகள் எல்லா சாதனத்திலும் கிடைக்கும்.')}</p>
    <form id="poF" class="snacks" novalidate><div class="field"><label for="poPh">${L('Mobile number', 'மொபைல் எண்')}</label><div class="phone"><span>+91</span><input id="poPh" class="input" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="${esc(phone || db.state.me?.phone || '')}"></div></div>
    <p class="err" id="poErr" role="alert"></p><button type="submit" class="btn primary block">${L('Send code', 'குறியீடு அனுப்பு')}</button></form>
    <p class="muted small center">${L('Theatre partner or Lumen staff?', 'திரையரங்கு பங்குதாரரா?')} <a class="link" href="#login">${L('Sign in here', 'இங்கே உள்நுழைக')}</a></p>`, (sh) => {
    sh.querySelector('#poF').addEventListener('submit', async (e) => {
      e.preventDefault(); phone = sh.querySelector('#poPh').value.replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(phone)) { sh.querySelector('#poErr').textContent = L('Enter a 10-digit mobile number.', '10 இலக்க எண்ணை உள்ளிடுங்கள்.'); return; }
      const b = sh.querySelector('[type=submit]'); b.disabled = true;
      try { const r = await db.phoneOtp(phone); step2(r); } catch (err) { sh.querySelector('#poErr').textContent = err.message; b.disabled = false; }
    });
  });
  const step2 = (r) => ctx.openSheet(`<h2 class="sh-t">${icon('lock')}${L('Enter the code', 'குறியீட்டை உள்ளிடுங்கள்')}</h2>
    <p class="muted">${L(`We sent a 6-digit code to +91 ${phone}${r.via === 'whatsapp' ? ' on WhatsApp' : ''}.`, `+91 ${phone} க்கு குறியீடு அனுப்பினோம்.`)}${r.sent ? '' : '<br><small>(SMS is not set up on this server yet: the code is printed in the server window.)</small>'}</p>
    <form id="pvF" class="snacks" novalidate><div class="field"><label for="pvOtp">${L('6-digit code', '6 இலக்க குறியீடு')}</label><input id="pvOtp" class="input otp-in" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <div class="field"><label for="pvName">${L('Your name (optional)', 'உங்கள் பெயர்')}</label><input id="pvName" class="input" autocomplete="name"></div>
    <p class="err" id="pvErr" role="alert"></p><button type="submit" class="btn primary block">${L('Sign in', 'உள்நுழைக')}</button></form>
    <button type="button" class="link" id="pvBack">${icon('back')}${L('Change number', 'எண்ணை மாற்று')}</button>`, (sh) => {
    sh.querySelector('#pvBack').addEventListener('click', step1);
    sh.querySelector('#pvF').addEventListener('submit', async (e) => {
      e.preventDefault(); const otp = sh.querySelector('#pvOtp').value.trim();
      if (!/^\d{6}$/.test(otp)) { sh.querySelector('#pvErr').textContent = L('Enter the 6-digit code.', '6 இலக்க குறியீட்டை உள்ளிடுங்கள்.'); return; }
      const b = sh.querySelector('[type=submit]'); b.disabled = true;
      try {
        const u = await db.phoneLogin(phone, otp, sh.querySelector('#pvName').value.trim(), ctx.contactEmail?.() || '');
        ctx.closeSheet(); toast(L(`Signed in${u.name ? ' as ' + u.name : ''}. Your tickets are saved to your account.`, 'உள்நுழைந்தீர்கள்.')); after ? after(u) : ctx.route();
      } catch (err) { sh.querySelector('#pvErr').textContent = err.message; b.disabled = false; }
    });
    setTimeout(() => sh.querySelector('#pvOtp')?.focus(), 30);
  });
  step1();
}
export function customerAccount(ctx) {
  const { db } = ctx; const u = db.me;
  ctx.openSheet(`<h2 class="sh-t">${icon('user')}${esc(u.name || L('My account', 'என் கணக்கு'))}</h2><p class="muted">+91 ${esc(u.phone)}</p>
    <form id="caF" class="snacks" novalidate><div class="field"><label for="caN">${L('Name', 'பெயர்')}</label><input id="caN" class="input" value="${esc(u.name || '')}" autocomplete="name"></div>
    <div class="field"><label for="caE">${L('Email for tickets', 'டிக்கெட் மின்னஞ்சல்')}</label><input id="caE" class="input" type="email" value="${esc(u.email || '')}" autocomplete="email"></div>
    <p class="err" id="caErr"></p><button type="submit" class="btn ghost block">${icon('check')}${L('Save', 'சேமி')}</button></form>
    <div class="acct-links"><a class="btn ghost" href="#tickets">${icon('ticket')}${L('My tickets', 'என் டிக்கெட்டுகள்')}</a><a class="btn ghost" href="#contact">${icon('mail')}${L('Help & contact', 'உதவி')}</a></div>
    <button type="button" class="btn danger wide" id="caOut">${icon('logout')}${L('Sign out', 'வெளியேறு')}</button>`, (sh) => {
    sh.querySelector('#caF').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await db.profile({ name: sh.querySelector('#caN').value, email: sh.querySelector('#caE').value }); toast(L('Saved', 'சேமிக்கப்பட்டது')); ctx.closeSheet(); }
      catch (err) { sh.querySelector('#caErr').textContent = err.message; }
    });
    sh.querySelector('#caOut').addEventListener('click', async () => { await db.logout(); ctx.closeSheet(); toast(L('Signed out', 'வெளியேறினீர்கள்')); ctx.route(); });
  });
}

/* ---------- invoice ---------- */
// Cinema tickets: 12% GST up to ₹100 a ticket, 18% above. Food in cinemas: 5%. Ticket prices already include GST.
const ticketRate = (price) => (price > 100 ? 18 : 12);
function splitTax(gross, rate) { const taxable = gross / (1 + rate / 100); const tax = gross - taxable; return { taxable, cgst: tax / 2, sgst: tax / 2 }; }
export function invoiceView(view, b) {
  const show = showById(b.showId), th = theatreById(b.theatreId || show?.theatreId);
  if (!th) { view.innerHTML = `<p class="empty">${L('This invoice is not available.', 'இந்த விலைப்பட்டியல் கிடைக்கவில்லை.')}</p>`; return; }
  const m = show ? movieById(show.movieId) : null;
  const kyc = LIVE.kyc[th.id];
  const lines = [];
  if (show) {
    const lay = layoutOf(show), pr = pricesOf(show), byCls = {};
    for (const id of b.seats) { const c = lay.byId.get(id)?.cls; if (c) (byCls[c] ||= []).push(id); }
    const sum = Object.entries(byCls).reduce((a, [c, ids]) => a + (pr[c] || 0) * ids.length, 0);
    if (Math.abs(sum - (b.ticketAmount || 0)) < 1) for (const [c, ids] of Object.entries(byCls)) lines.push({ label: `${clsName(c)} ticket`, sub: ids.join(', '), qty: ids.length, unit: pr[c], gross: pr[c] * ids.length, rate: ticketRate(pr[c]) });
  }
  if (!lines.length) { const per = (b.ticketAmount || 0) / Math.max(1, b.seats?.length || 1); lines.push({ label: 'Movie tickets', sub: (b.seats || []).join(', '), qty: b.seats?.length || 1, unit: per, gross: b.ticketAmount || 0, rate: ticketRate(per) }); }
  for (const [k, n] of Object.entries(b.snacks || {})) { const sn = SNACKS.find((x) => x.id === k); if (sn && n) lines.push({ label: sn.en, sub: 'Food & beverages', qty: n, unit: sn.price, gross: sn.price * n, rate: 5 }); }
  const rows = lines.map((l) => ({ ...l, ...splitTax(l.gross, l.rate) }));
  const tot = rows.reduce((a, r) => ({ gross: a.gross + r.gross, taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst }), { gross: 0, taxable: 0, cgst: 0, sgst: 0 });
  const refund = b.cancelled ? b.refund || 0 : 0;
  const fees = b.fees || 0, feeGst = GST ? fees - fees / (1 + GST) : 0, disc = b.discount || 0;
  const city = CITIES.find((c) => c.id === th.cityId);
  view.innerHTML = `<div class="topbar no-print"><a class="iconbtn" href="#ticket-${b.id}" aria-label="Back">${icon('back')}</a><div class="sb-t"><b>${L('Invoice', 'விலைப்பட்டியல்')}</b><small>${esc(b.id)}</small></div><button type="button" class="btn primary sm" id="invPrint">${icon('ticket')}${L('Print / Save as PDF', 'அச்சிடு')}</button></div>
    <article class="invoice">
      <header><div><h1>Tax invoice</h1><p class="muted">For movie tickets${rows.some((r) => r.rate === 5) ? ' and food' : ''}</p></div><div class="inv-meta"><span>Invoice no. <b>${esc(th.id.toUpperCase())}-${esc(b.id)}</b></span><span>Date <b>${new Date(b.at).toLocaleDateString('en-IN')}</b></span><span>Place of supply <b>${esc(city?.state || tx(city || { en: '' }) || '')}</b></span></div></header>
      <div class="inv-parties"><div><small>Seller (the theatre)</small><b>${esc(kyc?.legal || th.name)}</b><span>${esc(th.name)}, ${esc(th.area)}, ${esc(city ? city.en : '')}</span><span>GSTIN: <b>${esc(kyc?.gstin || 'not provided by the theatre yet')}</b></span></div>
        <div><small>Customer</small><b>${esc(b.contact?.email || '')}</b><span>${b.contact?.phone ? '+91 ' + esc(b.contact.phone) : ''}</span></div></div>
      ${m ? `<p class="inv-show"><b>${esc(m.title)}</b> · ${esc(show.lang)} · ${esc(show.fmt)} · ${fmtDate(fromKey(show.dk))} ${hmLabel(show.hm)} · ${esc(th.screens[show.screenIdx]?.name || '')}</p>` : ''}
      <div class="tbl-wrap"><table class="tbl inv-tbl"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Taxable value</th><th>GST</th><th>CGST</th><th>SGST</th><th>Amount</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.label)}<small>${esc(r.sub)}</small></td><td>${r.qty}</td><td>${money(r.unit)}</td><td>${money(r.taxable)}</td><td>${r.rate}%</td><td>${money(r.cgst)}</td><td>${money(r.sgst)}</td><td><b>${money(r.gross)}</b></td></tr>`).join('')}
        <tr class="inv-tot"><td colspan="3">Total</td><td>${money(tot.taxable)}</td><td></td><td>${money(tot.cgst)}</td><td>${money(tot.sgst)}</td><td><b>${money(tot.gross)}</b></td></tr>
        ${refund ? `<tr><td colspan="7">Refunded on cancellation</td><td>− ${money(refund)}</td></tr>` : ''}</tbody></table></div>
      <p class="inv-note">Prices include GST. CGST and SGST are shown for supply within the state.${kyc ? '' : ' The theatre has not finished its GST details on Lumen yet; ask the theatre for a GST invoice if you need one.'}</p>
      <section class="inv-fee"><h2>Booking fee receipt · ${esc(company())}</h2>
        <table class="sum"><tbody><tr><td>Booking fee (${b.qty || b.seats?.length || 1} × ${money(CONV_FEE)})</td><td>${money(fees - feeGst)}</td></tr>${feeGst ? `<tr><td>GST on booking fee</td><td>${money(feeGst)}</td></tr>` : ''}${disc ? `<tr><td>Offer${b.offer ? ' ' + esc(b.offer) : ''}</td><td>− ${money(disc)}</td></tr>` : ''}${b.donate ? `<tr><td>Donation</td><td>${money(b.qty || 0)}</td></tr>` : ''}</tbody></table>
        <p class="inv-note">${feeGst ? '' : `${esc(company())} is not registered for GST, so no GST is charged on the booking fee. `}Booking fees are not refunded on cancellation.</p></section>
      <footer class="inv-foot"><span>Total paid: <b>${money(b.total || 0)}</b> by ${esc(b.method || '')}</span><span>Booking ${esc(b.id)} · Issued through Lumen on behalf of the theatre for the tickets and food.</span></footer>
    </article>`;
  $('#invPrint').addEventListener('click', () => window.print());
}

/* ---------- contact ---------- */
export function contactView(view, ctx, bookings) {
  const { db } = ctx; const c = LIVE.contact || {}, me = db.me;
  view.innerHTML = `<div class="topbar"><a class="iconbtn" href="#home" aria-label="Back">${icon('back')}</a><h1 class="tb-t">${L('Help & contact', 'உதவி & தொடர்பு')}</h1></div>
    <div class="pt-cols"><section class="panel"><h2>${L('Send us a message', 'எங்களுக்கு எழுதுங்கள்')}</h2>
      <form id="ctF" class="pt-form" novalidate>
        <div class="af-grid"><label class="af"><span>${L('Name', 'பெயர்')}</span><input class="input" name="name" autocomplete="name" value="${esc(me?.name || '')}"></label><label class="af"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(me?.email || ctx.contactEmail?.() || '')}"></label></div>
        <div class="af-grid"><label class="af"><span>${L('Mobile (optional)', 'மொபைல்')}</span><input class="input" name="phone" inputmode="numeric" maxlength="10" value="${esc(me?.phone || '')}"></label>
          <label class="af"><span>${L('About', 'எதைப் பற்றி')}</span><span class="dd"><select name="topic"><option>Booking or ticket</option><option>Refund</option><option>Theatre partner</option><option>Website or app problem</option><option>Other</option></select></span></label></div>
        ${bookings.length ? `<label class="af"><span>${L('Booking (optional)', 'பதிவு')}</span><span class="dd"><select name="bookingId"><option value="">—</option>${bookings.slice(0, 20).map((b) => `<option>${esc(b.id)}</option>`).join('')}</select></span></label>` : ''}
        <label class="af"><span>${L('Message', 'செய்தி')}</span><textarea class="input" name="message" rows="5" style="padding:10px 12px"></textarea></label>
        <p class="err" id="ctErr"></p><button type="submit" class="btn primary">${icon('send')}${L('Send', 'அனுப்பு')}</button></form></section>
      <section class="panel"><h2>${L('Other ways to reach us', 'மற்ற வழிகள்')}</h2>
        ${c.email ? `<p>${icon('mail')} <a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}${c.phone ? `<p>${icon('mic')} ${esc(c.phone)}</p>` : ''}${c.address ? `<p class="muted">${esc(c.address)}</p>` : ''}
        <p class="muted">${L('We usually reply within one working day. For a refund, include your booking ID.', 'பொதுவாக ஒரு வேலை நாளில் பதில்.')}</p>
        <p><a class="link" href="#refunds">Cancellation & refund policy</a> · <a class="link" href="#terms">Terms</a> · <a class="link" href="#privacy">Privacy</a></p></section></div>`;
  $('#ctF').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target).entries());
    if (db.mode !== 'server') { $('#ctErr').textContent = 'Messages work on the live Lumen site.'; return; }
    try { await db.contact(f); e.target.innerHTML = `<div class="notice ok">${icon('check')}<span>${L('Thanks! We got your message and emailed you a copy. We will reply soon.', 'நன்றி! உங்கள் செய்தி கிடைத்தது.')}</span></div>`; }
    catch (err) { $('#ctErr').textContent = err.message; }
  });
}

/* ---------- policies ---------- */
export function policyView(view, kind) {
  const co = company(), mail = LIVE.contact?.email || 'our contact page';
  const P = {
    refunds: ['Cancellation & refund policy', [
      ['Movie tickets', 'You can cancel online up to 1 hour before the show starts, from My tickets. You get 75% of the ticket price back. In the last hour before the show, tickets cannot be cancelled.'],
      ['Food & beverages', 'Food ordered with a ticket is refunded in full when the ticket is cancelled in time.'],
      ['Booking fee', 'The booking fee is not refunded, except when the show is cancelled by the theatre.'],
      ['Shows cancelled by the theatre', 'If the theatre cancels a show, you get the full amount back, including the booking fee.'],
      ['How refunds reach you', 'Refunds go back to the payment method you used, usually within 5–7 working days.'],
      ['Events and rentals', 'Event tickets and movie rentals cannot be cancelled unless the organiser cancels the event.'],
    ]],
    terms: ['Terms of use', [
      ['Who we are', `${co} runs this website and app. We sell tickets on behalf of theatres; the theatre runs the show and is the seller of the tickets.`],
      ['Your booking', 'A booking is confirmed only when you see the booking ID and QR code. Show it at the entrance. Seats are held for a few minutes while you pay.'],
      ['Prices', 'Ticket prices are set by each theatre and include GST. The booking fee is shown before you pay.'],
      ['Seat views', 'The 3D seat view and view score are guides made from the theatre’s layout. The real view can differ a little.'],
      ['Cancellations', 'See the Cancellation & refund policy.'],
      ['Theatre partners', 'Theatres pay a plan fee (monthly or yearly, after a free trial) and a 0.5% commission on ticket sales. Plans renew only when the theatre pays again.'],
      ['Contact', `Questions: ${mail}.`],
    ]],
    privacy: ['Privacy policy', [
      ['What we collect', 'Your mobile number and email (for tickets and sign-in), your bookings, and, if you allow it, your location to show nearby theatres. We do not store card or UPI details; payments are handled by our payment partner.'],
      ['How we use it', 'To send your tickets by email and WhatsApp, to sign you in, to give refunds and to answer your messages. We share your booking details with the theatre you booked at.'],
      ['What we do not do', 'We do not sell your personal data.'],
      ['How long we keep it', 'Bookings are kept as long as the law requires for tax records. You can ask us to delete your account.'],
      ['Your rights', `You can ask to see, correct or delete your data by writing to ${mail}.`],
    ]],
  }[kind];
  view.innerHTML = `<div class="topbar"><a class="iconbtn" href="#home" aria-label="Back">${icon('back')}</a><h1 class="tb-t">${P[0]}</h1></div>
    <article class="policy">${P[1].map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('')}<p class="muted small">Last updated ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
    <p><a class="link" href="#refunds">Refunds</a> · <a class="link" href="#terms">Terms</a> · <a class="link" href="#privacy">Privacy</a> · <a class="link" href="#contact">Contact</a></p></article>`;
}
