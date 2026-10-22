// Mutationskontroll för "Fastighetsgräns supertydlig" (2026-10-22): rågång, pinnar, vems mark, beteckningar, fällningsvarning, tryckkort och ytetiketter.
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

const lage = process.argv[2] === "karta" ? "karta" : "snabb";

if (lage === "snabb") {
  const TESTER = [
    "lib/fastighetsgrans.test.ts",
    "lib/ytaEtikett.test.ts",
    "lib/klickPrioritet.fastighet.test.ts",
    "components/planering/FastighetsgransKort.render.test.tsx",
    "lib/fastighetsgransKarta.hytt.test.ts",
  ];
  process.env.FASTIGHET_UTAN_CHROMIUM = "1";   // bara källvakterna ur hytt-testet; Chromium-mätningarna körs i läge "karta"
  const M = [
    // ── vems mark ──
    ["ägare: räcker med 40 % i en fastighet", "export const AGARE_MIN_ANDEL = 0.85;", "export const AGARE_MIN_ANDEL = 0.4;", FG],
    ["ägare: 100 % utanför Vidas data tolereras", "export const AGARE_MAX_OTACKT = 0.10;", "export const AGARE_MAX_OTACKT = 1;", FG],
    ["ägare: 60 % i grannen tolereras", "export const AGARE_MAX_ANNAN = 0.10;", "export const AGARE_MAX_ANNAN = 0.6;", FG],
    // ── namn och data ──
    ["grannen heter inte 'Granne · …'", "return sida === 'granne' ? `Granne · ${namn}` : namn;", "return namn;", FG],
    ["fiskesamfälligheter räknas som mark", "/fiske/i.test(txt(p.DETALJTYP))", "false", FG],
    // ── pinnar och beteckningar ──
    ["pinnar: ingen dubblettkontroll mellan grannfastigheternas hörn", "if (!nara(p) || arDubbel(p)) continue;", "if (!nara(p)) continue;", FG],
    ["beteckningen får gå runt hörn (MapLibre lägger då ingen text)", "export const ETIKETT_MAX_KNICK_GRADER = 25;", "export const ETIKETT_MAX_KNICK_GRADER = 180;", FG],
    ["beteckningens minsta sträcka 40 → 0 m", "export const ETIKETT_MIN_SPAN_M = 40;", "export const ETIKETT_MIN_SPAN_M = 0;", FG],
    // ── fällningsvarning och tryckkort ──
    ["fällning: varnar på 60 m i stället för 30", "if (d == null || d > radieM) return null;", "if (d == null || d > radieM + 30) return null;", FG],
    ["tryck: grannen först i rubriken (egen sida sist)", "(x.sida === 'egen' ? -1 : 0) - (y.sida === 'egen' ? -1 : 0)", "(y.sida === 'egen' ? -1 : 0) - (x.sida === 'egen' ? -1 : 0)", FG],
    ["kortet säger inte att gränsen kan avvika", "'Gränsen kan avvika några meter. Lita på gränspinnar och snitsel i fält.'", "'Gränsen är exakt.'", FG],
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
    ["sidan: ritningen ignorerar lagerknappen", "const pa = !!overlays.fastighetsgrans && !!ragang;", "const pa = !!ragang;", PG],
  ];
  kor({ filer: [FG, YE, KP, PG], tester: TESTER, standardFil: FG, mutationer: M });
} else {
  // Chromium: varje mutant provas bara mot de mätningar den ska fälla (annars tar en körning tre minuter per mutant).
  const FILTER = {
    rod: "Rågången i riktig Chromium",
    band: "där de sammanfaller",
    morkt: "Vems mark",
    pinne: "gränspinnarna är röda",
    bet: "Beteckningen står",
  };
  const M = [
    ["rågångens kärna är röd i stället för vit", "export const RAGANG_FARG = '#ffffff';", "export const RAGANG_FARG = '#ff0000';", FILTER.rod],
    ["rågången har ingen mörk kant (syns inte på vit karta)", "export const RAGANG_KANT_FARG = 'rgba(0,0,0,0.85)';", "export const RAGANG_KANT_FARG = 'rgba(0,0,0,0)';", FILTER.rod],
    ["rågången är smal (3 px) — bandet åts upp av traktgränsens kant", "export const RAGANG_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 8, 17, 12, 19, 16] as const;", "export const RAGANG_BREDD = ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3, 17, 4, 19, 5] as const;", FILTER.band],
    ["traktgränsen har en bred svart kant som täcker rågången", "export const TRAKTGRANS_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 3.5, 17, 5.5] as const;", "export const TRAKTGRANS_KANT_BREDD = ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 10, 17, 20] as const;", FILTER.band],
    ["grannens mark tonas inte ned", "export const NEDTONING_GRANNE = { color: '#000000', opacity: 0.26 } as const;", "export const NEDTONING_GRANNE = { color: '#000000', opacity: 0 } as const;", FILTER.morkt],
    ["trakten egen mark får inget skimmer", "export const SKIMMER_EGEN = { color: '#ffffff', opacity: 0.1 } as const;", "export const SKIMMER_EGEN = { color: '#ffffff', opacity: 0 } as const;", FILTER.morkt],
    ["gränspinnarna är blå", "export const PINNE_FARG = LEGEND.fara;", "export const PINNE_FARG = '#0a84ff';", FILTER.pinne],
    ["beteckningen visas aldrig (minzoom 25)", "export const ETIKETT_MIN_ZOOM = 16;", "export const ETIKETT_MIN_ZOOM = 25;", FILTER.bet],
  ];
  const original = readFileSync(KA, "utf8");
  const kortor = (f) => spawnSync("npx", ["vitest", "run", "lib/fastighetsgransKarta.hytt.test.ts", "-t", f, "--reporter=dot"], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  const overlevde = [];
  let dog = 0;
  try {
    const grund = kortor("Rågången i riktig Chromium|där de sammanfaller|Vems mark|gränspinnarna|Beteckningen står");
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
