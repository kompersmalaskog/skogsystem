/**
 * /api/notis/flush för en notistyp som koden INTE känner till. Förut skickades den som "Notis" med rå JSON och länken
 * /admin — så nådde en notistyp föraren om den köades innan koden för den var släppt (importlarmet 2026-11-25).
 * Nu: ingen push, raden markeras hanterad med orsaken, och kända typer i samma körning skickas som vanligt.
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
import { GET, byggMeddelande } from "./route";

const MARTIN = "m-martin";
const kor = async () => {
  const r = await GET(new NextRequest("http://x/api/notis/flush", { headers: { authorization: "Bearer hemlig" } }));
  return r.json();
};
const koRad = (id: string) => h.state.notis_kö.find(r => r.id === id)!;
const koa = (id: string, typ: string, payload: Rad = {}) =>
  h.state.notis_kö.push({
    id, typ, mottagare_id: MARTIN, payload, datum: null, skickad_at: null, fel_meddelande: null,
    skickas_at: new Date(Date.now() - 60_000).toISOString(), skapad_at: new Date(Date.now() - 60_000).toISOString(),
  });

beforeEach(() => {
  h.skickat = [];
  h.sendBeteende = () => {};
  h.state = {
    medarbetare: [{ id: MARTIN, namn: "Martin Lindqvist", push_aktiv: true, daglig_pamin_aktiv: true }],
    push_subscriptions: [{ id: "s1", medarbetare_id: MARTIN, subscription: { endpoint: "martin-telefon" } }],
    notis_kö: [],
  };
});

describe("flush — okänd notistyp", () => {
  it("skickas inte: ingen push, raden markeras hanterad med orsaken", async () => {
    koa("k1", "ny_typ_som_inte_finns", { hemlig: "rad", id: 42 });
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1, fel: 0 });
    expect(h.skickat).toHaveLength(0);
    expect(koRad("k1").skickad_at).not.toBeNull();
    expect(koRad("k1").fel_meddelande).toBe('Ej skickad — okänd notistyp "ny_typ_som_inte_finns"');
  });

  it("en körning till skickar den inte heller (raden ligger inte kvar i kön)", async () => {
    koa("k1", "ny_typ_som_inte_finns");
    await kor(); await kor();
    expect(h.skickat).toHaveLength(0);
  });

  it("en känd typ i samma körning skickas som vanligt", async () => {
    koa("k1", "ny_typ_som_inte_finns");
    koa("k2", "import_larm", { rubrik: "Importen felar", text: "Ingen fil på 2 timmar", url: "/datahalsa" });
    expect(await kor()).toMatchObject({ skickade: 1, skippade: 1 });
    expect(h.skickat).toHaveLength(1);
    expect(h.skickat[0].payload.title).toBe("Importen felar");
  });

  it("ingen push någonsin har titeln 'Notis' eller rå JSON", async () => {
    for (const t of ["x", "notis", "", "atk_aterstalld_stavfel"]) koa("k-" + t, t, { a: 1 });
    await kor();
    expect(h.skickat).toHaveLength(0);
  });
});

describe("byggMeddelande", () => {
  it("returnerar null för en okänd typ (ingen generisk reserv)", async () => {
    expect(await byggMeddelande({ typ: "okand", payload: { a: 1 } })).toBeNull();
  });
  it("källan innehåller inte längre den generiska 'Notis'-reserven", async () => {
    const fs = await import("node:fs");
    const kalla = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(kalla).not.toMatch(/title:\s*"Notis"/);
    expect(kalla).not.toMatch(/JSON\.stringify\(n\.payload/);
  });
});
