/**
 * Admin → Förare · Månad: Stefan Karlsson september 2026 (ur prod, SELECT 2026-10-20) genom SAMMA beraknaLoneunderlag som exporten.
 * Facit: 22 vardagar × 8 = 176 tim ordinarie, 12 850 min maskintid + 240 min extra (Gokart) = 218,17 tim arbetat = 42,17 tim övertid.
 * Vyn räknar ingenting själv: testet kräver att varje tal i vymodellen är motorns tal, och att delarna summerar till arbetat.
 */
import { describe, it, expect } from "vitest";
import { stefanUnderlag, MASKIN } from "@/lib/lonesystem/testdata/stefanSep";
import { byggForarManad, tidMedDecimal, kmKallaText } from "@/lib/admin/forarManadVy";
import { getRödaDagar } from "@/lib/roda-dagar";

async function stefan(andra?: (d: any) => any, extraTillagg: any[] = []) {
  const { m } = await stefanUnderlag(andra, extraTillagg);
  const vy = byggForarManad(m, { rodaDagar: getRödaDagar(2026), maskinNamn: { [MASKIN]: "Giant" } });
  return { m, vy };
}

describe("Förare · Månad — Stefan september 2026", () => {
  it("svaret: 42 tim 10 min (42,17) övertid — motorns decimal, tim:min bredvid", async () => {
    const { m, vy } = await stefan();
    expect(m.overtid_h).toBe(42.17);
    expect(m.timlon_h).toBe(176);
    expect(vy.overtid).toBe("42 tim 10 min (42,17)");
  });

  it("uträkningen: maskintid + extra tid = arbetat − ordinarie = övertid, och delarna summerar till arbetat", async () => {
    const { m, vy } = await stefan();
    const u = vy.utrakning;
    expect(u.delar.map(d => [d.text, d.varde])).toEqual([["Maskintid", "214 tim 10 min"], ["Extra tid", "4 tim"]]);
    expect(u.arbetat).toBe("218 tim 10 min (218,17)");
    expect(u.ordinarie).toBe("176 tim (176,00)");
    expect(u.ordinarieForklaring).toContain("22 vardagar × 8 tim");
    expect(u.overtid).toBe("42 tim 10 min (42,17)");
    // Paritet mot motorn: delarna (hela minuter) = timlön + övertid (två decimaler) inom en hundradel.
    const a = m.arbetat;
    expect(a).toEqual({ maskin_min: 12850, extra_min: 240, kortpass_min: 0, hemskickad_min: 0 });
    const delarH = (a.maskin_min + a.extra_min + a.kortpass_min + a.hemskickad_min) / 60;
    expect(Math.abs(delarH - (m.timlon_h + m.overtid_h))).toBeLessThanOrEqual(0.01);
    // …och dagarna, rad för rad, summerar till samma minuter.
    expect(m.dagar.reduce((s: number, d: any) => s + d.arbetad_min + d.extra_min, 0)).toBe(a.maskin_min + a.extra_min);
  });

  it("extra tid rad för rad, med kommentar — gokarten syns, nollminutersraderna inte", async () => {
    const { vy } = await stefan();
    expect(vy.utrakning.extra).toHaveLength(1);
    expect(vy.utrakning.extra[0]).toMatchObject({ text: "10 sep · Annat", tid: "4 tim", kommentar: "12:15–16:15 · Gokart" });
  });

  it("lönerader: timlön och premie som motorn, övertiden i uträkningen och inte två gånger", async () => {
    const { m, vy } = await stefan();
    expect(vy.lonerader.map(r => r.nyckel)).toEqual(["timlon", "premielon_skordare"]);
    expect(vy.lonerader[0].varde).toBe("176 tim (176,00)");
    expect(vy.lonerader[1].varde).toBe("176 tim (176,00)");
    expect(m.lonerader.find((r: any) => r.loneart.startsWith("overtid")).mangd).toBe("42.17");
  });

  it("mil: totalt och ersättningsgrundande är motorns tal, per dag och påbörjad mil", async () => {
    const { m, vy } = await stefan();
    expect(vy.km.mil).toBe(`${m.kor_mil} mil`);
    expect(vy.km.dagarOver).toHaveLength(12);
    // Summan av dagarnas mil = motorns kor_mil.
    expect(m.dagar.reduce((s: number, d: any) => s + d.ersattningsmil, 0)).toBe(m.kor_mil);
    expect(vy.km.over).toMatch(/över 60 km\/dag/);
    expect(vy.km.sa).toMatch(/påbörjad mil/);
  });

  it("km med källa: beräknad dag har platser (hem → första trakten, sista trakten → hem) och km per ben", async () => {
    const { m, vy } = await stefan();
    const d = m.dagar.find((x: any) => x.datum === "2026-09-14");
    expect(d.km_kalla).toBe("auto");
    // Flyttobjektet (dagens första) har ingen plats — SAMMA funktion som räknade km hoppar över det, så benet går till Hålabäck.
    expect(d.km_rutt).toEqual({ forsta: "Hålabäck au 2025", sista: "Hallaslätt AU 2026" });
    const v = vy.dagar.find(x => x.datum === "2026-09-14")!;
    expect(v.detalj).toContain("Hem → Hålabäck au 2025 · 34 km");
    expect(v.detalj).toContain("Hallaslätt AU 2026 → Hem · 7 km");
    expect(v.rad).toContain("41 km beräknad");
  });

  it("förarens egen km: 'förarens egen' + km, inga platser", async () => {
    const { m, vy } = await stefan(d => (d.datum === "2026-09-15" ? { ...d, km_kalla: "forare" } : d));
    expect(m.dagar.find((x: any) => x.datum === "2026-09-15").km_rutt).toBeNull();
    const v = vy.dagar.find(x => x.datum === "2026-09-15")!;
    expect(v.detalj.some(t => t.startsWith("Förarens egen · 68 km"))).toBe(true);
    expect(v.detalj.some(t => t.includes("→"))).toBe(false);
    expect(v.rad).toContain("68 km förarens egen");
  });

  it("ingen km-källa: grått 'ingen uppgift', ingen varning och inga platser", async () => {
    const { vy } = await stefan(d => (d.datum === "2026-09-16" ? { ...d, km_kalla: null } : d));
    const v = vy.dagar.find(x => x.datum === "2026-09-16")!;
    expect(v.rad).toContain("68 km ingen uppgift");
    expect(v.detalj).toContain("68 km · ingen uppgift om källa");
    expect(v.detalj.some(t => t.includes("→"))).toBe(false);
    expect(v.avvikelser.join(" ")).not.toMatch(/km|källa|uppgift/);
    expect(kmKallaText(null)).toBe("ingen uppgift");
  });

  it("varningarna står på dagen de gäller: lång rast; kortpass; extra tid utan pass", async () => {
    const { vy } = await stefan();
    expect(vy.dagar.find(x => x.datum === "2026-09-03")!.avvikelser.join(" ")).toContain("rast 3 tim 43 min");
    expect(vy.dagar.find(x => x.datum === "2026-09-02")!.avvikelser).toEqual([]);

    const kort = await stefan(d => (d.datum === "2026-09-04" ? { ...d, arbetad_min: 30 } : d));
    expect(kort.vy.dagar.find(x => x.datum === "2026-09-04")!.avvikelser.join(" ")).toContain("30 minuter");

    const utanPass = await stefan(d => (d.datum === "2026-09-10" ? { ...d, arbetad_min: 0 } : d));
    expect(utanPass.vy.dagar.find(x => x.datum === "2026-09-10")!.avvikelser).toContain("extra tid utan pass");
  });

  it("kontrollvyns larm på dagen: dag utan maskin", async () => {
    const { vy } = await stefan(d => (d.datum === "2026-09-07" ? { ...d, maskin_id: null } : d));
    expect(vy.dagar.find(x => x.datum === "2026-09-07")!.avvikelser).toContain("ingen maskin");
    expect(vy.dagar.find(x => x.datum === "2026-09-08")!.avvikelser).toEqual([]);
  });

  it("timlönens förklaring: lägst av arbetat och ordinarie — samma tal som uträkningen", async () => {
    const { vy } = await stefan();
    expect(vy.lonerader[0].detalj).toBe("Det som ryms i månadens ordinarie: lägst av arbetat 218 tim 10 min och ordinarie 176 tim");
  });

  it("extra tid på en dag utan maskinpass: motorns notis följer med, och posten står i listan", async () => {
    const { vy } = await stefan(undefined, [{ datum: "2026-09-12", typ: "annat", minuter: 60, debiterbar: false, objekt_id: null, kommentar: "Sågade ved", start_tid: "09:00:00", slut_tid: "10:00:00", aktivitet_typ: "annat" }]);
    expect(vy.utrakning.notis).toMatch(/extra tid ligger på dagar utan maskinpass/);
    expect(vy.utrakning.extra.map(e => e.text)).toContain("12 sep · Annat");
    expect(vy.utrakning.delar.map(d => d.varde)).toEqual(["214 tim 10 min", "5 tim"]);
  });

  it("dagraderna: bara tim och min — decimalen finns i uträkningen och svaret", async () => {
    const { vy } = await stefan();
    const d = vy.dagar.find(x => x.datum === "2026-09-10")!;
    expect(d.tid).toBe("9 tim 40 min");
    expect(d.rad).toBe("06:03–11:43 · extra tid 4 tim · 14 km beräknad");
    for (const dag of vy.dagar) expect(`${dag.tid} ${dag.rad}`).not.toMatch(/\d,\d\d/);
  });

  it("ingen text två gånger: en lång rast står som varning på dagen, inte också i raden under", async () => {
    const { vy } = await stefan();
    const lang = vy.dagar.find(x => x.datum === "2026-09-03")!;
    expect(lang.avvikelser).toContain("rast 3 tim 43 min");
    expect(lang.rad).toBe("05:55–18:05 · 22 km beräknad");
    expect(vy.dagar.find(x => x.datum === "2026-09-02")!.rad).toBe("05:54–17:16 · rast 32 min · 22 km beräknad");
  });

  it("premiens förklaring skrivs med decimalkomma och tim, inte motorns punkt och h", async () => {
    const { vy } = await stefan();
    expect(vy.lonerader[1].detalj).toBe("Premielön skördare: 176 tim av 176 tim timlön (214,17 tim skördare / 0 tim skotare i maskin)");
  });

  it("tidMedDecimal skriver tim:min med decimalen i parentes", () => {
    expect(tidMedDecimal(2530, 42.17)).toBe("42 tim 10 min (42,17)");
    expect(tidMedDecimal(0)).toBe("0 min (0,00)");
  });
});
