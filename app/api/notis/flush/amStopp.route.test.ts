/**
 * /api/notis/flush för "Maskinen ska stå" (am_stopp). Raderna köas av triggern kö_am_stopp (provad i prod i en körning som
 * rullades tillbaka). Här: rätt text och länk, åtgärdad/borttagen före utskicket → ingen push, läsfel → oskickad.
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

const MARTIN = "m-martin", JOACIM = "m-joacim", STEFAN = "m-stefan";
const kor = async () => {
  const r = await GET(new NextRequest("http://x/api/notis/flush", { headers: { authorization: "Bearer hemlig" } }));
  return r.json();
};
const koRad = (id: string) => h.state.notis_kö.find(r => r.id === id)!;
const koa = (id: string, mottagare: string, skapad = new Date(Date.now() - 60_000).toISOString()) =>
  h.state.notis_kö.push({ id, typ: "am_stopp", mottagare_id: mottagare, payload: { atgard_id: "a1" }, skickas_at: "infinity", skapad_at: skapad, skickad_at: null, fel_meddelande: null, datum: null });

beforeEach(() => {
  h.lasfelAtgard = false;
  h.skickat = [];
  h.sendBeteende = () => {};
  h.state = {
    medarbetare: [
      { id: MARTIN, namn: "Martin Lindqvist", push_aktiv: true, daglig_pamin_aktiv: true },
      { id: JOACIM, namn: "Joacim Ringberg", push_aktiv: true, daglig_pamin_aktiv: true },
      { id: STEFAN, namn: "Stefan Nilsson", push_aktiv: true, daglig_pamin_aktiv: true },
    ],
    push_subscriptions: [
      { id: "s1", medarbetare_id: MARTIN, subscription: { endpoint: "martin-telefon" } },
      { id: "s2", medarbetare_id: JOACIM, subscription: { endpoint: "joacim-telefon" } },
    ],
    dim_maskin: [{ maskin_id: "PONS", visningsnamn: "Giant", modell: "Scorpion" }],
    am_atgard: [{ id: "a1", status: "oppen", stopp: true, beskrivning: "Nödstoppet stannar inte motorn", maskin_id: "PONS", rapporterad_av: null, svar: { koll: { medarbetare_id: STEFAN } } }],
    notis_kö: [],
  };
});

describe("flush — am_stopp", () => {
  it("maskinen och felet i texten, förarens förnamn, länk som öppnar åtgärden", async () => {
    koa("k1", MARTIN); koa("k2", JOACIM);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 2, skippade: 0, uppskjutna: 0, fel: 0 });
    expect(h.skickat.map(s => s.endpoint).sort()).toEqual(["joacim-telefon", "martin-telefon"]);
    expect(h.skickat[0].payload).toMatchObject({ title: "Giant ska stå", body: "Nödstoppet stannar inte motorn · Stefan", url: "/atgarder?id=a1", tag: "am-stopp-a1" });
  });

  it("åtgärdad före utskicket → ingen push", async () => {
    h.state.am_atgard[0].status = "klar";
    koa("k1", MARTIN);
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — åtgärden är redan åtgärdad");
  });

  it("borta (föraren ändrade Nej till Ja) → ingen push", async () => {
    h.state.am_atgard = [];
    koa("k1", MARTIN);
    expect(await kor()).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
  });

  it("läsfel lämnar raden oskickad, nästa körning skickar", async () => {
    h.lasfelAtgard = true;
    koa("k1", MARTIN);
    expect(await kor()).toMatchObject({ skickade: 0, uppskjutna: 1 });
    expect(koRad("k1").skickad_at).toBeNull();
    h.lasfelAtgard = false;
    expect(await kor()).toMatchObject({ skickade: 1 });
  });

  it("den gamla flushen tar aldrig raden", async () => {
    const { flushUrval } = await import("@/lib/ledighet/notis");
    expect(flushUrval(new Date().toISOString())).not.toContain("am_stopp");
  });
});
