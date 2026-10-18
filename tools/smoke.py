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


def page(b, scheme, seed=None):
    pg = b.new_page(viewport={"width": 360, "height": 643}, device_scale_factor=2, color_scheme=scheme)
    pg.on("pageerror", lambda e: errors.append(f"{scheme}: {e}"))
    pg.on("console", lambda m: m.type == "error" and not any(s in m.text for s in IGNORE) and errors.append(f"{scheme} console: {m.text}"))
    if seed:
        pg.add_init_script("if(!sessionStorage.getItem('seeded')){localStorage.setItem('dopamine-property-v1',%s);sessionStorage.setItem('seeded','1')}" % json.dumps(json.dumps(seed)))
    pg.goto(url); pg.wait_for_timeout(700)
    return pg


def close_sheets(pg):
    for _ in range(4):
        if pg.is_visible("#modal"):
            pg.locator("#sheet button").last.click(); pg.wait_for_timeout(250)


def play_lot(pg, limit=250):
    for _ in range(limit):
        if pg.is_visible("#modal"): close_sheets(pg)
        if pg.is_enabled("#bidBtn") and "Overpaying" not in pg.inner_text("#verdict"):
            pg.click("#bidBtn")
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
        assert "locked" in pg.get_attribute("#tM", "class"), "market should start locked"
        pg.screenshot(path=str(out / f"v11-first-{scheme}.png"))
        res = play_lot(pg)
        print(scheme, "first lot:", res[:110])
        if scheme == "light":
            pg.screenshot(path=str(out / "v11-firstwin.png"))
        pg.wait_for_timeout(4500); close_sheets(pg)
        live = pg.locator(".lv").count()
        print(scheme, "live cards after first win:", live)
        if live:
            pg.locator(".lvauto").first.click(); pg.wait_for_timeout(300)
            pg.screenshot(path=str(out / f"v11-live-{scheme}.png"))
            pg.locator(".lvmain").last.click(); pg.wait_for_timeout(400)
            print(scheme, "focused lot:", pg.inner_text("#addr"))
        pg.click("#lvStrip .hotbtn") if pg.is_visible("#lvStrip .hotbtn") else None
        pg.wait_for_timeout(200)
        # a few more lots to exercise background resolution
        for _ in range(2):
            play_lot(pg); pg.wait_for_timeout(4300); close_sheets(pg)
        if "locked" not in (pg.get_attribute("#tM", "class") or ""):
            pg.click("#tM"); pg.wait_for_timeout(700); close_sheets(pg)
            pg.fill("#mQ", "ball"); pg.wait_for_timeout(600)
            print(scheme, "search 'ball':", pg.inner_text("#mCount"))
            if pg.locator(".star").count():
                pg.locator(".star").first.click(); pg.wait_for_timeout(1200)
                print(scheme, "watching rows:", pg.locator(".wrow").count())
            pg.screenshot(path=str(out / f"v11-market-{scheme}.png"))
        pg.click("#tE"); pg.wait_for_timeout(800)
        pg.evaluate("document.getElementById('badgeFold').open=true")
        pg.locator("#badges").scroll_into_view_if_needed()
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
    seed = dict(days=[yday], cash=500000, props=props, wins=20, rules=3, tour=1, nextId=21, streak=4, lastDay=yday, freezes=1, saved=time.time() * 1000, mktUnlocked=1)
    pg = page(b, "light", seed)
    pg.wait_for_timeout(1500)
    print("today's lot tag:", pg.is_visible("#art .daily"))
    pg.screenshot(path=str(out / "v11-streak.png"))
    print("streak sheet:", pg.inner_text("#sheet")[:80].replace("\n", " ") if pg.is_visible("#modal") else "none")
    close_sheets(pg)
    pg.screenshot(path=str(out / "v11-header.png"))
    pg.click("#tE"); pg.wait_for_timeout(800)
    print("sets:", pg.inner_text("#setList").replace("\n", " "), "| pager:", pg.inner_text("#pgTxt"))
    pg.locator("#setsBox").scroll_into_view_if_needed(); pg.screenshot(path=str(out / "v11-sets.png"))
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
    pg.wait_for_timeout(6500); close_sheets(pg)
    print("after pool:", pg.inner_text(card + " .psub"), pg.inner_text(card + ' [data-k="v"]'))
    pg.click('[data-up="1"]'); pg.wait_for_timeout(300); pg.click('[data-upk="reno"]'); pg.wait_for_timeout(13500); close_sheets(pg)
    print("after makeover:", pg.inner_text(card + " .psub"), pg.inner_text(card + ' [data-k="v"]'))
    assert "Family" in pg.inner_text(card + " .psub"), "makeover should push it into Family"
    pg.locator(card).screenshot(path=str(out / "v14-upgraded.png"))
    # ---------- redevelop: duplex ----------
    n0 = pg.locator(".prop").count()
    pg.click('[data-up="3"]'); pg.wait_for_timeout(300); pg.screenshot(path=str(out / "v18-redev-sheet.png"))
    pg.click('[data-rdk="duplex"]'); pg.wait_for_timeout(1500)
    pg.locator('.prop[data-id="3"]').screenshot(path=str(out / "v18-building.png"))
    for _ in range(40):
        pg.wait_for_timeout(1000); close_sheets(pg)
        if "Duplex" in pg.inner_text('.prop[data-id="3"] .psub'): break
    print("duplex:", pg.inner_text('.prop[data-id="3"] .pname'), "|", pg.inner_text('.prop[data-id="3"] .psub'), "| homes", pg.inner_text("#pCount"))
    assert "1/" in pg.inner_text('.prop[data-id="3"] .pname'), "duplex should split into 1/ and 2/"
    # ---------- bank: rate lock ----------
    pg.evaluate("document.querySelector('.bills.fold').open=true"); pg.locator("#bankBox").scroll_into_view_if_needed(); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(out / "v15-bank.png"))
    pg.click('[data-bank="lock"]'); pg.wait_for_timeout(1200)
    print("bank:", pg.inner_text("#bankRows").replace("\n", " | ")[:160])
    pg.close()

    # ---------- mansion + mansion tax ----------
    m = dict(id=1, addr="8 Wattle Road", street="Wattle Road", sub="Mosman", st="NSW", ti=2, style="villa", land=1200, seed=4242, rare=False, paid=2.9e6, duty=0, prem=0, heat=0, age=30, value=3e6, vacant=0, boughtAt=0, loan=0)
    seed3 = dict(days=[yday], cash=5e6, props=[m], wins=5, rules=3, tour=1, nextId=2, maxTier=2, lastDay=datetime.date.today().isoformat(), dailyDay=datetime.date.today().isoformat(), saved=time.time() * 1000, mktUnlocked=1, coach={"bid": 1, "won1": 1, "upgrade": 1})
    pg = page(b, "light", seed3); close_sheets(pg); pg.click("#tE"); pg.wait_for_timeout(600)
    pg.click('[data-up="1"]'); pg.wait_for_timeout(300); pg.click('[data-rdk="mansion"]')
    for _ in range(45):
        pg.wait_for_timeout(1000); close_sheets(pg)
        if "Mansion" in pg.inner_text('.prop[data-id="1"] .psub'): break
    print("mansion:", pg.inner_text('.prop[data-id="1"] .psub'), pg.inner_text('.prop[data-id="1"] [data-k="v"]'))
    pg.locator('.prop[data-id="1"]').screenshot(path=str(out / "v18-mansion.png"))
    pg.click('[data-sell="1"]'); pg.wait_for_timeout(200); pg.click('[data-sell="1"]'); pg.wait_for_timeout(600)
    toasts = []
    for _ in range(5):
        toasts += pg.locator(".toast").all_inner_texts()
        if any("mansion tax" in y for y in toasts) or not pg.locator(".toast").count(): break
        pg.locator(".toast").first.click(); pg.wait_for_timeout(700)
    print("sale:", [y for y in toasts if "Sold" in y][:1])
    assert any("mansion tax" in x for x in toasts), "mansion tax should show on the sale"
    pg.close()

    # ---------- registrations (limited variant, nearly out) ----------
    allb = {k: 1 for k in ["first_win","steal","steal5","rare","combo2","combo3","set_suburb","set_street","landlord10","magnate25","family","prestige","flip","debt_free","reno","developer","new_class","nemesis","streak3","streak7"]}
    seed2 = dict(seed, cash=3e6, badges=allb, regVar=1, joined=25, reg=dict(n=1, at=time.time() * 1000), dailyDay=datetime.date.today().isoformat(), lastDay=datetime.date.today().isoformat(), coach={"bid": 1, "won1": 1})
    pg = page(b, "dark", seed2); close_sheets(pg)
    print("reg line:", pg.inner_text("#regInfo"))
    res = play_lot(pg); print("reg lot:", res[:60]); pg.wait_for_timeout(4500); close_sheets(pg)
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
