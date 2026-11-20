import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { relativTid, relativDatum, tokenGarUtSnart, TOKEN_VARNING_DAGAR } from "./tokenStatus";

const NU = new Date(2026, 9, 17, 12, 0); // 17 okt 2026 12:00 (lokal tid)

describe("senast synkad: idag, igår eller datum — aldrig en tidsstämpel med sekunder", () => {
  it("idag och igår", () => {
    expect(relativTid("2026-10-17T08:05:00", NU)).toBe("idag 08:05");
    expect(relativTid("2026-10-16T23:10:00", NU)).toBe("igår 23:10");
  });
  it("äldre: dag och månad", () => {
    expect(relativTid("2026-10-12T07:30:00", NU)).toBe("12 okt 07:30");
    expect(relativTid("2025-12-31T07:30:00", NU)).toBe("31 dec 07:30");
  });
  it("sekunder visas aldrig", () => {
    expect(relativTid("2026-10-16T23:10:59", NU)).not.toMatch(/:\d\d:\d\d/);
  });
  it("ett datum som inte går att läsa står som det är, inte som 'NaN'", () => {
    expect(relativTid("skräp", NU)).toBe("skräp");
    expect(relativDatum("skräp")).toBe("skräp");
  });
  it("relativDatum: dag och månad", () => {
    expect(relativDatum("2026-10-24T10:00:00")).toBe("24 okt");
  });
});

describe("token-datumet visas bara när det går ut snart", () => {
  it(`långt kvar (mer än ${TOKEN_VARNING_DAGAR} dagar): inget att göra, ingen rad`, () => {
    expect(tokenGarUtSnart("2026-12-01T01:00:00", NU)).toBeNull();
    expect(tokenGarUtSnart("2026-11-02T12:00:00", NU)).toBeNull(); // 16 dagar kvar
  });
  it("snart: en rad (Förnya)", () => {
    expect(tokenGarUtSnart("2026-10-24T12:00:00", NU)).toEqual({ utgangen: false });
    expect(tokenGarUtSnart("2026-10-31T12:00:00", NU)).toEqual({ utgangen: false }); // exakt 14 dagar
  });
  it("redan utgången: en rad, märkt utgången", () => {
    expect(tokenGarUtSnart("2026-10-10T12:00:00", NU)).toEqual({ utgangen: true });
  });
  it("saknas eller går inte att läsa: ingen rad", () => {
    expect(tokenGarUtSnart(null, NU)).toBeNull();
    expect(tokenGarUtSnart("skräp", NU)).toBeNull();
  });

  it("utgången räknas på TIDPUNKTEN, inte på dagen — en token som dör 14:00 lever 13:00", () => {
    const kl13 = new Date(2026, 9, 17, 13, 0);
    expect(tokenGarUtSnart("2026-10-17T14:00:00", kl13)).toEqual({ utgangen: false });
    expect(tokenGarUtSnart("2026-10-17T12:30:00", kl13)).toEqual({ utgangen: true });
  });
});

/**
 * CI kör TZ=UTC, där dygnet alltid är 24 timmar. Appen kör i webbläsaren i
 * Europe/Stockholm, där det är 23 eller 25 timmar två nätter om året — och
 * exakt det tappade varningen (14,04 > 14). Ett test som bara är grönt i UTC
 * vaktar alltså inte verkligheten, så den här kontrollen kör modulen i en
 * EGEN process med svensk tid. Hela svaret hämtas i ETT anrop (tsx tar ~1,5 s).
 */
describe("sommartid: samma svar i svensk tid som i UTC", () => {
  it("två veckor över skiftet 25 okt är fortfarande två veckor", () => {
    const svar = execFileSync(
      "./node_modules/.bin/tsx",
      [
        "-e",
        `import { tokenGarUtSnart } from './lib/lonesystem/tokenStatus';
         const nu = new Date(2026, 9, 17, 12, 0);
         const d = (s) => JSON.stringify(tokenGarUtSnart(s, nu));
         console.log(JSON.stringify({
           timmar: (new Date('2026-10-31T12:00:00').getTime() - nu.getTime()) / 3600000,
           overSkiftet: d('2026-10-31T12:00:00'),
           utanSkiftet: d('2026-10-24T12:00:00'),
           femton: d('2026-11-01T12:00:00'),
         }));`,
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, TZ: "Europe/Stockholm" } },
    );
    const ut = JSON.parse(svar.trim().split("\n").pop()!);

    // Beviset att processen verkligen körde i svensk tid: 14 dygn är 337 timmar
    // när sommartiden försvinner emellan, inte 336.
    expect(ut.timmar).toBe(337);

    expect(JSON.parse(ut.overSkiftet)).toEqual({ utgangen: false }); // exakt 14 dagar
    expect(JSON.parse(ut.utanSkiftet)).toEqual({ utgangen: false }); // 7 dagar
    expect(ut.femton).toBe("null"); // 15 dagar: ingen rad
  });
});
