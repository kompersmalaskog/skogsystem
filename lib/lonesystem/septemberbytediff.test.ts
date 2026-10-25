/**
 * BYTE-DIFF: exporten för augusti–september 2026 ger EXAKT samma rader före och efter lönearts-bygget (#767) OCH efter helglöns-bygget
 * (närvarokrav, kvalifikationstid, helglön per maskintyp, företagsledare ut ur exporten).
 *
 *  - Underlaget är produktionens augusti–september 2026 (testdata/sep2026.json, pseudonymiserat; kontrollsummor mot databasen 2026-10-15).
 *  - Facit (testdata/sep2026.gammal.json) är utskriften från den GAMLA koden (origin/main före lönearts-bygget) på samma underlag och
 *    samma sju koder (11, 1355, 1354, 1435, 1436, 136, 821). Den är fryst och regenereras aldrig av den nya koden.
 *  - Den nya `beraknaLoneunderlag` körs på samma underlag. Det som är NYTT (lonerader per förare, kopplingar överst, flaggan
 *    foretagsledare, anstallningsdatumSaknas) tas bort, och resten måste vara identiskt: varje förare, varje rad, varje antal,
 *    varje varning, byte för byte.
 *  - AVSIKTLIGT ANNORLUNDA: de två företagsledarna (Förare 2 = Joacim, Förare 3 = Martin i fixturen) får inga lönerader. Testet
 *    nedan räknar upp EXAKT vilka rader som försvinner, och alla andra förare är oförändrade.
 *
 * MÅNADENS ORDINARIE (Martin 2026-10-19, "övertid först när månadens ordinarie timmar är fyllda"): ordinarie är inte längre arbetade dagar × 8 utan
 * månadens vardagar × 8 (− röda dagar, frånvaro, dagar före anställning, deldagens timmar). Det ändrar EXAKT FEM FÖRARE-RADER i de här två
 * månaderna — de står i ANDRINGAR nedan, med före- och efter-värden och skälet, och ALLT annat är fortfarande byte för byte oförändrat:
 *   augusti   Daniel (m1): 13 arbetade dagar à 9 tim = 118,02 tim. Förut ordinarie 13 × 8 = 104 → 14,02 tim övertid. Nu är augusti 168 tim och
 *             han har arbetat 118,02 → allt är timlön, ingen övertid (och premien följer: 104 → 118,02).
 *             Max (m4): 20 arbetade dagar, 191,03 tim. Förut ordinarie 160 → 31,03 övertid. Nu 168 (augusti har 21 vardagar) → 23,03 övertid.
 *   september Oscar (m5): 3 dagar, 28,65 tim. Förut ordinarie 24 → 4,65 övertid. Nu 176 → 28,65 timlön, ingen övertid. (FACIT Martin.)
 * Utöver raderna skiljer sig bara fältet `ordinarie_h` (Joacim 0→160, Martin 64→168 / 160→176, de tre ovan) och kortpass-varningen hos Joacim
 * (texten "ingen ×8 i övertidsbasen" gäller inte längre). Det nya fältet `ordinarie` tas bort som tillägg och kontrolleras separat.
 *
 * Löneperiod 2026-10 = arbetstid SEPTEMBER 2026 (Fortnox löneperiod ligger en månad efter arbetstiden); 2026-09 = arbetstid augusti.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beraknaLoneunderlag } from "./loneunderlag";
import { sepKlient, PROD_MAPPNING, FIXTUR_FORETAGSLEDARE } from "./testdata/sepKlient";

const FACIT_RAD = readFileSync(join(__dirname, "testdata", "sep2026.gammal.json"), "utf8");
// ENDA TEXTÄNDRINGEN utöver månadens ordinarie (Martin 2026-10-21): "Vältlappar: 1 veckor" → "Vältlappar: 1 vecka". Facit (den gamla koden) säger "1 veckor" — det kontrolleras
// i ett eget test nedan — och ska nu säga "vecka". Inget annat i facit rörs.
const EN_VECKA_FORE = "Vältlappar: 1 veckor";
const EN_VECKA_EFTER = "Vältlappar: 1 vecka";
const FACIT = FACIT_RAD.split(EN_VECKA_FORE).join(EN_VECKA_EFTER);
const facit = JSON.parse(FACIT) as Record<string, any>;

const arBrandrisk = (key: string) => key.startsWith("brandrisk");
// Sjuktimmar (2026-10-25): ny löneart, tom kod i prod-mappningen → en saknad kod (Joacims sjukdag 19 aug). Ett tillägg som OB.
const arSjuk = (key: string) => key === "sjuktimmar";
const arTillagg = (key: string) => arBrandrisk(key) || arSjuk(key);

/**
 * En rad i svaret utan de tillägg som inte fanns förut — resten ska vara oförändrat. Tilläggen är brandrisk-OB (2026-10-15): fältet
 * `brandrisk`, lönearten i `saknade_loneartskoder` (tom kod som standard) och dess varningsrad — och helglön/företagsledare (2026-10-17):
 * `foretagsledare` och `helglon.anstallningsdatumSaknas` — och hemskickad (2026-10-17): fälten `hemskickad` och `hemskickad_h`, som MÅSTE vara
 * tomma för de här månaderna (ingen hemskickad rad finns i underlaget; testet nedan kräver det). Inget annat tas bort.
 */
function utanTilläggRad({ lonerader, brandrisk, sjuk, foretagsledare, hemskickad, hemskickad_h, ordinarie, arbetat, extra_poster, godkannande, godkand_tid, andrad_efter_godkannande, andrad_efter_skickat, ...r }: any) {
  // Förarens godkännande (2026-10-21, loneunderlag.status) styr bara VEM som skickas, aldrig vad som skickas: en ren avläsning, inget i lönen.
  expect(["godkand", "vantar"]).toContain(godkannande);
  // Förarens månad (Admin, 2026-10-20): `arbetat` (vad arbetad tid består av), `extra_poster` och på varje dag km-källa/ben/rutt är RENA
  // uppställningar av det motorn redan räknade — de tas bort som tillägg, och att de stämmer mot motorn kontrolleras i forarManad.paritet.test.ts.
  const dagar_ = r.dagar?.map(({ km_morgon, km_kvall, km_kalla, km_rutt, ...d }: any) => d);
  // Hemskickad ändrar ingenting för en månad utan hemskickad rad: tom lista, noll timmar (annars är det inte ett tillägg utan en ändring).
  expect(hemskickad).toEqual([]);
  expect(hemskickad_h).toBe(0);
  expect(ordinarie.modell).toBe("manad");                     // tillägget (månadens ordinarie, 2026-10-19) kontrolleras i ett eget test nedan
  const { anstallningsdatumSaknas, ...helglon } = r.helglon || {};
  return {
    ...r,
    ...(dagar_ ? { dagar: dagar_ } : {}),
    helglon: r.helglon ? helglon : r.helglon,
    saknade_loneartskoder: r.saknade_loneartskoder.filter((k: string) => !arTillagg(k)),
    varningar: r.varningar.filter((v: string) => !/^Löneart saknas för (Brandrisk – |Sjuktimmar )/.test(v)),
  };
}
/** Det nya svaret utan de tillägg som inte fanns förut. */
function utanTillagg(u: any) {
  const { kopplingar, ...rest } = u;
  return { ...rest, resultat: u.resultat.map(utanTilläggRad), berikad: u.berikad.map(utanTilläggRad) };
}

// OB räknat OBEROENDE av koden (ren fixtur-läsning): beordrade (brandrisk_beordrad = true) vardagsmorgnar i arbetsmånaden, start → 06:30,
// EN summa (ingen uppdelning i nattillägg). Samma tal som lib/ob ska ge — beräknat här med egna aritmetiken så testet inte bevisar sig självt.
const FIXTUR: any = JSON.parse(readFileSync(join(__dirname, "testdata", "sep2026.json"), "utf8"));
function forvantadOb(medarbetareId: string, arbetsmanad: string) {
  let ob = 0;
  for (const r of FIXTUR.arbetsdag as any[][]) {
    if (r[0] !== medarbetareId || !String(r[1]).startsWith(arbetsmanad) || r[11] !== true || !r[7]) continue;
    const veckodag = new Date(`${r[1]}T12:00:00Z`).getUTCDay();
    if (veckodag < 1 || veckodag > 5) continue;
    const [h, m] = String(r[7]).split(":").map(Number);
    const start = h * 60 + m;
    ob += Math.max(0, 390 - start);
  }
  return { ob };
}
const MED_BRANDRISKKODER = [...PROD_MAPPNING, { intern_typ: "brandrisk_ob", extern_kod: "9001", beskrivning: "Brandrisk – OB" }];

const PERIODER = [
  { period: "2026-10", namn: "arbetstid SEPTEMBER 2026 (löneperiod oktober)" },
  { period: "2026-09", namn: "arbetstid augusti 2026 (löneperiod september)" },
];

// ── DE ENDA ÄNDRINGARNA mot den gamla koden: månadens ordinarie (2026-10-19) ──
// `fore` är det facit (gamla koden) säger och som testet KRÄVER att facit säger; `efter` är det den nya koden ska ge. En rad som tas bort har efter null.
type RadAndring = { fore: [string, string]; efter: [string, string] | null };   // [Number, beskrivning]
type Andring = { period: string; id: string; namn: string; skal: string; rader?: Record<string, RadAndring>; falt?: Record<string, [number, number]>; varning?: [number, string, string]; bort?: string[] };
// Sjuktimmar (2026-10-25): sjukdagen är en lönerad (sjuktimmar) i stället för en varning om att lönearten saknas.
const SJUK_FORE = "Frånvaro (sjuk): 1 dag(ar) 2026-08-19 — löneart för Fortnox ej fastställd; läggs INTE som lönerad, sätt manuellt innan sändning.";
const KORTPASS_FORE = "Kortpass (under 60 min): 2026-08-10 29 min — betald tid men ingen arbetsdag: ingen ×8 i övertidsbasen, ingen vältlappsvecka, ingen reseersättning. Ta bort dagen om den är en felinloggning.";
const KORTPASS_EFTER = "Kortpass (under 60 min): 2026-08-10 29 min — betald tid (räknas som arbetad tid mot månadens ordinarie) men ingen arbetsdag: ingen vältlappsvecka, ingen reseersättning. Ta bort dagen om den är en felinloggning.";
const ANDRINGAR: Andring[] = [
  { period: "2026-09", id: "m1", namn: "Daniel, augusti", skal: "118,02 tim arbetade i en månad på 168 tim: allt är timlön, ingen övertid (förut 13 dagar × 8 = 104 → 14,02 övertid)",
    rader: {
      timlon: { fore: ["104.00", "Timlön: 104h ordinarie (13 dagar × 8h)"], efter: ["118.02", "Timlön: 118.02h (arbetade 118.02h av månadens ordinarie 168h: 21 vardagar × 8h)"] },
      premielon_skotare: { fore: ["104.00", "Premielön skotare: 104h av 104h timlön (0h skördare / 118h skotare i maskin)"], efter: ["118.02", "Premielön skotare: 118.02h av 118.02h timlön (0h skördare / 118h skotare i maskin)"] },
      overtid_skotare: { fore: ["14.02", "Övertid: 14.02h (118.02h totalt, varav 0.02h extra tid - 104h ordinarie)"], efter: null },
    },
    falt: { ordinarie_h: [104, 168], timlon_h: [104, 118.02], premielon_skotare_h: [104, 118.02], overtid_h: [14.02, 0] } },
  { period: "2026-09", id: "m4", namn: "Max, augusti", skal: "augusti har 21 vardagar = 168 tim ordinarie, inte 20 arbetade dagar × 8 = 160: 8 tim mer timlön, 8 tim mindre övertid",
    rader: {
      timlon: { fore: ["160.00", "Timlön: 160h ordinarie (20 dagar × 8h)"], efter: ["168.00", "Timlön: 168h (arbetade 191.03h av månadens ordinarie 168h: 21 vardagar × 8h)"] },
      premielon_skotare: { fore: ["160.00", "Premielön skotare: 160h av 160h timlön (0h skördare / 191.03h skotare i maskin)"], efter: ["168.00", "Premielön skotare: 168h av 168h timlön (0h skördare / 191.03h skotare i maskin)"] },
      overtid_skotare: { fore: ["31.03", "Övertid: 31.03h (191.03h totalt - 160h ordinarie)"], efter: ["23.03", "Övertid: 23.03h (191.03h totalt - 168h ordinarie)"] },
    },
    falt: { ordinarie_h: [160, 168], timlon_h: [160, 168], premielon_skotare_h: [160, 168], overtid_h: [31.03, 23.03] } },
  { period: "2026-09", id: "m2", namn: "Joacim, augusti (företagsledare — inga rader i exporten)", skal: "bara ordinarie_h (0 → 160: augusti 21 vardagar − sjukdagen 19 aug) och kortpass-varningens text; raderna är desamma",
    falt: { ordinarie_h: [0, 160] }, varning: [0, KORTPASS_FORE, KORTPASS_EFTER], bort: [SJUK_FORE] },
  { period: "2026-09", id: "m3", namn: "Martin, augusti (företagsledare — inga rader i exporten)", skal: "bara ordinarie_h (64 → 168); 57,4 tim arbetade är timlön både förut och nu",
    falt: { ordinarie_h: [64, 168] } },
  { period: "2026-10", id: "m3", namn: "Martin, september (företagsledare — inga rader i exporten)", skal: "bara ordinarie_h (160 → 176)",
    falt: { ordinarie_h: [160, 176] } },
  { period: "2026-10", id: "m5", namn: "Oscar, september", skal: "FACIT: 3 dagar, 28,65 tim i en månad på 176 tim → 28,65 timlön, ingen övertid (förut 3 × 8 = 24 → 4,65 övertid)",
    rader: {
      timlon: { fore: ["24.00", "Timlön: 24h ordinarie (3 dagar × 8h)"], efter: ["28.65", "Timlön: 28.65h (arbetade 28.65h av månadens ordinarie 176h: 22 vardagar × 8h)"] },
      premielon_skotare: { fore: ["24.00", "Premielön skotare: 24h av 24h timlön (0h skördare / 28.65h skotare i maskin)"], efter: ["28.65", "Premielön skotare: 28.65h av 28.65h timlön (0h skördare / 28.65h skotare i maskin)"] },
      overtid_skotare: { fore: ["4.65", "Övertid: 4.65h (28.65h totalt - 24h ordinarie)"], efter: null },
    },
    falt: { ordinarie_h: [24, 176], timlon_h: [24, 28.65], premielon_skotare_h: [24, 28.65], overtid_h: [4.65, 0] } },
];

/** Facit (gamla koden) med EXAKT de ändringar ovan — och krav på att facit säger det som `fore` påstår. Allt annat orört. */
function medOrdinarieAndringar(): Record<string, any> {
  const ut = JSON.parse(FACIT) as Record<string, any>;
  for (const a of ANDRINGAR) {
    for (const lista of ["resultat", "berikad"]) {
      const r = ut[a.period][lista].find((x: any) => x.medarbetare_id === a.id);
      if (!r) { expect(lista, `${a.namn}: finns i ${lista}`).toBe("berikad"); continue; }
      for (const [art, c] of Object.entries(a.rader ?? {})) {
        const i = r.rader.findIndex((x: any) => x.loneart === art);
        expect(i, `${a.namn}: ${art} finns i facit`).toBeGreaterThanOrEqual(0);
        expect([r.rader[i].Number, r.rader[i].beskrivning], `${a.namn} ${art} före`).toEqual(c.fore);
        if (c.efter) r.rader[i] = { ...r.rader[i], Number: c.efter[0], beskrivning: c.efter[1] }; else r.rader.splice(i, 1);
      }
      for (const [f, [fore, efter]] of Object.entries(a.falt ?? {})) {
        expect(r[f], `${a.namn} ${f} före`).toBe(fore);
        r[f] = efter;
      }
      if (a.varning) {
        const [i, fore, efter] = a.varning;
        expect(r.varningar[i], `${a.namn} varning före`).toBe(fore);
        r.varningar[i] = efter;
      }
      for (const v of a.bort ?? []) {
        const i = r.varningar.indexOf(v);
        expect(i, `${a.namn}: varningen finns i facit`).toBeGreaterThanOrEqual(0);
        r.varningar.splice(i, 1);
      }
    }
    if (a.rader && Object.values(a.rader).some(c => c.efter === null)) {
      ut[a.period].totalt_rader -= Object.values(a.rader).filter(c => c.efter === null).length;
    }
  }
  return ut;
}
const nyttFacit = medOrdinarieAndringar();

describe.each(PERIODER)("$namn", ({ period }) => {
  it("utan företagsledarflagga är exporten byte för byte densamma som den gamla koden gav", async () => {
    const nytt = utanTillagg(await beraknaLoneunderlag(sepKlient(), { period }));
    expect(JSON.stringify(nytt, null, 1)).toBe(JSON.stringify(nyttFacit[period], null, 1));
  });

  it("Fortnox-raderna (löneart, kod, antal, datum) är oförändrade för varje förare, och alla rader skickas", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period });
    expect(nytt.totalt_rader).toBe(nyttFacit[period].totalt_rader);
    nytt.resultat.forEach((r, i) => {
      const gammal = nyttFacit[period].resultat[i];
      expect(r.namn).toBe(gammal.namn);
      expect(r.rader).toEqual(gammal.rader);
      // brandrisk-OB har tom kod som standard: den syns som en saknad kod, aldrig som en rad — allt annat är som förut
      expect(r.saknade_loneartskoder.filter((k: string) => !arTillagg(k))).toEqual([]);
      const ovriga = r.lonerader.filter((l: any) => !arTillagg(l.loneart));
      // förhandsvisningens övriga rader är exakt de som skickas: ingen röd, ingen frivillig utan kod
      expect(ovriga.map((l: any) => l.status)).toEqual(ovriga.map(() => "skickas"));
      expect(ovriga.map((l: any) => [l.loneart, l.kod, l.mangd])).toEqual(r.rader.map((x: any) => [x.loneart, x.SalaryCode, x.Number]));
      expect(r.lonerader.filter((l: any) => arBrandrisk(l.loneart)).every((l: any) => l.status === "saknar_kod" && l.kod === null)).toBe(true);
    });
  });

  it("MED företagsledarflaggan (Joacim, Martin): alla andra förare byte för byte oförändrade, ledarna 0 rader", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period });
    const ovriga = (lista: any[]) => lista.filter(r => !FIXTUR_FORETAGSLEDARE.includes(r.medarbetare_id));
    const nyOvriga = ovriga(nytt.resultat).map(utanTilläggRad);
    const gamOvriga = ovriga(nyttFacit[period].resultat);
    expect(nyOvriga.length).toBeGreaterThan(0);
    expect(JSON.stringify(nyOvriga, null, 1)).toBe(JSON.stringify(gamOvriga, null, 1));
    for (const r of nytt.resultat.filter(x => FIXTUR_FORETAGSLEDARE.includes(x.medarbetare_id))) {
      expect(r.foretagsledare).toBe(true);
      expect(r.rader).toEqual([]);
      expect(r.lonerader).toEqual([]);
      expect(r.saknade_loneartskoder).toEqual([]);
    }
    expect(nytt.totalt_rader).toBe(gamOvriga.reduce((s: number, r: any) => s + r.rader.length, 0));
  });
});

describe("brandrisk-OB läggs BARA till (beslut 2026-10-15): EN ny rad per förare med beordrade morgnar, resten oförändrat", () => {
  it.each(PERIODER)("$namn: med koder är raderna = de gamla + exakt OB-raden med oberoende räknade timmar", async ({ period }) => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER), { period });
    const arbetsmanad = period === "2026-10" ? "2026-09" : "2026-08";
    let antalMedOb = 0;
    nytt.resultat.forEach((r, i) => {
      const gammal = nyttFacit[period].resultat[i];
      const { ob } = forvantadOb(r.medarbetare_id, arbetsmanad);
      expect(r.rader.filter((x: any) => !arBrandrisk(x.loneart))).toEqual(gammal.rader);         // alla befintliga rader byte för byte
      const nya = r.rader.filter((x: any) => arBrandrisk(x.loneart)).map((x: any) => [x.loneart, x.SalaryCode, x.Number]);
      const forvantat: any[] = [];
      if (ob > 0) forvantat.push(["brandrisk_ob", "9001", (ob / 60).toFixed(2)]);
      expect(nya).toEqual(forvantat);
      if (forvantat.length) antalMedOb++;
      expect(r.saknade_loneartskoder.filter((k: string) => !arSjuk(k))).toEqual([]);
    });
    // augusti har beordrade brandriskmorgnar hos flera förare; september har inga — då är OB-raderna noll och exporten oförändrad
    if (period === "2026-09") expect(antalMedOb).toBeGreaterThanOrEqual(4);
    else expect(antalMedOb).toBe(0);
  });

  it("Stefan i augusti: 10,30 tim Brandrisk – OB, EN rad (de tre morgnarna 12–14 aug)", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER), { period: "2026-09" });
    const medOb = nytt.resultat.filter(r => r.brandrisk.ob_min === 618);
    expect(medOb).toHaveLength(1);
    const stefan = medOb[0];
    expect(stefan.brandrisk.dagar.map(d => d.datum)).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
    expect(stefan.rader.filter((x: any) => arBrandrisk(x.loneart)).map((x: any) => [x.loneart, x.Number])).toEqual([["brandrisk_ob", "10.30"]]);
  });

  it("facit augusti: Stefan 10,30, Oskar 14,42, Max 7,08, Daniel 1,27, Martin 7,00 tim — och inga fler (Joacim och Oscar har inga beordrade morgnar)", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER), { period: "2026-09" });
    const timmar = nytt.resultat.map(r => r.rader.find((x: any) => x.loneart === "brandrisk_ob")?.Number).filter(Boolean).sort();
    expect(timmar).toEqual(["1.27", "10.30", "14.42", "7.00", "7.08"].sort());
  });

  it("ingen löneart för nattillägg finns: en rad per förare, aldrig två", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER), { period: "2026-09" });
    for (const r of nytt.resultat) {
      expect(r.rader.filter((x: any) => arBrandrisk(x.loneart)).length).toBeLessThanOrEqual(1);
      expect(r.lonerader.some((l: any) => /natt/.test(l.loneart))).toBe(false);
    }
  });

  it("utan koder: ingen rad skickas för OB, de syns som saknade koder med samma timmar, och allt annat är som förut", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period: "2026-09" });
    nytt.resultat.forEach((r, i) => {
      expect(r.rader).toEqual(nyttFacit["2026-09"].resultat[i].rader);
      const { ob } = forvantadOb(r.medarbetare_id, "2026-08");
      expect(r.lonerader.filter((l: any) => arBrandrisk(l.loneart)).map((l: any) => [l.loneart, l.mangd, l.status])).toEqual(
        ob > 0 ? [["brandrisk_ob", (ob / 60).toFixed(2), "saknar_kod"]] : [],
      );
    });
  });

});

describe("brandrisk-OB och företagsledare tillsammans (båda ändringarna finns kvar)", () => {
  it("MED OB-kod och flaggan: Martin (7,00 tim OB i augusti) och Joacim får INGEN rad, Stefan får fortfarande sina 10,30", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_BRANDRISKKODER, FIXTUR_FORETAGSLEDARE), { period: "2026-09" });
    for (const id of FIXTUR_FORETAGSLEDARE) {
      const r = nytt.resultat.find(x => x.medarbetare_id === id)!;
      expect(r.foretagsledare).toBe(true);
      expect([r.rader, r.lonerader, r.saknade_loneartskoder]).toEqual([[], [], []]);
      expect(r.varningar.some(v => /Brandrisk – /.test(v))).toBe(false);
    }
    const timmar = nytt.resultat.map(r => r.rader.find((x: any) => x.loneart === "brandrisk_ob")?.Number).filter(Boolean).sort();
    expect(timmar).toEqual(["1.27", "10.30", "14.42", "7.08"].sort());   // facit augusti utan Martins 7,00
  });
});

describe("EXAKT vilka rader som försvinner när företagsledarna lämnar exporten (avsiktligt)", () => {
  const rader = (p: string, id: string) => (facit[p].resultat.find((r: any) => r.medarbetare_id === id)?.rader || []).map((x: any) => `${x.loneart} ${x.SalaryCode} ${x.Number}`);

  it("löneperiod 2026-09 (arbetstid augusti): Förare 2 (Joacim) 2 rader + Förare 3 (Martin) 3 rader = 5 av 25", () => {
    expect(rader("2026-09", "m2")).toEqual(["timlon 11 0.48", "premielon_skordare 1355 0.48"]);
    expect(rader("2026-09", "m3")).toEqual(["timlon 11 57.40", "premielon_skotare 1354 57.40", "valtlappar 136 3"]);
    expect(facit["2026-09"].totalt_rader).toBe(25);
  });
  it("löneperiod 2026-10 (arbetstid september): Förare 3 (Martin) 3 rader = 3 av 27; Joacim hade inga", () => {
    expect(rader("2026-10", "m2")).toEqual([]);
    expect(rader("2026-10", "m3")).toEqual(["timlon 11 128.15", "premielon_skotare 1354 128.15", "valtlappar 136 5"]);
    expect(facit["2026-10"].totalt_rader).toBe(27);
  });
  it("det nya totalet är 19 respektive 23 rader (20 och 24 före månadens ordinarie: Daniels och Oscars övertidsrader försvinner)", async () => {
    const u09 = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period: "2026-09" });
    const u10 = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period: "2026-10" });
    expect([u09.totalt_rader, u10.totalt_rader]).toEqual([19, 23]);
  });
});

describe("månadens ordinarie i fixturen (oberoende räknat: vardagar × 8 − sjukdagen)", () => {
  // Augusti 2026 har 21 vardagar (168 tim), september 22 (176 tim). Inga röda vardagar i någon av månaderna. Fixturen har inga anställningsdatum.
  // Den enda frånvaron är Joacims (m2) sjukdag 19 aug → 160. Ingen i fixturen följer en utjämningsperiod.
  it.each([
    ["2026-09", "m1", 168, []], ["2026-09", "m2", 160, ["2026-08-19"]], ["2026-09", "m3", 168, []], ["2026-09", "m4", 168, []], ["2026-09", "m6", 168, []], ["2026-09", "m7", 168, []],
    ["2026-10", "m1", 176, []], ["2026-10", "m3", 176, []], ["2026-10", "m4", 176, []], ["2026-10", "m5", 176, []], ["2026-10", "m6", 176, []], ["2026-10", "m7", 176, []],
  ] as [string, string, number, string[]][])("%s %s: %s tim", async (period, id, timmar, franvaro) => {
    const u = await beraknaLoneunderlag(sepKlient(), { period });
    const r = u.resultat.find(x => x.medarbetare_id === id)!;
    expect(r.ordinarie).toMatchObject({ modell: "manad", timmar, roda: [], anstallning: [], franvaro, deldag_h: 0 });
    expect(r.ordinarie_h).toBe(timmar);
    expect(r.ordinarie.vardagar).toBe(period === "2026-09" ? 21 : 22);
  });
});

describe("kopplingarna bär kod OCH namn ur mappningen", () => {
  it("de sju produktionsraderna, med namnet i Fortnox", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period: "2026-10" });
    expect(nytt.kopplingar).toEqual({
      timlon: { kod: "11", namn: "Timlön" }, premielon_skordare: { kod: "1355", namn: "Premielön skördare" }, premielon_skotare: { kod: "1354", namn: "Premielön skotare" },
      overtid_skordare: { kod: "1435", namn: "Övertid skördare" }, overtid_skotare: { kod: "1436", namn: "Övertid skotare" }, valtlappar: { kod: "136", namn: "Vältlappar mm" },
      korersattning: { kod: "821", namn: "Körersättning skattefri" },
    });
  });
});

describe("kontroll av jämförelsen själv: den SER en ändring", () => {
  it("en ändrad kod i mappningen ger en annan utskrift (annars bevisar byte-diffen ingenting)", async () => {
    const ändrad = PROD_MAPPNING.map(m => (m.intern_typ === "timlon" ? { ...m, extern_kod: "12" } : m));
    const nytt = utanTillagg(await beraknaLoneunderlag(sepKlient(ändrad), { period: "2026-10" }));
    expect(JSON.stringify(nytt, null, 1)).not.toBe(JSON.stringify(facit["2026-10"], null, 1));
  });

  it("utan premiens koder försvinner bara premieraderna — och inget stoppar (frivillig)", async () => {
    const utanPremie = PROD_MAPPNING.filter(m => !m.intern_typ.startsWith("premielon"));
    const nytt = await beraknaLoneunderlag(sepKlient(utanPremie), { period: "2026-10" });
    nytt.resultat.forEach((r, i) => {
      expect(r.rader).toEqual(nyttFacit["2026-10"].resultat[i].rader.filter((x: any) => !x.loneart.startsWith("premielon")));
      expect(r.saknade_loneartskoder.filter((k: string) => !arTillagg(k))).toEqual([]);
    });
  });

  it("flaggan gör skillnad: samma underlag med och utan flaggan ger olika antal rader", async () => {
    const utan = await beraknaLoneunderlag(sepKlient(), { period: "2026-10" });
    const med = await beraknaLoneunderlag(sepKlient(PROD_MAPPNING, FIXTUR_FORETAGSLEDARE), { period: "2026-10" });
    expect(med.totalt_rader).toBeLessThan(utan.totalt_rader);
  });
});

describe("'1 vecka' (Martin 2026-10-21): den enda textändringen i alla rader", () => {
  it("facit (gamla koden) sa '1 veckor' på exakt två rader — de två är nu '1 vecka', och inget annat ord i facit ändrades", () => {
    expect(FACIT_RAD.split(EN_VECKA_FORE).length - 1).toBe(2);
    expect(FACIT.split(EN_VECKA_EFTER).length - 1).toBe(2);
    expect(FACIT.length).toBe(FACIT_RAD.length - 2);   // "veckor" → "vecka" tar bort ett tecken per rad, ingenting annat
  });
});


describe("sjuktimmar läggs BARA till (beslut 2026-10-25): Joacims sjukdag 19 aug blir 8 tim, inget annat ändras", () => {
  const MED_SJUKKOD = [...PROD_MAPPNING, { intern_typ: "sjuktimmar", extern_kod: "9002", beskrivning: "Sjuktimmar" }];
  it.each(PERIODER)("$namn: med kod är raderna = de gamla + exakt sjukraden", async ({ period }) => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_SJUKKOD), { period });
    nytt.resultat.forEach((r, i) => {
      expect(r.rader.filter((x: any) => !arSjuk(x.loneart))).toEqual(nyttFacit[period].resultat[i].rader);
      const nya = r.rader.filter((x: any) => arSjuk(x.loneart)).map((x: any) => [r.medarbetare_id, x.SalaryCode, x.Number]);
      expect(nya).toEqual(period === "2026-09" && r.medarbetare_id === "m2" ? [["m2", "9002", "8.00"]] : []);
    });
  });
  it("utan kod: Joacims sjuktimmar är en saknad kod (8 tim), ingen rad skickas", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(), { period: "2026-09" });
    const j = nytt.resultat.find(r => r.medarbetare_id === "m2")!;
    expect(j.sjuk).toEqual({ dagar: [{ datum: "2026-08-19", timmar: 8, del: false }], timmar: 8 });
    expect(j.lonerader.filter((l: any) => arSjuk(l.loneart)).map((l: any) => [l.mangd, l.status])).toEqual([["8.00", "saknar_kod"]]);
    expect(j.rader.some((x: any) => arSjuk(x.loneart))).toBe(false);
  });
  it("med företagsledarflaggan: Joacim får inga sjuktimmar", async () => {
    const nytt = await beraknaLoneunderlag(sepKlient(MED_SJUKKOD, FIXTUR_FORETAGSLEDARE), { period: "2026-09" });
    const j = nytt.resultat.find(r => r.medarbetare_id === "m2")!;
    expect([j.rader, j.lonerader, j.sjuk.timmar]).toEqual([[], [], 0]);
  });
});
