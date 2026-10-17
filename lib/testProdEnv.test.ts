import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { laddaProdEnv } from "./testProdEnv";

describe("laddaProdEnv — prod-testerna hoppas över i CI i stället för att falla", () => {
  it("filen saknas → false och inget kastas (så describe.skipIf kan hoppa över)", () => {
    expect(laddaProdEnv(path.join(os.tmpdir(), "finns-inte-.env.local"))).toBe(false);
  });
  it("filen finns → true, värdena läses in, ett redan satt värde vinner och kommentarer hoppas över", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prodenv-"));
    const f = path.join(dir, ".env.local");
    fs.writeFileSync(f, "# kommentar\nTEST_PRODENV_NY=a=b\nTEST_PRODENV_SATT=fran-fil\n");
    process.env.TEST_PRODENV_SATT = "redan";
    try {
      expect(laddaProdEnv(f)).toBe(true);
      expect(process.env.TEST_PRODENV_NY).toBe("a=b");
      expect(process.env.TEST_PRODENV_SATT).toBe("redan");
    } finally {
      delete process.env.TEST_PRODENV_NY; delete process.env.TEST_PRODENV_SATT;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
