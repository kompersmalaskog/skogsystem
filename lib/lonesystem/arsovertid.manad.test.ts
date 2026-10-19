// Lagkontrollens årsövertid räknar per kalendermånad, SAMMA regel som lönen (Martin 2026-10-19): övertid först när månadens ordinarie
// timmar är fyllda. Reglerna ligger i lib/lonesystem/manadsordinarie.ts — den här filen bevisar att lagkontrollen använder dem, och att
// en avslutad månad ger exakt det tal lönen visar (paritet mot beraknaLoneunderlag på produktionens augusti–september 2026).
import { describe, it, expect } from "vitest";
import { beraknaArsovertid, type ArsovertidManad } from "./arsovertid";
import { overtidPerManad } from "../arbetstidsgranser";
import { beraknaLoneunderlag } from "./loneunderlag";
import { sepKlient, sepTabeller } from "./testdata/sepKlient";
import type { FranvaroRad } from "../franvaro";

const AR = 2026;
const dag = (datum: string, timmar: number) => ({ datum, arbetad_min: Math.round(timmar * 60), dagtyp: "Produktion", start_tid: "06:00:00" });
const fr = (typ: string, fran: string, till: string, extra: Partial<FranvaroRad> = {}): FranvaroRad =>
  ({ medarbetare_id: "m", typ: typ as any, startdatum: fran, slutdatum: till, status: "godkänd", ...extra });
/** Alla vardagar (mån–fre) i månaden ym med lika många timmar per dag. */
function vardagarMedTid(ym: string, timmarPerDag: number, hoppaOver: string[] = []) {
  const [y, m] = ym.split("-").map(Number);
  const ut: ReturnType<typeof dag>[] = [];
  for (let d = new Date(Date.UTC(y, m - 1, 1)); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    const s = d.toISOString().slice(0, 10);
    if (w !== 0 && w !== 6 && !hoppaOver.includes(s)) ut.push(dag(s, timmarPerDag));
  }
  return ut;
}
const manad = (a: { manader: ArsovertidManad[] }, ym: string) => a.manader.find(m => m.manad === ym)!;
const TOM_EFTER_FEB = "2026-03-10";

describe("månadsmodellen: övertid först när månadens ordinarie är fylld", () => {
  it("februari 2026 har 20 vardagar = 160 tim; 170 tim arbetat ger 10 tim övertid", () => {
    const a = beraknaArsovertid(vardagarMedTid("2026-02", 8.5), [], AR, TOM_EFTER_FEB);
    expect(manad(a, "2026-02")).toMatchObject({ modell: "manad", ordinarieH: 160, arbetadH: 170, overtid: 10, pagaende: false, stallning: null });
  });

  it("väntande och nekad frånvaro är ingen frånvaro: bara godkänd och registrerad dras av", () => {
    const rader = [fr("semester", "2026-02-02", "2026-02-06", { status: "väntar" }), fr("semester", "2026-02-09", "2026-02-13", { status: "nekad" })];
    expect(manad(beraknaArsovertid([dag("2026-02-16", 8)], [], AR, TOM_EFTER_FEB, [], rader), "2026-02").ordinarieH).toBe(160);
    expect(manad(beraknaArsovertid([dag("2026-02-16", 8)], [], AR, TOM_EFTER_FEB, [], [fr("semester", "2026-02-02", "2026-02-06", { status: "registrerad" })]), "2026-02").ordinarieH).toBe(120);
  });

  it("deldag: schematimmarna följer avtalets ordinarie vecka (35 tim = 7 tim/dag → sjuk från 11:00 efter 3 tim tar 4 tim)", () => {
    const sjuk = fr("sjuk", "2026-02-04", "2026-02-04", { fran_tid: "11:00:00", status: "registrerad" });
    const a = beraknaArsovertid([dag("2026-02-04", 3)], [], AR, TOM_EFTER_FEB, [], [sjuk], { ordinarieVeckaH: 35 });
    expect(manad(a, "2026-02").ordinarieH).toBe(156);
  });

  it("en dag med bara extra tid är inte 'arbete' mot en heldagsfrånvaro (arbetad_min avgör, som i lönen)", () => {
    const a = beraknaArsovertid([], [{ datum: "2026-02-04", minuter: 120 }], AR, TOM_EFTER_FEB, [], [fr("semester", "2026-02-04", "2026-02-04")]);
    expect(manad(a, "2026-02").ordinarieH).toBe(152);
  });

  it("en nästan tom månad ger ingen övertid även om tre dagar var långa (Oscar: 28,65 tim)", () => {
    const a = beraknaArsovertid([dag("2026-02-03", 9.55), dag("2026-02-04", 9.55), dag("2026-02-05", 9.55)], [], AR, TOM_EFTER_FEB);
    expect(manad(a, "2026-02")).toMatchObject({ arbetadH: 28.65, ordinarieH: 160, overtid: 0 });
  });

  it("röda vardagar dras alltid av, också när dagen arbetades (april: 22 vardagar − långfredag − annandag påsk = 160 tim)", () => {
    const a = beraknaArsovertid([...vardagarMedTid("2026-04", 8, ["2026-04-03", "2026-04-06"]), dag("2026-04-06", 8)], [], AR, "2026-05-10");
    expect(manad(a, "2026-04")).toMatchObject({ ordinarieH: 160, arbetadH: 160 + 8 - 0, overtid: 8 });
  });

  it("frånvaro dras av som hela dagar: semester 13–17 april = 5 dagar × 8 tim bort ur ordinarie", () => {
    const a = beraknaArsovertid(vardagarMedTid("2026-04", 8, ["2026-04-03", "2026-04-06", "2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17"]),
      [], AR, "2026-05-10", [], [fr("semester", "2026-04-13", "2026-04-17")]);
    expect(manad(a, "2026-04")).toMatchObject({ ordinarieH: 120, arbetadH: 120, overtid: 0 });
  });

  it("arbete vinner: en semesterrad över en dag med arbete drar inget ur ordinarie", () => {
    const a = beraknaArsovertid([dag("2026-04-14", 8)], [], AR, "2026-05-10", [], [fr("semester", "2026-04-14", "2026-04-14")]);
    expect(manad(a, "2026-04").ordinarieH).toBe(160);
  });

  it("vardagar före anställningsdatum räknas inte (anställd 16 feb: 10 dagar bort, ordinarie 80 tim)", () => {
    const a = beraknaArsovertid(vardagarMedTid("2026-02", 9).filter(d => d.datum >= "2026-02-16"), [], AR, TOM_EFTER_FEB, [], [], { anstallningsdatum: "2026-02-16" });
    expect(manad(a, "2026-02")).toMatchObject({ ordinarieH: 80, arbetadH: 90, overtid: 10 });
  });

  it("deldag: sjuk från 11:00 på en dag med 3 tim arbete tar bort 5 tim (inte hela dagen)", () => {
    const a = beraknaArsovertid([dag("2026-02-04", 3)], [], AR, TOM_EFTER_FEB, [], [fr("sjuk", "2026-02-04", "2026-02-04", { fran_tid: "11:00:00", status: "registrerad" })]);
    expect(manad(a, "2026-02").ordinarieH).toBe(155);
  });

  it("extra tid och hemskickad tid är arbetad tid mot ordinarie, som i lönen", () => {
    const a = beraknaArsovertid([dag("2026-02-03", 6)], [{ datum: "2026-02-04", minuter: 120 }], AR, TOM_EFTER_FEB, [],
      [fr("hemskickad", "2026-02-03", "2026-02-03", { fran_tid: "14:00:00", status: "registrerad" })]);
    expect(manad(a, "2026-02").arbetadH).toBe(6 + 2 + 2);   // 6 maskin + 2 extra + 2 hemskickad (dagen fylls till 8)
  });

  it("övertiden summeras per månad, aldrig mot årets alla dagar: en lång månad jämnas inte ut mot en kort", () => {
    const a = beraknaArsovertid([...vardagarMedTid("2026-01", 9), ...vardagarMedTid("2026-02", 6)], [], AR, TOM_EFTER_FEB);
    // jan 2026: 22 vardagar − nyårsdagen − trettondagen = 20 → 160 tim; 22 × 9 = 198 arbetat (trots att två är röda) → 38
    expect(manad(a, "2026-01").overtid).toBe(38);
    expect(manad(a, "2026-02").overtid).toBe(0);
    expect(a.modeller.manad).toBe(38);
  });

  it("modeller.manad finns bredvid de fyra äldre och rör dem inte", () => {
    const dagar = vardagarMedTid("2026-02", 8.5);
    const a = beraknaArsovertid(dagar, [], AR, TOM_EFTER_FEB);
    const utan = { ...a.modeller } as any; delete utan.manad;
    expect(Object.keys(utan).sort()).toEqual(["dagar", "genomsnitt", "vardagar", "vecka"]);
    expect(a.modeller.manad).toBe(10);
  });
});

describe("pågående månad: ställning hittills", () => {
  // Måndag 19 okt 2026. Oktober har vardagarna 1,2,5–9,12–16 före den 19:e = 12 st, med den 19:e = 13.
  const TOM = "2026-10-19";
  const okt = (tim: number, utan: string[] = []) => vardagarMedTid("2026-10", tim, utan).filter(d => d.datum < "2026-10-19");

  it("ordinarie hittills = vardagarna fram till igår; idag räknas först när den har registrerad tid", () => {
    // 12 dagar × 9 = 108 tim; ordinarie hittills 12 × 8 = 96 → ställning +12 (utan tid idag)
    const utanIdag = beraknaArsovertid(okt(9), [], AR, TOM);
    expect(manad(utanIdag, "2026-10")).toMatchObject({ pagaende: true, ordinarieH: 96, arbetadH: 108, stallning: 12, overtid: 12 });
    // med 2 tim registrerade idag räknas idag som en ordinarie dag: 13 × 8 = 104, arbetat 110 → +6
    const medIdag = beraknaArsovertid([...okt(9), dag(TOM, 2)], [], AR, TOM);
    expect(manad(medIdag, "2026-10")).toMatchObject({ ordinarieH: 104, arbetadH: 110, stallning: 6, overtid: 6 });
  });

  it("gårdagen räknas: tisdag 20 okt utan tid idag → måndagen 19:e är med i ordinarie hittills", () => {
    // vardagar före den 20:e = 13 (1,2,5–9,12–16,19) → 104 tim; idag (tisdag) har ingen tid
    const a = beraknaArsovertid([...okt(8), dag("2026-10-19", 8)], [], AR, "2026-10-20");
    expect(manad(a, "2026-10")).toMatchObject({ ordinarieH: 104, arbetadH: 104, stallning: 0 });
  });

  it("extra tid idag räknas också som registrerad tid", () => {
    const a = beraknaArsovertid(okt(8), [{ datum: TOM, minuter: 60 }], AR, TOM);
    expect(manad(a, "2026-10").ordinarieH).toBe(104);
  });

  it("under ordinarie är ställningen negativ men övertiden noll", () => {
    const a = beraknaArsovertid(okt(6), [], AR, TOM);
    expect(manad(a, "2026-10")).toMatchObject({ stallning: -24, overtid: 0 });
  });

  it("frånvaro och röda dagar efter idag påverkar inte ställningen hittills", () => {
    const a = beraknaArsovertid(okt(8), [], AR, TOM, [], [fr("semester", "2026-10-26", "2026-10-30")]);
    expect(manad(a, "2026-10").ordinarieH).toBe(96);
  });

  it("årets total tar med den pågående månadens ställning (max 0) och föregående månader som lönen räknar dem", () => {
    const a = beraknaArsovertid([...vardagarMedTid("2026-09", 8.5), ...okt(9)], [], AR, TOM);
    // sep 2026: 22 vardagar = 176 tim, 22 × 8,5 = 187 → 11; okt: +12 hittills
    expect(manad(a, "2026-09").overtid).toBe(11);
    expect(a.modeller.manad).toBe(23);
  });
});

describe("utjämningsmånader behåller den gamla beräkningen (som lönen)", () => {
  const UTJ = [{ startdatum: "2026-04-20", slutdatum: "2026-07-05", anteckning: "Gävle" }];

  it("en månad som överlappar en period är markerad 'utjamning' och har ingen månadsövertid", () => {
    const a = beraknaArsovertid(vardagarMedTid("2026-05", 9), [], AR, "2026-09-10", UTJ);
    expect(manad(a, "2026-05")).toMatchObject({ modell: "utjamning", overtid: null, ordinarieH: null });
    expect(manad(a, "2026-04").modell).toBe("utjamning");   // april överlappar (20–30 april)
    expect(manad(a, "2026-07").modell).toBe("utjamning");   // juli överlappar (1–5 juli)
    expect(manad(a, "2026-08").modell).toBe("manad");
  });

  it("utjämningsmånadens bidrag till året är genomsnittsmodellens fördelning på månader — exakt vad overtidPerManad ger", () => {
    // 12 tim/dag april–juli (perioden v17–27 har bas ≈ 440 tim minus röda dagar) → klart över basen; augusti 9 tim/dag = 189 − 168 = 21 tim
    const dagar = [...["04", "05", "06", "07"].flatMap(m => vardagarMedTid(`2026-${m}`, 12)), ...vardagarMedTid("2026-08", 9)];
    const a = beraknaArsovertid(dagar, [], AR, "2026-09-10", UTJ);
    const gen = overtidPerManad({ ...a, manader: undefined } as any);   // äldre fördelningen utan månadsmodellen
    const genUtj = ["2026-04", "2026-05", "2026-06", "2026-07"].reduce((s, ym) => s + (gen[ym]?.fast || 0) + (gen[ym]?.uppskattad || 0), 0);
    expect(genUtj).toBeGreaterThan(100);
    expect(manad(a, "2026-08").overtid).toBe(21);
    expect(a.modeller.manad).toBeCloseTo(genUtj + 21, 1);
    // …och den delas ut på samma månader i den nya fördelningen: utjämningsmånaderna ger exakt det äldre, andra månader bara månadsregeln
    const ny = overtidPerManad(a);
    for (const ym of ["2026-04", "2026-05", "2026-06", "2026-07"]) expect(ny[ym] ?? { fast: 0, uppskattad: 0 }).toEqual(gen[ym] ?? { fast: 0, uppskattad: 0 });
    expect(ny["2026-08"]).toEqual({ fast: 21, uppskattad: 0 });
  });

  it("en period som slutade före månaden rör inte månaden (augusti räknas med den nya regeln)", () => {
    const a = beraknaArsovertid(vardagarMedTid("2026-08", 8), [], AR, "2026-09-10", UTJ);
    expect(manad(a, "2026-08").modell).toBe("manad");
  });
});

describe("paritet mot lönen: avslutad månad = exakt det tal lönen visar", () => {
  // Produktionens augusti–september 2026 (testdata/sep2026.json), alla sju förare. Lönens period 2026-09 = augusti arbete, 2026-10 = september.
  const T = sepTabeller();
  async function lonen(period: string) {
    const u: any = await beraknaLoneunderlag(sepKlient(), { period });
    return new Map<string, number>(u.resultat.map((r: any) => [r.medarbetare_id, r.overtid_h]));
  }
  const arsFor = (id: string, tom: string) => beraknaArsovertid(
    T.arbetsdag.filter(d => d.medarbetare_id === id).map(d => ({ datum: d.datum, arbetad_min: d.arbetad_min })),
    T.extra_tid.filter(e => e.medarbetare_id === id).map(e => ({ datum: e.datum, minuter: e.minuter })),
    AR, tom, [],
    T.ledighet_ansokningar.filter(l => l.medarbetare_id === id) as any,
  );

  it("augusti: varje förares månadsövertid = lönens övertid", async () => {
    const lon = await lonen("2026-09");
    let provade = 0;
    for (const m of T.medarbetare) {
      const a = arsFor(m.id, "2026-09-15");
      expect(manad(a, "2026-08").overtid, `förare ${m.id} augusti`).toBeCloseTo(lon.get(m.id) ?? 0, 2);
      provade++;
    }
    expect(provade).toBe(7);
  });

  it("september: varje förares månadsövertid = lönens övertid, och Oscar (28,65 tim) är 0", async () => {
    const lon = await lonen("2026-10");
    for (const m of T.medarbetare) {
      const a = arsFor(m.id, "2026-10-15");
      expect(manad(a, "2026-09").overtid, `förare ${m.id} september`).toBeCloseTo(lon.get(m.id) ?? 0, 2);
    }
    expect(manad(arsFor("m5", "2026-10-15"), "2026-09")).toMatchObject({ arbetadH: 28.65, overtid: 0 });
  });
});
