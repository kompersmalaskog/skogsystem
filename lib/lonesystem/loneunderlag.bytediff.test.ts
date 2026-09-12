// BYTE-DIFF-BEVIS för lyftet av salary-export → lib/lonesystem/loneunderlag.ts.
// FRYST 2026-09-07: beviset gällde lyftet, inte reglerna. Sedan dess har reglerna
// ÄNDRATS medvetet (2026-09-12: arbetsdagströskel 60 min, dagtyp-frånvaro i
// underlaget, rast_langa/kortpass i berikningen) — den gamla routen ger därför
// annat svar och testet FÖRVÄNTAS falla mot .tmp/bytediff/gammal_route.ts.
// Månadskontrollen är nu scripts/dry-run-loneunderlag.ts.
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
    // Efter lyftet fick dry_run TVÅ nya nycklar per medarbetare (dagar, km_grans —
    // förarens tidrapport). Allt annat ska vara byte-identiskt: strippa bara de två
    // och jämför resten som text (nyckelordning bevaras av JSON.stringify).
    const strippa = (t: string) => JSON.stringify(JSON.parse(t), (k, v) => (k === "dagar" || k === "km_grans") ? undefined : v);
    const a2 = strippa(a.text), b2 = strippa(b.text);
    expect(b2.length).toBe(a2.length);
    expect(b2).toBe(a2);
    const j = JSON.parse(b.text);
    expect(Array.isArray(j.medarbetare[0]?.dagar)).toBe(true);
    console.log(`  ${period}: ${j.medarbetare.length} medarbetare, ${j.totalt_rader} rader, ${b.text.length} bytes — identiskt`);
  }, 120_000);
});
