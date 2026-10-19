/**
 * Maskinflytt som egen rad i förarens dag (beslut Martin 2026-10-19).
 *
 * Regeln: en rad skapas bara om flytten tar minst 30 min OCH är minst 2 km. Raden ligger INOM förarens inloggade dag
 * (den tiden är redan betald — raden märker den, den lägger inte till något), skapas bara på dagar som synken själv
 * bygger (aldrig bekräftade/redigerade), skapas aldrig två gånger och aldrig igen efter att föraren tagit bort den.
 *
 * Facit ur produktion (bara SELECT, 2026-10-19), R64428 Oskar:
 *   10-01 14:38–15:36 (57 min, 9,2 km)   10-05 14:27–15:30 (63 min, 6,4 km)   10-10 13:11–13:55 (44 min, 6,7 km)
 *   10-12 12:30–13:50 (80 min, 6,5 km)   och en lucka över natten 08-19 14:52 → 08-20 06:12 som INTE är en flytt.
 */
import { describe, it, expect } from "vitest";
import {
  FLYTT_MIN_MIN, FLYTT_MIN_KM, avstandKm, arFlytt, planeraFlyttar, flyttKommentar, flyttBortaRad, arAutomatiskFlytt,
  type GpsLucka,
} from "./flyttRad";
import { valideraSegment } from "./dagsegment";

const DATUM = "2026-10-12";
const MED = "med-oskar";
/** 0,018° latitud ≈ 2,00 km — ligger precis över kravet. */
const LAT0 = 56.55, LNG0 = 14.14;
const luckaMed = (o: Partial<GpsLucka> & { start: string; slut: string }): GpsLucka => ({
  fran_objekt_id: "11105602", till_objekt_id: "11183108",
  fran_lat: LAT0, fran_lng: LNG0, till_lat: LAT0 + 0.06, till_lng: LNG0, // ≈ 6,7 km
  ...o,
});
const dag = { datum: DATUM, start_tid: "07:04:00", slut_tid: "15:14:00" };
const plan = (luckor: GpsLucka[], extra: Partial<Parameters<typeof planeraFlyttar>[0]> = {}) =>
  planeraFlyttar({ medarbetareId: MED, dag, luckor, upptagna: [], borta: [], ...extra });

describe("avstånd och regeln 30 min + 2 km", () => {
  it("konstanterna är besluten", () => { expect(FLYTT_MIN_MIN).toBe(30); expect(FLYTT_MIN_KM).toBe(2); });
  it("avstandKm: en breddgrad är ≈ 111,2 km, noll är noll", () => {
    expect(avstandKm(56, 14, 57, 14)).toBeCloseTo(111.19, 1);
    expect(avstandKm(56.5, 14.1, 56.5, 14.1)).toBe(0);
  });
  it("gränsvärden: 30 min/2 km räknas, 29,99 min eller 1,99 km räknas inte", () => {
    expect(arFlytt(30, 2)).toBe(true);
    expect(arFlytt(29.99, 2)).toBe(false);
    expect(arFlytt(30, 1.99)).toBe(false);
    expect(arFlytt(120, 1.9999)).toBe(false);
    expect(arFlytt(31, 2.0001)).toBe(true);
  });
  it("29 min 59 s är inte en flytt, 30 min 00 s är det (sekundexakt)", () => {
    expect(plan([luckaMed({ start: `${DATUM}T12:00:00`, slut: `${DATUM}T12:29:59` })])).toHaveLength(0);
    expect(plan([luckaMed({ start: `${DATUM}T12:00:00`, slut: `${DATUM}T12:30:00` })])).toHaveLength(1);
  });
  it("1,99 km är inte en flytt, 2,00 km är det", () => {
    const kort = luckaMed({ start: `${DATUM}T12:00:00`, slut: `${DATUM}T13:00:00`, till_lat: LAT0 + 0.0179 });
    const lang = luckaMed({ start: `${DATUM}T12:00:00`, slut: `${DATUM}T13:00:00`, till_lat: LAT0 + 0.018 });
    expect(avstandKm(LAT0, LNG0, kort.till_lat, kort.till_lng)).toBeLessThan(2);
    expect(avstandKm(LAT0, LNG0, lang.till_lat, lang.till_lng)).toBeGreaterThanOrEqual(2);
    expect(plan([kort])).toHaveLength(0);
    expect(plan([lang])).toHaveLength(1);
  });
});

describe("raden: tider, innehåll, hela minuter", () => {
  it("Oskar 2026-10-12 12:30–13:50: en rad, flytt, inte fakturerbar, kalla flytt, hela minuter", () => {
    const rader = plan([luckaMed({ start: `${DATUM}T12:30:12.5`, slut: `${DATUM}T13:50:34.6` })]);
    expect(rader).toHaveLength(1);
    expect(rader[0]).toMatchObject({
      medarbetare_id: MED, datum: DATUM, start_tid: "12:30:00", slut_tid: "13:50:00",
      aktivitet_typ: "flytt", debiterbar: false, objekt_id: null, kalla: "flytt",
    });
  });
  it("avrundningen kan aldrig göra en 30-minutersflytt kortare än 30 min", () => {
    // golv på start OCH slut: 12:00:59 → 12:30:59 blir 12:00–12:30
    const r = plan([luckaMed({ start: `${DATUM}T12:00:59`, slut: `${DATUM}T12:30:59` })]);
    expect(r).toHaveLength(1);
    expect([r[0].start_tid, r[0].slut_tid]).toEqual(["12:00:00", "12:30:00"]);
  });
  it("kommentaren bär trakterna och km — tiden härleds av raden själv", () => {
    const r = plan(
      [luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:50:00` })],
      { objektNamn: { "11105602": "Älmehult", "11183108": "Trestensdal" } },
    );
    expect(r[0].kommentar).toBe("Älmehult → Trestensdal · 6,7 km");
  });
  it("okänd trakt står som 'okänd plats' — aldrig ett id, aldrig en gissning", () => {
    expect(flyttKommentar(null, "Trestensdal", 14.2)).toBe("Okänd plats → Trestensdal · 14 km");
    expect(flyttKommentar(undefined, undefined, 2.04)).toBe("Okänd plats → Okänd plats · 2,0 km");
  });
  it("raden är giltig för samma vakt som formuläret använder (inom passet, ingen överlappning)", () => {
    const r = plan([luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:50:00` })]);
    const val = valideraSegment({ start: r[0].start_tid.slice(0, 5), slut: r[0].slut_tid.slice(0, 5) }, dag, []);
    expect(val.ok).toBe(true);
  });
});

describe("raden ligger INOM den betalda dagen", () => {
  it("klipps mot dagens slut: 15:30–16:45 med slut 15:14 ger ingen rad (bara 0 min kvar)", () => {
    expect(plan([luckaMed({ start: `${DATUM}T15:30:00`, slut: `${DATUM}T16:45:00` })])).toHaveLength(0);
  });
  it("klipps mot dagens slut: 14:40–16:00 med slut 15:14 blir 34 min och räknas", () => {
    const r = plan([luckaMed({ start: `${DATUM}T14:40:00`, slut: `${DATUM}T16:00:00` })]);
    expect(r).toHaveLength(1);
    expect([r[0].start_tid, r[0].slut_tid]).toEqual(["14:40:00", "15:14:00"]);
  });
  it("klippt rest under 30 min är ingen flytt: 14:50–16:00 ger 24 min inom dagen", () => {
    expect(plan([luckaMed({ start: `${DATUM}T14:50:00`, slut: `${DATUM}T16:00:00` })])).toHaveLength(0);
  });
  it("klipps mot dagens start: 06:00–07:44 med start 07:04 blir 07:04–07:44", () => {
    const r = plan([luckaMed({ start: `${DATUM}T06:00:00`, slut: `${DATUM}T07:44:00` })]);
    expect([r[0].start_tid, r[0].slut_tid]).toEqual(["07:04:00", "07:44:00"]);
  });
  it("en lucka över natten är ingen flytt (08-19 14:52 → 08-20 06:12)", () => {
    expect(plan([luckaMed({ start: "2026-10-11T14:52:00", slut: `${DATUM}T06:12:00` })])).toHaveLength(0);
    expect(plan([luckaMed({ start: `${DATUM}T14:52:00`, slut: "2026-10-13T06:12:00" })])).toHaveLength(0);
  });
  it("en dag utan pass (perioddag, skalrad) får aldrig en flyttrad", () => {
    const r = planeraFlyttar({
      medarbetareId: MED, dag: { datum: DATUM, start_tid: null, slut_tid: null },
      luckor: [luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:50:00` })], upptagna: [], borta: [],
    });
    expect(r).toHaveLength(0);
  });
  it("summan av flyttraderna kan aldrig överstiga dagens pass", () => {
    const luckor = [
      luckaMed({ start: `${DATUM}T05:00:00`, slut: `${DATUM}T09:00:00` }),
      luckaMed({ start: `${DATUM}T10:00:00`, slut: `${DATUM}T12:00:00` }),
      luckaMed({ start: `${DATUM}T14:00:00`, slut: `${DATUM}T20:00:00` }),
    ];
    const r = plan(luckor);
    const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const summa = r.reduce((a, x) => a + min(x.slut_tid) - min(x.start_tid), 0);
    expect(summa).toBeLessThanOrEqual(min("15:14") - min("07:04"));
    for (const x of r) expect(valideraSegment({ start: x.start_tid.slice(0, 5), slut: x.slut_tid.slice(0, 5) }, dag, []).ok).toBe(true);
  });
});

describe("skapas en gång, och aldrig igen efter att föraren tagit bort den", () => {
  const l = luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:50:00` });
  it("finns raden redan (synken kör om) skapas ingen ny", () => {
    expect(plan([l], { upptagna: [{ start_tid: "12:30:00", slut_tid: "13:50:00" }] })).toHaveLength(0);
  });
  it("föraren har ändrat raden (12:40–13:30): luckan överlappar och skapar ingen ny bredvid", () => {
    expect(plan([l], { upptagna: [{ start_tid: "12:40:00", slut_tid: "13:30:00" }] })).toHaveLength(0);
  });
  it("en annan period som bara tangerar är inget hinder (slut = start)", () => {
    expect(plan([l], { upptagna: [{ start_tid: "13:50:00", slut_tid: "14:30:00" }] })).toHaveLength(1);
    expect(plan([l], { upptagna: [{ start_tid: "11:00:00", slut_tid: "12:30:00" }] })).toHaveLength(1);
  });
  it("en period som delvis överlappar blockerar hela flytten (inget trimmas tyst)", () => {
    expect(plan([l], { upptagna: [{ start_tid: "13:00:00", slut_tid: "13:20:00" }] })).toHaveLength(0);
  });
  it("borttagen av föraren: en gravsten på samma tid hindrar att raden skapas igen", () => {
    expect(plan([l], { borta: [{ start_tid: "12:30:00", slut_tid: "13:50:00" }] })).toHaveLength(0);
  });
  it("gravstenen gäller även när luckan hunnit växa/krympa lite (ny GPS-fil)", () => {
    const lite = luckaMed({ start: `${DATUM}T12:31:00`, slut: `${DATUM}T13:49:00` });
    expect(plan([lite], { borta: [{ start_tid: "12:30:00", slut_tid: "13:50:00" }] })).toHaveLength(0);
  });
  it("en gravsten påverkar inte en annan flytt samma dag", () => {
    const andra = luckaMed({ start: `${DATUM}T09:00:00`, slut: `${DATUM}T09:45:00` });
    expect(plan([l, andra], { borta: [{ start_tid: "12:30:00", slut_tid: "13:50:00" }] }).map(r => r.start_tid)).toEqual(["09:00:00"]);
  });
  it("två flyttar samma dag blir två rader i tidsordning", () => {
    const a = luckaMed({ start: `${DATUM}T09:00:00`, slut: `${DATUM}T09:45:00` });
    expect(plan([l, a]).map(r => r.start_tid)).toEqual(["09:00:00", "12:30:00"]);
  });
  it("överlappande luckor (brus i spåret) ger EN rad — den som börjar först", () => {
    const a = luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:30:00` });
    const b = luckaMed({ start: `${DATUM}T13:00:00`, slut: `${DATUM}T14:00:00` });
    expect(plan([b, a]).map(r => [r.start_tid, r.slut_tid])).toEqual([["12:30:00", "13:30:00"]]);
  });
  it("samma resultat om planen körs två gånger med det första resultatet som upptaget (idempotent)", () => {
    const ett = plan([l]);
    const tva = plan([l], { upptagna: ett.map(r => ({ start_tid: r.start_tid, slut_tid: r.slut_tid })) });
    expect(ett).toHaveLength(1);
    expect(tva).toHaveLength(0);
  });
  it("luckor mellan samma objekt eller utan objekt är inga flyttar", () => {
    expect(plan([luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:50:00`, till_objekt_id: "11105602" })])).toHaveLength(0);
    expect(plan([luckaMed({ start: `${DATUM}T12:30:00`, slut: `${DATUM}T13:50:00`, fran_objekt_id: null })])).toHaveLength(0);
  });
});

describe("gravsten och märkning för UI:t", () => {
  const rad = { id: "s1", medarbetare_id: MED, datum: DATUM, start_tid: "12:30:00", slut_tid: "13:50:00", kalla: "flytt", aktivitet_typ: "flytt" };
  it("bara en automatisk flytt blir gravsten — en rad föraren själv lagt in blir det aldrig", () => {
    expect(arAutomatiskFlytt(rad)).toBe(true);
    expect(arAutomatiskFlytt({ ...rad, kalla: "forare" })).toBe(false);
    expect(arAutomatiskFlytt({ ...rad, kalla: "synk" })).toBe(false);
    expect(arAutomatiskFlytt(null)).toBe(false);
    expect(flyttBortaRad(rad)).toEqual({ medarbetare_id: MED, datum: DATUM, start_tid: "12:30:00", slut_tid: "13:50:00" });
    expect(flyttBortaRad({ ...rad, kalla: "forare" })).toBeNull();
  });
});
