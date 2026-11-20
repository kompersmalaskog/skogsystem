/**
 * /api/notis/flush för lönenotiserna (lon_granska, lon_paminnelse, lon_andrad): "Granska din september – lönen skickas när du godkänt".
 *
 * Databasen och web-push är fejk. Köaren (lib/lonesystem/granskaNotis) och triggern (SQL-testet i supabase/tests/lon_godkannande_lokal) är provade
 * för sig; här bevisas att det som ligger i kön (skickas_at 'infinity') tas av flushen, blir rätt push till rätt person, att en redan godkänd eller
 * skickad månad inte pushas, att företagsledare aldrig får en lönenotis och att ett läsfel lämnar raden oskickad.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Rad = Record<string, any>;
const h = vi.hoisted(() => ({
  state: {} as Record<string, Rad[]>,
  lasfelLass: false,
  skickat: [] as { endpoint: string; payload: any }[],
  sendBeteende: (_endpoint: string): void => {},
}));

vi.mock("@/lib/auth/server", () => ({ kravRoll: async () => ({ ok: false, res: new Response("", { status: 401 }) }), ADMIN_ROLLER: ["admin"] }));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: any, payload: string) => {
      h.sendBeteende(sub.endpoint);
      h.skickat.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    },
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
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
        if (tabell === "loneunderlag" && h.lasfelLass) return { data: null, error: { message: "connection reset" } };
        return { data: enkel ? traffar[0] ?? null : traffar, error: null };
      };
      const api: any = {
        select: () => api,
        update: (p: Rad) => { op = "update"; patch = p; return api; },
        delete: () => { op = "delete"; return api; },
        eq: (c: string, v: any) => { filter.push(r => r[c] === v); return api; },
        in: (c: string, vs: any[]) => { filter.push(r => vs.includes(r[c])); return api; },
        lte: (c: string, v: any) => { filter.push(r => r[c] <= v); return api; },
        or: (uttryck: string) => {
          const delar: string[] = []; let djup = 0, start = 0;
          for (let i = 0; i < uttryck.length; i++) {
            if (uttryck[i] === "(") djup++; else if (uttryck[i] === ")") djup--;
            else if (uttryck[i] === "," && djup === 0) { delar.push(uttryck.slice(start, i)); start = i + 1; }
          }
          delar.push(uttryck.slice(start));
          const villkor = delar.map(d => {
            const [kol, op, ...rest] = d.split("."); const varde = rest.join(".");
            if (op === "lte") return (r: Rad) => r[kol] <= varde;
            if (op === "in") { const lista = varde.replace(/^\(|\)$/g, "").split(","); return (r: Rad) => lista.includes(r[kol]); }
            throw new Error("fejken kan inte tolka or-delen: " + d);
          });
          filter.push(r => villkor.some(v => v(r)));
          return api;
        },
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

const ANNA = "m-anna", LEDARE = "m-ledare";
const kor = async () => {
  const r = await GET(new NextRequest("http://x/api/notis/flush", { headers: { authorization: "Bearer hemlig" } }));
  return r.json();
};
const koRad = (id: string) => h.state.notis_kö.find(r => r.id === id)!;
const MIN = 60 * 1000;
const fore = (ms: number) => new Date(Date.now() - ms).toISOString();
const koa = (id: string, mottagare: string, typ = "lon_granska", arbetsmanad = "2026-09", skapad = fore(MIN)) =>
  h.state.notis_kö.push({ id, typ, mottagare_id: mottagare, payload: { arbetsmanad }, skickas_at: "infinity", skapad_at: skapad, skickad_at: null, fel_meddelande: null, datum: null });

beforeEach(() => {
  h.lasfelLass = false;
  h.skickat = [];
  h.sendBeteende = () => {};
  h.state = {
    medarbetare: [
      { id: ANNA, push_aktiv: true, daglig_pamin_aktiv: true, foretagsledare: false },
      { id: LEDARE, push_aktiv: true, daglig_pamin_aktiv: true, foretagsledare: true },
    ],
    push_subscriptions: [
      { id: "s1", medarbetare_id: ANNA, subscription: { endpoint: "annas-telefon" } },
      { id: "s2", medarbetare_id: LEDARE, subscription: { endpoint: "ledarens-telefon" } },
    ],
    loneunderlag: [],
    fortnox_export_logg: [],
    notis_kö: [],
  };
});

describe("flush — lönenotiserna", () => {
  it("tas av flushen trots skickas_at 'infinity' och blir rätt push: titel Lön, arbetsmånadens namn, länk till Lön-fliken", async () => {
    koa("k1", ANNA);
    const res = await kor();
    expect(res).toMatchObject({ totalt: 1, skickade: 1, skippade: 0, uppskjutna: 0, fel: 0 });
    expect(h.skickat).toEqual([{ endpoint: "annas-telefon", payload: expect.objectContaining({ title: "Lön", body: "Granska din september – lönen skickas när du godkänt", url: "/arbetsrapport?steg=lon&manad=2026-09" }) }]);
    expect(koRad("k1").skickad_at).not.toBeNull();
  });

  it("påminnelsen och 'ändrad efter godkännande' har egen text", async () => {
    koa("k1", ANNA, "lon_paminnelse");
    koa("k2", ANNA, "lon_andrad");
    await kor();
    expect(h.skickat.map(s => s.payload.body)).toEqual([
      "Du har inte godkänt din september än – lönen skickas när du godkänt",
      "Din september ändrades efter ditt godkännande – granska och godkänn igen",
    ]);
  });

  it("redan godkänd (även äldre status 'inskickat') → ingen push; raden markeras med orsak", async () => {
    for (const status of ["godkand_av_forare", "inskickat"]) {
      h.skickat = []; h.state.notis_kö = []; h.state.loneunderlag = [{ medarbetare_id: ANNA, period: "2026-09", status }];
      koa("k1", ANNA);
      const res = await kor();
      expect(res).toMatchObject({ skickade: 0, skippade: 1 });
      expect(h.skickat, status).toEqual([]);
      expect(koRad("k1").fel_meddelande).toMatch(/redan godkänd/);
    }
  });

  it("NULL-status (nollställt av en ändring) räknas som ej godkänd → pushen går", async () => {
    h.state.loneunderlag = [{ medarbetare_id: ANNA, period: "2026-09", status: null }];
    koa("k1", ANNA, "lon_andrad");
    expect(await kor()).toMatchObject({ skickade: 1 });
  });

  it("godkännande av en ANNAN månad hindrar inte", async () => {
    h.state.loneunderlag = [{ medarbetare_id: ANNA, period: "2026-08", status: "godkand_av_forare" }];
    koa("k1", ANNA);
    expect(await kor()).toMatchObject({ skickade: 1 });
  });

  it("redan skickad till Fortnox (löneperioden = arbetsmånad + 1) → ingen push", async () => {
    h.state.fortnox_export_logg = [{ medarbetare_id: ANNA, period: "2026-10", status: "skickat" }];
    koa("k1", ANNA);
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(koRad("k1").fel_meddelande).toMatch(/skickad till Fortnox/);
  });

  it("företagsledare får aldrig en lönenotis, även om en rad köats", async () => {
    koa("k1", LEDARE);
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toEqual([]);
    expect(koRad("k1").fel_meddelande).toMatch(/företagsledare/i);
  });

  it("köad för mer än 24 timmar sedan skickas aldrig", async () => {
    koa("k1", ANNA, "lon_granska", "2026-09", fore(25 * 60 * MIN));
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(koRad("k1").fel_meddelande).toMatch(/för gammal/);
  });

  it("ett LÄSFEL lämnar raden oskickad (nästa cron försöker igen) — inte 'finns inte'", async () => {
    h.lasfelLass = true;
    koa("k1", ANNA);
    expect(await kor()).toMatchObject({ skickade: 0, uppskjutna: 1 });
    expect(koRad("k1").skickad_at).toBeNull();
  });

  it("push avstängd hos mottagaren respekteras", async () => {
    h.state.medarbetare[0].push_aktiv = false;
    koa("k1", ANNA);
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
  });
});
