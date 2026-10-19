# Empire Auction Tycoon (EAT): notes for Claude Code

Player-facing name is Empire Auction Tycoon, logo mark "EAT". The repo, Railway project and the save key (`dopamine-property-v1`) keep the old "Dopamine Property" name on purpose: renaming the save key would wipe every player's game.

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
- `startAuction()` sets rivals (each with a private `max`) and `A.est`, the valuer's estimate shown to the player (true value ±5% centre, ±8% band). The walk-away line is `A.est.wa` (the estimate's middle, read through `waOf(e)`); it used to be `est.hi`, which made every win ~8% over value. Zones: Steal under guide/est.lo, Good under 97% of the walk-away, Fair up to it, Overpaying past it. About 1 lot in 5 has a stubborn rival (`r.stub`, max +5–12%).
- `auctionTick()` runs every 100ms; `econTick()` every 1s (1s = 1 game month: rent, bills, growth, events).
- `project(price, tier, value, style)` is the "if you win" maths: cash out today, loan, monthly net cash flow, day-one equity.
- `updDeal()` draws the meter marker, the dock verdict and the If-you-win panel. `drawMeter()` draws the zones per lot. If you win is a popover (`#ifwin`, `closeIw()`) opened by tapping the dock verdict.
- `tour()` is the walkthrough, reachable from the `?` menu (`menu()`). New players get one-line coach marks instead (`coach(key,msg)`, seen keys in `S.coach`).
- Multi-auction: `A` is the lot on screen; `LIVE` holds background lots (`x.bg=true`). `liveTick()` swaps `A` to each background lot and runs the same `auctionTick()`; every DOM function returns early when `A.bg`. `focusLive(no)` swaps a background lot onto the screen. `quickPlay()` = Hot lot.
- `endAuction()` handles both: bookkeeping is shared, presentation splits on `ui=!A.bg`. Near-miss = lost within two bids and under the walk-away. `noteWin()` runs the combo chime.
- Sets: `sets()` counts homes per suburb and per street (cached), `setMult()` feeds `rentOf()`. 3 in a suburb = +10% rent, 2 on a street = +5%. Streets per suburb are fixed by `streetsFor(sub)` so pairs happen.
- `carry()` lists account-level state (test groups, purchases, privacy, streak, badges, tips) kept through cash-out, bankruptcy and reset. Add new account-level fields there.
- Retention: `dailyCheck()` (streak, freezes, bonus), `award(id)` + `BADGES`, `recap()` every 10 focused lots.
- `artOf(p)` returns a photo from `img/manifest.json` when present, else `houseSVG(p)`. Photos are generated on Railway (`/admin/gen-images?key=…&go=1`, needs `OPENAI_API_KEY` on the service), stored in `DATA_DIR/img` and merged into `/img/manifest.json` by `serveImg()`; `tools/gen_images.mjs` is the local alternative.
- `CONFIG` at the top of the script: affiliate link, ads (off), analytics (off).
- v20 auctions first, as a 50/50 test (`CONFIG.market` 'ab'|'on'|'off', `S.mkVar` 1 = Market kept, 0 = no Market; `?mkt=1|0` forces it; `mktOn()`). Without the Market, `marketTick`/`offMarketTick` don't run and the tab is hidden (`drawTabs`). Selling at auction exists in both. `/admin` compares the groups.
- Rival stakes: when you win, every rival who bid loses 12% of the lot's value from their rich-list worth (they gain the same when they win); `richRank()` before/after drives a "Rich list: up to #N, past X" toast.
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
- Progressive unlocks: Upgrade button needs 3 homes (`upgOpen`), Redevelop needs Family unlocked (`S.maxTier>=1`), badges fold hidden until the first badge, bank only with debt/overdraft.
- Rarity (`RAR`, `rarityOf()`): every player win gets Common / Sought-after / Prime / Epic / Legendary from equity after inspection, the find, featured or rare listing, beating your nemesis, Trophy+ tier and combos. Target mix ≈ 42/24/28/6/0.6%. Stored on `p.rarity` (+ `findLabel`, `feat`, `nem`, `rivals` for the card). Earned only.
- Share card (`shareCard(p)`, Epic+ only): 1080×1350 canvas with the house art, stats and link (`shareURL()`: own origin on the web, `CONFIG.shareUrl` elsewhere); preview sheet with native Share (file when supported), Save image, Copy text. Any `[data-share=id]` element opens it.
- Daily showdown (`CONFIG.showdown`, web only): same seeded lot, rivals and inspection for everyone per UTC day (`seeded()`, `sdSeedOf()`, `SD_BUILD` skips your nemesis), one shot (`S.sdDay`), score = equity % on a win. Server `/api/board` (POST entry/rename, GET top 20 + your rank) stores `DATA_DIR/boards/<day>.json`. Nickname `S.nick` (auto "Bidder ####", changeable).
- Telemetry (`T`, `sessionDoc()`, `playerDoc()`, `flushPlay`): inside a Claude artifact it writes to the artifact db; on the web (`WEB_STATS`) it POSTs to `/api/play`, which `server.js` stores as JSON in `DATA_DIR` and summarises at `/admin?key=ADMIN_KEY`. Add new counters to `T.c` and new per-auction fields in `recordAuction()`; add a tile in `adminPage()` to see them.

## UX principles from the v10 overhaul
Players were confused about why to bid, which stats matter, and how a lot affects their portfolio. Every decision screen should answer:
1. What is it worth? (valuer's estimate + meter zones)
2. When do I stop? (walk-away line)
3. What does it do to my month? (cash flow, income before → after)
4. What am I working towards? (goal chip in the top row, Empire overview goal bar)

## Declutter rules (v12, from playtest feedback)
- One notification on screen at a time (`toast()` queues; swipe sideways or tap to clear). Coach tips hold the queue.
- Only show what matters now: details sit behind a tap (If you win popover from the verdict; Empire sections behind the dropdown); tier chips appear once a second tier unlocks; auto-bid limit shows only when auto is on.
- Header = EAT mark, Dynasty star, streak, net worth (+ income/mo under it), cash, menu, and under them one full-width news + bell row (`#news`, v30). Nothing else.

## One-screen layout (v25)
- Auction never scrolls at 360×640 and up: `#vAuction` is a flex column with `overflow:hidden`; the lot card flexes and the art (`.art`, min 56px) takes whatever height is left. Under 600px tall it falls back to scrolling. Keep new auction UI inside the existing rows or the art shrinks to nothing; check `scrollHeight - clientHeight` of `#vAuction` (smoke `fits()`).
- Top row (`.toprow`): `#chips` (goal chip first, then Auto + unlocked tiers; the next locked tier is the goal chip) and `.tright` (Showdown, Featured countdown, Hot lot). The goal chip (`goalInfo()`, `updGoal()`): next market, then the Dynasty cash-out once worth is past `CASH_AT` ($100M) or every market is open. The old goal strip and the "Live now" title are gone.
- Live cards are one row each with the auto button as a right column. The result line overlays the top of the lot card.
- Empire is sections behind a dropdown (`#eSec`, `ESECS`, `eGo(k)`): Overview (hero, goal bar, 12 tiles, no scroll), Portfolio, Money and bank, Suburb sets, Rich list, Badges, Dynasty and play. Jump to a section with `show('e');eGo('pf')`. The section survives tab switches within a session.
- Dynasty: header star always shows (★ 0 too) and opens `dynastySheet()`: stars, prestige title (`RANKS`, `rankOf()`), cash-out (`cashOut()`), lifetime stats (`S.life`, kept in `carry()`). Title badges `rank1…rank25` via `rankBadges()`. Stars also on the share card and the showdown board (`stars` in `/api/board`).

## Cash and balance (v26, from the 19 Oct play logs)
- Equity loan: `borrowable()` = 60% (`EQ_LVR`) of the value of homes not being rebuilt, minus debt; `borrowEquity(amt)` spreads it onto home loans (0.5% fee). Bank shows it whenever there's room (`eqSteps()`).
- Out of reach: tapping the dock verdict opens `cashSheet()` (borrow enough for this lot, app-only cash packs, or sell a home) instead of If you win.
- `spendCheck()` arms the upgrade/build button with a warning when the spend leaves less than a deposit for your tier (`curTier()`).
- Cash packs (`cash_small`/`cash_large`, app only) scale with your markets (`cashPack()`).
- Redevelopment keeps `rare` and `rarity` on the new build (both duplex halves). It used to drop the Rare tag, which looked like the home vanished.
- Noise: vacancy 0.35%/home/month, repairs 0.15%; market events: rate hike −3%, cut +3%, correction −10%, suburb boom +8%. Build blowouts go on the site's loan when cash can't cover them.
- Offers (Market group) last 40s (bidding wars 30s); an ignored offer at/over value comes back once as a final offer (+2%, 25s).
- Background live lots spawn only at a tier you can pay for.
- Logs: `/admin/digest.txt?key=…&since=ISO&page=n` (compact text, 12K/page); `&log=1` also writes it to the Railway service log. The server also drips the digest into the Railway log by itself (last 24h at boot, new sessions every 30 min, 40 lines/200ms so Railway doesn't drop them). Read it with the Railway logs tool, filter `"DG 12."` for page 12 or `"== "` for session headers; no admin key needed.
- Width: `#app` is `minmax(0,1fr)` and its children `min-width:0`, so Android text scaling can't push the page wider than the screen (it did in v25/v26). If the auction can't fit (big text, short screen) the lot card keeps its content height and `#vAuction` scrolls instead of clipping. Test with `ovf.py`-style font scaling at 1.3×.
- Live cards show "Past your walk-away" (disabled) instead of offering auto-bid below the current price.

## V2 build (v27–v29): see the "Empire Auction Tycoon: V2 game design" doc
- v27 (phase 1–2): game feel (spotlight, final-call vignette, gavel slam, keys, combo meter, haptics), crowd by tier, local-time skies, flip cards (`cardFace`, `cardSheet`, `tiltOn`), the pull (`pullCard`), album (`S.album`, `albumSets`, showcase), rival grudges + boss lots (`S.bossDue`), bidding war mode, house tours (`houseTour`, `tourPlan`, clues move your walk-away), skyline (`drawSkyline`), native wrapper in `app/` (Capacitor + RevenueCat bridge, haptics, push, deep links; `npm run build` copies the game to `app/www`).
- v28 (phase 3): friends server `social.js` (groups with `EAT-XXXX` codes, `/join/CODE?ref=KEY` links, weekly league, feed + reactions, owner remove/rotate, weekly trophies, referral Crew cosmetic, group showdown board `/api/group/board`), async duels and Auction Night (Thursdays 8pm local, `?night=1` forces it) run on `RUN`/`runLot`/`runDone` with `seeded()` lots, friends as rivals (`FRIENDS`, `r.friend`), win clip video (`makeClip`). Rarity pills explain themselves (`rarityInfo`).
- v29 (phase 4): events (`marketEvent` → `marketEvent0` | `disaster` | `goodEvent` | `shockEvent`), hazards per real suburb (`HAZ`, `COAST`), insurance (`S.ins`, `INS_RATE`, in `bills()`), rebuild booms (`S.recov`, `recoverTick`), tenant stories (`tenantStory`, dark ones only in R18+), long leases (`p.lease`), R18+ mode (`S.r18`, menu + age check; pandemic, recession, oil shock, crypto crash, duty holiday; school shootings deliberately excluded), news strip (`pushNews`, `drawNews`), full-screen event animations with captions (`eventFX(k,cap)`), prizes (`MILES`, `checkMiles`), world markets (`WORLD`, `S.wm`, `curWM`, `WM_OF`, London sealed best-and-final `sealedSheet`, New York board rejections, Dubai off-plan, Paris heritage, national bonus `natOn`), takeovers + turf (`takeover`, `turfDone`, `siegeTick`, `S.turf` +5% rent), seasons (`season()`, `sxp`, `S.sx`, premium `S.sp`), trophy room + cosmetics (`S.frames`, `S.paddles`, `applyPaddle`), mystery lots (`L.mystery`), day-7 Prime lot (`A.prime`). `monthTick()` runs once per econ month. `?debug=1` exposes `window.EAT_DEBUG` for tests.
- Pacing (Matt, 19 Oct): sessions are short, so events should land densely. Three R18+ shocks in nine minutes is fine; keep `S.shockCalm` at 90 months, don't stretch it.

## Auction overhaul (v30, 19 Oct feedback: "so much info, can't even see the property")
- News + notifications: `#news` row in the header (all tabs): bell with unread count, headlines fade in sentence case (`drawNews`). Every `toast()` and prize lands in `S.inbox` (60 kept, in `carry()`), `S.inboxSeen` drives the badge; `inboxSheet()` lists headlines + history.
- Top row never scrolls: goal chip + one Market button (`mkSheet()`, `chipList()`, `chipAct()`) holding Auto, tiers, world markets, city filter. Event buttons show one at a time (`eventPill()`: Defend > Auction Night > Featured countdown). Hot lot and Showdown are gone from the top row; Showdown lives in the menu (`mnSd`).
- Lot card: the photo takes the room (`.artwrap`), address + guide sit on it (`#lotInfo`, tap = flip). The old If you win popover is the card's back (`#ifwin` inside `#lotCard`, `flipLot(on)`, `closeIw()`), with the home's specs, set note and valuer/hazard line (`#backNote`). No dock verdict row any more; when you can't pay, the bid button reads "Need $X" and opens `cashSheet()`. Registrations line only shows at 2 or fewer.
- Tour button removed: swipe the photo (or the side arrows) through the rooms (`GAL`, `galTo`, `drawGal`, `galHit`, dots in `#galDots`); clues are hotspots on the photo and land as toasts. `houseTour()` is still used from property cards.
- Feedback still open: "looks cheap and tacky, needs proper game graphics". Photos via `OPENAI_API_KEY` are wired but the key isn't set; an art-direction pass is the next big piece.
