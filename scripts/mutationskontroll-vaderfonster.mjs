#!/usr/bin/env node
// Mutationskontroll for skotningsfonstret (lib/egenkontroll.ts) och dess texter.
//
// Varje mutant ar ett fel vi FAKTISKT hade kunnat gora - inte en slumpad teckenandring. En mutant som
// OVERLEVER betyder att testerna inte skulle marka felet; da ar det testet som ska skarpas, inte mutanten
// som ska tas bort.
//
//   node scripts/mutationskontroll-vaderfonster.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TESTER = 'lib/egenkontrollVaderFonster.test.ts lib/egenkontrollStubbehandling.test.ts';

const MUTANTER = [
  {
    namn: 'gransen tas bort (0 punkter raknas som en arbetsdag)',
    fil: 'lib/egenkontroll.ts',
    fran: 'export const HYTTSPAR_MIN_PUNKTER = 20;',
    till: 'export const HYTTSPAR_MIN_PUNKTER = 0;',
  },
  {
    namn: 'gransen blir strikt (exakt gransen raknas inte)',
    fil: 'lib/egenkontroll.ts',
    fran: 'r.antal_punkter >= HYTTSPAR_MIN_PUNKTER',
    till: 'r.antal_punkter > HYTTSPAR_MIN_PUNKTER',
  },
  {
    namn: 'okant antal (null) raknas som en arbetsdag',
    fil: 'lib/egenkontroll.ts',
    fran: "typeof r.antal_punkter === 'number' && r.antal_punkter >= HYTTSPAR_MIN_PUNKTER",
    till: '(r.antal_punkter ?? 0) >= HYTTSPAR_MIN_PUNKTER || r.antal_punkter == null',
  },
  {
    namn: 'rollerna blandas',
    fil: 'lib/egenkontroll.ts',
    fran: '.filter((r) => r.roll === roll && typeof',
    till: '.filter((r) => typeof',
  },
  {
    namn: 'korsparet skriver over maskindatan for skotningen',
    fil: 'lib/egenkontroll.ts',
    fran: "  if (!fonster.skot_kalla) {\n    const spann = fonsterUrKorspar(rader, 'skotare');",
    till: "  if (true) {\n    const spann = fonsterUrKorspar(rader, 'skotare');",
  },
  {
    namn: 'korsparets fonster marks som maskindata',
    fil: 'lib/egenkontroll.ts',
    fran: "      fonster.skot_kalla = 'korspar';",
    till: "      fonster.skot_kalla = 'maskindata';",
  },
  {
    namn: 'lasfel pa korsparet sjunks (tomt i stallet for fel)',
    fil: 'lib/egenkontroll.ts',
    fran: 'if (error) throw new Error(`Kunde inte läsa körspåren: ${error.message}`);',
    till: 'if (error) return fonster;',
  },
  {
    namn: 'kompletteraVader ror en KLAR runda',
    fil: 'lib/egenkontroll.ts',
    fran: "  if (r.status === 'klar') return { fyllt: false, skal: 'Rundan är klar.' };",
    till: '  if (false) return { fyllt: false, skal: null };',
  },
  {
    namn: 'kompletteraVader skriver over ett vader som redan finns',
    fil: 'lib/egenkontroll.ts',
    fran: "  if (gammalStatus !== null && gammalStatus !== 'saknar_skotdatum') {",
    till: '  if (false) {',
  },
  {
    namn: 'kompletteraVader skriver en identisk snapshot nar fonstret fortfarande saknas',
    fil: 'lib/egenkontroll.ts',
    fran: '  if (!fonster.skot_start || !fonster.skot_slut) {',
    till: '  if (false) {',
  },
  {
    namn: 'kompletteraVader skriver aven nar arkivet svarade fel',
    fil: 'lib/egenkontroll.ts',
    fran: "  if (vader.status !== 'ok') {",
    till: '  if (false) {',
  },
  {
    namn: 'kompletteraVader sager fyllt aven utan en rad tillbaka',
    fil: 'lib/egenkontroll.ts',
    fran: '  if ((skrivet ?? []).length === 0) {',
    till: '  if (false) {',
  },
  {
    namn: 'fonstret skrivs utan att bada andarna finns (halvt fonster)',
    fil: 'lib/egenkontroll.ts',
    fran: '    if (skotStart && skotSlut) {',
    till: '    if (skotStart || skotSlut) {',
  },
];

let dodade = 0;
const overlevande = [];

for (const m of MUTANTER) {
  const original = readFileSync(m.fil, 'utf8');
  if (!original.includes(m.fran)) {
    console.log(`\x1b[31mHITTAR INTE\x1b[0m ${m.namn}\n  sokte: ${JSON.stringify(m.fran).slice(0, 120)}`);
    overlevande.push(`${m.namn} (motet hittades inte - mutanten ar foraldrad)`);
    continue;
  }
  writeFileSync(m.fil, original.replace(m.fran, m.till));
  let dod = false;
  try {
    execSync(`npx vitest run ${TESTER}`, { stdio: 'pipe' });
  } catch {
    dod = true;
  } finally {
    writeFileSync(m.fil, original);
  }
  if (dod) { dodade++; console.log(`\x1b[32mDOD\x1b[0m        ${m.namn}`); }
  else { overlevande.push(m.namn); console.log(`\x1b[31mOVERLEVDE\x1b[0m  ${m.namn}`); }
}

console.log(`\n${dodade} av ${MUTANTER.length} mutanter dodade.`);
if (overlevande.length) {
  console.log('\nOverlevande:');
  for (const o of overlevande) console.log(`  - ${o}`);
  process.exit(1);
}
