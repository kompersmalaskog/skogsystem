import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Rollen "chef" finns inte längre i appen: bara förare och admin (samma som databasens ar_admin()). Det fanns ingen
 * chef i produktion (2 admin, 5 förare) men rollen låg kvar på ett femtiotal ställen, så en chef hade sett vyer
 * och knappar vars skrivningar RLS tyst avvisade. Den här vakten fäller bygget om en ny roll-kontroll mot 'chef'
 * skrivs, i stället för att det upptäcks först när någon får rollen.
 */
const ROT = path.resolve(__dirname, "../..");
const MAPPAR = ["app", "lib", "components"];

function filer(dir: string, ut: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filer(p, ut);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) ut.push(p);
  }
  return ut;
}

describe("rollen chef är borta ur koden", () => {
  it("ingen kod jämför eller listar rollen 'chef'", () => {
    const traffar: string[] = [];
    for (const m of MAPPAR) {
      for (const f of filer(path.join(ROT, m))) {
        const rader = fs.readFileSync(f, "utf8").split(/\r?\n/);
        rader.forEach((r, i) => { if (/['"`]chef['"`]/.test(r)) traffar.push(`${path.relative(ROT, f).split(path.sep).join("/")}:${i + 1}`); });
      }
    }
    expect(traffar).toEqual([]);
  });

  it("och texterna säger inte att något är 'admin/chef'", () => {
    const traffar: string[] = [];
    for (const m of MAPPAR) {
      for (const f of filer(path.join(ROT, m))) {
        const rader = fs.readFileSync(f, "utf8").split(/\r?\n/);
        rader.forEach((r, i) => { if (/admin\s*\/\s*chef|chef\s*\/\s*admin|admin och chef|inkl\.? chef/i.test(r)) traffar.push(`${path.relative(ROT, f).split(path.sep).join("/")}:${i + 1}`); });
      }
    }
    expect(traffar).toEqual([]);
  });
});
