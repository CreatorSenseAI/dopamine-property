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

## Config (top of the script in `public/index.html`)

```js
const CONFIG={
 affiliate:{enabled:true, au:'https://www.realestate.com.au/buy/in-{slug},+{st}/list-1'}, // "see real homes" link at the win
 ads:{enabled:false, adsenseClient:'', adsenseSlot:''},   // ad slot in the session recap only
 analytics:{plausibleDomain:''}                          // e.g. 'dopamineproperty.com' to track D1/D7 + events
};
```

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
