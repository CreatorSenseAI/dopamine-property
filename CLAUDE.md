# Dopamine Property: notes for Claude Code

## What this is
Mobile-first property-auction game in one file: `public/index.html` (HTML + CSS + one IIFE script). Served by `server.js` on Railway; pushing to `main` deploys.

## Working rules
- Edit `public/index.html` directly. `tools/build.py`, `tools/v11_patch.py`, `tools/v12_patch.py`, `tools/v13_patch.py`, `tools/v13b_patch.py` and `original/` are finished one-off migrations; never re-run them.
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
- `tour()` is the walkthrough, reachable from the `?` menu (`menu()`). New players get one-line coach marks instead (`coach(key,msg)`, seen keys in `S.coach`).
- Multi-auction: `A` is the lot on screen; `LIVE` holds background lots (`x.bg=true`). `liveTick()` swaps `A` to each background lot and runs the same `auctionTick()`; every DOM function returns early when `A.bg`. `focusLive(no)` swaps a background lot onto the screen. `quickPlay()` = Hot lot.
- `endAuction()` handles both: bookkeeping is shared, presentation splits on `ui=!A.bg`. Near-miss = lost within two bids and under the walk-away. `noteWin()` runs the combo chime.
- Sets: `sets()` counts homes per suburb and per street (cached), `setMult()` feeds `rentOf()`. 3 in a suburb = +10% rent, 2 on a street = +5%. Streets per suburb are fixed by `streetsFor(sub)` so pairs happen.
- Retention: `dailyCheck()` (streak, freezes, bonus), `award(id)` + `BADGES`, `recap()` every 10 focused lots.
- Market: `MK.q` search, `WATCH` set + `renderWatch()`, globe behind `#wmapBtn`. Market tab locked until the first house (`mktOpen()`); buyer offers start at 3 houses.
- `artOf(p)` returns a photo from `img/manifest.json` when present, else `houseSVG(p)`. Generate photos with `tools/gen_images.mjs`.
- `CONFIG` at the top of the script: affiliate link, ads (off), analytics (off).
- Market tab: swipe deck (`renderDeck`), buyer offers (`renderOffers`), off-market pop-ups (`offMarketTick`), globe (`gdraw`).
- Telemetry (`T`, `sessionDoc()`, `playerDoc()`, `flushPlay`): inside a Claude artifact it writes to the artifact db; on the web (`WEB_STATS`) it POSTs to `/api/play`, which `server.js` stores as JSON in `DATA_DIR` and summarises at `/admin?key=ADMIN_KEY`. Add new counters to `T.c` and new per-auction fields in `recordAuction()`; add a tile in `adminPage()` to see them.

## UX principles from the v10 overhaul
Players were confused about why to bid, which stats matter, and how a lot affects their portfolio. Every decision screen should answer:
1. What is it worth? (valuer's estimate + meter zones)
2. When do I stop? (walk-away line)
3. What does it do to my month? (cash flow, income before → after)
4. What am I working towards? (goal strip)

## Declutter rules (v12, from playtest feedback)
- One notification on screen at a time (`toast()` queues; swipe sideways or tap to clear). Coach tips hold the queue.
- Only show what matters now: details sit behind a tap (`<details>` for If you win, ledger, badges, play stats); tier chips appear once a second tier unlocks; auto-bid limit shows only when auto is on.
- Header = net worth (+ income/mo under it), cash, menu. Nothing else.
