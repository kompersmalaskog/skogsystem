// Mutationskontroll för "Fastighetsgräns supertydlig" (2026-10-22, omtag efter Martins sex ändringar): rågång, styrka efter närhet, vilka fastigheter trakten överlappar (skimmer/nedtoning), Lantmäteri i samma stil, beteckningar, fällningsvarning, tryckkort och ytetiketter.
// Ändrar EN sak i taget och kräver att testerna blir RÖDA. Två lägen (EN tung körning åt gången — inte tillsammans med tsc/build/en annan vitest):
//   node scripts/mutationskontroll-fastighetsgrans.mjs          snabbt: ren logik, källvakter mot page.tsx, kortet (sekunder per mutant)
//   node scripts/mutationskontroll-fastighetsgrans.mjs karta    långsamt: riktig Chromium + MapLibre, pixlar (≈20 s per mutant)
// Avbryts den mitt i kan en mutant ligga kvar i källan: kontrollera med git diff innan du committar.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { kor } from "./mutationsmotor.mjs";

const FG = "lib/fastighetsgrans.ts";
const YE = "lib/ytaEtikett.ts";
const KP = "lib/klickPrioritet.ts";
const PG = "app/planering/page.tsx";
const KA = "lib/fastighetsgransKarta.ts";
const HK = "lib/hooks/useMapLayers.ts";

const lage = process.argv[2] === "karta" ? "karta" : "snabb";

if (lage === "snabb") {
  const TESTER = [
    "lib/fastighetsgrans.test.ts",
    "lib/ytaEtikett.test.ts",
    "lib/klickPrioritet.fastighet.test.ts",
    "components/planering/FastighetsgransKort.render.test.tsx",
    "lib/fastighetsgransKarta.hytt.test.ts",
    "lib/fastighetsgransKarta.synlighet.test.ts",
    "lib/hooks/useMapLayers.test.ts",
  ];
  process.env.FASTIGHET_UTAN_CHROMIUM = "1";   // bara källvakterna ur hytt-testet; Chromium-mätningarna körs i läge "karta"
  const M = [
    // ── vilka fastigheter trakten överlappar ──
    ["överlapp: tröskeln 4 % → 50 % (grannen med 6 % tas inte med)", "export const TRAKT_MIN_ANDEL = 0.04;", "export const TRAKT_MIN_ANDEL = 0.5;", FG],
    ["överlapp: tröskeln 4 % → 0 (en smal kant över rågången lyser upp grannen)", "export const TRAKT_MIN_ANDEL = 0.04;", "export const TRAKT_MIN_ANDEL = 0;", FG],
    ["överlapp: provrutan 3 m → 8 m (hopp på 5 % i sliver-testet)", "const steg = Math.max(3, Math.sqrt(Math.max(bredd * hojd, 1) / 2500));", "const steg = Math.max(8, Math.sqrt(Math.max(bredd * hojd, 1) / 2500));", FG],
    ["överlapp: ingen överlappande fastighet är ändå 'känt' (data utanför tonas)", "if (!iTrakten.some(Boolean)) return okand('ingen_overlapp', andelar, otackt / prov.length);", "if (false) return okand('ingen_overlapp', andelar, otackt / prov.length);", FG],
    ["sida: okänt urval tonar ändå ned", "if (urval.status !== 'kand') return 'okand';", "", FG],
    ["sida: trakt och utanför omkastade", "return urval.iTrakten[i] ? 'trakt' : 'utanfor';", "return urval.iTrakten[i] ? 'utanfor' : 'trakt';", FG],
    // ── styrka efter närhet ──
    ["styrka: närhetsgränsen 50 → 500 m (allt blir full)", "export const NARA_STYRKA_M = 50;", "export const NARA_STYRKA_M = 500;", FG],
    ["styrka: närhetsgränsen 50 → 5 m (45 m-stycket blir svagt)", "export const NARA_STYRKA_M = 50;", "export const NARA_STYRKA_M = 5;", FG],
    ["styrka: allt svagt", "? 'full' : 'svag';", "? 'svag' : 'svag';", FG],
    ["styrka: utan traktgräns antas allt vara långt bort", "if (!traktBox) return true;", "if (!traktBox) return false;", FG],
    ["styrka: stycken på 1 km (en rand som korsar trakten blir hela full)", "export const STYRKA_STEG_M = 10;", "export const STYRKA_STEG_M = 1000;", FG],
    // ── namn, data, pinnar och beteckningar ──
    ["beteckningen heter 'Granne · …'", "export function etikettText(namn: string): string {\n  return namn;", "export function etikettText(namn: string): string {\n  return `Granne · ${namn}`;", FG],
    ["fiskesamfälligheter räknas som mark", "/fiske/i.test(txt(p.DETALJTYP))", "false", FG],
    ["beteckningen får gå runt hörn (MapLibre lägger då ingen text)", "export const ETIKETT_MAX_KNICK_GRADER = 25;", "export const ETIKETT_MAX_KNICK_GRADER = 180;", FG],
    ["beteckningens minsta sträcka 40 → 0 m", "export const ETIKETT_MIN_SPAN_M = 40;", "export const ETIKETT_MIN_SPAN_M = 0;", FG],
    // ── fällningsvarning och tryckkort ──
    ["fällning: varnar på 60 m i stället för 30", "if (d == null || d > radieM) return null;", "if (d == null || d > radieM + 30) return null;", FG],
    ["tryck: fastigheten utanför trakten först i rubriken", "(x.sida === 'trakt' ? -1 : 0) - (y.sida === 'trakt' ? -1 : 0)", "(y.sida === 'trakt' ? -1 : 0) - (x.sida === 'trakt' ? -1 : 0)", FG],
    ["tryck: 'mot granne' när andra sidan saknas", "`Fastighetsgräns · ${m.a}`;", "`Fastighetsgräns · ${m.a} mot granne`;", FG],
    ["kortet nämner gränspinnar", "'Gränsen kan avvika några meter. Lita på snitsel och märkning i fält.'", "'Gränsen kan avvika några meter. Lita på gränspinnar och snitsel i fält.'", FG],
    // ── en etikett per yta ──
    ["ytetikett: minsta delen i stället för största", "if (a > bastA) { bastA = a; bast = p; }", "if (a < bastA || bast === null) { bastA = a; bast = p; }", YE],
    ["ytetikett: samma yta i flera features får en punkt var", "const k = nyckel ? `${p._lager}|${nyckel}` : `${p._lager}|#${i}`;", "const k = `${p._lager}|#${i}`;", YE],
    // ── klickprioritet ──
    ["klickprioritet: rågången deltar inte", "  { kategori: 'fastighet', lager: ['trakt-ragang-hit'] },\n", "", KP],
    // ── sidan ──
    ["sidan: skimret läggs överst i stället för under första vektorlagret", "map.addLayer(spec, nedre ? forstaVektorId : undefined)", "map.addLayer(spec)", PG],
    ["sidan: traktgränsen har kvar sin breda svarta kant", "const trTdCasingW = TRAKTGRANS_KANT_BREDD as any;", "const trTdCasingW = ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 8, 17, 12] as any;", PG],
    ["sidan: Nyckelbiotop-etiketten läses ur polygonen (en per del)", "id: 'trakt-nb-label', type: 'symbol', source: 'trakt-etikett-source'", "id: 'trakt-nb-label', type: 'symbol', source: 'trakt-geo-source'", PG],
    ["sidan: zon-etiketten läses ur polygonen", "id: 'zone-label',\n      type: 'symbol',\n      source: 'zones-etikett-source',", "id: 'zone-label',\n      type: 'symbol',\n      source: 'zones-source',", PG],
    ["sidan: cirkeln blir vit även när något skyddsvärt vinner", "!fall.grupp && fgFall ? fastighetsCirkelPaint(!!visa)", "fgFall ? fastighetsCirkelPaint(!!visa)", PG],
    ["sidan: kortet ritas över grindkortet", "fgFall && !fall.grupp && !larm.kort && !inst.kort && !grindKort", "fgFall && !fall.grupp && !larm.kort && !inst.kort", PG],
    ["sidan: tryck på rågången avstår inte för högre lager", "if (vinnandeKategoriForKarta(map, e.point) !== 'fastighet') return;", "", PG],
    ["sidan: fällningsvarningen följer lagerknappen", "const nu = fastighetsFall(fgPos, ragang, ", "const nu = fastighetsFall(fgPos, overlays.fastighetsgrans ? ragang : null, ", PG],
    ["sidan: ritningen ignorerar lagerknappen", "lagerPa: !!overlays.fastighetsgrans, harVidaData", "lagerPa: true, harVidaData", PG],
    ["lib: Vidas rågång ritas utan att lagret är tänt", "return { vida: lagerPa && i.harVidaData,", "return { vida: i.harVidaData,", KA],
    ["lib: Lantmäteri-paret tänds även när Vida har levererat (två stilar samtidigt)", "lm: (lagerPa && !i.harVidaData && i.geometriLast)", "lm: (lagerPa && i.geometriLast)", KA],
    ["lib: Lantmäteri-paret följer inte lagerknappen", "lm: (lagerPa && !i.harVidaData && i.geometriLast)", "lm: (!i.harVidaData && i.geometriLast)", KA],
    ["lib: Lantmäteri-paret ritas innan geometrin är läst (blinkar)", "lm: (lagerPa && !i.harVidaData && i.geometriLast)", "lm: (lagerPa && !i.harVidaData)", KA],
    ["lib: nedtoningen lämnas tänd när lagret släcks (bara linjerna släcks)", "for (const id of RAGANG_LAGER_ORDNING) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', s.vida ? 'visible' : 'none');", "for (const id of RAGANG_LAGER_ORDNING.filter((x) => !x.includes('yta'))) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', s.vida ? 'visible' : 'none');", KA],
    ["lib: Lantmäteri-kanten glöms bort vid släckning", "for (const id of [LM_GRANS.kantLager, LM_GRANS.linjeLager])", "for (const id of [LM_GRANS.linjeLager])", KA],
    ["hook: ett sparat läge från första versionen (utan märke) behålls som ett val", "if (s.fastighetsgransVal !== true) ut.fastighetsgrans = DEFAULT_MAP_LAYERS.fastighetsgrans", "", HK],
    ["hook: standardvärdet är på", "  fastighetsgrans: false,", "  fastighetsgrans: true,", HK],
    ["hook: märket skrivs inte, så nollningen upprepas varje start", "  ut.fastighetsgransVal = true\n", "", HK],
    ["sidan: körvyns whitelist tvingar rågången synlig med lagret släckt", "if (l.id.startsWith('trakt-ragang-') || l.id.startsWith('wms-layer-fastighetsgranser')) continue;\n", "", PG],
    ["sidan: återställningen ur körvyn skriver över lagret", "if (id.startsWith('trakt-ragang-') || id.startsWith('wms-layer-fastighetsgranser')) continue;", "", PG],
    ["sidan: WMS-effekten styr Lantmäteri-gränsen vid sidan av lagret", "if (id === 'fastighetsgranser') return;", "", PG],
    ["sidan: en andra menyrad för Lantmäteri", "{ id: 'fastighetsgrans', name: 'Fastighetsgränser', desc:", "{ id: 'fastighetsgranser', name: 'Fastighetsgränser', desc:", PG],
  ];
  kor({ filer: [FG, YE, KP, PG, KA, HK], tester: TESTER, standardFil: FG, mutationer: M });
} else {
  // Chromium: varje mutant provas bara mot de mätningar den ska fälla (annars tar en körning tre minuter per mutant).
  const FILTER = {
    rod: "Rågången i riktig Chromium",
    band: "där de sammanfaller",
    morkt: "Vems mark",
    styrka: "styrka efter närhet",
    lm: "Lantmäteriets gräns",
    bet: "Beteckningen står",
  };
  const M = [
    ["rågångens kärna är röd i stället för vit", "export const RAGANG_FARG = '#ffffff';", "export const RAGANG_FARG = '#ff0000';", FILTER.rod],
    ["rågången har ingen mörk kant (syns inte på vit karta)", "export const RAGANG_KANT_FARG = 'rgba(0,0,0,0.85)';", "export const RAGANG_KANT_FARG = 'rgba(0,0,0,0)';", FILTER.rod],
    ["rågången är smal (3 px) — bandet åts upp av traktgränsens kant", "export const RAGANG_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 17, 12, 19, 16] as const;", "export const RAGANG_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3, 17, 4, 19, 5] as const;", FILTER.band],
    ["traktgränsen har en bred svart kant som täcker rågången", "export const TRAKTGRANS_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 3.5, 17, 5.5] as const;", "export const TRAKTGRANS_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 10, 17, 20] as const;", FILTER.band],
    ["övriga fastigheter tonas inte ned", "export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0.58 } as const;", "export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0 } as const;", FILTER.morkt],
    ["nedtoningen är nästan svart (80 %): vägar och hus syns inte", "export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0.58 } as const;", "export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0.8 } as const;", FILTER.morkt],
    ["nedtoningen är den gamla svaga (26 %): en dämpad tomt blir ljusare än skogen", "export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0.58 } as const;", "export const NEDTONING_UTANFOR = { color: '#000000', opacity: 0.26 } as const;", FILTER.morkt],
    ["fastigheter trakten överlappar får inget skimmer", "export const SKIMMER_TRAKT = { color: '#ffffff', opacity: 0.14 } as const;", "export const SKIMMER_TRAKT = { color: '#ffffff', opacity: 0 } as const;", FILTER.morkt],
    ["svaga stycken har full opacitet", "export const SVAG_OPACITET = 0.5;", "export const SVAG_OPACITET = 1;", FILTER.styrka],
    ["svaga stycken är lika breda som starka", "export const RAGANG_BREDD_SVAG = ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4, 17, 6, 19, 8] as const;", "export const RAGANG_BREDD_SVAG = ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 17, 12, 19, 16] as const;", FILTER.styrka],
    ["Lantmäteri-gränsen byter inte färg (gul linje)", "paint: { 'raster-brightness-min': 1, 'raster-brightness-max': 1, 'raster-opacity': 1 }", "paint: { 'raster-opacity': 1 }", FILTER.lm],
    ["Lantmäteri-gränsen har ingen mörk kant", "kantOpacitet: 0.85,", "kantOpacitet: 0,", FILTER.lm],
    ["beteckningen visas aldrig (minzoom 25)", "export const ETIKETT_MIN_ZOOM = 16;", "export const ETIKETT_MIN_ZOOM = 25;", FILTER.bet],
  ];
  const original = readFileSync(KA, "utf8");
  const kortor = (f) => spawnSync("npx", ["vitest", "run", "lib/fastighetsgransKarta.hytt.test.ts", "-t", f, "--reporter=dot"], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  const overlevde = [];
  let dog = 0;
  try {
    const grund = kortor("Rågången i riktig Chromium|där de sammanfaller|Vems mark|styrka efter närhet|Lantmäteriets gräns|Beteckningen står");
    if (grund.status !== 0) { console.error("Testerna är röda innan mutationerna.\n" + grund.stdout + grund.stderr); writeFileSync(KA, original); process.exit(2); }
    for (const [namn, fran, till, filter] of M) {
      const n = original.split(fran).length - 1;
      if (n !== 1) { console.error(`✗ "${namn}": mönstret finns ${n} gånger i ${KA}:\n   ${fran}`); writeFileSync(KA, original); process.exit(2); }
      writeFileSync(KA, original.replace(fran, () => till));
      const dod = kortor(filter).status !== 0;
      if (dod) dog++; else overlevde.push(namn);
      console.log(`${dod ? "död     " : "ÖVERLEVDE"}  ${namn}`);
    }
  } finally { writeFileSync(KA, original); }
  console.log(`\n${dog} av ${M.length} mutanter dödades${overlevde.length ? `, ${overlevde.length} överlevde:` : "."}`);
  for (const n of overlevde) console.log("  - " + n);
  process.exit(overlevde.length ? 1 : 0);
}
