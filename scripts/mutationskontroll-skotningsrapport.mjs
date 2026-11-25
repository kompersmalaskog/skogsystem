#!/usr/bin/env node
// Mutationskontroll: skotningsrapporten (PDF till Vidas inköpare).
//
// Rapportens värde ligger i att den säger SANT och SAMMA tal som fakturan.
// Varje mutant nedan är ett sätt att göra den osann eller vilseledande utan
// att något blir "fel" i vanlig mening — ett märke på fel rad, ett påstående
// om mätning när talet är handsatt, en karta som klipper bort avlägget.
//
//   node scripts/mutationskontroll-skotningsrapport.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TESTER = [
  'lib/faktura/skotningsrapport.test.ts',
  'lib/faktura/skotningsrapportPdf.test.ts',
  'components/faktura/Skotningsrapport.render.test.tsx',
];

const MUTANTER = [
  // ── Vilket tal som är det fakturerade ────────────────────────────────────
  {
    namn: 'handsatt avstånd märks inte som fakturerat (mätt rad tar märket)',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "      status: `${meter(handsattM)} · fakturerat`,",
    till: '      status: meter(handsattM),',
  },
  {
    namn: 'mätt rad behåller "fakturerat" fast avståndet är handsatt',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "      status: handsattM == null ? `${meter(c.ytterstM)} · fakturerat` : meter(c.ytterstM),",
    till: "      status: `${meter(c.ytterstM)} · fakturerat`,",
  },
  {
    namn: 'den handsatta raden försvinner helt',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '  if (handsattM != null) {',
    till: '  if (false) {',
  },

  // ── Att källan sägs ──────────────────────────────────────────────────────
  {
    namn: 'källmeningen byggs men hamnar inte i dokumentet',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "      under: `${kalla} ${d.handsatt",
    till: "      under: `${''} ${d.handsatt",
  },
  {
    namn: 'källmeningen tappas bort när måttsektionen saknas',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    under: [matt.length === 0 ? kalla : null, lucka].filter(Boolean).join(\' \') || undefined,',
    till: '    under: lucka ?? undefined,',
  },
  {
    namn: 'noten säger "mätt" också om ett handsatt tal',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    not: (d.handsatt',
    till: '    not: (false',
  },
  {
    namn: 'handsatt låter som mätt i källmeningen',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '    return `Avståndet är satt för hand och gäller hela trakten.${jam}`;',
    till: '    return `Mätt ur skotarens körspår.${jam}`;',
  },

  // ── Att alla fyra måtten står kvar ───────────────────────────────────────
  {
    namn: 'halva cykeln göms (bara det vi fakturerar visas)',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: "  rader.push({\n    titel: 'Halva cykeln',",
    till: "  if (c.enkelVagM == null) rader.push({\n    titel: 'Halva cykeln',",
  },
  {
    namn: 'vid avlägget göms — landningsarbetet syns inte',
    fil: 'lib/faktura/skotningsrapport.ts',
    fran: '  if (c.vidAvlaggetM != null) {',
    till: '  if (false) {',
  },

  // ── Kartan ───────────────────────────────────────────────────────────────
  {
    namn: 'kartans ram tar inte med avlägget (klipps bort som förut)',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '        { etiketter: true, extentAllt: true },',
    till: '        { etiketter: true },',
  },
  {
    namn: 'kartan ritas i flödet igen — innehållet bryts mitt itu',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '    egenSida: true,',
    till: '    egenSida: false,',
  },
  {
    namn: 'en tom karta ritas som en tom ruta',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '  if (!harKarta(k)) return undefined;',
    till: '  if (false) return undefined;',
  },
  {
    namn: 'teckenförklaringen under kartan uteblir',
    fil: 'lib/faktura/skotningsrapportPdf.ts',
    fran: '      for (const rad of forklRader) {',
    till: '      for (const rad of []) {',
  },

  // ── Tecken som inte ritas ────────────────────────────────────────────────
  {
    namn: '³ lämnas kvar — glyfen ritas inte och enheten blir "m fub"',
    fil: 'lib/markagarrapport/pdf.ts',
    fran: "    .replace(/³/g, '3')",
    till: '',
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
