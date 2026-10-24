# Auction Empires

Formerly "Dopamine Property" (the repo, Railway project and save key keep the old name).

A fast property-auction browser game. Bid against rival investors, collect rent, dodge the bills, unlock bigger markets and climb the rich list.

Single page, no build step. The game has no dependencies; the server has two optional ones (`ws`, `sharp`) and runs without either. Game state lives in the player's `localStorage`.

Live: https://game-production-ee8e.up.railway.app (Railway project "Dopamine Property", service `game`, volume `play-logs` at `/data`).

## Run locally

```bash
npm install          # optional: ws (live arena push) and sharp (photo resizing)
npm start            # http://localhost:3000
```

## Deploy (Railway)

The Railway service is connected to this repo, so **every push to `main` deploys**.
`railway.json` sets the start command (`node server.js`) and health check (`/healthz`).

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole game: markup, styles and script. **Edit this.** |
| `server.js` | Node static server (gzip, caching, `/healthz`), APIs, admin, photo generation. |
| `social.js` | Groups, duels, Auction Night, the live arena. |
| `arena-ws.js` | WebSocket push for the live arena at `/ws` (needs `ws`; logs `WS off` and clients keep polling without it). |
| `public/sw.js` | Service worker: Workbox 7.3 from jsDelivr, hand-written fallback. |
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

The app wrapper (`app/`, Expo + RevenueCat, built on EAS) puts this object on `window` before the game loads:

```js
window.DPStore = {
  available: async () => true,                 // store billing is ready
  products: async ids => [{ id, price }],      // localised price strings from the store, e.g. "A$4.99"
  buy: async id => ({ ok: true }),             // resolves after the store confirms (and the receipt is validated)
  owned: async () => ["remove_ads"],           // non-consumables this account owns (checked on launch)
  restore: async () => ["remove_ads"],         // the "Restore purchases" button (Apple requires one)
  pro: async () => ({ on, prod, life, until, renew }), // Pro entitlement (auction_empire_pro) state; the wrapper also pushes changes to window.EAT_PRO
  paywall: async () => ({ result, pro }),      // RevenueCat Paywall for the current offering; result purchased|restored|cancelled|not_presented|error
  manage: async () => ({ on, ... }),           // RevenueCat Customer Center (manage/cancel, restore, refunds); resolves with the new Pro state
  review: () => {},                            // optional: open the native store rating sheet (SKStoreReviewController / In-App Review); the game calls it after a Legendary win or a dynasty prestige, at most weekly
};
```

Product ids (create the same ids in App Store Connect and Play Console):

v75: stars are the store's currency. Sell these (create the same ids in App Store Connect, Play Console and RevenueCat):

| id | type | gives |
| --- | --- | --- |
| `monthly` | subscription | Dynasty Club, A$9.99 a month (entitlement `auction_empire_pro`) |
| `lifetime` | non-consumable | Dynasty Club for life (entitlement `auction_empire_pro`) |
| `star_10` | consumable | ★ 10 to spend (A$1.49 guide) |
| `star_35` | consumable | ★ 35 (A$4.49) |
| `star_80` | consumable | ★ 80 (A$8.99) |
| `star_180` | consumable | ★ 180 (A$17.99) |
| `star_500` | consumable | ★ 500 (A$44.99) |
| `founder` | non-consumable | Founder's deed, launch window only: ★ 30, one free naming right, the Founder frame, paddle and title (A$2.99) |
| `season_pass` | consumable | this season's pass row |
| `remove_ads` | non-consumable | no ads |

Bought stars go to the wallet (`S.wal`) only; dynasty stars (`S.legacy`) only grow from stars earned in play. Retired in v75 (no longer shown, kept in `IAP` so anything owned restores): `regos_10`, `slots_10`, `market_5`, `cash_1` … `cash_8`, `crew_1`, `finish_works`, `starter_pack`, `double_back`, `cosmetic_pack`, `style_pack`, `phone_gold`, `city_pack`, `rescue`, `rate_lock`, `prop_manager`.

Dynasty Club (was Pro) = Property manager, the season pass every season it is active, +10 home slots, no ads, 5★ and a streak save every week, and tier 100 of the season track after 20 daily runs (`PRO_PERKS`, `proOn()`). Both Pro products sit in the RevenueCat `default` offering, which carries the Paywall built in the RevenueCat dashboard.

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

## Optional server packages (v55)

- **`ws`**: `/ws` pushes `{t:'arena', ...}` (the same body `POST /api/arena` returns) on every arena change and every 2s while a lot is in lobby or live. Clients send `{t:'hello', id, nick, tier}` and `{t:'ping', tier, lot?}` every 20s; that counts as presence. Bids still use `POST /api/arena/bid`. Missing package: `WS off` in the log, polling as before. Local test timings: `ARENA_FIRST_MS`, `ARENA_LOBBY_MS`, `ARENA_LIVE_MS`.
- **`sharp`**: generated photos are requested as PNG and stored as WebP q78; `/img/<photo>.webp?w=480|768|1080` serves a resized copy cached in `DATA_DIR/img/_w<width>/`. Missing or broken binary: `SHARP off` in the log, the original is served.
- Static types include `.glb`, `.ogg`, `.mp3`, `.wasm`, `.bin` (not gzipped, cached 30 days). A missing file under `/img`, `/models`, `/sfx`, `/icons` is a 404, not the game page.

## Smoke test

```bash
pip install playwright && python3 -m playwright install chromium
python3 tools/smoke.py                       # tests public/index.html
python3 tools/smoke.py https://your-url      # tests the live site
```
