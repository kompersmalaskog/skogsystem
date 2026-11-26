import { describe, it, expect } from "vitest";
import { adminRader, adminSvar, synligaGranser } from "./arbetstidVisning";

const g = (id: string, niva: any, varde: number | null, grans: number, andel = 0) => ({ id, niva, varde, grans, andel, namn: id, enhet: "tim", mening: "", varfor: "" }) as any;
const forare = (id: string, namn: string, granser: any[], foretagsledare = false) => ({ medarbetare_id: id, namn, varsta: "lugn", foretagsledare, granser, notiser: [], restidSaknas: false }) as any;
const vanlig = (m: number, ar: number, v: number, nm: any = "lugn", na: any = "lugn") => [
  g("overtid_manad", nm, m, 50, m / 50), g("allman_overtid_ar", na, ar, 250, ar / 250), g("extra_overtid_ar", "lugn", 0, 150), g("snitt_48", "lugn", v, 48, v / 48), g("dygnsvila", "rod", 5, 11),
];

describe("arbetstidVisning", () => {
  it("visar månad, år och vecka — extra övertid bara när den finns, aldrig vila", () => {
    expect(synligaGranser(vanlig(1, 2, 3)).map(x => x.id)).toEqual(["overtid_manad", "allman_overtid_ar", "snitt_48"]);
  });
  it("raden: 'Månad 32 / 50 · År 180 / 250 · Vecka 44 / 48' och vilan påverkar inte nivån", () => {
    const [r] = adminRader([forare("a", "Anna", vanlig(32, 180, 44))]);
    expect(r.delar.map(d => d.text).join(" · ")).toBe("Månad 32 / 50 · År 180 / 250 · Vecka 44 / 48");
    expect(r.niva).toBe("lugn");
  });
  it("närmast en gräns först, företagsledare bort", () => {
    const r = adminRader([forare("a", "A", vanlig(10, 20, 30)), forare("b", "B", vanlig(46, 20, 30, "gul")), forare("c", "C", vanlig(49, 20, 30), true)]);
    expect(r.map(x => x.id)).toEqual(["b", "a"]);
  });
  it("svaret i ord", () => {
    expect(adminSvar(adminRader([forare("a", "Anna B", vanlig(1, 2, 3))])).text).toBe("Alla håller sig inom gränserna");
    expect(adminSvar(adminRader([forare("o", "Oskar N", vanlig(46, 2, 3, "gul"))])).text).toBe("Oskar närmar sig månadens gräns");
    expect(adminSvar(adminRader([forare("s", "Stefan K", vanlig(1, 262, 3, "lugn", "rod")), forare("o", "Oskar N", vanlig(46, 2, 3, "gul"))])).text).toBe("Stefan är över årets gräns");
    expect(adminSvar(adminRader([forare("o", "Oskar N", vanlig(46, 2, 3, "gul")), forare("m", "Max L", vanlig(47, 2, 3, "gul"))])).text).toBe("Max och Oskar närmar sig gränsen");
  });
});
