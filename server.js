// Dopamine Property: zero-dependency server for Railway (or any Node 18+ host).
// - serves public/ with gzip and sensible caching, /healthz for the health check
// - POST /api/play  receives anonymous play logs from the game (random install id, no personal data, no IPs stored)
// - GET  /admin     play-stats dashboard, protected by the ADMIN_KEY env var (404 when unset)
// - GET  /admin/export.json  every stored session + player, for deeper analysis
// Logs live in DATA_DIR (default ./data). On Railway, mount a volume at /data and set DATA_DIR=/data.
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg", ".json": "application/json", ".txt": "text/plain" };
const ID = /^[a-z0-9]{6,32}$/i;

for (const d of ["sessions", "players"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });

// ---------- static files, read once at boot ----------
const files = new Map();
(function walk(dir, prefix) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name), url = prefix + "/" + ent.name;
    if (ent.isDirectory()) { walk(full, url); continue; }
    const body = fs.readFileSync(full), type = TYPES[path.extname(ent.name)] || "application/octet-stream";
    const zip = /^(text|application\/json|image\/svg)/.test(type);
    files.set(url, { body, gz: zip ? zlib.gzipSync(body) : null, type });
  }
})(ROOT, "");

function send(req, res, code, type, body, extra = {}) {
  const gz = typeof body !== "undefined" && body.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", vary: "accept-encoding", ...(gz ? { "content-encoding": "gzip" } : {}), ...extra });
  res.end(req.method === "HEAD" ? undefined : gz ? zlib.gzipSync(body) : body);
}

// ---------- play logs ----------
const hits = new Map(); // ip -> [count, windowStart]  (in memory only, never written)
function limited(ip) {
  const now = Date.now(), h = hits.get(ip) || [0, now];
  if (now - h[1] > 60000) { h[0] = 0; h[1] = now; }
  h[0]++; hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h[0] > 30;
}
function writeJSON(file, obj) {
  const tmp = file + "." + crypto.randomBytes(4).toString("hex");
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > max) { reject(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function ingest(req, res) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(req, res, 429, "text/plain", "slow down");
  let doc;
  try { doc = JSON.parse(await readBody(req, 300 * 1024)); } catch { return send(req, res, 400, "text/plain", "bad body"); }
  const s = doc && doc.session, p = doc && doc.player;
  if (!s || !p || !ID.test(String(s.sid)) || !ID.test(String(p.installId)) || s.installId !== p.installId) return send(req, res, 400, "text/plain", "bad ids");
  const now = new Date().toISOString();
  s.receivedAt = now; p.receivedAt = now;
  writeJSON(path.join(DATA, "sessions", s.sid + ".json"), s);
  writeJSON(path.join(DATA, "players", p.installId + ".json"), p);
  cache = null;
  send(req, res, 204, "text/plain", "");
}

// ---------- admin ----------
let cache = null;
function loadAll() {
  if (cache && Date.now() - cache.at < 30000) return cache;
  const read = d => fs.readdirSync(path.join(DATA, d)).filter(f => f.endsWith(".json")).map(f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, d, f), "utf8")); } catch { return null; } }).filter(Boolean);
  cache = { at: Date.now(), sessions: read("sessions"), players: read("players") };
  return cache;
}
const med = a => { const b = a.filter(x => typeof x === "number" && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const pct = (n, d) => d ? Math.round(n / d * 1000) / 10 + "%" : "–";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

function stats() {
  const { sessions: S, players: P } = loadAll();
  const today = new Date().toISOString().slice(0, 10);
  // retention by install: did they come back on day 1 / day 7 after their first day?
  let d1n = 0, d1d = 0, d7n = 0, d7d = 0;
  for (const p of P) {
    const days = p.days || [], first = days[0]; if (!first) continue;
    if (dayDiff(first, today) >= 1) { d1d++; if (days.some(d => dayDiff(first, d) === 1)) d1n++; }
    if (dayDiff(first, today) >= 7) { d7d++; if (days.some(d => dayDiff(first, d) === 7)) d7n++; }
  }
  const dau = {};
  for (const s of S) { const d = (s.localDate || s.start || "").slice(0, 10); (dau[d] = dau[d] || new Set()).add(s.installId); }
  const A = S.flatMap(s => s.auctions || []);
  const joined = A.filter(a => (a.yourHand || 0) + (a.yourAuto || 0) + (a.yourBig || 0) > 0);
  const wins = A.filter(a => a.winner === "you");
  const sum = k => S.reduce((n, s) => n + ((s.counters || {})[k] || 0), 0);
  const unlocks = S.flatMap(s => (s.log || []).filter(e => e.type === "tier_unlock"));
  const byTier = {}; for (const u of unlocks) (byTier[u.tier] = byTier[u.tier] || []).push(Math.round(u.playSec / 60));
  const versions = {}; for (const s of S) versions[s.version] = (versions[s.version] || 0) + 1;
  const zones = {}; for (const a of wins) if (a.zone) zones[a.zone] = (zones[a.zone] || 0) + 1;
  // A/B: bidder registrations (players.regVar 1 = limited, 0 = control)
  const ab = [1, 0].map(v => {
    const ps = P.filter(p => p.regVar === v), ss = S.filter(s => (s.meta || {}).regVar === v);
    let n1 = 0, dd1 = 0; for (const p of ps) { const days = p.days || [], f = days[0]; if (!f || dayDiff(f, today) < 1) continue; dd1++; if (days.some(d => dayDiff(f, d) === 1)) n1++; }
    const c = k => ss.reduce((n, s) => n + ((s.counters || {})[k] || 0), 0);
    return { v, players: ps.length, d1: pct(n1, dd1), medMin: med(ss.map(s => s.playSec / 60))?.toFixed(1) ?? "–", join: pct(c("auctionsJoined"), c("auctionsSeen")), winsPerSession: ss.length ? (c("wins") / ss.length).toFixed(1) : "–", blocked: c("regBlocked"), used: c("regUsed") };
  });
  return {
    ab, dailyLots: sum("dailyLots"), rateLocks: sum("rateLocks"), rescueBuys: sum("rescueBuys"), rescues: sum("rescues"),
    players: P.length, sessions: S.length,
    d1: pct(d1n, d1d), d1n: `${d1n}/${d1d}`, d7: pct(d7n, d7d), d7n: `${d7n}/${d7d}`,
    medSessionMin: med(S.map(s => s.playSec / 60))?.toFixed(1), medActiveMin: med(S.map(s => s.activeSec / 60))?.toFixed(1),
    medFirstBidSec: med(S.filter(s => s.funnel?.newPlayer).map(s => s.funnel.firstBidSec)), medFirstWinSec: med(S.filter(s => s.funnel?.newPlayer).map(s => s.funnel.firstWinSec)),
    newNeverBid: pct(S.filter(s => s.funnel?.newPlayer && s.funnel.firstBidSec == null).length, S.filter(s => s.funnel?.newPlayer).length),
    auctionsSeen: sum("auctionsSeen"), joinRate: pct(sum("auctionsJoined"), sum("auctionsSeen")), winRate: pct(wins.length, joined.length),
    overpaidWins: pct(wins.filter(a => (a.equityPct || 0) < 0).length, wins.length), winZones: zones,
    nearMiss: sum("nearMiss"), combos: sum("combos"), liveAutos: sum("liveAutos"), quickPlays: sum("quickPlays"),
    mktBuys: sum("mktBuys"), offersMade: sum("offersMade"), offerAccept: pct(sum("offersAccepted"), sum("offersMade")),
    offmkt: pct(sum("offmktBought"), sum("offmktShown")), sells: sum("sells"), upgrades: sum("upgrades"), upgradesDone: sum("upgradesDone"), upgradeViews: sum("upgradeViews"), upgradeSpend: sum("upgradeSpend"), reclassed: sum("reclassed"), overdrafts: sum("overdrafts"), foreclosures: sum("foreclosures"), bankruptcies: sum("bankruptcies"),
    toastSwipes: sum("toastSwipes"), searches: sum("searches"), watches: sum("watches"), affClicks: sum("affClicks"),
    unlockMin: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, med(v)])),
    tabSec: ["a", "m", "e"].map(k => S.reduce((n, s) => n + ((s.tabSec || {})[k] || 0), 0)),
    dau: Object.entries(dau).sort().slice(-14).map(([d, set]) => [d, set.size]), versions,
  };
}

function adminPage(k) {
  const s = stats(), TIER = ["Starter", "Family", "Prestige", "Trophy", "Icon"];
  const tile = (label, value, note) => `<div class="t"><small>${esc(label)}</small><b>${esc(value ?? "–")}</b>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
  const max = Math.max(1, ...s.dau.map(d => d[1]));
  const tabs = s.tabSec, tabTotal = Math.max(1, tabs[0] + tabs[1] + tabs[2]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dopamine Property stats</title>
<style>:root{--bg:#0c1220;--s:#151e31;--ink:#eef2f8;--mu:#97a3b9;--line:#29354f;--g:#3fd08f;--r:#ff4b61;--y:#f2bb45}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif;padding:16px;max-width:960px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin:22px 0 8px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.t{background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px}
.t small{display:block;color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.t b{font:600 20px ui-monospace,monospace}.t em{display:block;font-style:normal;color:var(--mu);font-size:12px}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px;background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px}
.bars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}.bars i{display:block;width:100%;background:var(--y);border-radius:3px 3px 0 0}.bars span{font-size:10px;color:var(--mu)}
a{color:var(--y)}p{color:var(--mu)}</style></head><body>
<h1>Dopamine Property: play stats</h1><p>${s.players} players · ${s.sessions} sessions · refreshed every 30s · <a href="/admin/export.json?key=${encodeURIComponent(k)}">export JSON</a></p>
<h2>Retention</h2><div class="g">${tile("Day 1 retention", s.d1, s.d1n + " eligible players")}${tile("Day 7 retention", s.d7, s.d7n + " eligible players")}${tile("Median session", s.medSessionMin + " min", "active " + s.medActiveMin + " min")}</div>
<h2>Daily players (last 14 days)</h2><div class="bars">${s.dau.map(([d, n]) => `<div><i style="height:${Math.max(2, n / max * 90)}%"></i><span>${d.slice(5)} · ${n}</span></div>`).join("") || "<p>No data yet</p>"}</div>
<h2>First session</h2><div class="g">${tile("Time to first bid", s.medFirstBidSec == null ? "–" : s.medFirstBidSec + "s")}${tile("Time to first win", s.medFirstWinSec == null ? "–" : s.medFirstWinSec + "s")}${tile("New players who never bid", s.newNeverBid)}</div>
<h2>Auctions</h2><div class="g">${tile("Auctions seen", s.auctionsSeen)}${tile("Joined", s.joinRate, "of lots shown")}${tile("Win rate", s.winRate, "of lots joined")}${tile("Wins paid over value", s.overpaidWins)}${tile("Wins by zone", Object.entries(s.winZones).map(([z, n]) => z + " " + n).join(" · ") || "–")}${tile("Near-misses", s.nearMiss)}${tile("Win combos", s.combos)}${tile("Background auto-bids", s.liveAutos)}${tile("Hot lot taps", s.quickPlays)}</div>
<h2>Economy</h2><div class="g">${Object.entries(s.unlockMin).map(([t, m]) => tile("Unlock " + (TIER[t] || t), m + " min", "median play time")).join("")}${tile("Overdrafts", s.overdrafts)}${tile("Repossessions", s.foreclosures)}${tile("Bankruptcies", s.bankruptcies)}${tile("Sales", s.sells)}${tile("Upgrades started", s.upgrades, s.upgradeViews + " sheets opened")}${tile("Upgrades finished", s.upgradesDone, s.reclassed + " moved up a category")}${tile("Spent on upgrades", "$" + Math.round((s.upgradeSpend || 0) / 1000) + "K")}</div>
<h2>A/B: bidder registrations</h2><div class="g">${s.ab.map(a => tile(a.v ? "Limited (8, refill 12 min)" : "Control (no limit)", a.join + " join", `${a.players} players · D1 ${a.d1} · ${a.medMin} min/session · ${a.winsPerSession} wins/session${a.v ? ` · ${a.used} used · out ${a.blocked}×` : ""}`)).join("")}${tile("Today's lots", s.dailyLots)}${tile("Bank: rate locks", s.rateLocks)}${tile("Bank: rescue cover", s.rescueBuys, s.rescues + " repossessions stopped")}</div>
<h2>Market and interruptions</h2><div class="g">${tile("Market buys", s.mktBuys)}${tile("Offers accepted", s.offerAccept, s.offersMade + " made")}${tile("Off-market bought", s.offmkt)}${tile("Searches", s.searches)}${tile("Watches", s.watches)}${tile("Notices swiped away", s.toastSwipes)}${tile("Real-listing clicks", s.affClicks)}</div>
<h2>Where time goes</h2><div class="g">${tile("Auction tab", pct(tabs[0], tabTotal))}${tile("Market tab", pct(tabs[1], tabTotal))}${tile("Empire tab", pct(tabs[2], tabTotal))}</div>
<h2>Versions</h2><p>${Object.entries(s.versions).map(([v, n]) => esc(v) + ": " + n).join(" · ")}</p>
</body></html>`;
}
function authed(url) {
  if (!ADMIN_KEY) return false;
  const k = url.searchParams.get("key") || "";
  const a = Buffer.from(k), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- routes ----------
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") return send(req, res, 200, "text/plain", "ok");
    if (url.pathname === "/api/play") return req.method === "POST" ? await ingest(req, res) : send(req, res, 405, "text/plain", "POST only");
    if (url.pathname === "/admin" || url.pathname === "/admin/export.json") {
      if (!authed(url)) return send(req, res, 404, "text/plain", "not found");
      if (url.pathname === "/admin") return send(req, res, 200, "text/html; charset=utf-8", adminPage(url.searchParams.get("key")), { "cache-control": "no-store", "x-robots-tag": "noindex" });
      const all = loadAll();
      return send(req, res, 200, "application/json", JSON.stringify({ sessions: all.sessions, players: all.players }), { "cache-control": "no-store" });
    }
    const f = files.get(url.pathname === "/" ? "/index.html" : url.pathname) || files.get("/index.html");
    const gzip = !!f.gz && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    res.writeHead(200, {
      "content-type": f.type,
      "cache-control": f.type.startsWith("text/html") || f.type === "application/json" ? "no-cache" : "public, max-age=604800",
      "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", vary: "accept-encoding",
      ...(gzip ? { "content-encoding": "gzip" } : {}),
    });
    res.end(req.method === "HEAD" ? undefined : gzip ? f.gz : f.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(req, res, 500, "text/plain", "error");
  }
}).listen(PORT, () => console.log(`Dopamine Property on :${PORT} · logs in ${DATA}${ADMIN_KEY ? " · /admin on" : " · /admin off (set ADMIN_KEY)"}`));
