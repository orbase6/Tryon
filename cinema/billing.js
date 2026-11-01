// Partner plans: plan cards, payment (Razorpay when the server has keys, otherwise a marked demo),
// receipts. Used by registration, sign-in (unpaid accounts) and the partner panel.
import { icon, esc, toast } from './ui.js';

const rupees = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
export const fmtDay = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function planCards(p, chosen = 'yearly') {
  const per = Math.round(p.yearly.amount / 12);
  return `<div class="plans" role="radiogroup" aria-label="Plan">
    <button type="button" class="plan" role="radio" data-plan="monthly" aria-checked="${chosen === 'monthly'}">
      <span class="plan-n">Monthly</span><span class="plan-p"><b>${rupees(p.monthly.amount)}</b><small>/ month</small></span>
      <span class="plan-s">Pay every month. Stop any time.</span></button>
    <button type="button" class="plan" role="radio" data-plan="yearly" aria-checked="${chosen === 'yearly'}">
      ${p.yearly.offPct ? `<span class="plan-tag">Save ${rupees(p.yearly.save)} · ${p.yearly.offPct}% off</span>` : ''}
      <span class="plan-n">Yearly</span><span class="plan-p">${p.yearly.save ? `<s>${rupees(p.yearly.list)}</s>` : ''}<b>${rupees(p.yearly.amount)}</b><small>/ year</small></span>
      <span class="plan-s">About ${rupees(per)} a month.</span></button>
  </div>
  <ul class="plan-inc">${['Sell tickets for all your screens', 'Your real seat layout with 3D seat views', 'Shows, prices, photos and banners', 'Weekly payouts to your bank'].map((x) => `<li>${icon('check')}${x}</li>`).join('')}</ul>
  ${p.gateway === 'demo' ? `<p class="notice demo-pay">${icon('bell')}<span><b>Demo payment.</b> No money is taken. Real UPI / card payments switch on when Lumen adds its Razorpay keys.</span></p>` : ''}`;
}
export function bindPlanCards(root, onPick) {
  root.querySelector('.plans').addEventListener('click', (e) => {
    const b = e.target.closest('[data-plan]'); if (!b) return;
    root.querySelectorAll('.plan').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    onPick(b.dataset.plan);
  });
}

let rzpLoading = null;
const loadRzp = () => (rzpLoading ||= new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = res; s.onerror = () => { rzpLoading = null; rej(new Error('Could not open the payment window. Check your internet and try again.')); };
  document.head.appendChild(s);
}));

// Starts and finishes one payment. Resolves with { sub } when paid; rejects with a readable error.
export async function payPlan(db, plan, payToken = null) {
  const o = await db.payOrder(plan, payToken);
  if (o.gateway === 'razorpay') {
    await loadRzp();
    const r = await new Promise((resolve, reject) => {
      const rz = new window.Razorpay({
        key: o.key, order_id: o.orderId, amount: o.amount * 100, currency: 'INR', name: 'Lumen Cinemas', description: `${o.plan.label} partner plan`,
        prefill: { name: o.name, email: o.email, contact: o.phone }, theme: { color: '#ffc72c' },
        handler: resolve, modal: { ondismiss: () => reject(new Error('Payment cancelled. You can try again.')) },
      });
      rz.on('payment.failed', (e) => reject(new Error(e.error?.description || 'Payment failed. Try another method.')));
      rz.open();
    });
    return db.payVerify({ payId: o.payId, payToken, ...r });
  }
  return db.payVerify({ payId: o.payId, payToken, demo: true });
}

export function receiptsTable(payments) {
  if (!payments.length) return '<p class="empty">No payments yet.</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Receipt</th><th>Plan</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead><tbody>
    ${payments.map((x) => `<tr><td>${fmtDay(x.paidAt || x.createdAt)}</td><td class="mono-s">${esc(x.id)}</td><td>${x.plan === 'yearly' ? 'Yearly' : 'Monthly'}</td>
      <td>${x.periodFrom ? `${fmtDay(x.periodFrom)} – ${fmtDay(x.periodTo)}` : '—'}</td><td><b>${rupees(x.amount)}</b>${x.gateway === 'demo' ? '<small>demo, no money taken</small>' : ''}</td>
      <td><span class="st st-${x.status === 'paid' ? 'ok' : x.status === 'failed' ? 'bad' : 'warn'}">${x.status === 'paid' ? 'Paid' : x.status === 'failed' ? 'Failed' : 'Not finished'}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}
export { rupees };
export const toastErr = (e) => toast(e.message || 'Something went wrong. Please try again.');
