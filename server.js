// Auction Empires: zero-dependency server for Railway (or any Node 18+ host).
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

for (const d of ["sessions", "players", "boards", "saves"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });

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
/* v31 transfer codes: a save travels between the web game and the app (different origins, so localStorage can't). 30-day files in DATA/saves. */
const SAVE_CODE = /^EAT-[A-Z2-9]{4}-[A-Z2-9]{4}$/, saveFile = c => path.join(DATA, "saves", c + ".json");
function newSaveCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const p = () => Array.from(crypto.randomBytes(4)).map(b => A[b % A.length]).join(""); for (let i = 0; i < 20; i++) { const c = "EAT-" + p() + "-" + p(); if (!fs.existsSync(saveFile(c))) return c; } return null; }
// ---------- v34 feedback: in-game star rating + comment, stored one file per entry, listed on /admin ----------
const FB_DIR = path.join(DATA, "feedback"); fs.mkdirSync(FB_DIR, { recursive: true });
async function feedbackPost(req, res) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(req, res, 429, "text/plain", "slow down");
  let b; try { b = JSON.parse(await readBody(req, 20000)); } catch { return send(req, res, 400, "application/json", JSON.stringify({ error: "bad feedback" })); }
  const stars = Math.max(0, Math.min(5, Math.round(+b.stars || 0))), text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 1500), contact = String(b.contact || "").trim().slice(0, 120);
  if (!stars && !text) return send(req, res, 400, "application/json", JSON.stringify({ error: "Pick a star rating or write a line." }));
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const doc = { id, at: new Date().toISOString(), stars, text, contact, installId: ID.test(String(b.installId)) ? b.installId : null, nick: String(b.nick || "").slice(0, 40), version: String(b.version || "").slice(0, 20), level: +b.level || 0, worth: +b.worth || 0, sessions: +b.sessions || 0, device: String(b.device || "").slice(0, 80), source: String(b.source || "menu").slice(0, 20) };
  writeJSON(path.join(FB_DIR, id + ".json"), doc);
  console.log(`FB ${"★".repeat(stars)}${"☆".repeat(5 - stars)} ${doc.installId || "?"} lv${doc.level} ${doc.source}: ${text || "(no comment)"}${contact ? " <" + contact + ">" : ""}`);
  send(req, res, 200, "application/json", JSON.stringify({ ok: true }));
}
function feedbackList(n) {
  let files = []; try { files = fs.readdirSync(FB_DIR).filter(f => f.endsWith(".json")).sort().reverse().slice(0, n || 100); } catch { }
  return files.map(f => { try { return JSON.parse(fs.readFileSync(path.join(FB_DIR, f), "utf8")); } catch { return null; } }).filter(Boolean);
}
async function savePost(req, res) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(req, res, 429, "text/plain", "slow down");
  let b; try { b = JSON.parse(await readBody(req, 600000)); } catch { return send(req, res, 400, "application/json", JSON.stringify({ error: "That game is too big to move. Try again in a moment." })); }
  if (!b || !b.save || typeof b.save !== "object" || !ID.test(String(b.installId))) return send(req, res, 400, "application/json", JSON.stringify({ error: "bad save" }));
  const code = newSaveCode(); if (!code) return send(req, res, 503, "application/json", JSON.stringify({ error: "Try again" }));
  writeJSON(saveFile(code), { code, installId: b.installId, at: new Date().toISOString(), save: b.save });
  send(req, res, 200, "application/json", JSON.stringify({ code }));
}
function saveGet(req, res, url) {
  const code = String(url.searchParams.get("code") || "").toUpperCase().replace(/^(EAT)?-?/, "EAT-");
  if (!SAVE_CODE.test(code)) return send(req, res, 400, "application/json", JSON.stringify({ error: "That code doesn't look right. Codes look like EAT-7KQ2-M4PX." }));
  let j; try { j = JSON.parse(fs.readFileSync(saveFile(code), "utf8")); } catch { return send(req, res, 404, "application/json", JSON.stringify({ error: "No game found for that code. Codes last 30 days." })); }
  if (Date.now() - Date.parse(j.at) > 30 * 864e5) { try { fs.unlinkSync(saveFile(code)); } catch { } return send(req, res, 410, "application/json", JSON.stringify({ error: "That code has expired. Get a new one from the first device." })); }
  send(req, res, 200, "application/json", JSON.stringify({ save: j.save }), { "cache-control": "no-store" });
}
setInterval(() => { try { for (const f of fs.readdirSync(path.join(DATA, "saves"))) { const p = path.join(DATA, "saves", f); if (Date.now() - fs.statSync(p).mtimeMs > 31 * 864e5) fs.unlinkSync(p); } } catch { } }, 6 * 3600e3);
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
// GET /admin/gen-images?key=ADMIN_KEY&go=1&per=24&rooms=10 → fill every bucket to that many (default IMG_PER / IMG_ROOM_PER); &stop=1 halts. Saved to DATA_DIR/img, served at /img/*
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const IMG_DIR = path.join(DATA, "img");
fs.mkdirSync(IMG_DIR, { recursive: true });
const IMG_BASE = "Photorealistic real-estate listing photo, exterior, shot from the street at eye level, wide angle, soft natural light, invented house that does not exist, no people, no cars in focus, no text, no signage, no logos, no watermarks.";
/* v32: photo buckets are style-tier-region (e.g. villa-2-au). Targets per bucket come from IMG_PER (exteriors) and IMG_ROOM_PER (rooms);
   prompts are randomised so a bucket of 40 looks like 40 different homes. The old style-only keys stay for older clients. */
const IMG_TIERS = ["Starter","Family","Prestige","Trophy","Icon"];
const IMG_TIER_STYLES = [["cottage","unit"],["cottage","villa","modern"],["modern","villa"],["tower","modern","villa"],["tower","villa","modern"]];
const IMG_REGIONS = { au: "Australia", nz: "Auckland, New Zealand", uk: "London, England", us: "the United States", eu: "the French Riviera", ae: "Dubai", jp: "Tokyo, Japan" };
const IMG_TIER_REGIONS = [["au","nz"],["au","nz","uk","us"],["au","nz","uk","us","ae","eu"],["au","uk","us","ae","eu","jp"],["au","uk","us","ae","eu","jp"]];
const IMG_SUBJECT = {
  cottage: ["a small weatherboard cottage with a front verandah", "a 1950s brick bungalow with a tiled roof", "a fibro beach shack with a timber deck", "a timber Queenslander on stumps with a tin roof", "a modest post-war cottage with a low front fence", "a renovated worker's cottage with a picket fence", "a brick veneer family home with a double carport", "a sandstone cottage with a slate roof", "a mid-century weatherboard home with a sunroom", "a two-storey family home with a pitched roof and a double garage", "a Federation house with a return verandah and leadlight", "a Victorian terrace with iron lace", "a Georgian townhouse with sash windows", "a Craftsman bungalow with a deep porch", "a brownstone row house with a stoop"],
  unit: ["a three-storey 1970s brick walk-up apartment block with balconies", "a modern low-rise apartment building with timber screens", "an art deco apartment block in cream render", "a six-storey apartment building with glass balconies and planters", "a converted warehouse apartment building in red brick", "a boutique apartment block with a landscaped entry", "a mid-rise apartment building with curved balconies"],
  villa: ["a Mediterranean-style rendered villa with arched windows and a terracotta roof", "a Hamptons-style home with white weatherboards and hedges", "a Spanish mission home with stucco walls and palms", "a French provincial home with a slate mansard roof and shutters", "a Tuscan villa with a cypress-lined drive", "a Georgian manor with symmetrical windows and a gravel forecourt", "a grand white stucco mansion with columns", "a colonial plantation home with a wrap-around verandah", "a Palladian mansion with a portico", "a château-style estate with a fountain"],
  modern: ["an architect-designed contemporary home with timber cladding and floor-to-ceiling glass", "a minimalist concrete and glass house cantilevered over a slope", "a two-storey modern home with a stone facade", "a flat-roofed modern home with black steel windows and a pool", "a glass pavilion house on a cliff edge", "a modern beach house with raw timber and a wide deck", "a mid-century modern home with a butterfly roof", "a modern home with a green roof and rammed-earth walls", "a sleek white modern home with a cantilevered upper floor"],
  tower: ["a luxury residential tower with glass balconies", "a sleek high-rise apartment tower on a waterfront promenade", "a boutique residential tower with sculpted balconies and a rooftop garden", "a twisting glass residential skyscraper", "a supertall slender residential tower", "a pair of curved residential towers joined by a sky bridge", "a terraced residential tower with planted balconies"],
};
const IMG_TIER_TONE = ["modest, dated, lived-in, affordable suburb", "well-kept family home, leafy established street", "prestige home, manicured garden, expensive suburb", "trophy estate, gated, sweeping grounds or waterfront", "iconic landmark residence, breathtaking setting, the best address in the world"];
const IMG_SUBJECT_RG = {
  cottage: { uk: ["a Victorian terrace with a bay window", "a Georgian townhouse with sash windows", "a red-brick semi-detached house with a tiled roof", "a stone cottage with a slate roof"], us: ["a Craftsman bungalow with a deep porch", "a brownstone row house with a stoop", "a colonial two-storey home with shutters", "a ranch-style home with a wide lawn"], nz: ["a weatherboard villa with a bullnose verandah", "a 1960s brick-and-tile home on a quarter-acre", "a timber bach with a deck"] },
  villa: { uk: ["a Georgian manor with symmetrical windows and a gravel forecourt", "a white stucco Regency villa with columns", "a red-brick Edwardian mansion with chimneys"], us: ["a Spanish mission home with stucco walls and palms", "a colonial plantation home with a wrap-around verandah", "a Hamptons-style home with white weatherboards and hedges", "a Beverly Hills mansion with a circular drive"], eu: ["a French provincial home with a slate mansard roof and shutters", "a Belle Époque villa with wrought-iron balconies", "a pink stucco Riviera villa with cypress trees", "a château-style estate with a fountain"], ae: ["a white modern villa with a flat roof, palms and a gated drive", "an Arabic-style villa with arches, mashrabiya screens and a courtyard", "a waterfront villa with a private jetty"] },
  tower: { jp: ["a sleek Tokyo residential tower with a sky lobby", "a glass residential tower above a landscaped plaza in Tokyo"], uk: ["a slender glass residential tower on the Thames", "a modern residential tower with a brick podium in London"], us: ["a supertall glass residential tower over Central Park", "a slender Manhattan residential skyscraper"] },
  modern: { jp: ["a minimalist concrete Japanese modern house with a courtyard", "a timber-and-glass modern home in a quiet Tokyo lane"], ae: ["a white modern villa with a flat roof and an infinity pool on the water", "a sculptural glass home on a private island"], eu: ["a glass and stone modern villa on a hillside over the sea", "a minimalist white modern home with a pool and sea views"] },
};
const IMG_VARY = {
  era: ["original condition", "freshly renovated", "newly built", "heritage listed", "tastefully updated", "a little tired", "immaculate"],
  colour: ["white", "cream", "pale grey", "sage green", "charcoal", "sandstone", "red brick", "navy and white", "honey timber", "terracotta", "blonde brick", "black and timber"],
  roof: ["a corrugated iron roof", "a terracotta tiled roof", "a slate roof", "a flat roof", "a dark tiled roof", "a standing-seam metal roof"],
  garden: [["a neat lawn and a gum tree", "frangipani and hedges", "roses and a picket fence", "native grasses", "a jacaranda in bloom", "overgrown with a wonky letterbox", "a concrete drive and a lemon tree", "a small front yard with a hills hoist glimpsed"], ["a manicured box hedge", "palms and a tropical garden", "a gravel drive and olive trees", "clipped topiary and a water feature", "a sandstone wall and agaves", "a sweeping lawn down to the water"], ["sweeping landscaped grounds", "a palm-lined drive and a fountain", "a waterfront lawn and a jetty", "terraced gardens to the sea", "a gated forecourt and a reflection pool"]],
  towerset: ["a landscaped forecourt", "a waterfront promenade", "a palm-lined entry drive", "a marina at its feet", "a park across the street"],
  light: ["in warm late-afternoon light", "on a bright clear morning", "at blue hour with the lights on", "under a soft overcast sky", "at golden hour", "on a crisp sunny day with long shadows"],
  angle: ["from directly across the street", "from a three-quarter angle", "from the footpath looking up the drive", "slightly elevated from across the road", "from the front gate"],
  extra: [["", "", "a car in the driveway", "bins out the front", "kids' bikes on the porch", "a dog asleep on the verandah", "washing on the line", "a letterbox with the number", "a basketball hoop on the garage"], ["", "", "a car in the driveway", "a pool glimpsed at the side", "a dog on the lawn"], ["", "", "a luxury car in the drive", "a pool glimpsed at the side", "a helipad glimpsed", "a superyacht moored beyond"]],
};
const IMG_ROOM_BASE = "Photorealistic real-estate listing photo, interior, wide angle, bright natural light, styled for sale, invented home, no people, no text, no signage, no logos, no watermarks.";
const IMG_ROOMS = {
  living: ["an open-plan living room", "a living room with a fireplace", "a sunken lounge", "a formal sitting room", "a family room opening onto a deck"],
  kitchen: ["a kitchen with an island bench", "a galley kitchen", "a country kitchen with a farmhouse sink", "a kitchen with a butler's pantry", "a kitchen and dining space"],
  bed: ["a main bedroom", "a bedroom with a window seat", "a bedroom with a walk-in robe glimpse", "a bedroom with a balcony", "a guest bedroom"],
  yard: ["a backyard with a lawn", "a backyard with a swimming pool", "a courtyard garden", "a timber deck with outdoor dining", "a garden with a fire pit"],
  lobby: ["an apartment building lobby", "a boutique apartment entry", "a residential tower lobby with a concierge desk", "an apartment entrance hall"],
  view: ["a balcony with outdoor furniture", "a penthouse terrace", "a rooftop terrace", "a balcony over the water"],
};
const IMG_ROOM_BANDS = { lo: "modest, dated, original fittings, budget furniture, rental-ready", mid: "renovated, stone benchtops, timber floors, family home", hi: "luxury, designer furniture, marble, floor-to-ceiling glass, views" };
const IMG_ROOM_VARY = ["timber floors", "polished concrete", "carpet", "white walls", "a feature wall", "sheer curtains", "pendant lights", "plants", "a rug", "art on the wall", "morning light", "afternoon light", "a city view", "a garden view", "an ocean view", "exposed brick", "high ceilings", "a skylight"];
const pickR = a => a[Math.floor(Math.random() * a.length)];
const IMG_PER = Math.max(1, Math.min(200, +process.env.IMG_PER || 24));
const IMG_ROOM_PER = Math.max(1, Math.min(200, +process.env.IMG_ROOM_PER || 10));
const IMG_PARALLEL = Math.max(1, Math.min(6, +process.env.IMG_PARALLEL || 3));
function imgTargets(perE, perR) {
  const t = {};
  IMG_TIER_STYLES.forEach((styles, ti) => { for (const st of styles) for (const rg of IMG_TIER_REGIONS[ti]) t[`${st}-${ti}-${rg}`] = perE; });
  for (const room of Object.keys(IMG_ROOMS)) for (const band of Object.keys(IMG_ROOM_BANDS)) t[`room-${room}-${band}`] = perR;
  return t;
}
function imgPrompt(key) {
  const m = key.match(/^room-([a-z]+)-(lo|mid|hi)$/);
  if (m) { const v = [...IMG_ROOM_VARY].sort(() => Math.random() - .5).slice(0, 3).join(", "); return `${IMG_ROOM_BASE} Subject: ${pickR(IMG_ROOMS[m[1]])}, ${IMG_ROOM_BANDS[m[2]]}, ${v}.`; }
  const [st, ti, rg] = key.split("-"), T = +ti, V = IMG_VARY, band = T <= 1 ? 0 : T === 2 ? 1 : 2;
  const subj = (IMG_SUBJECT_RG[st] && IMG_SUBJECT_RG[st][rg] && Math.random() < 0.7) ? pickR(IMG_SUBJECT_RG[st][rg]) : pickR(IMG_SUBJECT[st]);
  const tower = st === "tower", roof = tower || st === "unit" ? "" : ` with ${pickR(V.roof)}`, setting = tower ? pickR(V.towerset) : pickR(V.garden[band]), extra = tower ? "" : pickR(V.extra[band]);
  const era = T >= 3 ? pickR(["immaculate", "newly built", "heritage listed", "tastefully updated"]) : pickR(V.era);
  return `${IMG_BASE} Subject: ${subj}, ${era}, ${pickR(V.colour)}${roof}, ${setting}${extra ? ", " + extra : ""}, in ${IMG_REGIONS[rg] || "Australia"}. Tone: ${IMG_TIER_TONE[T] || IMG_TIER_TONE[1]} (${IMG_TIERS[T] || "Family"} tier). Photographed ${pickR(V.angle)} ${pickR(V.light)}.`;
}
const GEN = { running: false, done: 0, failed: 0, total: 0, errors: [], startedAt: null, finishedAt: null, stop: false };
const imgManifestFile = path.join(IMG_DIR, "manifest.json");
const readImgManifest = () => { try { return JSON.parse(fs.readFileSync(imgManifestFile, "utf8")); } catch { return {}; } };
const imgCount = m => Object.values(m).reduce((a, v) => a + v.length, 0);
async function genOne(prompt) {
  const r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { authorization: "Bearer " + OPENAI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.IMAGE_MODEL || "gpt-image-1", prompt, size: "1536x1024", quality: process.env.IMAGE_QUALITY || "medium", n: 1, output_format: "webp", output_compression: 80 }) });
  if (!r.ok) { const e = new Error(r.status + " " + (await r.text()).slice(0, 200)); e.status = r.status; throw e; }
  const j = await r.json(), b64 = j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) throw new Error("no image in response");
  return Buffer.from(b64, "base64");
}
/* Fills every bucket up to its target, IMG_PARALLEL at a time, round-robin so early buckets get a few photos each before any is full.
   429/5xx back off; 10 failures in a row with nothing done stops the run (bad key, no billing). */
async function genImages(perE, perR) {
  if (GEN.running || !OPENAI_KEY) return;
  perE = perE || IMG_PER; perR = perR || IMG_ROOM_PER;
  const targets = imgTargets(perE, perR), man = readImgManifest();
  const todo = []; for (const [k, n] of Object.entries(targets)) { man[k] = man[k] || []; for (let i = man[k].length; i < n; i++) todo.push({ k, i }); }
  todo.sort((a, b) => a.i - b.i || (a.k < b.k ? -1 : 1));
  Object.assign(GEN, { running: true, done: 0, failed: 0, total: todo.length, errors: [], startedAt: new Date().toISOString(), finishedAt: null, stop: false, reason: null });
  console.log(`IMG filling ${todo.length} photos into ${Object.keys(targets).length} buckets (${perE}/exterior bucket, ${perR}/room bucket, ${IMG_PARALLEL} at a time)`);
  let streak = 0, seq = 0;
  const worker = async () => {
    while (todo.length && !GEN.stop) {
      const { k } = todo.shift();
      const file = `${k}-${Date.now().toString(36)}-${seq++}.webp`;
      try {
        const buf = await genOne(imgPrompt(k));
        fs.writeFileSync(path.join(IMG_DIR, file), buf);
        man[k].push("img/" + file); writeJSON(imgManifestFile, man); GEN.done++; streak = 0;
        if (GEN.done % 10 === 1 || GEN.done === GEN.total) console.log(`IMG ${GEN.done}/${GEN.total} (${k} ${man[k].length}/${targets[k]}, ${imgCount(man)} on the volume)`);
      } catch (e) {
        GEN.failed++; streak++; const msg = String(e.message || e).replace(/\s+/g, " ").slice(0, 200); GEN.errors.push(msg); if (GEN.errors.length > 20) GEN.errors.shift();
        console.log("IMG fail " + k + " " + msg);
        if (/no credits|insufficient_quota|billing|exceeded your current quota/i.test(msg)) { if (!GEN.stop) console.log("IMG stopped: the OpenAI account has no credits. Top up at platform.openai.com/settings/organization/billing; photos resume on the next deploy or /admin/gen-images?go=1"); GEN.stop = true; GEN.reason = "no credits"; break; }
        if (e.status === 401 || e.status === 403) { if (!GEN.stop) console.log("IMG stopped: OpenAI rejected the key (" + e.status + ")"); GEN.stop = true; GEN.reason = "bad key"; break; }
        if (e.status === 429 || (e.status >= 500)) await new Promise(r => setTimeout(r, 20000 * Math.min(6, streak)));
        if (streak >= 10 && GEN.done === 0) { GEN.stop = true; GEN.reason = "10 failures"; console.log("IMG stopped: 10 failures in a row (check the key, billing or model name)"); }
        else if (streak >= 30) { GEN.stop = true; GEN.reason = "30 failures"; console.log("IMG stopped: 30 failures in a row"); }
      }
    }
  };
  await Promise.all(Array.from({ length: IMG_PARALLEL }, worker));
  GEN.running = false; GEN.finishedAt = new Date().toISOString(); console.log(`IMG done ${GEN.done} ok, ${GEN.failed} failed, ${imgCount(man)} photos on the volume`);
}
function imgStatus() {
  const man = readImgManifest(), targets = imgTargets(IMG_PER, IMG_ROOM_PER), buckets = {};
  for (const k of Object.keys(targets)) buckets[k] = `${(man[k] || []).length}/${targets[k]}`;
  const want = Object.values(targets).reduce((a, b) => a + b, 0), have = Object.keys(targets).reduce((a, k) => a + Math.min(targets[k], (man[k] || []).length), 0);
  return { ...GEN, have, want, onVolume: imgCount(man), perExterior: IMG_PER, perRoom: IMG_ROOM_PER, parallel: IMG_PARALLEL, quality: process.env.IMAGE_QUALITY || "medium", buckets };
}
function serveImg(req, res, url) {
  if (url.pathname === "/img/manifest.json") {
    const vol = readImgManifest(), pub = files.get("/img/manifest.json");
    let base = {}; try { base = pub ? JSON.parse(pub.body.toString()) : {}; } catch { }
    for (const [k, v] of Object.entries(vol)) base[k] = [...(base[k] || []), ...v];
    return send(req, res, 200, "application/json", JSON.stringify(base), { "cache-control": "no-cache" }), true;
  }
  const name = path.basename(url.pathname);
  if (!/^[a-z]+(-[a-z0-9]+){0,3}-[a-z0-9]+-\d+\.webp$/.test(name)) return false;
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
    abm, arenaBids: sum("arenaBids"), arenaWins: sum("arenaWins"), duelW: sum("duelW"), rankUps: sum("rankUps"), prestiges: sum("prestiges"), dynOpens: sum("dynOpens"), goalTaps: sum("goalTaps"), ifwinOpens: sum("ifwinOpens"), equityLoans: sum("equityLoans"), cardViews: sum("cardViews"), disasters: sum("disasters"), recoveries: sum("recoveries"), goodEvents: sum("goodEvents"), shocks: sum("shocks"), r18On: sum("r18On"), insToggles: sum("insToggles"), prizes: sum("prizes"), worldViews: sum("worldViews"), sealed: sum("sealed"), boardNo: sum("boardNo"), takeovers: sum("takeovers"), turfWon: sum("turfWon"), seasonLevels: sum("seasonLevels"), mystery: sum("mystery"), fx: sum("fx"), rarityInfo: sum("rarityInfo"), pulls: sum("pulls"), tours: sum("tours"), tourClues: sum("tourClues"), bossWins: sum("bossWins"), invites: sum("invites"), groupCreates: sum("groupCreates"), groupJoins: sum("groupJoins"), duelRuns: sum("run_duel"), nightRuns: sum("run_night"), clips: sum("clips"), clipShares: sum("clipShares"), equityBorrowed: sum("equityBorrowed"), cashSheets: sum("cashSheets"), spendWarns: sum("spendWarns"), offerComebacks: sum("offerComebacks"), esec: ["ov", "pf", "mo", "sets", "rich", "bad", "dyn"].map(k => k + " " + sum("esec_" + k)).join(" · "), rar: [0, 1, 2, 3, 4].map(i => sum("rar_" + i)), shareOffers: sum("shareOffers"), shareOpens: sum("shareOpens"), shareDone: sum("shareDone") + sum("shareSaves") + sum("shareCopies"), sdPlays: sum("sdPlays"), sdWins: sum("sdWins"), sdToday: Object.keys(readBoard(today)).length, finalCues: sum("finalCues"), findGood: sum("find_good"), findFlaw: sum("find_flaw"), findJackpot: sum("find_jackpot"), featured: sum("featured"), featuredWon: sum("featuredWon"), sellListings: sum("sellListings"), sellAuctions: sum("sellAuctions"), sellAuctionSold: sum("sellAuctionSold"), agentSales: sum("agentSales"), redevs: sum("redevs"), redevDone: sum("redevDone"), redevSpend: sum("redevSpend"), blowouts: sum("blowouts"), buildDelays: sum("buildDelays"), mansionTax: sum("mansionTax"), iapBuys: sum("iapBuys"), iapRestores: sum("iapRestores"), shopViews: sum("shopViews"), shopClicks: sum("shopClicks"), inApp: S.filter(s => (s.meta || {}).inApp).length,
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

function adminPage(url) {
  const k = url.searchParams.get("key") || "", tab = url.searchParams.get("tab") || "overview";
  const s = stats(); s.soc = (social && social.stats()) || {}; const TIER = ["Starter", "Family", "Prestige", "Trophy", "Icon"];
  const tile = (label, value, note) => `<div class="t"><small>${esc(label)}</small><b>${esc(value ?? "–")}</b>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
  const max = Math.max(1, ...s.dau.map(d => d[1]));
  const tabs = s.tabSec, tabTotal = Math.max(1, tabs[0] + tabs[1] + tabs[2]);
  const img = imgStatus(), fbAll = feedbackList(500), fbAvg = fbAll.length ? (fbAll.reduce((a, x) => a + x.stars, 0) / fbAll.length).toFixed(2) : "–";
  const { sessions: SS } = loadAll();
  const recent = SS.slice().sort((a, b) => (b.lastSeen || b.start || "").localeCompare(a.lastSeen || a.start || "")).slice(0, 60);
  const M = v => typeof v === "number" ? (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + "B" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + "K" : String(Math.round(v))) : (v ?? "–");
  const dev = x => { const d = x.device || {}; return `${d.w || "?"}×${d.h || "?"} ${/iPhone|iPad/.test(d.ua || "") ? "iOS" : /Android/.test(d.ua || "") ? "Android" : "web"}`; };
  const players = `<table class="tb"><tr><th>When (UTC)</th><th>Player</th><th>Ver</th><th>Play</th><th>Phase</th><th>Lv</th><th>Worth</th><th>Homes</th><th>Tier</th><th>★</th><th>Device</th></tr>${recent.map(x => { const sn = x.snapshot || {}; return `<tr><td>${esc((x.lastSeen || x.start || "").slice(5, 16).replace("T", " "))}</td><td><code>${esc(x.installId || "?")}</code></td><td>${esc((x.version || "").replace("-web", ""))}</td><td>${Math.round((x.playSec || 0) / 60)}m</td><td>${esc(sn.phase || "–")}</td><td>${sn.level ?? "–"}</td><td>${M(sn.worth)}</td><td>${sn.props ?? "–"}${sn.slots ? "/" + sn.slots : ""}</td><td>${["Starter","Family","Prestige","Trophy","Icon"][sn.maxTier] || "–"}</td><td>${sn.legacy ?? 0}</td><td>${esc(dev(x))}</td></tr>`; }).join("")}</table>`;
  const photos = `<div class="g">${tile("Photos in place", img.have + " / " + img.want, img.onVolume + " on the volume")}${tile("Generator", img.running ? "running" : img.stop ? "stopped" : "idle", img.reason ? "last stop: " + img.reason : img.finishedAt ? "finished " + img.finishedAt.slice(0, 16).replace("T", " ") : "")}${tile("This run", img.done + " ok · " + img.failed + " failed", img.total ? "of " + img.total : "")}${tile("Settings", img.quality + " · " + img.parallel + " parallel", img.perExterior + " per style bucket · " + img.perRoom + " per room")}</div>
  <p><a class="btn" href="/admin/gen-images?go=1">Start / resume</a> <a class="btn" href="/admin/gen-images?stop=1">Stop</a> <a class="btn" href="/admin/gen-images">Raw status</a></p>
  ${img.errors && img.errors.length ? `<p class="err">${esc(img.errors[img.errors.length - 1])}</p>` : ""}
  <div class="bk">${Object.entries(img.buckets).map(([b, n]) => { const [h, t] = n.split("/"); return `<span class="${+h >= +t ? "full" : +h ? "part" : ""}">${esc(b)} <b>${esc(n)}</b></span>`; }).join("")}</div>`;
  const dg = digest(new URL("http://x/admin/digest.txt?since=" + encodeURIComponent(new Date(Date.now() - 24 * 3600e3).toISOString()) + "&page=" + (+url.searchParams.get("page") || 1)));
  const logs = `<p>Last 24 hours, newest sessions last. <a href="/admin?tab=logs&page=${(+url.searchParams.get("page") || 1) + 1}">Next page</a> · <a href="/admin/digest.txt">Raw text</a></p><pre class="dg">${esc(dg)}</pre>`;
  const NAV = [["overview", "Overview"], ["players", "Players"], ["game", "Game"], ["feedback", "Feedback"], ["photos", "Photos"], ["logs", "Logs"]];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auction Empires admin</title>
<style>:root{--bg:#0c1220;--s:#151e31;--ink:#eef2f8;--mu:#97a3b9;--line:#29354f;--g:#3fd08f;--r:#ff4b61;--y:#f2bb45}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
.wrap{max-width:1040px;margin:auto;padding:12px 16px 40px}
h1{font-size:18px;margin:0;display:flex;align-items:center;gap:10px}h1 b{background:#d7263d;color:#fff;padding:2px 7px;border-radius:6px;font-size:13px}
nav{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
nav a{color:var(--mu);text-decoration:none;padding:6px 11px;border-radius:999px;font-weight:600;font-size:13px}nav a.on{background:var(--y);color:#1a1200}nav .sp{flex:1}
h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin:22px 0 8px}
section{display:none}section.on{display:block}
.fb{display:flex;flex-direction:column;gap:6px;margin:8px 0}.fbr{background:var(--s);border:1px solid var(--line);border-radius:8px;padding:8px 10px}.fbr b{color:#e0a020;letter-spacing:.1em}.fbr span{display:block;font-size:11px;color:var(--mu)}.fbr p{margin:4px 0 0;font-size:13px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.t{background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.t small{display:block;color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.t b{font:600 20px ui-monospace,monospace}.t em{display:block;font-style:normal;color:var(--mu);font-size:12px}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px;background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px}
.bars div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}.bars i{display:block;width:100%;background:var(--y);border-radius:3px 3px 0 0}.bars span{font-size:10px;color:var(--mu)}
a{color:var(--y)}p{color:var(--mu)}.btn{display:inline-block;background:var(--s);border:1px solid var(--line);border-radius:8px;padding:7px 12px;color:var(--ink);text-decoration:none;font-weight:600;margin:2px 4px 2px 0}
.tb{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--s);border:1px solid var(--line);border-radius:10px;overflow:hidden}.tb th,.tb td{padding:6px 8px;text-align:left;border-top:1px solid var(--line);white-space:nowrap}.tb th{color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-top:0}.tb code{color:var(--y)}
.tbw{overflow:auto;border-radius:10px}
.bk{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.bk span{font-size:11px;background:var(--s);border:1px solid var(--line);border-radius:6px;padding:3px 7px;color:var(--mu)}.bk span.part{color:var(--ink)}.bk span.full{color:var(--g);border-color:var(--g)}
.dg{white-space:pre-wrap;word-break:break-word;font:11.5px/1.35 ui-monospace,monospace;background:var(--s);border:1px solid var(--line);border-radius:10px;padding:10px;max-height:70vh;overflow:auto}
.err{color:var(--r)}</style></head><body>
<nav><h1><b>AE</b> Admin</h1>${NAV.map(([id, n]) => `<a href="/admin?tab=${id}" class="${tab === id ? "on" : ""}">${n}</a>`).join("")}<span class="sp"></span><a href="/">Open game</a><a href="/admin/logout">Log out</a></nav>
<div class="wrap">
<section class="${tab === "overview" ? "on" : ""}">
<p>${s.players} players · ${s.sessions} sessions · ${fbAll.length} ratings averaging ${fbAvg} · ${img.have}/${img.want} photos · refreshed every 30s · <a href="/admin/export.json">export JSON</a></p>
<h2>Retention</h2><div class="g">${tile("Day 1 retention", s.d1, s.d1n + " eligible players")}${tile("Day 7 retention", s.d7, s.d7n + " eligible players")}${tile("Median session", s.medSessionMin + " min", "active " + s.medActiveMin + " min")}</div>
<h2>Daily players (last 14 days)</h2><div class="bars">${s.dau.map(([d, n]) => `<div><i style="height:${Math.max(2, n / max * 90)}%"></i><span>${d.slice(5)} · ${n}</span></div>`).join("") || "<p>No data yet</p>"}</div>
<h2>First session</h2><div class="g">${tile("Time to first bid", s.medFirstBidSec == null ? "–" : s.medFirstBidSec + "s")}${tile("Time to first win", s.medFirstWinSec == null ? "–" : s.medFirstWinSec + "s")}${tile("New players who never bid", s.newNeverBid)}</div>
</section>
<section class="${tab === "players" ? "on" : ""}"><h2>Last 60 sessions</h2><div class="tbw">${players}</div></section>
<section class="${tab === "game" ? "on" : ""}">
<h2>Auctions</h2><div class="g">${tile("Auctions seen", s.auctionsSeen)}${tile("Joined", s.joinRate, "of lots shown")}${tile("Win rate", s.winRate, "of lots joined")}${tile("Wins paid over value", s.overpaidWins)}${tile("Wins by zone", Object.entries(s.winZones).map(([z, n]) => z + " " + n).join(" · ") || "–")}${tile("Near-misses", s.nearMiss)}${tile("Win combos", s.combos)}${tile("Background auto-bids", s.liveAutos)}${tile("Hot lot taps", s.quickPlays)}</div>
<h2>Auction tension (v20)</h2><div class="g">${tile("Your call cues", s.finalCues, "auto-bid handed back the paddle")}${tile("Inspections", "good " + s.findGood + " · flaw " + s.findFlaw + " · jackpot " + s.findJackpot)}${tile("Featured auctions", s.featured, s.featuredWon + " won")}${tile("Selling", s.sellAuctionSold + "/" + s.sellAuctions + " sold at auction", s.agentSales + " agent sales")}</div>
<h2>Rarity, sharing, showdown</h2><div class="g">${tile("Wins by rarity", ["Common", "Sought-after", "Prime", "Epic", "Legendary"].map((n, i) => n + " " + s.rar[i]).join(" · "))}${tile("Share", s.shareDone + " shared/saved/copied", s.shareOpens + " cards opened · " + s.shareOffers + " Epic+ wins")}${tile("Daily showdown", s.sdPlays + " played", s.sdWins + " won · " + s.sdToday + " on today's board")}</div>
<h2>Dynasty and layout (v25)</h2><div class="g">${tile("Dynasty sheet opens", s.dynOpens, s.prestiges + " cash-outs")}${tile("Goal chip taps", s.goalTaps)}${tile("If-you-win opens", s.ifwinOpens)}${tile("Empire sections", s.esec)}</div>
<h2>Events, world, seasons (v29)</h2><div class="g">${tile("Disasters", s.disasters, s.recoveries + " rebuild booms")}${tile("Good news", s.goodEvents)}${tile("R18+ shocks", s.shocks, s.r18On + " turned R18+ on")}${tile("Insurance toggles", s.insToggles)}${tile("Prizes", s.prizes)}${tile("World sheet", s.worldViews, s.sealed + " sealed rounds · " + s.boardNo + " board rejections")}${tile("Takeovers", s.takeovers, s.turfWon + " won")}${tile("Season levels", s.seasonLevels)}${tile("Mystery lots", s.mystery)}${tile("Event animations", s.fx)}${tile("Rarity explainer", s.rarityInfo)}</div>
<h2>Cards, tours, friends (v27–v28)</h2><div class="g">${tile("Card flips", s.cardViews, s.pulls + " pulls after a win")}${tile("House tours", s.tours, s.tourClues + " clues found")}${tile("Boss lots won", s.bossWins)}${tile("Groups", (s.soc.groups || 0) + " groups", (s.soc.groupMembers || 0) + " members · " + s.groupCreates + " made · " + s.groupJoins + " joins · " + s.invites + " invites")}${tile("Duels", s.duelRuns + " played", (s.soc.duels || 0) + " created")}${tile("Auction Night", s.nightRuns + " runs")}${tile("Feed", (s.soc.feedPosts || 0) + " posts")}${tile("Clips", s.clips + " made", s.clipShares + " shared")}${tile("Push tokens", s.soc.pushTokens || 0, "sending needs APNs/FCM keys")}${tile("Live arena", (s.soc.arenaOnline || 0) + " online now", (s.arenaBids || 0) + " player bids · " + (s.arenaWins || 0) + " player wins · " + (s.soc.arenaRuns || 0) + " runs kept")}${tile("Duel prizes", s.duelW || 0, "duel wins paid")}</div>
<h2>Cash and balance (v26)</h2><div class="g">${tile("Equity loans", s.equityLoans, "$" + Math.round((s.equityBorrowed || 0) / 1e6 * 10) / 10 + "M borrowed")}${tile("Out of reach taps", s.cashSheets, "opened the cash sheet")}${tile("Spend warnings", s.spendWarns, "upgrade or build would block bidding")}${tile("Offer comebacks", s.offerComebacks)}</div>
<h2>Economy</h2><div class="g">${Object.entries(s.unlockMin).map(([t, m]) => tile("Unlock " + (TIER[t] || t), m + " min", "median play time")).join("")}${tile("Overdrafts", s.overdrafts)}${tile("Repossessions", s.foreclosures)}${tile("Bankruptcies", s.bankruptcies)}${tile("Sales", s.sells)}${tile("Upgrades started", s.upgrades, s.upgradeViews + " sheets opened")}${tile("Upgrades finished", s.upgradesDone, s.reclassed + " moved up a category")}${tile("Spent on upgrades", "$" + Math.round((s.upgradeSpend || 0) / 1000) + "K")}${tile("Redevelopments", s.redevs, s.redevDone + " finished · $" + Math.round((s.redevSpend || 0) / 1e6 * 10) / 10 + "M spent")}${tile("Build problems", s.blowouts + " blowouts", s.buildDelays + " delays")}${tile("Mansion tax paid", "$" + Math.round((s.mansionTax || 0) / 1000) + "K")}</div>
<h2>A/B: auctions first (Market removed)</h2><div class="g">${s.abm.map(a => tile(a.v ? "Market kept" : "Auctions first", a.auctionTime + " time in auctions", `${a.players} players · D1 ${a.d1} · ${a.medMin} min/session · join ${a.join} · ${a.winsPerSession} wins/session · ${a.mktBuys} market buys · ${a.sellAuctions} sold at auction`)).join("")}${tile("Rich-list climbs", s.rankUps, "after beating rivals")}</div>
<h2>A/B: bidder registrations</h2><div class="g">${s.ab.map(a => tile(a.v ? "Limited (8, refill 12 min)" : "Control (no limit)", a.join + " join", `${a.players} players · D1 ${a.d1} · ${a.medMin} min/session · ${a.winsPerSession} wins/session${a.v ? ` · ${a.used} used · out ${a.blocked}×` : ""}`)).join("")}${tile("Today's lots", s.dailyLots)}${tile("Bank: rate locks", s.rateLocks)}${tile("Bank: rescue cover", s.rescueBuys, s.rescues + " repossessions stopped")}</div>
<h2>In-app purchases (mobile app only)</h2><div class="g">${tile("App sessions", s.inApp)}${tile("Shop opened", s.shopViews, s.shopClicks + " tapped buy")}${tile("Purchases", s.iapBuys, s.iapById.map(([k, n]) => k + " " + n).join(" · ") || "revenue is in App Store Connect and Play Console")}${tile("Restores", s.iapRestores)}</div>
<h2>Market and interruptions</h2><div class="g">${tile("Market buys", s.mktBuys)}${tile("Offers accepted", s.offerAccept, s.offersMade + " made")}${tile("Off-market bought", s.offmkt)}${tile("Searches", s.searches)}${tile("Watches", s.watches)}${tile("Notices swiped away", s.toastSwipes)}${tile("Real-listing clicks", s.affClicks)}</div>
<h2>Where time goes</h2><div class="g">${tile("Auction tab", pct(tabs[0], tabTotal))}${tile("Market tab", pct(tabs[1], tabTotal))}${tile("Empire tab", pct(tabs[2], tabTotal))}</div>
<h2>Versions</h2><p>${Object.entries(s.versions).map(([v, n]) => esc(v) + ": " + n).join(" · ")}</p>
</section>
<section class="${tab === "feedback" ? "on" : ""}"><h2>Ratings and feedback</h2>${(() => { const fb = feedbackList(200), n = fb.length, avg = n ? (fb.reduce((a, x) => a + x.stars, 0) / n).toFixed(2) : "–"; const dist = [5, 4, 3, 2, 1].map(k => k + "★ " + fb.filter(x => x.stars === k).length).join(" · "); return `<div class="g">${tile("Ratings", n, "average " + avg)}${tile("Spread", dist)}</div><div class="fb">${fb.slice(0, 60).map(x => `<div class="fbr"><b>${"★".repeat(x.stars)}${"☆".repeat(5 - x.stars)}</b><span>${esc(x.at.slice(0, 16).replace("T", " "))} · ${esc(x.installId || "?")} · lv${x.level} · ${esc(x.version)} · ${esc(x.source)}${x.contact ? " · " + esc(x.contact) : ""}</span><p>${esc(x.text) || "<i>no comment</i>"}</p></div>`).join("") || "<p>No feedback yet</p>"}</div>`; })()}
</section>
<section class="${tab === "photos" ? "on" : ""}"><h2>Photo library</h2>${photos}</section>
<section class="${tab === "logs" ? "on" : ""}"><h2>Play log digest</h2>${logs}</section>
</div>
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
    lines.push(`snapshot: worth=${M(sn.worth)} cash=${M(sn.cash)} debt=${M(sn.debt)} props=${sn.props} maxTier=${sn.maxTier} tier=${sn.tier} legacy=${sn.legacy} dynasties=${sn.dynasties} bills=${M(sn.billsPerMonth)} autoOn=${sn.autoOn}${sn.phase ? ` phase=${sn.phase} level=${sn.level} slots=${sn.props}/${sn.slots} mktLeft=${sn.mktLeft}` : ""}`);
    lines.push(`counters: ${kv(x.counters)}`);
    lines.push(`derived: ${kv(x.derived)} | funnel: ${kv(x.funnel)} | flags: ${kv(x.flags)} | taps: ${kv(x.taps)}`);
    for (const a of x.auctions || []) lines.push(`A t=${a.t} #${a.no} T${a.tier} ${a.style}${a.rare ? " rare" : ""}${a.quiet ? " quiet" : ""}${a.bg ? " bg" : ""}${a.daily ? " daily" : ""}${a.featured ? " feat" : ""}${a.sell ? " SELL" : ""} val=${M(a.value)} est=${M(a.estLo)}-${M(a.estHi)} guide=${M(a.guide)} hammer=${M(a.hammer)} win=${a.winner} zone=${a.zone} you:hand=${a.yourHand} auto=${a.yourAuto} big=${a.yourBig} max=${M(a.maxYou)} bidders=${a.bidders} rbids=${a.rivalBids}${a.war ? " war" : ""} dur=${a.durSec}s eq=${a.equityPct ?? "-"}% afford=${a.couldAfford} cash=${M(a.cashAt)}${a.rarity != null ? " rar=" + a.rarity : ""}${a.find ? " find=" + a.find : ""}${a.nearMiss ? " NEARMISS" : ""}`);
    for (const e of x.log || []) { const { t, type, ...r } = e; lines.push(`L t=${t} ${type} ${Object.entries(r).map(([k, v]) => k + "=" + (typeof v === "number" ? M(v) : typeof v === "object" ? JSON.stringify(v) : v)).join(" ")}`); }
    out.push(lines.join("\n"));
  }
  const text = out.join("\n\n"), size = 12000, pages = Math.max(1, Math.ceil(text.length / size));
  return `digest since ${new Date(since).toISOString()} · ${list.length} sessions · page ${page}/${pages}\n\n` + text.slice((page - 1) * size, page * size);
}
function keyOk(k) { if (!ADMIN_KEY || !k) return false; const a = Buffer.from(String(k)), b = Buffer.from(ADMIN_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); }
/* v36 admin portal: the key comes from ?key= or, once used, from an HttpOnly cookie so every admin link is clean. */
function authed(url, req) {
  if (keyOk(url.searchParams.get("key"))) return true;
  const m = /(?:^|;\s*)ak=([^;]+)/.exec((req && req.headers.cookie) || "");
  return !!(m && keyOk(decodeURIComponent(m[1])));
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
    if (url.pathname === "/api/feedback") return req.method === "POST" ? await feedbackPost(req, res) : send(req, res, 405, "text/plain", "POST only");
    if (url.pathname === "/api/save") return req.method === "POST" ? await savePost(req, res) : saveGet(req, res, url);
    if (url.pathname === "/api/play") return req.method === "POST" ? await ingest(req, res) : send(req, res, 405, "text/plain", "POST only");
    if (url.pathname.startsWith("/img/") && serveImg(req, res, url)) return;
    if (url.pathname === "/admin/logout") return send(req, res, 200, "text/html", "<p>Logged out. <a href=\"/\">Game</a></p>", { "set-cookie": "ak=; Path=/admin; Max-Age=0" });
    if (url.pathname === "/admin/gen-images") {
      if (!authed(url, req)) return send(req, res, 404, "text/plain", "not found");
      if (url.searchParams.get("stop") === "1") GEN.stop = true;
      if (url.searchParams.get("go") === "1" && OPENAI_KEY && !GEN.running) genImages(Math.max(1, Math.min(200, +url.searchParams.get("per") || IMG_PER)), Math.max(1, Math.min(200, +url.searchParams.get("rooms") || IMG_ROOM_PER)));
      return send(req, res, 200, "application/json", JSON.stringify({ keySet: !!OPENAI_KEY, ...imgStatus() }, null, 2), { "cache-control": "no-store" });
    }
    if (url.pathname === "/admin/digest.txt") {
      if (!authed(url, req)) return send(req, res, 404, "text/plain", "not found");
      const dg = digest(url);
      if (url.searchParams.get("log") === "1") dg.split("\n").forEach((l, i) => l && console.log("DG " + String(i).padStart(4, "0") + " " + l));
      return send(req, res, 200, "text/plain; charset=utf-8", dg, { "cache-control": "no-store", "x-robots-tag": "noindex" });
    }
    if (url.pathname === "/admin" || url.pathname === "/admin/export.json") {
      if (!authed(url, req)) return send(req, res, 404, "text/plain", "not found");
      if (url.pathname === "/admin") { const hdr = { "cache-control": "no-store", "x-robots-tag": "noindex" }; if (keyOk(url.searchParams.get("key"))) hdr["set-cookie"] = "ak=" + encodeURIComponent(url.searchParams.get("key")) + "; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000"; return send(req, res, 200, "text/html; charset=utf-8", adminPage(url), hdr); }
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
}).listen(PORT, () => console.log(`Auction Empires on :${PORT} · logs in ${DATA}${ADMIN_KEY ? " · /admin on" : " · /admin off (set ADMIN_KEY)"}`));

/* play logs straight into the Railway service log (read with the Railway logs tool, filter "DG"; no admin key needed):
   the last 24h at boot, then new sessions every 30 min */
let dgSince = Date.now() - 24 * 3600e3;
function logDigest() {
  try {
    const u = new URL("http://x/?since=" + new Date(dgSince).toISOString()), first = digest(u), pages = +(first.match(/page 1\/(\d+)/) || [0, 1])[1];
    dgSince = Date.now();
    /* Railway drops log lines past ~500/s, so drip them out: 40 lines every 200ms. Newest sessions matter most, so on a busy day the LAST 30 pages go out (v43; it used to be the first 30, which hid everything after mid-morning) */
    const out = [], p0 = Math.max(1, pages - 29);
    for (let p = p0; p <= pages; p++) { u.searchParams.set("page", p); (p === 1 ? first : digest(u)).split("\n").forEach((l, i) => l && out.push("DG " + String(p).padStart(2, "0") + "." + String(i).padStart(4, "0") + " " + l)); }
    const drip = () => { out.splice(0, 40).forEach(l => console.log(l)); if (out.length) setTimeout(drip, 200); }; drip();
  } catch (e) { console.log("DG error " + e.message); }
}
setTimeout(logDigest, 8000);
setInterval(logDigest, 30 * 60e3);
/* photos: with OPENAI_API_KEY set, fill the set on boot (6 exteriors per style, 3 per room); re-runs only for what is missing */
if (OPENAI_KEY) setTimeout(() => { const st = imgStatus(); console.log(`IMG key set, ${st.have}/${st.want} photos in place (${st.onVolume} on the volume, ${st.quality} quality)`); if (st.have < st.want && process.env.IMG_AUTO !== "0") genImages(); }, 15000); setInterval(logDigest, 30 * 60e3);
