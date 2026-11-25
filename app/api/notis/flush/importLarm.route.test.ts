/**
 * /api/notis/flush för importlarmet (import_larm / import_ok). Raderna köas av databasen (pg_cron-jobbet 'import-larm' →
 * import_larm_kontroll()) med skickas_at = now() och payload { rubrik, titel, text, body, url }. Här: titel, text och länk
 * tas ur payloaden som de står, för gammal → ingen push, och raden tas också om den köats med skickas_at = 'infinity'.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Rad = Record<string, any>;
const h = vi.hoisted(() => ({
  state: {} as Record<string, Rad[]>,
  lasfelLass: false,
  lasfelAtgard: false,
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
        if (tabell === "am_atgard" && h.lasfelAtgard) return { data: null, error: { message: "connection reset" } };
        if (tabell === "lastbil_lass" && h.lasfelLass) return { data: null, error: { message: "connection reset" } };
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

const MARTIN = "m-martin", JOACIM = "m-joacim";
const kor = async () => {
  const r = await GET(new NextRequest("http://x/api/notis/flush", { headers: { authorization: "Bearer hemlig" } }));
  return r.json();
};
const koRad = (id: string) => h.state.notis_kö.find(r => r.id === id)!;
// Payloaden som databasen köade 2026-11-25 (testlarmet), ordagrant.
const PAYLOAD = { url: "/datahalsa", body: "Testlarm – ingen åtgärd behövs.", text: "Testlarm – ingen åtgärd behövs.", titel: "Importen felar (TEST)", rubrik: "Importen felar (TEST)" };
const koa = (id: string, mottagare: string, extra: Rad = {}) =>
  h.state.notis_kö.push({
    id, typ: "import_larm", mottagare_id: mottagare, payload: PAYLOAD, datum: null, skickad_at: null, fel_meddelande: null,
    skickas_at: new Date(Date.now() - 60_000).toISOString(), skapad_at: new Date(Date.now() - 60_000).toISOString(), ...extra,
  });

beforeEach(() => {
  h.skickat = [];
  h.sendBeteende = () => {};
  h.state = {
    medarbetare: [
      { id: MARTIN, namn: "Martin Lindqvist", push_aktiv: true, daglig_pamin_aktiv: true },
      { id: JOACIM, namn: "Joacim Ringberg", push_aktiv: true, daglig_pamin_aktiv: true },
    ],
    push_subscriptions: [
      { id: "s1", medarbetare_id: MARTIN, subscription: { endpoint: "martin-telefon" } },
      { id: "s2", medarbetare_id: JOACIM, subscription: { endpoint: "joacim-telefon" } },
    ],
    notis_kö: [],
  };
});

describe("flush — import_larm / import_ok", () => {
  it("titel = payload.rubrik, text = payload.text, ett tryck öppnar payload.url — till varje admin", async () => {
    koa("k1", MARTIN); koa("k2", JOACIM);
    expect(await kor()).toMatchObject({ skickade: 2, skippade: 0, uppskjutna: 0, fel: 0 });
    expect(h.skickat.map(s => s.endpoint).sort()).toEqual(["joacim-telefon", "martin-telefon"]);
    expect(h.skickat[0].payload).toEqual({ title: "Importen felar (TEST)", body: "Testlarm – ingen åtgärd behövs.", url: "/datahalsa", tag: "import-larm" });
    expect(koRad("k1").skickad_at).not.toBeNull();
    expect(koRad("k1").fel_meddelande).toBeNull();
  });

  it("import_ok skickas på samma sätt", async () => {
    koa("k1", MARTIN, { typ: "import_ok", payload: { rubrik: "Importen fungerar igen", text: "Senaste fil 10:26", url: "/datahalsa" } });
    expect(await kor()).toMatchObject({ skickade: 1 });
    expect(h.skickat[0].payload).toMatchObject({ title: "Importen fungerar igen", body: "Senaste fil 10:26", url: "/datahalsa" });
  });

  it("aldrig den generiska reserven: ingen 'Notis', ingen rå JSON, ingen länk till /admin", async () => {
    koa("k1", MARTIN);
    await kor();
    const p = h.skickat[0].payload;
    expect(p.title).not.toBe("Notis");
    expect(p.body).not.toContain("{");
    expect(p.url).not.toBe("/admin");
  });

  it("en länk ut ur appen öppnas aldrig — /datahalsa i stället", async () => {
    koa("k1", MARTIN, { payload: { ...PAYLOAD, url: "https://annan.sajt/x" } });
    await kor();
    expect(h.skickat[0].payload.url).toBe("/datahalsa");
  });

  it("köad för mer än 24 timmar sedan → ingen push, raden märks", async () => {
    koa("k1", MARTIN, { skapad_at: new Date(Date.now() - 25 * 3600_000).toISOString() });
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — för gammal (köad för mer än 24 timmar sedan)");
  });

  it("tas även när databasen köar med skickas_at = 'infinity'", async () => {
    koa("k1", MARTIN, { skickas_at: "infinity" });
    koa("k2", MARTIN, { typ: "import_ok", skickas_at: "infinity" });
    expect(await kor()).toMatchObject({ skickade: 2 });
  });

  it("push avstängd i medarbetarens inställningar → ingen push (samma regel som alla typer)", async () => {
    h.state.medarbetare[0].push_aktiv = false;
    koa("k1", MARTIN);
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
  });
});
