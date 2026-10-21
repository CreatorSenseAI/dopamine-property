// Auction Empires: WebSocket push for the live arena (v55). Optional: without the `ws` package the server runs as before and clients keep polling.
// Protocol (path /ws):
//   client → {t:'hello', id, nick, tier?}  then {t:'ping', tier?, lot?} every ~20s while the page is visible (same presence as POST /api/arena;
//            `lot` is the same lobby lot post the poll sends)
//   server → {t:'arena', ...}  the exact body POST /api/arena returns for that player, on every arena change and every 2s while a lot is
//            in lobby/live/done (5s when one is due within 70s, 15s otherwise)
// Bids still go through POST /api/arena/bid. Everyone who has not bid in the current lot gets the same pre-serialised string;
// only the handful who have bid get a personal one (their `me` flags differ).
module.exports = function arenaWS(server, social) {
  let WebSocketServer;
  try { ({ WebSocketServer } = require("ws")); } catch (e) { console.log("WS off (" + (e.code || e.message) + "): live arena stays on polling"); return null; }
  const ID = /^[a-z0-9]{6,32}$/i, MAX_PER_IP = 100, MAX_MSGS = 20; // per socket per 10s
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false, clientTracking: true });
  const perIp = new Map();
  const ipOf = req => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const A = social.arena;

  server.on("upgrade", (req, socket, head) => {
    let p; try { p = new URL(req.url, "http://x").pathname; } catch { p = ""; }
    if (p !== "/ws") { socket.destroy(); return; }
    const ip = ipOf(req);
    if ((perIp.get(ip) || 0) >= MAX_PER_IP) { socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req, ip));
  });

  let sent = 0, opened = 0;
  wss.on("connection", (ws, req, ip) => {
    opened++; perIp.set(ip, (perIp.get(ip) || 0) + 1);
    ws.alive = true; ws.id = null; ws.n = 0; ws.win = Date.now();
    ws.on("pong", () => { ws.alive = true; });
    ws.on("close", () => { const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); });
    ws.on("error", () => {});
    ws.on("message", (data, isBinary) => {
      ws.alive = true;
      const now = Date.now(); if (now - ws.win > 10e3) { ws.win = now; ws.n = 0; } if (++ws.n > MAX_MSGS) { ws.close(1008, "slow down"); return; }
      if (isBinary) return;
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "hello") { if (!ID.test(String(m.id))) { ws.close(1008, "bad id"); return; } ws.id = String(m.id); ws.nick = m.nick; }
      else if (m.t !== "ping" || !ws.id) return;
      if (m.nick) ws.nick = m.nick;
      try { A.presence({ installId: ws.id, nick: ws.nick, tier: m.tier, lot: m.lot }); } catch (e) { console.log("WS presence " + e.message); }
      if (ws.readyState === 1) ws.send(JSON.stringify({ t: "arena", ...A.view(ws.id) }));
    });
  });

  let lastAt = 0, queued = false;
  // one shared string for everyone not in the current lot, a personal one per bidder (few); slow sockets (>256KB queued) skip a beat
  function broadcast() {
    if (!wss.clients.size) return;
    const involved = A.involved(), shared = JSON.stringify({ t: "arena", ...A.view("") }), own = new Map();
    for (const ws of wss.clients) {
      if (ws.readyState !== 1 || !ws.id || ws.bufferedAmount > 262144) continue;
      let msg = shared;
      if (involved.has(ws.id)) { msg = own.get(ws.id); if (!msg) { msg = JSON.stringify({ t: "arena", ...A.view(ws.id) }); own.set(ws.id, msg); } }
      ws.send(msg); sent++;
    }
    lastAt = Date.now();
  }
  // coalesce bursts (a bid and the tick that follows it) into one send on the next turn of the event loop
  A.on(() => { if (queued) return; queued = true; setImmediate(() => { queued = false; broadcast(); }); });
  setInterval(() => { const gap = A.live() ? 1800 : A.soon() ? 5000 : 15000; if (Date.now() - lastAt >= gap) broadcast(); }, 200); // live: never more than ~2s between pushes
  // drop dead connections (phones that went to sleep without a close frame)
  setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { } } }, 30e3);
  setInterval(() => { if (wss.clients.size) console.log(`WS ${wss.clients.size} open, ${opened} opened, ${sent} pushes since boot`); }, 30 * 60e3);
  console.log("WS on at /ws");
  return { stats: () => ({ open: wss.clients.size, opened, sent }) };
};
