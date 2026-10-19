// Binder scripts/arbetstid-kontroll.sql till lib/arbetstidsgranser.ts. Samma fixtur som kördes mot en lokal Postgres 16 med SQL-skriptet
// (idag = 2026-10-13, nu ≈ 15:00 i Stockholm); siffrorna nedan är SQL-skriptets utdata, ordagrant. Två oberoende uträkningar (SQL med lag()/generate_series,
// TypeScript med lib/vilobrott) ska ge samma tal — avviker de är det ena fel. Martins planeringschatt kör samma skript mot prod
// och jämför mot kortet Arbetstid på samma sätt.
import { describe, it, expect } from "vitest";
import { byggArbetstid } from "./arbetstidsgranser";

const TOM = "2026-10-13";
const T = { dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 };
const lok = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dagar = (fran: string, till: string, ok: (d: Date) => boolean) => { const ut: string[] = []; for (const d = lok(fran); iso(d) <= till; d.setDate(d.getDate() + 1)) if (ok(d)) ut.push(iso(d)); return ut; };
const vardag = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const arsovertid = { ar: 2026, tomDatum: TOM, timmar: 0, modeller: { vardagar: 0, dagar: 0, vecka: 0, genomsnitt: 0, manad: 0 }, manader: [], perioder: [], veckor: [], basavdrag: { franvaroTimmar: 0, rodaTimmar: 0 } };
const gr = (f: ReturnType<typeof byggArbetstid>, id: string) => f.granser.find(g => g.id === id)!;
const NU = new Date("2026-10-13T13:00:00Z");   // 15:00 i Stockholm
const fran15 = (d: string) => ({ datum: d, start_tid: "06:00", slut_tid: "15:00", arbetad_min: 480 });

// Joacim: vardagar 2026-08-17 → 2026-10-13, 06:00–15:00 (480 min); måndag 5 okt slutar 20:00. 90 min restid utan klockslag 10 okt.
const joacim = byggArbetstid({
  medarbetare_id: "j", namn: "Joacim", tomDatum: TOM, arsovertid, trosklar: T, franvaro: [],
  dagar: dagar("2026-08-17", TOM, vardag).map(d => ({ datum: d, start_tid: "06:00", slut_tid: d === "2026-10-05" ? "20:00" : "15:00", arbetad_min: 480 })),
  extra: [{ datum: "2026-10-10", minuter: 90, start_tid: null, slut_tid: null, aktivitet_typ: "restid" }],
});
// Oskar: vardagar 2026-08-18 → 2026-10-13 plus ALLA dagar från 4 okt (sju-åtta dagar i rad), 06:00–15:00.
const oskar = byggArbetstid({
  medarbetare_id: "o", namn: "Oskar", tomDatum: TOM, arsovertid, trosklar: T, franvaro: [], extra: [],
  dagar: dagar("2026-08-18", TOM, d => vardag(d) || iso(d) >= "2026-10-04").map(d => ({ datum: d, start_tid: "06:00", slut_tid: "15:00", arbetad_min: 480 })),
});

// Prod-kontrollen 2026-10-13 hittade två falsklarm i veckovilan (Oscar Ringberg 14,5 tim: anställd 28 sep, inga pass före; Joacim 13,3 tim:
// pågående vila efter sista passet) och att maskinflyttens körtid (flyttdag) saknades i underlaget (2026-09-25: 400 min flytt, 0 min i underlaget).
// Fyra nya fixturer i SQL-skriptets lokala körning:
//   Oscar     ny förare, mån–fre från 28 sep                          SQL: snitt 42,0 (16 dagar → kortet visar inget), veckovila 63,0 lugn
//   Flyttare  mån–fre 24 aug–13 okt, fre 25 sep är en ren flyttdag    SQL: 6,7 tim flytt i snittet 40,4
//   Streak    8 dagar i rad 29 sep–6 okt, sedan ledig                 SQL: snitt 36,2, veckovila 63,0 lugn (vilan efter 6 okt räknas)
//   Natt      mån–fre till 9 okt, tis 6 okt är en nattflytt 22:00–02:00  SQL: dygnsvila 4,0 den 6 okt RÖD, snitt 37,9
const vd = (fran: string, till: string) => dagar(fran, till, vardag);
const oscar = byggArbetstid({ medarbetare_id: "oc", namn: "Oscar", tomDatum: TOM, arsovertid, trosklar: T, franvaro: [], extra: [], nu: NU,
  dagar: vd("2026-09-28", TOM).map(fran15) });
const flyttare = byggArbetstid({ medarbetare_id: "fl", namn: "Flyttare", tomDatum: TOM, arsovertid, trosklar: T, franvaro: [], extra: [], nu: NU,
  dagar: vd("2026-08-24", TOM).filter(d => d !== "2026-09-25").map(fran15),
  flytt: [{ starttid: "2026-09-25T04:00:00Z", sluttid: "2026-09-25T13:00:00Z", total_tid_min: 400 }] });
const streak = byggArbetstid({ medarbetare_id: "st", namn: "Streak", tomDatum: TOM, arsovertid, trosklar: T, franvaro: [], extra: [], nu: NU,
  dagar: [...vd("2026-08-24", "2026-09-25"), ...dagar("2026-09-29", "2026-10-06", () => true)].map(fran15) });
const natt = byggArbetstid({ medarbetare_id: "na", namn: "Natt", tomDatum: TOM, arsovertid, trosklar: T, franvaro: [], extra: [], nu: NU,
  dagar: vd("2026-08-24", "2026-10-09").filter(d => d !== "2026-10-06").map(fran15),
  flytt: [{ starttid: "2026-10-06T20:00:00Z", sluttid: null, total_tid_min: 240 }] });

describe("prod-kontrollen 2026-10-13: ändarna i veckovilan och maskinflytten (SQL-skriptet och koden ger samma)", () => {
  it("Oscar: veckovila 63,0 lugn (var 14,5 RÖD); snittet visas inte förrän det finns 28 dagar (16 dagar → null)", () => {
    expect(gr(oscar, "veckovila")).toMatchObject({ varde: 63, niva: "lugn" });
    expect(gr(oscar, "snitt_48").varde).toBeNull();
    expect(gr(oscar, "dygnsvila")).toMatchObject({ varde: 15, niva: "lugn" });
  });
  it("Streak (åtta dagar i rad, sedan ledig sedan 6 okt): veckovila 63,0 lugn — vilan efter sista passet fram till nu räknas; snitt 36,2", () => {
    expect(gr(streak, "veckovila")).toMatchObject({ varde: 63, niva: "lugn" });
    expect(gr(streak, "snitt_48").varde).toBe(36.2);
  });
  it("Flyttare: 2026-09-25 (400 min flytt, 0 min i underlaget) ingår: snitt 40,4 med 6,7 tim flytt — och kortet säger det", () => {
    expect(gr(flyttare, "snitt_48").varde).toBe(40.4);
    expect(flyttare.notiser).toEqual(["Maskinflytt ingår: 1 flyttdag, 6,7 tim (körningen fram till sista objektet; hemresan ingår inte)."]);
    expect(flyttare.restidSaknas).toBe(false);
  });
  it("Natt: nattflytten tis 22:00–02:00 ger dygnsvila 4,0 tim den 6 okt = RÖD; snitt 37,9", () => {
    expect(gr(natt, "dygnsvila")).toMatchObject({ varde: 4, niva: "rod" });
    expect(gr(natt, "dygnsvila").mening).toContain("6 okt");
    expect(gr(natt, "snitt_48").varde).toBe(37.9);
    expect(gr(natt, "veckovila")).toMatchObject({ varde: 63, niva: "lugn" });
  });
});

describe("lib/arbetstidsgranser = scripts/arbetstid-kontroll.sql (samma fixtur, två oberoende uträkningar)", () => {
  it("fråga 1, snitt tim/vecka: Oskar 43,2 (352 tim, 57 dagar) och Joacim 40,7 (337,5 tim, 58 dagar)", () => {
    expect(gr(oskar, "snitt_48").varde).toBe(43.2);
    expect(gr(oskar, "snitt_48").niva).toBe("gul");
    expect(gr(joacim, "snitt_48").varde).toBe(40.7);
    expect(gr(joacim, "snitt_48").niva).toBe("lugn");
  });
  it("fråga 3, dygnsvila: Joacim 10,0 tim den 5 okt = RÖD; Oskar 15,0 = lugn", () => {
    expect(gr(joacim, "dygnsvila")).toMatchObject({ varde: 10, niva: "rod" });
    expect(gr(joacim, "dygnsvila").mening).toContain("5 okt");
    expect(gr(oskar, "dygnsvila")).toMatchObject({ varde: 15, niva: "lugn" });
  });
  it("fråga 4, veckovila: Oskar 15,0 tim = RÖD (sju dagar i rad); Joacim 63,0 = lugn", () => {
    expect(gr(oskar, "veckovila")).toMatchObject({ varde: 15, niva: "rod" });
    expect(gr(joacim, "veckovila")).toMatchObject({ varde: 63, niva: "lugn" });
  });
  it("fråga 5a, restid: Joacim har 1,5 tim i underlaget, Oskar ingen → bara Oskar får 'Restid ingår inte'", () => {
    expect(joacim.restidSaknas).toBe(false);
    expect(oskar.restidSaknas).toBe(true);
  });
});
