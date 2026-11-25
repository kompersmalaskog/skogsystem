/**
 * Admin → Förare · Månad: Stefan Karlsson september 2026 (ur prod, SELECT 2026-10-20) genom SAMMA beraknaLoneunderlag som exporten.
 * Facit: 22 vardagar × 8 = 176 tim ordinarie, 12 850 min maskintid + 240 min extra (Gokart) = 218,17 tim arbetat = 42,17 tim övertid.
 * Vyn räknar ingenting själv: testet kräver att varje tal i vymodellen är motorns tal, och att delarna summerar till arbetat.
 */
import { describe, it, expect } from "vitest";
import { stefanUnderlag, MASKIN } from "@/lib/lonesystem/testdata/stefanSep";
import { milPerTrakt, byggForarManad, tidMedDecimal, kmKallaText } from "@/lib/admin/forarManadVy";
import { getRödaDagar } from "@/lib/roda-dagar";
import { summeraKvot, kvotVarde, kvotDetalj } from "@/lib/admin/lonekvot";

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
    expect(d.km_rutt).toEqual({ forsta: "Hålabäck au 2025", sista: "Hallaslätt AU 2026", appen: null });
    const v = vy.dagar.find(x => x.datum === "2026-09-14")!;
    expect(v.detalj).toContain("Dit 34 km · hem från Hallaslätt AU 2026 7 km");
    expect(v.rad).toContain("41 km beräknad");
  });

  it("förarens egen km: märkt 'egen', och trakten är ändå känd (ingen appen-siffra utan hemmets koordinat)", async () => {
    const { m, vy } = await stefan(d => (d.datum === "2026-09-15" ? { ...d, km_kalla: "forare" } : d));
    expect(m.dagar.find((x: any) => x.datum === "2026-09-15").km_rutt).toEqual({ forsta: "Hålabäck au 2025", sista: "Hålabäck au 2025", appen: null });
    const v = vy.dagar.find(x => x.datum === "2026-09-15")!;
    expect(v.detalj).toContain("Dit 34 km · hem 34 km");
    expect(v.rad).toContain("Hem → Hålabäck au 2025 · 68 km egen · → 1 mil");
    expect(v.rad).not.toContain("appen");
  });

  it("ingen km-källa: grått 'ingen uppgift' och ingen varning — trakten visas ändå", async () => {
    const { vy } = await stefan(d => (d.datum === "2026-09-16" ? { ...d, km_kalla: null } : d));
    const v = vy.dagar.find(x => x.datum === "2026-09-16")!;
    expect(v.rad).toContain("Hem → Hålabäck au 2025 · 68 km ingen uppgift");
    expect(v.detalj.join(" ")).not.toMatch(/uppgift|ersätts/);
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
    expect(d.rad).toBe("06:03–11:43 · extra tid 4 tim · Hem → Hallaslätt AU 2026 · 14 km beräknad");
    for (const dag of vy.dagar) expect(`${dag.tid} ${dag.rad}`).not.toMatch(/\d,\d\d/);
  });

  it("ingen text två gånger: en lång rast står som varning på dagen, inte också i raden under", async () => {
    const { vy } = await stefan();
    const lang = vy.dagar.find(x => x.datum === "2026-09-03")!;
    expect(lang.avvikelser).toContain("rast 3 tim 43 min");
    expect(lang.rad).toBe("05:55–18:05 · Hem → 400763 Akelius Tåget SA -26 · 22 km beräknad");
    expect(vy.dagar.find(x => x.datum === "2026-09-02")!.rad).toBe("05:54–17:16 · rast 32 min · Hem → 400763 Akelius Tåget SA -26 · 22 km beräknad");
  });

  it("premiens förklaring skrivs med decimalkomma och tim, inte motorns punkt och h", async () => {
    const { vy } = await stefan();
    expect(vy.lonerader[1].detalj).toBe("Premielön skördare: 176 tim av 176 tim timlön (214,17 tim skördare / 0 tim skotare i maskin)");
  });

  it("tidMedDecimal skriver tim:min med decimalen i parentes", () => {
    expect(tidMedDecimal(2530, 42.17)).toBe("42 tim 10 min (42,17)");
    expect(tidMedDecimal(0)).toBe("0 min (0,00)");
  });

  it("lönekvoten: samma summa som Dagar (lib/admin/lonekvot) — viktad över dagar med maskinfiler, 'för få dagar' under 5, '–' utan filer", async () => {
    const { m } = await stefan();
    const med = (fn: (d: any, i: number) => any) => ({ ...m, dagar: m.dagar.map((d: any, i: number) => ({ ...d, maskintid: fn(d, i) })) });
    const bygg = (mm: any) => byggForarManad(mm, { rodaDagar: getRödaDagar(2026), maskinNamn: {} });
    // Alla dagar med filmaskin, maskintiden hälften av betald tid → 50 %.
    const a = bygg(med(d => ({ min: Math.round(((d.arbetad_min || 0) + (d.extra_min || 0)) / 2), kalla: "fil", maskinens_min: 0 })));
    expect(a.lonekvot.varde).toBe("50 %");
    expect(a.lonekvot.maskin).not.toBe("–");
    // Facit mot lib: samma indata genom summeraKvot ger samma text.
    const s = summeraKvot(m.dagar.map((d: any) => ({ min: (d.arbetad_min || 0) + (d.extra_min || 0), maskintid: { min: Math.round(((d.arbetad_min || 0) + (d.extra_min || 0)) / 2), kalla: "fil" as const } })));
    expect(a.lonekvot.varde).toBe(kvotVarde(s));
    expect(a.lonekvot.detalj).toBe(kvotDetalj(s));
    // Bara fyra fildagar → "för få dagar", aldrig en procent.
    const b = bygg(med((d, i) => (i < 4 ? { min: 100, kalla: "fil", maskinens_min: 100 } : { min: 0, kalla: "ingen_fil", maskinens_min: 0 })));
    expect(b.lonekvot.varde).toBe("för få dagar");
    // Inga filer alls → "–", inte "0 %".
    const c = bygg(med(() => ({ min: 0, kalla: "ingen_fil", maskinens_min: 0 })));
    expect(c.lonekvot.varde).toBe("–");
    expect(c.lonekvot.maskin).toBe("–");
    expect(c.lonekvot.detalj).toBe("Inga dagar med maskinfiler");
  });
});

describe("minutskillnad mot maskinen visas bara från 15 min (Martin 2026-10-21)", () => {
  const dagen = async (diff_min: number) => {
    const { m } = await stefan();
    const vy = byggForarManad({ ...m, synk: [{ medarbetare_id: m.medarbetare_id, datum: "2026-09-02", diff_min, bekraftat: "05:54", maskinen: "06:04" }] }, { rodaDagar: getRödaDagar(2026), maskinNamn: { [MASKIN]: "Giant" } });
    return vy.dagar.find(x => x.datum === "2026-09-02")!;
  };
  it("14 min syns inte på dagen, 15 gör det", async () => {
    expect((await dagen(14)).avvikelser.some(a => /mot maskinen/.test(a))).toBe(false);
    expect((await dagen(-14)).avvikelser.some(a => /mot maskinen/.test(a))).toBe(false);
    expect((await dagen(15)).avvikelser.some(a => /mot maskinen/.test(a))).toBe(true);
    expect((await dagen(-20)).avvikelser.some(a => /mot maskinen/.test(a))).toBe(true);
  });

  it("den utfällda dagen säger vad maskinen loggade (bara när skillnaden visas) och upprepar inte dagens rad", async () => {
    const { m } = await stefan();
    const synk = (diff_min: number) => [{ medarbetare_id: m.medarbetare_id, datum: "2026-09-02", diff_min, bekraftat: "07:34-16:20 rast 0", maskinen: "07:34:00-15:53:00 rast 0" }];
    const bygg = (diff: number) => byggForarManad({ ...m, synk: synk(diff) }, { rodaDagar: getRödaDagar(2026), maskinNamn: { [MASKIN]: "Giant" } }).dagar.find(x => x.datum === "2026-09-02")!;
    expect(bygg(27).maskinLogg).toBe("Maskinen loggade 07:34–15:53 – 27 min kortare");
    expect(bygg(-20).maskinLogg).toBe("Maskinen loggade 07:34–15:53 – 20 min längre");
    expect(bygg(14).maskinLogg).toBeNull();
    const d = bygg(27);
    expect(d.detalj[0]).toBe("Maskin Giant");
    // Klockslag, total tid och trakten står redan på raden.
    for (const t of d.detalj) expect(t).not.toMatch(/^\d\d:\d\d–|^Tid |^Trakt: |totalt/);
  });
});

describe("mil per trakt (Martin 2026-11-25: 17 rader blev 4 trakter)", () => {
  const dag = (datum: string, trakt: string, km: number, kalla: string, mil: number, appen?: number) =>
    ({ datum, km_totalt: km, km_kalla: kalla, ersattningsmil: mil, km_rutt: { forsta: trakt, sista: trakt, appen: appen == null ? null : { morgon: appen / 2, kvall: appen / 2, totalt: appen } } });
  // Daniel oktober 2026, som i skärmbilden.
  const H = "Hålabäck au 2025", O = "Östra-Hoka 17 A-C -25", B = "Bågskyttebanan RP J-Hus- 25", M = "Mölleryd RP J-Hus -25";
  const DAGAR = [
    dag("2026-10-01", H, 160, "forare", 10), dag("2026-10-02", H, 160, "forare", 10),
    dag("2026-10-05", O, 164, "forare", 11),
    ...["06", "07", "08", "09"].map(d => dag(`2026-10-${d}`, O, 184, "auto", 13)),
    dag("2026-10-12", O, 194, "forare", 14, 191),
    ...["13", "14", "15", "16"].map(d => dag(`2026-10-${d}`, B, 218, "forare", 16, 198)),
    dag("2026-10-19", B, 208, "forare", 15, 198),
    ...["20", "21", "22", "23"].map(d => dag(`2026-10-${d}`, M, 191, "auto", 14)),
  ];

  it("fyra trakter i ordning, med mil som går ihop till månadens", () => {
    const t = milPerTrakt(DAGAR);
    expect(t.map(x => [x.trakt, x.mil])).toEqual([[H, "20 mil"], [O, "77 mil"], [B, "79 mil"], [M, "56 mil"]]);
    expect(t.reduce((s, x) => s + parseInt(x.mil), 0)).toBe(DAGAR.reduce((s, d) => s + d.ersattningsmil, 0));
  });

  it("dagar i följd med samma km är EN rad; appens km markeras bara när förarens är minst 10 % fler", () => {
    const [h, o, b, m] = milPerTrakt(DAGAR);
    expect(h.rader).toEqual([expect.objectContaining({ datum: "1–2 okt", dagar: 2, km: "160 km egen", appen: null, mil: "20 mil", perDag: "10 mil per dag" })]);
    expect(o.rader.map(r => [r.datum, r.dagar, r.mil, r.appen, r.appenAvviker])).toEqual([
      ["5 okt", 1, "11 mil", null, false], ["6–9 okt", 4, "52 mil", null, false], ["12 okt", 1, "14 mil", "appen 191 km", false]]);
    expect(b.rader.map(r => [r.datum, r.dagar, r.km, r.appen, r.appenAvviker, r.mil])).toEqual([
      ["13–16 okt", 4, "218 km egen", "appen 198 km", true, "64 mil"], ["19 okt", 1, "208 km egen", "appen 198 km", false, "15 mil"]]);
    expect(m.rader).toHaveLength(1);
    expect(m.rader[0].datum).toBe("20–23 okt");
  });

  it("samma trakt men inte i följd (en annan trakt emellan) blir två rader; över månadsskifte skrivs båda månaderna", () => {
    const t = milPerTrakt([dag("2026-09-30", H, 160, "auto", 10), dag("2026-10-01", H, 160, "auto", 10), dag("2026-10-02", O, 184, "auto", 13), dag("2026-10-05", H, 160, "auto", 10)]);
    expect(t[0].rader.map(r => r.datum)).toEqual(["30 sep–1 okt", "5 okt"]);
  });
});
