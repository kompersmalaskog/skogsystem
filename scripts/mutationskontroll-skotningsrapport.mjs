#!/usr/bin/env node
// Mutationskontroll: skotningsrapporten (PDF till Vidas inköpare).
//
// Rapportens värde ligger i att den säger SANT, SAMMA tal som fakturan, och
// att den ser ut som sidan Martin godkände. Varje mutant nedan är ett sätt
// att bryta något av det utan att något blir "fel" i vanlig mening — ett
// märke på fel rad, ett påstående om mätning när talet är handsatt, en tabell
// som glider ner under kartan, ett avstånd mätt från fel avlägg.
//
//   node scripts/mutationskontroll-skotningsrapport.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TESTER = [
  'lib/faktura/skotningsrapport.test.ts',
  'lib/faktura/skotningsrapportPdf.test.ts',
  'lib/faktura/virkesfordelning.test.ts',
  'lib/faktura/lasSkotningsrapport.test.ts',
  'components/faktura/Skotningsrapport.render.test.tsx',
  'lib/upphojtPdf.test.ts',
];

const MUTANTER = [
  // ── Vilket tal som är det fakturerade ────────────────────────────────────
  {
    namn: 'handsatt avstånd märks inte som fakturerat (mätt rad tar märket)',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "      varde: `${meter(handsattM)} · fakturerat`,",
    till: '      varde: meter(handsattM),',
  },
  {
    namn: 'mätt rad behåller "fakturerat" fast avståndet är handsatt',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "      varde: handsattM == null ? `${meter(c.ytterstM)} · fakturerat` : meter(c.ytterstM),",
    till: "      varde: `${meter(c.ytterstM)} · fakturerat`,",
  },
  {
    namn: 'den handsatta raden försvinner helt',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '  if (handsattM != null) {',
    till: '  if (false) {',
  },
  {
    namn: 'handsatt låter som mätt i källmeningen',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    return `Avståndet är satt för hand och gäller hela trakten.${jam}`;',
    till: '    return `Mätt ur skotarens körspår.${jam}`;',
  },
  {
    namn: 'handsatt låter som mätt i "Så är det mätt"',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "    rubrik: d.handsatt ? 'Det fakturerade avståndet' : 'Körd väg',",
    till: "    rubrik: 'Körd väg',",
  },
  {
    namn: 'källmeningen töms',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    kalla: kallaMening(d),',
    till: "    kalla: '',",
  },

  // ── Att alla fyra måtten står kvar ───────────────────────────────────────
  {
    namn: 'halva cykeln göms (bara det vi fakturerar visas)',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "  rader.push({\n    etikett: 'Halva cykeln',",
    till: "  if (c.enkelVagM == null) rader.push({\n    etikett: 'Halva cykeln',",
  },
  {
    namn: 'vid avlägget göms — landningsarbetet syns inte',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '  if (c.vidAvlaggetM != null) {',
    till: '  if (false) {',
  },

  // ── Ett mått i taget ─────────────────────────────────────────────────────
  {
    namn: 'Optis lass blandas in bland appens (två mått i samma tal)',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '  const lass = app.length > 0 ? app : alla;',
    till: '  const lass = alla;',
  },
  {
    namn: '"Lassen tillsammans" påstår att maskinen körde så långt',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "      under: 'Enkel väg, lass för lass. Maskinen körde mer än så",
    till: "      under: null && ('Enkel väg, lass för lass. Maskinen körde mer än så",
  },
  {
    namn: 'perioden blir en stat igen och trycker sönder statsraden',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    skotningenPeriod: periodMening(d),',
    till: '    skotningenPeriod: null,',
  },

  // ── Var låg virket ───────────────────────────────────────────────────────
  {
    namn: 'avståndet mäts från FÖRSTA avlägget, inte det närmaste',
    fil: 'lib/faktura/virkesfordelning.ts',
    fran: '      if (m < narmast) narmast = m;',
    till: '      if (narmast === Infinity) narmast = m;',
  },
  {
    namn: 'rutans mitt tas ur stammarna — rutan flyttar med virket',
    fil: 'lib/faktura/virkesfordelning.ts',
    fran: '    const lat = (iy + 0.5) * stegLat;',
    till: '    const lat = iy * stegLat;',
  },
  {
    namn: 'procenten avrundas var för sig och summerar inte till 100',
    fil: 'lib/faktura/virkesfordelning.ts',
    fran: '  const andelar = heltalTill100(poster.map(([, v]) => (v / summa) * 100));',
    till: '  const andelar = poster.map(([, v]) => Math.round((v / summa) * 100));',
  },
  {
    namn: 'stammar utan plats eller volym räknas tyst bort',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    not: f.utan > 0',
    till: '    not: false',
  },
  {
    namn: 'tabellen ritas även utan avlägg — en rad nollor',
    fil: 'lib/faktura/virkesfordelning.ts',
    fran: '  if (avlagg.length === 0) return null;',
    till: '  if (false) return null;',
  },
  {
    namn: 'förklaringen till tabellen står kvar fast tabellen saknas',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '  if (harVirke) {',
    till: '  if (true) {',
  },

  // ── Layouten: skissen är kravet ──────────────────────────────────────────
  {
    namn: 'tabellen hamnar under kartan i stället för bredvid',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: 'const HOGER_X = MARG + KART_B + GAP;',
    till: 'const HOGER_X = MARG;',
  },
  {
    namn: 'måtten och "Så är det mätt" staplas — sidan blir två A4',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '    const kb = (B - GAP) / 2;\n    const hx = MARG + kb + GAP;',
    till: '    const kb = B;\n    const hx = MARG;',
  },
  {
    namn: 'staplarna ritas inte — bara talen',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '        sid.drawRectangle({ x: HOGER_X, y: sy, width: bb, height: 2.5, color: F.stapel });',
    till: '',
  },

  // ── Kartan ───────────────────────────────────────────────────────────────
  {
    namn: 'kartans ram tar inte med avlägget (klipps bort som förut)',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '          extentAllt: true,',
    till: '          extentAllt: false,',
  },
  {
    namn: 'en tom karta ritas som en tom ruta utan förklaring',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '    const ritas = harKarta(karta);',
    till: '    const ritas = true;',
  },
  {
    namn: 'teckenförklaringen under kartan uteblir',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '      stycke(sida.kartforklaring, MARG, toppen + kartH + 6',
    till: "      stycke('', MARG, toppen + kartH + 6",
  },
  {
    namn: 'hemresan klipps inte bort — kartans ram blir sex kilometer hög',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: 'export const SPAR_MARGINAL_M = 200;',
    till: 'export const SPAR_MARGINAL_M = 100000;',
  },

  // ── Tecken som inte ritas ────────────────────────────────────────────────
  {
    namn: '³ ritas inte alls — enheten blir "m fub" på papperet',
    fil: 'lib/upphojtPdf.ts',
    fran: "      ut.push({ text: t === '²' ? '2' : '3', upp: true });",
    till: '      // borttagen',
  },
  {
    namn: '³ lämnas som tecken — glyfen blir ett tomrum',
    fil: 'lib/upphojtPdf.ts',
    fran: "    if (t === '²' || t === '³') {",
    till: '    if (false) {',
  },

  // ── Kartan ritas som i hytten (Martin 2026-11-26) ────────────────────────
  {
    namn: 'skördarens stråk ritas inte — bara skotarens körning kommer med',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: "  const skordare = (k.skordarspar ?? []).filter(l => l.length > 1).map(tillKoord);",
    till: '  const skordare: Koord[][] = [];',
  },
  {
    namn: 'skotarens spår utanför stråket ritas lila som skördarens',
    fil: 'lib/egenkontrollRapportKartaPdf.ts',
    fran: "    const appVitt = opts.appstil && h.ute;",
    till: '    const appVitt = false;',
  },
  {
    // Den verkliga regressionen: det vita ritat som det lila, med en hårfin
    // kant. Uppmätt gav hela skotarspåret 7 ritade pixlar — osynligt.
    namn: 'det vita bandet ritas som det lila med hårfin kant — osynligt på papper',
    fil: 'lib/egenkontrollRapportKartaPdf.ts',
    fran: `          const vitKarna = Math.max(UTE_GOLV_PT, karna);
          sida.drawSvgPath(d, { ...SVG, borderColor: grå(55), borderWidth: vitKarna + 1.4,`,
    till: `          const vitKarna = karna;
          sida.drawSvgPath(d, { ...SVG, borderColor: grå(55), borderWidth: vitKarna + 0.8,`,
  },
  {
    namn: 'mittlinjen ritas alltid — äter det lila bandet när kartan är utzoomad',
    fil: 'lib/egenkontrollRapportKartaPdf.ts',
    fran: "          if (h.klar && karna >= MITTLINJE_MIN_KARNA_PT) {",
    till: '          if (h.klar) {',
  },
  {
    namn: 'mittlinjen ritas aldrig — skotaren syns inte i stråket',
    fil: 'lib/egenkontrollRapportKartaPdf.ts',
    fran: "          if (h.klar && karna >= MITTLINJE_MIN_KARNA_PT) {",
    till: '          if (false) {',
  },
  {
    namn: 'bandet saknar tak — sväljer en liten trakt',
    fil: 'lib/egenkontrollRapportKartaPdf.ts',
    fran: "  const skala = Math.max(pr.meterPerPt, BAND_MIN_METER_PER_PT);",
    till: '  const skala = pr.meterPerPt;',
  },
  {
    namn: 'traktgränsen ritas svart streckad i stället för snitselns röd och gul',
    fil: 'lib/egenkontrollRapportKartaPdf.ts',
    fran: "    if (opts.appstil) {\n      sida.drawSvgPath(d, { ...SVG, borderColor: hex(lib, LEGEND.fara), borderWidth: 1.6 });",
    till: "    if (false) {\n      sida.drawSvgPath(d, { ...SVG, borderColor: hex(lib, LEGEND.fara), borderWidth: 1.6 });",
  },
  {
    namn: 'teckenförklaringen säger turkosa band fast stråken är lila',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "  + 'lila band, skotarens körning i vitt och avlägget med sin symbol. Norr är uppåt.';",
    till: "  + 'turkosa band och avlägget med sin symbol. Norr är uppåt.';",
  },
  {
    namn: 'evighetsträd och högstubbar tas inte med på kartan',
    fil: 'lib/faktura/lasSkotningsrapport.ts',
    fran: "    if (f.properties.kind === 'symbol') {",
    till: '    if (false) {',
  },
];

let dodade = 0;
const overlevande = [];

for (const m of MUTANTER) {
  const original = readFileSync(m.fil, 'utf8');
  if (!original.includes(m.fran)) {
    console.log(`⚠  HITTADE INTE mönstret för "${m.namn}" i ${m.fil}`);
    overlevande.push(`${m.namn} (mönstret finns inte — kontrollen är blind)`);
    continue;
  }
  writeFileSync(m.fil, original.replace(m.fran, m.till));
  let foll = false;
  try {
    execFileSync('npx', ['vitest', 'run', ...TESTER], { stdio: 'pipe', timeout: 300000 });
  } catch {
    foll = true;
  } finally {
    writeFileSync(m.fil, original);
  }
  if (foll) { dodade++; console.log(`✓ dödad: ${m.namn}`); }
  else { overlevande.push(m.namn); console.log(`✗ ÖVERLEVDE: ${m.namn}`); }
}

console.log(`\n${dodade} av ${MUTANTER.length} mutanter dödade.`);
if (overlevande.length > 0) {
  console.log('\nÖverlevande:');
  for (const o of overlevande) console.log(`  - ${o}`);
  process.exit(1);
}
