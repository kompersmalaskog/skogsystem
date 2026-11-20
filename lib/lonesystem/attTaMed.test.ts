// "Att ta med löneansvarig": ett råd får bara synas när något faktiskt saknas. Kodrådet byggs ur kopplingarna (vad som är
// kopplat just nu), inte ur en text som någon skrev en gång. Bakgrund: "Koppla koden för Brandrisk – OB (147)" stod kvar fast
// koden var kopplad.
import { describe, it, expect } from "vitest";
import { LONEARTER } from "./loneart";
import { kodRadAttGora, oppnaFragor } from "./attTaMed";
import { blockerandeLonearter } from "./loneartSaknas";

const alla = (utom: string[] = []) =>
  Object.fromEntries(LONEARTER.filter(a => !utom.includes(a.key)).map(a => [a.key, { kod: "1", namn: "x" }]));

describe("kodRadAttGora", () => {
  it("allt kopplat → inget råd (inte ens en tom rad)", () => {
    expect(kodRadAttGora(alla(), [])).toBeNull();
  });
  it("bara Brandrisk – OB saknas → rådet nämner just den", () => {
    const r = kodRadAttGora(alla(["brandrisk_ob"]), [])!;
    expect(r.rubrik).toBe("Koppla koden för Brandrisk – OB");
    expect(r.text).toContain("Lön → Lönearter");
  });
  it("Brandrisk – OB kopplad (147) → rådet nämner den inte", () => {
    const r = kodRadAttGora({ ...alla(["helglon_skotare"]), brandrisk_ob: { kod: "147", namn: "OB tillägg natt" } }, [])!;
    expect(r.rubrik).not.toContain("Brandrisk");
    expect(r.rubrik).toBe("Koppla koden för Helglön skotare");
  });
  it("flera saknas → uppräknade med 'och' sist", () => {
    const r = kodRadAttGora(alla(["helglon_skordare", "helglon_skotare", "brandrisk_ob"]), [])!;
    expect(r.rubrik).toBe("Koppla koderna för Helglön skördare, Helglön skotare och Brandrisk – OB");
  });
  it("två saknas → 'A och B'", () => {
    expect(kodRadAttGora(alla(["helglon_skordare", "helglon_skotare"]), [])!.rubrik).toBe("Koppla koderna för Helglön skördare och Helglön skotare");
  });
  it("frivilliga lönearter (premien) räknas inte som saknade", () => {
    expect(kodRadAttGora(alla(["premielon_skordare", "premielon_skotare"]), [])).toBeNull();
  });
  it("en löneart som redan stoppar sändningen (röd rad överst) står inte en andra gång", () => {
    const blockerande = [{ loneart: "brandrisk_ob" as const, label: "Brandrisk – OB", enhet: "tim", forare: [{ namn: "Anna", mangd: "10.30" }] }];
    expect(kodRadAttGora(alla(["brandrisk_ob"]), blockerande)).toBeNull();
    const r = kodRadAttGora(alla(["brandrisk_ob", "helglon_skotare"]), blockerande)!;
    expect(r.rubrik).toBe("Koppla koden för Helglön skotare");
  });
  it("blockerandeLonearter-formen passar in (samma typ som kortet överst)", () => {
    expect(kodRadAttGora(alla(), blockerandeLonearter([]))).toBeNull();
  });
});

describe("oppnaFragor: bara det som fortfarande är öppet", () => {
  const rubriker = oppnaFragor.map(f => f.rubrik).join(" | ");
  it("det beslutade och byggda (röd vardag = 8 tim helglön) är inte en fråga längre", () => {
    expect(rubriker).not.toMatch(/helglön/i);
    expect(oppnaFragor.some(f => /Röd vardag/.test(f.rubrik))).toBe(false);
  });
  it("det Martin beslutat (2026-10-21) står inte kvar: övertid räknas per kalendermånad, så 16-veckorsperioder och schema är inte längre en fråga", () => {
    expect(rubriker).not.toMatch(/Beräkningsperiod|schema/i);
    for (const f of oppnaFragor) expect(`${f.rubrik} ${f.text}`).not.toMatch(/16-veckors|16 veckor/i);
    expect(oppnaFragor.length).toBe(5);
  });
  it("inga tekniska ord i texterna", () => {
    for (const f of oppnaFragor) expect(`${f.rubrik} ${f.text}`).not.toMatch(/lib\/|dry_run|\bEN rad\b|_/);
  });
  it("varje rad har slag, rubrik och text", () => {
    for (const f of oppnaFragor) { expect(f.slag).toBeTruthy(); expect(f.rubrik).toBeTruthy(); expect(f.text).toBeTruthy(); }
  });
});
