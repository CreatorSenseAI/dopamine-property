// Dopamine Property: zero-dependency static server for Railway (or any Node 18+ host).
// Serves public/ with gzip, sensible caching and a /healthz check.
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain" };

// read everything once at boot; the game is a single page
const files = new Map();
for (const name of fs.readdirSync(ROOT)) {
  const body = fs.readFileSync(path.join(ROOT, name));
  files.set("/" + name, { body, gz: zlib.gzipSync(body), type: TYPES[path.extname(name)] || "application/octet-stream" });
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  const f = files.get(url.pathname === "/" ? "/index.html" : url.pathname) || files.get("/index.html");
  const gzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  res.writeHead(200, {
    "content-type": f.type,
    "cache-control": f.type.startsWith("text/html") ? "no-cache" : "public, max-age=86400",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    vary: "accept-encoding",
    ...(gzip ? { "content-encoding": "gzip" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : gzip ? f.gz : f.body);
}).listen(PORT, () => console.log(`Dopamine Property on :${PORT}`));
