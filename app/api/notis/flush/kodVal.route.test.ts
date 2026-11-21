/**
 * /api/notis/flush för "Välj din kod för <maskin>" (maskin_kod_val). Notisen går BARA till personens telefoner: en push-prenumeration som hör till
 * en maskindator (push_subscriptions.maskin_id satt) får den aldrig. Saknar personen telefonprenumeration skickas ingenting (arket visar då reservtexten).
 * Andra notistyper rörs inte — de går fortfarande till alla personens prenumerationer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Rad = Record<string, any>;
const h = vi.hoisted(() => ({
  state: {} as Record<string, Rad[]>,
  skickat: [] as { endpoint: string; payload: any }[],
}));

vi.mock("@/lib/auth/server", () => ({ kravRoll: async () => ({ ok: false, res: new Response("", { status: 401 }) }), ADMIN_ROLLER: ["admin"] }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: any, payload: string) => { h.skickat.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); },
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async () => ({ data: null, error: null }),
    from(tabell: string) {
      const filter: ((r: Rad) => boolean)[] = [];
      let op: "select" | "update" | "delete" = "select";
      let patch: Rad = {};
      let enkel = false;
      const kor = () => {
        const alla = h.state[tabell] ?? [];
        const traffar = alla.filter(r => filter.every(f => f(r)));
        if (op === "update") { traffar.forEach(r => Object.assign(r, patch)); return { data: null, error: null }; }
        if (op === "delete") { h.state[tabell] = alla.filter(r => !traffar.includes(r)); return { data: null, error: null }; }
        return { data: enkel ? traffar[0] ?? null : traffar, error: null };
      };
      const api: any = {
        select: () => api,
        update: (p: Rad) => { op = "update"; patch = p; return api; },
        delete: () => { op = "delete"; return api; },
        eq: (c: string, v: any) => { filter.push(r => r[c] === v); return api; },
        in: (c: string, vs: any[]) => { filter.push(r => vs.includes(r[c])); return api; },
        lte: (c: string, v: any) => { filter.push(r => r[c] <= v); return api; },
        gte: (c: string, v: any) => { filter.push(r => r[c] >= v); return api; },
        gt: (c: string, v: any) => { filter.push(r => r[c] > v); return api; },
        lt: (c: string, v: any) => { filter.push(r => r[c] < v); return api; },
        neq: (c: string, v: any) => { filter.push(r => r[c] !== v); return api; },
        order: () => api,
        not: () => api,
        or: () => api,
        is: (c: string, v: any) => { filter.push(r => (r[c] ?? null) === v); return api; },
        limit: () => api,
        maybeSingle: () => { enkel = true; return api; },
        then: (res: any, rej: any) => Promise.resolve(kor()).then(res, rej),
      };
      return api;
    },
  }),
}));

process.env.CRON_SECRET = "hemlig";
process.env.VAPID_PRIVATE_KEY = "fake-test-nyckel";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";

import { NextRequest } from "next/server";
import { GET } from "./route";

const DANIEL = "m-daniel", MARTIN = "m-martin";
const kor = async () => (await GET(new NextRequest("http://x/api/notis/flush", { headers: { authorization: "Bearer hemlig" } }))).json();
const koRad = (id: string) => h.state.notis_kö.find(r => r.id === id)!;
const koaKodVal = (id: string, mottagare = DANIEL) =>
  h.state.notis_kö.push({ id, typ: "maskin_kod_val", mottagare_id: mottagare, payload: { maskin_namn: "H8E -26" }, skickas_at: "infinity", skapad_at: new Date(Date.now() - 5_000).toISOString(), skickad_at: null, fel_meddelande: null, datum: null });

beforeEach(() => {
  h.skickat = [];
  h.state = {
    medarbetare: [
      { id: DANIEL, namn: "Daniel", push_aktiv: true, daglig_pamin_aktiv: true },
      { id: MARTIN, namn: "Martin", push_aktiv: true, daglig_pamin_aktiv: true },
    ],
    push_subscriptions: [
      { id: "s-tel", medarbetare_id: DANIEL, maskin_id: null, subscription: { endpoint: "daniel-telefon" } },
      { id: "s-tel2", medarbetare_id: DANIEL, subscription: { endpoint: "daniel-ipad" } },            // äldre rad utan kolumnvärde = telefon/egen enhet
      { id: "s-h8", medarbetare_id: DANIEL, maskin_id: "R64428", subscription: { endpoint: "h8-dator" } },
      { id: "s-elefant", medarbetare_id: DANIEL, maskin_id: "A130743", subscription: { endpoint: "elefant-dator" } },
      { id: "m-tel", medarbetare_id: MARTIN, maskin_id: null, subscription: { endpoint: "martin-telefon" } },
      { id: "m-h8", medarbetare_id: MARTIN, maskin_id: "R64428", subscription: { endpoint: "martin-h8" } },
    ],
    forare_maskinkod: [],
    notis_kö: [],
  };
});

describe("flush — maskin_kod_val (Välj din kod)", () => {
  it("går bara till personens telefoner — aldrig till en prenumeration som hör till en maskindator", async () => {
    koaKodVal("k1");
    const res = await kor();
    expect(res).toMatchObject({ skickade: 1, fel: 0 });
    expect(h.skickat.map(s => s.endpoint).sort()).toEqual(["daniel-ipad", "daniel-telefon"]);
    expect(h.skickat.map(s => s.endpoint)).not.toContain("h8-dator");
    expect(h.skickat.map(s => s.endpoint)).not.toContain("elefant-dator");
    expect(h.skickat.map(s => s.endpoint)).not.toContain("martin-telefon");                        // och inte till någon annan person
    expect(h.skickat[0].payload).toMatchObject({ title: "Välj din kod för H8E -26", url: "/?kod=1" });
  });

  it("personen har bara maskindatorer → ingenting skickas (reservtexten visas i arket), raden stängs med förklaring", async () => {
    h.state.push_subscriptions = h.state.push_subscriptions.filter(r => r.maskin_id);
    koaKodVal("k1");
    const res = await kor();
    expect(h.skickat).toHaveLength(0);
    expect(res).toMatchObject({ skickade: 0, fel: 1 });
    expect(koRad("k1").fel_meddelande).toBe("Mottagaren har inga push-prenumerationer");
  });

  it("har personen redan valt sin kod skickas ingen notis alls", async () => {
    h.state.forare_maskinkod = [{ medarbetare_id: DANIEL }];
    koaKodVal("k1");
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
  });

  it("filtret gäller bara den här notisen: andra notistyper går fortfarande till alla personens prenumerationer", async () => {
    h.state.notis_kö.push({ id: "k9", typ: "maskin_kod_spar", mottagare_id: DANIEL, payload: { namn: "Oskar", maskin_namn: "H8E -26", medarbetare_id: "x", till: "t" }, skickas_at: "infinity", skapad_at: new Date(Date.now() - 5_000).toISOString(), skickad_at: null, fel_meddelande: null, datum: null });
    await kor();
    expect(h.skickat.map(s => s.endpoint).sort()).toEqual(["daniel-ipad", "daniel-telefon", "elefant-dator", "h8-dator"]);
  });
});
