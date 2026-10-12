import { describe, it, expect } from "vitest";
import { nyNmeaState, matNmeaRad, nmeaStateTillFix, formateraFordrojning } from "./gpsKalla";
import { beraknaOffset, OKORRIGERAD, type KlockaKorr } from "./serverKlocka";

// KLOCKAVVIKELSEN. Fältfel (Giant, Stefan, 2026-10-08): maskindatorns klocka gick ca 4 min FÖRE (Ponsses system sätter troligen klockan, trots
// "ställ in tid automatiskt"). Åldersvakten jämförde NMEA-tiden (UTC från satelliten) mot datorns klocka → färsk GPS såg 4 min gammal ut →
// all GPS fördröjd → inget hyttspår loggades sedan #700. Nu jämförs NMEA mot VERKLIG tid = datorns klocka + avvikelsen mot servern.

const rad = (kropp: string) => {
  let cs = 0;
  for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i);
  return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0");
};
const gga = (tid: string) => rad(`GNGGA,${tid},5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`);
const rmc = (tid: string, datum = "081026") => rad(`GNRMC,${tid},A,5621.387889,N,01502.992016,E,0.0,72.9,${datum},1.7,E,A,V`);
const utc = (y: number, mo: number, d: number, h: number, mi: number, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h, mi, s, ms);

// VERKLIG tid i testet: 2026-10-08 12:00:00 UTC. Datorns klocka går 4 min FÖRE.
const SANN = utc(2026, 10, 8, 12, 0, 0);
const DATORN = SANN + 4 * 60_000;
// Servern svarade "Thu, 08 Oct 2026 12:00:00 GMT" medan datorns klocka visade DATORN (anropet tog 0,2 s) — så mäts avvikelsen i drift.
const MATT_OFFSET = beraknaOffset("Thu, 08 Oct 2026 12:00:00 GMT", DATORN - 100, DATORN + 100) as number;
const KORR: KlockaKorr = { offsetMs: MATT_OFFSET, klar: true };

/** Mata raderna med ANKOMSTtid = datorns klocka (som drivern gör) och läs fixen med given klockkorrigering. */
const fixAv = (rader: string[], nu: number, klocka: KlockaKorr) => {
  let s = nyNmeaState();
  for (const r of rader) s = matNmeaRad(s, r, nu, klocka);
  return nmeaStateTillFix(s, nu, undefined, undefined, klocka);
};

describe("klockavvikelse: datorn 4 min före, NMEA jämförs mot verklig tid", () => {
  it("avvikelsen mäts rätt: datorn 4 min före → offset ≈ −4 min (inom en sekund)", () => {
    expect(Math.abs(MATT_OFFSET - -240_000)).toBeLessThan(1000);
  });

  it("KODBEVIS 1: datorklocka 4 min före + FÄRSK NMEA (1 s gammal) → giltig, inte fördröjd", () => {
    const farsk = [gga("115959.00"), rmc("115959.00")];   // mätt 1 s före verklig tid
    const fix = fixAv(farsk, DATORN, KORR);
    expect(fix.giltig).toBe(true);
    expect(fix.fordrojd).toBe(false);
    expect(Math.abs((fix.nmeaAlderMs ?? 0) - 1500)).toBeLessThan(1000);   // ≈ 1 s (+ halv sekund från Date-huvudets avkapning)
  });

  it("…och UTAN korrigering var samma färska NMEA fördröjd (felet som stoppade Giants loggning)", () => {
    const fix = fixAv([gga("115959.00"), rmc("115959.00")], DATORN, OKORRIGERAD);
    expect(fix.giltig).toBe(false);
    expect(fix.fordrojd).toBe(true);
    expect(fix.nmeaAlderMs).toBe(4 * 60_000 + 1000);
  });

  it("KODBEVIS 2: datorklocka 4 min före + NMEA 2 h gammal → fördröjd, och åldern är den VERKLIGA (2 h, inte 2 h 4 min)", () => {
    const gammal = [gga("100000.00"), rmc("100000.00")];   // mätt 10:00 UTC, verklig tid 12:00
    const fix = fixAv(gammal, DATORN, KORR);
    expect(fix.giltig).toBe(false);
    expect(fix.fordrojd).toBe(true);
    expect(Math.abs((fix.nmeaAlderMs ?? 0) - 2 * 3600_000)).toBeLessThan(1000);
    expect(formateraFordrojning(fix.nmeaAlderMs ?? 0)).toBe("2 h");
    // okorrigerat hade skrivit "2 h 4 min" — fel siffra i GPS-källa-kortet
    expect(formateraFordrojning(fixAv(gammal, DATORN, OKORRIGERAD).nmeaAlderMs ?? 0)).toBe("2 h 4 min");
  });

  it("gränsen 30 s gäller verklig tid: 25 s gammal NMEA är giltig, 40 s är fördröjd — även med datorn 4 min före", () => {
    expect(fixAv([gga("115935.00"), rmc("115935.00")], DATORN, KORR).giltig).toBe(true);    // 25 s
    const sen = fixAv([gga("115920.00"), rmc("115920.00")], DATORN, KORR);                  // 40 s
    expect(sen.fordrojd).toBe(true);
    expect(sen.giltig).toBe(false);
  });

  it("datorn går EFTER (3 min): färsk NMEA är giltig med korrigering, och NMEA 'i framtiden' är aldrig fördröjd", () => {
    const efter = SANN - 3 * 60_000;
    const off = beraknaOffset("Thu, 08 Oct 2026 12:00:00 GMT", efter - 100, efter + 100) as number;
    expect(Math.abs(off - 180_000)).toBeLessThan(1000);
    const fix = fixAv([gga("115959.00"), rmc("115959.00")], efter, { offsetMs: off, klar: true });
    expect(fix.giltig).toBe(true);
    expect(fix.fordrojd).toBe(false);
  });

  it("GGA utan datum tolkas mot verklig tid: datorn 4 min före över dygnsskiftet → färsk GGA är giltig", () => {
    // verklig tid 23:58:00 UTC den 8:e; datorn visar 00:02:00 den 9:e
    const sann = utc(2026, 10, 8, 23, 58, 0);
    const dator = sann + 4 * 60_000;
    const off = beraknaOffset("Thu, 08 Oct 2026 23:58:00 GMT", dator - 100, dator + 100) as number;
    let s = nyNmeaState();
    const k: KlockaKorr = { offsetMs: off, klar: true };
    s = matNmeaRad(s, gga("235759.00"), dator, k);   // bara GGA (ingen RMC med datum)
    s = matNmeaRad(s, rad("GNRMC,235759.00,A,5621.387889,N,01502.992016,E,0.0,72.9,,1.7,E,A,V"), dator, k);   // RMC utan datum → faller tillbaka på GGA
    const fix = nmeaStateTillFix(s, dator, undefined, undefined, k);
    expect(fix.fordrojd).toBe(false);
    expect(fix.giltig).toBe(true);
  });

  it("innan första klocksynken är klar (klar=false) avgörs inget: giltig=false men INTE fördröjd (ingen varning för något vi inte vet)", () => {
    const fix = fixAv([gga("115959.00"), rmc("115959.00")], DATORN, { offsetMs: 0, klar: false });
    expect(fix.giltig).toBe(false);
    expect(fix.fordrojd).toBe(false);
    expect(fix.nmeaAlderMs).toBeNull();
  });

  it("standardanropen (utan klocka) beter sig som #700: samma siffror som åldersvakt-testerna", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    let s = nyNmeaState();
    for (const r of [gga("110700.00"), rmc("110700.00", "051026")]) s = matNmeaRad(s, r, nu);
    const fix = nmeaStateTillFix(s, nu);
    expect(fix.fordrojd).toBe(true);
    expect(fix.nmeaAlderMs).toBe(2.5 * 3600 * 1000);
  });
});
