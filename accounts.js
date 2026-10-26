// Auction Empires accounts (v74, v77, v86).
// - Every game gets a server account on its first online open, and its save is kept there.
// - An account is a random id plus device tokens (only their SHA-256 hashes are stored).
// - v86 (Matt: "make sure all profiles are migrated to an account with an email and password ... all on a db in railway"):
//   accounts and their saves live in Postgres (DATABASE_URL, Railway's Postgres service). On every boot the old JSON files under
//   DATA/accounts and DATA/accsaves are imported (insert-if-missing, so it is safe to run again); the files stay on the volume as a backup
//   and are not written any more. Without DATABASE_URL (local dev, tests) the same code runs on the files.
// - Protecting a game = an email and a password (POST /api/acct/protect). Sign-in takes the email or a v77 username plus the password.
//   Passwords are hashed with Node's built-in scrypt (N=16384, r=8, p=1, 16-byte salt, 64-byte key), compared in constant time.
//   8 wrong passwords lock the account for 15 minutes; sign-in has its own tighter per-IP limit.
// - Email codes (Resend, RESEND_API_KEY) are only needed for a forgotten password: a code signs you in and opens a 15-minute window to set a
//   new password. Without the key every email is a dry run and the code is written to the log.
// - The save is stored as the client sends it (gzip+base64 when the browser can compress, plain JSON otherwise), max 1.5 MB,
//   with the last 5 versions kept so a bad overwrite can be undone from the admin side.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const zlib = require("zlib");

module.exports = function accounts({ DATA, send, readBody, writeJSON, ID }) {
  const AD = path.join(DATA, "accounts"), SD = path.join(DATA, "accsaves");
  for (const d of [AD, SD]) fs.mkdirSync(d, { recursive: true });
  const IDX = path.join(DATA, "acct-email.json"), UIDX = path.join(DATA, "acct-user.json");
  const RESEND = process.env.RESEND_API_KEY || "", FROM = process.env.MAIL_FROM || "Auction Empires <play@creatorsenseai.com>";
  console.log("ACCT email: " + (RESEND ? "live" : "dry run (set RESEND_API_KEY)"));
  /* v89 admin: an account whose email is in ADMIN_EMAILS and that has a password gets the in-game admin tools and a one-time link into /admin */
  const ADMINS = String(process.env.ADMIN_EMAILS || "info@creatorsenseai.com").toLowerCase().split(/[,\s]+/).filter(Boolean);
  const isAdmin = a => !!(a && a.email && a.pw && ADMINS.includes(String(a.email).toLowerCase()));
  const ADMTOK = new Map();
  const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const aFile = id => path.join(AD, id + ".json"), sFile = (id, n) => path.join(SD, id + (n == null ? "" : "." + n) + ".json");
  const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
  const AID = /^a[a-z0-9]{15}$/, EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
  const USR = /^[a-z0-9_.-]{3,20}$/, normU = u => String(u || "").trim().toLowerCase(), normE = e => String(e || "").trim().toLowerCase();

  /* ---------- storage: Postgres when DATABASE_URL is set, else the JSON files ---------- */
  function fileStore() {
    let emails = read(IDX) || {}, users = read(UIDX) || {};
    const saveIdx = () => writeJSON(IDX, emails), saveUsers = () => writeJSON(UIDX, users);
    return {
      kind: "files",
      async init() { },
      async get(id) { return AID.test(id) ? read(aFile(id)) : null; },
      async exists(id) { return fs.existsSync(aFile(id)); },
      async byEmail(em) { return emails[em] ? read(aFile(emails[em])) : null; },
      async byUser(u) { return users[u] ? read(aFile(users[u])) : null; },
      async put(a) {
        if (a.email && emails[a.email] && emails[a.email] !== a.id) throw Object.assign(new Error("taken"), { taken: "email" });
        if (a.user && users[a.user] && users[a.user] !== a.id) throw Object.assign(new Error("taken"), { taken: "user" });
        for (const [m, k, sv] of [[emails, "email", saveIdx], [users, "user", saveUsers]]) {
          let ch = false; for (const [x, id] of Object.entries(m)) if (id === a.id && x !== a[k]) { delete m[x]; ch = true; }
          if (a[k] && m[a[k]] !== a.id) { m[a[k]] = a.id; ch = true; } if (ch) sv();
        }
        writeJSON(aFile(a.id), a);
      },
      async del(a) { if (a.email && emails[a.email] === a.id) { delete emails[a.email]; saveIdx(); } if (a.user && users[a.user] === a.id) { delete users[a.user]; saveUsers(); } for (const f of [aFile(a.id), sFile(a.id), 0, 1, 2, 3, 4].map(x => typeof x === "number" ? sFile(a.id, x) : x)) { try { fs.unlinkSync(f); } catch { } } },
      async getSave(id) { return read(sFile(id)); },
      async putSave(id, rev, s) { try { if (rev > 1) fs.copyFileSync(sFile(id), sFile(id, rev % 5)); } catch { } writeJSON(sFile(id), s); },
      async stats() { let n = 0, withEmail = 0, withUser = 0, withPw = 0, prot = 0, saved = 0, recent = 0; try { for (const f of fs.readdirSync(AD)) { const a = read(path.join(AD, f)); if (!a) continue; n++; if (a.email) withEmail++; if (a.user) withUser++; if (a.pw) withPw++; if (a.email && a.pw) prot++; if (a.rev) saved++; if (a.seen && Date.now() - Date.parse(a.seen) < 7 * 864e5) recent++; } } catch { } return { n, withEmail, withUser, withPw, prot, saved, recent }; },
      async all() { const out = []; try { for (const f of fs.readdirSync(AD)) { const a = read(path.join(AD, f)); if (a && a.id) out.push(a); } } catch { } return out; },
    };
  }
  function pgStore(url) {
    const { Pool } = require("pg");
    const ssl = /sslmode=(require|verify)/.test(url) || process.env.PGSSL === "1" ? { rejectUnauthorized: false } : false;
    const pool = new Pool({ connectionString: url, ssl, max: 6, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    pool.on("error", e => console.log("ACCT db pool error " + e.message));
    const q = (t, v) => pool.query(t, v);
    const row = r => r.rows[0] ? r.rows[0].doc : null;
    const taken = e => { if (e && e.code === "23505") { const t = /email/.test(e.constraint || e.detail || "") ? "email" : /username/.test(e.constraint || e.detail || "") ? "user" : "id"; throw Object.assign(new Error("taken"), { taken: t }); } throw e; };
    return {
      kind: "postgres", pool,
      async init() {
        await q(`create table if not exists ae_accounts(id text primary key, iid text, email text unique, username text unique, doc jsonb not null,
          created timestamptz not null default now(), updated timestamptz not null default now())`);
        await q(`create table if not exists ae_saves(id text not null, rev integer not null, at bigint not null default 0, gz boolean not null default false,
          data text not null, saved timestamptz not null default now(), primary key(id, rev))`);
        await q(`create index if not exists ae_accounts_iid on ae_accounts(iid)`);
      },
      async get(id) { return AID.test(id) ? row(await q("select doc from ae_accounts where id=$1", [id])) : null; },
      async exists(id) { return (await q("select 1 from ae_accounts where id=$1", [id])).rowCount > 0; },
      async byEmail(em) { return row(await q("select doc from ae_accounts where email=$1", [em])); },
      async byUser(u) { return row(await q("select doc from ae_accounts where username=$1", [u])); },
      async put(a) {
        try {
          await q(`insert into ae_accounts(id,iid,email,username,doc,created) values($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()))
            on conflict(id) do update set iid=excluded.iid, email=excluded.email, username=excluded.username, doc=excluded.doc, updated=now()`,
            [a.id, a.iid || null, a.email || null, a.user || null, a, a.created || null]);
        } catch (e) { taken(e); }
      },
      async del(a) { await q("delete from ae_saves where id=$1", [a.id]); await q("delete from ae_accounts where id=$1", [a.id]); },
      async getSave(id) { const r = await q("select at,gz,data from ae_saves where id=$1 order by rev desc limit 1", [id]); return r.rows[0] ? { at: +r.rows[0].at, gz: r.rows[0].gz, data: r.rows[0].data } : null; },
      async putSave(id, rev, s) {
        await q(`insert into ae_saves(id,rev,at,gz,data) values($1,$2,$3,$4,$5) on conflict(id,rev) do update set at=excluded.at, gz=excluded.gz, data=excluded.data, saved=now()`, [id, rev, Math.round(+s.at || 0), !!s.gz, s.data]);
        await q("delete from ae_saves where id=$1 and rev<=$2", [id, rev - 6]);
      },
      async stats() {
        const r = await q(`select count(*)::int n, count(email)::int "withEmail", count(username)::int "withUser", count(*) filter (where doc ? 'pw')::int "withPw",
          count(*) filter (where email is not null and doc ? 'pw')::int prot, count(*) filter (where (doc->>'rev')::int>0)::int saved,
          count(*) filter (where (doc->>'seen')::timestamptz > now() - interval '7 days')::int recent from ae_accounts`);
        return r.rows[0];
      },
      async all() { return (await q("select doc from ae_accounts")).rows.map(x => x.doc); },
    };
  }
  const DBURL = process.env.DATABASE_URL || "";
  let st;
  if (DBURL) { try { st = pgStore(DBURL); } catch (e) { console.log("ACCT db driver missing (" + e.message + "): using files"); st = fileStore(); } }
  else st = fileStore();
  /* boot: tables, then the one-way import of the old JSON files (insert if missing, never overwrite) */
  let READY = st.kind === "files", FAIL = null;
  const ready = (async () => {
    if (st.kind === "files") { console.log("ACCT store: files (set DATABASE_URL for Postgres)"); return; }
    for (let i = 0; i < 8; i++) {
      try { await st.init(); break; } catch (e) { FAIL = e.message; console.log(`ACCT db not ready (${e.message}), retry ${i + 1}`); await new Promise(r => setTimeout(r, 3000 * (i + 1))); }
    }
    try { await st.init(); } catch (e) { FAIL = e.message; console.log("ACCT db unavailable: " + e.message); return; }
    FAIL = null; READY = true;
    let n = 0, s = 0, dupe = 0, files = 0;
    try {
      for (const f of fs.readdirSync(AD)) {
        if (!f.endsWith(".json")) continue; const a = read(path.join(AD, f)); if (!a || !AID.test(a.id || "")) continue; files++;
        if (await st.exists(a.id)) continue;
        try { await st.put(a); n++; }
        catch (e) { if (e.taken === "email" || e.taken === "user") { const b = Object.assign({}, a); if (e.taken === "email") { b.emailLost = b.email; delete b.email; } else { b.userLost = b.user; delete b.user; } try { await st.put(b); n++; dupe++; } catch (e2) { console.log("ACCT import skip " + a.id + " " + e2.message); continue; } } else { console.log("ACCT import skip " + a.id + " " + e.message); continue; } }
        const sv = read(sFile(a.id)); if (sv && sv.data) { await st.putSave(a.id, Math.max(1, a.rev || 1), sv); s++; }
      }
    } catch (e) { console.log("ACCT import error " + e.message); }
    console.log(`ACCT store: postgres · import: ${files} account files, ${n} new in the db, ${s} saves, ${dupe} with a duplicate email/username`);
    for (const em of ADMINS) { try { const a = await st.byEmail(em); console.log(`ACCT admin ${mask(em)}: ${a ? a.id + (a.pw ? " (password set)" : " (no password yet)") : "no account has this email yet"}`); } catch { } }
    refreshStats();
  })();
  async function db(res, req) { if (!READY) { await Promise.race([ready, new Promise(r => setTimeout(r, 8000))]); } if (!READY) { bad(req, res, "Accounts are down for a moment. Your game is still saved on this device.", 503); return false; } return true; }
  /* one change at a time per account, so a save and a sign-in can't overwrite each other's token list */
  const LOCK = new Map();
  function locked(id, fn) { const prev = LOCK.get(id) || Promise.resolve(); const p = prev.then(fn, fn); const tail = p.catch(() => { }); LOCK.set(id, tail); tail.then(() => { if (LOCK.get(id) === tail) LOCK.delete(id); }); return p; }

  const SCR = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  const hashPw = pw => new Promise((res, rej) => { const salt = crypto.randomBytes(16); crypto.scrypt(String(pw), salt, 64, SCR, (e, k) => e ? rej(e) : res("s1$" + salt.toString("base64") + "$" + k.toString("base64"))); });
  const checkPw = (pw, h) => new Promise(res => { const [v, s, k] = String(h || "").split("$"); if (v !== "s1" || !s || !k) return res(false); const want = Buffer.from(k, "base64");
    crypto.scrypt(String(pw), Buffer.from(s, "base64"), want.length, SCR, (e, got) => res(!e && got.length === want.length && crypto.timingSafeEqual(got, want))); });
  const pwBad = pw => typeof pw !== "string" || pw.length < 8 ? "Use at least 8 characters for your password." : pw.length > 128 ? "That password is too long." : null;
  const shits = new Map();
  const slowSignin = ip => { const now = Date.now(), h = shits.get(ip) || [0, now]; if (now - h[1] > 60000) { h[0] = 0; h[1] = now; } h[0]++; shits.set(ip, h); if (shits.size > 5000) shits.clear(); return h[0] > 20; };
  const mask = e => { const [u, d] = String(e).split("@"); return (u.slice(0, 2) + "***@" + d); };
  const hits = new Map();
  const slow = (ip, n = 120) => { const now = Date.now(), h = hits.get(ip) || [0, now]; if (now - h[1] > 60000) { h[0] = 0; h[1] = now; } h[0]++; hits.set(ip, h); if (hits.size > 5000) hits.clear(); return h[0] > n; };
  const ipOf = req => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ok = (req, res, o) => send(req, res, 200, "application/json", JSON.stringify(o || { ok: true }), { "cache-control": "no-store" });
  const bad = (req, res, msg, code = 400, extra) => send(req, res, code, "application/json", JSON.stringify(Object.assign({ error: msg }, extra || {})), { "cache-control": "no-store" });
  async function body(req, res, max = 8192) {
    if (slow(ipOf(req))) { bad(req, res, "Too many requests. Try again in a minute.", 429); return null; }
    let b; try { b = JSON.parse(await readBody(req, max)); if (!b || typeof b !== "object") throw 0; } catch { bad(req, res, "bad request"); return null; }
    if (!(await db(res, req))) return null; return b;
  }
  /* the account a request's token belongs to */
  async function auth(b) { const id = String(b.acct || ""); if (!AID.test(id)) return null; const a = await st.get(id); if (!a) return null; const h = sha(b.tok || ""); return (a.toks || []).some(t => t.h === h) ? a : null; }
  const newTok = a => { const tok = crypto.randomBytes(24).toString("hex"); a.toks = (a.toks || []).filter(t => Date.now() - t.at < 400 * 864e5).slice(-9); a.toks.push({ h: sha(tok), at: Date.now() }); return tok; };
  const resetOpen = a => !!(a.reset && Date.now() - a.reset < 15 * 60e3);
  const meta = a => ({ acct: a.id, iid: a.iid, email: a.email ? mask(a.email) : null, hasEmail: !!a.email, hasPw: !!a.pw, prot: !!(a.email && a.pw), reset: resetOpen(a), rev: a.rev || 0, at: a.at || 0, dev: a.dev || null, worth: a.worth || 0, nick: a.nick || "", mail: !!RESEND, user: a.user || null, admin: isAdmin(a) });
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
    const line = why === "login" ? "Here is your code to sign in to Auction Empires. Once you're in, you can set a new password." : "Here is your code to confirm this email for your Auction Empires game.";
    return mail(to, `${code} is your Auction Empires code`, `${line}\n\n${code}\n\nIt works for 15 minutes. If you didn't ask for it, you can ignore this email.`,
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;margin:auto;padding:24px;color:#13203a"><p style="font-size:15px">${line}</p><p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:18px 0">${code}</p><p style="font-size:13px;color:#5f6368">It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p></div>`);
  }
  const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  /* a pending code on the account: 15 minutes, 5 tries, one new code a minute */
  function setCode(a, kind, email) { if (a.code && Date.now() - a.code.sent < 60e3 && a.code.kind === kind && a.code.email === email) return null; const c = newCode(); a.code = { kind, email, h: sha(c + a.id), exp: Date.now() + 15 * 60e3, tries: 0, sent: Date.now() }; return c; }
  async function checkCode(a, kind, code) { const c = a.code; if (!c || c.kind !== kind) return "Ask for a new code."; if (Date.now() > c.exp) return "That code has expired. Ask for a new one."; if (c.tries >= 5) return "Too many tries. Ask for a new code."; c.tries++; if (sha(String(code).replace(/\D/g, "") + a.id) !== c.h) { await st.put(a); return "That code isn't right."; } return null; }
  const takenMsg = t => t === "email" ? "That email already has a game. Sign in with it instead, or use another email." : "That username is taken. Try another.";
  async function signedIn(req, res, a, how) { a.pwFail = null; const tok = newTok(a); await st.put(a); const s = await st.getSave(a.id); console.log(`ACCT signin ${a.id} (${how})`); ok(req, res, Object.assign(meta(a), { tok, save: s || null })); }
  const routes = {
    /* first online open: a new account for this install, with its first device token */
    async "POST /api/acct/new"(req, res) { const b = await body(req, res); if (!b) return; if (!ID.test(String(b.installId))) return bad(req, res, "bad id");
      let id; do { id = "a" + crypto.randomBytes(12).toString("base64").replace(/[^a-z0-9]/gi, "").toLowerCase().padEnd(15, "x").slice(0, 15); } while (await st.exists(id));
      const a = { id, iid: String(b.installId), created: new Date().toISOString(), rev: 0, at: 0 }; const tok = newTok(a); await st.put(a);
      console.log(`ACCT new ${id} for ${a.iid}`); ok(req, res, Object.assign(meta(a), { tok })); },
    async "POST /api/acct/admin"(req, res) { const b = await body(req, res); if (!b) return; const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401); if (!isAdmin(a)) return bad(req, res, "Not an admin account", 403);
      const t = crypto.randomBytes(24).toString("hex"); ADMTOK.set(t, Date.now() + 120e3); for (const [k, v] of ADMTOK) if (v < Date.now()) ADMTOK.delete(k); console.log("ACCT admin link for " + a.id); ok(req, res, { link: "/admin/auth?t=" + t }); },
    async "POST /api/acct/me"(req, res) { const b = await body(req, res); if (!b) return; const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401); ok(req, res, meta(a)); },
    /* the save: newer (by the client's save time) wins; an older save is refused with the account's numbers so the device can choose */
    async "POST /api/acct/save"(req, res) { const b = await body(req, res, 1600000); if (!b) return; const id = String(b.acct || "");
      await locked(id, async () => { const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401);
        const at = +b.at || 0, data = String(b.data || ""); if (!data || data.length > 1500000) return bad(req, res, "Save too big");
        if (!b.force && a.rev && a.dev && b.dev !== a.dev && at < (a.at || 0)) return bad(req, res, "newer", 409, meta(a));
        const rev = (a.rev || 0) + 1; await st.putSave(a.id, rev, { at, gz: !!b.gz, data });
        a.rev = rev; a.at = at; a.dev = String(b.dev || "").slice(0, 24); a.worth = Math.round(+b.worth || 0); a.nick = String(b.nick || "").replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 16); a.seen = new Date().toISOString();
        if (b.installId && ID.test(String(b.installId)) && !a.iid) a.iid = String(b.installId);
        await st.put(a); ok(req, res, { rev: a.rev, at: a.at, prot: !!(a.email && a.pw) }); }); },
    async "POST /api/acct/load"(req, res) { const b = await body(req, res); if (!b) return; const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401); const s = await st.getSave(a.id); if (!s) return bad(req, res, "No save yet", 404); ok(req, res, Object.assign(meta(a), { save: s })); },
    /* v86 protect: an email and a password on this account. With a password already set (a v77 username account), the password typed must be that one,
       unless a forgotten-password code opened the 15-minute reset window, in which case it becomes the new password */
    async "POST /api/acct/protect"(req, res) { const b = await body(req, res); if (!b) return; const id = String(b.acct || "");
      await locked(id, async () => { const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401);
        const em = normE(b.email); if (!EMAIL.test(em)) return bad(req, res, "That email doesn't look right.");
        const pe = pwBad(b.pass); if (pe) return bad(req, res, pe);
        const other = await st.byEmail(em); if (other && other.id !== a.id) return bad(req, res, takenMsg("email"), 409, { taken: "email" });
        if (a.pw && !resetOpen(a)) {
          if (a.pwFail && a.pwFail.until > Date.now()) return bad(req, res, "Too many wrong passwords. Try again in " + Math.ceil((a.pwFail.until - Date.now()) / 60000) + " minutes.", 429);
          if (!(await checkPw(b.pass, a.pw))) { const f = a.pwFail || { n: 0 }; f.n++; if (f.n >= 8) f.until = Date.now() + 15 * 60e3; a.pwFail = f; await st.put(a); return bad(req, res, "That isn't your current password. Use the one you already set.", 401, { needOld: true }); }
        } else a.pw = await hashPw(b.pass);
        if (a.email !== em) { a.email = em; a.emailOk = false; }
        a.reset = null; a.pwFail = null; a.prot = new Date().toISOString();
        try { await st.put(a); } catch (e) { if (e.taken) return bad(req, res, takenMsg(e.taken), 409, { taken: e.taken }); throw e; }
        console.log(`ACCT protected ${a.id} ${mask(em)}`); ok(req, res, meta(a)); }); },
    /* optional: confirm the email with a code (only when mail is live) */
    async "POST /api/acct/email"(req, res) { const b = await body(req, res); if (!b) return; const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401); const em = normE(b.email || a.email);
      if (!EMAIL.test(em)) return bad(req, res, "That email doesn't look right.");
      const other = await st.byEmail(em); if (other && other.id !== a.id) return bad(req, res, takenMsg("email"), 409, { taken: "email" });
      const c = setCode(a, "link", em); if (!c) return bad(req, res, "A code is on its way. You can ask for another in a minute.", 429); await st.put(a);
      const r = await codeMail(em, c, "link"); console.log(`ACCT link code ${a.id} ${mask(em)}${r.dry ? " " + c : ""}`); ok(req, res, { sent: true, dry: !!r.dry }); },
    async "POST /api/acct/email/verify"(req, res) { const b = await body(req, res); if (!b) return; const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401);
      const err = await checkCode(a, "link", b.code); if (err) return bad(req, res, err); const em = a.code.email;
      const other = await st.byEmail(em); if (other && other.id !== a.id) return bad(req, res, takenMsg("email"), 409, { taken: "email" });
      a.email = em; a.emailOk = true; a.code = null; await st.put(a); console.log(`ACCT email confirmed ${a.id} ${mask(em)}`); ok(req, res, meta(a)); },
    /* forgotten password: email → code → signed in on this device, with 15 minutes to set a new password */
    async "POST /api/acct/login"(req, res) { const b = await body(req, res); if (!b) return; const em = normE(b.email); if (!EMAIL.test(em)) return bad(req, res, "That email doesn't look right.");
      const a = await st.byEmail(em); if (!a) return bad(req, res, "No game uses that email yet.", 404);
      if (!RESEND) return bad(req, res, "Email codes aren't switched on yet. Sign in with your password, or use a transfer code from your other device.", 503, { noMail: true });
      const c = setCode(a, "login", em); if (!c) return bad(req, res, "A code is on its way. You can ask for another in a minute.", 429); await st.put(a);
      const r = await codeMail(em, c, "login"); console.log(`ACCT login code ${a.id} ${mask(em)}${r.dry ? " " + c : ""}`); ok(req, res, { sent: true, dry: !!r.dry }); },
    async "POST /api/acct/login/verify"(req, res) { const b = await body(req, res); if (!b) return; const em = normE(b.email); const a = await st.byEmail(em); if (!a) return bad(req, res, "No game uses that email.", 404);
      const err = await checkCode(a, "login", b.code); if (err) return bad(req, res, err); a.code = null; a.emailOk = true; a.reset = Date.now(); await signedIn(req, res, a, "email code"); },
    /* v77 username + password, kept for players who already have one; changing the password needs the old one (or the reset window) */
    async "POST /api/acct/user"(req, res) { const b = await body(req, res); if (!b) return; const id = String(b.acct || "");
      await locked(id, async () => { const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401);
        const pe = pwBad(b.pass); if (pe) return bad(req, res, pe);
        if (a.pw) { if (!resetOpen(a) && !(await checkPw(b.old, a.pw))) return bad(req, res, "Your current password isn't right."); a.pw = await hashPw(b.pass); a.reset = null; await st.put(a); console.log(`ACCT password changed ${a.id}`); return ok(req, res, meta(a)); }
        const u = normU(b.user); if (!USR.test(u)) return bad(req, res, "Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.");
        const other = await st.byUser(u); if (other && other.id !== a.id) return bad(req, res, takenMsg("user"), 409, { taken: "user" });
        a.user = u; a.pw = await hashPw(b.pass); a.pwFail = null;
        try { await st.put(a); } catch (e) { if (e.taken) return bad(req, res, takenMsg(e.taken), 409, { taken: e.taken }); throw e; }
        console.log(`ACCT username set ${a.id} ${u}`); ok(req, res, meta(a)); }); },
    /* sign in with the email (or a v77 username) and the password */
    async "POST /api/acct/signin"(req, res) { if (slowSignin(ipOf(req))) return bad(req, res, "Too many tries. Wait a minute and try again.", 429); const b = await body(req, res); if (!b) return;
      const who = String(b.user || b.email || "").trim(), isE = who.includes("@");
      const a = isE ? (EMAIL.test(normE(who)) ? await st.byEmail(normE(who)) : null) : (USR.test(normU(who)) ? await st.byUser(normU(who)) : null);
      const no = "That email and password don't match.";
      if (!a || !a.pw) { await hashPw("x"); return bad(req, res, no, 401); }
      await locked(a.id, async () => { const a2 = await st.get(a.id);
        if (a2.pwFail && a2.pwFail.until > Date.now()) return bad(req, res, "Too many wrong passwords. Try again in " + Math.ceil((a2.pwFail.until - Date.now()) / 60000) + " minutes.", 429);
        if (!(await checkPw(b.pass, a2.pw))) { const f = a2.pwFail && a2.pwFail.until && a2.pwFail.until <= Date.now() ? { n: 0 } : (a2.pwFail || { n: 0 }); f.n++; if (f.n >= 8) f.until = Date.now() + 15 * 60e3; a2.pwFail = f; await st.put(a2); console.log(`ACCT signin fail ${a2.id} ${f.n}`); return bad(req, res, no, 401); }
        await signedIn(req, res, a2, isE ? "email" : "username"); }); },
    /* App Store rule: an account you can create, you can delete. Removes the account, its saves and its email */
    async "POST /api/acct/delete"(req, res) { const b = await body(req, res); if (!b) return; const a = await auth(b); if (!a) return bad(req, res, "Signed out", 401);
      await st.del(a); console.log(`ACCT deleted ${a.id}`); ok(req, res, { deleted: true }); },
  };
  /* admin numbers: refreshed in the background (the admin page renders synchronously) */
  let STATS = { n: 0, withEmail: 0, withUser: 0, withPw: 0, prot: 0, saved: 0, recent: 0 };
  async function refreshStats() { try { if (READY) STATS = await st.stats(); } catch (e) { console.log("ACCT stats " + e.message); } }
  setTimeout(refreshStats, 5000); setInterval(refreshStats, 60e3).unref();
  function stats() { return Object.assign({}, STATS, { live: !!RESEND, store: st.kind, ready: READY, fail: FAIL }); }
  /* nightly copy of every account and its current save, for DATA/backups (Railway's Postgres volume is the primary) */
  async function exportGz() { if (!READY) return null; const all = await st.all(), out = []; for (const a of all) out.push({ a, s: await st.getSave(a.id) }); return zlib.gzipSync(JSON.stringify({ at: new Date().toISOString(), store: st.kind, accounts: out })); }
  return { async handle(req, res, url) { const r = routes[req.method + " " + url.pathname]; if (!r) return false; try { await r(req, res); } catch (e) { console.log("ACCT error " + url.pathname + " " + e.message); if (!res.headersSent) bad(req, res, "Something went wrong. Try again.", 500); } return true; }, stats, exportGz, ready, kind: () => st.kind, adminTok(t) { const v = ADMTOK.get(String(t || "")); if (!v) return false; ADMTOK.delete(String(t)); return v > Date.now(); } };
};
