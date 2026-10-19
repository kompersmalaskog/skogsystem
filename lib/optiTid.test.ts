import { describe, it, expect } from "vitest";
import {
  sthlmOffsetMin, sthlmLokalTillUtcMs, optiTidUtcMs, optiLokalMs, optiTidSomVaggklocka,
  optiLokalDag, optiLokalKlockslag, optiLokalTimme, sthlmDagGranserUtc, normaliseraSkiftTider,
} from "./optiTid";

/** Sista söndagen i månaden 01:00 UTC — EU:s regel för övergången (samma som importskriptet). */
function sistaSondag01(ar: number, manad: number): number {
  const d = new Date(Date.UTC(ar, manad - 1, 31, 1));
  d.setUTCDate(31 - ((d.getUTCDay() + 0) % 7));
  return d.getTime();
}

/** Referens: förskjutningen enligt EU:s regel, oberoende av Intl. */
function euOffset(utcMs: number): number {
  const ar = new Date(utcMs).getUTCFullYear();
  return utcMs >= sistaSondag01(ar, 3) && utcMs < sistaSondag01(ar, 10) ? 120 : 60;
}

describe("sthlmOffsetMin", () => {
  it("vinter 60, sommar 120", () => {
    expect(sthlmOffsetMin(Date.parse("2026-01-15T12:00:00Z"))).toBe(60);
    expect(sthlmOffsetMin(Date.parse("2026-07-15T12:00:00Z"))).toBe(120);
  });

  it("följer EU:s regel över 2020–2035, minut för minut kring båda övergångarna", () => {
    for (let ar = 2020; ar <= 2035; ar++) {
      for (const manad of [3, 10]) {
        const g = sistaSondag01(ar, manad);
        for (const delta of [-61, -60, -2, -1, 0, 1, 2, 59, 60, 61]) {
          const t = g + delta * 60_000;
          expect(sthlmOffsetMin(t), `${ar}-${manad} delta ${delta}`).toBe(euOffset(t));
        }
      }
    }
  });
});

describe("sthlmLokalTillUtcMs (väggklocka → ögonblick)", () => {
  it("vanlig sommar- och vintertid", () => {
    expect(new Date(sthlmLokalTillUtcMs(Date.UTC(2026, 9, 12, 9, 4))).toISOString()).toBe("2026-10-12T07:04:00.000Z");
    expect(new Date(sthlmLokalTillUtcMs(Date.UTC(2026, 0, 12, 9, 4))).toISOString()).toBe("2026-01-12T08:04:00.000Z");
  });

  it("samma svar som EU-regeln för varje kvart i 16 år, utom den dubbla och den obefintliga timmen", () => {
    for (let ar = 2020; ar <= 2035; ar++) {
      const start = Date.UTC(ar, 0, 1);
      const slut = Date.UTC(ar + 1, 0, 1);
      for (let v = start; v < slut; v += 15 * 60_000) {
        const u = sthlmLokalTillUtcMs(v);
        // Förskjutningen vid det ögonblick vi valde ska vara den som gör väggklockan till v.
        const off = euOffset(u);
        const vaggIgen = u + off * 60_000;
        if (vaggIgen !== v) {
          // bara den obefintliga timmen i mars får avvika (väggklockan 02:00–02:59 finns inte)
          const g = sistaSondag01(ar, 3) + 60 * 60_000; // 01:00 UTC = 02:00 vinter → 03:00 sommar
          expect(v >= g && v < g + 60 * 60_000, new Date(v).toISOString()).toBe(true);
        }
      }
    }
  });

  it("dubbel timme i oktober → sommartid (första förekomsten); obefintlig i mars → vintertid", () => {
    expect(new Date(sthlmLokalTillUtcMs(Date.UTC(2026, 9, 25, 2, 30))).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(new Date(sthlmLokalTillUtcMs(Date.UTC(2026, 2, 29, 2, 30))).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
});

describe("optiTidSomVaggklocka — båda konventionerna ger samma väggklocka", () => {
  it("äldre rad: väggklockan ligger som UTC och lämnas orörd", () => {
    expect(optiTidSomVaggklocka("2026-10-12T09:04:00+00:00", false)).toBe("2026-10-12T09:04:00+00:00");
  });

  it("ny rad: verkligt UTC blir svensk väggklocka (sommar +2, vinter +1)", () => {
    expect(optiTidSomVaggklocka("2026-10-12T07:04:00+00:00", true)).toBe("2026-10-12T09:04:00+00:00");
    expect(optiTidSomVaggklocka("2026-01-12T08:04:00+00:00", true)).toBe("2026-01-12T09:04:00+00:00");
  });

  it("mikrosekunderna följer med, och PostgREST-formen utan avslutande nollor fungerar", () => {
    expect(optiTidSomVaggklocka("2026-10-12T07:04:00.80883+00:00", true)).toBe("2026-10-12T09:04:00.80883+00:00");
    expect(optiTidSomVaggklocka("2026-10-12T09:04:00.808830+00:00", false)).toBe("2026-10-12T09:04:00.808830+00:00");
  });

  it("rad som flyttats (äldre → ny) ger exakt samma sträng som före flytten, för varje 7:e minut i ett år", () => {
    const start = Date.UTC(2026, 0, 1);
    const slut = Date.UTC(2027, 0, 1);
    for (let v = start; v < slut; v += 7 * 60_000 + 13_000) {
      const gammal = new Date(v).toISOString().slice(0, 19) + "+00:00"; // väggklocka lagrad som UTC
      const ny = new Date(sthlmLokalTillUtcMs(v)).toISOString().slice(0, 19) + "+00:00"; // samma klockslag, verkligt UTC
      const a = optiTidSomVaggklocka(gammal, false);
      const b = optiTidSomVaggklocka(ny, true);
      if (a !== b) {
        // enda tillåtna avvikelsen: den obefintliga timmen i mars
        const g = sistaSondag01(2026, 3) + 60 * 60_000;
        expect(v >= g && v < g + 60 * 60_000, gammal).toBe(true);
      }
    }
  });

  it("tomt och skräp ger null, aldrig en påhittad tid", () => {
    expect(optiTidSomVaggklocka(null, true)).toBeNull();
    expect(optiTidSomVaggklocka("", false)).toBeNull();
    expect(optiTidSomVaggklocka("inte en tid", true)).toBeNull();
    expect(optiTidUtcMs(undefined, true)).toBeNull();
  });
});

describe("dag, klockslag, timme (svensk tid, inte webbläsarens)", () => {
  it("23:30 svensk tid i oktober ligger på rätt dag i båda konventionerna", () => {
    expect(optiLokalDag("2026-10-12T21:30:00+00:00", true)).toBe("2026-10-12"); // 23:30 sommartid
    expect(optiLokalDag("2026-10-12T22:30:00+00:00", true)).toBe("2026-10-13"); // 00:30 nästa dag
    expect(optiLokalDag("2026-10-12T23:30:00+00:00", false)).toBe("2026-10-12");
  });

  it("klockslag och timme följer väggklockan", () => {
    expect(optiLokalKlockslag("2026-10-12T07:04:09+00:00", true)).toBe("09:04");
    expect(optiLokalKlockslag("2026-10-12T09:04:09+00:00", false)).toBe("09:04");
    expect(optiLokalTimme("2026-10-12T07:04:09+00:00", true)).toBe(9);
    expect(optiLokalTimme("2026-10-12T09:04:09+00:00", false)).toBe(9);
  });

  it("optiTidUtcMs: verkligt ögonblick oavsett konvention", () => {
    const sant = Date.parse("2026-10-12T07:04:00Z");
    expect(optiTidUtcMs("2026-10-12T07:04:00+00:00", true)).toBe(sant);
    expect(optiTidUtcMs("2026-10-12T09:04:00+00:00", false)).toBe(sant);
    expect(optiLokalMs("2026-10-12T07:04:00+00:00", true)).toBe(Date.UTC(2026, 9, 12, 9, 4));
  });
});

describe("sthlmDagGranserUtc", () => {
  it("en vanlig dag i sommartid och vintertid", () => {
    expect(sthlmDagGranserUtc("2026-10-12")).toEqual({ fran: "2026-10-11T22:00:00.000Z", till: "2026-10-12T22:00:00.000Z" });
    expect(sthlmDagGranserUtc("2026-01-12")).toEqual({ fran: "2026-01-11T23:00:00.000Z", till: "2026-01-12T23:00:00.000Z" });
  });

  it("dygnet då klockan ställs tillbaka är 25 timmar, framåt 23", () => {
    const hr = (g: { fran: string; till: string }) => (Date.parse(g.till) - Date.parse(g.fran)) / 3_600_000;
    expect(hr(sthlmDagGranserUtc("2026-10-25"))).toBe(25);
    expect(hr(sthlmDagGranserUtc("2026-03-29"))).toBe(23);
  });
});

describe("normaliseraSkiftTider — lönekedjan får samma strängar oavsett konvention", () => {
  it("äldre och omräknad skiftrad ger identiska tider (inloggning, maskin-inloggning, utloggning)", () => {
    const gammal = {
      id: 1, tid_ar_utc: false,
      inloggning_tid: "2026-10-12T07:04:09.123456+00:00",
      maskin_inloggning_tid: "2026-10-12T07:10:00+00:00",
      utloggning_tid: "2026-10-12T15:14:30+00:00",
    };
    const ny = {
      id: 1, tid_ar_utc: true,
      inloggning_tid: "2026-10-12T05:04:09.123456+00:00",
      maskin_inloggning_tid: "2026-10-12T05:10:00+00:00",
      utloggning_tid: "2026-10-12T13:14:30+00:00",
    };
    const a = normaliseraSkiftTider(gammal);
    const b = normaliseraSkiftTider(ny);
    expect(a.inloggning_tid).toBe(b.inloggning_tid);
    expect(a.maskin_inloggning_tid).toBe(b.maskin_inloggning_tid);
    expect(a.utloggning_tid).toBe(b.utloggning_tid);
    expect(a.inloggning_tid).toBe("2026-10-12T07:04:09.123456+00:00");
  });

  it("saknad tid förblir null/undefined, flagga saknas = äldre konvention, otolkbart lämnas orört", () => {
    const r = normaliseraSkiftTider({ tid_ar_utc: null, inloggning_tid: "2026-01-12T09:00:00+00:00", maskin_inloggning_tid: null, utloggning_tid: "skräp" });
    expect(r.inloggning_tid).toBe("2026-01-12T09:00:00+00:00");
    expect(r.maskin_inloggning_tid).toBeNull();
    expect(r.utloggning_tid).toBe("skräp");
  });
});
