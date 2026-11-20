import { describe, it, expect } from "vitest";
import { nyNmeaState, matNmeaRad, nmeaChecksumOk, nmeaStateTillFix } from "./gpsKalla";

// Regressionstest: parsern MÅSTE matcha på meningstypen (GGA/RMC/VTG) oavsett talker-id.
// Ponsse skickar $GP…, men Rottne H8 (Dasa/GpsGate) skickar $GN…/$GL… (och $GA för Galileo).
// Skyddet ligger i matNmeaRad: `f[0].slice(-3)` strippar talker-prefixet. Om någon "förenklar"
// till startsWith('$GP') dör Rottne-GPS:en tyst — detta test fångar det.

// Bygg en NMEA-rad med KORREKT checksumma från kroppen (allt mellan $ och *).
const rad = (kropp: string) => {
  let cs = 0;
  for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i);
  return "$" + kropp + "*" + cs.toString(16).toUpperCase().padStart(2, "0");
};

// Facit-position (samma som Ponsse-testet): lat 56.35646, lng 15.04987, 9 sat, hdop 0.7, kurs 72.9.
const kroppGGA = (talker: string) => `${talker}GGA,144541.00,5621.387889,N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`;
const kroppRMC = (talker: string) => `${talker}RMC,144541.00,A,5621.387889,N,01502.992016,E,0.0,72.9,260926,1.7,E,A,V`;
const kroppVTG = (talker: string) => `${talker}VTG,72.9,T,71.2,M,0.0,N,0.0,K,A`;

const fixAv = (rader: string[], nu = 1_000_000) => {
  let s = nyNmeaState();
  for (const r of rader) s = matNmeaRad(s, r, nu);
  return nmeaStateTillFix(s, nu);
};

describe("NMEA-parsern matchar meningstyp oavsett talker-id (GP/GN/GL/GA)", () => {
  it("Rottne H8: $GNGGA + $GNRMC → giltig position", () => {
    const fix = fixAv([rad(kroppGGA("GN")), rad(kroppRMC("GN"))]);
    expect(fix.giltig).toBe(true);
    expect(fix.lat).toBeCloseTo(56.35646, 5);
    expect(fix.lng).toBeCloseTo(15.04987, 5);
    expect(fix.satelliter).toBe(9);
    expect(fix.hdop).toBe(0.7);
  });

  it("$GNRMC ensam bär lat/lng (utan GGA)", () => {
    const fix = fixAv([rad(kroppRMC("GN"))]);
    expect(fix.giltig).toBe(true);
    expect(fix.lat).toBeCloseTo(56.35646, 5);
    expect(fix.lng).toBeCloseTo(15.04987, 5);
  });

  it("GP, GN, GL, GA ger IDENTISK position (talker-agnostiskt)", () => {
    const lat = (t: string) => fixAv([rad(kroppGGA(t)), rad(kroppRMC(t))]).lat;
    expect(lat("GN")).toBe(lat("GP"));
    expect(lat("GL")).toBe(lat("GP"));
    expect(lat("GA")).toBe(lat("GP"));
    expect(lat("GP")).toBeCloseTo(56.35646, 5);
  });

  it("$GNVTG ger kurs; $GLGSV ignoreras utan att störa positionen", () => {
    const fix = fixAv([
      rad(kroppGGA("GN")),
      rad("GLGSV,3,1,11,02,45,050,44,05,12,180,38"), // Rottnes GL-satellitrad → typ GSV, hoppas över
      rad(kroppRMC("GN")),
      rad(kroppVTG("GN")),
    ]);
    expect(fix.lat).toBeCloseTo(56.35646, 5);
    expect(fix.giltig).toBe(true);
    expect(fix.kurs).toBe(72.9);
  });

  it("blandad ström $GPGGA + $GNRMC → giltig position", () => {
    expect(fixAv([rad(kroppGGA("GP")), rad(kroppRMC("GN"))]).giltig).toBe(true);
  });

  it("checksumman räknas på kroppen oavsett talker-prefix", () => {
    expect(nmeaChecksumOk(rad(kroppGGA("GN")))).toBe(true);
    expect(nmeaChecksumOk(rad(kroppRMC("GL")))).toBe(true);
    expect(nmeaChecksumOk(rad(kroppVTG("GA")))).toBe(true);
  });
});
