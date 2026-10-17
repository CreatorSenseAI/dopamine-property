"""Builds public/index.html (the overhauled game) from original/index.html.

Keeps the game engine intact and swaps in the new UI: deal meter, "if you win"
panel, bid dock, goal strip, first-run walkthrough, reworked Empire tab.
Run: python3 tools/build.py
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "original/index.html").read_text()
lines = src.split("\n")


def sub(text, old, new, count=1):
    n = text.count(old)
    if n != count:
        sys.exit(f"expected {count} match(es), found {n}: {old[:80]!r}")
    return text.replace(old, new)


# ---------- pieces of the original ----------
style_start = next(i for i, l in enumerate(lines) if l.strip() == "<style>")
style_end = next(i for i, l in enumerate(lines) if l.strip() == "</style>")
css = "\n".join(lines[style_start + 1:style_end])
script_start = next(i for i, l in enumerate(lines) if l.strip() == "<script>")
script_end = max(i for i, l in enumerate(lines) if l.strip() == "</script>")
js = "\n".join(lines[script_start + 1:script_end])

# ---------- head ----------
HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dopamine Property: the property auction game</title>
<meta name="description" content="Bid against rival investors, build a property empire and climb the rich list. A fast, free browser game about Aussie property auctions.">
<meta name="theme-color" content="#13203a">
<meta property="og:type" content="website">
<meta property="og:title" content="Dopamine Property">
<meta property="og:description" content="Bid against rival investors at live auctions, collect rent, dodge the bills and climb the rich list. Free in your browser.">
<meta name="twitter:card" content="summary">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='6' y='6' width='52' height='52' rx='8' fill='%23d7263d' transform='rotate(-4 32 32)'/%3E%3Ctext x='32' y='43' font-family='Impact,Arial Black,sans-serif' font-size='28' fill='white' text-anchor='middle'%3EDP%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Familjen+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
html,body{margin:0;padding:0}
[hidden]:not([hidden=until-found i]){display:none!important}
"""

NEW_CSS = r"""
/* ================= UX overhaul ================= */
#app{grid-template-rows:auto 1fr auto auto}
.top{gap:10px}
.help{border:1px solid var(--line);background:var(--sunk);width:34px;height:34px;display:grid;place-items:center;border-radius:8px;font-weight:800;font-size:15px;flex:none}
.ledger strong.pos{color:var(--green)}
.ledger strong.neg{color:var(--red)}
@media (max-width:440px){.mark span{display:none}.ledger{gap:10px}.ledger strong{font-size:13.5px}.ledger small{font-size:9px}}
.pos{color:var(--green)}.neg{color:var(--red)}

/* goal strip */
.goal{display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:9px 12px;text-align:left;width:100%}
.goal{padding:8px 12px;gap:5px}
.goal .gl{display:flex;align-items:baseline;gap:8px;font-size:13px;min-width:0}
.goal .gl span{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.goal small{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);flex:none}
.goal em{font-style:normal;font-family:var(--f-mono);font-size:12px;color:var(--muted);flex:none}
.goal .bar{height:6px}

/* lot card */
.art{max-height:19vh}
@media (min-height:900px){.art{max-height:24vh}}
.lotinfo{padding:10px 14px 2px}
.specs{padding:4px 14px 10px;flex-wrap:nowrap;overflow:hidden;white-space:nowrap;-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent)}
.live .deal{grid-column:1/-1;border-top:0;padding:2px 0 4px}

/* deal meter */
.deal{border-top:1px dashed var(--line);padding:10px 14px 12px;display:flex;flex-direction:column;gap:6px}
.dhead{display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
.dhead small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.dhead .r{text-align:right}
.est{font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-weight:600;font-size:14px}
.meter{position:relative;height:12px;margin:22px 0 4px}
.track{position:absolute;inset:0;border-radius:6px;overflow:hidden;background:var(--sunk)}
.track i{position:absolute;top:0;bottom:0}
.z-steal{background:#17804f}.z-good{background:#55b97a}.z-fair{background:#f2c14e}.z-over{background:#d7263d}
.meter .wa{position:absolute;top:-4px;bottom:-4px;border-left:2px dashed var(--ink);transform:translateX(-1px)}
.meter .mk{position:absolute;top:-6px;bottom:-6px;width:4px;margin-left:-2px;background:var(--ink);border-radius:2px;box-shadow:0 0 0 2px var(--surface);transition:left .25s ease}
.meter .mk span{position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);white-space:nowrap;font-family:var(--f-mono);font-size:11px;font-weight:600;background:var(--ink);color:var(--bg);padding:1px 6px;border-radius:4px}
.meter .mk.l span{left:0;transform:none}.meter .mk.r span{left:auto;right:0;transform:none}
.legend{display:flex;justify-content:space-between;gap:6px;font-size:11px;color:var(--muted);flex-wrap:wrap}
.legend span{display:flex;align-items:center;gap:4px}
.legend i{width:8px;height:8px;border-radius:2px;display:inline-block}

/* verdict pill */
.vd{display:inline-flex;align-items:center;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px;white-space:nowrap;flex:none}
.vd.steal{background:#17804f;color:#fff}.vd.good{background:#2f9c5d;color:#fff}.vd.fair{background:#f2c14e;color:#1a1200}.vd.over{background:#d7263d;color:#fff}.vd.na{background:var(--sunk);color:var(--muted)}

/* if you win */
.ifwin{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.ifwin h2{font-size:17px;margin:0;display:flex;justify-content:space-between;align-items:center;gap:8px}
.iw{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.iw div{background:var(--sunk);border-radius:10px;padding:8px 9px;display:flex;flex-direction:column;gap:2px;min-width:0}
.iw small{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.iw strong{font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-size:16px}
.iw em{font-style:normal;font-size:11.5px;color:var(--muted);line-height:1.25}
.iw em.neg{color:var(--red)}
.incline{font-size:13px;color:var(--muted)}
.incline b{font-family:var(--f-mono);font-weight:600}
@media (max-width:360px){.iw strong{font-size:14px}}

/* bid dock: always on screen */
.dock{background:var(--surface);border-top:1px solid var(--line);padding:10px 16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 -6px 18px var(--shadow);z-index:4;width:100%;max-width:520px;margin:0 auto}
.verdict{display:flex;align-items:center;gap:8px;font-size:13px;min-height:24px;min-width:0}
.verdict .vtxt{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.verdict .vtxt b{color:var(--ink);font-family:var(--f-mono);font-weight:600}
.dock .bid{padding:13px 12px}
.dock .row{flex-wrap:nowrap}
.dock .auto{flex:1 1 auto}
.dock .skip{flex:none}
.auto .lim{font-size:12.5px;white-space:nowrap}

/* walkthrough */
.tour{text-align:left}
.tour .tstep{font-family:var(--f-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.tour h3{text-align:left}
.tour p{color:var(--ink);opacity:.85}
.tour p b{opacity:1}
.tour .demo{background:var(--sunk);border-radius:12px;padding:6px 12px 10px;margin:4px 0 14px}
.tour .dots{display:flex;gap:6px;justify-content:center;margin:2px 0 12px}
.tour .dots i{width:7px;height:7px;border-radius:50%;background:var(--line)}
.tour .dots i.on{background:var(--red)}
.tour .tbtns{display:flex;gap:8px}
.tour .tbtns .back{background:var(--sunk);color:var(--ink);flex:0 0 34%}
.tour .tiers{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 14px}
.tour .tiers span{font-size:12px;font-weight:700;padding:4px 8px;border-radius:999px;background:var(--sunk)}
.tour .tiers span:first-child{background:var(--ink);color:var(--bg)}

/* empire */
.hinc{font-size:14px;font-weight:600;margin:-4px 0 12px}
.hinc.pos{color:#5fe0a0}.hinc.neg{color:#ff8a98}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .hinc.pos{color:#17804f}:root:not([data-theme="light"]) .hinc.neg{color:#c21f35}}
:root[data-theme="dark"] .hinc.pos{color:#17804f}:root[data-theme="dark"] .hinc.neg{color:#c21f35}
.pill.pos{color:var(--green)}.pill.neg{color:var(--red)}
"""

# ---------- body ----------
BODY = """<div id="app">
  <header class="top">
    <div class="mark"><b>DP</b><span>Dopamine<br>Property</span><button class="stars" id="hStars" hidden aria-label="Legacy stars"></button></div>
    <div class="ledger">
      <div><small>Cash</small><strong id="hCash">$0</strong></div>
      <div><small>Net worth</small><strong id="hWorth">$0</strong></div>
      <div><small>Income/mo</small><strong id="hInc">$0</strong></div>
    </div>
    <button class="help" id="help" aria-label="How to play">?</button>
    <button class="mute" id="mute" aria-label="Sound on"></button>
  </header>

  <main id="vAuction">
    <button class="goal" id="goal" aria-label="Your goal. Open your empire"><div class="gl"><small>Goal</small><span id="goalTxt"></span><em id="goalPct"></em></div><div class="bar"><i id="goalBar"></i></div></button>
    <div class="chips" id="chips" role="group" aria-label="Market tier"></div>

    <section class="lot" id="lotCard" aria-live="polite">
      <div class="art" id="art"></div>
      <div class="lotinfo">
        <div class="addr" id="addr"></div>
        <div class="sub" id="sub"></div>
        <div class="guide"><small>Guide</small><span id="guide"></span></div>
      </div>
      <div class="specs" id="specs"></div>
      <div class="live">
        <div class="cur"><small id="curLbl">Opening bid</small><span class="big" id="bidNow">$0</span><div class="leader" id="leader"></div></div>
        <div class="call"><b id="callTxt">Bidding open</b><span class="num" id="clockTxt">12.0s</span></div>
        <div class="deal" id="deal">
          <div class="dhead">
            <div><small>Valuer&rsquo;s estimate</small><span class="est" id="estTxt"></span></div>
            <div class="r"><small>Walk away at</small><span class="est" id="waTxt"></span></div>
          </div>
          <div class="meter" id="meter"><div class="track" id="track"></div><i class="wa" id="waMk"></i><i class="mk" id="mk"><span id="mkLbl"></span></i></div>
          <div class="legend"><span><i class="z-steal"></i>Steal</span><span><i class="z-good"></i>Good buy</span><span><i class="z-fair"></i>Fair</span><span><i class="z-over"></i>Overpaying</span></div>
        </div>
        <div class="padrow"><div class="pads" id="pads"></div><span class="incount" id="inCount"></span></div>
        <div class="clock"><i id="clockBar"></i></div>
        <ul class="feed" id="feed"></ul>
        <div class="result" id="result" hidden></div>
      </div>
    </section>

    <section class="ifwin" id="ifwin">
      <h2><span id="iwHead">If you win</span></h2>
      <div class="iw">
        <div><small>Cash today</small><strong id="iwCash"></strong><em id="iwCashN"></em></div>
        <div><small>Cash flow</small><strong id="iwFlow"></strong><em id="iwFlowN"></em></div>
        <div><small>Net worth</small><strong id="iwWorth"></strong><em id="iwWorthN"></em></div>
      </div>
      <div class="incline" id="iwInc"></div>
    </section>
  </main>

  <main id="vMarket" hidden>
    <h2 class="ohead" id="offHead" hidden>Offers on your houses</h2>
    <div class="offers" id="offers" hidden></div>
    <div class="chips" id="mTier" role="group" aria-label="Filter by tier"></div>
    <div class="chips" id="mOpts" role="group" aria-label="More filters"></div>
    <div class="deck" id="deck" aria-live="polite"></div>
    <div class="mbtns"><button class="pass" id="passBtn">Pass</button><button class="buy" id="buyBtn">Buy</button></div>
    <div class="mcount" id="mCount"></div>
    <h2>World markets</h2>
    <section class="globe"><canvas id="gcv" aria-label="Globe of property markets. Drag to spin, tap a city."></canvas><span class="ghint">Drag to spin. Tap a city.</span><div class="gzoom"><button id="gIn" aria-label="Zoom in">+</button><button id="gOut" aria-label="Zoom out" disabled>&minus;</button></div><div class="gsel" id="gsel" hidden></div></section>
  </main>

  <main id="vEmpire" hidden>
    <section class="hero">
      <small>Net worth</small>
      <span class="big" id="eWorth">$0</span>
      <div class="hinc" id="eInc"></div>
      <div class="hstats">
        <div><small>Cash</small><strong id="eCash">$0</strong></div>
        <div><small>Rent in</small><strong id="eRent">$0</strong></div>
        <div><small>Bills out</small><strong id="eBills">$0</strong></div>
        <div><small>Debt</small><strong id="eDebt">$0</strong></div>
      </div>
      <div class="hnote">1 second = 1 month. Rent lands every second a house is tenanted. Bills go out every second, tenant or not.</div>
    </section>
    <section class="unlock" id="unlock"><p id="unlockTxt"></p><div class="bar"><i id="unlockBar"></i></div></section>
    <div class="phead"><h2>Portfolio</h2><div class="pfilter" id="pfilter" role="group" aria-label="Show properties" hidden><button class="chip" id="pfAll" data-pf="all" aria-pressed="true">All <small id="pfAllN">0</small></button><button class="chip" id="pfRare" data-pf="rare" aria-pressed="false">Rare <small id="pfRareN">0</small></button></div></div>
    <div class="plist" id="plist"></div>
    <section class="bills"><h2>Monthly ledger</h2><div id="billRows"></div><div class="bnote" id="billNote"></div><div class="debtbox" id="debtBox" hidden><button class="repay" id="repayBtn"></button><button class="toggle" id="autoPayBtn" aria-pressed="false">Auto-pay: off</button><p class="bnote" id="debtNote"></p></div></section>
    <section class="legacy" id="legacy"><div><h2>Dynasty</h2><p id="legacyTxt"></p></div><button class="legbtn" id="legacyBtn">Cash out</button></section>
    <h2>Rich list</h2>
    <ol class="rich" id="rich"></ol>
    <h2>Your play</h2>
    <section class="playcard">
      <div><small>Days played</small><strong id="pDays">0</strong></div>
      <div><small>Sessions</small><strong id="pSess">0</strong></div>
      <div><small>Time played</small><strong id="pTime">0m</strong></div>
      <div><small>Win rate</small><strong id="pRate">-</strong></div>
    </section>
    <button class="reset" id="resetBtn">Start a new empire</button>
  </main>

  <div class="dock" id="dock">
    <div class="verdict" id="verdict"></div>
    <div class="bidrow"><button class="bid" id="bidBtn">Bid</button><button class="bigbid" id="bigBtn" aria-label="Go big: jump the bidding"><b>Go big</b><span id="bigAmt"></span></button></div>
    <div class="row">
      <div class="auto">
        <button class="toggle" id="autoBtn" aria-pressed="false">Auto-bid</button>
        <button class="step" id="autoDn" aria-label="Lower auto-bid limit">&minus;</button>
        <span class="lim" id="autoLim">Max $0</span>
        <button class="step" id="autoUp" aria-label="Raise auto-bid limit">+</button>
      </div>
      <button class="skip" id="skipBtn">Next lot</button>
    </div>
  </div>

  <nav class="tabs" role="tablist">
    <button role="tab" id="tA" aria-selected="true">Auction</button>
    <button role="tab" id="tM" aria-selected="false">Market <span class="badge" id="oCount" hidden>0</span></button>
    <button role="tab" id="tE" aria-selected="false">Empire <span class="badge" id="pCount" hidden>0</span></button>
  </nav>

  <div class="toasts" id="toasts" aria-live="polite"></div>
  <div class="om" id="om" hidden aria-live="polite"></div>
  <div class="modal" id="modal" hidden><div class="sheet" id="sheet" role="dialog" aria-modal="true"></div></div>
</div>
<canvas id="fx"></canvas>
"""

# ---------- script changes ----------
js = sub(js, "const VERSION='v9';", "const VERSION='v10-web';")

# helpers: deal zones, per-house projection, income
js = sub(js, "const growPct=h=>((BASEG+(h||0))*1200).toFixed(1);",
 """const growPct=h=>((BASEG+(h||0))*1200).toFixed(1);
/* ---------- deal reading: zones on the meter and what a house does to your month ---------- */
const ZONES={steal:'Steal',good:'Good buy',fair:'Fair price',over:'Overpaying'};
const zoneOf=(q,L,e)=>q<Math.min(L.guide,e.lo)?'steal':q<e.lo?'good':q<=e.hi?'fair':'over';
const sg=n=>(n>=0?'+':'')+money(n);
const landTax=h=>0.0003*Math.max(0,h-2e6)+0.0003*Math.max(0,h-25e6)+0.0004*Math.max(0,h-1e8);
function project(price,ti,val,style){const pay=payFor(price,ti),h=holdings(),strata=style==='unit'||style==='tower';
 const rent=val*RENT[ti]*(1+0.1*(S.legacy||0)),own=val*(COUNCIL+UPKEEP+(strata?STRATA:0)),lt=landTax(h+val)-landTax(h),int=pay.loan*INTEREST;
 return{out:pay.out,loan:pay.loan,duty:pay.duty,rent,costs:own+lt+int,net:rent-own-lt-int,day1:val-price-pay.duty};}
const incomeNow=()=>S.props.reduce((a,p)=>a+(p.vacant>0?0:rentOf(p)),0)-bills().total;""")

# valuer's estimate for each auction; auto-bid defaults to the walk-away price
js = sub(js, "\n T.c.auctionsSeen++;if(L.rare)T.c.rareSeen++;",
 "\n {const c=L.value*rnd(0.97,1.03);A.est={lo:roundTo(c*0.95,L.inc),hi:roundTo(c*1.05,L.inc),mid:c};A.autoMax=Math.max(L.open,Math.min(maxBid(L),A.est.hi));}\n T.c.auctionsSeen++;if(L.rare)T.c.rareSeen++;")

# lot render: compact specs, draw meter zones, drop old hint
js = sub(js, "$('#specs').innerHTML=[`${L.beds} bed`,`${L.baths} bath`,`${L.cars} car`,L.land?`${L.land.toLocaleString('en-AU')} m²`:(L.style==='tower'?'Penthouse':'Apartment'),...L.feats].map(esc).map(s=>`<span>${s}</span>`).join('');",
 "$('#specs').innerHTML=[`${L.beds} bed`,`${L.baths} bath`,`${L.cars} car`,L.land?`${L.land.toLocaleString('en-AU')} m²`:(L.style==='tower'?'Penthouse':'Apartment'),...L.feats].map(esc).map(s=>`<span>${s}</span>`).join('');\n drawMeter();")
js = sub(js, "\n $('#hint').hidden=S.wins>0||S.losses>2;}", "}")

js = sub(js, "function renderFeed(){",
 """const mScale=()=>{const L=A.lot,lo=L.open,hi=A.est.hi*1.18;return x=>Math.max(0,Math.min(100,(x-lo)/(hi-lo)*100));};
function drawMeter(){const L=A.lot,e=A.est,pc=mScale(),a=Math.min(L.guide,e.lo);
 const seg=(cls,x0,x1)=>{const l=pc(x0),w=pc(x1)-l;return w>0?`<i class="z-${cls}" style="left:${l}%;width:${w}%"></i>`:'';};
 $('#track').innerHTML=seg('steal',L.open,a)+seg('good',a,e.lo)+seg('fair',e.lo,e.hi)+seg('over',e.hi,e.hi*1.18);
 $('#waMk').style.left=pc(e.hi)+'%';$('#estTxt').textContent=money(e.lo)+' – '+money(e.hi);$('#waTxt').textContent=money(e.hi);dealSig='';}
let dealSig='';
function updDeal(){const L=A.lot,e=A.est,mine=A.leader==='you',q=A.ended?(A.bid||L.open):mine?A.bid:nextBid(),pc=mScale(),x=pc(q);
 const mk=$('#mk');mk.style.left=x+'%';mk.className='mk'+(x<14?' l':x>86?' r':'');
 const z=zoneOf(q,L,e),pr=project(q,L.ti,e.mid,L.style),ok=canPay(q,L.ti),now=incomeNow();
 const s=[A.ended,mine,q,z,Math.round(pr.net),Math.round(now),ok,S.cash>>10].join('|');if(s===dealSig)return;dealSig=s;
 $('#mkLbl').textContent=(A.ended?(A.leader?'Sold':'Passed in'):mine?'Your bid':'Next bid')+' '+money(q);
 const v=$('#verdict');
 if(A.ended){const p0=A.leader==='you'&&S.props[0],pn=p0?rentOf(p0)-propCost(p0,bills().landRate)-(p0.loan||0)*INTEREST:0;v.innerHTML=p0?`<span class="vd steal">Yours</span><span class="vtxt">Cash flow <b class="${pn>=0?'pos':'neg'}">${sg(pn)}/mo</b> · see Empire</span>`:`<span class="vd na">${A.leader?'Sold':'Passed in'}</span><span class="vtxt">Next lot is on its way</span>`;}
 else if(!ok)v.innerHTML=`<span class="vd na">Out of reach</span><span class="vtxt">Need <b>${money(depositFor(q,L.ti))}</b> deposit + duty</span>`;
 else v.innerHTML=`<span class="vd ${z}">${ZONES[z]}</span><span class="vtxt">${mine?'At':'Win at'} <b>${money(q)}</b>: ${pr.day1>=0?'<b class="pos">'+sg(pr.day1)+'</b> equity':'<b class="neg">'+money(pr.day1)+'</b> on day one'} · <b class="${pr.net>=0?'pos':'neg'}">${sg(pr.net)}</b>/mo</span>`;
 const iw=$('#ifwin');iw.hidden=A.ended;if(iw.hidden)return;
 $('#iwHead').textContent=A.ended?'What you just bought':(mine?'If you win at ':'If you win at ')+money(q);
 $('#iwCash').textContent=money(pr.out);const cn=$('#iwCashN');cn.className=ok||A.ended?'':'neg';cn.textContent=!ok&&!A.ended?'You have '+money(S.cash):pr.loan?'Borrow '+money(pr.loan)+' at 6%':'Paid in full';
 const f=$('#iwFlow');f.textContent=sg(pr.net)+'/mo';f.className=pr.net>=0?'pos':'neg';$('#iwFlowN').textContent='Rent '+money(pr.rent)+', costs '+money(pr.costs);
 const w=$('#iwWorth');w.textContent=sg(pr.day1);w.className=pr.day1>=0?'pos':'neg';$('#iwWorthN').textContent='Grows '+growPct(heatOf(q,L.guide))+'%/yr';
 $('#iwInc').innerHTML=A.ended?'':`Your income <b class="${now>=0?'pos':'neg'}">${sg(now)}/mo</b> → <b class="${now+pr.net>=0?'pos':'neg'}">${sg(now+pr.net)}/mo</b>`+(now+pr.net<0?'. Negative income drains your cash.':'');}
function renderFeed(){""")

# replace the old one-line "heat" readout with the meter + panel
js = sub(js, re.search(r" const hl=\$\('#heat'\);.*?\n  hl\.innerHTML=.*?\n", js).group(0), " updDeal();\n")
js = sub(js, "$('#autoBtn').textContent=S.autoOn?'Autopilot on':'Autopilot';", "$('#autoBtn').textContent=S.autoOn?'Auto-bid on':'Auto-bid';")
js = sub(js, "$('#autoLim').textContent='Max '+money(A.autoMax);", "$('#autoLim').textContent='Max '+money(A.autoMax);")
js = sub(js, "toast('Autopilot hit its limit. Bid by hand to stay in.','down');", "toast('Auto-bid hit your limit. Bid by hand to stay in.','down');")

# pause the clock while a sheet is open (walkthrough, welcome back)
js = sub(js, "function auctionTick(dt){if(!A||document.hidden)return;", "function auctionTick(dt){if(!A||document.hidden||!$('#modal').hidden)return;")
js = sub(js, "function econTick(){if(document.hidden)return;", "function econTick(){if(document.hidden||!$('#modal').hidden)return;")

# win result: tell them what it does to income
js = sub(js, "+` Stamp duty ${money(duty)}.`+(pay.loan?` Borrowed ${money(pay.loan)} at 6%.`:'');",
 "+` Stamp duty ${money(duty)}.`+(pay.loan?` Borrowed ${money(pay.loan)} at 6%.`:'')+` Cash flow ${sg(rentOf(p)-propCost(p,bills().landRate)-(p.loan||0)*INTEREST)}/mo.`;")

# market card: show net cash flow
js = sub(js, "function metaText(l){return `Rent about ${money(rentOf(l))}/mo · duty ${money(l.ask*DUTY[l.ti])}`+(needsLoan(l.ask,l.ti)?` · you'd borrow ${money(loanFor(l.ask,l.ti))}`:'');}",
 "function metaText(l){const pr=project(l.ask,l.ti,l.value,l.style);return `Cash flow ${sg(pr.net)}/mo after costs · duty ${money(pr.duty)}`+(pr.loan?` · borrow ${money(pr.loan)}`:'');}")

# empire: income line, goal strip, header income, coloured per-house cash flow
js = sub(js, "function updEmpire(){const w=worth(),B=bills(),rentNow=S.props.reduce((a,p)=>a+(p.vacant>0?0:rentOf(p)),0);",
 """function updGoal(){const w=worth(),nt=S.maxTier+1;
 if(nt<TIERS.length){const lo=TIERS[S.maxTier].unlock,hi=TIERS[nt].unlock,p=Math.max(0,Math.min(100,(w-lo)/(hi-lo)*100));$('#goalTxt').innerHTML=`<b>${money(hi)}</b> net worth unlocks <b>${TIERS[nt].name}</b>`;$('#goalPct').textContent=Math.floor(p)+'%';$('#goalBar').style.width=p+'%';}
 else{const rows=[w,...Object.values(S.board)].sort((a,b)=>b-a),rk=rows.indexOf(w)+1;$('#goalTxt').innerHTML=`Every market open. Top the rich list`;$('#goalPct').textContent='#'+rk;$('#goalBar').style.width=Math.max(4,100-(rk-1)*12)+'%';}}
$('#goal').onclick=()=>show('e');
function updEmpire(){const w=worth(),B=bills(),rentNow=S.props.reduce((a,p)=>a+(p.vacant>0?0:rentOf(p)),0);
 {const inc=rentNow-B.total,hi=$('#hInc');hi.textContent=sg(inc);hi.className=inc>0.5?'pos':inc<-0.5?'neg':'';const ei=$('#eInc');ei.className='hinc '+(inc>=0?'pos':'neg');ei.textContent=S.props.length?(inc>=0?`Earning ${money(inc)} a month after bills`:`Losing ${money(-inc)} a month after bills`):'No houses yet. Win one at auction to start earning rent.';}
 updGoal();""")
js = sub(js, "if(p.vacant>0){rp.textContent='Vacant '+p.vacant+'s';rp.className='pill vac';}else{const nr=rentOf(p)-propCost(p,B.landRate);rp.textContent=(nr>=0?'+':'')+money(nr)+'/mo net';rp.className='pill';}",
 "if(p.vacant>0){rp.textContent='Vacant '+p.vacant+'s';rp.className='pill vac';}else{const nr=rentOf(p)-propCost(p,B.landRate)-(p.loan||0)*INTEREST;rp.textContent=sg(nr)+'/mo';rp.className='pill '+(nr>=0?'pos':'neg');}")

# keep the walkthrough flag through resets, bankruptcies and dynasties
js = sub(js, "muted:S.muted,", "muted:S.muted,tour:S.tour,", count=4)

# dock only on the auction tab
js = sub(js, "function show(t){view=t;", "function show(t){view=t;$('#dock').hidden=t!=='a';")

# walkthrough + help button; first run shows it instead of the old what's-new note
js = sub(js, "/* ---------- boot ---------- */", r"""/* ---------- walkthrough ---------- */
const DEMO=`<div class="demo"><div class="meter"><div class="track"><i class="z-steal" style="left:0;width:24%"></i><i class="z-good" style="left:24%;width:22%"></i><i class="z-fair" style="left:46%;width:30%"></i><i class="z-over" style="left:76%;width:24%"></i></div><i class="wa" style="left:76%"></i><i class="mk" style="left:38%"><span>Next bid $395K</span></i></div><div class="legend"><span><i class="z-steal"></i>Steal</span><span><i class="z-good"></i>Good buy</span><span><i class="z-fair"></i>Fair</span><span><i class="z-over"></i>Overpaying</span></div></div>`;
const TOUR=[
 {h:'Build an empire',b:()=>`<p>You start with <b>${money(450000+(S.legacy||0)*100000)}</b>. Win houses at auction, collect rent, grow your net worth.</p><div class="tiers">${TIERS.map(t=>`<span>${t.name}</span>`).join('')}</div><p>Each milestone unlocks a bigger market. Your next goal is always at the top of the screen.</p>`},
 {h:'Is it a good deal?',b:()=>DEMO+`<p>The <b>valuer&rsquo;s estimate</b> is roughly what the house is really worth. Win it under that and you&rsquo;re richer the moment the hammer falls.</p><p>Green is good. Past the dashed <b>walk-away</b> line you&rsquo;re overpaying.</p>`},
 {h:'Will it pay its way?',b:()=>`<p>One second is one month. Every house earns rent but costs rates, upkeep and loan interest.</p><p><b>If you win</b> shows what a house adds to your monthly income <i>before</i> you bid. Keep income positive or your cash drains away.</p>`},
 {h:'How to bid',b:()=>`<p><b>Bid</b> raises one step. <b>Go big</b> jumps ahead and can scare rivals off.</p><p><b>Auto-bid</b> keeps you in up to the walk-away price. Short on cash? The bank lends up to 80%.</p>`}];
function tour(i){i=i||0;const t=TOUR[i],last=i===TOUR.length-1;
 $('#sheet').innerHTML=`<div class="tour"><div class="tstep">${i+1} of ${TOUR.length}</div><h3>${t.h}</h3>${t.b()}<div class="dots">${TOUR.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div><div class="tbtns">${i?'<button class="back" id="tBack">Back</button>':''}<button id="tNext">${last?'Start bidding':'Next'}</button></div></div>`;
 $('#modal').hidden=false;tlog('tour',{step:i});
 $('#tNext').onclick=()=>{if(last){$('#modal').hidden=true;if(!S.tour){S.tour=1;S.rules=3;save();}}else tour(i+1);};const b=$('#tBack');if(b)b.onclick=()=>tour(i-1);$('#tNext').focus();}
$('#help').onclick=()=>tour(0);

/* ---------- boot ---------- */""")
js = sub(js, "\nif((S.rules||0)<3)modal(", "\nif(!S.tour&&!S.wins&&!S.props.length)tour(0);\nelse if((S.rules||0)<3)modal(")

out = HEAD + css + "\n" + NEW_CSS + "</style>\n</head>\n<body>\n" + BODY + "<script>\n" + js + "\n</script>\n</body>\n</html>\n"
(ROOT / "public").mkdir(exist_ok=True)
(ROOT / "public/index.html").write_text(out)
print("wrote public/index.html", len(out), "bytes")
