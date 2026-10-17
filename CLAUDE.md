# Dopamine Property: notes for Claude Code

## What this is
Mobile-first property-auction game in one file: `public/index.html` (HTML + CSS + one IIFE script). Served by `server.js` on Railway; pushing to `main` deploys.

## Working rules
- Edit `public/index.html` directly. `tools/build.py` and `original/` are a finished one-off migration; don't re-run it (it would overwrite later edits).
- Keep it dependency-free and single-file unless there's a strong reason.
- Design for a 390×844 phone first. The bid dock (`#dock`) must stay visible; check there's no horizontal scroll.
- After changes run `python3 tools/smoke.py` and look at the screenshots in `shots/` (light + dark).
- Save-game key is `dopamine-property-v1` in localStorage. Never rename it or change state shape without a migration in `load()`.

## Engine map (inside the script)
- `TIERS` markets (Starter → Icon) and unlock thresholds; `RENT`, `DUTY`, `COUNCIL`, `UPKEEP`, `STRATA`, `INTEREST`, `LVR` are the economy knobs.
- `makeLot()` builds a property; `L.value` is the hidden true value, `L.guide` is 82–94% of it.
- `startAuction()` sets rivals (each with a private `max`) and `A.est`, the valuer's estimate shown to the player (true value ±3% centre, ±5% band). The walk-away line is `A.est.hi`.
- `auctionTick()` runs every 100ms; `econTick()` every 1s (1s = 1 game month: rent, bills, growth, events).
- `project(price, tier, value, style)` is the "if you win" maths: cash out today, loan, monthly net cash flow, day-one equity.
- `updDeal()` draws the meter marker, the dock verdict and the If-you-win panel. `drawMeter()` draws the zones per lot.
- `tour()` is the 4-step first-run walkthrough (`S.tour` flag). The `?` button reopens it.
- Market tab: swipe deck (`renderDeck`), buyer offers (`renderOffers`), off-market pop-ups (`offMarketTick`), globe (`gdraw`).
- Telemetry (`T`, `flushPlay`) only writes when running inside a Claude artifact (`window.claude`); it's a no-op on the web.

## UX principles from the v10 overhaul
Players were confused about why to bid, which stats matter, and how a lot affects their portfolio. Every decision screen should answer:
1. What is it worth? (valuer's estimate + meter zones)
2. When do I stop? (walk-away line)
3. What does it do to my month? (cash flow, income before → after)
4. What am I working towards? (goal strip)
