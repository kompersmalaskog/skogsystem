/**
 * /api/notis/flush för ledighetsnotiserna (ledighet_ansokan, ledighet_beslut).
 *
 * Databasen och web-push är fejk (ingen nätverkstrafik, ingen .env.local). Triggern som KÖAR raderna bevisas
 * i rollback-körningen mot produktionsdatabasen (se PR-texten); här bevisas att det som ligger i kön blir rätt
 * push till rätt person, och att ett fel aldrig stoppar de andra raderna.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Rad = Record<string, any>;
const h = vi.hoisted(() => ({
  state: {} as Record<string, Rad[]>,
  lasfelLedighet: false,
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
        if (tabell === "ledighet_ansokningar" && h.lasfelLedighet) return { data: null, error: { message: "connection reset" } };
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
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";

import { NextRequest } from "next/server";
import { GET } from "./route";

const MARTIN = "m-martin", JOACIM = "m-joacim", ANNA = "m-anna";
const kor = async () => {
  const r = await GET(new NextRequest("http://x/api/notis/flush", { headers: { authorization: "Bearer hemlig" } }));
  return r.json();
};
const koRad = (id: string) => h.state.notis_kö.find(r => r.id === id)!;
const nu = () => new Date(Date.now() - 1000).toISOString();

beforeEach(() => {
  h.lasfelLedighet = false;
  h.skickat = [];
  h.sendBeteende = () => {};
  h.state = {
    medarbetare: [
      { id: MARTIN, push_aktiv: true, daglig_pamin_aktiv: true },
      { id: JOACIM, push_aktiv: true, daglig_pamin_aktiv: true },
      { id: ANNA, push_aktiv: true, daglig_pamin_aktiv: true },
    ],
    push_subscriptions: [
      { id: "s1", medarbetare_id: MARTIN, subscription: { endpoint: "martin-telefon" } },
      { id: "s2", medarbetare_id: MARTIN, subscription: { endpoint: "martin-dator" } },
      { id: "s3", medarbetare_id: JOACIM, subscription: { endpoint: "joacim-telefon" } },
      { id: "s4", medarbetare_id: ANNA, subscription: { endpoint: "anna-telefon" } },
    ],
    ledighet_ansokningar: [
      { id: "a1", status: "väntar", startdatum: "2026-11-03", slutdatum: "2026-11-07", medarbetare: { namn: "Anna Svensson" } },
    ],
    notis_kö: [],
  };
});

const MIN = 60 * 1000, TIM = 60 * MIN;
const fore = (ms: number) => new Date(Date.now() - ms).toISOString();
// Som triggern: ledighetsrader köas med skickas_at 'infinity' (den GAMLA flushen väljer dem då aldrig) och färsk skapad_at.
const koa = (id: string, typ: string, mottagare: string, ansokan = "a1", skapad = fore(MIN)) =>
  h.state.notis_kö.push({ id, typ, mottagare_id: mottagare, payload: { ansokan_id: ansokan }, skickas_at: "infinity", skapad_at: skapad, skickad_at: null, fel_meddelande: null, datum: null });

describe("flush — ledighet_ansokan till godkännarna", () => {
  it("varje admin får '{Förnamn} har ansökt om ledighet {period}' på ALLA sina enheter, och öppnar godkänn-vyn", async () => {
    koa("k1", "ledighet_ansokan", MARTIN);
    koa("k2", "ledighet_ansokan", JOACIM);
    const res = await kor();
    expect(res).toMatchObject({ totalt: 2, skickade: 2, skippade: 0, uppskjutna: 0, fel: 0 });
    expect(h.skickat.map(s => s.endpoint).sort()).toEqual(["joacim-telefon", "martin-dator", "martin-telefon"]);
    for (const s of h.skickat) {
      expect(s.payload).toMatchObject({ title: "Ledighet", body: "Anna har ansökt om ledighet 3 – 7 november", url: "/ledighet?godkann=a1" });
    }
    // ansökaren (Anna) fick ingen notis om sin egen ansökan
    expect(h.skickat.some(s => s.endpoint === "anna-telefon")).toBe(false);
    expect(koRad("k1").skickad_at).toBeTruthy();
    expect(koRad("k1").fel_meddelande).toBeNull();
  });

  it("ansökan hann godkännas innan utskicket → ingen push, raden markeras hanterad med orsak", async () => {
    h.state.ledighet_ansokningar[0].status = "godkänd";
    koa("k1", "ledighet_ansokan", MARTIN);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
    expect(koRad("k1").skickad_at).toBeTruthy();
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — ansökan var redan hanterad");
  });
});

describe("flush — ledighet_beslut till ägaren", () => {
  it("bara ägaren får 'Din ledighet … är godkänd' — inte admin", async () => {
    h.state.ledighet_ansokningar[0].status = "godkänd";
    koa("k1", "ledighet_beslut", ANNA);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 1 });
    expect(h.skickat).toHaveLength(1);
    expect(h.skickat[0].endpoint).toBe("anna-telefon");
    expect(h.skickat[0].payload).toMatchObject({ title: "Ledighet", body: "Din ledighet 3 – 7 november är godkänd", url: "/ledighet?besked=a1" });
  });

  it("nekad: '… är nekad'", async () => {
    h.state.ledighet_ansokningar[0].status = "nekad";
    koa("k1", "ledighet_beslut", ANNA);
    await kor();
    expect(h.skickat[0].payload.body).toBe("Din ledighet 3 – 7 november är nekad");
  });

  it("ansökan borttagen före utskicket → ingen push", async () => {
    h.state.ledighet_ansokningar = [];
    koa("k1", "ledighet_beslut", ANNA);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — ansökan finns inte kvar");
  });
});

describe("flush — fel stoppar aldrig övriga rader", () => {
  it("LÄSFEL mot ansökan är inte 'finns inte': raden ligger kvar OSKICKAD för nästa cron, och den andra raden går ändå", async () => {
    h.state.ledighet_ansokningar[0].status = "godkänd";
    koa("k1", "ledighet_beslut", ANNA);
    h.lasfelLedighet = true;
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, uppskjutna: 1 });
    expect(koRad("k1").skickad_at).toBeNull();
    expect(h.skickat).toHaveLength(0);
    // nästa körning, när läsningen fungerar igen: skickas
    h.lasfelLedighet = false;
    expect(await kor()).toMatchObject({ skickade: 1 });
    expect(koRad("k1").skickad_at).toBeTruthy();
  });

  it("en död enhet (410) städas bort men de andra enheterna får notisen, och raden räknas som skickad", async () => {
    koa("k1", "ledighet_ansokan", MARTIN);
    h.sendBeteende = endpoint => { if (endpoint === "martin-telefon") throw Object.assign(new Error("gone"), { statusCode: 410 }); };
    const res = await kor();
    expect(res).toMatchObject({ skickade: 1, fel: 0 });
    expect(h.skickat.map(s => s.endpoint)).toEqual(["martin-dator"]);
    expect(h.state.push_subscriptions.some(s => s.id === "s1")).toBe(false);
    expect(koRad("k1").fel_meddelande).toBeNull();
  });

  it("pushen kastar (500) för alla enheter → raden får felorsak, flush kraschar inte och nästa rad skickas", async () => {
    koa("k1", "ledighet_ansokan", MARTIN);
    koa("k2", "ledighet_ansokan", JOACIM);
    h.sendBeteende = endpoint => { if (endpoint.startsWith("martin")) throw Object.assign(new Error("boom"), { statusCode: 500 }); };
    const res = await kor();
    expect(res).toMatchObject({ skickade: 1, fel: 1 });
    expect(koRad("k1").fel_meddelande).toContain("Ingen enhet nådde fram");
    expect(h.skickat.map(s => s.endpoint)).toEqual(["joacim-telefon"]);
  });
});

describe("flush — kanalens befintliga skydd gäller även ledighet", () => {
  it("push avstängd i medarbetarens inställningar → ingen notis", async () => {
    h.state.medarbetare.find(m => m.id === MARTIN)!.push_aktiv = false;
    koa("k1", "ledighet_ansokan", MARTIN);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
    expect(koRad("k1").fel_meddelande).toMatch(/push avstängd/);
  });

  it("mottagare utan prenumeration → loggas, inget kast", async () => {
    h.state.push_subscriptions = [];
    koa("k1", "ledighet_beslut", ANNA);
    h.state.ledighet_ansokningar[0].status = "nekad";
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, fel: 1 });
    expect(koRad("k1").fel_meddelande).toBe("Mottagaren har inga push-prenumerationer");
  });
});

describe("flush — urvalet: ledighetsrader med skickas_at 'infinity' tas, övriga typer som förut", () => {
  it("en ledighetsrad med skickas_at 'infinity' skickas (det är så triggern köar den)", async () => {
    koa("k1", "ledighet_ansokan", MARTIN);
    expect(koRad("k1").skickas_at).toBe("infinity");
    expect(await kor()).toMatchObject({ totalt: 1, skickade: 1 });
  });

  it("andra typer påverkas inte: förfallen rad skickas, rad som inte förfallit (framtid) eller 'infinity' skickas INTE", async () => {
    const annan = (id: string, skickas: string) =>
      h.state.notis_kö.push({ id, typ: "annan_typ", mottagare_id: MARTIN, payload: { x: 1 }, skickas_at: skickas, skapad_at: fore(MIN), skickad_at: null, fel_meddelande: null, datum: null });
    annan("f1", fore(MIN));                                  // förfallen → skickas som förut (generisk fallback)
    annan("f2", new Date(Date.now() + TIM).toISOString());   // framtid → ligger kvar
    annan("f3", "infinity");                                 // 'infinity' på en annan typ → ligger kvar (bara ledighet tas oavsett tid)
    const res = await kor();
    expect(res).toMatchObject({ totalt: 1, skickade: 1 });
    expect(koRad("f1").skickad_at).toBeTruthy();
    expect(koRad("f2").skickad_at).toBeNull();
    expect(koRad("f3").skickad_at).toBeNull();
  });

  it("redan skickade ledighetsrader tas inte igen", async () => {
    koa("k1", "ledighet_ansokan", MARTIN);
    h.state.notis_kö[0].skickad_at = fore(MIN);
    expect(await kor()).toMatchObject({ totalt: 0, skickade: 0 });
    expect(h.skickat).toHaveLength(0);
  });
});

describe("flush — åldersregeln: en hög som väntat på release skickas aldrig på en gång", () => {
  it("köad för mer än 24 h sedan → hoppas över med orsak, ingen push; färska rader i samma körning skickas", async () => {
    h.state.ledighet_ansokningar.push({ id: "a2", status: "väntar", startdatum: "2026-12-01", slutdatum: "2026-12-01", medarbetare: { namn: "Bo Karlsson" } });
    koa("gammal", "ledighet_ansokan", MARTIN, "a1", fore(25 * TIM));
    koa("farsk", "ledighet_ansokan", MARTIN, "a2", fore(23 * TIM));
    const res = await kor();
    expect(res).toMatchObject({ totalt: 2, skickade: 1, skippade: 1 });
    expect(koRad("gammal").fel_meddelande).toBe("Ej skickad — för gammal (köad för mer än 24 timmar sedan)");
    expect(koRad("gammal").skickad_at).toBeTruthy(); // hanterad: tas inte om igen
    // en push per enhet (Martin har två) — men bara den FÄRSKA ansökans text, aldrig den gamla (Annas)
    expect(Array.from(new Set(h.skickat.map(s => s.payload.body)))).toEqual(["Bo har ansökt om ledighet 1 december"]);
    expect(h.skickat).toHaveLength(2);
  });

  it("en hel hög (sju gamla beslut + ett färskt) → bara det färska skickas", async () => {
    h.state.ledighet_ansokningar[0].status = "godkänd";
    for (let i = 0; i < 7; i++) koa("g" + i, "ledighet_beslut", ANNA, "a1", fore((30 + i) * TIM));
    koa("ny", "ledighet_beslut", ANNA, "a1", fore(5 * MIN));
    const res = await kor();
    expect(res).toMatchObject({ totalt: 8, skickade: 1, skippade: 7 });
    expect(h.skickat).toHaveLength(1);
    // andra körningen: inget kvar att skicka
    h.skickat = [];
    expect(await kor()).toMatchObject({ totalt: 0 });
    expect(h.skickat).toHaveLength(0);
  });

  it("gammal rad + läsfel mot ansökan: raden hoppas över (skjuts inte upp i all evighet)", async () => {
    h.lasfelLedighet = true;
    koa("k1", "ledighet_ansokan", MARTIN, "a1", fore(26 * TIM));
    const res = await kor();
    expect(res).toMatchObject({ skippade: 1, uppskjutna: 0 });
    expect(koRad("k1").skickad_at).toBeTruthy();
  });
});
