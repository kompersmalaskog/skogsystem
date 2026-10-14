// VILOBROTT-LISTAN FÖRE/EFTER — vilka brott försvinner, tillkommer eller ändras av de gemensamma vilareglerna
// (ändarna av veckovilan är vila · pass över midnatt slutar nästa dygn). Skriver ALDRIG till databasen.
//
//   npx tsx scripts/vilobrott-fore-efter.ts                       # påhittad exempeldata (lib/__fixtures__)
//   npx tsx scripts/vilobrott-fore-efter.ts export.json           # export ur prod (scripts/vilobrott-fore-efter.sql)
//   npx tsx scripts/vilobrott-fore-efter.ts export.json --fore-ref <commit>   # annan "före"-version
//
// "Före" = lib/vilobrott.ts ur git (standard 39ce42b, sista commit före ändringen), "efter" = lib/vilobrott.ts i arbetsträdet.
// Exporten ger underlaget; planeringschatten kör SQL-filen mot prod, sparar resultatet som JSON och kör det här.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { jamforVilobrott, rapportText, type Analys, type ForeEfterExport } from "../lib/admin/vilobrottForeEfter";
import { analyseraVilobrott } from "../lib/vilobrott";

const rot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const refIdx = args.indexOf("--fore-ref");
const foreRef = refIdx >= 0 ? args[refIdx + 1] : "39ce42b";
const filArg = args.find((a, i) => !a.startsWith("--") && i !== refIdx + 1);
const fil = filArg ? path.resolve(filArg) : path.join(rot, "lib", "__fixtures__", "vilobrott_fore_efter_exempel.json");

function gammalAnalys(): Analys {
  const kalla = execFileSync("git", ["show", `${foreRef}:lib/vilobrott.ts`], { cwd: rot, encoding: "utf8" })
    .replace("@/lib/dagsegment", path.join(rot, "lib", "dagsegment").replace(/\\/g, "/"));
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vilobrott-fore-")), "vilobrott-fore.ts");
  fs.writeFileSync(tmp, kalla);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const modul = require(tmp);
  if (typeof modul.analyseraVilobrott !== "function") throw new Error(`Hittade ingen analyseraVilobrott i ${foreRef}:lib/vilobrott.ts`);
  // Den gamla känner inte till 'nu' — det tredje argumentet ignoreras.
  return (dagar, trosklar) => modul.analyseraVilobrott(dagar, trosklar);
}

const exp = JSON.parse(fs.readFileSync(fil, "utf8")) as ForeEfterExport;
const resultat = jamforVilobrott(exp, gammalAnalys(), analyseraVilobrott);
console.log(`Underlag: ${fil}\nFöre: ${foreRef}:lib/vilobrott.ts · Efter: arbetsträdet\n`);
console.log(rapportText(resultat));
