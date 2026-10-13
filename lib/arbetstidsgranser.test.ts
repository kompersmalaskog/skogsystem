// Lagkontroll för arbetstid — TESTNIVÅ FULL (lag och lön). Varje gräns testas på gränsen: precis under, precis på och precis över.
// Mutationskontroll: scripts/mutationskontroll-arbetstid.mjs ändrar varje tröskel/jämförelse i lib/arbetstidsgranser.ts och kräver
// att den här filen blir röd för varje ändring.
import { describe, it, expect } from "vitest";
import {
  GRANSER, nivaMotTak, isoVeckaMandag, overtidPerManad, manadsstatus, snittVeckaH, byggArbetstid, sorteraAttGora, dataFranDatum, flyttdagTillPass,
  type ArbetstidIndata,
} from "./arbetstidsgranser";
import { beraknaArsovertid, type Arsovertid, type Berakningsperiod } from "./lonesystem/arsovertid";
import { veckovilaPerDag } from "./vilobrott";
import fx from "./lonesystem/testdata/stefan2026.json";

const TROSKLAR = { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };

// ─── hjälpare ────────────────────────────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lok = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const plusDagar = (s: string, n: number) => { const d = lok(s); d.setDate(d.getDate() + n); return iso(d); };
const vardag = (s: string) => { const w = lok(s).getDay(); return w !== 0 && w !== 6; };

/** En vecka (ISO) i den handskrivna Arsovertid-formen: timmar och bas är det som bestämmer veckans överskott. */
const vk = (vecka: number, timmar: number, bas = 40) => ({ vecka, timmar, bas });
const per = (fran: number, till: number, overtid: number, o: Partial<Berakningsperiod> = {}): Berakningsperiod => ({
  fran, till, veckor: till - fran + 1, timmar: 0, bas: 0, franvaroTimmar: 0, rodaTimmar: 0, overtid, markerad: false, avslutad: true, ...o,
});
function ars(o: { ar?: number; tomDatum: string; genomsnitt?: number; perioder?: Berakningsperiod[]; veckor?: { vecka: number; timmar: number; bas: number }[] }): Arsovertid {
  return {
    ar: o.ar ?? 2026, tomDatum: o.tomDatum, timmar: 0,
    modeller: { vardagar: 0, dagar: 0, vecka: 0, genomsnitt: o.genomsnitt ?? (o.perioder || []).reduce((s, p) => s + p.overtid, 0) },
    perioder: o.perioder ?? [], veckor: o.veckor ?? [], basavdrag: { franvaroTimmar: 0, rodaTimmar: 0 },
  };
}

function indata(o: Partial<ArbetstidIndata> & { arsovertid: Arsovertid }): ArbetstidIndata {
  return {
    medarbetare_id: "m1", namn: "Stefan Karlsson", tomDatum: o.arsovertid.tomDatum, dagar: [], extra: [], franvaro: [],
    trosklar: TROSKLAR, tak: 250, ...o,
  };
}
const gr = (f: ReturnType<typeof byggArbetstid>, id: string) => f.granser.find(g => g.id === id)!;

// ─── niva: 90 % = gul, över gränsen = röd ────────────────────
describe("nivaMotTak: gul från 90 %, röd först OVER gränsen", () => {
  it.each([
    [224.9, 250, "lugn"], [225, 250, "gul"], [250, 250, "gul"], [250.1, 250, "rod"],
    [134.9, 150, "lugn"], [135, 150, "gul"], [150, 150, "gul"], [150.1, 150, "rod"],
    [44.9, 50, "lugn"], [45, 50, "gul"], [50, 50, "gul"], [50.1, 50, "rod"],
    [43.1, 48, "lugn"], [43.2, 48, "gul"], [48, 48, "gul"], [48.1, 48, "rod"],
    [0, 250, "lugn"],
  ])("%s mot %s → %s", (v, g, forvantat) => { expect(nivaMotTak(v as number, g as number)).toBe(forvantat); });

  it("gränserna är lagens och avtalets tal", () => {
    expect(GRANSER).toMatchObject({ allmanOvertidAr: 250, extraOvertidAr: 150, overtidManad: 50, snittVeckaH: 48, snittManader: 4, veckovilaH: 36, dygnsvilaH: 11 });
    expect(GRANSER.gulAndel).toBe(0.9);
  });
});

// ─── gräns 1 och 2: årsövertid ───────────────────────────────
describe("gräns 1 (allmän övertid, Skogsavtalet §5 mom 5) och gräns 2 (extra övertid, ATL 8 a §)", () => {
  const med = (ov: number) => byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", genomsnitt: ov }) }));

  it("allmän övertid: 224,9 lugn · 225 gul · 250 gul · 250,1 röd", () => {
    expect(gr(med(224.9), "allman_overtid_ar").niva).toBe("lugn");
    expect(gr(med(225), "allman_overtid_ar").niva).toBe("gul");
    expect(gr(med(250), "allman_overtid_ar").niva).toBe("gul");
    expect(gr(med(250.1), "allman_overtid_ar").niva).toBe("rod");
  });

  it("extra övertid är det som överstiger 250 — 0 under taket", () => {
    const g = gr(med(240), "extra_overtid_ar");
    expect(g.varde).toBe(0);
    expect(g.niva).toBe("lugn");
    expect(g.markning).toBe("räknat");
  });

  it("extra övertid: 384,9 → 134,9 lugn · 385 → 135 gul · 400 → 150 gul · 400,1 → röd", () => {
    expect(gr(med(384.9), "extra_overtid_ar").niva).toBe("lugn");
    expect(gr(med(385), "extra_overtid_ar").niva).toBe("gul");
    expect(gr(med(400), "extra_overtid_ar").niva).toBe("gul");
    expect(gr(med(400.1), "extra_overtid_ar").niva).toBe("rod");
    expect(gr(med(300), "extra_overtid_ar").varde).toBe(50);
  });

  it("taket läses ur avtalet (gs_avtal.max_overtid_ar_h) när det ges", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", genomsnitt: 230 }), tak: 200 }));
    expect(gr(f, "allman_overtid_ar").niva).toBe("rod");
    expect(gr(f, "extra_overtid_ar").varde).toBe(30);
  });

  it("staplarna: andel av gränsen, kapad vid 1", () => {
    expect(gr(med(125), "allman_overtid_ar").andel).toBe(0.5);
    expect(gr(med(300), "allman_overtid_ar").andel).toBe(1);
    expect(gr(med(400), "extra_overtid_ar").andel).toBe(1);
    expect(gr(med(325), "extra_overtid_ar").andel).toBe(0.5);
  });

  it("meningen är EN mening med talen i; Varför? citerar paragrafen", () => {
    const g1 = gr(med(262), "allman_overtid_ar");
    expect(g1.mening).toBe("262 av 250 tim övertid i år — taket är passerat");
    expect(g1.varfor).toMatch(/§5 mom 5/);
    expect(gr(med(262), "extra_overtid_ar").varfor).toMatch(/ATL 8 a §/);
    expect(gr(med(262), "extra_overtid_ar").varfor).toMatch(/Räknat, inte mätt/);
  });
});

describe("dataFranDatum: hur långt bakåt raderna måste läsas", () => {
  it("efter april är årets början (årsövertiden) det tidigaste; före maj är det fyra månader bakåt", () => {
    expect(dataFranDatum("2026-10-13")).toBe("2026-01-01");     // årets början är tidigare än fyra månader bakåt
    expect(dataFranDatum("2026-02-10")).toBe("2025-10-10");     // fyra månader bakåt går över årsskiftet
  });
  it("januari: fyra månader bakåt ligger i september året före", () => {
    expect(dataFranDatum("2026-01-20")).toBe("2025-09-20");
  });
});

// ─── gräns 3: övertid per kalendermånad ──────────────────────
describe("isoVeckaMandag", () => {
  it("vecka 1 2026 börjar måndag 29 dec 2025, vecka 27 måndag 29 juni 2026", () => {
    expect(iso(isoVeckaMandag(2026, 1))).toBe("2025-12-29");
    expect(iso(isoVeckaMandag(2026, 27))).toBe("2026-06-29");
    expect(iso(isoVeckaMandag(2025, 1))).toBe("2024-12-30");
  });
});

describe("övertid per månad: fastställd utanför utjämning, uppskattad fördelning för utjämning", () => {
  // Vecka 36–38 2026 = 31 aug–20 sep. Torsdagen avgör månaden: v36 (torsdag 3 sep) → september.
  it("ej markerat block: veckornas överskott avgör månaden, summan blir periodens övertid", () => {
    const a = ars({
      tomDatum: "2026-10-13",
      perioder: [per(27, 38, 30)],
      // v27 (torsdag 2 juli) = juli · v31 (torsdag 30 juli) = juli · v32 (torsdag 6 aug) = augusti
      veckor: [vk(27, 50), vk(31, 50), vk(32, 55), vk(33, 40), vk(36, 40)],
    });
    const m = overtidPerManad(a);
    // veckoöverskott 10 + 10 + 15 = 35 men periodens övertid är 30 (resten jämnades ut av lediga veckor) → skalas med 30/35
    expect(m["2026-07"].fast).toBeCloseTo((20 * 30) / 35, 1);
    expect(m["2026-08"].fast).toBeCloseTo((15 * 30) / 35, 1);
    expect(m["2026-07"].uppskattad).toBe(0);
  });

  it("veckan över månadsskiftet hör till torsdagens månad (v27: mån 29 juni – sön 5 juli → juli)", () => {
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(27, 27, 10)], veckor: [vk(27, 50)] }));
    expect(m["2026-07"].fast).toBe(10);
    expect(m["2026-06"]).toBeUndefined();
  });

  it("överskott som bara finns i periodens genomsnitt skalas ned — övertiden i en period kan aldrig bli större än periodens", () => {
    // 60 + 30 mot bas 40+40 = 10 tim över, men veckoöverskottet är 20 → halveras
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(36, 37, 10)], veckor: [vk(36, 60), vk(37, 30)] }));
    expect(m["2026-09"].fast).toBe(10);
  });

  it("avslutad MARKERAD utjämningsperiod: hela övertiden som uppskattad på slutmånaden (söndagen i sista veckan)", () => {
    // v17–27: sista veckan slutar sön 5 juli → juli
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(17, 27, 62, { markerad: true, avslutad: true })], veckor: [vk(17, 72), vk(19, 72)] }));
    expect(m["2026-07"]).toEqual({ fast: 0, uppskattad: 62 });
    expect(m["2026-04"]).toBeUndefined();
  });

  it("pågående MARKERAD period: ställningen hittills ligger på innevarande månad, uppskattad", () => {
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(36, 42, 20, { markerad: true, avslutad: false })], veckor: [vk(36, 60)] }));
    expect(m["2026-10"]).toEqual({ fast: 0, uppskattad: 20 });
  });

  it("pågående MARKERAD period: ställningen ligger på innevarande månad, inte på periodens (framtida) slutmånad", () => {
    // v40–44: sista veckan slutar sön 1 nov; i dag är 13 okt
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(40, 44, 20, { markerad: true, avslutad: false })], veckor: [vk(41, 60)] }));
    expect(m["2026-10"]).toEqual({ fast: 0, uppskattad: 20 });
    expect(m["2026-11"]).toBeUndefined();
  });

  it("pågående EJ markerat block räknas som fastställt (ingen utjämning är dokumenterad)", () => {
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(36, 41, 20, { avslutad: false })], veckor: [vk(36, 60), vk(41, 40)] }));
    expect(m["2026-09"].fast).toBe(20);
    expect(m["2026-09"].uppskattad).toBe(0);
  });

  it("övertid år 2026 hamnar aldrig i fel år", () => {
    const m = overtidPerManad(ars({ tomDatum: "2026-10-13", perioder: [per(1, 1, 5)], veckor: [vk(1, 45)] }));
    // v1 2026: torsdag 1 jan 2026 → januari
    expect(Object.keys(m)).toEqual(["2026-01"]);
  });
});

describe("gräns 3: månadsstatus — RÖD bara för fastställd övertid, GUL för uppskattad fördelning", () => {
  const m = (fast: number, uppskattad = 0) => manadsstatus({ "2026-10": { fast, uppskattad } }, "2026-10-13");

  it("fastställd: 44,9 lugn · 45 gul · 50 gul · 50,1 röd", () => {
    expect(m(44.9).niva).toBe("lugn");
    expect(m(45).niva).toBe("gul");
    expect(m(50).niva).toBe("gul");
    expect(m(50.1).niva).toBe("rod");
  });

  it("uppskattad övertid ger ALDRIG röd — hur stor den än är — utan gul", () => {
    expect(m(0, 90).niva).toBe("gul");
    expect(m(0, 90).uppskattad).toBe(true);
    expect(m(0, 44.9).niva).toBe("lugn");
    expect(m(0, 45).niva).toBe("gul");
  });

  it("fast + uppskattad över 50 men fast ≤ 50 → gul, inte röd", () => {
    expect(m(30, 30).niva).toBe("gul");
    expect(m(50, 30).niva).toBe("gul");
    expect(m(50.1, 30).niva).toBe("rod");
  });

  it("bara innevarande och föregående månad bedöms", () => {
    const s = manadsstatus({ "2026-07": { fast: 70, uppskattad: 0 }, "2026-09": { fast: 10, uppskattad: 0 }, "2026-10": { fast: 5, uppskattad: 0 } }, "2026-10-13");
    expect(s.niva).toBe("lugn");
    const t = manadsstatus({ "2026-09": { fast: 51, uppskattad: 0 }, "2026-10": { fast: 5, uppskattad: 0 } }, "2026-10-13");
    expect(t.niva).toBe("rod");
    expect(t.manad).toBe("2026-09");
  });

  it("lika nivå i båda månaderna: den med mest övertid visas", () => {
    const s = manadsstatus({ "2026-09": { fast: 40, uppskattad: 0 }, "2026-10": { fast: 10, uppskattad: 0 } }, "2026-10-13");
    expect(s.manad).toBe("2026-09");
    expect(s.total).toBe(40);
  });

  it("januari: föregående månad är december året före", () => {
    const s = manadsstatus({ "2025-12": { fast: 60, uppskattad: 0 } }, "2026-01-10");
    expect(s.niva).toBe("rod");
    expect(s.manad).toBe("2025-12");
  });

  it("meningarna säger vad som är uppskattat", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", perioder: [per(36, 42, 60, { markerad: true, avslutad: false })], veckor: [vk(36, 60)] }) }));
    const g = gr(f, "overtid_manad");
    expect(g.niva).toBe("gul");
    expect(g.markning).toBe("uppskattad");
    expect(g.mening).toContain("uppskattad fördelning");
    expect(g.varfor).toMatch(/ATL 8 §/);
  });

  it("fastställd överskridning: röd mening med talet och månaden", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", perioder: [per(40, 41, 52, { avslutad: false })], veckor: [vk(41, 92)] }) }));
    const g = gr(f, "overtid_manad");
    expect(g.niva).toBe("rod");
    expect(g.mening).toBe("52 av 50 tim övertid i oktober — gränsen är passerad");
  });
});

// ─── gräns 4: 48 tim/vecka i snitt över fyra månader ─────────
describe("gräns 4: sammanlagd arbetstid, snitt över de senaste fyra månaderna (ATL 10 b §)", () => {
  // tomDatum 31 maj 2026 → fönstret 1 feb–31 maj = 120 dagar = 17,14 veckor
  const TOM = "2026-05-31";
  const FRAN = "2026-02-01";
  const dagarMed = (h: number, fran = FRAN, till = TOM) => {
    const ut: { datum: string; arbetad_min: number }[] = [];
    for (let d = fran; d <= till; d = plusDagar(d, 1)) if (vardag(d)) ut.push({ datum: d, arbetad_min: Math.round(h * 60) });
    return ut;
  };

  // Fönstret börjar vid förarens första registrerade tid; en timme söndagen 1 feb gör att det börjar på fönstrets första dag.
  const STARTRAD = { datum: FRAN, arbetad_min: 60 };

  it("fönstret är fyra månader bakåt, startdagen exklusive: 31 maj → 1 feb", () => {
    const r = snittVeckaH({ dagar: [STARTRAD, ...dagarMed(8)], extra: [], franvaro: [], tomDatum: TOM });
    expect(r.fran).toBe("2026-02-01");
    expect(r.dagar).toBe(120);
  });

  it("snittet = timmar / (dagar / 7)", () => {
    const r = snittVeckaH({ dagar: [STARTRAD, ...dagarMed(8)], extra: [], franvaro: [], tomDatum: TOM });
    // 8 tim × antal vardagar + startraden, dividerat med 17,14 veckor — röda dagar räknas som vanliga dagar utan arbete
    const vardagar = dagarMed(8).length;
    expect(r.timmar).toBe(vardagar * 8 + 1);
    expect(r.snitt).toBeCloseTo((vardagar * 8 + 1) / (120 / 7), 2);
  });

  it("nivåer: 40-timmarsvecka lugn · över 43,2 gul · över 48 röd", () => {
    // fönstret börjar vid första dagen med tid (mån 2 feb): 119 dagar = 17 veckor och 85 vardagar
    const niva = (h: number) => gr(byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), dagar: dagarMed(h) })), "snitt_48").niva;
    expect(niva(8)).toBe("lugn");      // 680 / 17 = 40
    expect(niva(9)).toBe("gul");       // 765 / 17 = 45
    expect(niva(10)).toBe("rod");      // 850 / 17 = 50
  });

  it("precis på gränsen räknas inte som överskridande (48,0 är gul, inte röd)", () => {
    // 48 tim/vecka × 17,142857 veckor = 822,857 tim; en dag med 822,857 tim går inte — fördela på exakta minuter
    const totalMin = Math.floor(((48 * 120) / 7) * 60);   // 48 tim/vecka över 120 dagar, avrundat NEDÅT till hel minut
    const rader = (extraMin: number) => [{ datum: "2026-02-01", arbetad_min: 60 }, { datum: "2026-02-02", arbetad_min: totalMin - 60 + extraMin }];
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), dagar: rader(0) }));
    const g = gr(f, "snitt_48");
    expect(g.varde).toBeCloseTo(48, 1);
    expect(g.niva).toBe("gul");
    const over = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), dagar: rader(600) }));
    expect(gr(over, "snitt_48").niva).toBe("rod");
  });

  it("extra_tid (perioddagar) räknas som arbetstid", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), dagar: dagarMed(8), extra: dagarMed(2).map(d => ({ datum: d.datum, minuter: d.arbetad_min })) }));
    expect(gr(f, "snitt_48").niva).toBe("rod");
  });

  it("TOLKNING: semester och sjukdagar räknas som 8 tim per vardag (ATL 10 b §: likställs med fullgjord arbetstid)", () => {
    const utanFranvaro = snittVeckaH({ dagar: dagarMed(8).filter(d => d.datum < "2026-03-02" || d.datum > "2026-03-06"), extra: [], franvaro: [], tomDatum: TOM });
    const medSemester = snittVeckaH({
      dagar: dagarMed(8).filter(d => d.datum < "2026-03-02" || d.datum > "2026-03-06"), extra: [], tomDatum: TOM,
      franvaro: [{ medarbetare_id: "m1", typ: "semester", startdatum: "2026-03-02", slutdatum: "2026-03-06", status: "godkänd" }],
    });
    expect(medSemester.timmar - utanFranvaro.timmar).toBe(40);
    expect(medSemester.franvaroTimmar).toBe(40);
    const sjuk = snittVeckaH({
      dagar: dagarMed(8).filter(d => d.datum !== "2026-03-02"), extra: [], tomDatum: TOM,
      franvaro: [{ medarbetare_id: "m1", typ: "sjuk", startdatum: "2026-03-02", slutdatum: "2026-03-02", status: "registrerad" }],
    });
    expect(sjuk.franvaroTimmar).toBe(8);
  });

  it("andra frånvarotyper (VAB, ATK, tjänstledig …) likställs inte — lagen nämner bara semester och sjukfrånvaro", () => {
    for (const typ of ["vab", "atk", "komp", "foraldraledig", "tjanstledig", "permission"] as const) {
      const r = snittVeckaH({
        dagar: [STARTRAD], extra: [], tomDatum: TOM,
        franvaro: [{ medarbetare_id: "m1", typ, startdatum: "2026-03-02", slutdatum: "2026-03-06", status: "godkänd" }],
      });
      expect(r.franvaroTimmar).toBe(0);
    }
  });

  it("väntande och nekad semester är ingen frånvaro", () => {
    for (const status of ["väntar", "nekad"] as const) {
      const r = snittVeckaH({ dagar: [], extra: [], tomDatum: TOM, franvaro: [{ medarbetare_id: "m1", typ: "semester", startdatum: "2026-03-02", slutdatum: "2026-03-06", status }] });
      expect(r.franvaroTimmar).toBe(0);
    }
  });

  it("röda dagar och helger räknas inte som frånvarodagar (Kristi himmelsfärd 14 maj, lördag/söndag)", () => {
    const r = snittVeckaH({
      dagar: [STARTRAD], extra: [], tomDatum: TOM,
      franvaro: [{ medarbetare_id: "m1", typ: "semester", startdatum: "2026-05-11", slutdatum: "2026-05-17", status: "godkänd" }],
    });
    // mån–fre = 5 dagar, men torsdag 14 maj är röd → 4 × 8
    expect(r.franvaroTimmar).toBe(32);
  });

  it("ARBETE VINNER: en semesterdag där föraren ändå arbetade ≥ 60 min likställs inte på toppen av arbetet", () => {
    const r = snittVeckaH({
      dagar: [{ datum: "2026-03-02", arbetad_min: 480 }], extra: [], tomDatum: TOM,
      franvaro: [{ medarbetare_id: "m1", typ: "semester", startdatum: "2026-03-02", slutdatum: "2026-03-02", status: "godkänd" }],
    });
    expect(r.franvaroTimmar).toBe(0);
    expect(r.timmar).toBe(8);
  });

  it("deldag: frånvaron fyller upp till 8 tim (deldagTimmar)", () => {
    const r = snittVeckaH({
      dagar: [{ datum: "2026-03-02", arbetad_min: 180 }], extra: [], tomDatum: TOM,
      franvaro: [{ medarbetare_id: "m1", typ: "sjuk", startdatum: "2026-03-02", slutdatum: "2026-03-02", status: "registrerad", fran_tid: "11:00", till_tid: "16:00" }],
    });
    expect(r.franvaroTimmar).toBe(5);
  });

  it("tid före fönstret (31 jan, startdagen exklusive) räknas inte", () => {
    const r = snittVeckaH({ dagar: [{ datum: "2026-01-31", arbetad_min: 6000 }, STARTRAD], extra: [], franvaro: [], tomDatum: TOM });
    expect(r.fran).toBe("2026-02-01");
    expect(r.timmar).toBe(1);
  });

  it("underlagsgränsen: exakt 28 dagars registrerad tid ger ett snitt, 27 dagar inte", () => {
    const med = (fran: string) => snittVeckaH({ dagar: [{ datum: fran, arbetad_min: 60 }], extra: [], franvaro: [], tomDatum: TOM });
    expect(med("2026-05-04").dagar).toBe(28);
    expect(med("2026-05-04").snitt).not.toBeNull();
    expect(med("2026-05-05").dagar).toBe(27);
    expect(med("2026-05-05").snitt).toBeNull();
  });

  it("nyanställd: fönstret börjar vid första registrerade dagen, inte fyra månader bakåt", () => {
    const r = snittVeckaH({ dagar: dagarMed(8, "2026-04-06"), extra: [], franvaro: [], tomDatum: TOM });
    expect(r.fran).toBe("2026-04-06");
    expect(r.dagar).toBe(56);
    expect(r.snitt).toBeCloseTo(((r.timmar) / 8), 1);
  });

  it("under fyra veckors underlag finns inget snitt — ärlig data: null, aldrig en gissning", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), dagar: dagarMed(14, "2026-05-18") }));
    const g = gr(f, "snitt_48");
    expect(g.varde).toBeNull();
    expect(g.niva).toBe("lugn");
    expect(g.mening).toContain("För kort underlag");
  });

  it("ingen data alls: inget snitt, inte noll", () => {
    const g = gr(byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }) })), "snitt_48");
    expect(g.varde).toBeNull();
  });

  it("Varför?-texten märker tolkningen", () => {
    const g = gr(byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), dagar: dagarMed(8) })), "snitt_48");
    expect(g.markning).toBe("tolkning");
    expect(g.varfor).toMatch(/ATL 10 b §/);
    expect(g.varfor).toMatch(/Tolkning/);
    expect(g.varfor).toMatch(/8 tim per vardag/);
  });
});

// ─── gräns 5 och 6: vila ─────────────────────────────────────
describe("gräns 5 (veckovila, ATL 14 §) och gräns 6 (dygnsvila, ATL 13 §)", () => {
  // Sex veckor mån–fre 06:00–15:00 (24 aug – 2 okt) som grund: veckovilans fönster behöver sju dagars data före den första
  // dag som bedöms, annars ser ett normalt schema ut som ett brott i datats första vecka. Testveckan är 5–9 okt.
  const pass = (datum: string, start = "06:00", slut = "15:00") => ({ datum, start_tid: start, slut_tid: slut, arbetad_min: 480 });
  const normalvecka = (mandag: string) => [0, 1, 2, 3, 4].map(i => pass(plusDagar(mandag, i)));
  const grund = () => [0, 7, 14, 21, 28, 35].flatMap(n => normalvecka(plusDagar("2026-08-24", n)));
  const utan = (dagar: { datum: string }[], ...datum: string[]) => dagar.filter(d => !datum.includes(d.datum));
  const TOM = "2026-10-09";
  const vila = (dagar: any[], extra: any[] = [], tom = TOM) => byggArbetstid(indata({ arsovertid: ars({ tomDatum: tom }), dagar, extra }));
  const testvecka = (slutMandag: string) => [pass("2026-10-05", "06:00", slutMandag), pass("2026-10-06"), pass("2026-10-07"), pass("2026-10-08"), pass("2026-10-09")];

  it("normalt arbetsschema: ingen vila under kravet, båda lugna", () => {
    const f = vila([...grund(), ...normalvecka("2026-10-05")]);
    expect(gr(f, "veckovila").niva).toBe("lugn");
    expect(gr(f, "dygnsvila").niva).toBe("lugn");
  });

  it("dygnsvila 10 h → röd (kravet är 11)", () => {
    const g = gr(vila([...grund(), ...testvecka("20:00")]), "dygnsvila");
    expect(g.niva).toBe("rod");
    expect(g.varde).toBe(10);
    expect(g.mening).toBe("Dygnsvilan blev 10 tim den 5 okt — minst 11 krävs");
  });

  it("dygnsvila precis 11,0 h är inte ett brott: gul (kravet uppfyllt men under 12-timmarsvarningen)", () => {
    const g = gr(vila([...grund(), ...testvecka("19:00")]), "dygnsvila");
    expect(g.varde).toBe(11);
    expect(g.niva).toBe("gul");
  });

  it("dygnsvila precis 12,0 h är lugn (varningsgränsen är UNDER 12)", () => {
    expect(gr(vila([...grund(), ...testvecka("18:00")]), "dygnsvila").niva).toBe("lugn");
  });

  it("dygnsvila 10,9 h → röd, 11,1 h → gul — och 10 h 58 min är röd trots att den avrundas till 11,0", () => {
    const niva = (slut: string) => gr(vila([...grund(), ...testvecka(slut)]), "dygnsvila").niva;
    expect(niva("19:06")).toBe("rod");   // 10 h 54 min
    expect(niva("19:02")).toBe("rod");   // 10 h 58 min: visas som 11 tim, men är under kravet
    expect(niva("18:54")).toBe("gul");   // 11 h 06 min
  });

  it("NATTPASS över midnatt: pass mån 22:00–06:00 och tis 14:00 ger 8 tim vila (inte 32 — sluttiden är nästa dygn)", () => {
    const dagar = [...utan(grund(), "2026-10-05", "2026-10-06"), pass("2026-10-05", "22:00", "06:00"), pass("2026-10-06", "14:00", "22:00")];
    const g = gr(vila(dagar), "dygnsvila");
    expect(g.niva).toBe("rod");
    expect(g.varde).toBe(8);
  });

  it("ett pass med samma start och slut (06:00–06:00) är 24 tim och slutar nästa dygn — som arbetsdagSpanMin", () => {
    const dagar = [...utan(grund(), "2026-10-05", "2026-10-06"), pass("2026-10-05", "06:00", "06:00"), pass("2026-10-06", "14:00", "22:00")];
    const g = gr(vila(dagar), "dygnsvila");
    expect(g.niva).toBe("rod");
    expect(g.varde).toBe(8);
  });

  it("en dygnsvila bedöms efter det PASS som ledde fram till den (datumet visas)", () => {
    const g = gr(vila([...grund(), ...testvecka("20:00")]), "dygnsvila");
    expect(g.mening).toContain("5 okt");
  });

  it("brott äldre än 28 dagar bedöms inte (de ligger kvar i Vilobrott-listan, men är inget att göra i dag)", () => {
    const dagar = [...utan(grund(), "2026-09-07", "2026-09-08"), pass("2026-09-07", "06:00", "20:00"), pass("2026-09-08")];
    expect(gr(vila(dagar), "dygnsvila").niva).toBe("lugn");
  });

  it("brott precis 28 dagar tillbaka räknas, 29 dagar tillbaka inte", () => {
    const med = (dag: string) => {
      const nasta = plusDagar(dag, 1);
      return gr(vila([...utan(grund(), dag, nasta), pass(dag, "06:00", "20:00"), pass(nasta)]), "dygnsvila").niva;
    };
    expect(med("2026-09-11")).toBe("rod");    // 28 dagar före 9 okt
    expect(med("2026-09-10")).toBe("lugn");   // 29 dagar före
  });

  it("veckovila: åtta arbetsdagar i rad utan 36 tim vila → röd", () => {
    const dagar = [...grund(), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => pass(plusDagar("2026-10-05", i)))];
    const g = gr(vila(dagar, [], "2026-10-12"), "veckovila");
    expect(g.niva).toBe("rod");
    expect(g.varde).toBe(15);
    expect(g.mening).toBe("Veckovilan blev bara 15 tim — minst 36 krävs");
  });

  // Mån–lör-veckor 24 aug – 3 okt; lördagens sluttid avgör veckovilan (lör → mån 06:00).
  describe("veckovilan på gränsen (arbetsvecka mån–lör, vilan = lördagens slut → måndag 06:00)", () => {
    const seksdagars = (slutLordag: string) => [0, 7, 14, 21, 28, 35].flatMap(n => {
      const man = plusDagar("2026-08-24", n);
      return [0, 1, 2, 3, 4].map(i => pass(plusDagar(man, i))).concat(pass(plusDagar(man, 5), "06:00", slutLordag));
    });
    const niva = (slutLordag: string) => gr(vila(seksdagars(slutLordag), [], "2026-10-03"), "veckovila");
    it("35 tim → röd · 36 tim → gul (kravet uppfyllt, under 40) · 39 tim → gul · 40 tim → lugn", () => {
      expect(niva("19:00").niva).toBe("rod");
      expect(niva("19:00").varde).toBe(35);
      expect(niva("18:00").niva).toBe("gul");
      expect(niva("18:00").varde).toBe(36);
      expect(niva("15:00").niva).toBe("gul");
      expect(niva("14:00").niva).toBe("lugn");
    });
    it("ett gammalt brott i datats första vecka döljer inte en pågående gul vila (varje dag bedöms för sig)", () => {
      // lördagsvilan 36 tim i hela perioden: varje bedömd dag har ett fönster med 36 tim — gul från första bedömda dagen
      expect(niva("18:00").mening).toMatch(/^Lägsta veckovila 36 tim/);
    });
  });

  describe("veckovila: fönstret på 28 dagar (tom 9 okt → första bedömda dag 11 sep)", () => {
    // En ledig period (31 aug – 2 sep resp. 31 aug – 1 sep… se nedan) följs av en obruten arbetsrad om nio dagar; veckovilans
    // fönster [N-6, N] saknar då vila på 36 tim exakt dag N = rad-start + 7. Därefter vilar föraren över en helg.
    const grundUtanSep = () => grund().filter(d => d.datum < "2026-08-31" || d.datum > "2026-09-13");
    const rad = (fran: string, antal: number) => Array.from({ length: antal }, (_, k) => pass(plusDagar(fran, k)));
    it("brottet på 11 sep (28 dagar före) bedöms → röd", () => {
      const g = gr(vila([...grundUtanSep(), ...rad("2026-09-04", 9)]), "veckovila");
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(15);
    });
    it("brottet på 10 sep (29 dagar före) bedöms inte → lugn", () => {
      const g = gr(vila([...grundUtanSep(), ...rad("2026-09-03", 9)]), "veckovila");
      expect(g.niva).toBe("lugn");
    });
    it("pass efter tomDatum räknas inte", () => {
      const g = gr(vila([...grund(), ...normalvecka("2026-10-05"), ...rad("2026-10-10", 12)]), "veckovila");
      expect(g.niva).toBe("lugn");
    });
  });

  it("ETT pass i fönstret: tiden FÖRE första passet räknas som vila (6 dygn + 6 tim = 150 tim), inte 'ingen vila'", () => {
    const g = gr(vila([pass("2026-10-08")]), "veckovila");
    expect(g.varde).toBe(150);
    expect(g.niva).toBe("lugn");
  });

  describe("veckovilan i ändarna (prod-kontroll 2026-10-13: Oscar Ringberg 14,5 tim, Joacim 13,3 tim var falsklarm)", () => {
    const NU = new Date("2026-10-13T10:00:00Z");   // 12:00 i Stockholm (CEST) — nu är ett RIKTIGT ögonblick, kortet gör om det till väggklocka
    const med = (dagar: any[], nu?: Date, extra: any[] = []) =>
      gr(byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13" }), dagar, extra, nu })), "veckovila");
    const rad = (fran: string, antal: number) => Array.from({ length: antal }, (_, k) => pass(plusDagar(fran, k)));
    const grundTillFre25 = () => [0, 7, 14, 21, 28].flatMap(n => normalvecka(plusDagar("2026-08-24", n)));   // 24 aug – 25 sep

    it("NY FÖRARE (Oscar): anställd 28 sep, inga pass före — vilan före första passet räknas, så inget brott de första dagarna", () => {
      // mån–fre från 28 sep, sedan mån 12 och tis 13 okt
      const dagar = [...normalvecka("2026-09-28"), ...normalvecka("2026-10-05"), pass("2026-10-12"), pass("2026-10-13")];
      const g = med(dagar, NU);
      expect(g.niva).toBe("lugn");
      expect(g.varde!).toBeGreaterThanOrEqual(36);
    });

    it("samma nyanställd UTAN den regeln hade gett falsklarmet (15 tim, röd) — fönstren 29 sep–2 okt har bara en vecka pass", () => {
      // dokumenterar vad som rättades: veckovilaPerDag utan vilaForeForstaPass ger 15 tim
      const dagar = [...normalvecka("2026-09-28"), ...normalvecka("2026-10-05"), pass("2026-10-12"), pass("2026-10-13")];
      const utanRegel = veckovilaPerDag(dagar.map(d => ({ datum: d.datum, start_tid: d.start_tid, slut_tid: d.slut_tid })), 7).filter(d => d.datum >= "2026-09-29" && d.datum <= "2026-10-02");
      expect(Math.min(...utanRegel.map(d => d.max_h))).toBe(15);
      const medRegel = veckovilaPerDag(dagar.map(d => ({ datum: d.datum, start_tid: d.start_tid, slut_tid: d.slut_tid })), 7, { vilaForeForstaPass: true }).filter(d => d.datum >= "2026-09-29" && d.datum <= "2026-10-02");
      expect(Math.min(...medRegel.map(d => d.max_h))).toBeGreaterThanOrEqual(36);
    });

    it("PÅGÅENDE VILA (Joacim): 8 dagar i rad t.o.m. 6 okt, sedan ledig — vilan efter sista passet fram till nu räknas (öppen lucka = slutar nu)", () => {
      const dagar = [...grundTillFre25(), ...rad("2026-09-29", 8)];                 // tis 29 sep – tis 6 okt, sedan inget
      expect(med(dagar, NU).niva).toBe("lugn");                                     // 6 okt 15:00 → 13 okt 12:00 = 165 tim
      expect(med(dagar).niva).toBe("rod");                                          // utan "nu": som förut, 15 tim
      expect(med(dagar).varde).toBe(15);
    });

    it("en riktig sjuk-dagars-streak döljs inte av vilan efter den: 10 dagar i rad ger fortfarande röd (fönstret 6 okt saknar vila)", () => {
      const dagar = [...grundTillFre25(), ...rad("2026-09-29", 10)];                // 29 sep – 8 okt
      const g = med(dagar, NU);
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(15);
    });

    it("öppen lucka under 36 tim räcker inte: 8 dagar i rad t.o.m. 12 okt 15:00, nu 13 okt 11:00 → 20 tim, röd", () => {
      const dagar = [...grundTillFre25(), ...normalvecka("2026-09-28"), ...rad("2026-10-05", 8)];   // vanlig vecka, sedan 5–12 okt utan vilodag
      const g = med(dagar, new Date("2026-10-13T09:00:00Z"));   // 11:00 i Stockholm
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(20);
    });

    it("vilan visas aldrig längre än fönstret (168 tim = 7 dygn) — en förare som varit ledig länge får '168', inte '500'", () => {
      const g = med([pass("2026-09-20")], NU);
      expect(g.varde).toBe(168);
    });
  });

  it("perioddagar (extra_tid med klockslag) räknas in i vilan precis som i Vilobrott-listan", () => {
    // tisdag 6 okt har ingen maskinrad men en period 05:00–21:00; måndagen slutar 20:00 → dygnsvila 9 h
    const dagar = [...utan(grund(), "2026-10-06"), pass("2026-10-05", "06:00", "20:00"), pass("2026-10-07"), pass("2026-10-08"), pass("2026-10-09")];
    const extra = [{ datum: "2026-10-06", minuter: 960, start_tid: "05:00", slut_tid: "21:00", aktivitet_typ: "planering" }];
    const g = gr(vila(dagar, extra), "dygnsvila");
    expect(g.niva).toBe("rod");
    expect(g.varde).toBe(9);
  });

  it("utan pass i fönstret: ingen vila att bedöma — lugn, aldrig 'ingen vila'", () => {
    const g = gr(vila([]), "dygnsvila");
    expect(g.niva).toBe("lugn");
    expect(g.varde).toBeNull();
    expect(gr(vila([]), "veckovila").varde).toBeNull();
  });
});

// ─── restid ──────────────────────────────────────────────────
describe("restid ingår bara om den finns i underlaget", () => {
  const TOM = "2026-10-09";
  it("ingen extra_tid med aktivitet restid → 'Restid ingår inte' i notiserna och restidSaknas", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), extra: [{ datum: "2026-10-05", minuter: 120, start_tid: "16:00", slut_tid: "18:00", aktivitet_typ: "planering" }] }));
    expect(f.restidSaknas).toBe(true);
    expect(f.notiser.join(" ")).toContain("Restid ingår inte");
  });
  it("restid registrerad inom fyra månader → ingen notis", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), extra: [{ datum: "2026-08-05", minuter: 60, start_tid: null, slut_tid: null, aktivitet_typ: "restid" }] }));
    expect(f.restidSaknas).toBe(false);
    expect(f.notiser.join(" ")).not.toContain("Restid ingår inte");
  });
  it("fyramånadersfönstret börjar 10 juni för 9 okt (startdagen exklusive): restid 9 juni räknas inte, 10 juni gör", () => {
    const ex = (datum: string) => [{ datum, minuter: 60, start_tid: null, slut_tid: null, aktivitet_typ: "restid" }];
    expect(byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), extra: ex("2026-06-09") })).restidSaknas).toBe(true);
    expect(byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), extra: ex("2026-06-10") })).restidSaknas).toBe(false);
  });
  it("restid för mer än fyra månader sedan räknas inte som 'finns i underlaget'", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), extra: [{ datum: "2026-05-05", minuter: 60, start_tid: null, slut_tid: null, aktivitet_typ: "restid" }] }));
    expect(f.restidSaknas).toBe(true);
  });
  it("notisen förklarar vad som saknas: gränserna 4–6 kan vara för snälla", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }) }));
    expect(f.notiser[0]).toMatch(/Restid ingår inte/);
    expect(f.notiser[0]).toMatch(/vila|arbetstid/);
  });
});

// ─── förare: värsta nivån och sortering ──────────────────────
describe("förarens värsta nivå", () => {
  it("varsta = den värsta gränsen", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", genomsnitt: 230 }) }));
    expect(f.varsta).toBe("gul");
    const g = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", genomsnitt: 260 }) }));
    expect(g.varsta).toBe("rod");
    const h = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13", genomsnitt: 10 }) }));
    expect(h.varsta).toBe("lugn");
  });

  it("alltid sex gränser, i lagens ordning", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13" }) }));
    expect(f.granser.map(g => g.id)).toEqual(["allman_overtid_ar", "extra_overtid_ar", "overtid_manad", "snitt_48", "veckovila", "dygnsvila"]);
  });

  it("varje gräns har en mening och en Varför?-text med paragraf", () => {
    const f = byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13" }) }));
    for (const g of f.granser) {
      expect(g.mening.length).toBeGreaterThan(5);
      expect(g.varfor).toMatch(/§/);
      expect(g.mening).not.toMatch(/\n/);
    }
  });
});

describe("sorteraAttGora: Översiktens ordning", () => {
  const forare = (namn: string, ov: number) => byggArbetstid(indata({ medarbetare_id: namn, namn, arsovertid: ars({ tomDatum: "2026-10-13", genomsnitt: ov }) }));
  it("lugna förare tas inte med", () => {
    expect(sorteraAttGora([forare("Anna", 10), forare("Bo", 100)])).toEqual([]);
  });
  it("röda före gula, och inom nivån den som ligger närmast sin gräns", () => {
    const lista = sorteraAttGora([forare("Gul", 230), forare("RödLite", 255), forare("RödMycket", 300), forare("Lugn", 1), forare("Gul2", 240)]);
    expect(lista.map(f => f.namn)).toEqual(["RödMycket", "RödLite", "Gul2", "Gul"]);
  });
  it("lika nära: efter namn", () => {
    expect(sorteraAttGora([forare("Östen", 260), forare("Anna", 260)]).map(f => f.namn)).toEqual(["Anna", "Östen"]);
  });
});

// ─── maskinflytt (flyttdag) ──────────────────────────────────
describe("flyttdag: maskinflyttens körtid räknas i gränserna 4–6 (bara i kortet)", () => {
  // Prod 2026-09-25: 400 min flytt, 0 min i arbetsdag/extra_tid. flyttdag.starttid är timestamptz (UTC); arbetsdag-tider är lokal klocktid.
  const NU = new Date("2026-10-13T10:00:00Z");   // 12:00 i Stockholm (CEST)
  const f = (starttid: string, total_tid_min: number | null, o: { sluttid?: string | null } = {}) => ({ starttid, total_tid_min, sluttid: o.sluttid ?? null });

  describe("flyttdagTillPass: UTC → Stockholmstid", () => {
    it("sommartid (UTC+2): 04:00Z = 06:00, 400 min → 06:00–12:40", () => {
      const r = flyttdagTillPass([f("2026-09-25T04:00:00Z", 400)], NU);
      expect(r.pass).toEqual([{ datum: "2026-09-25", startMin: 360, slutMin: 760, min: 400 }]);
    });
    it("vintertid (UTC+1): 05:00Z = 06:00", () => {
      expect(flyttdagTillPass([f("2026-12-01T05:00:00Z", 60)], NU).pass[0]).toMatchObject({ datum: "2026-12-01", startMin: 360 });
    });
    it("lokal midnatt: 22:30Z den 25 sep = 00:30 den 26 sep (datumet är det lokala)", () => {
      expect(flyttdagTillPass([f("2026-09-25T22:30:00Z", 120)], NU).pass[0]).toMatchObject({ datum: "2026-09-26", startMin: 30, slutMin: 150 });
    });
    it("sommartidens slut 25 okt 2026 (03:00 → 02:00 vid 01:00Z): 23:30Z = 01:30 CEST, 01:30Z = 02:30 CET", () => {
      expect(flyttdagTillPass([f("2026-10-24T23:30:00Z", 60)], NU).pass[0]).toMatchObject({ datum: "2026-10-25", startMin: 90 });
      expect(flyttdagTillPass([f("2026-10-25T01:30:00Z", 60)], NU).pass[0]).toMatchObject({ datum: "2026-10-25", startMin: 150 });
    });
    it("pågående dag (ingen sluttid, ingen mätt tid) räknas t.o.m. nu", () => {
      const r = flyttdagTillPass([f("2026-10-13T06:00:00Z", null)], NU);          // 08:00 lokal, nu 12:00 → 240 min
      expect(r.pass).toEqual([{ datum: "2026-10-13", startMin: 480, slutMin: 720, min: 240 }]);
    });
    it("pågående dag utan 'nu' går inte att räkna: utesluten, inte noll", () => {
      const r = flyttdagTillPass([f("2026-10-13T06:00:00Z", null)]);
      expect(r.pass).toEqual([]);
      expect(r.uteslutna).toBe(1);
    });
    it("avslutad dag utan mätt tid, och dag över 16 tim (skräpskydd), utesluts och räknas", () => {
      const r = flyttdagTillPass([f("2026-10-13T00:00:00Z", null, { sluttid: "2026-10-13T05:00:00Z" }), f("2026-09-26T04:00:00Z", 961), f("2026-09-27T04:00:00Z", 960), f("2026-09-28T04:00:00Z", 0)], NU);
      expect(r.pass.map(p => p.datum)).toEqual(["2026-09-27"]);
      expect(r.uteslutna).toBe(3);      // den avslutade dagen startade 2 tim före 'nu' och skulle annars ha blivit 600 min
    });
    it("fönstret är LOKALA datum, båda ändar inklusive: före 'fran' och efter 'till' räknas inte", () => {
      const rader = [f("2026-09-24T04:00:00Z", 60), f("2026-09-25T04:00:00Z", 60), f("2026-09-26T04:00:00Z", 60), f("2026-09-27T04:00:00Z", 60)];
      const r = flyttdagTillPass(rader, NU, { fran: "2026-09-25", till: "2026-09-26" });
      expect(r.pass.map(p => p.datum)).toEqual(["2026-09-25", "2026-09-26"]);
      expect(r.uteslutna).toBe(0);
    });
    it("pågående dag som startade för mer än 16 tim sedan är skräp — utesluten", () => {
      expect(flyttdagTillPass([f("2026-10-12T10:00:00Z", null)], NU).pass).toEqual([]);   // 12 okt 12:00 lokal → 24 tim
    });
  });

  describe("gräns 4: tiden läggs till, utan dubbelräkning mot det som redan finns", () => {
    const TOM = "2026-10-13";
    const FRAN = "2026-09-14";
    const mf = (fl: any[], o: { dagar?: any[]; extra?: any[] } = {}) => snittVeckaH({ dagar: o.dagar ?? [], extra: o.extra ?? [], franvaro: [], tomDatum: TOM, flytt: fl, nu: NU } as any);
    const start = { datum: FRAN, arbetad_min: 60 };            // förarens första registrerade tid (gör fönstret 30 dagar)

    it("400 min flytt utan annat underlag den dagen = +6,67 tim (2026-09-25: 400 min flytt, 0 min i underlaget)", () => {
      const utan = mf([], { dagar: [start] });
      const med = mf([f("2026-09-25T04:00:00Z", 400)], { dagar: [start] });
      expect(Math.round((med.timmar - utan.timmar) * 100) / 100).toBe(6.67);
    });
    it("flytten överlappar ett maskinpass 08:00–15:00 (480 min): bara det som ligger utanför passet läggs till (06:00–12:40 → 120 min)", () => {
      const dag = { datum: "2026-09-25", arbetad_min: 480, start_tid: "08:00:00", slut_tid: "15:00:00" };
      const utan = mf([], { dagar: [start, dag] });
      const med = mf([f("2026-09-25T04:00:00Z", 400)], { dagar: [start, dag] });
      expect(Math.round((med.timmar - utan.timmar) * 100) / 100).toBe(2);
    });
    it("flytten överlappar en extra_tid-period med klockslag: samma sak", () => {
      const ex = { datum: "2026-09-25", minuter: 120, start_tid: "10:00", slut_tid: "12:00" };
      const utan = mf([], { dagar: [start], extra: [ex] });
      const med = mf([f("2026-09-25T04:00:00Z", 400)], { dagar: [start], extra: [ex] });
      expect(Math.round((med.timmar - utan.timmar) * 100) / 100).toBe(4.67);      // 400 − 120 = 280 min
    });
    it("maskinrad utan klockslag går inte att jämföra mot: hela flytten läggs till", () => {
      const dag = { datum: "2026-09-25", arbetad_min: 480 };
      const utan = mf([], { dagar: [start, dag] });
      const med = mf([f("2026-09-25T04:00:00Z", 400)], { dagar: [start, dag] });
      expect(Math.round((med.timmar - utan.timmar) * 100) / 100).toBe(6.67);
    });
    it("flytten är en egen sak per dag: två flyttdagar summeras", () => {
      const utan = mf([], { dagar: [start] });
      const med = mf([f("2026-09-25T04:00:00Z", 60), f("2026-09-26T04:00:00Z", 120)], { dagar: [start] });
      expect(med.timmar - utan.timmar).toBe(3);
    });
    it("ger fortfarande ett snitt när flytten är första registrerade tid (första dagen med tid räknas)", () => {
      const r = mf([f("2026-09-14T04:00:00Z", 480)]);
      expect(r.fran).toBe("2026-09-14");
      expect(r.snitt).not.toBeNull();
    });
  });

  describe("gräns 5 och 6: flytten är arbetstid och förlänger passet", () => {
    const pass = (datum: string, start = "06:00", slut = "15:00") => ({ datum, start_tid: start, slut_tid: slut, arbetad_min: 480 });
    const normal = (mandag: string) => [0, 1, 2, 3, 4].map(i => pass(plusDagar(mandag, i)));
    const grund = () => [0, 7, 14, 21, 28, 35, 42].flatMap(n => normal(plusDagar("2026-08-24", n)));   // 24 aug – 9 okt
    const utan = <T extends { datum: string }>(dagar: T[], ...d: string[]) => dagar.filter(x => !d.includes(x.datum));
    const med = (dagar: any[], flytt: any[]) => byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13" }), dagar, flytt, nu: NU }));
    // 2026-10: sommartid, lokal = UTC + 2 tim

    it("flytt tis 6 okt 01:00–08:00 (23:00Z mån) efter pass mån 06–15 → dygnsvila 10 tim, röd — flytten var inte med i arbetsdag", () => {
      const g = gr(med(utan(grund(), "2026-10-06"), [f("2026-10-05T23:00:00Z", 420)]), "dygnsvila");
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(10);
    });
    it("samma flytt starttid 02:00 → 11 tim (gul), 03:00 → 12 tim (lugn)", () => {
      expect(gr(med(utan(grund(), "2026-10-06"), [f("2026-10-06T00:00:00Z", 360)]), "dygnsvila")).toMatchObject({ niva: "gul", varde: 11 });
      expect(gr(med(utan(grund(), "2026-10-06"), [f("2026-10-06T01:00:00Z", 360)]), "dygnsvila").niva).toBe("lugn");
    });
    it("flytt EFTER ett maskinpass samma dag förlänger passet: pass 06–15 + flytt 15:00–21:00, nästa pass 06:00 → 9 tim vila", () => {
      // 15:00 lokal = 13:00Z
      const g = gr(med(grund(), [f("2026-10-07T13:00:00Z", 360)]), "dygnsvila");
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(9);
    });
    it("flytt som korsar midnatt (22:00–02:00) på en dag utan pass: vilan räknas från 02:00", () => {
      // tis 6 okt 22:00 lokal = 20:00Z; slutar ons 02:00 → ons-passet 06:00 ger 4 tim
      const g = gr(med(utan(grund(), "2026-10-06"), [f("2026-10-06T20:00:00Z", 240)]), "dygnsvila");
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(4);
    });
    it("flytt FÖRE dagens maskinpass förlänger passets start: pass tis 08–16 + flytt 02:00–07:00 → vila efter måndagens 15:00 blir 11 tim, gul", () => {
      // 02:00 lokal = 00:00Z, 300 min
      const g = gr(med(utan(grund(), "2026-10-06").concat([pass("2026-10-06", "08:00", "16:00")]), [f("2026-10-06T00:00:00Z", 300)]), "dygnsvila");
      expect(g.niva).toBe("gul");
      expect(g.varde).toBe(11);
    });
    it("PÅGÅENDE flytt (ingen sluttid, ingen mätt tid) räknas t.o.m. nu: startade tis 13 okt 03:00, nu 08:00 → måndagens pass 06–20 ger 7 tim vila", () => {
      const dagar = [...utan(grund(), "2026-10-05"), pass("2026-10-12", "06:00", "20:00")];
      const g = gr(byggArbetstid(indata({ arsovertid: ars({ tomDatum: "2026-10-13" }), dagar, flytt: [f("2026-10-13T01:00:00Z", null)], nu: new Date("2026-10-13T06:00:00Z") })), "dygnsvila");
      expect(g.niva).toBe("rod");
      expect(g.varde).toBe(7);
    });
    it("flytt på en dag där maskinpasset redan innehåller den (06:00–12:40 inom 06–15) ändrar ingenting", () => {
      const g = gr(med(grund(), [f("2026-10-07T04:00:00Z", 400)]), "dygnsvila");
      expect(g.niva).toBe("lugn");
      expect(g.varde).toBe(15);
    });
    it("veckovila: flytt lör 06:00–12:40 delar helgvilan i 15 + 41,3 tim — fortfarande ≥ 40, lugn", () => {
      const g = gr(med(grund(), [f("2026-10-03T04:00:00Z", 400)]), "veckovila");
      expect(g.niva).toBe("lugn");
    });
    it("veckovila: flytt lör 06:00–16:40 (700 min) lämnar 37,3 tim → gul; söndag 12:00–14:00 på toppen lämnar 18/20 → röd", () => {
      const lor = med(grund(), [f("2026-10-03T04:00:00Z", 640)]);                    // lör 06:00–16:40 → mån 06:00 = 37,3 tim
      expect(gr(lor, "veckovila")).toMatchObject({ niva: "gul", varde: 37.3 });
      const bada = med(grund(), [f("2026-10-03T04:00:00Z", 640), f("2026-10-04T10:00:00Z", 120)]);   // + sön 12:00–14:00 → luckor ≈ 19,3 och 16
      expect(gr(bada, "veckovila").niva).toBe("rod");
    });
  });

  describe("kortets text om restid och maskinflytt", () => {
    const TOM = "2026-10-13";
    const bygg = (o: Partial<ArbetstidIndata>) => byggArbetstid(indata({ arsovertid: ars({ tomDatum: TOM }), nu: NU, ...o }));
    it("flyttdagar i underlaget: kortet säger INTE 'Restid ingår inte' — det säger att maskinflytt ingår, med dagar och timmar", () => {
      const r = bygg({ flytt: [f("2026-09-25T04:00:00Z", 400), f("2026-09-26T04:00:00Z", 120)] });
      expect(r.restidSaknas).toBe(false);
      expect(r.notiser.join(" ")).not.toContain("Restid ingår inte");
      expect(r.notiser[0]).toBe("Maskinflytt ingår: 2 flyttdagar, 8,7 tim (körningen fram till sista objektet; hemresan ingår inte).");
    });
    it("en flyttdag: singular", () => {
      expect(bygg({ flytt: [f("2026-09-25T04:00:00Z", 60)] }).notiser[0]).toBe("Maskinflytt ingår: 1 flyttdag, 1 tim (körningen fram till sista objektet; hemresan ingår inte).");
    });
    it("varken restid eller flytt: 'Restid ingår inte' (och maskinflytt)", () => {
      const r = bygg({});
      expect(r.restidSaknas).toBe(true);
      expect(r.notiser[0]).toMatch(/^Restid ingår inte/);
      expect(r.notiser[0]).toMatch(/maskinflytt/);
    });
    it("registrerad restid och inga flyttdagar: ingen notis alls", () => {
      const r = bygg({ extra: [{ datum: "2026-09-05", minuter: 60, start_tid: null, slut_tid: null, aktivitet_typ: "restid" }] });
      expect(r.notiser).toEqual([]);
    });
    it("uteslutna flyttdagar (saknar mätt tid / över 16 tim) sägs", () => {
      const r = bygg({ flytt: [f("2026-09-25T04:00:00Z", 400), f("2026-09-26T04:00:00Z", 999)] });
      expect(r.notiser.join(" ")).toContain("1 flyttdag saknar mätt tid eller är över 16 tim och ingår inte");
    });
    it("både 'Restid ingår inte' och uteslutna flyttdagar: restidsnotisen står först", () => {
      const r = bygg({ flytt: [f("2026-09-26T04:00:00Z", 999)] });
      expect(r.notiser[0]).toMatch(/^Restid ingår inte/);
      expect(r.notiser[1]).toContain("saknar mätt tid");
    });
    it("flytt äldre än fyra månader räknas inte: kortet har ingen flytt att nämna", () => {
      const r = bygg({ flytt: [f("2026-05-25T04:00:00Z", 400)] });
      expect(r.restidSaknas).toBe(true);
    });
  });
});

// ─── mot Stefans riktiga 2026-data ───────────────────────────
describe("Stefan 2026 (riktig data): övertiden fördelas på månader utan att något försvinner eller tillkommer", () => {
  const a = beraknaArsovertid(fx.arbetsdag as any, fx.extra_tid as any, 2026, fx.tomDatum, fx.utjamning as any, fx.franvaro as any);

  it("summan över månaderna = summan av periodernas övertid (± avrundning)", () => {
    const m = overtidPerManad(a);
    const summa = Object.values(m).reduce((s, x) => s + x.fast + x.uppskattad, 0);
    const perioder = a.perioder.reduce((s, p) => s + p.overtid, 0);
    expect(Math.abs(summa - perioder)).toBeLessThan(0.5);
  });

  it("Gävle (markerad v17–27, avslutad) ger noll övertid — ingenting på någon månad", () => {
    const m = overtidPerManad(a);
    const uppsk = Object.values(m).reduce((s, x) => s + x.uppskattad, 0);
    expect(uppsk).toBe(0);
  });

  it("perioderna har fått avslutad-flaggan: v1–16 och Gävle klara, v28–41 beroende på tomDatum", () => {
    expect(a.perioder[0].avslutad).toBe(true);
    expect(a.perioder[1].avslutad).toBe(true);
    expect(a.veckor.length).toBeGreaterThan(30);
    expect(a.veckor[0].vecka).toBe(1);
  });

  it("hela kedjan ger sex gränser för Stefan och ingen månad över 50 tim fastställd övertid", () => {
    const f = byggArbetstid({
      medarbetare_id: "s", namn: "Stefan Karlsson", tomDatum: fx.tomDatum, arsovertid: a, dagar: fx.arbetsdag as any, extra: fx.extra_tid as any,
      franvaro: fx.franvaro as any, trosklar: TROSKLAR, tak: 250,
    });
    expect(f.granser).toHaveLength(6);
    expect(gr(f, "allman_overtid_ar").varde).toBe(a.modeller.genomsnitt);
  });
});
