// Vilka lönearter hindrar en skarp sändning? Bara de som har ett antal, saknar kod och inte är frivilliga — och bara hos förare
// som inte redan är skickade. EN funktion, delad av exportrouten och förhandsvisningen, så de två aldrig kan säga olika.
import { describe, it, expect } from "vitest";
import { blockerandeLonearter, antalBlockerande } from "./loneartSaknas";
import type { LoneRad } from "./loneberakning";

const rad = (loneart: LoneRad["loneart"], status: LoneRad["status"], mangd = "8.00"): LoneRad => ({ loneart, status, mangd, kod: status === "skickas" ? "1" : null, beskrivning: "x" });
const med = (namn: string, status: string, lonerader: LoneRad[]) => ({ namn, status, lonerader });

describe("blockerandeLonearter", () => {
  it("samlar förarna per löneart, i katalogens ordning, med mängden", () => {
    const r = blockerandeLonearter([
      med("Anna", "utkast", [rad("timlon", "skickas"), rad("helglon", "saknar_kod", "24.00")]),
      med("Bo", "utkast", [rad("valtlappar", "saknar_kod", "3.00"), rad("helglon", "saknar_kod", "16.00")]),
    ]);
    expect(r.map(x => x.loneart)).toEqual(["valtlappar", "helglon"]);
    expect(r[1]).toMatchObject({ loneart: "helglon", label: "Helglön", enhet: "tim", forare: [{ namn: "Anna", mangd: "24.00" }, { namn: "Bo", mangd: "16.00" }] });
    expect(antalBlockerande(r)).toBe(3);
  });

  it("frivilliga lönearter (premie) och rader som skickas blockerar aldrig", () => {
    expect(blockerandeLonearter([med("Anna", "utkast", [rad("premielon_skordare", "valfri_utan_kod"), rad("timlon", "skickas")])])).toEqual([]);
  });

  it("en förare som redan är skickad räknas inte (hens rader skickas inte om)", () => {
    expect(blockerandeLonearter([med("Anna", "skickat", [rad("helglon", "saknar_kod")])])).toEqual([]);
  });

  it("tål medarbetare utan lonerader (äldre svar)", () => {
    expect(blockerandeLonearter([{ namn: "Anna", status: "utkast" } as any])).toEqual([]);
  });
});
