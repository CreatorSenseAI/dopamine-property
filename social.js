// Auction Empires: friends, groups, duels, Auction Night boards and push tokens.
// Plain JSON files under DATA_DIR, no dependencies. Every player is an anonymous install id + a nickname.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function social({ DATA, send, readBody, writeJSON, limited, ID, NICK }) {
  for (const d of ["groups", "members", "duels", "nights", "push"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });
  const CODE = /^EAT-[A-HJ-NP-Z2-9]{4}$/, WEEK = /^\d{4}-W\d{2}$/, ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const MAX_MEMBERS = 50, MAX_GROUPS = 5, FEED = 60, KINDS = ["epic", "legendary", "cashout", "boss", "duel", "night", "joined", "takeover"], REACTS = ["fire", "gavel", "lol"];
  const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const gFile = c => path.join(DATA, "groups", c + ".json"), mFile = id => path.join(DATA, "members", id + ".json");
  const dFile = id => path.join(DATA, "duels", id + ".json"), nFile = w => path.join(DATA, "nights", w + ".json");
  const myGroups = id => read(mFile(id)) || [];
  const newCode = () => { for (let i = 0; i < 50; i++) { let c = "EAT-"; for (let k = 0; k < 4; k++) c += ALPHA[crypto.randomInt(ALPHA.length)]; if (!fs.existsSync(gFile(c))) return c; } return null; };
  const clean = s => String(s || "").replace(/[^A-Za-z0-9 _.,'!?&()-]/g, "").trim();
  const num = (v, lo, hi) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
  const ipOf = req => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const weekStart = () => { const d = new Date(); const day = (d.getUTCDay() + 6) % 7; d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - day); return d.toISOString(); };
  async function body(req, res, max = 8192) {
    if (limited(ipOf(req))) { send(req, res, 429, "application/json", '{"error":"slow down"}'); return null; }
    try { const b = JSON.parse(await readBody(req, max)); if (!b || !ID.test(String(b.installId))) throw 0; return b; } catch { send(req, res, 400, "application/json", '{"error":"bad request"}'); return null; }
  }
  const ok = (req, res, o) => send(req, res, 200, "application/json", JSON.stringify(o || { ok: true }), { "cache-control": "no-store" });
  const bad = (req, res, msg, code = 400) => send(req, res, code, "application/json", JSON.stringify({ error: msg }));
  function statsOf(b) {
    const best = b.best && typeof b.best === "object" ? { addr: clean(b.best.addr).slice(0, 40), sub: clean(b.best.sub).slice(0, 30), rarity: num(b.best.rarity, 0, 4), value: Math.round(num(b.best.value, 0, 1e12)) } : null;
    return { worth: Math.round(num(b.worth, -1e12, 1e13)), stars: Math.round(num(b.stars, 0, 999)), title: clean(b.title).slice(0, 16), income: Math.round(num(b.income, -1e10, 1e10)), homes: Math.round(num(b.homes, 0, 9999)), style: ["aggro", "cautious", "sniper"].includes(b.style) ? b.style : "sniper", best };
  }
  function view(g, me) {
    const ws = weekStart();
    const members = Object.entries(g.members).map(([id, m]) => ({ nick: m.nick, worth: m.worth || 0, stars: m.stars || 0, title: m.title || "", homes: m.homes || 0, income: m.income || 0, best: m.best || null, style: m.style || "sniper", weekGain: m.week && m.week.at === ws ? (m.worth || 0) - m.week.worth : 0, me: id === me, key: crypto.createHash("sha1").update(g.code + id).digest("hex").slice(0, 10) }))
      .sort((a, b) => b.worth - a.worth);
    const feed = g.feed.slice(-30).reverse().map(e => ({ eid: e.eid, t: e.t, nick: e.nick, kind: e.kind, text: e.text, card: e.card || null, reacts: Object.fromEntries(REACTS.map(r => [r, (e.reacts && e.reacts[r] || []).length])), mine: REACTS.filter(r => (e.reacts && e.reacts[r] || []).includes(me)) }));
    const duels = (g.duels || []).slice(-20).map(id => read(dFile(id))).filter(Boolean).filter(d => d.from === me || d.to === me || d.done).slice(-10).map(d => duelView(d, me, g));
    const ms = Object.values(g.members), gainer = ms.filter(m => m.week && m.week.at === ws).sort((a, b) => ((b.worth || 0) - b.week.worth) - ((a.worth || 0) - a.week.worth))[0], find = ms.filter(m => m.best).sort((a, b) => b.best.rarity - a.best.rarity || b.best.value - a.best.value)[0];
    const trophies = { gainer: gainer && (gainer.worth || 0) - gainer.week.worth > 0 ? gainer.nick : null, find: find && find.best.rarity >= 2 ? find.nick : null };
    return { code: g.code, name: g.name, owner: g.owner === me, members, feed, duels, trophies };
  }
  function keyToId(g, key) { return Object.keys(g.members).find(id => crypto.createHash("sha1").update(g.code + id).digest("hex").slice(0, 10) === key); }
  function duelView(d, me, g) { const nick = id => (g && g.members[id] && g.members[id].nick) || d.nicks[id] || "Player";
    return { id: d.id, seed: d.seed, tier: d.tier, from: nick(d.from), to: nick(d.to), mine: d.from === me ? "from" : d.to === me ? "to" : null, scores: { from: d.scores[d.from] ?? null, to: d.scores[d.to] ?? null }, done: !!d.done, at: d.at }; }
  function post(g, id, kind, text, card) {
    const m = g.members[id]; if (!m) return;
    g.feed.push({ eid: crypto.randomBytes(5).toString("hex"), t: new Date().toISOString(), id, nick: m.nick, kind, text: clean(text).slice(0, 120), card, reacts: {} });
    if (g.feed.length > FEED) g.feed = g.feed.slice(-FEED);
  }

  const routes = {
    async "POST /api/group/create"(req, res) { const b = await body(req, res); if (!b) return;
      const nick = clean(b.nick), name = clean(b.name).slice(0, 24) || "My crew"; if (!NICK.test(nick)) return bad(req, res, "Pick a name of 3 to 16 letters or numbers.");
      const mine = myGroups(b.installId); if (mine.length >= MAX_GROUPS) return bad(req, res, "You're in " + MAX_GROUPS + " groups already. Leave one first.");
      const code = newCode(); if (!code) return bad(req, res, "Try again", 503);
      const g = { code, name, owner: b.installId, created: new Date().toISOString(), members: {}, feed: [], duels: [] };
      g.members[b.installId] = { nick, joined: g.created, ...statsOf(b), week: { at: weekStart(), worth: statsOf(b).worth } };
      post(g, b.installId, "joined", nick + " started the group");
      writeJSON(gFile(code), g); writeJSON(mFile(b.installId), mine.concat(code));
      ok(req, res, { code, group: view(g, b.installId) }); },
    async "POST /api/group/join"(req, res) { const b = await body(req, res); if (!b) return;
      const code = String(b.code || "").toUpperCase().replace(/^(EAT)?-?/, "EAT-"); const nick = clean(b.nick);
      if (!CODE.test(code)) return bad(req, res, "That code doesn't look right. Codes look like EAT-7KQ2.");
      if (!NICK.test(nick)) return bad(req, res, "Pick a name of 3 to 16 letters or numbers.");
      const g = read(gFile(code)); if (!g) return bad(req, res, "No group with that code. Check it with whoever sent it.", 404);
      if ((g.banned || []).includes(b.installId)) return bad(req, res, "You can't join this group.", 403);
      const mine = myGroups(b.installId);
      if (!g.members[b.installId]) { if (Object.keys(g.members).length >= MAX_MEMBERS) return bad(req, res, "That group is full (" + MAX_MEMBERS + ")."); if (mine.length >= MAX_GROUPS) return bad(req, res, "You're in " + MAX_GROUPS + " groups already. Leave one first.");
        g.members[b.installId] = { nick, joined: new Date().toISOString(), ...statsOf(b), week: { at: weekStart(), worth: statsOf(b).worth } };
        const inv = b.ref && keyToId(g, String(b.ref)); if (inv && inv !== b.installId) { g.members[inv].refs = (g.members[inv].refs || 0) + 1; g.members[b.installId].referred = true; }
        post(g, b.installId, "joined", nick + " joined" + (inv ? " on " + g.members[inv].nick + "'s invite" : "")); writeJSON(gFile(code), g); writeJSON(mFile(b.installId), mine.concat(code)); }
      ok(req, res, { code, group: view(g, b.installId) }); },
    async "POST /api/group/leave"(req, res) { const b = await body(req, res); if (!b) return; const g = read(gFile(String(b.code))); if (!g || !g.members[b.installId]) return ok(req, res);
      delete g.members[b.installId]; writeJSON(mFile(b.installId), myGroups(b.installId).filter(c => c !== g.code));
      if (!Object.keys(g.members).length) { try { fs.unlinkSync(gFile(g.code)); } catch {} return ok(req, res); }
      if (g.owner === b.installId) g.owner = Object.keys(g.members)[0]; writeJSON(gFile(g.code), g); ok(req, res); },
    async "POST /api/group/remove"(req, res) { const b = await body(req, res); if (!b) return; const g = read(gFile(String(b.code))); if (!g || g.owner !== b.installId) return bad(req, res, "Only the owner can do that.", 403);
      const id = keyToId(g, String(b.key)); if (!id || id === b.installId) return bad(req, res, "Not found", 404);
      delete g.members[id]; g.banned = (g.banned || []).concat(id).slice(-200); writeJSON(mFile(id), myGroups(id).filter(c => c !== g.code)); writeJSON(gFile(g.code), g); ok(req, res, { group: view(g, b.installId) }); },
    async "POST /api/group/rotate"(req, res) { const b = await body(req, res); if (!b) return; const g = read(gFile(String(b.code))); if (!g || g.owner !== b.installId) return bad(req, res, "Only the owner can do that.", 403);
      const code = newCode(); if (!code) return bad(req, res, "Try again", 503); const old = g.code; g.code = code;
      for (const id of Object.keys(g.members)) writeJSON(mFile(id), myGroups(id).map(c => c === old ? code : c));
      writeJSON(gFile(code), g); try { fs.unlinkSync(gFile(old)); } catch {} ok(req, res, { code, group: view(g, b.installId) }); },
    async "POST /api/group/sync"(req, res) { const b = await body(req, res); if (!b) return; const st = statsOf(b), nick = clean(b.nick), ws = weekStart(), out = [];
      for (const c of myGroups(b.installId)) { const g = read(gFile(c)); if (!g || !g.members[b.installId]) continue; const m = g.members[b.installId];
        Object.assign(m, st); if (NICK.test(nick)) m.nick = nick; if (!m.week || m.week.at !== ws) m.week = { at: ws, worth: st.worth }; m.seen = new Date().toISOString(); writeJSON(gFile(c), g); out.push({ code: c, name: g.name, n: Object.keys(g.members).length }); }
      let refs = 0, referred = false; for (const c of myGroups(b.installId)) { const g = read(gFile(c)); const m = g && g.members[b.installId]; if (m) { refs += m.refs || 0; referred = referred || !!m.referred; } }
      ok(req, res, { groups: out, refs, referred }); },
    async "POST /api/group/event"(req, res) { const b = await body(req, res); if (!b) return; if (!KINDS.includes(b.kind)) return bad(req, res, "bad kind");
      const card = b.card && typeof b.card === "object" ? { addr: clean(b.card.addr).slice(0, 40), sub: clean(b.card.sub).slice(0, 30), rarity: num(b.card.rarity, 0, 4), value: Math.round(num(b.card.value, 0, 1e12)), paid: Math.round(num(b.card.paid, 0, 1e12)), style: clean(b.card.style).slice(0, 10), seed: Math.round(num(b.card.seed, -2e9, 2e9)), ti: num(b.card.ti, 0, 4) } : null;
      for (const c of myGroups(b.installId)) { const g = read(gFile(c)); if (!g) continue; post(g, b.installId, b.kind, b.text, card); writeJSON(gFile(c), g); } ok(req, res); },
    async "POST /api/group/react"(req, res) { const b = await body(req, res); if (!b) return; const g = read(gFile(String(b.code))); if (!g || !g.members[b.installId] || !REACTS.includes(b.r)) return bad(req, res, "Not found", 404);
      const e = g.feed.find(x => x.eid === b.eid); if (!e) return bad(req, res, "Not found", 404); e.reacts = e.reacts || {}; const L = e.reacts[b.r] = e.reacts[b.r] || [];
      const i = L.indexOf(b.installId); if (i >= 0) L.splice(i, 1); else L.push(b.installId); writeJSON(gFile(g.code), g); ok(req, res, { group: view(g, b.installId) }); },
    "GET /api/group"(req, res, url) { const me = url.searchParams.get("me") || "", g = read(gFile(String(url.searchParams.get("code") || "").toUpperCase()));
      if (!g || !g.members[me]) return bad(req, res, "Not a member", 404); ok(req, res, { group: view(g, me) }); },
    "GET /api/groups"(req, res, url) { const me = url.searchParams.get("me") || ""; if (!ID.test(me)) return bad(req, res, "bad id");
      ok(req, res, { groups: myGroups(me).map(c => { const g = read(gFile(c)); return g ? { code: c, name: g.name, n: Object.keys(g.members).length } : null; }).filter(Boolean) }); },
    "GET /api/group/board"(req, res, url) { const me = url.searchParams.get("me") || "", d = String(url.searchParams.get("day") || ""), g = read(gFile(String(url.searchParams.get("code") || "").toUpperCase()));
      if (!g || !g.members[me] || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad(req, res, "Not a member", 404);
      const all = Object.entries(read(path.join(DATA, "boards", d + ".json")) || {}).filter(([id]) => g.members[id]).map(([id, e]) => ({ id, ...e })).sort((a, b) => b.score - a.score);
      const rank = all.findIndex(e => e.id === me) + 1; ok(req, res, { day: d, count: all.length, rank: rank || null, top: all.slice(0, 50).map(e => ({ nick: e.nick, score: e.score, rarity: e.rarity, stars: e.stars || 0, me: e.id === me })) }); },
    "GET /api/group/rivals"(req, res, url) { const me = url.searchParams.get("me") || ""; if (!ID.test(me)) return bad(req, res, "bad id"); const seen = new Set(), out = [];
      for (const c of myGroups(me)) { const g = read(gFile(c)); if (!g) continue; for (const [id, m] of Object.entries(g.members)) if (id !== me && !seen.has(id)) { seen.add(id); out.push({ nick: m.nick, style: m.style || "sniper", stars: m.stars || 0 }); } }
      ok(req, res, { rivals: out.slice(0, 30) }); },
    // ---------- duels: 3 seeded lots each, best total equity wins ----------
    async "POST /api/duel/create"(req, res) { const b = await body(req, res); if (!b) return; const g = read(gFile(String(b.code))); if (!g || !g.members[b.installId]) return bad(req, res, "Not a member", 404);
      const to = keyToId(g, String(b.key)); if (!to || to === b.installId) return bad(req, res, "Pick someone else", 400);
      const d = { id: crypto.randomBytes(6).toString("hex"), code: g.code, seed: crypto.randomInt(1, 2 ** 31 - 1), tier: Math.round(num(b.tier, 0, 4)), from: b.installId, to, nicks: { [b.installId]: g.members[b.installId].nick, [to]: g.members[to].nick }, scores: {}, at: new Date().toISOString(), done: false };
      writeJSON(dFile(d.id), d); g.duels = (g.duels || []).concat(d.id).slice(-60); writeJSON(gFile(g.code), g); ok(req, res, { duel: duelView(d, b.installId, g) }); },
    async "POST /api/duel/score"(req, res) { const b = await body(req, res); if (!b) return; const d = read(dFile(String(b.id).replace(/[^a-f0-9]/g, ""))); if (!d || (d.from !== b.installId && d.to !== b.installId)) return bad(req, res, "Not found", 404);
      if (d.scores[b.installId] == null) d.scores[b.installId] = Math.round(num(b.score, -100, 500) * 10) / 10;
      if (d.scores[d.from] != null && d.scores[d.to] != null && !d.done) { d.done = true; const g = read(gFile(d.code)); if (g) { const w = d.scores[d.from] === d.scores[d.to] ? null : d.scores[d.from] > d.scores[d.to] ? d.from : d.to;
          const nick = id => (g.members[id] && g.members[id].nick) || d.nicks[id]; post(g, w || d.from, "duel", w ? `${nick(w)} won a duel against ${nick(w === d.from ? d.to : d.from)}, ${Math.max(d.scores[d.from], d.scores[d.to])}% to ${Math.min(d.scores[d.from], d.scores[d.to])}%` : `${nick(d.from)} and ${nick(d.to)} drew a duel`); writeJSON(gFile(g.code), g); } }
      writeJSON(dFile(d.id), d); ok(req, res, { duel: duelView(d, b.installId, read(gFile(d.code))) }); },
    // ---------- Auction Night: one board per week ----------
    async "POST /api/night"(req, res) { const b = await body(req, res); if (!b) return; if (!WEEK.test(String(b.week))) return bad(req, res, "bad week"); const nick = clean(b.nick); if (!NICK.test(nick)) return bad(req, res, "bad name");
      const bd = read(nFile(b.week)) || {}; if (!bd[b.installId]) { bd[b.installId] = { nick, score: Math.round(num(b.score, -100, 1000) * 10) / 10, wins: Math.round(num(b.wins, 0, 20)), stars: Math.round(num(b.stars, 0, 999)), at: new Date().toISOString() }; writeJSON(nFile(b.week), bd); }
      ok(req, res); },
    "GET /api/night"(req, res, url) { const w = String(url.searchParams.get("week") || ""), me = url.searchParams.get("me") || "", code = url.searchParams.get("code") || ""; if (!WEEK.test(w)) return bad(req, res, "bad week");
      let all = Object.entries(read(nFile(w)) || {}).map(([id, e]) => ({ id, ...e })); if (code) { const g = read(gFile(code)); if (g) all = all.filter(e => g.members[e.id]); }
      all.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at)); const rank = all.findIndex(e => e.id === me) + 1;
      ok(req, res, { week: w, count: all.length, rank: rank || null, top: all.slice(0, 20).map(e => ({ nick: e.nick, score: e.score, wins: e.wins, stars: e.stars, me: e.id === me })) }); },
    // ---------- push tokens (sending needs APNs/FCM credentials) ----------
    async "POST /api/push"(req, res) { const b = await body(req, res, 2048); if (!b) return; const t = String(b.token || "").slice(0, 300); if (!t) return bad(req, res, "no token");
      writeJSON(path.join(DATA, "push", b.installId + ".json"), { token: t, platform: b.platform === "ios" ? "ios" : "android", at: new Date().toISOString() }); ok(req, res); }
  };
  return {
    async handle(req, res, url) { const r = routes[req.method + " " + url.pathname]; if (!r) return false; await r(req, res, url); return true; },
    stats() { const count = d => { try { return fs.readdirSync(path.join(DATA, d)).filter(f => f.endsWith(".json")).length; } catch { return 0; } };
      let members = 0, feed = 0; for (const f of fs.readdirSync(path.join(DATA, "groups"))) { const g = read(path.join(DATA, "groups", f)); if (g) { members += Object.keys(g.members).length; feed += g.feed.length; } }
      return { groups: count("groups"), groupMembers: members, feedPosts: feed, duels: count("duels"), pushTokens: count("push") }; }
  };
};
