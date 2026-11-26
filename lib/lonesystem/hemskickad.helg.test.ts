// Hemskickad bara på vardagar (Martin 2026-11-26): en rad på lördag 14 nov gav 2 tim 24 min betald fyllnad för en dag ingen skulle ha jobbat.
// En helg eller röd dag har ingen ordinarie tid att fylla upp. EN regel (hemskickadGaller) för valet, registreringen, lönen och årsövertiden.
import { describe, it, expect, vi } from "vitest";
import { beräknaExport } from "./loneberakning";
import { PROD_KODER } from "./testKoder";
import { hemskickadGaller, deldagVal, deldagUnderrad, registreraFranvaro, DELDAG_VAL, FRANVARO_VAL } from "../franvaro";
import { getRödaDagar } from "../roda-dagar";

const dag = (datum: string, min: number) => ({ datum, arbetad_min: min, maskin_id: "R64428", km_totalt: 0, bekraftad: true, dagtyp: null });
const hem = (datum: string) => ({ typ: "hemskickad", startdatum: datum, slutdatum: datum, fran_tid: "15:00", till_tid: null });
const kor = (period: string, dagar: any[], led: any[]) =>
  beräknaExport("m", "Anna", "7", dagar, { R64428: "skordare" }, period, [], led, 60, null, new Set(), null, null, PROD_KODER, {});

describe("hemskickad gäller bara vardagar", () => {
  it("regeln: vardag ja, lördag/söndag nej, röd dag nej", () => {
    expect(hemskickadGaller("2026-11-13")).toBe(true);   // fredag
    expect(hemskickadGaller("2026-11-14")).toBe(false);  // lördag — Martins rad
    expect(hemskickadGaller("2026-11-15")).toBe(false);  // söndag
    const rod = Object.keys(getRödaDagar(2026)).find(d => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w > 0 && w < 6; })!;
    expect(hemskickadGaller(rod)).toBe(false);
    expect(hemskickadGaller("")).toBe(false);
  });

  it("valet i Åkte hem: hemskickad finns bara på en vardag", () => {
    expect(deldagVal("2026-11-13")).toBe(DELDAG_VAL);
    expect(deldagVal("2026-11-14")).toBe(FRANVARO_VAL);
    expect(deldagVal("2026-11-14").some(v => v.id === "hemskickad")).toBe(false);
    expect(deldagUnderrad("2026-11-14")).not.toContain("Hemskickad");
    expect(deldagUnderrad("2026-11-13")).toContain("Hemskickad");
  });

  it("registreringen vägrar en helg innan något skrivs", async () => {
    const insert = vi.fn();
    const res = await registreraFranvaro({ from: () => ({ insert }) }, { medarbetareId: "m", namn: "A", datum: "2026-11-14", typ: "hemskickad", franTid: "15:00" });
    expect(res.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("lönen: en hemskickad-rad på lördag fyller inget och betalar inget", () => {
    const u = kor("2026-12", [dag("2026-11-14", 336)], [hem("2026-11-14")]);
    expect(u.hemskickad).toEqual([]);
    expect(u.hemskickad_h).toBe(0);
    const v = kor("2026-12", [dag("2026-11-13", 336)], [hem("2026-11-13")]);
    expect(v.hemskickad_h).toBe(2.4);
  });
});
