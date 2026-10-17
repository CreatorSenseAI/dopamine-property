"""One-off patch: web telemetry (v13). Play logs go to the Railway server when the game
runs on the web, and still to the artifact database inside Claude. Anonymous: a random
install id, no names, emails or IP stored. Players can switch it off in the menu.
Also adds fields the log review showed were missing.
"""
import pathlib, sys

P = pathlib.Path(__file__).resolve().parent.parent / "public/index.html"
t = P.read_text()
if "WEB_STATS" in t:
    sys.exit("already patched")


def r(old, new, count=1):
    global t
    n = t.count(old)
    if n != count:
        sys.exit(f"expected {count}, found {n}: {old[:90]!r}")
    t = t.replace(old, new)


# --- new session fields: time per tab, first bid/win, funnel, tier mode, retention bits
r(" T.playSec++;S.playSec++;T.dirty=true;",
  " T.playSec++;S.playSec++;T.dirty=true;T.tab[view]=(T.tab[view]||0)+1;")
r("auctions:[],log:[],curve:[],flags:{},dirty:true,", "auctions:[],log:[],curve:[],flags:{},tab:{},firstBidSec:null,firstWinSec:null,dirty:true,")
r("  auctions:T.auctions.slice(-80),log:T.log.slice(-150),curve:T.curve.slice(-240)};}",
  "  funnel:{firstBidSec:T.firstBidSec,firstWinSec:T.firstWinSec,newPlayer:S.sessions<=1,coachSeen:Object.keys(S.coach||{}),marketOpen:mktOpen()},\n  tabSec:Object.assign({},T.tab),\n  meta:{tierAuto:S.tierAuto!==false,streak:S.streak||0,bestStreak:S.bestStreak||0,freezes:S.freezes||0,badges:Object.keys(S.badges||{}),sets:Object.keys(S.sets||{}).length,streetSets:Object.keys(S.streetSets||{}).length,live:typeof LIVE!=='undefined'?LIVE.length:0,steals:S.steals||0,borrowed:!!S.borrowed},\n  auctions:T.auctions.slice(-80),log:T.log.slice(-150),curve:T.curve.slice(-240)};}")
r("lastSession:T.sid};}", "lastSession:T.sid,firstSeen:S.days[0]||null,streak:S.streak||0,bestStreak:S.bestStreak||0,badges:Object.keys(S.badges||{}).length,device:{w:innerWidth,h:innerHeight}};}")
# per auction: the deal reading the player saw
r("  overGuidePct:prem===null?null:+(prem*100).toFixed(2),",
  "  estLo:A.est?Math.round(A.est.lo):null,estHi:A.est?Math.round(A.est.hi):null,zone:A.est&&A.bid?zoneOf(A.bid,L,A.est):null,yourMaxZone:A.est&&s.maxYou?zoneOf(s.maxYou,L,A.est):null,tierAuto:S.tierAuto!==false,first:!!A.first,\n  overGuidePct:prem===null?null:+(prem*100).toFixed(2),")
r("if(who==='you'){S.skipStreak=0;A.war=null;const s=A.st;", "if(who==='you'){S.skipStreak=0;A.war=null;const s=A.st;if(T.firstBidSec==null)T.firstBidSec=tnow();")
r("if(A.leader==='you'){T.c.wins++;SESS.wins++;", "if(A.leader==='you'){T.c.wins++;SESS.wins++;if(T.firstWinSec==null)T.firstWinSec=tnow();")
r("function hideCoach(key){const c=$('#coach');if(c.hidden||(key&&c.dataset.key!==key))return;",
  "function hideCoach(key){const c=$('#coach');if(c.hidden||(key&&c.dataset.key!==key))return;tlog('coach_done',{key:c.dataset.key,by:key?'action':'tap'});")

# --- send to the server on the web
r("async function flushPlay(){if(!DB||flushing||!T.dirty)return;flushing=true;T.dirty=false;\n try{await DB.doc('sessions/'+T.sid).set(sessionDoc());await DB.doc('players/'+installId).set(playerDoc());}",
  r"""/* on the web, play logs go to our own server (anonymous install id, no personal data); inside Claude they go to the artifact database */
const WEB_STATS=/^https?:$/.test(location.protocol)&&!window.claude&&!/claude\.ai|claudeusercontent/.test(location.hostname);
const statsOn=()=>!S.noStats;
async function flushPlay(){if(flushing||!T.dirty||!statsOn())return;if(!DB&&!WEB_STATS)return;flushing=true;T.dirty=false;
 try{if(DB){await DB.doc('sessions/'+T.sid).set(sessionDoc());await DB.doc('players/'+installId).set(playerDoc());}
  else{const res=await fetch('/api/play',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:sessionDoc(),player:playerDoc()})});if(!res.ok&&res.status>=500)T.dirty=true;}}""")
r("window.addEventListener('pagehide',()=>{save();flushPlay();});",
  "window.addEventListener('pagehide',()=>{save();if(WEB_STATS&&statsOn()&&navigator.sendBeacon){try{const d=sessionDoc();d.log=d.log.slice(-30);d.auctions=d.auctions.slice(-20);d.curve=d.curve.slice(-20);navigator.sendBeacon('/api/play',new Blob([JSON.stringify({session:d,player:playerDoc()})],{type:'application/json'}));}catch(e){}}else flushPlay();});")

# --- menu: switch for anonymous stats
r("<button class=\"sec\" id=\"mnBadges\">Badges and sets</button>",
  "<button class=\"sec\" id=\"mnBadges\">Badges and sets</button><button class=\"sec\" id=\"mnStats\">Anonymous play stats: ${S.noStats?'off':'on'}</button>")
r("$('#mnClose').onclick=()=>{$('#modal').hidden=true;};",
  "$('#mnClose').onclick=()=>{$('#modal').hidden=true;};$('#mnStats').onclick=()=>{S.noStats=!S.noStats;save();$('#mnStats').textContent='Anonymous play stats: '+(S.noStats?'off':'on');};")

P.write_text(t)
print("patched", len(t))
