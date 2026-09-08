#!/usr/bin/env node
// Design-lint: räknar stil-literaler utanför lib/design/tokens.ts i ÄNDRADE
// vy-filer och skriver en varning. Blockerar inte (exit 0) — utom för filer i
// SKARPA, som är rättade mot tokens och inte får driva igen.
//
//   node scripts/design-lint.mjs                # diff mot origin/main
//   node scripts/design-lint.mjs <bas-ref>      # diff mot annan ref
//   node scripts/design-lint.mjs --alla         # hela app/ + components/ (inventering)
//   node scripts/design-lint.mjs --strikt       # exit 1 om SKARPA-filer har nya literaler
//
// Bakgrund: 2026-09-08 hade appen 33 textstorlekar, 234 färger, 109 padding-
// kombinationer. Utan den här räkningen driver värdena isär igen inom några
// månader — som km gjorde när tre ställen räknade var för sig.

import { execSync } from "node:child_process";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Tillåtna värden (speglar lib/design/tokens.ts) -----------------------
const TYP_STORLEKAR = new Set([32, 30, 20, 17, 13, 11]);
const VIKTER = new Set([400, 600, 700]);
const AVSTAND = new Set([0, 4, 8, 12, 16, 24, 32]);
const RADIER = new Set([10, 12, 16]);
const TIDER = new Set([150, 250, 350, 400]);
const FARGER = new Set([
  "#000000", "#000", "#1c1c1e", "#2c2c2e", "#ffffff", "#fff", "#8e8e93", "#636366",
  "#0a84ff", "#30d158", "#ff9f0a", "#ff453a", "#a8d582", "#f0b24c",
]);
const ALFA = new Set(["0.08", "0.1", "0.10"]); // rgba(255,255,255,x) som är tokens

/** Filer som är rättade mot tokens. Nya literaler här är fel, inte skuld. */
export const SKARPA = [
  // "components/arbetsrapport/Arbetsrapport.tsx", // skarpas när piloten är klar
];

// --- Regler ---------------------------------------------------------------
const REGLER = [
  { namn: "textstorlek", re: /fontSize:\s*"?(\d+(?:\.\d+)?)(?:px)?"?/g, ok: (m) => TYP_STORLEKAR.has(Number(m[1])) },
  { namn: "vikt", re: /fontWeight:\s*"?(\d{3}|bold|normal)"?/g, ok: (m) => VIKTER.has(Number(m[1])) },
  { namn: "typsnitt", re: /fontFamily:\s*"([^"]+)"/g, ok: (m) => m[1] === "inherit" },
  { namn: "avstånd", re: /\b(?:gap|padding(?:Top|Bottom|Left|Right)?|margin(?:Top|Bottom|Left|Right)?):\s*"?(-?\d+)(?:px)?"?\s*[,}]/g, ok: (m) => AVSTAND.has(Math.abs(Number(m[1]))) },
  { namn: "avstånd (sammansatt)", re: /\b(?:padding|margin):\s*"((?:-?\d+(?:px)?\s*){2,4})"/g, ok: (m) => m[1].trim().split(/\s+/).every((v) => AVSTAND.has(Math.abs(parseInt(v, 10)))) },
  { namn: "radie", re: /borderRadius:\s*"?(\d+)(?:px)?"?/g, ok: (m) => RADIER.has(Number(m[1])) },
  { namn: "färg", re: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g, ok: (m) => FARGER.has(m[0].toLowerCase()) },
  { namn: "vit alfa", re: /rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/g, ok: (m) => ALFA.has(m[1]) },
  { namn: "rörelsetid", re: /(\d+(?:\.\d+)?)(ms|s)\b(?=[^;"']*(?:ease|linear|cubic|,|"|'))/g, ok: (m) => TIDER.has(m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1])) },
  { namn: "egen @keyframes", re: /@keyframes\s+(\w+)/g, ok: () => false },
  { namn: "window.alert", re: /(^|[^A-Za-z.])alert\(/g, ok: () => false },
];

const VY_FIL = /^(app|components)\/.*\.tsx$/;
const UNDANTAG = /^(lib\/design\/|components\/design\/|components\/ui\/)/;

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function raknaRader(rader) {
  const fynd = {};
  for (const rad of rader) {
    for (const r of REGLER) {
      r.re.lastIndex = 0;
      for (const m of rad.matchAll(r.re)) {
        if (r.ok(m)) continue;
        const f = (fynd[r.namn] ||= { antal: 0, exempel: new Set() });
        f.antal++;
        if (f.exempel.size < 4) f.exempel.add(m[0].trim());
      }
    }
  }
  return fynd;
}

function tilllagdaRader(fil, bas) {
  // Bara +-rader ur diffen: skulden som redan finns räknas inte som ny.
  try {
    const diff = git(`diff -U0 ${bas}...HEAD -- "${fil}"`);
    return diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
  } catch {
    return [];
  }
}

const args = process.argv.slice(2);
const alla = args.includes("--alla");
const strikt = args.includes("--strikt");
const bas = args.find((a) => !a.startsWith("--")) || "origin/main";

let filer;
if (alla) {
  filer = git("ls-files app components").split("\n").filter((f) => VY_FIL.test(f) && !UNDANTAG.test(f));
} else {
  let andrade = "";
  try { andrade = git(`diff --name-only ${bas}...HEAD -- app components`); } catch { andrade = ""; }
  filer = andrade.split("\n").filter((f) => f && VY_FIL.test(f) && !UNDANTAG.test(f) && existsSync(path.join(ROT, f)));
}

const rapport = [];
let totalNya = 0;
let skarpaFel = 0;
for (const fil of filer) {
  const rader = alla ? readFileSync(path.join(ROT, fil), "utf8").split("\n") : tilllagdaRader(fil, bas);
  const fynd = raknaRader(rader);
  const antal = Object.values(fynd).reduce((s, f) => s + f.antal, 0);
  if (!antal) continue;
  totalNya += antal;
  const skarp = SKARPA.includes(fil);
  if (skarp) skarpaFel += antal;
  rapport.push({ fil, antal, skarp, fynd });
}

const md = [];
if (!rapport.length) {
  md.push(alla ? "Design-lint: inga literaler utanför tokens." : `Design-lint: inga nya stil-literaler utanför tokens (diff mot ${bas}).`);
} else {
  md.push(`## Design-lint — ${alla ? "hela appen" : `nya literaler mot ${bas}`}: ${totalNya} utanför lib/design/tokens.ts`);
  md.push("");
  md.push("Varning, inte hinder. Nya vyer och rörda ytor ska importera tokens; skulden i orörda rader räknas inte.");
  md.push("");
  md.push("| Fil | Nya | Vad |");
  md.push("|---|---:|---|");
  for (const r of rapport.sort((a, b) => b.antal - a.antal)) {
    const vad = Object.entries(r.fynd)
      .sort((a, b) => b[1].antal - a[1].antal)
      .map(([n, f]) => `${n} ${f.antal} (${[...f.exempel].join(", ")})`)
      .join("; ");
    md.push(`| ${r.skarp ? "**" + r.fil + "** (skarp)" : r.fil} | ${r.antal} | ${vad} |`);
  }
}
const text = md.join("\n");
console.log(text);

if (process.env.GITHUB_STEP_SUMMARY) {
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n"); } catch { /* ignoreras */ }
}

if (strikt && skarpaFel > 0) {
  console.error(`\nDesign-lint: ${skarpaFel} nya literaler i skarpa filer. Använd lib/design/tokens.ts.`);
  process.exit(1);
}
process.exit(0);
