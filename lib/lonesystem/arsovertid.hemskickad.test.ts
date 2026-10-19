import { describe, it, expect } from "vitest";
import { beraknaArsovertid } from "./arsovertid";
import type { FranvaroRad } from "../franvaro";

// Hemskickad (Martin 2026-10-17) i årsövertiden: ingen frånvaro (basen rörs inte), men tiden dagen fylls upp till 8 tim räknas som arbetad —
// samma tal som lönemotorn (lib/lonesystem/loneberakning.hemskickad.test.ts). Veckan är isolerad som utjämningsperiod, som i frånvarotestet.
const AR = 2026;
const dag = (datum: string, timmar: number) => ({ datum, arbetad_min: Math.round(timmar * 60), dagtyp: "Produktion", start_tid: "06:00:00" });
const hem = (datum: string, extra: Partial<FranvaroRad> = {}): FranvaroRad =>
  ({ medarbetare_id: "m", typ: "hemskickad", startdatum: datum, slutdatum: datum, status: "registrerad", fran_tid: "14:00:00", ...extra });
const V6 = [{ startdatum: "2026-02-02", slutdatum: "2026-02-08" }];
const D = ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06"];
const period = (dagar: any[], franvaro: FranvaroRad[]) =>
  beraknaArsovertid(dagar, [], AR, "2026-03-01", V6, franvaro).perioder.find(p => p.markerad && p.fran === 6)!;

describe("hemskickad i årsövertiden", () => {
  it("6 tim + hemskickad = en full dag: veckan blir 40 tim, basen 40, ingen frånvaro och ingen övertid", () => {
    const p = period([dag(D[0], 8), dag(D[1], 6), dag(D[2], 8), dag(D[3], 8), dag(D[4], 8)], [hem(D[1])]);
    expect(p).toMatchObject({ timmar: 40, bas: 40, franvaroTimmar: 0, overtid: 0 });
  });

  it("utan hemskickad är samma vecka 38 tim (kontroll: det är raden som fyller upp dagen)", () => {
    const p = period([dag(D[0], 8), dag(D[1], 6), dag(D[2], 8), dag(D[3], 8), dag(D[4], 8)], []);
    expect(p).toMatchObject({ timmar: 38, bas: 40, overtid: 0 });
  });

  it("hemskickad är en hel 8-timmarsdag: en annan dags övertid jämnas inte ut mot den (lönemotorns regel)", () => {
    const dagar = [dag(D[0], 10), dag(D[1], 6), dag(D[2], 8), dag(D[3], 8), dag(D[4], 8)];
    expect(period(dagar, [])).toMatchObject({ timmar: 40, overtid: 0 });
    expect(period(dagar, [hem(D[1])])).toMatchObject({ timmar: 42, overtid: 2 });
  });

  it("en dag utan någon arbetad tid (hemskickad vid ankomst) ger 8 tim, men drar ingenting ur basen", () => {
    const p = period([dag(D[0], 8), dag(D[2], 8), dag(D[3], 8), dag(D[4], 8)], [hem(D[1], { fran_tid: "07:00:00" })]);
    expect(p).toMatchObject({ timmar: 40, bas: 40, franvaroTimmar: 0, overtid: 0 });
  });

  it("en hemskickad rad som bara väntar eller är nekad räknas inte", () => {
    const p = period([dag(D[1], 6)], [hem(D[1], { status: "väntar" }), hem(D[1], { status: "nekad" })]);
    expect(p.timmar).toBe(6);
  });

  it("hemskickad påverkar inte modellen 'dagar' (Fortnox-exporten): en dag under 60 min + hemskickad är betald tid utan ×8, aldrig övertid", () => {
    const a = beraknaArsovertid([dag("2026-02-03", 0.5)], [], AR, "2026-03-01", [], [hem("2026-02-03", { fran_tid: "07:30:00" })]);
    expect(a.modeller.dagar).toBe(0);
    expect(a.timmar).toBe(8);
  });

  it("en riktig deldag (sjuk) drar fortfarande ur basen — hemskickad är det som skiljer", () => {
    const sjuk: FranvaroRad = { medarbetare_id: "m", typ: "sjuk", startdatum: D[1], slutdatum: D[1], status: "registrerad", fran_tid: "11:00:00" };
    const p = period([dag(D[0], 8), dag(D[1], 3), dag(D[2], 8), dag(D[3], 8), dag(D[4], 8)], [sjuk]);
    expect(p).toMatchObject({ bas: 35, franvaroTimmar: 5, timmar: 35 });
  });
});
