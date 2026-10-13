// Binder scripts/arbetstid-kontroll.sql till lib/arbetstidsgranser.ts. Samma fixtur som kördes mot en lokal Postgres 16 med SQL-skriptet
// (idag = 2026-10-13); siffrorna nedan är SQL-skriptets utdata, ordagrant. Två oberoende uträkningar (SQL med lag()/generate_series,
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
const arsovertid = { ar: 2026, tomDatum: TOM, timmar: 0, modeller: { vardagar: 0, dagar: 0, vecka: 0, genomsnitt: 0 }, perioder: [], veckor: [], basavdrag: { franvaroTimmar: 0, rodaTimmar: 0 } };
const gr = (f: ReturnType<typeof byggArbetstid>, id: string) => f.granser.find(g => g.id === id)!;

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
