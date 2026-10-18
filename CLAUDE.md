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
- `startAuction()` sets rivals (each with a private `max`) and `A.est`, the valuer's estimate shown to the player (true value ±5% centre, ±8% band). The walk-away line is `A.est.hi`.
- `auctionTick()` runs every 100ms; `econTick()` every 1s (1s = 1 game month: rent, bills, growth, events).
- `project(price, tier, value, style)` is the "if you win" maths: cash out today, loan, monthly net cash flow, day-one equity.
- `updDeal()` draws the meter marker, the dock verdict and the If-you-win panel. `drawMeter()` draws the zones per lot.
- `tour()` is the walkthrough, reachable from the `?` menu (`menu()`). New players get one-line coach marks instead (`coach(key,msg)`, seen keys in `S.coach`).
- Multi-auction: `A` is the lot on screen; `LIVE` holds background lots (`x.bg=true`). `liveTick()` swaps `A` to each background lot and runs the same `auctionTick()`; every DOM function returns early when `A.bg`. `focusLive(no)` swaps a background lot onto the screen. `quickPlay()` = Hot lot.
- `endAuction()` handles both: bookkeeping is shared, presentation splits on `ui=!A.bg`. Near-miss = lost within two bids and under the walk-away. `noteWin()` runs the combo chime.
- Sets: `sets()` counts homes per suburb and per street (cached), `setMult()` feeds `rentOf()`. 3 in a suburb = +10% rent, 2 on a street = +5%. Streets per suburb are fixed by `streetsFor(sub)` so pairs happen.
- Retention: `dailyCheck()` (streak, freezes, bonus), `award(id)` + `BADGES`, `recap()` every 10 focused lots.
- `artOf(p)` returns a photo from `img/manifest.json` when present, else `houseSVG(p)`. Generate photos with `tools/gen_images.mjs`.
- `CONFIG` at the top of the script: affiliate link, ads (off), analytics (off).
- v20 auctions first: the Market tab is hidden and `marketTick`/`offMarketTick` no longer run (code kept, dormant). Homes are bought at auction and sold at auction.
- Selling: `sellSheet(p)` → `listForAuction(p, reserveMult)` queues `SELLQ`; `startAuction()` runs queued sells first via `newSellAuction()` (`A.sell={pid,reserve}`, rivals bid against each other, player can't bid). `endSell()`: at/over reserve → `sellProp(p, hammer*0.98, 'auction')`; under → passed in, 0.4% agent fee. Agent sale = 92% of value now.
- Final call: once a focused lot's clock first hits 4s (`A.fin`), auto-bid stops for that lot; `yourCall()` cues the player whenever a rival leads in the final phase. Background lots still auto-bid.
- Valuer estimate is wider (centre ±5%, band ±8%).
- Inspection: `inspect(featured)` after every player win: 5% jackpot (+25–40%; 15% on featured), 20% good find (+5–12%), 12% flaw (−4–9%), else clean. Applied to `p.value`; `showReveal()` replaces the stamp. Earned, never sold.
- Featured auction every `FEAT_EVERY` (4 min, first 2 min after owning a home; `S.featAt`): rare lot at the best tier you can afford, 4 rivals incl. your nemesis, 18s clock, crowd counter, no registration needed. Countdown in the live strip (`drawFeatIn`).
- Upgrades (`UPG`, `upgradeSheet`, `startWorks`, `finishWorks`): Makeover, Pool (needs 600 m² land, no units/towers, no existing pool), Extension (450 m²). Paid in game cash, cost goes into `p.capex` (part of `basis()`), works use `p.vacant` with `p.works` set, value lift lands when works finish. Passing `classLine(ti)` moves the home up a category (`p.ti0` keeps the original tier so rent yield stays put) with a 6% premium. Each upgrade once per home.
- Redevelop (`REDEV`, `startRedev`, `buildEvents`, `finishRedev`), step 1: Duplex (house, 600 m²+, 24 months, cost 65% of value, ends 1.7–2.05× split into `1/` and `2/` homes with half the land and half the cost basis each) and Mansion (Prestige+ house, 1,000 m²+, 30 months, cost 90%, ends 2.0–2.4×). Max 2 builds at once (`REDEV_MAX`). One cost blowout (12–25%, 2%/month) and one 6-month delay can each hit a build. `p.dwell` marks new builds. Mansion tax in `saleOf()`: 4% of the sale price from $5M, 5.5% from $10M. Homes now keep `land`, `beds`, `feats`; older saves get land from their seed in the migration after `load()`. Step 2 (townhouses, apartment blocks, merging neighbouring lots, grouped portfolio cards) is not built.
- Registrations (scarcity A/B): `CONFIG.registrations` ('ab' | 'on' | 'off'), `S.regVar` (1 limited, 0 control; `?reg=1|0` forces it), `S.reg={n,at}`, `REG_MAX=8`, refill every `REG_EVERY` (12 min real time), first `REG_FREE=20` joined lots free. `regJoin(X)` is the only gate: the first bid in a lot uses one (hand, Go big or auto). Free top-ups: `regAdd()` from the daily streak (+2) and badges (+1). Market, offers, Empire never limited.
- Today's lot: from the second day played, the first focused lot each day is rare, softer rivals, no registration (`A.daily`, `S.dailyDay`).
- Bank (`renderBank`, game cash): Rate lock (`S.lock` months at `LOCK_RATE` 4.5%, fee 1.5% of debt; `rate()` replaces `INTEREST` everywhere) and Rescue cover (`S.rescue`, one use: shortfall goes on the biggest home's loan instead of a repossession). V2 sells these in the app.
- In-app purchases: app only. `initStore()` looks for `window.DPStore` (provided by the native wrapper, contract in README); without it the shop and every buy button are hidden (`inApp()` false). Catalogue = `IAP` (id, kind, `show()`, `grant()`); `remove_ads` is the only non-consumable and is re-granted from `owned()`/`restore()`. `adFree()` turns off `adHTML()`/`renderAds()`. Never sell auction wins or paid chance.
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
