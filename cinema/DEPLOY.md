# Put Lumen online (website + installable app)

After this, people can open your link on any phone or computer and install Lumen like an app:
- **Android (Chrome):** menu ⋮ → **Install app**
- **iPhone (Safari):** Share → **Add to Home Screen**
- **Windows (Chrome or Edge):** install icon at the right end of the address bar

You need: a GitHub account (you have it) and a hosting account. The steps below use **Render** (render.com). It runs `node server.js` for you and gives you an https link.

## 1. Create the service (10 minutes)

1. Sign up at https://render.com with your GitHub account.
2. **New → Web Service** → pick the repository **orbase6/Tryon**.
3. Fill in:
   - **Branch:** `claude/virtual-tryon-fashion-store-hjuwq9`
   - **Root Directory:** `cinema`
   - **Runtime:** Node
   - **Build Command:** `echo ok`
   - **Start Command:** `node server.js`
   - **Instance type:** Starter (paid). The free type deletes uploads and bookings on every restart.
4. **Disk** (under Advanced): add a disk, **Mount path** `/var/data`, size 1 GB.
5. **Environment variables** (Advanced → Add environment variable):

| Key | Value |
|---|---|
| `HOST` | `0.0.0.0` |
| `DATA_DIR` | `/var/data` |
| `FORCE_HTTPS` | `1` |
| `ADMIN_EMAIL` | your admin email |
| `ADMIN_PASSWORD` | a **strong** password (12+ characters) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | Gmail **App password** (myaccount.google.com/apppasswords) |
| `MAIL_FROM` | your Gmail address |

| *(easier)* | Skip the SMTP and Razorpay rows here and enter them after the first sign-in in **Admin → Settings** (also WhatsApp and SMS keys). |
| `RAZORPAY_KEY_ID` | from Razorpay Dashboard → Account & Settings → API Keys (after your KYC is approved) |
| `RAZORPAY_KEY_SECRET` | same page; keep it secret |

Without the two Razorpay keys, theatre plan payments run in **demo** mode (marked "no money taken"). With them, partners pay ₹399/month or ₹4,000/year by UPI, card or net banking through Razorpay, and the server checks Razorpay's signature before activating the plan. Start with Razorpay **test** keys, try a payment, then switch to live keys.

Do not set `PORT` (Render sets it). Keep `DEMO_MODE` unset until real payments work.

6. **Create Web Service.** After 1–2 minutes you get a link like `https://lumen-xxxx.onrender.com`.

## 2. Check it
- Open the link → the yellow "Demo version" bar shows at the top.
- `https://…/#login` → sign in with ADMIN_EMAIL / ADMIN_PASSWORD.
- Forgot password → the code arrives by email.

## 3. Your own domain (optional)
Buy a domain (e.g. from GoDaddy or Namecheap), then in Render: **Settings → Custom Domains → Add**, and copy the DNS records it shows into your domain's DNS page. https is set up automatically.

## 4. Updating
Every time new code is pushed to the branch, Render rebuilds by itself (Auto-Deploy on).

## Stores (later)
- **Google Play:** wrap this site as an app with Bubblewrap / PWABuilder (pwabuilder.com → enter your link → Android). New personal developer accounts must run a closed test with 12 testers for 14 days before going public.
- **Microsoft Store:** pwabuilder.com → Windows package → upload in Partner Center.
- **Apple App Store:** needs an Apple Developer account (US$99/year), a Mac, and Apple's review. Until then, iPhone users use "Add to Home Screen".

## Before taking real money
The checkout is a demo. Real payments need a payment gateway account (Razorpay / Cashfree) with your business KYC, server-side price checks, refunds, and legal pages (terms, privacy, refunds). Keep the demo bar on until then.
