# Dopamine Property

A fast property-auction browser game. Bid against rival investors, collect rent, dodge the bills, unlock bigger markets and climb the rich list.

Single page, no build step, no dependencies. Game state lives in the player's `localStorage`.

## Run locally

```bash
npm start            # http://localhost:3000
```

## Deploy (Railway)

The Railway service is connected to this repo, so **every push to `main` deploys**.
`railway.json` sets the start command (`node server.js`) and health check (`/healthz`).

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole game: markup, styles and script. **Edit this.** |
| `server.js` | Zero-dependency Node static server (gzip, caching, `/healthz`). |
| `railway.json` | Railway deploy config. |
| `tools/smoke.py` | Headless phone-size smoke test + screenshots into `shots/`. |
| `tools/make_function.py` | Packs the game into a single-file Railway Function (repo-less fallback). |
| `tools/build.py` | One-off migration that produced the v10 UI from `original/`. Not part of the workflow. |
| `original/index.html` | v9 snapshot from the Claude artifact, kept for reference. |

## Play stats (who's playing, retention, funnel)

On the web the game posts anonymous play logs to `POST /api/play` every 15s and on page close. Each player is a random install id; no names, emails or IPs are stored. Players can switch it off in the menu.

- Railway service variables: `ADMIN_KEY=<long random string>` and `DATA_DIR=/data`
- Railway volume mounted at `/data` (logs survive redeploys)
- Dashboard: `https://<your-domain>/admin?key=<ADMIN_KEY>`; raw data: `/admin/export.json?key=<ADMIN_KEY>`
- Shows: day 1 / day 7 retention, daily players, session length, time to first bid and win, join and win rates, wins by deal zone, near-misses, combos, unlock times per tier, overdrafts and repossessions, market and offer use, time per tab, versions.

Inside Claude (the artifact) the same logs go to the artifact database instead.

## Config (top of the script in `public/index.html`)

```js
const CONFIG={
 affiliate:{enabled:true, au:'https://www.realestate.com.au/buy/in-{slug},+{st}/list-1'}, // "see real homes" link at the win
 ads:{enabled:false, adsenseClient:'', adsenseSlot:''},   // ad slot in the session recap only
 analytics:{plausibleDomain:''}                          // e.g. 'dopamineproperty.com' to track D1/D7 + events
};
```

## Remove ads (one-time purchase, web)

1. In Stripe, create a Product "Remove ads" with a one-time price (e.g. A$4.99) and a **Payment Link** for it.
2. Payment Link → After payment → "Don't show confirmation page" → redirect to `https://<your-domain>/?paid={CHECKOUT_SESSION_ID}`.
3. Railway variables:
   - `STRIPE_SECRET_KEY` — a restricted key with read access to Checkout Sessions
   - `STRIPE_REMOVE_ADS_LINK` — the Payment Link URL (`https://buy.stripe.com/...`)
   - `STRIPE_REMOVE_ADS_LINK_ID` — its id (`plink_...`), so only that link unlocks
   - `REMOVE_ADS_PRICE` — the label shown in game, e.g. `A$4.99`
   - `UNLOCK_SECRET` — long random string (signs unlock tokens)

The menu and the ad slot then show "Remove ads". The server checks every payment with Stripe before unlocking; players on a new device use "Restore" with the email they paid with. Purchases (no email or card data) are listed on `/admin`. Leave the variables unset until ads are switched on, so there's nothing to remove before then.

## Photoreal home images (OpenAI)

```bash
OPENAI_API_KEY=sk-... node tools/gen_images.mjs          # 6 per style, 30 images
OPENAI_API_KEY=sk-... PER_STYLE=12 node tools/gen_images.mjs
```

Writes `public/img/*.webp` and `public/img/manifest.json`. The game picks them up automatically and falls back to the drawn houses when the manifest is empty. The key stays on your machine; never put it in the page.

## Smoke test

```bash
pip install playwright && python3 -m playwright install chromium
python3 tools/smoke.py                       # tests public/index.html
python3 tools/smoke.py https://your-url      # tests the live site
```
