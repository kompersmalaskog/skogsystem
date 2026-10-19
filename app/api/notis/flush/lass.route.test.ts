/**
 * /api/notis/flush för lassfrågan (lass_maskin): "Vilken maskin? Lass [från] [tid] → [till] [tid]".
 *
 * Databasen och web-push är fejk (ingen nätverkstrafik, ingen .env.local). Cron:en som KÖAR raderna (lib/lastbil/lass/kor.ts) är
 * provad i kor.test.ts; här bevisas att det som ligger i kön blir rätt push till rätt person, att ett redan besvarat lass inte
 * pushas, att ett läsfel lämnar raden oskickad och att raden aldrig tas av den gamla flushen (skickas_at 'infinity').
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
const MIN = 60 * 1000, TIM = 60 * MIN;
const fore = (ms: number) => new Date(Date.now() - ms).toISOString();
const koa = (id: string, mottagare: string, lass = "l1", skapad = fore(MIN)) =>
  h.state.notis_kö.push({ id, typ: "lass_maskin", mottagare_id: mottagare, payload: { lass_id: lass }, skickas_at: "infinity", skapad_at: skapad, skickad_at: null, fel_meddelande: null, datum: null });

beforeEach(() => {
  h.lasfelLass = false;
  h.skickat = [];
  h.sendBeteende = () => {};
  h.state = {
    medarbetare: [
      { id: MARTIN, push_aktiv: true, daglig_pamin_aktiv: true },
      { id: JOACIM, push_aktiv: true, daglig_pamin_aktiv: true },
    ],
    push_subscriptions: [
      { id: "s1", medarbetare_id: MARTIN, subscription: { endpoint: "martin-telefon" } },
      { id: "s2", medarbetare_id: JOACIM, subscription: { endpoint: "joacim-telefon" } },
    ],
    lastbil_lass: [{
      id: "l1", status: "vantar_maskin", status_orsak: "sakerhet", fran_namn: "Östra-Hoka 1:7", till_namn: "Bågskyttebanan RP",
      lassning_tid: "2026-10-12T10:23:00Z", lossning_tid: "2026-10-12T11:46:00Z", forslag: { visningsnamn: "Elefant 26", modell: "x" },
    }],
    notis_kö: [],
  };
});

describe("flush — lass_maskin", () => {
  it("ges till den som står som mottagare, med texten 'Vilken maskin? Lass … → …' och en länk som öppnar sheeten på lasset", async () => {
    koa("k1", MARTIN);
    const res = await kor();
    expect(res).toMatchObject({ totalt: 1, skickade: 1, skippade: 0, uppskjutna: 0, fel: 0 });
    expect(h.skickat).toHaveLength(1);
    expect(h.skickat[0].endpoint).toBe("martin-telefon");
    expect(h.skickat[0].payload).toMatchObject({ title: "Lastbilen", body: "Vilken maskin? Lass Östra-Hoka 1:7 12:23 → Bågskyttebanan RP 13:46", url: "/lastbil?lass=l1" });
    expect(koRad("k1").skickad_at).toBeTruthy();
  });

  it("båda får frågan när båda står som mottagare — och bara de", async () => {
    koa("k1", MARTIN); koa("k2", JOACIM);
    await kor();
    expect(h.skickat.map(s => s.endpoint).sort()).toEqual(["joacim-telefon", "martin-telefon"]);
  });

  it("FÖRSTA SVARET STÄNGER FRÅGAN för den andra: lasset är besvarat före utskicket → ingen push, raden markeras hanterad", async () => {
    h.state.lastbil_lass[0].status = "auto_flytt";
    koa("k1", JOACIM);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — lasset var redan besvarat");
  });

  it("lasset borttaget före utskicket → ingen push", async () => {
    h.state.lastbil_lass = [];
    koa("k1", MARTIN);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — lasset finns inte kvar");
  });

  it("LÄSFEL lämnar raden oskickad (nästa cron försöker igen) — det är inte 'finns inte'", async () => {
    h.lasfelLass = true;
    koa("k1", MARTIN);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 0, uppskjutna: 1 });
    expect(koRad("k1").skickad_at).toBeNull();
    h.lasfelLass = false;
    expect(await kor()).toMatchObject({ skickade: 1 });
  });

  it("köad för mer än 24 timmar sedan → hoppas över (en hög som väntat på release skickas aldrig på en gång)", async () => {
    koa("k1", MARTIN, "l1", fore(25 * TIM));
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(koRad("k1").fel_meddelande).toBe("Ej skickad — för gammal (köad för mer än 24 timmar sedan)");
  });

  it("den GAMLA flushen (bara ledighet i urvalet) väljer aldrig raden: skickas_at 'infinity' är inte ≤ nu", async () => {
    koa("k1", MARTIN);
    const { flushUrval } = await import("@/lib/ledighet/notis");
    const gammalt = flushUrval(new Date().toISOString());
    expect(gammalt).not.toContain("lass_maskin");
    expect("infinity" <= new Date().toISOString()).toBe(false);
  });

  it("mottagare som stängt av push får ingen (samma växel som övriga notiser)", async () => {
    h.state.medarbetare[0].push_aktiv = false;
    koa("k1", MARTIN);
    const res = await kor();
    expect(res).toMatchObject({ skickade: 0, skippade: 1 });
    expect(h.skickat).toHaveLength(0);
  });
});
