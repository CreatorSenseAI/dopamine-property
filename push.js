/* Auction Empires push sender. Dependency-free: APNs over HTTP/2 with an ES256 JWT, FCM v1 with a service-account RS256 JWT.
   Tokens come from POST /api/push (social.js) and live in DATA/push/<installId>.json as {token, platform, tzo?, at}.
   Env: APNS_KEY (the .p8 contents, newlines as \n allowed), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE (default com.creatorsenseai.auctionempires), APNS_SANDBOX=1 for the dev gateway;
        FCM_SERVICE_ACCOUNT (the Firebase service-account JSON, as a string). Without keys every send is logged as a dry run.
   Two messages a day at most per device, in the device's local time (tzo = minutes east of UTC, sent by the app): "Today's lot" at 18:00 and "streak at risk" at 21:00 for anyone who has not played today. */
const fs = require("fs"), path = require("path"), crypto = require("crypto"), http2 = require("http2");
module.exports = function push({ DATA, writeJSON }) {
  const DIR = path.join(DATA, "push"), SENT = path.join(DATA, "push-sent.json"); fs.mkdirSync(DIR, { recursive: true });
  const read = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const b64u = b => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const apnsKey = (process.env.APNS_KEY || "").replace(/\\n/g, "\n"), apnsId = process.env.APNS_KEY_ID, apnsTeam = process.env.APNS_TEAM_ID, bundle = process.env.APNS_BUNDLE || "com.creatorsenseai.auctionempires";
  let fcm = null; try { fcm = process.env.FCM_SERVICE_ACCOUNT ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT) : null; } catch { fcm = null; }
  const live = { ios: !!(apnsKey && apnsId && apnsTeam), android: !!(fcm && fcm.private_key && fcm.client_email && fcm.project_id) };
  let apnsJwt = { t: 0, v: "" }, fcmTok = { t: 0, v: "" };
  function apnsToken() { if (Date.now() - apnsJwt.t < 50 * 60e3) return apnsJwt.v; const h = b64u(JSON.stringify({ alg: "ES256", kid: apnsId })), c = b64u(JSON.stringify({ iss: apnsTeam, iat: Math.floor(Date.now() / 1000) }));
    const sig = crypto.sign("sha256", Buffer.from(h + "." + c), { key: apnsKey, dsaEncoding: "ieee-p1363" }); apnsJwt = { t: Date.now(), v: h + "." + c + "." + b64u(sig) }; return apnsJwt.v; }
  function sendApns(token, title, body, data) { return new Promise((resolve, reject) => {
    const host = process.env.APNS_SANDBOX ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com", client = http2.connect(host); let done = false;
    const fin = (ok, err) => { if (done) return; done = true; client.close(); ok ? resolve(true) : reject(err); };
    client.on("error", e => fin(false, e));
    const req = client.request({ ":method": "POST", ":path": "/3/device/" + token, authorization: "bearer " + apnsToken(), "apns-topic": bundle, "apns-push-type": "alert", "apns-priority": "10" });
    let status = 0, out = ""; req.on("response", h => { status = h[":status"]; }); req.on("data", d => { out += d; }); req.on("end", () => fin(status === 200, new Error("APNs " + status + " " + out.slice(0, 120)))); req.on("error", e => fin(false, e));
    req.end(JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, ...data })); setTimeout(() => fin(false, new Error("APNs timeout")), 10000); }); }
  async function fcmAccess() { if (Date.now() - fcmTok.t < 50 * 60e3) return fcmTok.v; const now = Math.floor(Date.now() / 1000), h = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })), c = b64u(JSON.stringify({ iss: fcm.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const sig = crypto.sign("sha256", Buffer.from(h + "." + c), fcm.private_key), jwt = h + "." + c + "." + b64u(sig);
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt }), j = await r.json(); if (!j.access_token) throw new Error("FCM auth " + JSON.stringify(j).slice(0, 120)); fcmTok = { t: Date.now(), v: j.access_token }; return j.access_token; }
  async function sendFcm(token, title, body, data) { const at = await fcmAccess(), r = await fetch(`https://fcm.googleapis.com/v1/projects/${fcm.project_id}/messages:send`, { method: "POST", headers: { authorization: "Bearer " + at, "content-type": "application/json" }, body: JSON.stringify({ message: { token, notification: { title, body }, data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])), android: { priority: "high" } } }) });
    if (!r.ok) throw new Error("FCM " + r.status + " " + (await r.text()).slice(0, 120)); return true; }
  async function send(rec, title, body, data) { const p = rec.platform === "ios" ? "ios" : "android"; if (!live[p]) { console.log(`PUSH dry-run (${p}, no keys): "${title}" to ${rec.id}`); return "dry"; }
    try { if (p === "ios") await sendApns(rec.token, title, body, data); else await sendFcm(rec.token, title, body, data); return "sent"; }
    catch (e) { console.log(`PUSH failed ${rec.id}: ${e.message}`); if (/410|UNREGISTERED|BadDeviceToken|Unregistered/.test(e.message)) { try { fs.unlinkSync(path.join(DIR, rec.id + ".json")); } catch {} } return "failed"; } }
  const tokens = () => fs.readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => Object.assign({ id: f.slice(0, -5) }, read(path.join(DIR, f)) || {})).filter(t => t.token);
  const localDay = (tzo) => { const d = new Date(Date.now() + (tzo || 0) * 60e3); return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() }; };
  const played = (id, day, tzo) => { const p = read(path.join(DATA, "players", id + ".json")); if (!p || !p.lastSeen) return false; return new Date(Date.parse(p.lastSeen) + (tzo || 0) * 60e3).toISOString().slice(0, 10) === day; };
  const LOTS = ["Today's lot is up: a rare listing with softer rivals, no registration needed.", "Your daily lot is waiting. First one in wins it.", "A rare lot just hit the board for you. Ten seconds on the clock when you're ready."];
  async function tick() { let sent = read(SENT) || {}; const now = Date.now(); for (const k of Object.keys(sent)) if (now - sent[k] > 2 * 864e5) delete sent[k];
    let n = 0; for (const t of tokens()) { const { day, hour } = localDay(t.tzo); const key1 = t.id + ":lot:" + day, key2 = t.id + ":streak:" + day;
      if (hour === 18 && !sent[key1] && !played(t.id, day, t.tzo)) { sent[key1] = now; n++; await send(t, "Today's lot", LOTS[Math.floor(Math.random() * LOTS.length)], { kind: "lot" }); }
      else if (hour === 21 && !sent[key2] && !played(t.id, day, t.tzo)) { sent[key2] = now; n++; await send(t, "Your streak ends at midnight", "One auction keeps it alive. The clock is ten seconds.", { kind: "streak" }); } }
    writeJSON(SENT, sent); if (n) console.log(`PUSH tick: ${n} message${n === 1 ? "" : "s"} (${live.ios ? "APNs live" : "APNs dry"}, ${live.android ? "FCM live" : "FCM dry"})`); }
  setTimeout(() => tick().catch(e => console.log("PUSH error " + e.message)), 30000); setInterval(() => tick().catch(e => console.log("PUSH error " + e.message)), 10 * 60e3);
  return { live, tokens: () => tokens().length, send, tick, status: () => ({ ios: live.ios ? "live" : "dry run (set APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID)", android: live.android ? "live" : "dry run (set FCM_SERVICE_ACCOUNT)", tokens: tokens().length, lastSent: Object.keys(read(SENT) || {}).length }) };
};
