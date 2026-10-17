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

## Smoke test

```bash
pip install playwright && python3 -m playwright install chromium
python3 tools/smoke.py                       # tests public/index.html
python3 tools/smoke.py https://your-url      # tests the live site
```
