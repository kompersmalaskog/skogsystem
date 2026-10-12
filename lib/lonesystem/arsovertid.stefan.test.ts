import { describe, it, expect } from "vitest";
import { beraknaArsovertid } from "./arsovertid";
import fx from "./testdata/stefan2026.json";

// Stefans RIKTIGA 2026-data (ur prod 2026-10-09, bara datum, minuter och frånvaro): 161 arbetsdagar, 6 extra-poster,
// godkänd semester 2026-06-29–07-17 (v27–29), Gävle-perioden v17–27 markerad.
//
// Fel bas (före 2026-10-09): varje vecka i beräkningsperioden räknades som 40 tim ordinarie bas, även veckor med frånvaro
// och röda dagar. v28 och v29 (semester) tog 80 tim övertid ur blocket v28–41, och v1 (nyår, 1,7 tim arbetat) räknades som
// en full vecka. Stefan visade 74,5. Martins räkning vecka för vecka: ca 190 (v1–16 ca 80–85, Gävle 0, v28–41 ca 107).
const stefan = () => beraknaArsovertid(fx.arbetsdag as any, fx.extra_tid as any, 2026, fx.tomDatum, fx.utjamning as any, fx.franvaro as any);

describe("Stefan 2026: basen är 40 tim minus frånvaro och röda vardagar", () => {
  it("årets övertid enligt avtalets genomsnitt = 190 ± 10 (var 74,5 med fel bas)", () => {
    const r = stefan();
    expect(r.modeller.genomsnitt).toBeGreaterThanOrEqual(180);
    expect(r.modeller.genomsnitt).toBeLessThanOrEqual(200);
  });

  it("period för period: v1–16 ca 80–85, Gävle (v17–27) 0, v28–41 ca 107", () => {
    const p = stefan().perioder;
    expect(p.map(x => [x.fran, x.till, x.markerad])).toEqual([[1, 16, false], [17, 27, true], [28, 41, false]]);
    expect(p[0].overtid).toBeGreaterThanOrEqual(70);
    expect(p[0].overtid).toBeLessThanOrEqual(95);
    expect(p[1].overtid).toBe(0);
    expect(p[2].overtid).toBeGreaterThanOrEqual(95);
    expect(p[2].overtid).toBeLessThanOrEqual(120);
  });

  it("semestern dras ur basen: 15 vardagar × 8 = 120 tim frånvaro; v28–29 har bas 0 (inte 40)", () => {
    const r = stefan();
    expect(r.basavdrag.franvaroTimmar).toBe(120);
    // v27 (29/6–5/7) räknas med i Gävle-perioden, v28 (6–12/7) och v29 (13–17/7) i blocket v28–41
    const block = r.perioder[2];
    expect(block.veckor).toBe(14);
    expect(block.franvaroTimmar).toBe(80);                 // v28 + v29
    expect(block.bas).toBe(14 * 40 - 80);
  });

  it("röda vardagar dras också: nyår, trettondedag, påsk, 1 maj, Kristi himmelsfärd, midsommarafton = 6 × 8 (+ ev. fler enligt lib/roda-dagar)", () => {
    const r = stefan();
    expect(r.basavdrag.rodaTimmar).toBeGreaterThanOrEqual(48);
    expect(r.basavdrag.rodaTimmar % 8).toBe(0);
    // v1 (nyår): bara torsdag 1/1 (röd) och fredag 2/1 ligger i året, så basen är 8 — inte 40
    expect(r.perioder[0].rodaTimmar).toBeGreaterThanOrEqual(32);
  });

  it("de tre andra modellerna rörs inte av basändringen", () => {
    const r = stefan();
    // samma tal som den gamla beräkningen gav på exakt den här fixturen (kördes före ändringen)
    expect(r.modeller.vardagar).toBe(208.8);
    expect(r.modeller.dagar).toBe(306.7);
    expect(r.modeller.vecka).toBe(347.6);
  });

  it("utan frånvarouppgifter blir basen för hög och talet för LÅGT: frånvaron minskar basen och höjer därmed övertiden", () => {
    const utan = beraknaArsovertid(fx.arbetsdag as any, fx.extra_tid as any, 2026, fx.tomDatum, fx.utjamning as any, []);
    expect(utan.modeller.genomsnitt).toBeLessThan(stefan().modeller.genomsnitt);
    expect(utan.basavdrag.franvaroTimmar).toBe(0);
  });
});
