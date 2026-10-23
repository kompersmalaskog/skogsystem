/**
 * /api/lon/paminn — knappen "Påminn" på förarkortet. Reglerna (vem som får påminnas, dedup) är provade i lib/lonesystem/granskaNotis.test.ts;
 * här: bara admin, felaktiga anrop, och att flushen körs direkt efter köandet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ skrivet: [] as any[], admin: true, tabeller: {} as Record<string, any[]>, fetchade: [] as any[], flushSvar: { skickade: 1 } as any }));
vi.mock("@/lib/auth/server", () => ({
  kravRoll: async () => (h.admin ? { ok: true, session: {} } : { ok: false, res: new Response("", { status: 403 }) }),
  ADMIN_ROLLER: ["admin"],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => {
      const filter: ((r: any) => boolean)[] = [];
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => { filter.push(r => r[c] === v); return api; },
        maybeSingle: () => Promise.resolve({ data: (h.tabeller[t] ?? []).find(r => filter.every(f => f(r))) ?? null, error: null }),
        upsert: (rader: any[], o: any) => { h.skrivet.push({ t, rader, o }); return { select: async () => ({ data: rader.map(r => ({ mottagare_id: r.mottagare_id })), error: null }) }; },
      };
      return api;
    },
  }),
}));
process.env.CRON_SECRET = "hemlig";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";

import { NextRequest } from "next/server";
import { POST } from "./route";

const anropa = (body: any) => POST(new NextRequest("http://x/api/lon/paminn", { method: "POST", body: JSON.stringify(body), headers: { cookie: "sb=1" } }));
beforeEach(() => {
  h.skrivet = []; h.admin = true; h.fetchade = []; h.flushSvar = { skickade: 1 };
  h.tabeller = { medarbetare: [{ id: "a", foretagsledare: false }, { id: "l", foretagsledare: true }], loneunderlag: [], fortnox_export_logg: [] };
  vi.stubGlobal("fetch", async (url: any, init: any) => { h.fetchade.push({ url: String(url), init }); return new Response(JSON.stringify(h.flushSvar), { status: 200 }); });
});

describe("/api/lon/paminn", () => {
  it("bara admin: andra får 403 och inget köas", async () => {
    h.admin = false;
    expect((await anropa({ medarbetare_id: "a", arbetsmanad: "2026-09" })).status).toBe(403);
    expect(h.skrivet).toEqual([]);
  });
  it("saknade fält → 400", async () => {
    expect((await anropa({ arbetsmanad: "2026-09" })).status).toBe(400);
    expect((await anropa({ medarbetare_id: "a" })).status).toBe(400);
    expect((await anropa(null)).status).toBe(400);
  });
  it("köar lon_granska till föraren och kör flushen direkt: pushen går nu", async () => {
    const j = await (await anropa({ medarbetare_id: "a", arbetsmanad: "2026-09" })).json();
    expect(j).toEqual({ ok: true, koad: true, skickades: true });
    expect(h.skrivet[0].rader[0]).toMatchObject({ mottagare_id: "a", typ: "lon_granska", skickas_at: "infinity", payload: { arbetsmanad: "2026-09", manuell: true } });
    expect(h.fetchade).toHaveLength(1);
    expect(h.fetchade[0].url).toBe("http://x/api/notis/flush");
    expect(h.fetchade[0].init.headers).toMatchObject({ authorization: "Bearer hemlig", cookie: "sb=1" });
  });
  it("flushen skickade inget (t.ex. ingen prenumeration): köad, inte skickad — och det är inget fel", async () => {
    h.flushSvar = { skickade: 0 };
    expect(await (await anropa({ medarbetare_id: "a", arbetsmanad: "2026-09" })).json()).toEqual({ ok: true, koad: true, skickades: false });
  });
  it("flushen går inte att nå: raden är ändå köad (nästa cron tar den)", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("nere"); });
    expect(await (await anropa({ medarbetare_id: "a", arbetsmanad: "2026-09" })).json()).toEqual({ ok: true, koad: true, skickades: false });
  });
  it("redan godkänd, redan skickad och företagsledare nekas (409) utan att köa eller köra flushen", async () => {
    h.tabeller.loneunderlag = [{ medarbetare_id: "a", period: "2026-09", status: "godkand_av_forare" }];
    expect((await anropa({ medarbetare_id: "a", arbetsmanad: "2026-09" })).status).toBe(409);
    h.tabeller.loneunderlag = [];
    h.tabeller.fortnox_export_logg = [{ medarbetare_id: "a", period: "2026-10", status: "skickat" }];
    expect((await anropa({ medarbetare_id: "a", arbetsmanad: "2026-09" })).status).toBe(409);
    expect((await anropa({ medarbetare_id: "l", arbetsmanad: "2026-09" })).status).toBe(409);
    expect(h.skrivet).toEqual([]);
    expect(h.fetchade).toEqual([]);
  });
});
