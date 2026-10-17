"""One-off patch: v10 -> v11 (V1 feature set). Applied once to public/index.html.
Run: python3 tools/v11_patch.py
"""
import pathlib, sys, re

P = pathlib.Path(__file__).resolve().parent.parent / "public/index.html"
t = P.read_text()
if "const VERSION='v11-web'" in t:
    sys.exit("already patched")


def r(old, new, count=1):
    global t
    n = t.count(old)
    if n != count:
        sys.exit(f"expected {count}, found {n}: {old[:90]!r}")
    t = t.replace(old, new)


# =====================================================================
# MARKUP
# =====================================================================
# header: streak chip beside the logo, mute moves into the menu
r('<button class="stars" id="hStars" hidden aria-label="Legacy stars"></button></div>',
  '<button class="stars" id="hStars" hidden aria-label="Legacy stars"></button><button class="streakc" id="hStreak" hidden aria-label="Daily streak"></button></div>')
r('    <button class="help" id="help" aria-label="How to play">?</button>\n    <button class="mute" id="mute" aria-label="Sound on"></button>\n',
  '    <button class="help" id="help" aria-label="Menu: how to play, sound, session, badges">?</button>\n')

# auction: live strip above the lot, set chip on the lot, rivals above the meter
r('    <div class="chips" id="chips" role="group" aria-label="Market tier"></div>\n\n    <section class="lot"',
  '    <div class="chips" id="chips" role="group" aria-label="Market tier"></div>\n    <section class="lvstrip" id="lvStrip" hidden aria-label="Other live auctions"><div class="lvhead"><b>Live now</b><span id="lvCount"></span><button class="hotbtn" data-quick="1">Hot lot</button></div><div class="lvrow" id="lvRow"></div></section>\n\n    <section class="lot"')
r('        <div class="sub" id="sub"></div>\n', '        <div class="sub" id="sub"></div>\n        <div class="setchip" id="setChip" hidden></div>\n')
padrow = '        <div class="padrow"><div class="pads" id="pads"></div><span class="incount" id="inCount"></span></div>\n'
r(padrow, '')
r('        <div class="deal" id="deal">', padrow + '        <div class="deal" id="deal">')

# market: quick play, search, watch list; globe behind a button
r('  <main id="vMarket" hidden>\n',
  '  <main id="vMarket" hidden>\n    <button class="quick" data-quick="1">Jump to the hottest auction</button>\n    <h2 class="ohead" id="wHead" hidden>Watching</h2>\n    <div class="wlist" id="wlist" hidden></div>\n')
r('    <div class="chips" id="mTier" role="group" aria-label="Filter by tier"></div>',
  '    <div class="msearch"><input id="mQ" type="search" placeholder="Search a suburb or city" autocomplete="off" enterkeyhint="search" aria-label="Search listings by suburb or city"></div>\n    <div class="chips" id="mTier" role="group" aria-label="Filter by tier"></div>')
r('    <h2>World markets</h2>\n    <section class="globe">',
  '    <button class="wmap" id="wmapBtn" aria-expanded="false" aria-controls="globeSec">World map: shop by city</button>\n    <section class="globe" id="globeSec" hidden>')

# empire: quick play, sets, badges, suburb sort
r('    <section class="unlock" id="unlock">',
  '    <button class="quick" data-quick="1">Jump to the hottest auction</button>\n    <section class="unlock" id="unlock">')
r('    <div class="phead"><h2>Portfolio</h2>',
  '    <section class="sets" id="setsBox" hidden><h2>Suburb sets</h2><p class="bnote">Own 3 homes in one suburb for +10% rent on all of them. Two on the same street adds another +5%.</p><div class="setlist" id="setList"></div></section>\n    <div class="phead"><h2>Portfolio</h2>')
r('<button class="chip" data-ps="loss" aria-pressed="false">Losing money</button>',
  '<button class="chip" data-ps="loss" aria-pressed="false">Losing money</button><button class="chip" data-ps="suburb" aria-pressed="false">Suburb</button>')
r('    <h2>Rich list</h2>',
  '    <div class="phead"><h2>Badges</h2><span class="bcount" id="bCount"></span></div>\n    <div class="badges" id="badges"></div>\n    <h2>Rich list</h2>')

# market tab: locked until the first house
r('<button role="tab" id="tM" aria-selected="false">Market <span class="badge" id="oCount" hidden>0</span></button>',
  '<button role="tab" id="tM" aria-selected="false">Market <span class="badge" id="oCount" hidden>0</span><span class="newtag" id="mNew" hidden>New</span></button>')

# coach bubble
r('  <div class="toasts" id="toasts" aria-live="polite"></div>',
  '  <div class="coach" id="coach" hidden role="status"></div>\n  <div class="toasts" id="toasts" aria-live="polite"></div>')

# =====================================================================
# CSS
# =====================================================================
r('/* portfolio paging */', r'''/* ===== v11 ===== */
.streakc{border:0;background:var(--sunk);color:var(--ink);font-family:var(--f-mono);font-weight:700;font-size:12px;padding:3px 7px;border-radius:999px;display:flex;align-items:center;gap:3px}
.streakc svg{width:12px;height:12px;color:var(--red)}
.ledger small,.goal small,.dhead small,.iw small,.cur small,.guide small,.hero small,.playcard small{font-size:11px}
.pad b{width:28px;height:28px;font-size:11px}
.padrow{padding-top:2px}
.setchip{grid-column:1;font-size:12px;font-weight:700;color:var(--gold);margin-top:2px}
.setchip.done{color:var(--green)}
/* live strip */
.lvstrip{display:flex;flex-direction:column;gap:6px}
.lvhead{display:flex;align-items:center;gap:8px;font-size:13px}
.lvhead b{font-family:var(--f-display);font-weight:400;font-size:15px;letter-spacing:.06em;text-transform:uppercase}
.lvhead span{color:var(--muted);font-size:12px}
.hotbtn{margin-left:auto;border:0;border-radius:999px;background:var(--red);color:var(--on-red);font-weight:700;font-size:12.5px;padding:6px 12px}
.lvrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.lv{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.lv.lead{border-color:var(--green)}.lv.outbid{border-color:var(--red)}.lv.won{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold)}
.lvmain{border:0;background:none;padding:0;text-align:left;display:grid;grid-template-columns:52px 1fr;gap:8px;align-items:center;padding:6px;min-width:0}
.lvart{width:52px;height:40px;border-radius:6px;overflow:hidden}
.lvart svg,.lvart img{width:100%;height:100%;display:block;object-fit:cover}
.lvt{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.lvt b{font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lvp{font-family:var(--f-mono);font-size:13px;font-weight:600}
.lvs{font-size:11px;color:var(--muted);white-space:nowrap}
.lvs.pos{color:var(--green)}.lvs.neg{color:var(--red)}
.lvclock{height:3px;background:var(--sunk)}
.lvclock i{display:block;height:100%;background:var(--ink);transition:width .1s linear}
.lvclock i.hot{background:var(--red)}
.lvauto{border:0;border-top:1px solid var(--line);background:var(--sunk);font-size:12px;font-weight:700;padding:7px 6px;white-space:nowrap}
.lvauto[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.lvauto:disabled{opacity:.5}
/* quick play + market search + watch */
.quick{border:0;border-radius:12px;background:var(--red);color:var(--on-red);font-family:var(--f-display);font-size:18px;letter-spacing:.05em;text-transform:uppercase;padding:12px;box-shadow:0 3px 0 #8c1426}
.msearch input{width:100%;font:inherit;font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
.msearch input:focus-visible{outline:2px solid var(--red);outline-offset:1px}
.star{position:absolute;right:10px;bottom:10px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(19,32,58,.72);color:#fff;font-size:20px;line-height:1;display:grid;place-items:center;z-index:2}
.star[aria-pressed="true"]{background:var(--gold-fill);color:var(--on-gold)}
.wlist{display:flex;flex-direction:column;gap:6px}
.wrow{display:grid;grid-template-columns:56px 1fr auto;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--gold);border-radius:12px;padding:6px 8px}
.wrow .pthumb{width:56px;height:42px}
.wrow b{font-size:13.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrow small{font-size:12px;color:var(--muted)}
.wrow button{border:0;border-radius:8px;background:var(--green);color:#fff;font-weight:700;padding:8px 10px;font-size:13px}
.wrow button:disabled{background:var(--sunk);color:var(--muted)}
.wmap{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:12px;font-weight:700;text-align:left}
.tabs button.locked{opacity:.5}
.newtag{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:var(--green);color:#fff;border-radius:999px;padding:1px 6px;margin-left:4px}
/* sets + badges */
.sets{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.sets h2{margin:0}
.setlist{display:flex;flex-wrap:wrap;gap:6px}
.setlist span{font-size:12.5px;font-weight:700;padding:5px 10px;border-radius:999px;background:var(--sunk)}
.setlist span.done{background:var(--gold-fill);color:var(--on-gold)}
.bcount{font-family:var(--f-mono);font-size:12px;color:var(--muted)}
.badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.bdg{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.bdg i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--sunk);color:var(--muted);font-style:normal;font-family:var(--f-display);font-size:16px}
.bdg.on i{background:var(--gold-fill);color:var(--on-gold)}
.bdg b{font-size:12px;line-height:1.2}
.bdg small{font-size:11px;color:var(--muted);line-height:1.25}
.bdg:not(.on){opacity:.7}
/* coach */
.coach{position:absolute;left:16px;right:16px;bottom:calc(100% - 100% + 214px + env(safe-area-inset-bottom,0px));z-index:22;background:var(--ink);color:var(--bg);border-radius:12px;padding:10px 38px 10px 12px;font-size:14px;font-weight:600;box-shadow:0 10px 28px var(--shadow);animation:drop .3s ease-out}
.coach::after{content:"";position:absolute;left:28px;bottom:-7px;border:7px solid transparent;border-bottom:0;border-top-color:var(--ink)}
.coach button{position:absolute;right:6px;top:6px;border:0;background:none;color:inherit;font-size:18px;width:28px;height:28px}
.coach.top{bottom:auto;top:70px}.coach.top::after{display:none}
/* win moment */
.stamp-in em{display:block;font-style:normal;font-family:var(--f-mono);font-size:14px;font-weight:700;color:var(--green);margin-top:2px}
.stamp.near .stamp-in{border-color:var(--gold);color:var(--gold)}
.aff{display:inline-block;margin-top:6px;font-size:13px;font-weight:700;color:var(--red)}
.adslot{border:1px dashed var(--line);border-radius:10px;padding:8px;min-height:60px;text-align:center}
.adslot small{display:block;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
/* menu, streak, recap sheets */
.sheet button.sec{background:var(--sunk);color:var(--ink);margin-top:8px}
.menu{display:flex;flex-direction:column}
.pips{display:flex;gap:6px;justify-content:center;margin:8px 0 4px}
.pips i{width:30px;height:30px;border-radius:50%;background:var(--sunk);display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:700;color:var(--muted)}
.pips i.on{background:var(--red);color:var(--on-red)}
.recap{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 14px;text-align:left}
.recap div{background:var(--sunk);border-radius:10px;padding:8px 10px}
.recap small{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.recap strong{font-family:var(--f-mono);font-size:16px}
.art img,.pthumb img{width:100%;height:100%;object-fit:cover;display:block}
/* portfolio paging */''')

# =====================================================================
# SCRIPT
# =====================================================================
r("const VERSION='v10-web';", "const VERSION='v11-web';")

# ---- config: affiliate, ads, analytics. Keys live here, never in the browser for image generation.
r("const $=s=>document.querySelector(s);", r"""const $=s=>document.querySelector(s);
/* ---------- site config: affiliate handoff, ad slots, analytics (all optional) ---------- */
const CONFIG={
 affiliate:{enabled:true,au:'https://www.realestate.com.au/buy/in-{slug},+{st}/list-1'},
 ads:{enabled:false,adsenseClient:'',adsenseSlot:''},
 analytics:{plausibleDomain:''}
};
const AU_STATES=['QLD','NSW','VIC','SA','WA','TAS','NT','ACT'];
const buzz=p=>{try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}};""")

# ---- sets: deterministic streets per suburb so street pairs happen; rent bonus while held
r("const rentOf=p=>p.value*RENT[p.ti]*(1+0.1*(S.legacy||0));",
  r"""const SET_N=3;
const streetOf=p=>p.street||String(p.addr).replace(/^[\d\/]+\s+/,'');
let setC={sig:'',sub:{},street:{}};
function sets(){let n=S.props.length,h=0;for(const p of S.props)h=(h*31+p.id)|0;const sig=n+':'+h;if(setC.sig===sig)return setC;
 const sub={},street={};for(const p of S.props){sub[p.sub]=(sub[p.sub]||0)+1;const k=p.sub+'|'+streetOf(p);street[k]=(street[k]||0)+1;}setC={sig,sub,street};return setC;}
const setMult=p=>{const c=sets();return 1+(c.sub[p.sub]>=SET_N?0.1:0)+(c.street[p.sub+'|'+streetOf(p)]>=2?0.05:0);};
const rentOf=p=>p.value*RENT[p.ti]*(1+0.1*(S.legacy||0))*(S.props.includes(p)?setMult(p):1);""")
r("function makeLot(ti,o={}){", r"""function streetsFor(sub){let h=7;for(const ch of sub)h=(h*31+ch.charCodeAt(0))|0;const rr=mulberry(h),out=[];while(out.length<3){const s=STREETS[Math.floor(rr()*STREETS.length)]+' '+STYPES[Math.floor(rr()*STYPES.length)];if(!out.includes(s))out.push(s);}return out;}
function makeLot(ti,o={}){""")
r("addr:(style==='unit'?pick([3,5,7,12])+'/':'')+(1+Math.floor(Math.random()*180))+' '+pick(STREETS)+' '+pick(STYPES),",
  "street:sstreet,addr:(style==='unit'?pick([3,5,7,12])+'/':'')+(1+Math.floor(Math.random()*180))+' '+sstreet,")
r(" const feats=shuffle(T.feats).slice(0,2);if(rare)feats.unshift('Rare listing');",
  " const feats=shuffle(T.feats).slice(0,2);if(rare)feats.unshift('Rare listing');const sstreet=pick(streetsFor(sub));")

# ---- sound: pitch-rising bids, a bell for wins, combo crescendo, near-miss sting; background lots stay quiet
r("function sfx(k){if(S.muted)return;const a=ac();if(!a)return;const t=a.currentTime;\n if(k==='bid')tone(a,880,t,0.07,'triangle',0.09);",
  "function sfx(k,v){if(S.muted)return;if(A&&A.bg&&!['ding','combo','lose','near'].includes(k))return;const a=ac();if(!a)return;const t=a.currentTime;\n if(k==='bid')tone(a,660+Math.max(0,Math.min(1.4,v||0.5))*520,t,0.07,'triangle',0.09);\n else if(k==='ding'){const f=1046*Math.pow(1.122,Math.min(6,(v||1)-1));tone(a,f,t,0.6,'sine',0.12);tone(a,f*2.76,t,0.25,'sine',0.03);}\n else if(k==='combo')[0,1,2,3].slice(0,Math.min(4,(v||2)+1)).forEach(i=>{tone(a,784*Math.pow(1.26,i),t+i*0.08,0.35,'triangle',0.12);});\n else if(k==='near')[523,494,440].forEach((f,i)=>tone(a,f,t+i*0.09,0.18,'triangle',0.08));")

# ---- mute lives in the menu now
r("function drawMute(){$('#mute').innerHTML=S.muted?ICON_OFF:ICON_ON;$('#mute').setAttribute('aria-label',S.muted?'Sound off':'Sound on');}\n$('#mute').onclick=()=>{S.muted=!S.muted;T.c.muteToggles++;tlog('mute',{muted:S.muted});drawMute();save();};",
  "function drawMute(){}\nfunction toggleMute(){S.muted=!S.muted;T.c.muteToggles++;tlog('mute',{muted:S.muted});save();}")

# ---- confetti scales with how good the deal was
r("function confetti(rare){if(reduce)return;", "function confetti(rare,k){if(reduce)return;k=k||1;")
r("for(let i=0;i<(rare?220:140);i++)parts.push(", "for(let i=0;i<Math.round((rare?220:140)*k);i++)parts.push(")

# ---- art: photoreal images from img/manifest.json when present, drawn houses otherwise
t = t.replace("houseSVG(", "artOf(")
r("function artOf(p){\n const r=mulberry", "function houseSVG(p){\n const r=mulberry")
r("/* ---------- sound ---------- */", r"""let IMGS=null;
function artOf(p){const list=IMGS&&IMGS[p.style];if(list&&list.length){const src=list[Math.abs(p.seed|0)%list.length];return `<img src="${esc(src)}" alt="Photo of ${esc(p.addr)}" loading="lazy" decoding="async">`;}return houseSVG(p);}
try{fetch('img/manifest.json').then(x=>x.ok?x.json():null).then(j=>{if(j&&typeof j==='object'){IMGS=j;if(A&&!A.bg)renderLot();buildEmpire();}}).catch(()=>{});}catch(e){}

/* ---------- sound ---------- */""")

# ---- auctions: build any number, run the extras in the background
r("function startAuction(){const L=makeLot(S.tier,{place:AUC_CITY&&AUC_CITY.ti===S.tier?AUC_CITY.place:null});const n=Math.random()<0.5?3:2;\n const pool=shuffle(RIVALS).slice(0,n);",
  "function startAuction(){A=newAuction(S.tier,AUC_CITY&&AUC_CITY.ti===S.tier?AUC_CITY.place:null,false);renderLot();if(!S.wins&&!S.props.length)coach('bid','Tap Bid. Green on the meter means you make money. Stop at the dashed walk-away line.');}\nfunction newAuction(ti,place,bg){const L=makeLot(ti,{place});const first=!bg&&!S.wins&&!S.props.length&&(S.firstLots||0)<2;if(first)S.firstLots=(S.firstLots||0)+1;const n=first?1:Math.random()<0.5?3:2;\n const pool=first?shuffle(RIVALS.filter(r=>r.style==='cautious')).slice(0,1):shuffle(RIVALS).slice(0,n);")
r("max:L.value*(r.style==='aggro'?rnd(0.92,1.16):r.style==='cautious'?rnd(0.78,1.0):rnd(0.88,1.1))*(r.name===S.nemesis?1.06:1)}));\n A={lot:L,bid:0,",
  "max:first?L.value*rnd(0.84,0.9):L.value*(r.style==='aggro'?rnd(0.92,1.16):r.style==='cautious'?rnd(0.78,1.0):rnd(0.88,1.1))*(r.name===S.nemesis?1.06:1)}));\n const X={lot:L,bg:!!bg,auto:bg?false:!!S.autoOn,first,bid:0,")
r(" {const c=L.value*rnd(0.97,1.03);A.est={lo:roundTo(c*0.95,L.inc),hi:roundTo(c*1.05,L.inc),mid:c};A.autoMax=Math.max(L.open,Math.min(maxBid(L),A.est.hi));}\n T.c.auctionsSeen++;if(L.rare)T.c.rareSeen++;if(!A.st.couldAfford)T.c.cantAfford++;\n renderLot();}",
  " {const c=L.value*rnd(0.97,1.03);X.est={lo:roundTo(c*0.95,L.inc),hi:roundTo(c*1.05,L.inc),mid:c};X.autoMax=Math.max(L.open,Math.min(maxBid(L),X.est.hi));}\n T.c.auctionsSeen++;if(L.rare)T.c.rareSeen++;if(!X.st.couldAfford)T.c.cantAfford++;\n return X;}")

# DOM work only for the auction on screen
r("function renderChat(){const c=$('#chat');", "function renderChat(){if(A&&A.bg)return;const c=$('#chat');")
r("function renderPads(){if(!A)return;", "function renderPads(){if(!A||A.bg)return;")
r("function showCall(st){", "function showCall(st){if(A&&A.bg)return;")
r("function flashReset(){", "function flashReset(){if(A&&A.bg)return;")
r("function renderFeed(){", "function renderFeed(){if(A&&A.bg)return;")
r("function updAuction(){if(!A)return;", "function updAuction(){if(!A||A.bg)return;")
r("\n const b=$('#bidNow');b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump');sfx(who==='you'?'bid':'rival');renderFeed();updAuction();}",
  "\n if(who==='you')hideCoach('bid');if(A.bg)return;const b=$('#bidNow');b.classList.remove('bump');void b.offsetWidth;b.classList.add('bump');sfx(who==='you'?'bid':'rival',A.est?amt/A.est.hi:0.5);renderFeed();updAuction();}")
r(" if(A.ended){A.nextIn-=dt;if(A.nextIn<=0)startAuction();else $('#skipBtn').textContent='Next lot '+Math.ceil(A.nextIn)+'s';return;}",
  " if(A.ended){A.nextIn-=dt;if(A.bg){if(A.nextIn<=0)A.dead=true;return;}if(A.nextIn<=0)startAuction();else $('#skipBtn').textContent='Next lot '+Math.ceil(A.nextIn)+'s';return;}")
r(" if(S.autoOn&&A.leader!=='you'){const nb=nextBid();if(nb<=A.autoMax&&canPay(nb,A.lot.ti)){if(Math.random()<3*dt)placeBid('you',nb,false,'auto');}else if(!A.autoWarned&&A.leader){A.autoWarned=true;T.c.autoLimitHits++;toast('Auto-bid hit your limit. Bid by hand to stay in.','down');}}",
  " if(A.auto&&A.leader!=='you'){const nb=nextBid();if(nb<=A.autoMax&&canPay(nb,A.lot.ti)){if(Math.random()<3*dt)placeBid('you',nb,false,'auto');}else if(!A.autoWarned&&A.leader){A.autoWarned=true;T.c.autoLimitHits++;if(!A.bg)toast('Auto-bid hit your limit. Bid by hand to stay in.','down');}}")
r("$('#autoBtn').setAttribute('aria-pressed',S.autoOn);$('#autoBtn').textContent=S.autoOn?'Auto-bid on':'Auto-bid';",
  "$('#autoBtn').setAttribute('aria-pressed',!!A.auto);$('#autoBtn').textContent=A.auto?'Auto-bid on':'Auto-bid';")
r("$('#autoBtn').onclick=()=>{S.autoOn=!S.autoOn;T.c.autoToggles++;tlog('autopilot',{on:S.autoOn});if(S.autoOn&&A)A.autoWarned=false;updAuction();save();};",
  "$('#autoBtn').onclick=()=>{if(!A)return;A.auto=!A.auto;S.autoOn=A.auto;T.c.autoToggles++;tlog('autopilot',{on:A.auto});if(A.auto)A.autoWarned=false;updAuction();save();};")
r("autoOn:S.autoOn,autoMax:Math.round(A.autoMax),", "autoOn:!!A.auto,bg:!!A.bg,autoMax:Math.round(A.autoMax),")

# ---- the end of an auction: shared bookkeeping, focus vs background presentation, near-miss, combo, sets, badges
end_start = t.index("function endAuction(){")
end_stop = t.index("\nfunction buildChips(){")
t = t[:end_start] + r"""function endAuction(){A.ended=true;A.nextIn=A.bg?2.5:4;const L=A.lot,ui=!A.bg;
 if(A.leader==='you')recordAuction('you');else if(A.leader){recordAuction('rival',A.leader.name);if(A.st.hand+A.st.auto+A.st.big>0){T.c.losses++;T.c.outbid++;}}else{recordAuction('none');T.c.passedIn++;}
 const part=A.rivals.filter(r=>r.bids>0),youBidAny=A.st.hand+A.st.auto+A.st.big>0;S.h2h=S.h2h||{};let beatNem=null;
 if(ui){const cb0=$('#callBig');if(cb0)cb0.className='callbig';A.say=null;renderChat();}
 if(A.leader==='you'){for(const r of part){(S.h2h[r.name]=S.h2h[r.name]||{w:0,l:0}).w++;if(S.nemesis===r.name)beatNem=r;}if(beatNem){S.nemesis=null;T.c.nemesisBeats++;tlog('nemesis_beaten',{rival:beatNem.name});}}
 else if(A.leader&&youBidAny){(S.h2h[A.leader.name]=S.h2h[A.leader.name]||{w:0,l:0}).l++;if(S.nemesis!==A.leader.name){S.nemesis=A.leader.name;tlog('nemesis_new',{rival:S.nemesis});}}
 if(ui&&A.leader&&A.leader!=='you')rivalSay(A.leader,'win');
 SESS.lots+=youBidAny||ui?1:0;
 const res=ui?$('#result'):null,stp=ui?document.createElement('div'):null;
 if(A.leader==='you'){T.c.wins++;SESS.wins++;if(L.rare)T.c.rareWon++;const pay=payFor(A.bid,L.ti),duty=pay.duty,prem=A.bid/L.guide-1,heat=heatOf(A.bid,L.guide);S.cash-=pay.out;S.paidOut+=duty;if(pay.loan){T.c.loans++;S.borrowed=1;tlog('loan',{src:'auction',tier:L.ti,amt:Math.round(pay.loan),cashAfter:Math.round(S.cash)});}S.wins++;
  const p={id:S.nextId++,addr:L.addr,street:L.street,sub:L.sub,st:L.st,ti:L.ti,style:L.style,seed:L.seed,rare:L.rare,paid:A.bid,duty,prem,heat,age:0,value:L.value,vacant:0,boughtAt:Date.now(),loan:pay.loan};S.props.unshift(p);
  const eq=L.value-A.bid-duty,z=zoneOf(A.bid,L,A.est),k={steal:1.8,good:1.3,fair:1,over:0.6}[z]||1;SESS.best=Math.max(SESS.best==null?-Infinity:SESS.best,eq);
  if(z==='steal'){S.steals=(S.steals||0)+1;award('steal');if(S.steals>=5)award('steal5');}
  award('first_win');if(L.rare)award('rare');if(beatNem)award('nemesis');if(S.props.length>=10)award('landlord10');if(S.props.length>=25)award('magnate25');
  const combo=noteWin(),pn=rentOf(p)-propCost(p,bills().landRate)-(p.loan||0)*INTEREST;checkSets(p);track('Auction won',{tier:TIERS[L.ti].name,zone:z});
  if(ui){stp.className='stamp '+(L.rare?'rarewin':'win');stp.innerHTML=`<div class="stamp-in"><b>${beatNem?'Nemesis beaten':L.rare?'Rare. Yours':'Sold to you'}</b><small>${full(A.bid)}</small><em data-roll="${Math.round(eq)}">+$0</em></div>`;
   res.className='result '+(L.value>=A.bid?'good':'bad');res.innerHTML=esc((L.value>=A.bid?`Bank values it at ${money(L.value)}: instant equity +${money(L.value-A.bid)}. ${gradeOf(prem)}, growing ${growPct(heat)}% a year.`:`Bank values it at ${money(L.value)}, ${money(A.bid-L.value)} under what you paid. ${gradeOf(prem)}: it grows ${growPct(heat)}% a year, so hold it.`)+` Stamp duty ${money(duty)}.`+(pay.loan?` Borrowed ${money(pay.loan)} at 6%.`:'')+` Cash flow ${sg(pn)}/mo.`)+affiliateHTML(L);
   sfx(L.rare||beatNem||z==='steal'?'rare':'win');confetti(L.rare||!!beatNem,k);buzz([20,40,20]);
   if(beatNem){const h=S.h2h[beatNem.name];toast(`You beat ${beatNem.name}, your nemesis. You lead ${h.w}–${h.l}.`,'up');}
   if(S.wins===1){coach('won1','Your first house pays rent every second. Your income is in the top bar.');setTimeout(()=>unlockMarket(),2600);}}
  else{toast(`Won ${L.sub}: ${L.addr} for ${money(A.bid)}. ${sg(pn)}/mo.`,'up');sfx('ding',combo);buzz(30);}
  buildEmpire();
 }else if(A.leader){if(youBidAny)S.losses++;S.board[A.leader.name]=(S.board[A.leader.name]||0)+L.value*0.12;
  const near=youBidAny&&A.st.maxYou>0&&A.bid<=A.st.maxYou+2*L.inc&&A.bid<=A.est.hi,one=A.bid-A.st.maxYou<=L.inc;
  if(near){T.c.nearMiss=(T.c.nearMiss||0)+1;tlog('near_miss',{gap:Math.round(A.bid-A.st.maxYou),tier:L.ti});}
  if(ui){stp.className='stamp '+(near?'near':'gone');stp.innerHTML=near?`<div class="stamp-in"><b>Pipped!</b><small>${one?'By one bid':'By two bids'} · ${full(A.bid)}</small></div>`:`<div class="stamp-in"><b>Sold</b><small>${esc(A.leader.name)} · ${full(A.bid)}</small></div>`;
   res.className='result bad';res.textContent=near?`So close. ${A.leader.name} paid ${money(A.bid)}, still under your walk-away of ${money(A.est.hi)}. One more bid would have taken it.`:youBidAny?`Outbid. ${A.leader.name} took it for ${money(A.bid)}. ${rm(A.leader).short} is your nemesis now.`:`${A.leader.name} took it for ${money(A.bid)}. Valued at ${money(L.value)}.`;sfx(near?'near':'lose');if(near)buzz([60,40,60]);}
  else if(youBidAny)toast(`${near?'Pipped by '+(one?'one bid':'two bids'):'Outbid'} in ${L.sub}. ${rm(A.leader).short} paid ${money(A.bid)}.`,'down');
 }else if(ui){stp.className='stamp gone';stp.innerHTML='<div class="stamp-in"><b>Passed in</b><small>No bids</small></div>';res.className='result';res.textContent='Nobody bid. Next lot coming up.';}
 if(ui){res.hidden=false;$('#art').appendChild(stp);const rl=stp.querySelector('[data-roll]');if(rl)rollTo(rl,+rl.dataset.roll,v=>(v>=0?'+':'')+money(v)+' equity');updAuction();SESS.focusLots++;if(SESS.focusLots%10===0)setTimeout(()=>{if($('#modal').hidden)recap(true);},2200);}
 save();soonFlush();}
function rollTo(el,to,fmt,dur){if(reduce){el.textContent=fmt(to);return;}dur=dur||800;const t0=performance.now();const step=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=fmt(Math.round(to*e));if(k<1)requestAnimationFrame(step);};requestAnimationFrame(step);}
let lastWinAt=0,combo=0;
function noteWin(){const now=Date.now();combo=now-lastWinAt<4000?combo+1:1;lastWinAt=now;if(combo>=2){award('combo2');if(combo>=3)award('combo3');toast(combo===2?'Double hammer!':combo===3?'Ding ding ding! Three wins.':combo+' wins in a row!','up');setTimeout(()=>sfx('combo',combo),250);buzz([30,30,30,30,60]);T.c.combos=(T.c.combos||0)+1;}return combo;}
function affiliateHTML(L){if(!CONFIG.affiliate.enabled||!AU_STATES.includes(L.st))return '';const slug=L.sub.toLowerCase().replace(/\s+/g,'+');const url=CONFIG.affiliate.au.replace('{slug}',encodeURIComponent(slug).replace(/%2B/g,'+')).replace('{st}',L.st.toLowerCase());return `<br><a class="aff" href="${esc(url)}" target="_blank" rel="sponsored noopener" data-aff="${esc(L.sub)}">See real homes for sale in ${esc(L.sub)} &rsaquo;</a>`;}
document.addEventListener('click',e=>{const a=e.target.closest('[data-aff]');if(a){T.c.affClicks=(T.c.affClicks||0)+1;tlog('aff_click',{sub:a.dataset.aff});track('Affiliate click',{suburb:a.dataset.aff});}});
""" + t[end_stop:]

# ---- render the focused lot: set chip
r("$('#addr').textContent=L.addr;$('#sub').textContent=`${L.sub}, ${L.st}`;",
  "$('#addr').textContent=L.addr;$('#sub').textContent=`${L.sub}, ${L.st}`;{const c=sets(),own=c.sub[L.sub]||0,sp=c.street[L.sub+'|'+L.street]||0,sc=$('#setChip');let tx='';if(own>=SET_N)tx=`${L.sub} set complete: +10% rent here`;else if(own===SET_N-1)tx=`Completes your ${L.sub} set: +10% rent`;else if(own)tx=`${own}/${SET_N} homes in ${L.sub}`;if(sp===1)tx+=(tx?' · ':'')+`Street pair on ${L.street}: +5%`;sc.hidden=!tx;sc.textContent=tx;sc.className='setchip'+(own>=SET_N-1?' done':'');}")

# haptic tick when the deal zone changes under you
r(" const z=zoneOf(q,L,e),pr=project(q,L.ti,e.mid,L.style),ok=canPay(q,L.ti),now=incomeNow();",
  " const z=zoneOf(q,L,e),pr=project(q,L.ti,e.mid,L.style),ok=canPay(q,L.ti),now=incomeNow();if(!A.ended&&A.lastZone&&A.lastZone!==z)buzz(8);A.lastZone=z;")

# ---- ticks: background lots + live strip
r("setInterval(()=>auctionTick(0.1),100);", "setInterval(()=>{auctionTick(0.1);liveTick(0.1);},100);")

# ---- buying from the market keeps the street, counts badges and sets
r("S.props.unshift({id:S.nextId++,addr:l.addr,sub:l.sub,", "S.props.unshift({id:S.nextId++,addr:l.addr,street:l.street,sub:l.sub,")
r(" T.c.mktBuys++;if(l.deal)T.c.mktDeals++;if(pay.loan)T.c.loans++;",
  " T.c.mktBuys++;if(l.deal)T.c.mktDeals++;if(pay.loan){T.c.loans++;S.borrowed=1;}checkSets(S.props[0]);award('first_win');if(S.props.length>=10)award('landlord10');if(S.props.length>=25)award('magnate25');")

# ---- offers only after house 3, off-market deals after house 1
r(" if(S.props.length){S.offerIn=(S.offerIn==null?15:S.offerIn)-1;", " if(S.props.length>=3){S.offerIn=(S.offerIn==null?15:S.offerIn)-1;")
r(" S.dealIn=(S.dealIn==null?20:S.dealIn)-1;if(S.dealIn>0||!$('#modal').hidden)return;",
  " if(!S.props.length)return;S.dealIn=(S.dealIn==null?20:S.dealIn)-1;if(S.dealIn>0||!$('#modal').hidden)return;")

# ---- badges for flips, debt, tiers
r("T.c.sells++;T.c.sellProfit+=Math.round(profit);", "T.c.sells++;T.c.sellProfit+=Math.round(profit);if(profit>0&&how!=='repossessed')award('flip');")
r("toast(debt()<1?'Debt cleared. Every dollar of rent is yours now.'", "if(debt()<1&&S.borrowed)award('debt_free');toast(debt()<1?'Debt cleared. Every dollar of rent is yours now.'")
r("toast(TIERS[i].name+' auctions unlocked','up');sfx('rare');}}",
  "toast(TIERS[i].name+' auctions unlocked','up');sfx('rare');if(i>=1)award('family');if(i>=2)award('prestige');track('Tier unlock',{tier:TIERS[i].name,minutes:Math.round(S.playSec/60)});}}")

# ---- market: search, watch list, star on cards, globe button
r("const matches=l=>(MK.tier<0||l.ti===MK.tier)&&(MK.type==='all'||(MK.type==='apt')===isStrata(l))&&(!MK.deals||l.deal)&&(!MK.city||l.sub===MK.city",
  "const matches=l=>(!MK.q||(l.sub+' '+l.st+' '+l.addr).toLowerCase().includes(MK.q))&&(MK.tier<0||l.ti===MK.tier)&&(MK.type==='all'||(MK.type==='apt')===isStrata(l))&&(!MK.deals||l.deal)&&(!MK.city||l.sub===MK.city")
r("function refill(){let g=0;while(LST.length<10&&g++<20){const l=makeListing();if(l)LST.push(l);}",
  "function refill(){let g=0;while(LST.length<10&&g++<20){const l=makeListing();if(l)LST.push(l);}\n if(MK.q){const cs=CITIES.filter(c=>c.ti<=S.maxTier&&(c.sub+' '+c.st).toLowerCase().includes(MK.q));g=0;while(cs.length&&LST.filter(matches).length<3&&g++<12){const c=pick(cs);const l=makeListing({ti:c.ti,city:c.sub});if(l)LST.push(l);}}")
r("<span class=\"swl buy\">Buy</span>", "<button class=\"star\" data-watch=\"${l.mid}\" aria-pressed=\"${WATCH.has(l.mid)}\" aria-label=\"Watch this listing\">&#9733;</button><span class=\"swl buy\">Buy</span>")
r("$('#deck').addEventListener('click',e=>{if(e.target.closest('#mClear')){MK={tier:-1,type:'all',deals:false,city:null};mFilter();}});",
  r"""$('#deck').addEventListener('click',e=>{const w=e.target.closest('[data-watch]');if(w){e.stopPropagation();toggleWatch(+w.dataset.watch);w.setAttribute('aria-pressed',WATCH.has(+w.dataset.watch));return;}if(e.target.closest('#mClear')){MK={tier:-1,type:'all',deals:false,city:null};$('#mQ').value='';mFilter();}});
$('#deck').addEventListener('pointerdown',e=>{if(e.target.closest('[data-watch]'))e.stopPropagation();},true);
const WATCH=new Set();
function toggleWatch(id){if(WATCH.has(id))WATCH.delete(id);else{WATCH.add(id);T.c.watches=(T.c.watches||0)+1;toast('Watching. It sits at the top of the Market until it sells.','up');}renderWatch();}
function renderWatch(){const live=LST.filter(l=>WATCH.has(l.mid));for(const id of [...WATCH])if(!LST.some(l=>l.mid===id))WATCH.delete(id);const box=$('#wlist');$('#wHead').hidden=box.hidden=!live.length;
 const sig=live.map(l=>l.mid).join(',');if(box.dataset.sig!==sig){box.dataset.sig=sig;box.innerHTML=live.map(l=>`<div class="wrow" data-wid="${l.mid}"><div class="pthumb">${artOf(l)}</div><div><b>${esc(l.addr)}</b><small>${esc(l.sub)} · ${money(l.ask)} · <span data-k="wt">${l.ttl}s</span></small></div><button data-wbuy="${l.mid}">Buy</button></div>`).join('');}
 for(const l of live){const el=box.querySelector(`[data-wid="${l.mid}"]`);if(!el)continue;el.querySelector('[data-k="wt"]').textContent=l.ttl+'s';el.querySelector('button').disabled=!canPay(l.ask,l.ti);}}
$('#wlist').onclick=e=>{const b=e.target.closest('[data-wbuy]');if(!b)return;const l=LST.find(x=>x.mid===+b.dataset.wbuy);if(l&&buyListing(l)){WATCH.delete(l.mid);deckId=null;renderMarket();}};
let qT=null;$('#mQ').addEventListener('input',e=>{clearTimeout(qT);qT=setTimeout(()=>{MK.q=e.target.value.trim().toLowerCase();if(MK.q)T.c.searches=(T.c.searches||0)+1;mFilter();},180);});
$('#wmapBtn').onclick=()=>{const g=$('#globeSec'),open=g.hidden;g.hidden=!open;$('#wmapBtn').setAttribute('aria-expanded',open);$('#wmapBtn').textContent=open?'Hide world map':'World map: shop by city';if(open){gstart();g.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});}else gstop();};""")
r("function renderMarket(){renderMChips();renderOffers();renderDeck();if(G.sel)renderGsel();}",
  "function renderMarket(){renderMChips();renderOffers();renderWatch();renderDeck();if(G.sel)renderGsel();}")
r(" for(const l of LST)l.ttl--;LST=LST.filter(l=>l.ttl>0);",
  " for(const l of LST){l.ttl--;if(WATCH.has(l.mid)&&l.ttl===5&&view!=='m')toast(`Watched ${l.sub} listing goes in 5s. Tap to see it.`,'down',()=>show('m'));}LST=LST.filter(l=>l.ttl>0);")
r("if(t==='m'){T.c.mktViews++;refill();deckId=null;mchipSig='';offSig='';renderMarket();gstart();}else gstop();}",
  "if(t==='m'){T.c.mktViews++;refill();deckId=null;mchipSig='';offSig='';renderMarket();if(!$('#globeSec').hidden)gstart();if(!$('#mNew').hidden){$('#mNew').hidden=true;coach('market','Buy homes instantly here. Swipe right to buy, left to pass, or tap the star to watch one.');}}else gstop();}")
r("$('#tA').onclick=()=>show('a');$('#tM').onclick=()=>show('m');$('#tE').onclick=()=>show('e');",
  "$('#tA').onclick=()=>show('a');$('#tM').onclick=()=>{if(!mktOpen()){toast('Win your first house to open the Market.','down');return;}show('m');};$('#tE').onclick=()=>show('e');")

# ---- portfolio: suburb grouping sort, sets box, badges grid
r("loss:(a,b)=>flowOf(a)-flowOf(b)};", "loss:(a,b)=>flowOf(a)-flowOf(b),suburb:(a,b)=>a.sub.localeCompare(b.sub)||b.value-a.value};")
r(" const c=$('#pCount');c.hidden=!S.props.length;c.textContent=S.props.length;updEmpire();}",
  " const c=$('#pCount');c.hidden=!S.props.length;c.textContent=S.props.length;renderSets();renderBadges();updEmpire();}")

# ---- boot: no walkthrough up front; coach marks, streak, menu
r("$('#help').onclick=()=>tour(0);", "$('#help').onclick=()=>menu();")
r("\nif(!S.tour&&!S.wins&&!S.props.length)tour(0);\nelse if((S.rules||0)<3)modal(", "\nif(!S.wins&&!S.props.length){S.rules=3;S.tour=S.tour||0;}\nif((S.rules||0)<3)modal(")
r("drawMute();drawStars();syncTier();buildChips();buildEmpire();startAuction();headLoop();",
  "drawMute();drawStars();drawStreak();drawTabs();syncTier();buildChips();buildEmpire();startAuction();headLoop();initAnalytics();")
r("setInterval(save,3000);", "setInterval(save,3000);\nsetTimeout(dailyCheck,900);")
r("awayCredit(hiddenAt);hiddenAt=null;}", "awayCredit(hiddenAt);hiddenAt=null;setTimeout(dailyCheck,600);}")

# ---- new systems, appended before boot
r("/* ---------- walkthrough ---------- */", r"""/* ---------- live strip: other auctions running at once ---------- */
let LIVE=[],lvSig='';
const liveCap=()=>!S.wins?0:S.wins<10?2:3;
function spawnLive(){const ti=Math.random()<0.7?S.tier:Math.floor(Math.random()*(S.maxTier+1));const x=newAuction(ti,null,true);x.total=x.clock=rnd(16,30);LIVE.push(x);}
function liveTick(dt){const keep=A;try{for(const x of LIVE){A=x;auctionTick(dt);}}finally{A=keep;}
 LIVE=LIVE.filter(x=>!x.dead);const cap=liveCap();let g=0;while(LIVE.length<cap&&g++<3)spawnLive();
 if(cap&&!S.coach?.live&&LIVE.length)coach('live','More auctions are running. Tap Auto on one to bid on it while you play this lot.');renderLive();}
function lvStatus(x){if(x.ended)return x.leader==='you'?['Won','pos']:x.leader?['Sold','']:['Passed in',''];if(x.leader==='you')return['You lead','pos'];if(x.st.hand+x.st.auto+x.st.big>0)return['Outbid','neg'];return[x.auto?'Auto on':'Open',''];}
function renderLive(){const box=$('#lvStrip');box.hidden=!LIVE.length;if(box.hidden)return;
 const sig=LIVE.map(x=>x.lot.no).join(',');const row=$('#lvRow');
 if(sig!==lvSig){lvSig=sig;row.innerHTML=LIVE.map(x=>`<div class="lv" data-lv="${x.lot.no}"><button class="lvmain" data-focus="${x.lot.no}" aria-label="Open ${esc(x.lot.sub)} auction"><div class="lvart">${artOf(x.lot)}</div><div class="lvt"><b>${esc(x.lot.sub)}</b><span class="lvp" data-k="p"></span><span class="lvs" data-k="s"></span></div></button><i class="lvclock"><i data-k="c"></i></i><button class="lvauto" data-auto="${x.lot.no}"></button></div>`).join('');}
 $('#lvCount').textContent=LIVE.length+1+' auctions';
 for(const x of LIVE){const el=row.querySelector(`[data-lv="${x.lot.no}"]`);if(!el)continue;const[s,c]=lvStatus(x),q=x.leader?x.bid:x.lot.open,z=zoneOf(x.ended?q:x.leader==='you'?q:nextBidOf(x),x.lot,x.est);
  el.className='lv'+(x.ended&&x.leader==='you'?' won':x.leader==='you'?' lead':c==='neg'?' outbid':'');
  el.querySelector('[data-k="p"]').textContent=money(q);const se=el.querySelector('[data-k="s"]');se.textContent=s+(x.ended?'':' · '+ZONES[z]);se.className='lvs '+c;
  const ci=el.querySelector('[data-k="c"]');ci.style.width=(x.ended?0:x.clock/x.total*100)+'%';ci.className=x.clock<=4?'hot':'';
  const ab=el.querySelector('.lvauto');ab.disabled=x.ended;ab.setAttribute('aria-pressed',!!x.auto);ab.textContent=x.ended?s:x.auto?'Auto to '+money(x.autoMax):'Auto to '+money(x.autoMax)+'?';}}
const nextBidOf=x=>x.leader?x.bid+x.lot.inc:x.lot.open;
$('#lvRow').onclick=e=>{const a=e.target.closest('[data-auto]');if(a){const x=LIVE.find(y=>y.lot.no===+a.dataset.auto);if(x&&!x.ended){x.auto=!x.auto;x.autoWarned=false;T.c.liveAutos=(T.c.liveAutos||0)+1;hideCoach('live');renderLive();}return;}
 const f=e.target.closest('[data-focus]');if(f)focusLive(+f.dataset.focus);};
function focusLive(no){const i=LIVE.findIndex(y=>y.lot.no===no);if(i<0)return;const x=LIVE[i];if(x.ended)return;
 if(A&&!A.ended){A.bg=true;A.say=null;LIVE[i]=A;}else LIVE.splice(i,1);x.bg=false;A=x;lvSig='';T.c.liveFocus=(T.c.liveFocus||0)+1;renderLot();renderLive();hideCoach('live');}
function quickPlay(){show('a');const cands=LIVE.filter(x=>!x.ended&&x.leader!=='you'&&canPay(nextBidOf(x),x.lot.ti));
 const score=x=>nextBidOf(x)/x.est.hi+(x.clock<6?-0.05:0);cands.sort((a,b)=>score(a)-score(b));T.c.quickPlays=(T.c.quickPlays||0)+1;
 const best=cands[0];if(best&&(!A||A.ended||score(best)<score(A)-0.03))focusLive(best.lot.no);else toast('You are on the hottest lot right now.','up');}
document.addEventListener('click',e=>{if(e.target.closest('[data-quick]'))quickPlay();});

/* ---------- sets ---------- */
function checkSets(p){if(!p)return;const c=sets();S.sets=S.sets||{};S.streetSets=S.streetSets||{};
 if(c.sub[p.sub]>=SET_N&&!S.sets[p.sub]){S.sets[p.sub]=Date.now();award('set_suburb');toast(`Suburb set: ${p.sub}! +10% rent on every home there.`,'up');sfx('rare');confetti(true,0.8);tlog('set_suburb',{sub:p.sub});}
 const k=p.sub+'|'+streetOf(p);if(c.street[k]>=2&&!S.streetSets[k]){S.streetSets[k]=Date.now();award('set_street');toast(`Street pair on ${streetOf(p)}: +5% rent on both.`,'up');tlog('set_street',{key:k});}}
function renderSets(){const c=sets(),subs=Object.entries(c.sub).sort((a,b)=>b[1]-a[1]);$('#setsBox').hidden=!subs.length;
 $('#setList').innerHTML=subs.map(([s,n])=>`<span class="${n>=SET_N?'done':''}">${esc(s)} ${Math.min(n,SET_N)}/${SET_N}${n>SET_N?' +'+(n-SET_N):''}</span>`).join('');}

/* ---------- badges ---------- */
const BADGES=[['first_win','First keys','Win your first house'],['steal','Steal','Win in the green Steal zone'],['steal5','Bargain hunter','Win 5 steals'],['rare','Rare find','Win a rare listing'],['combo2','Double hammer','Win 2 auctions within seconds'],['combo3','Ding ding ding','Win 3 auctions within seconds'],['set_suburb','Local legend','Complete a suburb set'],['set_street','Whole street','Own 2 homes on one street'],['landlord10','Landlord','Own 10 homes'],['magnate25','Magnate','Own 25 homes'],['family','Moving up','Unlock Family homes'],['prestige','Prestige','Unlock Prestige homes'],['flip','Quick flip','Sell a house for a profit'],['debt_free','Debt free','Pay off every loan'],['nemesis','Score settled','Beat your nemesis'],['streak3','Regular','3-day streak'],['streak7','Devoted','7-day streak']];
function award(id){S.badges=S.badges||{};if(S.badges[id])return;const b=BADGES.find(x=>x[0]===id);if(!b)return;S.badges[id]=Date.now();tlog('badge',{id});toast('Badge unlocked: '+b[1],'up');setTimeout(()=>sfx('cash'),400);if(view==='e')renderBadges();}
function renderBadges(){const got=S.badges||{};$('#bCount').textContent=Object.keys(got).length+'/'+BADGES.length;
 $('#badges').innerHTML=BADGES.map(([id,n,d])=>`<div class="bdg${got[id]?' on':''}"><i>${got[id]?'&#9733;':'?'}</i><b>${esc(n)}</b><small>${esc(d)}</small></div>`).join('');}

/* ---------- daily streak ---------- */
const FLAME='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-5 5-8 7-13z"/></svg>';
function drawStreak(){const b=$('#hStreak'),n=S.streak||0;b.hidden=!n;b.innerHTML=FLAME+n;b.setAttribute('aria-label',`${n}-day streak, ${S.freezes||0} freeze${(S.freezes||0)===1?'':'s'}`);}
$('#hStreak').onclick=()=>{show('e');$('#badges').scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});};
const dayDiff=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
function dailyCheck(){const td=today();if(S.lastDay===td)return;if(S.freezes==null)S.freezes=1;const gap=S.lastDay?dayDiff(S.lastDay,td):null;let used=false;
 if(gap===1)S.streak=(S.streak||0)+1;else if(gap===2&&S.freezes>0){S.freezes--;S.streak=(S.streak||0)+1;used=true;}else S.streak=1;
 S.lastDay=td;S.bestStreak=Math.max(S.bestStreak||0,S.streak);if(S.streak%7===0&&S.freezes<2)S.freezes++;
 const k=Math.min(S.streak,7),base=Math.max(10000,worth()*0.01),bonus=roundTo(base*(0.5+0.25*k),1000),next=roundTo(base*(0.5+0.25*Math.min(S.streak+1,7)),1000);S.cash+=bonus;
 if(S.streak>=3)award('streak3');if(S.streak>=7)award('streak7');drawStreak();tlog('streak',{streak:S.streak,used,bonus:Math.round(bonus)});track('Streak',{days:S.streak});save();
 if(gap===null){toast(`Day 1 streak: +${money(bonus)}. Come back tomorrow for ${money(next)}.`,'up');return;}
 const html=`<h3>Day ${S.streak} streak</h3><div class="pips">${[1,2,3,4,5,6,7].map(i=>`<i class="${i<=k?'on':''}">${i}</i>`).join('')}</div><span class="big">+${money(bonus)}</span><p>${used?'A freeze saved your streak. ':''}Come back tomorrow for ${money(next)}. You have ${S.freezes} freeze${S.freezes===1?'':'s'}: a missed day uses one instead of resetting.</p>`;
 if($('#modal').hidden)modal(html,'Collect',()=>{sfx('cash');confetti(false);});else toast(`Day ${S.streak} streak: +${money(bonus)}`,'up');}

/* ---------- coach marks: one line, at the moment it matters ---------- */
function coach(key,msg){S.coach=S.coach||{};if(S.coach[key])return;const c=$('#coach');c.dataset.key=key;c.innerHTML=esc(msg)+'<button aria-label="Dismiss">&times;</button>';c.classList.toggle('top',view!=='a');c.hidden=false;}
function hideCoach(key){const c=$('#coach');if(c.hidden||(key&&c.dataset.key!==key))return;S.coach=S.coach||{};S.coach[c.dataset.key]=1;c.hidden=true;save();}
$('#coach').onclick=()=>hideCoach();

/* ---------- progressive unlocks ---------- */
const mktOpen=()=>S.wins>0||S.props.length>0;
function drawTabs(){$('#tM').classList.toggle('locked',!mktOpen());$('#tM').setAttribute('aria-disabled',!mktOpen());}
function unlockMarket(){drawTabs();if(S.mktUnlocked)return;S.mktUnlocked=1;$('#mNew').hidden=false;toast('Market unlocked: buy homes instantly.','up',()=>show('m'));save();}

/* ---------- session recap: a natural place to stop ---------- */
const SESS={t0:Date.now(),w0:null,i0:null,lots:0,wins:0,focusLots:0,best:null};
function recap(auto){const w=worth(),inc=incomeNow();if(SESS.w0==null){SESS.w0=w;SESS.i0=inc;}const mins=Math.max(1,Math.round((Date.now()-SESS.t0)/60000));
 tlog('recap',{auto:!!auto});track('Session recap',{auto:!!auto});
 const html=`<h3>${auto?'Nice run':'This session'}</h3><p>${mins} minute${mins>1?'s':''} of play.</p><div class="recap"><div><small>Net worth</small><strong class="${w-SESS.w0>=0?'pos':'neg'}">${sg(w-SESS.w0)}</strong></div><div><small>Income/mo</small><strong>${sg(SESS.i0)} → ${sg(inc)}</strong></div><div><small>Auctions</small><strong>${SESS.lots}</strong></div><div><small>Won</small><strong>${SESS.wins}</strong></div><div><small>Best deal</small><strong>${SESS.best==null?'–':sg(SESS.best)}</strong></div><div><small>Streak</small><strong>${S.streak||0} day${(S.streak||0)===1?'':'s'}</strong></div></div>${adHTML()}<p>Rent keeps landing while you're away.</p>`;
 modal(html,'Keep going');renderAds();}
setTimeout(()=>{SESS.w0=worth();SESS.i0=incomeNow();},1500);

/* ---------- ads (off until configured) ---------- */
function adHTML(){if(!CONFIG.ads.enabled||!CONFIG.ads.adsenseClient)return '';return `<aside class="adslot" aria-label="Advertisement"><small>Sponsored</small><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(CONFIG.ads.adsenseClient)}" data-ad-slot="${esc(CONFIG.ads.adsenseSlot)}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>`;}
function renderAds(){if(!CONFIG.ads.enabled||!CONFIG.ads.adsenseClient)return;try{if(!document.querySelector('script[data-ads]')){const s=document.createElement('script');s.async=true;s.dataset.ads='1';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(CONFIG.ads.adsenseClient);s.crossOrigin='anonymous';document.head.appendChild(s);}(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}}

/* ---------- analytics (off until a domain is set) ---------- */
function initAnalytics(){const d=CONFIG.analytics.plausibleDomain;if(!d)return;try{const s=document.createElement('script');s.defer=true;s.dataset.domain=d;s.src='https://plausible.io/js/script.js';document.head.appendChild(s);window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments);};}catch(e){}}
function track(name,props){try{if(window.plausible)window.plausible(name,{props});}catch(e){}}

/* ---------- menu ---------- */
function menu(){$('#sheet').innerHTML=`<div class="menu"><h3>Menu</h3><button id="mnTour">How to play</button><button class="sec" id="mnSound">Sound: ${S.muted?'off':'on'}</button><button class="sec" id="mnRecap">This session</button><button class="sec" id="mnBadges">Badges and sets</button><button class="sec" id="mnClose">Close</button></div>`;$('#modal').hidden=false;
 $('#mnTour').onclick=()=>tour(0);$('#mnSound').onclick=()=>{toggleMute();$('#mnSound').textContent='Sound: '+(S.muted?'off':'on');};$('#mnRecap').onclick=()=>recap(false);
 $('#mnBadges').onclick=()=>{$('#modal').hidden=true;show('e');$('#badges').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});};$('#mnClose').onclick=()=>{$('#modal').hidden=true;};$('#mnTour').focus();}

/* ---------- walkthrough ---------- */""")

# walkthrough copy: mention the new systems
r(" {h:'How to bid',b:()=>`<p><b>Bid</b> raises one step. <b>Go big</b> jumps ahead and can scare rivals off.</p><p><b>Auto-bid</b> keeps you in up to the walk-away price. Short on cash? The bank lends up to 80%.</p>`}];",
  " {h:'How to bid',b:()=>`<p><b>Bid</b> raises one step. <b>Go big</b> jumps ahead and can scare rivals off.</p><p><b>Auto-bid</b> keeps you in up to the walk-away price. Short on cash? The bank lends up to 80%.</p>`},\n {h:'Build sets, keep a streak',b:()=>`<p>Own <b>3 homes in one suburb</b> for +10% rent there; two on one street adds +5%.</p><p>After your first win, more auctions run at once. Tap <b>Auto</b> on them and wins land together.</p><p>Come back daily for a <b>streak bonus</b>. A missed day uses a freeze, not your streak.</p>`}];")

P.write_text(t)
print("patched", len(t), "bytes")
