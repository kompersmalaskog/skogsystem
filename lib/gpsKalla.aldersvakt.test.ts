import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { nyNmeaState, matNmeaRad, nmeaStateTillFix, nmeaTillEpoch, formateraFordrojning, FORDROJD_MAX_MS } from "./gpsKalla";

// ÅLDERSVAKTEN. Fältfel (Rottne, GpsGate → Eltima COM20/21): Quectel skickar GGA/RMC + GSV/GSA för GP/GL/GA/PQ varje sekund —
// mer än 4800 baud hinner. Kön byggdes upp, och eftersom `giltig` mätte när meningen ANLÄNDE (inte när mätningen gjordes)
// såg gamla meningar färska ut: appen fick positioner 2,5 h gamla (NMEA-tid 11:07 UTC vid 13:37 UTC).

const rad = (kropp: string) => {
  let cs = 0;
  for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i);
  return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0");
};
const gga = (tid: string, kvalitet = "1") => rad(`GNGGA,${tid},5621.387889,N,01502.992016,E,${kvalitet},09,0.7,102.6,M,36.0,M,,`);
const rmc = (tid: string, datum = "051026", status = "A") => rad(`GNRMC,${tid},${status},5621.387889,N,01502.992016,E,0.0,72.9,${datum},1.7,E,A,V`);

const utc = (y: number, mo: number, d: number, h: number, mi: number, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h, mi, s, ms);

/** Mata raderna med ANKOMSTtid = nu (som drivern gör: meningarna kommer i färsk takt även när de är gamla) och läs fixen. */
const fixAv = (rader: string[], nu: number) => {
  let s = nyNmeaState();
  for (const r of rader) s = matNmeaRad(s, r, nu);
  return nmeaStateTillFix(s, nu);
};

describe("åldersvakt: NMEA-tiden jämförs mot datorns klocka", () => {
  it("FÄLTFELET: RMC/GGA med tiden 11:07 UTC när datorns klocka visar 13:37 UTC (2,5 h gammal) → giltig=false, fördröjd", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga("110700.00"), rmc("110700.00")], nu);
    expect(fix.giltig).toBe(false);
    expect(fix.fordrojd).toBe(true);
    expect(fix.nmeaAlderMs).toBe(2.5 * 3600 * 1000);
    // positionen finns kvar i fixen (för diagnos) men får aldrig användas — giltig=false är grinden
    expect(fix.lat).not.toBeNull();
  });

  it("samma meningar när klockan stämmer (NMEA-tid 10 s före datorns klocka) → giltig, inte fördröjd", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga("133650.00"), rmc("133650.00")], nu);
    expect(fix.giltig).toBe(true);
    expect(fix.fordrojd).toBe(false);
    expect(fix.nmeaAlderMs).toBe(10_000);
  });

  it("gränsen är 30 s: exakt 30,000 s är fortfarande giltigt, 30,010 s är fördröjt", () => {
    expect(FORDROJD_MAX_MS).toBe(30_000);
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const pa = fixAv([gga("133630.00"), rmc("133630.00")], nu);
    expect(pa.nmeaAlderMs).toBe(30_000);
    expect(pa.giltig).toBe(true);
    const over = fixAv([gga("133629.99"), rmc("133629.99")], nu);
    expect(over.nmeaAlderMs).toBe(30_010);
    expect(over.giltig).toBe(false);
    expect(over.fordrojd).toBe(true);
  });

  it("NMEA-tiden FÖRE datorns klocka (klockan går efter) räknas inte som fördröjd", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga("134200.00"), rmc("134200.00")], nu);   // 5 min "i framtiden"
    expect(fix.giltig).toBe(true);
    expect(fix.fordrojd).toBe(false);
    expect(fix.nmeaAlderMs).toBe(-300_000);
  });

  it("midnatt: RMC har datum → 23:59:50 den 5:e vid datorns 00:00:10 den 6:e är 20 s gammalt (giltigt), inte 24 h", () => {
    const nu = utc(2026, 10, 6, 0, 0, 10);
    const fix = fixAv([gga("235950.00"), rmc("235950.00", "051026")], nu);
    expect(fix.nmeaAlderMs).toBe(20_000);
    expect(fix.giltig).toBe(true);
  });

  it("datumet räknas: samma klockslag men gårdagens datum → ett dygn gammalt → fördröjt", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga("133650.00"), rmc("133650.00", "041026")], nu);
    expect(fix.fordrojd).toBe(true);
    expect(fix.giltig).toBe(false);
  });

  it("RMC utan datum → GGA:s klockslag tolkas mot datorns UTC-dygn (och närmaste dygn vid midnatt)", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const farsk = fixAv([gga("133650.00"), rmc("133650.00", "")], nu);
    expect(farsk.giltig).toBe(true);
    expect(farsk.nmeaAlderMs).toBe(10_000);
    const gammal = fixAv([gga("110700.00"), rmc("110700.00", "")], nu);
    expect(gammal.giltig).toBe(false);
    expect(gammal.fordrojd).toBe(true);
    // midnatt utan datum: 23:59:50 när klockan är 00:00:10 nästa dygn → 20 s, inte ~24 h
    const natt = fixAv([gga("235950.00"), rmc("235950.00", "")], utc(2026, 10, 6, 0, 0, 10));
    expect(natt.nmeaAlderMs).toBe(20_000);
    expect(natt.giltig).toBe(true);
  });

  it("RMC är facit när den finns: gammal GGA men färsk RMC → giltig", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga("110700.00"), rmc("133650.00")], nu);
    expect(fix.giltig).toBe(true);
  });

  it("RMC status V (ingen fix) → giltig=false men INTE 'fördröjd' (det är 'söker fix', ett annat tillstånd)", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga("110700.00", "0"), rmc("110700.00", "051026", "V")], nu);
    expect(fix.giltig).toBe(false);
    expect(fix.fordrojd).toBe(false);
    expect(fix.nmeaAlderMs).toBeNull();
  });

  it("ogiltig NMEA-tid (tom/skräp) kastar aldrig och gör inte fixen fördröjd", () => {
    const nu = utc(2026, 10, 5, 13, 37, 0);
    const fix = fixAv([gga(""), rmc("", "")], nu);
    expect(fix.fordrojd).toBe(false);
    expect(fix.nmeaAlderMs).toBeNull();
    expect(fix.giltig).toBe(true);   // som före åldersvakten: färsk ankomst + RMC A räcker när tiden saknas
  });

  it("en uppbyggd kö drar sig tillbaka: när färska meningar börjar komma blir fixen giltig igen", () => {
    let s = nyNmeaState();
    const nu = utc(2026, 10, 5, 13, 37, 0);
    s = matNmeaRad(s, rmc("110700.00"), nu); s = matNmeaRad(s, gga("110700.00"), nu);
    expect(nmeaStateTillFix(s, nu).giltig).toBe(false);
    s = matNmeaRad(s, rmc("133659.00"), nu + 1000); s = matNmeaRad(s, gga("133659.00"), nu + 1000);
    expect(nmeaStateTillFix(s, nu + 1000).giltig).toBe(true);
  });
});

describe("nmeaTillEpoch", () => {
  const nu = utc(2026, 10, 5, 13, 37, 0);
  it("tid + datum → exakt UTC-ögonblick (inklusive hundradelar)", () => {
    expect(nmeaTillEpoch("110700.50", "051026", nu)).toBe(utc(2026, 10, 5, 11, 7, 0, 500));
  });
  it("ogiltiga fält → null", () => {
    for (const t of [undefined, "", "1107", "abcdef", "256000.00", "116000.00", "110770.00"]) expect(nmeaTillEpoch(t as any, "051026", nu)).toBeNull();
    expect(nmeaTillEpoch("110700.00", "321326", nu)).toBeNull();   // dag 32 / månad 13
  });
});

describe("formateraFordrojning — texten bredvid 'GPS-data är fördröjd'", () => {
  it("timmar, minuter, sekunder", () => {
    expect(formateraFordrojning(9_000_000)).toBe("2 h 30 min");
    expect(formateraFordrojning(7_200_000)).toBe("2 h");
    expect(formateraFordrojning(3_599_000)).toBe("1 h");        // 59 min 59 s avrundas inte till "60 min"
    expect(formateraFordrojning(720_000)).toBe("12 min");
    expect(formateraFordrojning(45_000)).toBe("45 s");
    expect(formateraFordrojning(-5000)).toBe("0 s");
  });
});

// Vakt mot att UI-kopplingen i planeringsvyn försvinner (sidan är 24 000 rader och körs inte i enhetstester)
describe("planeringsvyn visar fördröjd GPS-data och erbjuder baudrate-val", () => {
  const src = readFileSync(new URL("../app/planering/page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  it("bannern säger 'GPS-data är fördröjd' (med hur mycket) i st.f. 'Ingen GPS-fix' när åldersvakten slagit till", () => {
    expect(src).toContain("`GPS-data är fördröjd (${formateraFordrojning(gpsFordrojdMs)})` : 'Ingen GPS-fix'");
    expect(src).toContain("setGpsFordrojdMs(fix.fordrojd ? (fix.nmeaAlderMs ?? 0) : null);");
  });
  it("en giltig fix nollar fördröjd-läget", () => {
    expect(src).toMatch(/setGpsFixFarsk\(true\);\n\s+setGpsFordrojdMs\(null\);/);
  });
  it("GPS-källa-kortet har en baudrate-väljare (alla fyra + Auto) som startar om källan, och portvalet visar vilken baudrate som provas", () => {
    expect(src).toContain('data-testid="gps-baud"');
    expect(src).toContain("{BAUDRATER.map((b) => (");
    expect(src).toContain("void sattBaudValOchStartaOm(val);");
    expect(src).toContain("valjSerialPort((baud) => setProvarBaud(baud))");
  });
  it("positionen uppdateras bara av en GILTIG fix (en fördröjd kö rör aldrig currentPosition → inga hyttspår-punkter)", () => {
    expect(src).toMatch(/if \(fix\.giltig && fix\.lat != null && fix\.lng != null\) \{\n\s+setCurrentPosition/);
  });
});
