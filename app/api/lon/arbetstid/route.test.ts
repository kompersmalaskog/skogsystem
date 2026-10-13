/**
 * GET /api/lon/arbetstid: lagkontrollen för arbetstid, en rad per förare (lib/arbetstidsgranser).
 * Avgörande: läsningen är PAGINERAD (PostgREST svarar högst 1000 rader per anrop — utan paginering tappas de sista förarna tyst),
 * läsfel blir synliga varningar (aldrig "ingen gräns nådd"), och bara admin får läsa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as any;
vi.mock("@/lib/auth/server", () => ({
  kravRoll: async () => (g.__nekad ? { ok: false, res: new Response(JSON.stringify({ ok: false }), { status: 403 }) } : { ok: true, session: {} }),
  ADMIN_ROLLER: ["admin"],
}));
vi.mock("@/lib/lonesystem/server", () => {
  class Q {
    f: ((r: any) => boolean)[] = [];
    sida: [number, number] | null = null;
    constructor(public t: string) {}
    cols = "";
    select(c?: string) { this.cols = c || ""; return this; } order() { return this; } limit() { return this; }
    eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
    gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
    lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
    in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
    range(a: number, b: number) { this.sida = [a, b]; return this; }
    maybeSingle() { (this as any).enkel = true; return this; }
    then(res: any, rej: any) {
      g.__anrop.push({ t: this.t, sida: this.sida });
      if (g.__saknarForetagsledare && this.t === "medarbetare" && this.cols.includes("foretagsledare")) return Promise.resolve({ data: null, error: { message: "column medarbetare.foretagsledare does not exist" } }).then(res, rej);
      if (g.__fel?.[this.t]) return Promise.resolve({ data: null, error: { message: g.__fel[this.t] } }).then(res, rej);
      let rader = ((g.__db[this.t] || []) as any[]).filter(r => this.f.every(fn => fn(r)));
      if (this.sida) rader = rader.slice(this.sida[0], this.sida[1] + 1);      // som PostgREST: max 1000 per anrop
      else if (rader.length > 1000) rader = rader.slice(0, 1000);
      return Promise.resolve({ data: (this as any).enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
    }
  }
  return { serverSupabase: () => ({ from: (t: string) => new Q(t) }) };
});

import { GET } from "./route";

const anropa = () => GET({ nextUrl: new URL("https://app.example/api/lon/arbetstid") } as any);
const dag = (medarbetare_id: string, datum: string, h = 8) => ({ medarbetare_id, datum, arbetad_min: h * 60, dagtyp: "Produktion", start_tid: "06:00:00", slut_tid: "15:00:00" });
const lok = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const vardagar = (fran: string, till: string) => { const ut: string[] = []; for (let d = lok(fran); iso(d) <= till; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) ut.push(iso(d)); return ut; };

beforeEach(() => {
  g.__nekad = false; g.__fel = {}; g.__anrop = []; g.__saknarForetagsledare = false;
  g.__db = {
    medarbetare: [{ id: "s", namn: "Stefan Karlsson" }],
    arbetsdag: vardagar("2026-08-24", "2026-10-13").map(d => dag("s", d)),
    extra_tid: [], gs_avtal: [], utjamningsperiod: [], ledighet_ansokningar: [], flyttdag: [],
  };
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 13, 12, 0));
});

describe("GET /api/lon/arbetstid", () => {
  it("bara admin: andra får 403", async () => {
    g.__nekad = true;
    expect((await anropa()).status).toBe(403);
  });

  it("ger sex gränser per förare, räknade t.o.m. i dag", async () => {
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.tomDatum).toBe("2026-10-13");
    expect(j.forare).toHaveLength(1);
    expect(j.forare[0].granser.map((x: any) => x.id)).toEqual(["allman_overtid_ar", "extra_overtid_ar", "overtid_manad", "snitt_48", "veckovila", "dygnsvila"]);
    expect(j.forare[0].namn).toBe("Stefan Karlsson");
  });

  it("läsningen är paginerad: 12 förare × 100 dagar (1200 rader > 1000) — ingen förare tappas", async () => {
    const dagar = vardagar("2026-05-18", "2026-10-13").slice(0, 100);
    g.__db.medarbetare = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, namn: `Förare ${i}` }));
    g.__db.arbetsdag = g.__db.medarbetare.flatMap((m: any) => dagar.map(d => dag(m.id, d)));
    expect(g.__db.arbetsdag.length).toBe(1200);
    const j = await (await anropa()).json();
    expect(j.forare).toHaveLength(12);
    expect(j.forare.map((f: any) => f.medarbetare_id)).toContain("m11");
    expect(g.__anrop.filter((a: any) => a.t === "arbetsdag").length).toBeGreaterThan(1);
  });

  it("restid utanför underlaget sägs: 'Restid ingår inte'", async () => {
    const f = (await (await anropa()).json()).forare[0];
    expect(f.restidSaknas).toBe(true);
    expect(f.notiser.join(" ")).toContain("Restid ingår inte");
  });

  it("restid i extra_tid (aktivitet restid) ingår — då ingen notis", async () => {
    g.__db.extra_tid = [{ medarbetare_id: "s", datum: "2026-10-05", minuter: 90, start_tid: "16:00:00", slut_tid: "17:30:00", aktivitet_typ: "restid" }];
    const f = (await (await anropa()).json()).forare[0];
    expect(f.restidSaknas).toBe(false);
  });

  it("avtalets värden läses ur gs_avtal (taket, vilokraven)", async () => {
    g.__db.gs_avtal = [{ giltigt_fran: "2025-04-01", max_overtid_ar_h: 200, dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 }];
    const f = (await (await anropa()).json()).forare[0];
    expect(f.granser.find((x: any) => x.id === "allman_overtid_ar").grans).toBe(200);
  });

  it("gs_avtal saknas: lagens värden gäller och svaret säger det (varningar), inte tyst", async () => {
    const j = await (await anropa()).json();
    expect(j.forare[0].granser.find((x: any) => x.id === "allman_overtid_ar").grans).toBe(250);
    expect(j.varningar.join(" ")).toContain("avtal");
  });

  it("frånvaron går inte att läsa: varning — talen för 48-timmarssnittet kan vara för låga", async () => {
    g.__fel = { ledighet_ansokningar: "permission denied" };
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.varningar.join(" ")).toContain("frånvaron");
  });

  it("utjämningsperioderna går inte att läsa: varning, allt räknas som antagna block", async () => {
    g.__fel = { utjamningsperiod: "relation does not exist" };
    const j = await (await anropa()).json();
    expect(j.varningar.join(" ")).toContain("utjämningsperioder");
  });

  it("arbetsdag går inte att läsa: 500 med meddelande, aldrig 'inga förare'", async () => {
    g.__fel = { arbetsdag: "timeout" };
    const r = await anropa();
    expect(r.status).toBe(500);
    expect((await r.json()).meddelande).toContain("timeout");
  });

  it("maskinflytten (flyttdag) räknas: notisen säger det, och den räknas till rätt förare", async () => {
    // 25 sep 06:00 lokal (04:00Z), 400 min — ingenting av det finns i arbetsdag/extra_tid
    g.__db.flyttdag = [{ medarbetare_id: "s", forare: "Stefan", starttid: "2026-09-25T04:00:00Z", sluttid: "2026-09-25T13:00:00Z", total_tid_min: 400 }];
    const f = (await (await anropa()).json()).forare[0];
    expect(f.restidSaknas).toBe(false);
    expect(f.notiser.join(" ")).toContain("Maskinflytt ingår: 1 flyttdag, 6,7 tim");
    expect(f.notiser.join(" ")).not.toContain("Restid ingår inte");
  });

  it("en förare som BARA har flyttdagar (ingen arbetsdag, ingen extra_tid) tas med", async () => {
    g.__db.medarbetare = [{ id: "s", namn: "Stefan Karlsson" }, { id: "l", namn: "Lastbil Lasse" }];
    g.__db.flyttdag = [{ medarbetare_id: "l", forare: "Lasse", starttid: "2026-10-05T04:00:00Z", sluttid: null, total_tid_min: 300 }];
    const j = await (await anropa()).json();
    expect(j.forare.map((f: any) => f.medarbetare_id).sort()).toEqual(["l", "s"]);
  });

  it("flyttdag utan medarbetare_id: kopplas via exakt namn i `forare`, annars en varning (aldrig tyst)", async () => {
    g.__db.flyttdag = [
      { medarbetare_id: null, forare: "stefan karlsson", starttid: "2026-09-25T04:00:00Z", sluttid: null, total_tid_min: 400 },
      { medarbetare_id: null, forare: "Okänd Person", starttid: "2026-09-26T04:00:00Z", sluttid: null, total_tid_min: 200 },
    ];
    const j = await (await anropa()).json();
    expect(j.forare[0].notiser.join(" ")).toContain("Maskinflytt ingår: 1 flyttdag, 6,7 tim");
    expect(j.varningar.join(" ")).toContain("1 flyttdag kunde inte kopplas till en förare");
  });

  it("tvetydigt namn (två medarbetare med samma namn) kopplas inte — det räknas som okopplat", async () => {
    g.__db.medarbetare = [{ id: "a", namn: "Anna Berg" }, { id: "b", namn: "Anna Berg" }];
    g.__db.arbetsdag = [dag("a", "2026-10-05"), dag("b", "2026-10-05")];
    g.__db.flyttdag = [{ medarbetare_id: null, forare: "Anna Berg", starttid: "2026-10-05T04:00:00Z", sluttid: null, total_tid_min: 100 }];
    const j = await (await anropa()).json();
    expect(j.varningar.join(" ")).toContain("1 flyttdag kunde inte kopplas");
  });

  it("flyttdag går inte att läsa: kortet visas ändå, med en varning — flytten är ett tillägg, inte grunden", async () => {
    g.__fel = { flyttdag: "permission denied" };
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.forare).toHaveLength(1);
    expect(j.varningar.join(" ")).toContain("Kunde inte läsa maskinflytten (flyttdag: permission denied)");
  });

  it("företagsledare (medarbetare.foretagsledare = true): flaggan följer med, varsta är lugn, skulleVarit bär nivån", async () => {
    g.__db.medarbetare = [{ id: "s", namn: "Stefan Karlsson", foretagsledare: false }, { id: "d", namn: "Delägare", foretagsledare: true }];
    g.__db.arbetsdag = [...vardagar("2026-08-24", "2026-10-13").map(d => dag("s", d)), ...vardagar("2026-08-24", "2026-10-13").map(d => dag("d", d, 12))];   // 12 tim/dag → över 48 i snitt
    const j = await (await anropa()).json();
    const d = j.forare.find((f: any) => f.medarbetare_id === "d");
    const s = j.forare.find((f: any) => f.medarbetare_id === "s");
    expect(d).toMatchObject({ foretagsledare: true, varsta: "lugn", skulleVarit: "rod" });
    expect(s).toMatchObject({ foretagsledare: false });
  });

  it("migrationen är inte körd (kolumnen saknas): kortet kör ändå, utan delägarundantag, och en varning säger det", async () => {
    g.__saknarForetagsledare = true;
    const j = await (await anropa()).json();
    expect(j.ok).toBe(true);
    expect(j.forare).toHaveLength(1);
    expect(j.forare[0].foretagsledare).toBe(false);
    expect(j.varningar.join(" ")).toContain("20261013170000_medarbetare_foretagsledare.sql");
  });

  it("förare utan någon registrerad tid tas inte med", async () => {
    g.__db.medarbetare = [{ id: "s", namn: "Stefan Karlsson" }, { id: "x", namn: "Ingen Tid" }];
    const j = await (await anropa()).json();
    expect(j.forare.map((f: any) => f.medarbetare_id)).toEqual(["s"]);
  });

  it("annans frånvaro räknas inte på Stefan (semester ersätter 48-timmarssnittets timmar bara för den som har den)", async () => {
    g.__db.arbetsdag = vardagar("2026-08-24", "2026-10-13").filter(d => d < "2026-09-07" || d > "2026-09-11").map(d => dag("s", d));
    const med = (g.__db.ledighet_ansokningar = [{ medarbetare_id: "annan", typ: "semester", startdatum: "2026-09-07", slutdatum: "2026-09-11", status: "godkänd" }]);
    const utan = (await (await anropa()).json()).forare[0].granser.find((x: any) => x.id === "snitt_48").varde;
    g.__db.ledighet_ansokningar = [{ medarbetare_id: "s", typ: "semester", startdatum: "2026-09-07", slutdatum: "2026-09-11", status: "godkänd" }];
    const med2 = (await (await anropa()).json()).forare[0].granser.find((x: any) => x.id === "snitt_48").varde;
    expect(med.length).toBe(1);
    expect(med2).toBeGreaterThan(utan);
  });
});
