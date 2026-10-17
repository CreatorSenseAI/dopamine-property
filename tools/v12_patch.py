"""One-off patch: v11 -> v12 (declutter pass from playtest feedback). Applied once.
- swipe-to-dismiss notifications, one at a time (Material snackbar rule)
- leaner header (net worth + income, cash), menu icon
- auction: no bid feed, no meter legend, tier chips only once a second tier opens,
  "If you win" collapsed into a tap-to-open line, auto-bid limit only when auto is on
- market: one compact search row with Hot lot, tier chips only once a second tier opens
- empire: ledger, badges and play stats collapsed; dynasty only near cash-out; rich list top 5
"""
import pathlib, sys

P = pathlib.Path(__file__).resolve().parent.parent / "public/index.html"
t = P.read_text()
if "const VERSION='v12-web'" in t:
    sys.exit("already patched")


def r(old, new, count=1):
    global t
    n = t.count(old)
    if n != count:
        sys.exit(f"expected {count}, found {n}: {old[:90]!r}")
    t = t.replace(old, new)


r("const VERSION='v11-web';", "const VERSION='v12-web';")

# ---------------- header ----------------
r('''      <div><small>Cash</small><strong id="hCash">$0</strong></div>
      <div><small>Net worth</small><strong id="hWorth">$0</strong></div>
      <div><small>Income/mo</small><strong id="hInc">$0</strong></div>''',
  '''      <div><small>Net worth</small><strong id="hWorth">$0</strong><em id="hInc">+$0/mo</em></div>
      <div><small>Cash</small><strong id="hCash">$0</strong></div>''')
r('<button class="help" id="help" aria-label="Menu: how to play, sound, session, badges">?</button>',
  '<button class="help" id="help" aria-label="Menu: how to play, sound, session, badges"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>')
r("hi.textContent=sg(inc);hi.className=inc>0.5?'pos':inc<-0.5?'neg':'';",
  "hi.textContent=sg(inc)+'/mo';hi.className=inc>0.5?'pos':inc<-0.5?'neg':'';")

# ---------------- auction ----------------
r('        <ul class="feed" id="feed"></ul>\n', '')
r("function renderFeed(){if(A&&A.bg)return;", "function renderFeed(){if(A&&A.bg)return;if(!$('#feed'))return;")
r('          <div class="legend"><span><i class="z-steal"></i>Steal</span><span><i class="z-good"></i>Good buy</span><span><i class="z-fair"></i>Fair</span><span><i class="z-over"></i>Overpaying</span></div>\n', '')
r('''    <section class="ifwin" id="ifwin">
      <h2><span id="iwHead">If you win</span></h2>''',
  '''    <details class="ifwin" id="ifwin">
      <summary><span id="iwHead">If you win</span><span class="iwsum" id="iwSum"></span></summary>''')
r('''      <div class="incline" id="iwInc"></div>
    </section>''', '''      <div class="incline" id="iwInc"></div>
    </details>''')
r("const f=$('#iwFlow');f.textContent=sg(pr.net)+'/mo';",
  "$('#iwSum').textContent=sg(pr.net)+'/mo';$('#iwSum').className='iwsum '+(pr.net>=0?'pos':'neg');const f=$('#iwFlow');f.textContent=sg(pr.net)+'/mo';")
r("function buildChips(){$('#chips').innerHTML=", "function buildChips(){$('#chips').hidden=S.maxTier<1&&!AUC_CITY;$('#chips').innerHTML=")
r("$('#autoBtn').setAttribute('aria-pressed',!!A.auto);",
  "$('#autoBtn').setAttribute('aria-pressed',!!A.auto);$('.auto').classList.toggle('on',!!A.auto);")

# ---------------- market ----------------
r('    <button class="quick" data-quick="1">Jump to the hottest auction</button>\n    <h2 class="ohead" id="wHead" hidden>Watching</h2>',
  '    <h2 class="ohead" id="wHead" hidden>Watching</h2>')
r('<div class="msearch"><input id="mQ" type="search" placeholder="Search a suburb or city" autocomplete="off" enterkeyhint="search" aria-label="Search listings by suburb or city"></div>',
  '<div class="msearch"><input id="mQ" type="search" placeholder="Search a suburb or city" autocomplete="off" enterkeyhint="search" aria-label="Search listings by suburb or city"><button class="hotbtn" data-quick="1">Hot lot</button></div>')
r("function renderMChips(){const nd=LST.filter(l=>l.deal).length,",
  "function renderMChips(){$('#mTier').hidden=S.maxTier<1;const nd=LST.filter(l=>l.deal).length,")
r("toast('Watching. It sits at the top of the Market until it sells.','up');", "")

# ---------------- empire ----------------
r('    <button class="quick" data-quick="1">Jump to the hottest auction</button>\n    <section class="unlock" id="unlock">',
  '    <section class="unlock" id="unlock">')
r('<section class="bills"><h2>Monthly ledger</h2>',
  '<details class="bills fold"><summary><h2>Monthly ledger</h2><span class="fsum" id="ledSum"></span></summary>')
r('<p class="bnote" id="debtNote"></p></div></section>', '<p class="bnote" id="debtNote"></p></div></details>')
r('''    <div class="phead"><h2>Badges</h2><span class="bcount" id="bCount"></span></div>
    <div class="badges" id="badges"></div>''',
  '''    <details class="fold plain" id="badgeFold"><summary><h2>Badges</h2><span class="fsum" id="bCount"></span></summary><div class="badges" id="badges"></div></details>''')
r('''    <h2>Your play</h2>
    <section class="playcard">''', '''    <details class="fold plain"><summary><h2>Your play</h2></summary>
    <section class="playcard">''')
r('''      <div><small>Win rate</small><strong id="pRate">-</strong></div>
    </section>''', '''      <div><small>Win rate</small><strong id="pRate">-</strong></div>
    </section></details>''')
r("$('#rich').innerHTML=rows.map((r,i)=>", "$('#rich').innerHTML=rows.map((r,i)=>(i>=5&&!r.me)?'':")
r("drawStars();$('#legacyTxt').textContent=",
  "$('#legacy').hidden=!(S.legacy||w>=1e7);{const led=$('#ledSum');if(led){const n=rentNow-B.total;led.textContent=sg(n)+'/mo';led.className='fsum '+(n>=0?'pos':'neg');}}drawStars();$('#legacyTxt').textContent=")
# badge shortcuts open the fold
r("$('#hStreak').onclick=()=>{show('e');$('#badges').scrollIntoView(",
  "$('#hStreak').onclick=()=>{show('e');$('#badgeFold').open=true;$('#badges').scrollIntoView(")
r("$('#mnBadges').onclick=()=>{$('#modal').hidden=true;show('e');$('#badges').scrollIntoView(",
  "$('#mnBadges').onclick=()=>{$('#modal').hidden=true;show('e');$('#badgeFold').open=true;$('#badges').scrollIntoView(")
r("toast((n.length>1?'Badges unlocked: ':'Badge unlocked: ')+n.join(', '),'up',()=>{show('e');$('#badges')",
  "toast((n.length>1?'Badges unlocked: ':'Badge unlocked: ')+n.join(', '),'up',()=>{show('e');$('#badgeFold').open=true;$('#badges')")

# ---------------- notifications: one at a time, swipe or tap to clear ----------------
r("function toast(msg,kind,onTap){const d=document.createElement('div');d.className='toast '+(kind||'')+(onTap?' tap':'');d.textContent=msg;if(onTap)d.onclick=()=>{d.remove();onTap();};$('#toasts').prepend(d);setTimeout(()=>d.remove(),3200);while($('#toasts').children.length>(view==='m'?2:3))$('#toasts').lastChild.remove();}",
  r"""/* notifications: one on screen at a time, short, swipe sideways or tap to clear */
const TQ=[];let tCur=null;
function toast(msg,kind,onTap){if(tCur&&tCur.msg===msg)return;if(TQ.some(q=>q.msg===msg))return;TQ.push({msg,kind,onTap,at:Date.now()});if(TQ.length>3)TQ.splice(TQ.findIndex(q=>q.kind!=='up')>=0?TQ.findIndex(q=>q.kind!=='up'):0,1);if(!tCur)nextToast();}
function nextToast(){while(TQ.length&&Date.now()-TQ[0].at>8000)TQ.shift();const q=TQ.shift();if(!q){tCur=null;return;}
 const d=document.createElement('div');d.className='toast '+(q.kind||'')+(q.onTap?' tap':'');d.setAttribute('role','status');d.textContent=q.msg;tCur={msg:q.msg,el:d};
 const done=()=>{if(!d.isConnected)return;clearTimeout(d._t);d.classList.add('gone');setTimeout(()=>{d.remove();if(tCur&&tCur.el===d){tCur=null;nextToast();}},180);};
 d._t=setTimeout(done,2800);let sx=null,dx=0;
 d.addEventListener('pointerdown',e=>{sx=e.clientX;dx=0;clearTimeout(d._t);try{d.setPointerCapture(e.pointerId);}catch(x){}});
 d.addEventListener('pointermove',e=>{if(sx==null)return;dx=e.clientX-sx;d.style.transform=`translateX(${dx}px)`;d.style.opacity=String(Math.max(0.2,1-Math.abs(dx)/220));});
 const up=()=>{if(sx==null)return;sx=null;if(Math.abs(dx)>60){d.style.transform=`translateX(${dx>0?120:-120}%)`;d.style.opacity='0';T.c.toastSwipes=(T.c.toastSwipes||0)+1;done();}else if(Math.abs(dx)<8){if(q.onTap)q.onTap();done();}else{d.style.transform='';d.style.opacity='';d._t=setTimeout(done,1600);}};
 d.addEventListener('pointerup',up);d.addEventListener('pointercancel',()=>{sx=null;d.style.transform='';d.style.opacity='';d._t=setTimeout(done,1600);});
 $('#toasts').replaceChildren(d);}""")
r(".toasts{position:absolute;left:16px;right:16px;top:64px;display:flex;flex-direction:column;gap:6px;z-index:20;pointer-events:none}",
  ".toasts{position:absolute;left:16px;right:16px;top:64px;display:flex;flex-direction:column;gap:6px;z-index:20;pointer-events:none}\n.toasts .toast{pointer-events:auto;touch-action:pan-y;user-select:none;-webkit-user-select:none;transition:transform .18s ease,opacity .18s ease;cursor:grab}\n.toasts .toast.gone{opacity:0;transform:translateY(-8px)}")
# fewer small notifications: roll tenant and repair news into the yearly digest from 3 houses
r("function note(cat,msg,kind,always){if(always||S.props.length<8){toast(msg,kind);return;}",
  "function note(cat,msg,kind,always){if(always||S.props.length<3){toast(msg,kind);return;}")
r("S.props.length<8?toast(pick(isStrata(p)?", "S.props.length<3?toast(pick(isStrata(p)?")

# off-market pop-up: swipe it away to pass
r("$('#om').onclick=e=>{if(!OM)return;",
  r"""{let sx=null,dx=0;const om=$('#om');
 om.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;sx=e.clientX;dx=0;});
 om.addEventListener('pointermove',e=>{if(sx==null)return;dx=e.clientX-sx;om.style.transform=`translateX(${dx}px)`;om.style.opacity=String(Math.max(0.2,1-Math.abs(dx)/240));});
 const end=()=>{if(sx==null)return;sx=null;om.style.transform='';om.style.opacity='';if(Math.abs(dx)>70&&OM){T.c.offmktPassed++;T.c.omSwipes=(T.c.omSwipes||0)+1;OM=null;renderOM();}};
 om.addEventListener('pointerup',end);om.addEventListener('pointercancel',end);om.style.touchAction='pan-y';}
$('#om').onclick=e=>{if(!OM)return;""")

# ---------------- css ----------------
r("/* ===== v11 ===== */", r"""/* ===== v12 declutter ===== */
.ledger{gap:16px}
.ledger em{font-style:normal;font-family:var(--f-mono);font-size:11px;font-weight:600;color:var(--muted);line-height:1.1}
.ledger em.pos{color:var(--green)}.ledger em.neg{color:var(--red)}
.help{color:var(--ink)}
.mark b{width:28px;height:28px;font-size:14px}
details.ifwin{padding:0}
details.ifwin>summary{list-style:none;display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;font-family:var(--f-display);font-size:16px;letter-spacing:.04em;text-transform:uppercase}
details.ifwin>summary::-webkit-details-marker,details.fold>summary::-webkit-details-marker{display:none}
details.ifwin>summary::after,details.fold>summary::after{content:"";width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);margin-left:6px;transition:transform .15s}
details[open].ifwin>summary::after,details[open].fold>summary::after{transform:rotate(-135deg)}
.iwsum{margin-left:auto;font-family:var(--f-mono);font-size:13px;font-weight:600;text-transform:none;letter-spacing:0}
details.ifwin[open]{padding-bottom:12px}
details.ifwin .iw,details.ifwin .incline{margin:0 14px}
details.ifwin .incline{margin-top:10px}
.auto .step,.auto .lim{display:none}
.auto.on .step,.auto.on .lim{display:revert}
.auto{flex:1 1 auto}
details.fold>summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer}
details.fold>summary h2{margin:0}
.fsum{margin-left:auto;font-family:var(--f-mono);font-size:13px;font-weight:600;color:var(--muted)}
.fsum.pos{color:var(--green)}.fsum.neg{color:var(--red)}
details.fold.plain{display:flex;flex-direction:column;gap:8px}
details.fold.plain[open]>summary{margin-bottom:8px}
details.bills.fold[open]>summary{margin-bottom:6px}
.msearch{display:flex;gap:8px;align-items:center}
.msearch input{flex:1;min-width:0}
.msearch .hotbtn{margin:0;flex:none;padding:10px 14px}
/* ===== v11 ===== */""")

P.write_text(t)
print("patched", len(t))
