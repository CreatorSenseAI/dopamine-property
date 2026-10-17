"""Headless smoke test: loads the game at phone size, walks the tour, plays a few
auctions, and screenshots each screen. Fails on any page error.
Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tools/smoke.py [url]
"""
import sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
url = sys.argv[1] if len(sys.argv) > 1 else (ROOT / "public/index.html").as_uri()
out = ROOT / "shots"
out.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ["light", "dark"]:
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme=scheme)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append("console: " + m.text))
        pg.goto(url)
        pg.wait_for_timeout(600)
        if scheme == "light":
            for i in range(4):
                pg.screenshot(path=str(out / f"tour{i+1}.png"))
                pg.click("#tNext")
                pg.wait_for_timeout(250)
        else:
            if pg.is_visible("#tNext"):
                for i in range(4):
                    pg.click("#tNext"); pg.wait_for_timeout(150)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(out / f"auction-{scheme}.png"))
        # play: bid by hand until the lot ends, a few lots
        won = False
        for lot in range(6):
            for _ in range(200):
                if pg.is_enabled("#bidBtn"):
                    v = pg.inner_text("#verdict")
                    if "Overpaying" not in v:
                        pg.click("#bidBtn")
                pg.wait_for_timeout(100)
                if pg.is_visible("#result"):
                    break
            txt = pg.inner_text("#result") if pg.is_visible("#result") else ""
            print(scheme, "lot", lot, "->", txt[:140])
            if "Bank values" in txt and not won:
                won = True
                pg.screenshot(path=str(out / f"won-{scheme}.png"))
            pg.wait_for_timeout(4500)
            if won and lot >= 2:
                break
        pg.screenshot(path=str(out / f"auction2-{scheme}.png"))
        pg.click("#tE"); pg.wait_for_timeout(1200)
        pg.screenshot(path=str(out / f"empire-{scheme}.png"), full_page=False)
        pg.click("#tM"); pg.wait_for_timeout(1200)
        pg.screenshot(path=str(out / f"market-{scheme}.png"))
        pg.click("#tA"); pg.wait_for_timeout(300)
        # horizontal overflow check
        ow = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        if ow > 1:
            errors.append(f"horizontal overflow {ow}px")
        pg.close()
    b.close()

print("errors:", errors or "none")
sys.exit(1 if errors else 0)
