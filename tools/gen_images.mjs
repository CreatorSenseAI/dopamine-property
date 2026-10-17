// Batch-generates photoreal home images with the OpenAI Images API and writes
// public/img/<style>-<n>.webp plus public/img/manifest.json, which the game picks up
// automatically (it falls back to the drawn houses when the manifest is empty).
//
// The API key stays on your machine: it is read from the environment and never
// shipped to the browser.
//
//   OPENAI_API_KEY=sk-... node tools/gen_images.mjs            # 6 per style (30 images)
//   OPENAI_API_KEY=sk-... PER_STYLE=12 node tools/gen_images.mjs
//   IMAGE_MODEL=gpt-image-1 SIZE=1536x1024 QUALITY=medium        # optional overrides
//
// Re-running adds to what is already there (it never overwrites an existing file).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Set OPENAI_API_KEY first."); process.exit(1); }
const MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const SIZE = process.env.SIZE || "1536x1024";
const QUALITY = process.env.QUALITY || "medium";
const PER = Number(process.env.PER_STYLE || 6);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/img");
const MANIFEST = path.join(DIR, "manifest.json");

const BASE = "Photorealistic real-estate listing photo, exterior, shot from the street at eye level, wide angle, soft natural light, " +
  "invented house that does not exist, no people, no cars in focus, no text, no signage, no logos, no watermarks.";
const STYLES = {
  cottage: ["weatherboard Queenslander cottage on stumps with a wide verandah and tin roof, leafy suburban yard",
            "1950s red-brick Australian bungalow with a tiled roof, low front fence and lawn",
            "renovated fibro beach shack painted white with a timber deck and frangipani tree"],
  unit:    ["three-storey 1970s red-brick walk-up apartment block with balconies, Australian suburb",
            "modern low-rise apartment building with timber screens and planter boxes",
            "art deco apartment block in cream render with curved balconies"],
  villa:   ["Mediterranean-style rendered villa with arched windows, terracotta roof and a manicured garden",
            "Hamptons-style family home with white weatherboards, grey roof and hedges",
            "Spanish mission home with stucco walls, palms and a courtyard gate"],
  modern:  ["architect-designed contemporary home with timber cladding, floor-to-ceiling glass and a pool",
            "minimalist concrete and glass house cantilevered on a hillside with ocean views at golden hour",
            "luxury two-storey modern home with a stone facade and landscaped garden at dusk"],
  tower:   ["luxury residential tower with glass balconies overlooking a harbour at dusk, penthouse lights on",
            "sleek high-rise apartment tower on a waterfront promenade at blue hour",
            "boutique luxury residential tower with sculpted balconies and a rooftop garden at sunset"],
};

async function generate(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: SIZE, quality: QUALITY, n: 1, output_format: "webp", output_compression: 80 }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image in response: " + JSON.stringify(j).slice(0, 200));
  return Buffer.from(b64, "base64");
}

await fs.mkdir(DIR, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch {}

for (const [style, variants] of Object.entries(STYLES)) {
  manifest[style] = manifest[style] || [];
  let n = manifest[style].length;
  for (let i = 0; i < PER; i++) {
    const file = `${style}-${++n}.webp`;
    const prompt = `${BASE} Subject: ${variants[i % variants.length]}.`;
    process.stdout.write(`${file} … `);
    try {
      await fs.writeFile(path.join(DIR, file), await generate(prompt), { flag: "wx" });
      manifest[style].push(`img/${file}`);
      await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log("ok");
    } catch (e) { console.log("failed: " + e.message); }
  }
}
console.log(`Done. ${Object.values(manifest).flat().length} images in public/img. Commit and push to deploy.`);
