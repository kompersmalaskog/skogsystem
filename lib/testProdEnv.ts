// Tester som talar med PROD (läser) behöver .env.local. Den finns på Martins dator men aldrig i CI, och då ska
// testerna HOPPAS ÖVER (synligt som "skipped"), inte falla. Använd: `describe.skipIf(!HAR_PROD_ENV)(…)`.
import * as fs from "fs";

/** Läser in .env.local i process.env (ett redan satt värde vinner). Returnerar false om filen saknas. */
export function laddaProdEnv(sokvag: string): boolean {
  if (!fs.existsSync(sokvag)) return false;
  for (const l of fs.readFileSync(sokvag, "utf8").split("\n")) {
    const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
  }
  return true;
}
