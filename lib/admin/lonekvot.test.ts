import { describe, it, expect } from "vitest";
import {
  KVOT_MIN_DAGAR, laggTillDag, tomKvot, summeraKvot, summaAvKvot, kvotLage, kvotProcent, kvotVarde, kvotMaskinText, kvotDetalj, kvotNot, pct,
} from "./lonekvot";

const fil = (min: number) => ({ min, kalla: "fil" as const });
const dagar = (n: number, betald = 480, maskin = 360) => Array.from({ length: n }, () => ({ min: betald, maskintid: fil(maskin) }));

describe("lönekvot: samma uppställning i Dagar och Förare · Månad", () => {
  it("räknas bara över dagar med filmaskin och betald tid — filfria och maskinlösa dagar står utanför men räknas i betald tid", () => {
    const s = summeraKvot([
      ...dagar(5, 480, 360),
      { min: 480, maskintid: { min: 0, kalla: "ingen_fil" } },      // 810E: skickar inga filer
      { min: 300, maskintid: { min: 0, kalla: "ingen_maskin" } },   // ingen maskin den dagen
      { min: 300 },                                                 // ingen maskintid i svaret alls
    ]);
    expect(s.dagar).toBe(8);
    expect(s.min).toBe(5 * 480 + 480 + 300 + 300);
    expect(s.kvotDagar).toBe(5);
    expect(s.kvotBetald).toBe(2400);
    expect(s.kvotMaskin).toBe(1800);
    expect(kvotProcent(s)).toBe(75);
  });

  it("en dag utan betald tid är ingen dag och ingen kvotdag (tom skalrad)", () => {
    const s = summeraKvot([{ min: 0, maskintid: fil(0) }, ...dagar(1)]);
    expect(s.dagar).toBe(1);
    expect(s.kvotDagar).toBe(1);
  });

  it(`under ${KVOT_MIN_DAGAR} dagar med maskinfiler: 'för få dagar', aldrig en procent`, () => {
    const s = summeraKvot(dagar(KVOT_MIN_DAGAR - 1));
    expect(kvotLage(s)).toBe("for_fa");
    expect(kvotProcent(s)).toBeNull();
    expect(kvotVarde(s)).toBe("för få dagar");
    expect(kvotDetalj(s)).toBe("Kräver minst 5 dagar med maskinfiler (4 hittills)");
    // Maskintiden är ändå en mätning och visas.
    expect(kvotMaskinText(s)).toBe("24 tim");
  });

  it("exakt gränsen räknas: 5 dagar ger procent", () => {
    expect(kvotLage(summeraKvot(dagar(KVOT_MIN_DAGAR)))).toBe("ok");
  });

  it("inga filmaskin-dagar: '–' och aldrig 0 %", () => {
    const s = summeraKvot([{ min: 480, maskintid: { min: 0, kalla: "ingen_fil" } }, { min: 480 }]);
    expect(kvotLage(s)).toBe("ingen");
    expect(kvotVarde(s)).toBe("–");
    expect(kvotMaskinText(s)).toBe("–");
    expect(kvotProcent(s)).toBeNull();
    expect(kvotDetalj(s)).toBe("Inga dagar med maskinfiler");
  });

  it("filmaskin men ingen maskintid på hela perioden är 0 %, ett mätt tal (inte '–')", () => {
    const s = summeraKvot(Array.from({ length: 6 }, () => ({ min: 480, maskintid: fil(0) })));
    expect(kvotVarde(s)).toBe("0 %");
    expect(s.utanMaskintid).toBe(6);
    expect(kvotDetalj(s)).toContain("6 utan maskintid");
  });

  it("procent: hel procent, delat på nämnaren, inte ett snitt av dagarnas procent", () => {
    // Dag 1: 100 % av 60 min, dag 2–5: 0 % av 540 min → viktat 60 / 2220 = 3 %, inte snittet 20 %.
    const s = summeraKvot([{ min: 60, maskintid: fil(60) }, ...Array.from({ length: 4 }, () => ({ min: 540, maskintid: fil(0) }))]);
    expect(kvotVarde(s)).toBe("3 %");
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBeNull();
  });

  it("summan 'Alla' är summan av förarnas minuter, inte ett snitt av förarnas procent", () => {
    const a = summeraKvot(dagar(5, 480, 480));   // 100 %
    const b = summeraKvot(dagar(5, 480, 240));   // 50 %
    const t = summaAvKvot([a, b]);
    expect(t.kvotMaskin).toBe(a.kvotMaskin + b.kvotMaskin);
    expect(kvotVarde(t)).toBe("75 %");
    // Hopslagningen är samma sak som att lägga alla dagar i en förare.
    expect(t).toEqual(summeraKvot([...dagar(5, 480, 480), ...dagar(5, 480, 240)]));
  });

  it("laggTillDag fyller en summa dag för dag och ger samma som summeraKvot", () => {
    const s = tomKvot();
    for (const d of dagar(6)) laggTillDag(s, d.min, d.maskintid);
    expect(s).toEqual(summeraKvot(dagar(6)));
  });

  it("noten under föraren i Dagar: tyst när Maskin delat med Betalt ÄR kvoten, annars säger den vad kvoten räknas över", () => {
    expect(kvotNot(summeraKvot(dagar(6)))).toBeNull();
    const blandat = summeraKvot([...dagar(5), { min: 480, maskintid: { min: 0, kalla: "ingen_fil" } }]);
    expect(kvotNot(blandat)).toBe("kvoten räknas över 5 av 6 dagar (de med maskinfiler)");
    expect(kvotNot(summeraKvot(dagar(2)))).toBe("kräver minst 5 dagar med maskinfiler (2 hittills)");
    expect(kvotNot(summeraKvot([{ min: 480 }]))).toBe("inga dagar med maskinfiler");
    expect(kvotNot(summeraKvot(Array.from({ length: 5 }, (_, i) => ({ min: 480, maskintid: fil(i === 0 ? 0 : 300) }))))).toBe("kvoten räknas över 5 av 5 dagar (de med maskinfiler) · 1 utan maskintid");
  });
});
