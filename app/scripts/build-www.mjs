// Copies the single-file game into www/ and loads the native bridge before the game script.
// The game reads window.EAT_API (server base) and window.DPStore (in-app purchases) at start-up.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..", ".."), www = join(here, "..", "www");
mkdirSync(www, { recursive: true });
let html = readFileSync(join(root, "public", "index.html"), "utf8");
const api = process.env.EAT_API || "https://game-production-ee8e.up.railway.app";
const inject = `<script>window.EAT_API=${JSON.stringify(api)};window.EAT_APP=true;</script>\n<script src="capacitor.js"></script>\n<script src="bridge.js"></script>\n`;
const i = html.indexOf("<script>");
if (i < 0) throw new Error("game script not found");
html = html.slice(0, i) + inject + html.slice(i);
writeFileSync(join(www, "index.html"), html);
copyFileSync(join(here, "..", "src", "bridge.js"), join(www, "bridge.js"));
for (const f of ["manifest.webmanifest", "icon.svg"]) { try { copyFileSync(join(root, "public", f), join(www, f)); } catch {} }
console.log("www/ ready · API", api);
