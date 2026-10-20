# Auction Empires

Formerly "Dopamine Property" (the repo, Railway project and save key keep the old name).

A fast property-auction browser game. Bid against rival investors, collect rent, dodge the bills, unlock bigger markets and climb the rich list.

Single page, no build step, no dependencies. Game state lives in the player's `localStorage`.

Live: https://game-production-ee8e.up.railway.app (Railway project "Dopamine Property", service `game`, volume `play-logs` at `/data`).

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

## In-app purchases (mobile app only)

The web game sells nothing. Purchases switch on only inside the native iOS/Android app, through Apple's App Store and Google Play billing (no Stripe, no web checkout).

The app wrapper (planned: Capacitor + RevenueCat) must put this object on `window` before the game loads:

```js
window.DPStore = {
  available: async () => true,                 // store billing is ready
  products: async ids => [{ id, price }],      // localised price strings from the store, e.g. "A$4.99"
  buy: async id => ({ ok: true }),             // resolves after the store confirms (and the receipt is validated)
  owned: async () => ["remove_ads"],           // non-consumables this account owns (checked on launch)
  restore: async () => ["remove_ads"],         // the "Restore purchases" button (Apple requires one)
};
```

Product ids (create the same ids in App Store Connect and Play Console):

| id | type | gives |
| --- | --- | --- |
| `remove_ads` | non-consumable | no ads |
| `regos_10` | consumable | 10 bidder registrations |
| `slots_5` | consumable | Property manager: +5 portfolio slots, permanent, stacks |
| `market_5` | consumable | Buyer's agent: +5 Market buys, stacks |
| `cash_small` | consumable | game cash sized to your markets ($250K at Starter up to $200M at Icon) |
| `cash_large` | consumable | 8× the small pack (Family and up) |
| `season_pass` | consumable | this season's premium reward column (cosmetics + registrations) |
| `cosmetic_pack` | non-consumable | neon, marble and holo card frames; gold, neon and black paddles |
| `city_pack` | consumable | opens the next country one market early |
| `rescue` | consumable | stops one repossession |
| `rate_lock` | consumable | 4.5% on loans for 24 months |
| `finish_works` | consumable | finishes every upgrade under way |

All guaranteed results: no paid chance, no paid auction wins, game cash never converts back to money. The catalogue lives in `IAP` in `public/index.html`; `/admin` shows shop opens, purchases by id and restores (revenue is in App Store Connect and Play Console).

## Photoreal home images (OpenAI, generated on Railway)

1. Railway → Dopamine Property → `game` → Variables: add `OPENAI_API_KEY`.
2. Open `/admin/gen-images?key=<ADMIN_KEY>&go=1&per=6` once (30 images, ~US$2 with gpt-image-1 medium). Reload `/admin/gen-images?key=<ADMIN_KEY>` to watch progress.
3. Images are saved on the `/data` volume and served at `/img/*`; the game picks them up on the next load. Run again to add more.

The key never reaches the browser or the repo. The local script below still works if you'd rather generate on your own machine.

## Photoreal home images (OpenAI) — local alternative

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
