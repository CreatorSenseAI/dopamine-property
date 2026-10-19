// Empire Auction Tycoon (EAT): zero-dependency server for Railway (or any Node 18+ host).
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

for (const d of ["sessions", "players", "boards"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });

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

// ---------- daily showdown leaderboard: one file per UTC day, one entry per install (first score sticks; the name can change) ----------
const DAY = /^\d{4}-\d{2}-\d{2}$/, NICK = /^[A-Za-z0-9 _.-]{3,16}$/;
const boardFile = d => path.join(DATA, "boards", d + ".json");
const readBoard = d => { try { return JSON.parse(fs.readFileSync(boardFile(d), "utf8")); } catch { return {}; } };
function dayOk(d) { if (!DAY.test(d)) return false; const diff = Math.abs(Date.parse(d + "T00:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")); return diff <= 864e5; }
async function boardPost(req, res) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(req, res, 429, "text/plain", "slow down");
  let b; try { b = JSON.parse(await readBody(req, 4096)); } catch { return send(req, res, 400, "text/plain", "bad body"); }
  if (!b || !dayOk(String(b.day)) || !ID.test(String(b.installId))) return send(req, res, 400, "text/plain", "bad entry");
  const nick = String(b.nick || "").trim();
  if (!NICK.test(nick)) return send(req, res, 400, "text/plain", "bad name");
  const board = readBoard(b.day), cur = board[b.installId];
  const stars = Math.max(0, Math.min(999, b.stars | 0));
  if (cur) { cur.nick = nick; if (b.stars != null) cur.stars = stars; }
  else {
    const score = Number(b.score);
    if (!isFinite(score) || score < -60 || score > 120) return send(req, res, 400, "text/plain", "bad score");
    board[b.installId] = { nick, score: Math.round(score * 100) / 100, hammer: Math.round(+b.hammer || 0), value: Math.round(+b.value || 0), rarity: Math.max(0, Math.min(4, b.rarity | 0)), stars, at: new Date().toISOString() };
  }
  writeJSON(boardFile(b.day), board);
  send(req, res, 204, "text/plain", "");
}
function boardGet(req, res, url) {
  const d = url.searchParams.get("day") || "", me = url.searchParams.get("me") || "";
  if (!DAY.test(d)) return send(req, res, 400, "application/json", "{}");
  const all = Object.entries(readBoard(d)).map(([id, e]) => ({ id, ...e })).sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  const rank = all.findIndex(e => e.id === me) + 1;
  const top = all.slice(0, 20).map(e => ({ nick: e.nick, score: e.score, rarity: e.rarity, stars: e.stars || 0, me: e.id === me }));
  send(req, res, 200, "application/json", JSON.stringify({ day: d, count: all.length, rank: rank || null, top }), { "cache-control": "no-store" });
}

// ---------- photoreal house images, generated on the server (the OpenAI key never leaves Railway) ----------
// GET /admin/gen-images?key=ADMIN_KEY            → progress
// GET /admin/gen-images?key=ADMIN_KEY&go=1&per=6 → start a batch (per style; 5 styles), saved to DATA_DIR/img and served at /img/*
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const IMG_DIR = path.join(DATA, "img");
fs.mkdirSync(IMG_DIR, { recursive: true });
const IMG_BASE = "Photorealistic real-estate listing photo, exterior, shot from the street at eye level, wide angle, soft natural light, invented house that does not exist, no people, no cars in focus, no text, no signage, no logos, no watermarks.";
const IMG_STYLES = {
  cottage: ["weatherboard Queenslander cottage on stumps with a wide verandah and tin roof, leafy suburban yard", "1950s red-brick Australian bungalow with a tiled roof, low front fence and lawn", "renovated fibro beach shack painted white with a timber deck and frangipani tree"],
  unit: ["three-storey 1970s red-brick walk-up apartment block with balconies, Australian suburb", "modern low-rise apartment building with timber screens and planter boxes", "art deco apartment block in cream render with curved balconies"],
  villa: ["Mediterranean-style rendered villa with arched windows, terracotta roof and a manicured garden", "Hamptons-style family home with white weatherboards, grey roof and hedges", "Spanish mission home with stucco walls, palms and a courtyard gate"],
  modern: ["architect-designed contemporary home with timber cladding, floor-to-ceiling glass and a pool", "minimalist concrete and glass house cantilevered on a hillside with ocean views at golden hour", "luxury two-storey modern home with a stone facade and landscaped garden at dusk"],
  tower: ["luxury residential tower with glass balconies overlooking a harbour at dusk, penthouse lights on", "sleek high-rise apartment tower on a waterfront promenade at blue hour", "boutique luxury residential tower with sculpted balconies and a rooftop garden at sunset"],
};
const GEN = { running: false, done: 0, failed: 0, total: 0, errors: [], startedAt: null, finishedAt: null };
const imgManifestFile = path.join(IMG_DIR, "manifest.json");
const readImgManifest = () => { try { return JSON.parse(fs.readFileSync(imgManifestFile, "utf8")); } catch { return {}; } };
async function genOne(prompt) {
  const r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { authorization: "Bearer " + OPENAI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.IMAGE_MODEL || "gpt-image-1", prompt, size: "1536x1024", quality: process.env.IMAGE_QUALITY || "medium", n: 1, output_format: "webp", output_compression: 80 }) });
  if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json(), b64 = j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) throw new Error("no image in response");
  return Buffer.from(b64, "base64");
}
async function genImages(per) {
  if (GEN.running || !OPENAI_KEY) return;
  Object.assign(GEN, { running: true, done: 0, failed: 0, total: per * Object.keys(IMG_STYLES).length, errors: [], startedAt: new Date().toISOString(), finishedAt: null });
  const man = readImgManifest();
  for (const [style, variants] of Object.entries(IMG_STYLES)) {
    man[style] = man[style] || [];
    for (let i = 0; i < per; i++) {
      const file = `${style}-${Date.now().toString(36)}-${i}.webp`;
      try {
        fs.writeFileSync(path.join(IMG_DIR, file), await genOne(`${IMG_BASE} Subject: ${variants[(man[style].length + i) % variants.length]}.`));
        man[style].push("img/" + file); writeJSON(imgManifestFile, man); GEN.done++;
      } catch (e) { GEN.failed++; GEN.errors.push(String(e.message || e).slice(0, 200)); if (GEN.failed >= 5 && GEN.done === 0) { GEN.running = false; GEN.finishedAt = new Date().toISOString(); return; } }
    }
  }
  GEN.running = false; GEN.finishedAt = new Date().toISOString();
}
function serveImg(req, res, url) {
  if (url.pathname === "/img/manifest.json") {
    const vol = readImgManifest(), pub = files.get("/img/manifest.json");
    let base = {}; try { base = pub ? JSON.parse(pub.body.toString()) : {}; } catch { }
    for (const [k, v] of Object.entries(vol)) base[k] = [...(base[k] || []), ...v];
    return send(req, res, 200, "application/json", JSON.stringify(base), { "cache-control": "no-cache" }), true;
  }
  const name = path.basename(url.pathname);
  if (!/^[a-z]+-[a-z0-9]+-\d+\.webp$/.test(name)) return false;
  const f = path.join(IMG_DIR, name);
  if (!fs.existsSync(f)) return false;
  res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" });
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(f));
  return true;
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
  // A/B: auctions first (players.mkVar 0 = no Market, 1 = Market kept)
  const abm = [0, 1].map(v => {
    const ps = P.filter(p => p.mkVar === v), ss = S.filter(s => (s.meta || {}).mkVar === v);
    let n1 = 0, dd1 = 0; for (const p of ps) { const days = p.days || [], f = days[0]; if (!f || dayDiff(f, today) < 1) continue; dd1++; if (days.some(d => dayDiff(f, d) === 1)) n1++; }
    const c = k => ss.reduce((n, s) => n + ((s.counters || {})[k] || 0), 0), tab = k => ss.reduce((n, s) => n + ((s.tabSec || {})[k] || 0), 0), tabAll = tab("a") + tab("m") + tab("e");
    return { v, players: ps.length, d1: pct(n1, dd1), medMin: med(ss.map(s => s.playSec / 60))?.toFixed(1) ?? "–", join: pct(c("auctionsJoined"), c("auctionsSeen")), auctionTime: pct(tab("a"), tabAll), winsPerSession: ss.length ? (c("wins") / ss.length).toFixed(1) : "–", mktBuys: c("mktBuys"), sellAuctions: c("sellAuctions") };
  });
  return {
    abm, rankUps: sum("rankUps"), prestiges: sum("prestiges"), dynOpens: sum("dynOpens"), goalTaps: sum("goalTaps"), ifwinOpens: sum("ifwinOpens"), equityLoans: sum("equityLoans"), cardViews: sum("cardViews"), disasters: sum("disasters"), recoveries: sum("recoveries"), goodEvents: sum("goodEvents"), shocks: sum("shocks"), r18On: sum("r18On"), insToggles: sum("insToggles"), prizes: sum("prizes"), worldViews: sum("worldViews"), sealed: sum("sealed"), boardNo: sum("boardNo"), takeovers: sum("takeovers"), turfWon: sum("turfWon"), seasonLevels: sum("seasonLevels"), mystery: sum("mystery"), fx: sum("fx"), rarityInfo: sum("rarityInfo"), pulls: sum("pulls"), tours: sum("tours"), tourClues: sum("tourClues"), bossWins: sum("bossWins"), invites: sum("invites"), groupCreates: sum("groupCreates"), groupJoins: sum("groupJoins"), duelRuns: sum("run_duel"), nightRuns: sum("run_night"), clips: sum("clips"), clipShares: sum("clipShares"), equityBorrowed: sum("equityBorrowed"), cashSheets: sum("cashSheets"), spendWarns: sum("spendWarns"), offerComebacks: sum("offerComebacks"), esec: ["ov", "pf", "mo", "sets", "rich", "bad", "dyn"].map(k => k + " " + sum("esec_" + k)).join(" · "), rar: [0, 1, 2, 3, 4].map(i => sum("rar_" + i)), shareOffers: sum("shareOffers"), shareOpens: sum("shareOpens"), shareDone: sum("shareDone") + sum("shareSaves") + sum("shareCopies"), sdPlays: sum("sdPlays"), sdWins: sum("sdWins"), sdToday: Object.keys(readBoard(today)).length, finalCues: sum("finalCues"), findGood: sum("find_good"), findFlaw: sum("find_flaw"), findJackpot: sum("find_jackpot"), featured: sum("featured"), featuredWon: sum("featuredWon"), sellListings: sum("sellListings"), sellAuctions: sum("sellAuctions"), sellAuctionSold: sum("sellAuctionSold"), agentSales: sum("agentSales"), redevs: sum("redevs"), redevDone: sum("redevDone"), redevSpend: sum("redevSpend"), blowouts: sum("blowouts"), buildDelays: sum("buildDelays"), mansionTax: sum("mansionTax"), iapBuys: sum("iapBuys"), iapRestores: sum("iapRestores"), shopViews: sum("shopViews"), shopClicks: sum("shopClicks"), inApp: S.filter(s => (s.meta || {}).inApp).length,
    iapById: Object.entries(S.flatMap(s => (s.log || []).filter(e => e.type === "purchase")).reduce((m, e) => (m[e.id] = (m[e.id] || 0) + 1, m), {})),
    ab, dailyLots: sum("dailyLots"), rateLocks: sum("rateLocks"), rescueBuys: sum("rescueBuys"), rescues: sum("rescues"),
    players: P.length, sessions: S.length,
    d1: pct(d1n, d1d), d1n: `${d1n}/${d1d}`, d7: pct(d7n, d7d), d7n: `${d7n}/${d7d}`,
    medSessionMin: med(S.map(s => s.playSec / 60))?.toFixed(1) ?? "–", medActiveMin: med(S.map(s => s.activeSec / 60))?.toFixed(1) ?? "–",
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
  const s = stats(); s.soc = (social && social.stats()) || {}; const TIER = ["Starter", "Family", "Prestige", "Trophy", "Icon"];
  const tile = (label, value, note) => `<div class="t"><small>${esc(label)}</small><b>${esc(value ?? "–")}</b>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
  const max = Math.max(1, ...s.dau.map(d => d[1]));
  const tabs = s.tabSec, tabTotal = Math.max(1, tabs[0] + tabs[1] + tabs[2]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Empire Auction Tycoon stats</title>
<style>:root{--bg:#0c1220;--s:#151e31;--ink:#eef2f8;--mu:#97a3b9;--line:#29354f;--g:#3fd08f;--r:#ff4b61;--y:#f2bb45}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif;padding:16px;max-width:960px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin:22px 0 8px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.t{background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px}
.t small{display:block;color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.t b{font:600 20px ui-monospace,monospace}.t em{display:block;font-style:normal;color:var(--mu);font-size:12px}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px;background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px}
.bars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}.bars i{display:block;width:100%;background:var(--y);border-radius:3px 3px 0 0}.bars span{font-size:10px;color:var(--mu)}
a{color:var(--y)}p{color:var(--mu)}</style></head><body>
<h1>Empire Auction Tycoon: play stats</h1><p>${s.players} players · ${s.sessions} sessions · refreshed every 30s · <a href="/admin/export.json?key=${encodeURIComponent(k)}">export JSON</a></p>
<h2>Retention</h2><div class="g">${tile("Day 1 retention", s.d1, s.d1n + " eligible players")}${tile("Day 7 retention", s.d7, s.d7n + " eligible players")}${tile("Median session", s.medSessionMin + " min", "active " + s.medActiveMin + " min")}</div>
<h2>Daily players (last 14 days)</h2><div class="bars">${s.dau.map(([d, n]) => `<div><i style="height:${Math.max(2, n / max * 90)}%"></i><span>${d.slice(5)} · ${n}</span></div>`).join("") || "<p>No data yet</p>"}</div>
<h2>First session</h2><div class="g">${tile("Time to first bid", s.medFirstBidSec == null ? "–" : s.medFirstBidSec + "s")}${tile("Time to first win", s.medFirstWinSec == null ? "–" : s.medFirstWinSec + "s")}${tile("New players who never bid", s.newNeverBid)}</div>
<h2>Auctions</h2><div class="g">${tile("Auctions seen", s.auctionsSeen)}${tile("Joined", s.joinRate, "of lots shown")}${tile("Win rate", s.winRate, "of lots joined")}${tile("Wins paid over value", s.overpaidWins)}${tile("Wins by zone", Object.entries(s.winZones).map(([z, n]) => z + " " + n).join(" · ") || "–")}${tile("Near-misses", s.nearMiss)}${tile("Win combos", s.combos)}${tile("Background auto-bids", s.liveAutos)}${tile("Hot lot taps", s.quickPlays)}</div>
<h2>Auction tension (v20)</h2><div class="g">${tile("Your call cues", s.finalCues, "auto-bid handed back the paddle")}${tile("Inspections", "good " + s.findGood + " · flaw " + s.findFlaw + " · jackpot " + s.findJackpot)}${tile("Featured auctions", s.featured, s.featuredWon + " won")}${tile("Selling", s.sellAuctionSold + "/" + s.sellAuctions + " sold at auction", s.agentSales + " agent sales")}</div>
<h2>Rarity, sharing, showdown</h2><div class="g">${tile("Wins by rarity", ["Common", "Sought-after", "Prime", "Epic", "Legendary"].map((n, i) => n + " " + s.rar[i]).join(" · "))}${tile("Share", s.shareDone + " shared/saved/copied", s.shareOpens + " cards opened · " + s.shareOffers + " Epic+ wins")}${tile("Daily showdown", s.sdPlays + " played", s.sdWins + " won · " + s.sdToday + " on today's board")}</div>
<h2>Dynasty and layout (v25)</h2><div class="g">${tile("Dynasty sheet opens", s.dynOpens, s.prestiges + " cash-outs")}${tile("Goal chip taps", s.goalTaps)}${tile("If-you-win opens", s.ifwinOpens)}${tile("Empire sections", s.esec)}</div>
<h2>Events, world, seasons (v29)</h2><div class="g">${tile("Disasters", s.disasters, s.recoveries + " rebuild booms")}${tile("Good news", s.goodEvents)}${tile("R18+ shocks", s.shocks, s.r18On + " turned R18+ on")}${tile("Insurance toggles", s.insToggles)}${tile("Prizes", s.prizes)}${tile("World sheet", s.worldViews, s.sealed + " sealed rounds · " + s.boardNo + " board rejections")}${tile("Takeovers", s.takeovers, s.turfWon + " won")}${tile("Season levels", s.seasonLevels)}${tile("Mystery lots", s.mystery)}${tile("Event animations", s.fx)}${tile("Rarity explainer", s.rarityInfo)}</div>
<h2>Cards, tours, friends (v27–v28)</h2><div class="g">${tile("Card flips", s.cardViews, s.pulls + " pulls after a win")}${tile("House tours", s.tours, s.tourClues + " clues found")}${tile("Boss lots won", s.bossWins)}${tile("Groups", (s.soc.groups || 0) + " groups", (s.soc.groupMembers || 0) + " members · " + s.groupCreates + " made · " + s.groupJoins + " joins · " + s.invites + " invites")}${tile("Duels", s.duelRuns + " played", (s.soc.duels || 0) + " created")}${tile("Auction Night", s.nightRuns + " runs")}${tile("Feed", (s.soc.feedPosts || 0) + " posts")}${tile("Clips", s.clips + " made", s.clipShares + " shared")}${tile("Push tokens", s.soc.pushTokens || 0, "sending needs APNs/FCM keys")}</div>
<h2>Cash and balance (v26)</h2><div class="g">${tile("Equity loans", s.equityLoans, "$" + Math.round((s.equityBorrowed || 0) / 1e6 * 10) / 10 + "M borrowed")}${tile("Out of reach taps", s.cashSheets, "opened the cash sheet")}${tile("Spend warnings", s.spendWarns, "upgrade or build would block bidding")}${tile("Offer comebacks", s.offerComebacks)}</div>
<h2>Economy</h2><div class="g">${Object.entries(s.unlockMin).map(([t, m]) => tile("Unlock " + (TIER[t] || t), m + " min", "median play time")).join("")}${tile("Overdrafts", s.overdrafts)}${tile("Repossessions", s.foreclosures)}${tile("Bankruptcies", s.bankruptcies)}${tile("Sales", s.sells)}${tile("Upgrades started", s.upgrades, s.upgradeViews + " sheets opened")}${tile("Upgrades finished", s.upgradesDone, s.reclassed + " moved up a category")}${tile("Spent on upgrades", "$" + Math.round((s.upgradeSpend || 0) / 1000) + "K")}${tile("Redevelopments", s.redevs, s.redevDone + " finished · $" + Math.round((s.redevSpend || 0) / 1e6 * 10) / 10 + "M spent")}${tile("Build problems", s.blowouts + " blowouts", s.buildDelays + " delays")}${tile("Mansion tax paid", "$" + Math.round((s.mansionTax || 0) / 1000) + "K")}</div>
<h2>A/B: auctions first (Market removed)</h2><div class="g">${s.abm.map(a => tile(a.v ? "Market kept" : "Auctions first", a.auctionTime + " time in auctions", `${a.players} players · D1 ${a.d1} · ${a.medMin} min/session · join ${a.join} · ${a.winsPerSession} wins/session · ${a.mktBuys} market buys · ${a.sellAuctions} sold at auction`)).join("")}${tile("Rich-list climbs", s.rankUps, "after beating rivals")}</div>
<h2>A/B: bidder registrations</h2><div class="g">${s.ab.map(a => tile(a.v ? "Limited (8, refill 12 min)" : "Control (no limit)", a.join + " join", `${a.players} players · D1 ${a.d1} · ${a.medMin} min/session · ${a.winsPerSession} wins/session${a.v ? ` · ${a.used} used · out ${a.blocked}×` : ""}`)).join("")}${tile("Today's lots", s.dailyLots)}${tile("Bank: rate locks", s.rateLocks)}${tile("Bank: rescue cover", s.rescueBuys, s.rescues + " repossessions stopped")}</div>
<h2>In-app purchases (mobile app only)</h2><div class="g">${tile("App sessions", s.inApp)}${tile("Shop opened", s.shopViews, s.shopClicks + " tapped buy")}${tile("Purchases", s.iapBuys, s.iapById.map(([k, n]) => k + " " + n).join(" · ") || "revenue is in App Store Connect and Play Console")}${tile("Restores", s.iapRestores)}</div>
<h2>Market and interruptions</h2><div class="g">${tile("Market buys", s.mktBuys)}${tile("Offers accepted", s.offerAccept, s.offersMade + " made")}${tile("Off-market bought", s.offmkt)}${tile("Searches", s.searches)}${tile("Watches", s.watches)}${tile("Notices swiped away", s.toastSwipes)}${tile("Real-listing clicks", s.affClicks)}</div>
<h2>Where time goes</h2><div class="g">${tile("Auction tab", pct(tabs[0], tabTotal))}${tile("Market tab", pct(tabs[1], tabTotal))}${tile("Empire tab", pct(tabs[2], tabTotal))}</div>
<h2>Versions</h2><p>${Object.entries(s.versions).map(([v, n]) => esc(v) + ": " + n).join(" · ")}</p>
</body></html>`;
}
// GET /admin/digest.txt?key=…&since=2026-10-18T11:00Z&page=1 → compact text log of recent sessions, ~12K chars a page (readable by a fetch tool)
function digest(url) {
  const since = Date.parse(url.searchParams.get("since") || "") || Date.now() - 48 * 3600e3, page = Math.max(1, +url.searchParams.get("page") || 1), ver = url.searchParams.get("ver") || "";
  const kv = o => Object.entries(o || {}).filter(([, v]) => v !== 0 && v !== null && v !== false && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => k + "=" + (typeof v === "object" ? JSON.stringify(v) : v)).join(" ");
  const M = v => typeof v === "number" ? (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + "K" : String(Math.round(v))) : v;
  const { sessions } = loadAll();
  const list = sessions.filter(x => Date.parse(x.lastSeen || x.start) >= since && (!ver || x.version === ver)).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const out = [];
  for (const x of list) {
    const sn = x.snapshot || {}, lines = [];
    lines.push(`== ${x.sid} ${x.version} ${x.installId} start=${x.start} last=${x.lastSeen} play=${x.playSec}s active=${x.activeSec}s hidden=${x.hiddenSec || 0}s tabs=${kv(x.tabSec)} screen=${(x.device||{}).w}x${(x.device||{}).h}${/iPhone|iPad/.test((x.device||{}).ua||"")?" iOS":/Android/.test((x.device||{}).ua||"")?" Android":""}`);
    lines.push(`snapshot: worth=${M(sn.worth)} cash=${M(sn.cash)} debt=${M(sn.debt)} props=${sn.props} maxTier=${sn.maxTier} tier=${sn.tier} legacy=${sn.legacy} dynasties=${sn.dynasties} bills=${M(sn.billsPerMonth)} autoOn=${sn.autoOn}`);
    lines.push(`counters: ${kv(x.counters)}`);
    lines.push(`derived: ${kv(x.derived)} | funnel: ${kv(x.funnel)} | flags: ${kv(x.flags)} | taps: ${kv(x.taps)}`);
    for (const a of x.auctions || []) lines.push(`A t=${a.t} #${a.no} T${a.tier} ${a.style}${a.rare ? " rare" : ""}${a.quiet ? " quiet" : ""}${a.bg ? " bg" : ""}${a.daily ? " daily" : ""}${a.featured ? " feat" : ""}${a.sell ? " SELL" : ""} val=${M(a.value)} est=${M(a.estLo)}-${M(a.estHi)} guide=${M(a.guide)} hammer=${M(a.hammer)} win=${a.winner} zone=${a.zone} you:hand=${a.yourHand} auto=${a.yourAuto} big=${a.yourBig} max=${M(a.maxYou)} bidders=${a.bidders} rbids=${a.rivalBids}${a.war ? " war" : ""} dur=${a.durSec}s eq=${a.equityPct ?? "-"}% afford=${a.couldAfford} cash=${M(a.cashAt)}${a.rarity != null ? " rar=" + a.rarity : ""}${a.find ? " find=" + a.find : ""}${a.nearMiss ? " NEARMISS" : ""}`);
    for (const e of x.log || []) { const { t, type, ...r } = e; lines.push(`L t=${t} ${type} ${Object.entries(r).map(([k, v]) => k + "=" + (typeof v === "number" ? M(v) : typeof v === "object" ? JSON.stringify(v) : v)).join(" ")}`); }
    out.push(lines.join("\n"));
  }
  const text = out.join("\n\n"), size = 12000, pages = Math.max(1, Math.ceil(text.length / size));
  return `digest since ${new Date(since).toISOString()} · ${list.length} sessions · page ${page}/${pages}\n\n` + text.slice((page - 1) * size, page * size);
}
function authed(url) {
  if (!ADMIN_KEY) return false;
  const k = url.searchParams.get("key") || "";
  const a = Buffer.from(k), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- routes ----------
const social = require("./social")({ DATA, send, readBody, writeJSON, limited, ID, NICK });
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") return send(req, res, 200, "text/plain", "ok");
    /* the native app (capacitor://localhost, https://localhost) calls the API and loads photos cross-origin */
    if (/^\/(api|img)\//.test(url.pathname)) {
      const o = req.headers.origin || "";
      if (/^(capacitor|ionic):\/\/localhost$|^https?:\/\/localhost(:\d+)?$/.test(o)) { res.setHeader("access-control-allow-origin", o); res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS"); res.setHeader("access-control-allow-headers", "content-type"); res.setHeader("vary", "origin"); }
      if (req.method === "OPTIONS") return send(req, res, 204, "text/plain", "");
    }
    if (url.pathname.startsWith("/api/") && await social.handle(req, res, url)) return;
    if (url.pathname === "/api/board") return req.method === "POST" ? await boardPost(req, res) : boardGet(req, res, url);
    if (url.pathname === "/api/play") return req.method === "POST" ? await ingest(req, res) : send(req, res, 405, "text/plain", "POST only");
    if (url.pathname.startsWith("/img/") && serveImg(req, res, url)) return;
    if (url.pathname === "/admin/gen-images") {
      if (!authed(url)) return send(req, res, 404, "text/plain", "not found");
      if (url.searchParams.get("go") === "1" && OPENAI_KEY && !GEN.running) genImages(Math.max(1, Math.min(12, +url.searchParams.get("per") || 6)));
      const man = readImgManifest();
      return send(req, res, 200, "application/json", JSON.stringify({ keySet: !!OPENAI_KEY, ...GEN, images: Object.fromEntries(Object.entries(man).map(([k, v]) => [k, v.length])) }, null, 2), { "cache-control": "no-store" });
    }
    if (url.pathname === "/admin/digest.txt") {
      if (!authed(url)) return send(req, res, 404, "text/plain", "not found");
      const dg = digest(url);
      if (url.searchParams.get("log") === "1") dg.split("\n").forEach((l, i) => l && console.log("DG " + String(i).padStart(4, "0") + " " + l));
      return send(req, res, 200, "text/plain; charset=utf-8", dg, { "cache-control": "no-store", "x-robots-tag": "noindex" });
    }
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
}).listen(PORT, () => console.log(`Empire Auction Tycoon on :${PORT} · logs in ${DATA}${ADMIN_KEY ? " · /admin on" : " · /admin off (set ADMIN_KEY)"}`));

/* play logs straight into the Railway service log (read with the Railway logs tool, filter "DG"; no admin key needed):
   the last 24h at boot, then new sessions every 30 min */
let dgSince = Date.now() - 24 * 3600e3;
function logDigest() {
  try {
    const u = new URL("http://x/?since=" + new Date(dgSince).toISOString()), first = digest(u), pages = +(first.match(/page 1\/(\d+)/) || [0, 1])[1];
    dgSince = Date.now();
    /* Railway drops log lines past ~500/s, so drip them out: 40 lines every 200ms */
    const out = [];
    for (let p = 1; p <= Math.min(pages, 30); p++) { u.searchParams.set("page", p); (p === 1 ? first : digest(u)).split("\n").forEach((l, i) => l && out.push("DG " + String(p).padStart(2, "0") + "." + String(i).padStart(4, "0") + " " + l)); }
    const drip = () => { out.splice(0, 40).forEach(l => console.log(l)); if (out.length) setTimeout(drip, 200); }; drip();
  } catch (e) { console.log("DG error " + e.message); }
}
setTimeout(logDigest, 8000); setInterval(logDigest, 30 * 60e3);
