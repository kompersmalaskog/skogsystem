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
  it("raden bär bara det som är nära eller över, i hela timmar, värst först — och vilan påverkar inte nivån", () => {
    const [lugn] = adminRader([forare("a", "Anna", vanlig(32, 180, 44))]);
    expect(lugn.delar).toEqual([]);
    expect(lugn.niva).toBe("lugn");
    const gr = vanlig(36.9, 259.3, 49.2, "lugn", "rod");
    gr[3] = g("snitt_48", "rod", 49.2, 48, 49.2 / 48);
    gr[0] = g("overtid_manad", "gul", 46.2, 50, 46.2 / 50);
    const [s] = adminRader([forare("s", "Stefan", gr)]);
    expect(s.delar.map(d => d.text)).toEqual(["Året 259 av 250 tim", "Snitt per vecka 49 av 48 tim", "Månad 46 av 50 tim"]);
  });
  it("avrundningen döljer aldrig att gränsen är passerad", () => {
    const gr = vanlig(1, 2, 48.4); gr[3] = g("snitt_48", "rod", 48.4, 48, 1.01);
    expect(adminRader([forare("s", "S", gr)])[0].delar[0].text).toBe("Snitt per vecka 48,4 av 48 tim");
  });
  it("närmast en gräns först, företagsledare bort", () => {
    const r = adminRader([forare("a", "A", vanlig(10, 20, 30)), forare("b", "B", vanlig(46, 20, 30, "gul")), forare("c", "C", vanlig(49, 20, 30), true)]);
    expect(r.map(x => x.id)).toEqual(["b", "a"]);
  });
  it("svaret i ord", () => {
    expect(adminSvar(adminRader([forare("a", "Anna B", vanlig(1, 2, 3))])).text).toBe("Alla håller sig inom gränserna");
    expect(adminSvar(adminRader([forare("o", "Oskar N", vanlig(46, 2, 3, "gul"))])).text).toBe("Oskar närmar sig månadens gräns");
    expect(adminSvar(adminRader([forare("s", "Stefan K", vanlig(1, 262, 3, "lugn", "rod")), forare("o", "Oskar N", vanlig(46, 2, 3, "gul"))])).text).toBe("Stefan är över årets gräns");
    const tva = vanlig(1, 262, 49, "lugn", "rod"); tva[3] = g("snitt_48", "rod", 49, 48, 1.02);
    expect(adminSvar(adminRader([forare("s", "Stefan K", tva)])).text).toBe("Stefan är över årets gräns och veckogränsen");
    expect(adminSvar(adminRader([forare("o", "Oskar N", vanlig(46, 2, 3, "gul")), forare("m", "Max L", vanlig(47, 2, 3, "gul"))])).text).toBe("Max och Oskar närmar sig gränsen");
  });
});
