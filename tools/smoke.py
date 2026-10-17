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
    props[0].update(land=700, value=585e3, paid=560e3)  # first card: room for a pool, close to the Family line
    seed = dict(cash=500000, props=props, wins=20, rules=3, tour=1, nextId=21, streak=4, lastDay=yday, freezes=1, saved=time.time() * 1000, mktUnlocked=1)
    pg = page(b, "light", seed)
    pg.wait_for_timeout(1500)
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
    pg.close()
    b.close()

print("errors:", errors or "none")
sys.exit(1 if errors else 0)
