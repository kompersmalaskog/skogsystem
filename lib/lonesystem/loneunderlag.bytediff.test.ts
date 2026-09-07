// BYTE-DIFF-BEVIS för lyftet av salary-export → lib/lonesystem/loneunderlag.ts.
// Kör GAMLA routen (origin/main, sparad i .tmp/bytediff/gammal_route.ts) och NYA
// routen mot SAMMA prod-DB med samma body, och kräver identisk JSON — byte för byte.
// Auth-vakten mockas i testprocessen (ingen deployad bypass); Fortnox anropas aldrig
// (dry_run). Kör: npx vitest run lib/lonesystem/loneunderlag.bytediff.test.ts
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

for (const l of fs.readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
}
vi.mock("@/lib/auth/server", () => ({ kravRoll: async () => ({ ok: true, session: {} }), ADMIN_ROLLER: ["admin", "chef"] }));

const req = (body: any) => ({ json: async () => body }) as any;
const kör = async (mod: any, body: any) => { const res = await mod.POST(req(body)); return { status: res.status, text: await res.text() }; };

describe("salary-export dry_run: gammal route == ny route (byte för byte)", () => {
  it.each(["2026-09", "2026-08", "2026-07"])("löneperiod %s", async (period) => {
    const gammal = await import("../../.tmp/bytediff/gammal_route");
    const ny = await import("../../app/api/fortnox/salary-export/route");
    const a = await kör(gammal, { period, dry_run: true });
    const b = await kör(ny, { period, dry_run: true });
    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(b.text.length).toBe(a.text.length);
    expect(b.text).toBe(a.text);
    const j = JSON.parse(b.text);
    console.log(`  ${period}: ${j.medarbetare.length} medarbetare, ${j.totalt_rader} rader, ${b.text.length} bytes — identiskt`);
  }, 120_000);
});
