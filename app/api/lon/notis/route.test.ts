/**
 * /api/lon/notis — cronen som köar "Granska din <månad>" (den 1:a kl 18) och påminnelsen (den 3:e kl 18).
 * Reglerna (schema, mottagare, dedup) är provade i lib/lonesystem/granskaNotis.test.ts; här: vem som får köra, torr/skarp körning, och att rutten läser
 * underlaget för LÖNEperioden.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ skrivet: [] as any[], perioder: [] as string[], admin: false }));
vi.mock("@/lib/auth/server", () => ({
  kravRoll: async () => (h.admin ? { ok: true, session: {} } : { ok: false, res: new Response("", { status: 403 }) }),
  ADMIN_ROLLER: ["admin"],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => ({ upsert: (rader: any[], o: any) => { h.skrivet.push({ t, rader, o }); return { select: async () => ({ data: rader.map(r => ({ mottagare_id: r.mottagare_id })), error: null }) }; } }),
  }),
}));
vi.mock("@/lib/lonesystem/loneunderlag", () => ({
  beraknaLoneunderlag: async (_sb: any, p: { period: string }) => {
    h.perioder.push(p.period);
    return { resultat: [{ medarbetare_id: "a", rader: [{}], status: "utkast", godkannande: "vantar", foretagsledare: false }] };
  },
}));
process.env.CRON_SECRET = "hemlig";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";

import { NextRequest } from "next/server";
import { GET } from "./route";

const dag1 = "2026-10-01T16:30:00Z";
const anropa = (qs = "", cron = false) => GET(new NextRequest(`http://x/api/lon/notis${qs}`, { headers: cron ? { authorization: "Bearer hemlig" } : {} }));
beforeEach(() => { h.skrivet = []; h.perioder = []; h.admin = false; });

describe("/api/lon/notis", () => {
  it("varken cron-hemligheten eller admin → 403, inget läses eller köas", async () => {
    expect((await anropa(`?nu=${dag1}`)).status).toBe(403);
    expect(h.perioder).toEqual([]);
    expect(h.skrivet).toEqual([]);
  });
  it("fel hemlighet räknas inte", async () => {
    const r = await GET(new NextRequest("http://x/api/lon/notis", { headers: { authorization: "Bearer fel" } }));
    expect(r.status).toBe(403);
  });
  it("cron: skarp körning — köar, och underlaget läses för LÖNEperioden (oktober för september-arbetet)", async () => {
    vi.useFakeTimers({ now: new Date(dag1) });
    try {
      const j = await (await anropa("", true)).json();
      expect(j.lage).toBe("skarp");
      expect(j.koade).toBe(1);
      expect(h.perioder).toEqual(["2026-10"]);
      expect(h.skrivet[0].rader[0]).toMatchObject({ typ: "lon_granska", dedup_nyckel: "granska:2026-09", skickas_at: "infinity" });
    } finally { vi.useRealTimers(); }
  });
  it("cron: en annan dag köar inget och läser inget", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T16:30:00Z") });
    try {
      const j = await (await anropa("", true)).json();
      expect(j.koade).toBe(0);
      expect(h.perioder).toEqual([]);
      expect(h.skrivet).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
  it("inloggad admin utan ?skarp=1: torrkörning — visar kandidaterna men köar inget", async () => {
    h.admin = true;
    const j = await (await anropa(`?nu=${dag1}`)).json();
    expect(j.lage).toMatch(/torrkörning/);
    expect(j.kandidater).toEqual([{ typ: "lon_granska", arbetsmanad: "2026-09", mottagare: ["a"] }]);
    expect(h.skrivet).toEqual([]);
  });
  it("?dry=1 är alltid torrkörning, även för cron", async () => {
    const j = await (await anropa(`?dry=1&nu=${dag1}`, true)).json();
    expect(j.lage).toMatch(/torrkörning/);
    expect(h.skrivet).toEqual([]);
  });
  it("?nu= gäller bara torrkörning: en skarp körning använder alltid verklig tid", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T16:30:00Z") });
    try {
      const j = await (await anropa(`?nu=${dag1}`, true)).json();
      expect(j.lage).toBe("skarp");
      expect(j.koade).toBe(0);
      expect(h.skrivet).toEqual([]);
    } finally { vi.useRealTimers(); }
  });
});
