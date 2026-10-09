# Atelier — AI Virtual Try-On Store

Fashion + beauty + accessories e-commerce site with a **Virtual Try-On panel**: upload a selfie or full-body photo (or use the live camera), tap any product and *only that product* is applied to you. Face, hair, skin, pose and background stay pixel-identical.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer Motion · next-themes · **MySQL via `mysql2` (raw parameterized SQL, no ORM)** · `sharp` · MediaPipe Tasks (in the browser).

## Pages

| Route | Purpose |
|---|---|
| `/shop` | Product listing — category tabs, accessory chips, price / brand / rating / sale filters, sort, infinite scroll, skeletons |
| `/product/[slug]` | Product detail — exact admin-uploaded Front / Back / Side / detail images, zoom + swipe, size / colour / shade, related products, "Try this on" |
| `/gallery` | Lookbook + saved try-on results, category filter, lightbox (prev / next / download / try this / view product) |
| `/admin/products` | Admin list (table on desktop, cards on mobile) — search, filter, pagination, edit, delete, publish toggle |
| `/admin/products/new`, `/admin/products/[id]/edit` | Product form with image slots, upload progress and enhanced-vs-original approval |
| `/admin/login` | Password login (signed httpOnly cookie) |

`/` redirects to `/shop`.

## Quick start

```bash
npm install
cp .env.example .env          # then edit DB_*, ADMIN_PASSWORD, SESSION_SECRET
npm run db:migrate            # creates the database + tables (db/schema.sql)
npm run db:seed               # inserts 22 products (db/seed.sql): 10 clothing / 6 cosmetics / 6 accessories
npm run dev                   # http://localhost:3000
```

Other DB commands: `npm run db:reset` (drop + recreate + seed) and `npm run seed:gen` (regenerates `db/seed.sql` and the placeholder SVG images in `public/seed/products`).

Requires MySQL 8+ (MariaDB 10.5+ also works). The DB user needs rights to create the database named in `DB_NAME`.

Production: `npm run build && npm start`. Admin: open `/admin/login` and use `ADMIN_PASSWORD`.

> **Camera / live try-on needs HTTPS** (browsers only expose `getUserMedia` on secure origins; `localhost` is exempt). To test on a phone, serve the app through an HTTPS reverse proxy or tunnel (Caddy, nginx + Let's Encrypt, Cloudflare Tunnel, ngrok…).

## Environment variables

See [`.env.example`](.env.example) for every variable with comments.

| Variable | Purpose |
|---|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | MySQL connection |
| `ADMIN_PASSWORD` | Admin login password |
| `SESSION_SECRET` | HMAC secret for the admin cookie (≥16 chars, **required in production**) |
| `BG_REMOVAL_PROVIDER` | `heuristic` (default, no key) · `removebg` · `imgly` · `none` |
| `UPSCALE_PROVIDER` | `sharp` (default) · `replicate` |
| `TRYON_PROVIDER` | `mock` (default demo mode) · `gemini` · `replicate` |
| `SEGMENT_PROVIDER` | `client` (default) · `replicate` · `heuristic` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini image editing |
| `REPLICATE_API_TOKEN`, `REPLICATE_TRYON_MODEL`, `REPLICATE_UPSCALE_MODEL`, `REPLICATE_PARSING_MODEL` | Replicate models (IDM-VTON / CatVTON, Real-ESRGAN, human parsing) |
| `REMOVEBG_API_KEY` | remove.bg API |
| `FACE_DIFF_THRESHOLD` | Max mean pixel difference allowed in the face region of a model output (default 14) |
| `TRYON_FALLBACK_TO_MOCK=1` | If the AI provider errors, fall back to demo mode instead of failing |
| `STORAGE_DIR` | Where uploads/results are stored (default `./storage`, served through `/api/files/*`) |
| `CRON_SECRET` | Enables `POST /api/cleanup` for a cron job |
| `NEXT_PUBLIC_MP_*` | Optional overrides for MediaPipe WASM / model URLs |

## Switching providers

Each provider is an adapter behind one env variable — no code changes:

* **Free option:** `TRYON_PROVIDER=huggingface` calls the public IDM-VTON Hugging Face Space (`HF_SPACE`, optional free `HF_TOKEN` for more GPU quota). It is slow, queued and rate limited — fine for testing, not production.
* **Try-on / inpainting** (`lib/tryon/providers/`): `TRYON_PROVIDER=gemini` + `GEMINI_API_KEY`, or `TRYON_PROVIDER=replicate` + `REPLICATE_API_TOKEN` (+ `REPLICATE_TRYON_MODEL`, default `cuuupid/idm-vton`; CatVTON style models that accept `human_img`, `garm_img`, `mask_img` work too). Add another by implementing `renderGarment` in `providers/index.ts`.
* **Background removal** (`lib/cutout.ts`): `BG_REMOVAL_PROVIDER=removebg` (+ key), `imgly` (`npm i @imgly/background-removal-node`), or the built-in `heuristic` flood-fill (good for studio/plain backgrounds).
* **Upscale / denoise** (`lib/imageEnhance.ts`): `sharp` Lanczos + median + sharpen, or Real-ESRGAN on Replicate.
* **Human parsing** (`lib/tryon/segment.ts`): the browser runs MediaPipe (pose, face, hands + multiclass selfie segmenter) and sends landmarks + a parsing mask with the photo; `SEGMENT_PROVIDER=replicate` + `REPLICATE_PARSING_MODEL` runs an ATR/LIP human-parsing model server-side instead.

### Demo mode
With no AI key (`TRYON_PROVIDER=mock`) everything runs end to end: garments are fitted into the edit mask with the product cutout and the result carries a visible **DEMO** badge. Makeup and accessories never need an AI key — they are rendered deterministically from face / hand / pose landmarks.

## How the try-on guarantees "only the product changes"

`lib/tryon/render.ts` implements mask-based editing + pixel-lock compositing:

1. **Parse** — MediaPipe (browser) returns pose / face / hand landmarks and a body-part mask (hair, skin, face, clothes…).
2. **Mask only the target region** per category:
   * clothing → expected garment area from pose landmarks ∪ the clothing currently worn (so an existing dress/top is replaced completely), minus face, hair and hands (hair/arms that occlude the garment stay in front);
   * cosmetics → lips (inner mouth excluded), cheeks, eyelids, liner, waterline or face oval from face-mesh polygons;
   * accessories → overlay footprint placed with landmark-driven scale and rotation (glasses on the eye line, earrings on lobes, cap on the head, watch / bracelet on the wrist, rings on the finger).
3. **Edit** — garments go to the AI adapter with image + mask + product cutout (prompt: change only the masked area). Makeup/accessories are rendered locally.
4. **Composite** — the result is written back through the feathered mask. Every pixel outside the union of edit masks is copied from the original upload, and this is **verified** at the end (`lockedChanged` must be 0).
5. **Safety check** — the face box of the model output is compared with the original outside the mask; if it drifts above `FACE_DIFF_THRESHOLD` it retries once, then returns an error. The final image is checked again.

Picks are stacked in a sensible layer order (garment → makeup → earrings → wrist items → glasses → cap). Removing a pick re-renders from the original; **Start over** clears all picks.

> The uploaded photo is normalised once on upload (EXIF rotation, max 1600px long side, lossless PNG). "Pixel-identical" refers to that normalised photo.

## Live video try-on

*Live / camera* opens a full-screen camera view with only a product strip, a camera-flip button, a capture button and a close button. The engine (`lib/live/engine.ts`) uses MediaPipe Pose / Face / Hand landmarkers in the browser with One-Euro smoothing and draws on a canvas in a `requestAnimationFrame` loop: garments are warped onto the shoulder–hip–knee quad, glasses / earrings / cap attach to face landmarks, watches / bracelets / rings to wrist and hand landmarks, lipstick / blush / liner / shadow are blended on landmark polygons. Detection cost adapts (frames are skipped on slower devices) and landmarkers are only loaded for the selected product types. **Capture** sends the un-mirrored camera frame through the photoreal pipeline above and drops the result into the try-on panel, where it can be saved to the gallery. A "Low light / stand back" hint appears only when landmarks are lost.

MediaPipe files are loaded from jsDelivr / Google Cloud Storage by default. To self-host, download the `.task` / `.tflite` files and the `wasm` folder from `@mediapipe/tasks-vision` into `public/models/` and set the `NEXT_PUBLIC_MP_*` variables.

## Image enhancement pipeline

On every product image upload (`POST /api/admin/uploads`, used by the admin form for instant before/after):
validate type/size by content (JPG/PNG/WebP, ≤10 MB) → auto-rotate + sRGB + resize to ≤2000px → blur / resolution analysis → upscale + denoise + sharpen when small or blurry → auto-levels for dark shots → background removal (transparent cutout) → trim + pad → `original`, `enhanced` (cutout PNG) and `thumb` (400px WebP) are stored in `product_images`. The admin sees original and enhanced side by side and can approve or fall back to the original. The storefront shows the enhanced image; the try-on engine uses the cutout. Code: `lib/imageEnhance.ts`, `lib/cutout.ts`.

## Security & privacy

* Every SQL statement is parameterized (`lib/db.ts`, `lib/queries/*`); `ORDER BY` comes from a whitelist.
* Admin pages and `/api/admin/*` are protected by middleware **and** re-checked in handlers; the cookie is HMAC-signed, httpOnly, sameSite=lax (secure in production). Login is rate limited.
* Uploads are validated server-side by content, size-capped, and re-encoded. Try-on endpoints are rate limited per session.
* User photos and unsaved try-on results are deleted after 24 hours (cleanup runs on upload; or schedule `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://your-host/api/cleanup`). Saved results stay in the gallery; "Share publicly" is opt-in.
* A privacy note is shown in the try-on panel.

## Project layout

```
app/(store)/{shop,product/[slug],gallery}   storefront pages (shared layout with try-on panel)
app/admin/{login,(panel)/products/...}      admin
app/api/...                                 route handlers (products, admin, tryon, gallery, cart, wishlist, files)
components/                                 ProductCard, Filters, ImageViewer, GalleryClient, tryon/{TryOnPanel,BottomSheet,LiveTryOn}, admin/*
lib/db.ts, lib/queries/*                    mysql2 pool + one file per entity (raw SQL)
lib/imageEnhance.ts, lib/cutout.ts          enhancement service + background-removal adapter
lib/tryon/{segment,garmentMask,makeup,accessory,render,providers/*}.ts
lib/live/{engine,oneEuro}.ts, lib/mediapipe.ts   browser-side landmark tracking
db/schema.sql, db/seed.sql, scripts/migrate.ts
```

## Notes

* Placeholder product art is generated SVG (`npm run seed:gen`); replace it from the admin upload page.
* Checkout is intentionally out of scope (cart and wishlist are session-cookie based).
* Photo-realism of garment try-on depends on the configured AI provider; demo mode only fits the cutout.
