/**
 * POST /api/fortnox/salary-export: förhandsvisning (dry_run) och skarp sändning av lönerader till Fortnox.
 *
 * Det som måste hålla:
 *  - En löneart som HAR ett antal men saknar kod stoppar en skarp sändning (409) innan en enda rad gått iväg.
 *  - Admin kan UTTRYCKLIGEN välja att skicka utan de raderna (`skicka_utan_saknade: true`) — då skickas allt utom dem, och svaret säger vilka som uteblev.
 *  - Premielönen är frivillig: saknad kod hoppar över raden men stoppar inte.
 *  - Förhandsvisningen bär samma blockerande lista som sändningen använder, så de aldrig kan säga olika.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { beräknaExport } from "@/lib/lonesystem/loneberakning";
import { PROD_KODER } from "@/lib/lonesystem/testKoder";
import type { Loneartskoder } from "@/lib/lonesystem/loneart";

const g = globalThis as any;

vi.mock("@/lib/auth/server", () => ({
  kravRoll: async () => (g.__nekad ? { ok: false, res: new Response(JSON.stringify({ ok: false }), { status: 403 }) } : { ok: true, session: {} }),
  ADMIN_ROLLER: ["admin"],
}));
vi.mock("@/lib/lonesystem/server", () => ({
  serverSupabase: () => ({ from: (t: string) => ({ upsert: async (v: any) => { g.__logg.push({ tabell: t, v }); return { error: null }; } }) }),
  getFortnoxClient: async () => { g.__klientSkapad++; return { sendSalaryTransaction: async (t: any) => { g.__skickat.push(t); } }; },
}));
vi.mock("@/lib/lonesystem/loneunderlag", () => ({
  beraknaLoneunderlag: async () => g.__underlag,
}));

import { POST } from "./route";

const dag = (datum: string, min: number) => ({ datum, arbetad_min: min, maskin_id: "R64428", km_totalt: 0, bekraftad: true, dagtyp: null });
const forare = (namn: string, nr: string, koder: Loneartskoder, dagar: any[], status = "utkast", loneperiod = "2027-01", godkannande: "godkand" | "vantar" = "godkand") => ({
  ...beräknaExport(`id-${namn}`, namn, nr, dagar, { R64428: "skordare" }, loneperiod, [], [], 60, null, new Set(), null, null, koder),
  status,
  // Förarens godkännande av månaden (loneunderlag.status) — exporten skickar bara förare som godkänt.
  godkannande,
});
const kopplingar = { timlon: { kod: "11", namn: "Timlön" } };

function satt(resultat: ReturnType<typeof forare>[], arbetsperiod = "2026-12") {
  g.__underlag = { period: "2027-01", arbetsperiod, resultat, berikad: resultat, totalt_rader: resultat.reduce((s, r) => s + r.rader.length, 0), synkAvvikelser: [], oenighet: [], kopplingar };
}
const anropa = (body: any) => POST({ json: async () => body } as any);

beforeEach(() => { g.__nekad = false; g.__skickat = []; g.__logg = []; g.__klientSkapad = 0; });

// December 2026: tre röda vardagar utan arbete = 24 tim helglön. PROD_KODER har ingen helglönekod.
const DEC = [dag("2026-12-01", 480)];

describe("förhandsvisning (dry_run)", () => {
  it("bär blockerande lönearter och kopplingarna (kod + namn), och rör varken Fortnox eller loggen", async () => {
    satt([forare("Anna", "7", PROD_KODER, DEC)]);
    const j = await (await anropa({ period: "2027-01", dry_run: true })).json();
    expect(j.ok).toBe(true);
    expect(j.blockerande).toEqual([expect.objectContaining({ loneart: "helglon_skordare", label: "Helglön skördare", forare: [{ namn: "Anna", mangd: "24.00" }] })]);
    expect(j.kopplingar).toEqual(kopplingar);
    expect(g.__klientSkapad).toBe(0);
    expect(g.__skickat).toEqual([]);
    expect(g.__logg).toEqual([]);
  });
  it("ingen blockerande lista när allt har kod", async () => {
    satt([forare("Anna", "7", { ...PROD_KODER, helglon_skordare: "1461" }, DEC)]);
    const j = await (await anropa({ period: "2027-01", dry_run: true })).json();
    expect(j.blockerande).toEqual([]);
  });
});

describe("skarp sändning", () => {
  it("bara admin: andra får 403 och inget skickas", async () => {
    g.__nekad = true;
    satt([forare("Anna", "7", { ...PROD_KODER, helglon_skordare: "1461" }, DEC)]);
    expect((await anropa({ period: "2027-01" })).status).toBe(403);
    expect(g.__skickat).toEqual([]);
  });

  it("allt har kod: alla rader skickas, med rätt kod, antal och datum (Amount 0 — Fortnox äger satserna)", async () => {
    satt([forare("Anna", "7", { ...PROD_KODER, helglon_skordare: "1461" }, DEC)]);
    const j = await (await anropa({ period: "2027-01" })).json();
    expect(j.ok).toBe(true);
    expect(g.__skickat.map((t: any) => [t.SalaryCode, t.Number, t.Amount, t.Date])).toEqual([
      ["11", 8, 0, "2027-01-01"], ["1355", 8, 0, "2027-01-01"], ["136", 1, 0, "2027-01-01"], ["1461", 24, 0, "2027-01-01"],
    ]);
    expect(j.utelamnade).toEqual([]);
  });

  it("en saknad kod STOPPAR: 409 med vad som saknas och hos vem, och Fortnox rörs inte alls", async () => {
    satt([forare("Anna", "7", PROD_KODER, DEC), forare("Bo", "8", PROD_KODER, DEC)]);
    const r = await anropa({ period: "2027-01" });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.kod).toBe("LONEART_SAKNAS");
    expect(j.blockerande).toEqual([expect.objectContaining({ loneart: "helglon_skordare", forare: [{ namn: "Anna", mangd: "24.00" }, { namn: "Bo", mangd: "24.00" }] })]);
    expect(j.meddelande).toMatch(/Helglön skördare/);
    expect(j.meddelande).toMatch(/Inget är skickat/);
    expect(g.__klientSkapad).toBe(0);
    expect(g.__skickat).toEqual([]);
    expect(g.__logg).toEqual([]);
  });

  it("'skicka utan dessa rader' måste vara uttryckligt: bara true räknas (inte strängen 'false', inte 1)", async () => {
    satt([forare("Anna", "7", PROD_KODER, DEC)]);
    for (const varde of ["false", "true", 1, "ja", null, undefined]) {
      const r = await anropa({ period: "2027-01", skicka_utan_saknade: varde });
      expect(r.status, String(varde)).toBe(409);
    }
    expect(g.__skickat).toEqual([]);
  });

  it("med uttryckligt val skickas allt UTOM de saknade raderna, och svaret säger vilka som uteblev", async () => {
    satt([forare("Anna", "7", PROD_KODER, DEC)]);
    const r = await anropa({ period: "2027-01", skicka_utan_saknade: true });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(g.__skickat.map((t: any) => t.SalaryCode)).toEqual(["11", "1355", "136"]);
    expect(j.utelamnade).toEqual([{ namn: "Anna", loneart: "helglon_skordare", label: "Helglön skördare", mangd: "24.00", enhet: "tim" }]);
    expect(j.skickade).toBe(3);
    // loggen bär bara det som faktiskt skickades
    expect(g.__logg).toHaveLength(1);
    expect(g.__logg[0].v.rader.map((x: any) => x.loneart)).toEqual(["timlon", "premielon_skordare", "valtlappar"]);
  });

  it("premielönen är frivillig: saknas dess kod skickas allt annat utan att något stoppar", async () => {
    const { premielon_skordare, premielon_skotare, ...utanPremie } = PROD_KODER;
    satt([forare("Anna", "7", { ...utanPremie, helglon_skordare: "1461" }, DEC)]);
    const r = await anropa({ period: "2027-01" });
    expect(r.status).toBe(200);
    expect(g.__skickat.map((t: any) => t.SalaryCode)).toEqual(["11", "136", "1461"]);
  });

  it("en redan skickad förare med saknad kod blockerar inte (hens rader skickas inte om)", async () => {
    satt([forare("Anna", "7", PROD_KODER, DEC, "skickat"), forare("Bo", "8", { ...PROD_KODER, helglon_skordare: "1461" }, DEC)]);
    const r = await anropa({ period: "2027-01" });
    expect(r.status).toBe(200);
    expect(g.__skickat.every((t: any) => t.EmployeeId === "8")).toBe(true);
  });

  it("val utan något som saknas ändrar ingenting: samma rader, inga utelämnade", async () => {
    satt([forare("Anna", "7", { ...PROD_KODER, helglon_skordare: "1461" }, DEC)]);
    const j = await (await anropa({ period: "2027-01", skicka_utan_saknade: true })).json();
    expect(g.__skickat.map((t: any) => t.SalaryCode)).toEqual(["11", "1355", "136", "1461"]);
    expect(j.utelamnade).toEqual([]);
  });

  it("anställningsnummer saknas: den föraren hoppas över med ett fel, precis som förut", async () => {
    satt([forare("Anna", "", { ...PROD_KODER, helglon_skordare: "1461" }, DEC)]);
    const j = await (await anropa({ period: "2027-01" })).json();
    expect(j.ok).toBe(false);
    expect(j.felMeddelanden).toEqual(["Anna: anställningsnummer saknas."]);
    expect(g.__skickat).toEqual([]);
  });

  it("felaktig period ger 400", async () => {
    satt([]);
    expect((await anropa({ period: "oktober" })).status).toBe(400);
  });
});

// Företagsledare (medarbetare.foretagsledare): lönen ligger utanför appen. Inget skickas, inget loggas, inget fel, inget som blockerar.
describe("företagsledare", () => {
  const ledare = (namn: string, nr: string) => ({
    ...beräknaExport(`id-${namn}`, namn, nr, DEC, { R64428: "skordare" }, "2027-01", [], [], 60, null, new Set(), null, null, PROD_KODER, { foretagsledare: true }),
    status: "utkast",
    godkannande: "godkand" as const,
  });

  it("skarp sändning: skickas aldrig, loggas inte och ger inget fel trots saknat anställningsnummer — och står inte bland de skickade", async () => {
    satt([forare("Anna", "7", { ...PROD_KODER, helglon_skordare: "1461" }, DEC), ledare("Martin", "")]);
    const j = await (await anropa({ period: "2027-01" })).json();
    expect(j.ok).toBe(true);
    expect(j.fel).toBe(0);
    expect(j.felMeddelanden).toEqual([]);
    expect(g.__logg.map((l: any) => l.v.medarbetare_id)).toEqual(["id-Anna"]);
    expect(g.__skickat.every((t: any) => t.EmployeeId === "7")).toBe(true);
    expect(j.medarbetare.map((m: any) => m.namn)).toEqual(["Anna"]);
  });

  it("förhandsvisning: ledaren finns kvar med flaggan men utan rader, och bidrar inte till de blockerande raderna", async () => {
    satt([ledare("Martin", "9")]);
    const j = await (await anropa({ period: "2027-01", dry_run: true })).json();
    expect(j.medarbetare[0]).toMatchObject({ namn: "Martin", foretagsledare: true, rader: [], lonerader: [] });
    expect(j.blockerande).toEqual([]);
  });

  it("en sändning där bara ledare har data skickar ingenting alls", async () => {
    satt([ledare("Martin", "9")]);
    const j = await (await anropa({ period: "2027-01" })).json();
    expect(j.ok).toBe(true);
    expect(j.skickade).toBe(0);
    expect(g.__skickat).toEqual([]);
    expect(g.__logg).toEqual([]);
  });
});

// ── Förarens godkännande styr exporten (Martin 2026-10-21) ──────────────────────────────────────────────────────────────────
// Bara förare som godkänt sin månad skickas. Övriga står kvar som "Väntar på föraren" och skickas aldrig av sig själva. Admin kan
// skicka EN förare ändå — uttryckligen, en i taget — och det bokförs i loggen.
describe("förarens godkännande", () => {
  const KODER = { ...PROD_KODER, helglon_skordare: "1461" };
  const nr = (j: any) => Array.from(new Set(g.__skickat.map((t: any) => t.EmployeeId)));

  it("bara godkända förare skickas; den som väntar rörs inte, loggas inte och står i svaret som väntande", async () => {
    satt([forare("Anna", "7", KODER, DEC), forare("Bo", "8", KODER, DEC, "utkast", "2027-01", "vantar")]);
    const j = await (await anropa({ period: "2027-01" })).json();
    expect(j.ok).toBe(true);
    expect(nr(j)).toEqual(["7"]);
    expect(g.__logg.map((l: any) => l.v.medarbetare_id)).toEqual(["id-Anna"]);
    expect(j.vantar).toEqual([{ medarbetare_id: "id-Bo", namn: "Bo" }]);
    expect(j.skickade).toBe(4);
  });

  it("ingen har godkänt: ingenting skickas, Fortnox-klienten skapas inte, och det är inget fel", async () => {
    satt([forare("Anna", "7", KODER, DEC, "utkast", "2027-01", "vantar")]);
    const r = await anropa({ period: "2027-01" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.skickade).toBe(0);
    expect(j.vantar).toHaveLength(1);
    expect(g.__klientSkapad).toBe(0);
    expect(g.__skickat).toEqual([]);
    expect(g.__logg).toEqual([]);
  });

  it("saknat godkännande-fält räknas som väntar (stängt som standard)", async () => {
    const x: any = forare("Anna", "7", KODER, DEC);
    delete x.godkannande;
    satt([x]);
    const j = await (await anropa({ period: "2027-01" })).json();
    expect(g.__skickat).toEqual([]);
    expect(j.vantar).toHaveLength(1);
  });

  it("en väntande förare med saknad löneartskod stoppar INTE de godkända (blockerande räknas bara på dem som skickas)", async () => {
    satt([forare("Anna", "7", KODER, DEC), forare("Bo", "8", PROD_KODER, DEC, "utkast", "2027-01", "vantar")]);
    const r = await anropa({ period: "2027-01" });
    expect(r.status).toBe(200);
    expect(nr(await r.json())).toEqual(["7"]);
  });

  it("en godkänd förare med saknad kod stoppar fortfarande (409) — godkännandet gör inte koden frivillig", async () => {
    satt([forare("Anna", "7", PROD_KODER, DEC)]);
    expect((await anropa({ period: "2027-01" })).status).toBe(409);
    expect(g.__skickat).toEqual([]);
  });

  it("redan skickad + godkänd skickas aldrig om", async () => {
    satt([forare("Anna", "7", KODER, DEC, "skickat"), forare("Bo", "8", KODER, DEC)]);
    await anropa({ period: "2027-01" });
    expect(nr(null)).toEqual(["8"]);
  });

  it("förhandsvisningen: varje förare bär sitt godkännande, och blockerande räknas på dem som skulle skickas", async () => {
    satt([forare("Anna", "7", KODER, DEC), forare("Bo", "8", PROD_KODER, DEC, "utkast", "2027-01", "vantar")]);
    const j = await (await anropa({ period: "2027-01", dry_run: true })).json();
    expect(j.medarbetare.map((m: any) => [m.namn, m.godkannande])).toEqual([["Anna", "godkand"], ["Bo", "vantar"]]);
    expect(j.blockerande).toEqual([]);
    expect(g.__klientSkapad).toBe(0);
  });

  describe("skicka en enskild förare utan godkännande", () => {
    it("med uttrycklig flagga och exakt ett id skickas just den föraren, de andra rörs inte, och loggen märks", async () => {
      satt([forare("Anna", "7", KODER, DEC, "utkast", "2027-01", "vantar"), forare("Bo", "8", KODER, DEC, "utkast", "2027-01", "vantar")]);
      const j = await (await anropa({ period: "2027-01", medarbetare_ids: ["id-Anna"], skicka_utan_godkannande: true })).json();
      expect(j.ok).toBe(true);
      expect(nr(j)).toEqual(["7"]);
      expect(g.__logg).toHaveLength(1);
      expect(g.__logg[0].v).toMatchObject({ medarbetare_id: "id-Anna", status: "skickat", utan_forarens_godkannande: true });
    });

    it("en vanlig sändning skriver aldrig märkningen (kolumnen kanske inte finns än)", async () => {
      satt([forare("Anna", "7", KODER, DEC)]);
      await anropa({ period: "2027-01" });
      expect(g.__logg[0].v).not.toHaveProperty("utan_forarens_godkannande");
    });

    it("en godkänd förare som skickas med flaggan märks inte som 'utan godkännande'", async () => {
      satt([forare("Anna", "7", KODER, DEC)]);
      await anropa({ period: "2027-01", medarbetare_ids: ["id-Anna"], skicka_utan_godkannande: true });
      expect(g.__logg[0].v).not.toHaveProperty("utan_forarens_godkannande");
    });

    it("flaggan utan exakt ett id är ett fel (400) och ingenting skickas — aldrig 'alla utan godkännande'", async () => {
      satt([forare("Anna", "7", KODER, DEC, "utkast", "2027-01", "vantar"), forare("Bo", "8", KODER, DEC, "utkast", "2027-01", "vantar")]);
      for (const body of [
        { period: "2027-01", skicka_utan_godkannande: true },
        { period: "2027-01", medarbetare_ids: [], skicka_utan_godkannande: true },
        { period: "2027-01", medarbetare_ids: ["id-Anna", "id-Bo"], skicka_utan_godkannande: true },
      ]) {
        const r = await anropa(body);
        expect(r.status, JSON.stringify(body)).toBe(400);
      }
      expect(g.__skickat).toEqual([]);
      expect(g.__logg).toEqual([]);
    });

    it("bara det booleska true räknas (inte 'true', 1, 'ja')", async () => {
      satt([forare("Anna", "7", KODER, DEC, "utkast", "2027-01", "vantar")]);
      for (const v of ["true", 1, "ja", null, undefined, false]) {
        const j = await (await anropa({ period: "2027-01", medarbetare_ids: ["id-Anna"], skicka_utan_godkannande: v })).json();
        expect(j.skickade, String(v)).toBe(0);
      }
      expect(g.__skickat).toEqual([]);
    });

    it("saknad löneartskod stoppar även den enskilda sändningen (409) — flaggan hoppar bara över godkännandet", async () => {
      satt([forare("Anna", "7", PROD_KODER, DEC, "utkast", "2027-01", "vantar")]);
      const r = await anropa({ period: "2027-01", medarbetare_ids: ["id-Anna"], skicka_utan_godkannande: true });
      expect(r.status).toBe(409);
      expect(g.__skickat).toEqual([]);
    });

    it("förhandsvisning med flaggan räknar blockerande på den föraren", async () => {
      satt([forare("Anna", "7", PROD_KODER, DEC, "utkast", "2027-01", "vantar")]);
      const j = await (await anropa({ period: "2027-01", medarbetare_ids: ["id-Anna"], skicka_utan_godkannande: true, dry_run: true })).json();
      expect(j.blockerande).toEqual([expect.objectContaining({ loneart: "helglon_skordare" })]);
    });

    it("en företagsledare skickas aldrig, inte ens med flaggan", async () => {
      const l: any = { ...forare("Martin", "9", KODER, DEC, "utkast", "2027-01", "vantar"), foretagsledare: true };
      satt([l]);
      const j = await (await anropa({ period: "2027-01", medarbetare_ids: ["id-Martin"], skicka_utan_godkannande: true })).json();
      expect(j.skickade).toBe(0);
      expect(g.__skickat).toEqual([]);
      expect(j.vantar).toEqual([]);
    });

    it("bara admin: andra får 403", async () => {
      g.__nekad = true;
      satt([forare("Anna", "7", KODER, DEC, "utkast", "2027-01", "vantar")]);
      expect((await anropa({ period: "2027-01", medarbetare_ids: ["id-Anna"], skicka_utan_godkannande: true })).status).toBe(403);
    });
  });
});
