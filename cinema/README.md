# Lumen Cinemas

A movie, event and premiere booking app whose main idea is simple: **see the view from your seat before you book**. Every seat has a 3D view and a view score out of 100. You can book by tapping seats, or by voice in English, Tamil or Tanglish using our own on-device AI model.

All movies, theatres, events and shows are fictional demo data. Payment is a demo: no money is taken.

## Run it

```bash
cd cinema
python -m http.server 5500
# open http://127.0.0.1:5500
```

Voice input needs Chrome or Edge on `localhost`/`127.0.0.1` (or HTTPS). Typing works everywhere.

## What's inside

| Area | What the user gets |
|---|---|
| Home | Netflix-style poster rows: Now showing, Coming soon, IMAX, Family, Premiere (watch at home), Live events, Theatres near you. Language filter, city picker (5 cities), search. |
| Movie | Details, cast, "Book tickets" → **language & format picker** (2D / IMAX / 4DX / Dolby Atmos / Recliner / Select all). Coming-soon movies get "Notify me". |
| Showtimes | 7-day date strip, format / price range / preferred time / sort filters, theatre search, late-night & early-morning toggles, favourite theatres ♡, cancellation badge, amenities, availability colours, **end time on every show**, morning saver tag. |
| Seats | "How many seats?" with vehicle picture and class prices + availability. Best seats picked automatically. Tap a seat and the app fills your group next to it. Seat numbers, zoom, Sold / Bestseller / Selected / Wheelchair legend, offers strip, **view-score heatmap**, **3D view from any seat**. |
| Checkout | Terms & Conditions → contact details (validated) → snacks (pick up before the show or at the interval) → payment page: UPI QR / card / wallets / gift voucher / net banking / pay later / points, fee breakdown (base + 18% GST), ₹1 donation toggle, offers with eligibility rules, consent, amount payable. **Seats are held for 5 minutes** with a countdown. |
| Ticket | QR, seats, view score, format, end time, snack pickup, where it was sent, "See my seat view" in 3D, copy details, **cancel with the refund amount shown first**. |
| Events / Plays / Sports / Activities | Category pages, event page with ticket tiers, same checkout. |
| Stream (Premiere) | Rent a movie; "Watch in a virtual theatre" opens a private 3D lounge. |
| Accessibility & comfort | Light theme by default plus dark theme, Tamil/English, 44 px tap targets, keyboard support, reduced motion. |

### Halls
Five hall shapes, each with its own seat classes and prices (`layout.js`): stadium + balcony, IMAX steep stadium, all-recliner lounge, old single screen with a big balcony, standard multiplex. The 2D map, the 3D hall, the view score and the AI assistant all read the same layout data.

### View score
For each seat: distance as a multiple of screen width, side angle, and how far up you have to look. 88+ Perfect, 75+ Great, 60+ Good, 45+ Okay, below that Tough (e.g. "very close to the screen", "you look up a lot").

## Speed (low-end friendly)

- No images: posters are drawn as tiny inline SVGs. App code is about 160 KB.
- Three.js (3D) is only downloaded when someone opens a seat view.
- The 3D scene renders **only when something changes**. Phones with ≤ 2 GB RAM or ≤ 4 cores get "light mode" (no antialiasing, 1× pixels, simpler people models).
- Screens are built locally with no server round trip. Measured on the test machine: every screen built in **2–12 ms**, seat tap → updated total in under 70 ms, AI request → seats proposed in **7 ms** (61 ms on the very first request, which loads the model).

## The AI: Lumen NLU (our own model, no external AI)

Pipeline (as suggested by Arunae):

```
Speech → text (browser speech recognition)
      → Lumen NLU model: intent + slots          ← our model, runs in the browser
      → resolver: matches slots to real movies, dates, theatres (typo-tolerant)
      → database check: shows + free seats
      → seats held for 5 minutes → user says "yes" → booked
```

- **Model**: a 2-layer transformer, 333K parameters, trained from scratch with PyTorch (`nlu/train.py`). Words are read through hashed character n-grams, so spelling mistakes, Tanglish and Tamil script work.
- **Outputs**: intent (book, confirm, deny, change, my tickets, cancel, notify, help) and slot tags (movie, count, date, time, place, seat preference, format).
- **Size**: 446 KB (int8 weights in `nlu-model.json`), loaded only when the assistant opens.
- **Inference**: `nlu.js`, plain JavaScript, no libraries. It gives the same output as PyTorch on 300/300 test sentences. About 2–3 ms per sentence.
- **Training data**: 60,000 synthetic sentences generated from the app's own catalogue (`nlu/gen_data.py`), with mixed word order, filler words and typos.

### Accuracy

| Test | Rules only | Our model + resolver |
|---|---|---|
| 4,000 generated test sentences | — | intent 99.9%, slot F1 99.8% |
| 40 hand-written real-style sentences (`nlu/real_eval.mjs`) | 32/40 fully right (91% of details) | **40/40 fully right (100% of details)** |

The generated test comes from the same generator as the training data, so it is easy. The 40 hand-written sentences are harder, but two bugs were fixed after looking at them, so expect slightly lower accuracy on brand-new phrasing. The best next step is to log real (anonymised) user sentences, label them and retrain.

### Cost compared with an API LLM

| | Per booking request | 1 lakh requests / month |
|---|---|---|
| Hosted frontier LLM API (paid per token) | a few paise to a few rupees, depending on model and prompt size | grows with every request |
| **Lumen NLU (runs on the user's phone)** | **₹0** | **₹0 server cost**; only static file hosting |

### Next step: a tiny open LLM for open conversation

The current model handles booking requests. For free-form chat ("which is better for kids, Paati's Kitchen or Little Kanna?"), the plan is a small open model:
1. Fine-tune **Qwen2.5-0.5B-Instruct** (or similar) with LoRA on booking dialogues generated from `gen_data.py` plus real logs. This needs one GPU for a few hours.
2. Quantise to 4-bit (about 350 MB) and serve it with **Ollama** or llama.cpp on one small server, or run it in the browser with WebGPU on newer phones.
3. Keep Lumen NLU as the fast first step: the LLM is only called when the NLU confidence is low. This keeps most requests at ₹0.

## Files

```
index.html     page shell
styles.css     light + dark themes, 4-colour palette (ink, paper, red, teal)
data.js        cities, theatres, movies, events, premieres, offers, show schedule
layout.js      hall shapes, seats, view score, best seats
map2d.js       2D seat map
hall3d.js      3D hall (lazy, render-on-demand)
agent.js       "Ask Lumen" assistant (voice + text)
nlu.js         in-browser inference for our model
nlu-model.json trained model weights (int8)
nlu/           data generator, PyTorch training, parity check, real-sentence test
app.js         screens and booking flow
```

Retrain the model:

```bash
pip install torch numpy
cd cinema/nlu
python gen_data.py && python train.py      # writes ../nlu-model.json
python parity.py && node parity.mjs        # JS output == PyTorch output
node real_eval.mjs                         # hand-written sentence test
```
