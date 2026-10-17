"""One-off patch: v12 -> v13 (changes from the play-log review). Applied once.
1. Auctions match your wallet: an "Auto" tier picks the highest tier you can afford.
2. Tighter economy: slower base growth and overpay bonus, balanced market events, booms smaller.
3. Fewer, better interruptions: buyer offers only on homes up in value, one at a time; off-market deals half as often.
4. Flipping is visible: "Sell into it" prompt on a suburb boom, gold pill on homes up 25%+.
"""
import pathlib, sys

P = pathlib.Path(__file__).resolve().parent.parent / "public/index.html"
t = P.read_text()
if "const VERSION='v13-web'" in t:
    sys.exit("already patched")


def r(old, new, count=1):
    global t
    n = t.count(old)
    if n != count:
        sys.exit(f"expected {count}, found {n}: {old[:90]!r}")
    t = t.replace(old, new)


r("const VERSION='v12-web';", "const VERSION='v13-web';")

# ---- 2. economy ----
r("STRATA=0.0004,BASEG=0.0015;", "STRATA=0.0004,BASEG=0.0008;")
r("const heatOf=(price,guide)=>guide?Math.max(0,Math.min(0.5,price/guide-1))*0.006:0;",
  "const heatOf=(price,guide)=>guide?Math.max(0,Math.min(0.5,price/guide-1))*0.004:0;")
r("p.value*=Math.exp((0.0012+(p.heat||0))*growthDamp()", "p.value*=Math.exp((0.0007+(p.heat||0))*growthDamp()")
mk_start = t.index("function marketEvent(){")
mk_end = t.index("\nfunction simulate(n){")
t = t[:mk_start] + r"""/* market events: roughly balanced up and down; a downturn buys 60 months of calm so crashes can't stack */
function marketEvent(){const roll=Math.random(),down=roll<0.42;if(down&&(S.calm||0)>0){T.c.calmSaves++;tlog('market',{kind:'quiet'});return;}if(down)S.calm=60;if(roll>=0.9){tlog('market',{kind:'quiet'});return;}
 const before=holdings();T.c.marketEvents++;T.lastMarket={at:Date.now(),down};const kind=roll<0.08?'correction':roll<0.42?'rate_hike':roll<0.66?'rate_cut':'suburb_boom';setTimeout(()=>tlog('market',{kind,before:Math.round(before),after:Math.round(holdings())}),0);
 if(kind==='correction'){S.props.forEach(p=>p.value*=0.8);toast('Market correction. Values down 20%. Hold your nerve.','down');sfx('lose');}
 else if(kind==='rate_hike'){S.props.forEach(p=>p.value*=0.93);toast('Rates up. Buyers pull back, values slide 7%.','down');}
 else if(kind==='rate_cut'){S.props.forEach(p=>p.value*=1.05);toast('Rate cut. Values up 5%.','up');sfx('cash');}
 else{const p=pick(S.props);const sub=p.sub,mine=S.props.filter(q=>q.sub===sub);mine.forEach(q=>q.value*=1.12);sfx('cash');
  toast(`${sub} is booming: your ${mine.length>1?mine.length+' homes there are':'home there is'} up 12%. Tap to sell into it.`,'up',()=>{psort='gain';pg=0;show('e');buildEmpire();const h=$('.phead');if(h)h.scrollIntoView({block:'start'});});}}""" + t[mk_end:]

# ---- 1. auctions match the wallet ----
r("function startAuction(){A=newAuction(S.tier,",
  r"""/* auto tier: the highest unlocked tier where a typical opening bid is affordable (deposit + duty), sometimes one lower for variety */
const typicalOpen=i=>TIERS[i].min*0.78;
function affordTier(){let best=0;for(let i=0;i<=S.maxTier;i++)if(S.cash>=depositFor(typicalOpen(i),i))best=i;return best;}
function pickTier(bg){if(S.tierAuto===false)return bg&&Math.random()<0.3?Math.floor(Math.random()*(S.maxTier+1)):S.tier;const a=affordTier();return a>0&&Math.random()<(bg?0.35:0.2)?a-1:a;}
function startAuction(){if(S.tierAuto!==false&&!AUC_CITY)S.tier=pickTier(false);buildChips();A=newAuction(S.tier,""")
r("function spawnLive(){const ti=Math.random()<0.7?S.tier:Math.floor(Math.random()*(S.maxTier+1));",
  "function spawnLive(){const ti=pickTier(true);")
r("function buildChips(){$('#chips').hidden=S.maxTier<1&&!AUC_CITY;$('#chips').innerHTML=TIERS.map((t,i)=>{const locked=i>S.maxTier;return `<button class=\"chip\" data-t=\"${i}\" aria-pressed=\"${i===S.tier}\"",
  "function buildChips(){const auto=S.tierAuto!==false&&!AUC_CITY;$('#chips').hidden=S.maxTier<1&&!AUC_CITY;$('#chips').innerHTML=`<button class=\"chip\" data-auto=\"1\" aria-pressed=\"${auto}\">Auto <small>what you can afford</small></button>`+TIERS.map((t,i)=>{const locked=i>S.maxTier;return `<button class=\"chip\" data-t=\"${i}\" aria-pressed=\"${!auto&&i===S.tier}\"")
r("$('#chips').onclick=e=>{const b=e.target.closest('.chip');if(!b||b.disabled)return;if(b.dataset.cx){",
  "$('#chips').onclick=e=>{const b=e.target.closest('.chip');if(!b||b.disabled)return;if(b.dataset.auto){S.tierAuto=true;AUC_CITY=null;tlog('tier_pick',{tier:'auto'});buildChips();if(A&&(A.ended||A.leader!=='you'))startAuction();save();return;}S.tierAuto=false;if(b.dataset.cx){")

# ---- 3. fewer, better interruptions ----
r("  if(S.offerIn<=0&&OFF.length<3){S.offerIn=Math.round(rnd(45,80));const cand=S.props.filter(p=>!OFF.some(o=>o.pid===p.id));",
  "  if(S.offerIn<=0&&OFF.length<1){S.offerIn=Math.round(rnd(80,140));const cand=S.props.filter(p=>!OFF.some(o=>o.pid===p.id)&&p.value>basis(p)*1.08);")
r("const roll=Math.random(),war=roll<0.15,hi=war||roll<0.75,amt=", "const roll=Math.random(),war=roll<0.2,hi=war||roll<0.85,amt=")
r("S.dealIn=Math.round(rnd(30,55));", "S.dealIn=Math.round(rnd(60,110));")

# ---- 4. flipping is visible ----
r("gp.textContent=(gain>=0?'+':'')+gain.toFixed(1)+'%';gp.className='pill '+(gain>=0?'up':'down');",
  "gp.textContent=(gain>=25&&held(p)?'Sell now ':'')+(gain>=0?'+':'')+gain.toFixed(1)+'%';gp.className='pill '+(gain>=25&&held(p)?'hot':gain>=0?'up':'down');")

P.write_text(t)
print("patched", len(t))
