"""Headless smoke test at phone size (light + dark). Fails on any page error.
Covers: first-lot coach + win, live strip + auto-bid, focus swap, quick play, market
unlock/search/watch, badges, menu, session recap, daily streak, portfolio paging.
Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tools/smoke.py [url]
"""
import sys, json, time, random, pathlib, datetime
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
url = sys.argv[1] if len(sys.argv) > 1 else (ROOT / "public/index.html").as_uri()
out = ROOT / "shots"; out.mkdir(exist_ok=True)
errors = []
IGNORE = ("ERR_TUNNEL", "fonts.g", "net::ERR", "Failed to load resource")


def page(b, scheme, seed=None, q="?mkt=0&debug=1"):
    pg = b.new_page(viewport={"width": 360, "height": 643}, device_scale_factor=2, color_scheme=scheme)
    pg.on("pageerror", lambda e: errors.append(f"{scheme}: {e}"))
    pg.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(f"{scheme} console: {m.text}"))
    if seed:
        pg.add_init_script("if(!sessionStorage.getItem('seeded')){localStorage.setItem('dopamine-property-v1',%s);sessionStorage.setItem('seeded','1')}" % json.dumps(json.dumps(seed)))
    u = url + q; u += ("&" if "?" in u else "?") + "3d=0"  # logic checks run with the 3D street off (tested separately)
    pg.set_default_timeout(10000); pg.goto(u); pg.wait_for_timeout(700)
    return pg


def esec(pg, k):
    pg.evaluate("document.querySelector('#eSecBtn').click()"); pg.wait_for_timeout(150)
    pg.evaluate("document.querySelector('[data-sec=%s]').click()" % k); pg.wait_for_timeout(250)


def fits(pg, sel, label):
    d = pg.evaluate("s=>{const e=document.querySelector(s);return e.scrollHeight-e.clientHeight}", sel)
    if d > 1: errors.append(f"{label}: {sel} scrolls by {d}px")
    return d


def close_sheets(pg):
    # v39: a fresh player meets onboarding (name -> home market -> 9-step tour) before anything else
    for _ in range(16):
        if not pg.is_visible("#modal"): break
        if pg.is_visible("#onbName"):
            pg.fill("#onbName", "Smoke"); pg.click("#onbGo"); pg.wait_for_timeout(400); continue
        if pg.is_visible("#lkDone"):
            pg.click("#lkDone"); pg.wait_for_timeout(400); continue
        if pg.is_visible("#wnGo"):
            pg.click("#wnGo"); pg.wait_for_timeout(250); continue
        if pg.is_visible("#homeOk"):
            pg.click("#homeOk"); pg.wait_for_timeout(400); continue
        if pg.is_visible("#tNext"):
            pg.click("#tNext"); pg.wait_for_timeout(150); continue
        pg.locator("#sheet button").last.click(); pg.wait_for_timeout(250)


def play_lot(pg, limit=250):
    for _ in range(limit):
        if pg.is_visible("#modal"): close_sheets(pg)
        if pg.is_enabled("#bidBtn") and "Overpaying" not in pg.inner_text("#verdict"):
            try: pg.click("#bidBtn", timeout=800)
            except Exception: pass  # the button can disable between the check and the click (you took the lead, auto-bid fired)
        pg.wait_for_timeout(100)
        if pg.is_visible("#result"):
            return pg.inner_text("#result")
    return ""


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- new player ----------
    for scheme in ["light", "dark"]:
        pg = page(b, scheme)
        assert pg.is_visible("#coach"), "first-lot coach missing"
        assert not pg.is_visible("#tM"), "market tab should be gone"
        pg.screenshot(path=str(out / f"v11-first-{scheme}.png"))
        res = play_lot(pg)
        print(scheme, "first lot:", res[:110])
        if scheme == "light":
            pg.screenshot(path=str(out / "v11-firstwin.png"))
        pg.wait_for_timeout(4500); close_sheets(pg)
        live = pg.locator(".lv").count()
        print(scheme, "live cards after first win:", live)
        if live:
            en = pg.locator(".lvauto:not([disabled])")
            if en.count(): en.first.click(); pg.wait_for_timeout(300)
            else: print(scheme, "live auto buttons all disabled (past walk-away or short on cash), skipped")
            pg.screenshot(path=str(out / f"v11-live-{scheme}.png"))
            pg.locator(".lvmain").last.click(); pg.wait_for_timeout(400)
            print(scheme, "focused lot:", pg.inner_text("#addr"))
        if pg.is_visible("#coach"): pg.click("#coach button")
        pg.click(".tright .hotbtn") if pg.is_visible(".tright .hotbtn") else None
        pg.wait_for_timeout(200)
        # a few more lots to exercise background resolution
        for _ in range(2):
            play_lot(pg); pg.wait_for_timeout(4300); close_sheets(pg)
        print(scheme, "reveal shown:", pg.locator(".reveal").count() > 0 or "after win only")
        fits(pg, "#vAuction", scheme + " auction")
        pg.screenshot(path=str(out / f"v25-auction-{scheme}.png"))
        if pg.is_visible("#coach"): pg.click("#coach button")
        if pg.inner_text("#bidBtn").upper().startswith("NEED"):
            pg.click("#bidBtn"); pg.wait_for_timeout(300)
            if pg.is_visible("#modal"): print(scheme, "bid button opened the cash sheet:", pg.inner_text("#sheet")[:60].replace("\n", " ")); pg.screenshot(path=str(out / f"v26-cash-{scheme}.png")); close_sheets(pg)
        pg.click("#lotInfo"); pg.wait_for_timeout(500)
        if pg.is_visible("#ifwin"): pg.screenshot(path=str(out / f"v25-ifwin-{scheme}.png")); pg.click("#iwX"); pg.wait_for_timeout(400)
        # swipe tour: the next-room arrow on the photo
        if pg.locator("#art .galnav.next").count() and pg.is_enabled("#art .galnav.next"):
            pg.click("#art .galnav.next"); pg.wait_for_timeout(400); print(scheme, "gallery room:", pg.inner_text("#art .galname") if pg.locator("#art .galname").count() else "none"); pg.screenshot(path=str(out / f"v30-gallery-{scheme}.png"))
        pg.click("#tE"); pg.wait_for_timeout(800)
        fits(pg, "#vEmpire", scheme + " empire overview")
        pg.screenshot(path=str(out / f"v25-overview-{scheme}.png"))
        pg.click("#hStars"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(out / f"v25-dynasty-{scheme}.png")); close_sheets(pg)
        esec(pg, "bad")
        pg.screenshot(path=str(out / f"v11-empire-{scheme}.png"))
        print(scheme, "badges:", pg.inner_text("#bCount"))
        pg.click("#help"); pg.wait_for_timeout(300)
        pg.click("#mnRecap"); pg.wait_for_timeout(300)
        pg.screenshot(path=str(out / f"v11-recap-{scheme}.png"))
        close_sheets(pg)
        ow = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        if ow > 1: errors.append(f"{scheme}: horizontal overflow {ow}px")
        pg.close()

    # ---------- returning player: streak + big portfolio ----------
    yday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    props = []
    subs = [("Ipswich", "QLD"), ("Ballarat", "VIC"), ("Bendigo", "VIC")]
    for i in range(1, 21):
        s = subs[i % 3]; v = random.uniform(250e3, 420e3)
        props.append(dict(id=i, addr=f"{i} Banksia Street", street="Banksia Street", sub=s[0], st=s[1], ti=0, style="cottage", seed=i * 7919, rare=False, paid=v, duty=v * .03, prem=0, heat=0, age=20, value=v, vacant=0, boughtAt=0, loan=0))
    props[0].update(land=700, value=585e3, paid=560e3)
    props[1].update(loan=150000)
    props[2].update(land=650, value=300e3, paid=290e3)  # duplex candidate  # first card: room for a pool, close to the Family line
    seed = dict(days=[yday], cash=500000, props=props, wins=20, rules=4, tour=1, nextId=21, streak=4, lastDay=yday, freezes=1, saved=time.time() * 1000, mktUnlocked=1, slotsBought=1)
    pg = page(b, "light", seed)
    pg.wait_for_timeout(1500)
    print("today's lot tag:", pg.is_visible("#art .daily"))
    pg.screenshot(path=str(out / "v11-streak.png"))
    print("streak sheet:", pg.inner_text("#sheet")[:80].replace("\n", " ") if pg.is_visible("#modal") else "none")
    close_sheets(pg)
    pg.screenshot(path=str(out / "v11-header.png"))
    fits(pg, "#vAuction", "returning auction")
    pg.click("#tE"); pg.wait_for_timeout(800)
    fits(pg, "#vEmpire", "returning overview")
    pg.screenshot(path=str(out / "v25-overview-big.png"))
    esec(pg, "sets")
    print("sets:", pg.inner_text("#setList").replace("\n", " "), "| pager:", pg.inner_text("#pgTxt"))
    pg.screenshot(path=str(out / "v11-sets.png"))
    esec(pg, "pf")
    # ---------- upgrades: pool, then a makeover that pushes it into Family ----------
    pg.evaluate("window.scrollTo(0,0)"); pg.locator('[data-up="1"]').scroll_into_view_if_needed()
    pg.screenshot(path=str(out / "v14-portfolio.png"))
    pg.click('[data-up="1"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=str(out / "v14-upgrade-sheet.png"))
    print("upgrade sheet:", pg.inner_text("#sheet").replace("\n", " | ")[:300])
    pg.click('[data-upk="pool"]'); pg.wait_for_timeout(1500)
    card = '.prop[data-id="1"]'
    print("during works:", pg.inner_text(card + ' [data-k="r"]'))
    pg.locator(card).screenshot(path=str(out / "v14-works.png"))
    pg.wait_for_timeout(1500); pg.evaluate("EAT_DEBUG.finishAll()"); pg.wait_for_timeout(600); close_sheets(pg)
    print("after pool:", pg.inner_text(card + " .psub"), pg.inner_text(card + ' [data-k="v"]'))
    pg.wait_for_timeout(1200); close_sheets(pg); pg.click('[data-up="1"]'); pg.wait_for_timeout(400)
    if not pg.locator('[data-upk="reno"]').count(): print("upgrade sheet after pool:", pg.inner_text("#sheet").replace("\n", " | ")[:300])
    pg.click('[data-upk="reno"]'); pg.wait_for_timeout(1500); pg.evaluate("EAT_DEBUG.finishAll()"); pg.wait_for_timeout(600); close_sheets(pg)
    print("after makeover:", pg.inner_text(card + " .psub"), pg.inner_text(card + ' [data-k="v"]'))
    assert "Family" in pg.inner_text(card + " .psub"), "makeover should push it into Family"
    pg.locator(card).screenshot(path=str(out / "v14-upgraded.png"))
    # ---------- redevelop: duplex ----------
    n0 = pg.locator(".prop").count()
    pg.click('[data-up="3"]'); pg.wait_for_timeout(300); pg.screenshot(path=str(out / "v18-redev-sheet.png"))
    pg.click('[data-rdk="duplex"]'); pg.wait_for_timeout(1500)
    pg.locator('.prop[data-id="3"]').screenshot(path=str(out / "v18-building.png"))
    pg.evaluate("EAT_DEBUG.finishAll()")
    for _ in range(6):
        pg.wait_for_timeout(1000); close_sheets(pg)
        if "Duplex" in pg.inner_text('.prop[data-id="3"] .psub'): break
    print("duplex:", pg.inner_text('.prop[data-id="3"] .pname'), "|", pg.inner_text('.prop[data-id="3"] .psub'), "| homes", pg.inner_text("#pCount"))
    assert "1/" in pg.inner_text('.prop[data-id="3"] .pname'), "duplex should split into 1/ and 2/"
    # ---------- bank: rate lock ----------
    close_sheets(pg); esec(pg, "mo"); pg.locator("#bankBox").scroll_into_view_if_needed(); pg.wait_for_timeout(1200); close_sheets(pg)
    pg.screenshot(path=str(out / "v15-bank.png"))
    pg.evaluate("document.querySelector('[data-bank=\"lock\"]').click()"); pg.wait_for_timeout(1200)
    print("bank:", pg.inner_text("#bankRows").replace("\n", " | ")[:160])
    pg.close()

    # ---------- mansion + mansion tax ----------
    m = dict(id=1, addr="8 Wattle Road", street="Wattle Road", sub="Mosman", st="NSW", ti=2, style="villa", land=1200, seed=4242, rare=False, paid=2.9e6, duty=0, prem=0, heat=0, age=30, value=3e6, vacant=0, boughtAt=0, loan=0)
    fill = [dict(m, id=i, addr=f"{i} Wattle Road", style="unit", land=0, value=900e3, paid=880e3) for i in (2, 3)]
    seed3 = dict(days=[yday], cash=5e6, props=[m] + fill, wins=5, rules=4, tour=1, nextId=4, maxTier=2, lastDay=datetime.date.today().isoformat(), dailyDay=datetime.date.today().isoformat(), saved=time.time() * 1000, mktUnlocked=1, coach={"bid": 1, "won1": 1, "upgrade": 1})
    pg = page(b, "light", seed3); close_sheets(pg); pg.click("#tE"); pg.wait_for_timeout(600); esec(pg, "pf")
    pg.click('[data-up="1"]'); pg.wait_for_timeout(300); pg.click('[data-rdk="mansion"]')
    for _ in range(45):
        pg.wait_for_timeout(1000); close_sheets(pg)
        if "Mansion" in pg.inner_text('.prop[data-id="1"] .psub'): break
    print("mansion:", pg.inner_text('.prop[data-id="1"] .psub'), pg.inner_text('.prop[data-id="1"] [data-k="v"]'))
    pg.locator('.prop[data-id="1"]').screenshot(path=str(out / "v18-mansion.png"))
    pg.click('[data-sell="1"]'); pg.wait_for_timeout(300); pg.screenshot(path=str(out / "v20-sell-sheet.png")); pg.click('[data-agent]'); pg.wait_for_timeout(600)
    toasts = []
    for _ in range(5):
        toasts += pg.locator(".toast").all_inner_texts()
        if any("mansion tax" in y for y in toasts) or not pg.locator(".toast").count(): break
        pg.locator(".toast").first.click(); pg.wait_for_timeout(700)
    print("sale:", [y for y in toasts if "Sold" in y][:1])
    _sold = [x for x in toasts if "Sold" in x]
    _big = bool(_sold) and ("M." in _sold[0].split(" for $")[1][:8]) and float(_sold[0].split(" for $")[1].split("M")[0]) >= 5
    # events (v29) can knock the value under the $5M line, so only check the tax when it applies
    assert (not _big) or any("mansion tax" in x for x in toasts), "mansion tax should show on the sale"
    pg.close()

    # ---------- sell at auction + featured auction ----------
    h = dict(id=1, addr="4 Saltwater Lane", street="Saltwater Lane", sub="Bendigo", st="VIC", ti=0, style="cottage", land=600, seed=777, rare=False, paid=300e3, duty=0, prem=0, heat=0, age=30, value=340e3, vacant=0, boughtAt=0, loan=0)
    seed4 = dict(days=[yday], cash=2e6, props=[h], wins=5, rules=4, tour=1, nextId=2, maxTier=0, lastDay=datetime.date.today().isoformat(), dailyDay=datetime.date.today().isoformat(), featAt=time.time() * 1000 + 3600e3, saved=time.time() * 1000, coach={"bid": 1, "won1": 1, "upgrade": 1, "live": 1})
    pg = page(b, "dark", seed4); close_sheets(pg); pg.click("#tE"); pg.wait_for_timeout(500); esec(pg, "pf")
    pg.click('[data-sell="1"]'); pg.wait_for_timeout(300); pg.click('[data-res="1"]'); pg.wait_for_timeout(1200)
    print("sell auction tag:", pg.is_visible("#art .mine"), "| bid:", pg.inner_text("#bidBtn"), "| verdict:", pg.inner_text("#verdict").replace("\n", " "))
    pg.screenshot(path=str(out / "v20-sell-live.png"))
    for _ in range(90):
        pg.wait_for_timeout(500)
        if pg.is_visible("#result"): break
    print("sell result:", pg.inner_text("#result")[:120]); pg.screenshot(path=str(out / "v20-sell-end.png"))
    pg.close()
    seed5 = dict(seed4, featAt=time.time() * 1000 - 1000)
    pg = page(b, "light", seed5); close_sheets(pg); pg.wait_for_timeout(500)
    print("featured:", pg.is_visible("#featTag") and pg.inner_text("#featTag"), "| rivals:", pg.locator("#pads .pad").count() - 1)
    pg.screenshot(path=str(out / "v20-featured.png"))
    pg.click("#autoBtn"); 
    for _ in range(200):
        pg.wait_for_timeout(100)
        if pg.inner_text("#callBig").upper().startswith("YOUR CALL"): print("final call cue shown"); pg.screenshot(path=str(out / "v20-yourcall.png")); break
        if pg.is_visible("#result"): break
    res = play_lot(pg); print("featured result:", res[:80]); pg.wait_for_timeout(1800)
    if pg.locator(".reveal").count(): print("reveal:", pg.inner_text(".reveal").replace("\n", " | ")); pg.screenshot(path=str(out / "v20-reveal.png"))
    pg.close()

    # ---------- dynasty cash-out keeps account-level state ----------
    big = dict(id=1, addr="1 Harbourview Road", street="Harbourview Road", sub="Vaucluse", st="NSW", ti=3, style="villa", land=3000, seed=99, rare=False, paid=5e7, duty=0, prem=0, heat=0, age=30, value=1.3e8, vacant=0, boughtAt=0, loan=0)
    seed6 = dict(days=[yday], cash=1e6, props=[big], wins=9, rules=4, tour=1, nextId=2, maxTier=3, regVar=1, mkVar=0, joined=40, reg=dict(n=3, at=time.time()*1000), adFree=dict(at=1), badges={"first_win": 1, "rare": 1}, streak=6, lastDay=datetime.date.today().isoformat(), dailyDay=datetime.date.today().isoformat(), saved=time.time() * 1000)
    pg = page(b, "light", seed6, ""); close_sheets(pg)
    print("goal chip at the top:", pg.inner_text("#goalChip"))
    pg.click("#hStars"); pg.wait_for_timeout(300); pg.screenshot(path=str(out / "v25-dynasty-ready.png"))
    pg.click("#legacyBtn"); pg.wait_for_timeout(200); pg.click("#legacyBtn"); pg.wait_for_timeout(800)
    print("cash-out modal:", pg.inner_text("#sheet").replace("\n", " ")[:160]); close_sheets(pg); pg.wait_for_timeout(3500)
    st = pg.evaluate("JSON.parse(localStorage.getItem('dopamine-property-v1'))")
    kept = {k: st.get(k) for k in ["regVar", "mkVar", "joined", "adFree", "streak", "dynasties", "legacy"]}; kept["header"] = pg.inner_text("#hStars"); kept["badges"] = sorted((st.get("badges") or {}).keys())
    print("after cash-out:", kept, "| market tab visible:", pg.is_visible("#tM"))
    assert st.get("regVar") == 1 and st.get("mkVar") == 1 and st.get("adFree") and st.get("streak") == 6 and "rare" in kept["badges"], "account state lost on cash-out"
    assert "rank1" in kept["badges"] and st.get("legacy", 0) >= 1, "stars and title badge should land on cash-out"
    pg.close()

    # ---------- Market A/B: control group keeps the Market tab ----------
    pg = page(b, "light", None, "?mkt=1"); close_sheets(pg)
    print("market kept: tab in DOM", pg.locator("#tM").count(), "| visible before first win:", pg.is_visible("#tM"))
    play_lot(pg); pg.wait_for_timeout(3500); close_sheets(pg)
    print("market kept: tab visible after a win:", pg.is_visible("#tM")); pg.close()

    # ---------- registrations (limited variant, nearly out) ----------
    import re as _re
    _html = (ROOT / "public/index.html").read_text(); _b = _html[_html.index("const BADGES=["):]; _b = _b[:_b.index("]];")]
    allb = {k: 1 for k in _re.findall(r"\['([a-z0-9_]+)','", _b)}
    seed2 = dict(seed, miles={k: 1 for k in ["w1m","w10m","w100m","w1b","h10","h25","life50","epic3","storm","lucky5","turf","world3"]}, cash=3e6, badges=allb, regVar=1, joined=25, reg=dict(n=1, at=time.time() * 1000), dailyDay=datetime.date.today().isoformat(), lastDay=datetime.date.today().isoformat(), coach={"bid": 1, "won1": 1})
    pg = page(b, "dark", seed2); close_sheets(pg)
    print("reg line:", pg.inner_text("#regInfo"))
    res = play_lot(pg, 600); print("reg lot:", res[:60]); pg.wait_for_timeout(4500); close_sheets(pg)
    pg.wait_for_timeout(300)
    for _ in range(40):
        bidtxt = pg.inner_text("#bidBtn")
        if "NO REGOS" in bidtxt.upper(): break
        close_sheets(pg); pg.wait_for_timeout(250)
    pg.screenshot(path=str(out / "v15-reg-out.png"))
    print("reg after:", pg.inner_text("#regInfo"), "| bid:", bidtxt)
    assert "NO REGOS" in bidtxt.upper(), "should be out of registrations"
    pg.close()
    b.close()

print("errors:", errors or "none")
sys.exit(1 if errors else 0)
