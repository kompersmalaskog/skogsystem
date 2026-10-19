// Helglön §10 blir en Fortnox-rad per MASKINTYP (helglon_skordare / helglon_skotare) när lönearten har en kod i mappningen, och en röd,
// blockerande rad när den saknar kod. Regeln (Martin 2026-10-17): varje röd vardag ger 8 tim helglön — företagets praxis, över avtalets
// minimum — också när man arbetar den dagen. Närvarokravet (mom 4) och kvalifikationstiden (mom 3) ligger i lib/lonesystem/helglon.
import { describe, it, expect } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import type { Loneartskoder } from "./loneart";

const TYP = { SK: "skordare" as const, ST: "skotare" as const };
const KODER = { ...PROD_KODER, helglon_skordare: "1461", helglon_skotare: "1462" };
const dag = (datum: string, min: number, maskin = "R64428") => ({ datum, arbetad_min: min, maskin_id: maskin, km_totalt: 0, bekraftad: true, dagtyp: null });
type Lon = { franvaroRunt?: any[]; anstallningsdatum?: string | null; foretagsledare?: boolean };
const kor = (koder: Loneartskoder, dagar = [dag("2026-12-01", 480)], loneperiod = "2027-01", o: { radMaskinTyp?: "skordare" | "skotare" | null; ledigheter?: any[]; lon?: Lon } = {}) =>
  beräknaExport("m", "Anna", "7", dagar, { R64428: TYP.SK, A030353: TYP.ST }, loneperiod, [], o.ledigheter ?? [], 60, null, new Set(), null, o.radMaskinTyp ?? null, koder, o.lon);

// Arbetsmånad december 2026: julafton (tor 24), juldagen (fre 25) och nyårsafton (tor 31) är röda vardagar i avtalets lista.
// Annandag jul (26 dec) är en lördag och ger ingen helglön.
describe("helglön som Fortnox-rad per maskintyp", () => {
  it("skördare MED kod: en rad 'helglon_skordare' med 8 tim per röd vardag (3 dagar = 24 tim)", () => {
    const u = kor(KODER);
    expect(u.helglon.timmar).toBe(24);
    const rad = u.rader.find(r => r.loneart.startsWith("helglon"))!;
    expect(rad).toMatchObject({ loneart: "helglon_skordare", SalaryCode: "1461", Number: "24.00", Date: "2027-01-01" });
    expect(rad.beskrivning).toMatch(/Helglön/);
    expect(u.lonerader.find(r => r.loneart === "helglon_skordare")).toMatchObject({ status: "skickas", kod: "1461", mangd: "24.00" });
    expect(u.saknade_loneartskoder).toEqual([]);
  });

  it("skotare MED kod: samma timmar, löneart 'helglon_skotare' och den andra koden", () => {
    const u = kor(KODER, [dag("2026-12-01", 480, "A030353")]);
    expect(u.rader.filter(r => r.loneart.startsWith("helglon"))).toEqual([expect.objectContaining({ loneart: "helglon_skotare", SalaryCode: "1462", Number: "24.00" })]);
  });

  it("UTAN kod: ingen rad, en varning med mängden, och lönearten är en BLOCKERANDE saknad kod", () => {
    const u = kor(PROD_KODER);
    expect(u.rader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["helglon_skordare"]);
    expect(u.varningar.find(v => /^Löneart saknas för Helglön skördare/.test(v))).toMatch(/24 tim/);
    expect(u.lonerader.find(r => r.loneart === "helglon_skordare")).toMatchObject({ status: "saknar_kod", kod: null, mangd: "24.00" });
  });

  it("kod bara på den ANDRA maskintypen räcker inte: en skördare utan helglon_skordare-kod blockeras", () => {
    const u = kor({ ...PROD_KODER, helglon_skotare: "1462" });
    expect(u.saknade_loneartskoder).toEqual(["helglon_skordare"]);
    expect(u.rader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
  });

  it("tom kod är ingen kod", () => {
    const u = kor({ ...PROD_KODER, helglon_skordare: "  " });
    expect(u.rader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["helglon_skordare"]);
  });

  it("de gamla namnet 'helglon' finns inte längre: en gammal mappningsrad med den nyckeln används aldrig", () => {
    const u = kor({ ...PROD_KODER, helglon: "1461" } as any);
    expect(u.rader.some(r => r.SalaryCode === "1461")).toBe(false);
    expect(u.saknade_loneartskoder).toEqual(["helglon_skordare"]);
  });
});

describe("praxis: en ARBETAD röd dag ger helglön OCH vanlig lön (inget söndagstillägg)", () => {
  it("24 december arbetad → fortfarande 24 tim helglön, och dagen är en vanlig arbetsdag i timlönen", () => {
    const u = kor(KODER, [dag("2026-12-01", 480), dag("2026-12-24", 480)]);
    expect(u.helglon.timmar).toBe(24);
    expect(u.rader.find(r => r.loneart === "helglon_skordare")!.Number).toBe("24.00");
    expect(u.rader.find(r => r.loneart === "timlon")!.Number).toBe("16.00"); // två arbetsdagar × 8
    expect(u.helglon.dagar.find(d => d.datum === "2026-12-24")).toMatchObject({ arbetad: true, ger: true, skal: "betalas_arbetad" });
  });

  it("alla röda dagar arbetade → fortfarande 24 tim (förr 0)", () => {
    const u = kor(KODER, [dag("2026-12-24", 480), dag("2026-12-25", 480), dag("2026-12-31", 480)]);
    expect(u.helglon.timmar).toBe(24);
    expect(u.rader.find(r => r.loneart === "helglon_skordare")!.Number).toBe("24.00");
    expect(u.rader.find(r => r.loneart === "timlon")!.Number).toBe("24.00");
  });

  it("månad utan röda vardagar (september) → ingen helglönerad, med eller utan kod", () => {
    const med = kor(KODER, [dag("2026-09-07", 480)], "2026-10");
    const utan = kor(PROD_KODER, [dag("2026-09-07", 480)], "2026-10");
    for (const u of [med, utan]) {
      expect(u.helglon.timmar).toBe(0);
      expect(u.rader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
      expect(u.saknade_loneartskoder).toEqual([]);
    }
  });

  it("de andra raderna är oförändrade av att helglön tillkommer", () => {
    const utan = kor(PROD_KODER);
    const med = kor(KODER);
    expect(med.rader.filter(r => !r.loneart.startsWith("helglon"))).toEqual(utan.rader);
  });

  it("informationsvarningen beskriver praxis — inte längre 'arbetad röd dag ger ingen helglön' eller 'ej fastställd'", () => {
    const v = kor(KODER).varningar.find(x => /^Helglön §10/.test(x))!;
    expect(v).toMatch(/24 tim/);
    expect(v).toMatch(/Praxis/);
    expect(v).not.toMatch(/ger ingen helglön/);
    expect(v).not.toMatch(/ej fastställd/);
    expect(v).not.toMatch(/läggs INTE som lönerad/);
  });
});

describe("maskintyp avgör löneart — samma regel som övertiden, och ingen gissning", () => {
  it("blandad månad: den typ med flest timmar; lika → skördare (som övertiden)", () => {
    const mer = kor(KODER, [dag("2026-12-01", 600, "A030353"), dag("2026-12-02", 480, "R64428")]);
    expect(mer.rader.find(r => r.loneart.startsWith("helglon"))!.loneart).toBe("helglon_skotare");
    const lika = kor(KODER, [dag("2026-12-01", 480, "A030353"), dag("2026-12-02", 480, "R64428")]);
    expect(lika.rader.find(r => r.loneart.startsWith("helglon"))!.loneart).toBe("helglon_skordare");
  });

  it("ingen maskintid i månaden (bara röda dagar): typen på medarbetarraden", () => {
    const u = kor(KODER, [], "2027-01", { radMaskinTyp: "skotare", ledigheter: [{ typ: "semester", startdatum: "2026-12-15", slutdatum: "2026-12-16" }] });
    expect(u.rader.map(r => [r.loneart, r.Number])).toEqual([["helglon_skotare", "24.00"]]);
  });

  it("ingen maskintid och ingen maskin på raden: ingen rad, en tydlig varning (aldrig en gissad löneart)", () => {
    const u = kor(KODER, [], "2027-01", { radMaskinTyp: null, ledigheter: [{ typ: "semester", startdatum: "2026-12-15", slutdatum: "2026-12-16" }] });
    expect(u.rader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
    expect(u.lonerader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
    const v = u.varningar.find(x => /^Ingen helglön skickas/.test(x))!;
    expect(v).toMatch(/24 tim/);
    expect(v).toMatch(/maskintyp/);
  });
});

describe("närvarokravet i beräkningen (mom 4)", () => {
  it("sjuk på julafton (registrerad frånvaro) → 16 tim, och dagen säger varför", () => {
    const u = kor(KODER, [dag("2026-12-01", 480)], "2027-01", { ledigheter: [{ typ: "sjuk", startdatum: "2026-12-24", slutdatum: "2026-12-24" }] });
    expect(u.helglon.timmar).toBe(16);
    expect(u.rader.find(r => r.loneart === "helglon_skordare")!.Number).toBe("16.00");
    expect(u.helglon.dagar.find(d => d.datum === "2026-12-24")).toMatchObject({ ger: false, skal: "sjuk" });
    expect(u.varningar.find(v => /^Helglön §10/.test(v))).toMatch(/2026-12-24 Julafton \(ingen helglön: sjuk/);
  });

  it("frånvaron som avgör kan ligga i förra månaden (tjänstledig 30 dec 2026 → ingen helglön nyårsdagen 2027)", () => {
    const u = kor(KODER, [dag("2027-01-04", 480)], "2027-02", { lon: { franvaroRunt: [{ typ: "tjanstledig", startdatum: "2026-12-30", slutdatum: "2026-12-30" }] } });
    expect(u.helglon.dagar.find(d => d.datum === "2027-01-01")).toMatchObject({ ger: false, skal: "tjanstledig_omger" });
    expect(u.helglon.dagar.find(d => d.datum === "2027-01-06")).toMatchObject({ ger: true });
    expect(u.helglon.timmar).toBe(8);
  });

  it("utan franvaroRunt faller beräkningen tillbaka på månadens egna ledigheter (äldre anrop)", () => {
    const u = kor(KODER, [dag("2026-12-01", 480)], "2027-01", { ledigheter: [{ typ: "vab", startdatum: "2026-12-25", slutdatum: "2026-12-25" }] });
    expect(u.helglon.timmar).toBe(16);
  });

  it("frånvarokategorierna som INTE bryter ändrar inte summan (semester 22–23 dec, föräldraledig dagen före)", () => {
    const u = kor(KODER, [dag("2026-12-01", 480)], "2027-01", { ledigheter: [
      { typ: "semester", startdatum: "2026-12-21", slutdatum: "2026-12-23" }, { typ: "foraldraledig", startdatum: "2026-12-23", slutdatum: "2026-12-23" },
    ] });
    expect(u.helglon.timmar).toBe(24);
  });
});

describe("kvalifikationstid i beräkningen (mom 3)", () => {
  it("anställd 1 okt 2026 → ingen helglön i december (tre månader går ut 1 jan 2027)", () => {
    const u = kor(KODER, [dag("2026-12-01", 480)], "2027-01", { lon: { anstallningsdatum: "2026-10-01" } });
    expect(u.helglon.timmar).toBe(0);
    expect(u.rader.some(r => r.loneart.startsWith("helglon"))).toBe(false);
    expect(u.saknade_loneartskoder).toEqual([]);
    expect(u.helglon.dagar.every(d => d.skal === "kvalifikationstid")).toBe(true);
    expect(u.helglon.anstallningsdatumSaknas).toBe(false);
  });
  it("saknat datum → helglön betalas, flaggan sätts och en varning förklarar", () => {
    const u = kor(KODER, [dag("2026-12-01", 480)], "2027-01", { lon: { anstallningsdatum: null } });
    expect(u.helglon.timmar).toBe(24);
    expect(u.helglon.anstallningsdatumSaknas).toBe(true);
    expect(u.varningar.find(v => /^Anställningsdatum saknas/.test(v))).toMatch(/kvalifikationstid/);
  });
  it("ingen varning om datumet saknas i en månad utan röda vardagar (inget att kontrollera)", () => {
    const u = kor(KODER, [dag("2026-09-07", 480)], "2026-10", { lon: { anstallningsdatum: null } });
    expect(u.helglon.anstallningsdatumSaknas).toBe(false);
    expect(u.varningar.some(v => /Anställningsdatum saknas/.test(v))).toBe(false);
  });
});

describe("företagsledare: inga lönerader alls", () => {
  it("rader, lönerader och saknade koder är tomma — också för en månad med arbete, övertid och helglön", () => {
    const u = kor(PROD_KODER, [dag("2026-12-01", 600), dag("2026-12-02", 600), dag("2026-12-24", 480)], "2027-01", { lon: { foretagsledare: true } });
    expect(u.foretagsledare).toBe(true);
    expect(u.rader).toEqual([]);
    expect(u.lonerader).toEqual([]);
    expect(u.saknade_loneartskoder).toEqual([]);
    expect(u.helglon.timmar).toBe(0);
    expect(u.varningar.some(v => /Löneart saknas|Helglön §10|Ingen premielön|frivillig/.test(v))).toBe(false);
  });
  it("samma månad för en vanlig förare ger rader — så testet ovan ser skillnaden", () => {
    const u = kor(KODER, [dag("2026-12-01", 600), dag("2026-12-02", 600), dag("2026-12-24", 480)]);
    expect(u.foretagsledare).toBe(false);
    expect(u.rader.length).toBeGreaterThan(3);
  });
  it("inga löntal visas för dem (timlön, övertid, vältlappar, mil är 0), men arbetsdagar och ordinarie tid finns kvar för kontrollvyerna", () => {
    // Hela december 2026 (23 vardagar, 10 tim/dag): månadens ordinarie är 23 − 3 röda vardagar = 20 × 8 = 160, resten är övertid.
    const dagar = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`)
      .filter(d => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w !== 0 && w !== 6; })
      .map((d, i) => ({ ...dag(d, 600, "A030353"), km_totalt: i === 0 ? 150 : 0 }));
    const vanlig = kor(KODER, dagar);
    expect(vanlig.timlon_h).toBe(160);
    expect(vanlig.overtid_h).toBeGreaterThan(0);
    expect(vanlig.valtlappar_veckor).toBeGreaterThan(0);
    expect(vanlig.kor_mil).toBeGreaterThan(0);
    const u = kor(KODER, dagar, "2027-01", { lon: { foretagsledare: true } });
    expect([u.timlon_h, u.overtid_h, u.valtlappar_veckor, u.kor_mil, u.premielon_skordare_h, u.premielon_skotare_h]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(u.arbetsdagar).toBe(23);
    expect(u.ordinarie_h).toBe(160);      // månadens ordinarie räknas även för en företagsledare (kontrollvyerna), röda dagar ur avtalets lista
  });
  it("ingen varning om anställningsnummer eller premie för dem — de skickas aldrig", () => {
    const u = beräknaExport("m", "Martin", "", [dag("2026-12-01", 480, "OKANDMASKIN")], {}, "2027-01", [], [], 60, null, new Set(), null, null, PROD_KODER, { foretagsledare: true });
    expect(u.varningar.some(v => /Anställningsnummer saknas|Ingen premielön/.test(v))).toBe(false);
    const vanlig = beräknaExport("m", "Anna", "", [dag("2026-12-01", 480, "OKANDMASKIN")], {}, "2027-01", [], [], 60, null, new Set(), null, null, PROD_KODER);
    expect(vanlig.varningar.some(v => /Anställningsnummer saknas/.test(v))).toBe(true);
    expect(vanlig.varningar.some(v => /Ingen premielön/.test(v))).toBe(true);
  });
  it("frånvarotypen läses oavsett versaler (ledighet med typ 'Sjuk' bryter lika väl)", () => {
    const u = kor(KODER, [dag("2026-12-01", 480)], "2027-01", { ledigheter: [{ typ: "Sjuk", startdatum: "2026-12-24", slutdatum: "2026-12-24" }] });
    expect(u.helglon.timmar).toBe(16);
  });
  it("information som inte är lön finns kvar för kontrollvyerna (arbetsdagar, kortpass)", () => {
    const u = kor(PROD_KODER, [dag("2026-12-01", 480), dag("2026-12-02", 20)], "2027-01", { lon: { foretagsledare: true } });
    expect(u.arbetsdagar).toBe(1);
    expect(u.kortpass).toHaveLength(1);
  });
});
