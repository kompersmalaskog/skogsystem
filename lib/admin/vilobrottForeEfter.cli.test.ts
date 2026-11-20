// Hela kommandoraden, på riktigt: scripts/vilobrott-fore-efter.ts körs som processen planeringschatten kör, och rapporten ska vara gjord på den
// ANGIVNA filen — inte på exempeldatan (felet 2026-10-14: utan --fore-ref ignorerades filen). 'Före' = HEAD så testet inte hänger på att en
// viss gammal commit finns i klonen (grunda kloner i CI).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rot = path.resolve(__dirname, "..", "..");
const tsx = path.join(rot, "node_modules", ".bin", "tsx");

describe("scripts/vilobrott-fore-efter.ts", () => {
  const exempel = JSON.parse(fs.readFileSync(path.join(rot, "lib", "__fixtures__", "vilobrott_fore_efter_exempel.json"), "utf8"));
  const kor = (args: string[]) => execFileSync(tsx, [path.join(rot, "scripts", "vilobrott-fore-efter.ts"), ...args], { cwd: rot, encoding: "utf8", timeout: 60_000 });

  it("en fil UTAN --fore-ref används (rapporten bär filens 'nu', inte exempeldatans)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fore-efter-"));
    const fil = path.join(dir, "min-export.json");
    fs.writeFileSync(fil, JSON.stringify({ ...exempel, nu: "2026-10-20T10:00:00Z" }));
    try {
      const ut = kor([fil]);
      expect(ut).toContain(`Underlag: ${fil}`);
      expect(ut).toContain("nu = 2026-10-20T10:00:00Z");
      expect(ut).not.toContain("vilobrott_fore_efter_exempel");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it("utan argument körs exempeldatan; med --fore-ref och en fil används filen", () => {
    expect(kor(["--fore-ref", "HEAD"])).toContain("vilobrott_fore_efter_exempel.json");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fore-efter-"));
    const fil = path.join(dir, "export.json");
    fs.writeFileSync(fil, JSON.stringify({ ...exempel, nu: "2026-10-21T10:00:00Z" }));
    try {
      const ut = kor([fil, "--fore-ref", "HEAD"]);
      expect(ut).toContain(`Underlag: ${fil}`);
      expect(ut).toContain("nu = 2026-10-21T10:00:00Z");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});
