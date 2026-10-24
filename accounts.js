// Auction Empires accounts (v74): every game gets a server account on its first online open, and its save is kept there.
// - No passwords. An account is a random id plus device tokens (only their SHA-256 hashes are stored).
// - Add an email to protect it: a 6-digit code is emailed (Resend, RESEND_API_KEY) and the email can then sign in on any device.
// - The save is stored as the client sends it (gzip+base64 when the browser can compress, plain JSON otherwise), max 1.5 MB,
//   with the last 5 versions kept so a bad overwrite can be undone from the admin side.
// - Without RESEND_API_KEY every email is a dry run: the code is written to the log (masked address) so the flow can be tested.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

module.exports = function accounts({ DATA, send, readBody, writeJSON, ID }) {
  const AD = path.join(DATA, "accounts"), SD = path.join(DATA, "accsaves");
  for (const d of [AD, SD]) fs.mkdirSync(d, { recursive: true });
  const IDX = path.join(DATA, "acct-email.json");
  const RESEND = process.env.RESEND_API_KEY || "", FROM = process.env.MAIL_FROM || "Auction Empires <play@creatorsenseai.com>";
  console.log("ACCT email: " + (RESEND ? "live" : "dry run (set RESEND_API_KEY)"));
  const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const aFile = id => path.join(AD, id + ".json"), sFile = (id, n) => path.join(SD, id + (n == null ? "" : "." + n) + ".json");
  const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
  const AID = /^a[a-z0-9]{15}$/, EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
  let emails = read(IDX) || {};
  const saveIdx = () => writeJSON(IDX, emails);
  const mask = e => { const [u, d] = String(e).split("@"); return (u.slice(0, 2) + "***@" + d); };
  const hits = new Map();
  const slow = (ip, n = 120) => { const now = Date.now(), h = hits.get(ip) || [0, now]; if (now - h[1] > 60000) { h[0] = 0; h[1] = now; } h[0]++; hits.set(ip, h); if (hits.size > 5000) hits.clear(); return h[0] > n; };
  const ipOf = req => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ok = (req, res, o) => send(req, res, 200, "application/json", JSON.stringify(o || { ok: true }), { "cache-control": "no-store" });
  const bad = (req, res, msg, code = 400, extra) => send(req, res, code, "application/json", JSON.stringify(Object.assign({ error: msg }, extra || {})), { "cache-control": "no-store" });
  async function body(req, res, max = 8192) {
    if (slow(ipOf(req))) { bad(req, res, "Too many requests. Try again in a minute.", 429); return null; }
    try { const b = JSON.parse(await readBody(req, max)); if (!b || typeof b !== "object") throw 0; return b; } catch { bad(req, res, "bad request"); return null; }
  }
  /* the account a request's token belongs to */
  function auth(b) { const id = String(b.acct || ""); if (!AID.test(id)) return null; const a = read(aFile(id)); if (!a) return null; const h = sha(b.tok || ""); return (a.toks || []).some(t => t.h === h) ? a : null; }
  const newTok = a => { const tok = crypto.randomBytes(24).toString("hex"); a.toks = (a.toks || []).filter(t => Date.now() - t.at < 400 * 864e5).slice(-9); a.toks.push({ h: sha(tok), at: Date.now() }); return tok; };
  const meta = a => ({ acct: a.id, iid: a.iid, email: a.email ? mask(a.email) : null, hasEmail: !!a.email, rev: a.rev || 0, at: a.at || 0, dev: a.dev || null, worth: a.worth || 0, nick: a.nick || "", mail: !!RESEND });
  function mail(to, subject, text, html) {
    if (!RESEND) { console.log(`ACCT dry-run mail to ${mask(to)}: ${text.replace(/\s+/g, " ").slice(0, 120)}`); return Promise.resolve({ dry: true }); }
    const data = JSON.stringify({ from: FROM, to: [to], subject, text, html });
    return new Promise(resolve => {
      const r = https.request({ hostname: "api.resend.com", path: "/emails", method: "POST", headers: { authorization: "Bearer " + RESEND, "content-type": "application/json", "content-length": Buffer.byteLength(data) }, timeout: 10000 }, rs => {
        let out = ""; rs.on("data", c => out += c); rs.on("end", () => { if (rs.statusCode >= 300) console.log("ACCT mail failed " + rs.statusCode + " " + out.slice(0, 200)); resolve({ ok: rs.statusCode < 300 }); });
      });
      r.on("error", e => { console.log("ACCT mail error " + e.message); resolve({ ok: false }); }); r.on("timeout", () => r.destroy(new Error("timeout"))); r.end(data);
    });
  }
  function codeMail(to, code, why) {
    const line = why === "login" ? "Here is your code to sign in to Auction Empires on this device." : "Here is your code to protect your Auction Empires game with this email.";
    return mail(to, `${code} is your Auction Empires code`, `${line}\n\n${code}\n\nIt works for 15 minutes. If you didn't ask for it, you can ignore this email.`,
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;margin:auto;padding:24px;color:#13203a"><p style="font-size:15px">${line}</p><p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:18px 0">${code}</p><p style="font-size:13px;color:#5f6368">It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p></div>`);
  }
  const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  /* a pending code on the account: 15 minutes, 5 tries, one new code a minute */
  function setCode(a, kind, email) { if (a.code && Date.now() - a.code.sent < 60e3 && a.code.kind === kind && a.code.email === email) return null; const c = newCode(); a.code = { kind, email, h: sha(c + a.id), exp: Date.now() + 15 * 60e3, tries: 0, sent: Date.now() }; return c; }
  function checkCode(a, kind, code) { const c = a.code; if (!c || c.kind !== kind) return "Ask for a new code."; if (Date.now() > c.exp) return "That code has expired. Ask for a new one."; if (c.tries >= 5) return "Too many tries. Ask for a new code."; c.tries++; if (sha(String(code).replace(/\D/g, "") + a.id) !== c.h) { writeJSON(aFile(a.id), a); return "That code isn't right."; } return null; }
  const routes = {
    /* first online open: a new account for this install, with its first device token */
    async "POST /api/acct/new"(req, res) { const b = await body(req, res); if (!b) return; if (!ID.test(String(b.installId))) return bad(req, res, "bad id");
      let id; do { id = "a" + crypto.randomBytes(12).toString("base64").replace(/[^a-z0-9]/gi, "").toLowerCase().padEnd(15, "x").slice(0, 15); } while (fs.existsSync(aFile(id)));
      const a = { id, iid: String(b.installId), created: new Date().toISOString(), rev: 0, at: 0 }; const tok = newTok(a); writeJSON(aFile(id), a);
      console.log(`ACCT new ${id} for ${a.iid}`); ok(req, res, Object.assign(meta(a), { tok })); },
    async "POST /api/acct/me"(req, res) { const b = await body(req, res); if (!b) return; const a = auth(b); if (!a) return bad(req, res, "Signed out", 401); ok(req, res, meta(a)); },
    /* the save: newer (by the client's save time) wins; an older save is refused with the account's numbers so the device can choose */
    async "POST /api/acct/save"(req, res) { const b = await body(req, res, 1600000); if (!b) return; const a = auth(b); if (!a) return bad(req, res, "Signed out", 401);
      const at = +b.at || 0, data = String(b.data || ""); if (!data || data.length > 1500000) return bad(req, res, "Save too big");
      if (!b.force && a.rev && a.dev && b.dev !== a.dev && at < (a.at || 0)) return bad(req, res, "newer", 409, meta(a));
      try { if (a.rev) { const n = a.rev % 5; fs.copyFileSync(sFile(a.id), sFile(a.id, n)); } } catch { }
      writeJSON(sFile(a.id), { at, gz: !!b.gz, data }); a.rev = (a.rev || 0) + 1; a.at = at; a.dev = String(b.dev || "").slice(0, 24); a.worth = Math.round(+b.worth || 0); a.nick = String(b.nick || "").replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 16); a.seen = new Date().toISOString();
      if (b.installId && ID.test(String(b.installId)) && !a.iid) a.iid = String(b.installId);
      writeJSON(aFile(a.id), a); ok(req, res, { rev: a.rev, at: a.at }); },
    async "POST /api/acct/load"(req, res) { const b = await body(req, res); if (!b) return; const a = auth(b); if (!a) return bad(req, res, "Signed out", 401); const s = read(sFile(a.id)); if (!s) return bad(req, res, "No save yet", 404); ok(req, res, Object.assign(meta(a), { save: s })); },
    /* protect: email a code, then confirm it */
    async "POST /api/acct/email"(req, res) { const b = await body(req, res); if (!b) return; const a = auth(b); if (!a) return bad(req, res, "Signed out", 401); const em = String(b.email || "").trim().toLowerCase();
      if (!EMAIL.test(em)) return bad(req, res, "That email doesn't look right.");
      if (emails[em] && emails[em] !== a.id) return bad(req, res, "That email already has a game. Sign in with it instead, or use another email.", 409, { taken: true });
      const c = setCode(a, "link", em); if (!c) return bad(req, res, "A code is on its way. You can ask for another in a minute.", 429); writeJSON(aFile(a.id), a);
      const r = await codeMail(em, c, "link"); console.log(`ACCT link code ${a.id} ${mask(em)}${r.dry ? " " + c : ""}`); ok(req, res, { sent: true, dry: !!r.dry }); },
    async "POST /api/acct/email/verify"(req, res) { const b = await body(req, res); if (!b) return; const a = auth(b); if (!a) return bad(req, res, "Signed out", 401);
      const err = checkCode(a, "link", b.code); if (err) return bad(req, res, err); const em = a.code.email; if (emails[em] && emails[em] !== a.id) return bad(req, res, "That email already has a game.", 409, { taken: true });
      if (a.email && emails[a.email] === a.id) delete emails[a.email]; a.email = em; a.code = null; emails[em] = a.id; saveIdx(); writeJSON(aFile(a.id), a); console.log(`ACCT linked ${a.id} ${mask(em)}`); ok(req, res, meta(a)); },
    /* sign in on another device: email → code → a new device token and the save */
    async "POST /api/acct/login"(req, res) { const b = await body(req, res); if (!b) return; const em = String(b.email || "").trim().toLowerCase(); if (!EMAIL.test(em)) return bad(req, res, "That email doesn't look right.");
      const a = emails[em] && read(aFile(emails[em])); if (!a) return bad(req, res, "No game uses that email yet. On the device you play on, open Settings, then Account, and add your email first.", 404);
      const c = setCode(a, "login", em); if (!c) return bad(req, res, "A code is on its way. You can ask for another in a minute.", 429); writeJSON(aFile(a.id), a);
      const r = await codeMail(em, c, "login"); console.log(`ACCT login code ${a.id} ${mask(em)}${r.dry ? " " + c : ""}`); ok(req, res, { sent: true, dry: !!r.dry }); },
    async "POST /api/acct/login/verify"(req, res) { const b = await body(req, res); if (!b) return; const em = String(b.email || "").trim().toLowerCase(); const a = emails[em] && read(aFile(emails[em])); if (!a) return bad(req, res, "No game uses that email.", 404);
      const err = checkCode(a, "login", b.code); if (err) return bad(req, res, err); a.code = null; const tok = newTok(a); writeJSON(aFile(a.id), a); const s = read(sFile(a.id));
      console.log(`ACCT login ${a.id} ${mask(em)}`); ok(req, res, Object.assign(meta(a), { tok, save: s || null })); },
    /* App Store rule: an account you can create, you can delete. Removes the account, its saves and its email */
    async "POST /api/acct/delete"(req, res) { const b = await body(req, res); if (!b) return; const a = auth(b); if (!a) return bad(req, res, "Signed out", 401);
      if (a.email && emails[a.email] === a.id) { delete emails[a.email]; saveIdx(); } for (const f of [aFile(a.id), sFile(a.id), 0, 1, 2, 3, 4].map(x => typeof x === "number" ? sFile(a.id, x) : x)) { try { fs.unlinkSync(f); } catch { } }
      console.log(`ACCT deleted ${a.id}`); ok(req, res, { deleted: true }); },
  };
  function stats() { let n = 0, withEmail = 0, saved = 0, recent = 0; try { for (const f of fs.readdirSync(AD)) { const a = read(path.join(AD, f)); if (!a) continue; n++; if (a.email) withEmail++; if (a.rev) saved++; if (a.seen && Date.now() - Date.parse(a.seen) < 7 * 864e5) recent++; } } catch { } return { n, withEmail, saved, recent, live: !!RESEND }; }
  return { async handle(req, res, url) { const r = routes[req.method + " " + url.pathname]; if (!r) return false; await r(req, res); return true; }, stats };
};
