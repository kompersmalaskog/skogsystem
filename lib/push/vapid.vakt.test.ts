import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { VAPID_PUBLIC_KEY, vapidPrivatNyckel, vapidPublikSomBytes } from "./vapid";

const filer = execSync("git ls-files '*.ts' '*.tsx' '*.js' '*.mjs'", { encoding: "utf8" }).split("\n").filter(Boolean);

describe("VAPID-nycklarna", () => {
  it("ingen privat nyckel i koden — bara process.env läser den", () => {
    for (const f of filer) {
      const s = readFileSync(f, "utf8");
      if (/VAPID_PRIVATE_KEY\s*\|\|/.test(s) || /VAPID_PRIVATE_KEY\s*\?\?/.test(s)) throw new Error(`${f} har en reservnyckel för VAPID_PRIVATE_KEY`);
    }
  });
  it("den publika nyckeln står bara i lib/push/vapid.ts", () => {
    const traff = filer.filter(f => f !== "lib/push/vapid.ts" && readFileSync(f, "utf8").includes(VAPID_PUBLIC_KEY.slice(0, 24)));
    expect(traff).toEqual([]);
  });
  it("saknad eller tom miljövariabel = null", () => {
    const fore = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY; expect(vapidPrivatNyckel()).toBeNull();
    process.env.VAPID_PRIVATE_KEY = "  "; expect(vapidPrivatNyckel()).toBeNull();
    process.env.VAPID_PRIVATE_KEY = " abc "; expect(vapidPrivatNyckel()).toBe("abc");
    if (fore === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = fore;
  });
  it("publika nyckeln blir 65 byte (okomprimerad P-256-punkt)", () => {
    const b = vapidPublikSomBytes(); expect(b.length).toBe(65); expect(b[0]).toBe(4);
  });
});
