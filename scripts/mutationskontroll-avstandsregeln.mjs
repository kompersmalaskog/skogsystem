#!/usr/bin/env node
// Mutationskontroll för SKOTNINGSAVSTÅNDETS REGEL (Martin 2026-11-25).
//
// Regeln har två delar, och båda flyttar pengar på varje ackordfaktura:
//
//   1. MÅTTET: avståndet UT TILL VIRKET (ytterstM), inte halva cykeln.
//   2. PRISET: sätts EN gång, på traktens avstånd och traktens volym.
//
// Facit är de två trakter där Martin satt avståndet för hand och Vida
// betalade (Skälviken 20 956 kr, Edestad 4 708 kr). Varje mutant nedan är ett
// sätt regeln kan glida tillbaka på utan att något kraschar — halva cykeln som
// mått, en loop som summerar kronor per lass, lassens volym i stället för
// traktens. Dödas den inte av ett test är testet en beskrivning, inte ett
// skydd, och nästa faktura kan bli dubbelt så hög som den Vida betalar.
//
//   node scripts/mutationskontroll-avstandsregeln.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const C = 'lib/faktura/lassCykel.ts';
const A = 'lib/faktura/lassAvstand.ts';

const TESTER = [
  'lib/faktura/lassCykel.test.ts',
  'lib/faktura/lassAvstand.test.ts',
  'lib/faktura/lasAppLass.test.ts',
  'lib/faktura/granskningVy.test.ts',
].join(' ');

const MUTANTER = [
  // ── 1. måttet ──
  {
    namn: 'tillbaka till halva cykeln som mått (dubblar varje tillägg)',
    fil: C,
    fran: '      && r.ytterstM != null && r.ytterstM > 0\n      ? r.ytterstM',
    till: '      && r.cykelM != null && r.cykelM > 0\n      ? skotningsavstandM(r.cykelM)',
  },
  {
    namn: 'avståndet ut halveras en gång till (halva tillägget)',
    fil: C,
    fran: '      ? r.ytterstM\n      : null,',
    till: '      ? r.ytterstM / 2\n      : null,',
  },
  {
    namn: 'ett avstånd på noll räknas som mätt (0 kr ser ut som ett svar)',
    fil: C,
    fran: '&& r.ytterstM != null && r.ytterstM > 0',
    till: '&& r.ytterstM != null',
  },
  {
    namn: 'en rad som säger emot sig själv godtas (cykel 0, avstånd 350)',
    fil: C,
    fran: '      && r.cykelM != null && r.cykelM > 0\n',
    till: '',
  },

  // ── 2. priset ──
  {
    namn: 'priset räknas per lass igen (omätta lass drar ner tillägget)',
    fil: A,
    fran: `  const kr = avstandM == null
    ? 0
    : skotAvstandKr(p.uppslag, avstandM, p.skordadVolym, p.avstList);`,
    till: `  const kr = p.manuellM != null
    ? skotAvstandKr(p.uppslag, p.manuellM, p.skordadVolym, p.avstList)
    : barande.reduce((s, l) => s + skotAvstandKr(l.datum, l.avstandM!, l.volym, p.avstList), 0);`,
  },
  {
    namn: 'priset räknas på LASSENS volym i stället för traktens',
    fil: A,
    fran: ': skotAvstandKr(p.uppslag, avstandM, p.skordadVolym, p.avstList);',
    till: ': skotAvstandKr(p.uppslag, avstandM, vol, p.avstList);',
  },
  {
    namn: 'handsatt avstånd går inte längre före lassen',
    fil: A,
    fran: '  const avstandM = p.manuellM ?? lassSnittM;',
    till: '  const avstandM = lassSnittM ?? p.manuellM;',
  },
  {
    namn: 'snittet är osnittat — snitt av snitt i stället för volymviktat',
    fil: A,
    fran: "  const lassSnittM = vol > 0 ? barande.reduce((s, l) => s + l.avstandM! * l.volym, 0) / vol : null;",
    till: "  const lassSnittM = barande.length ? barande.reduce((s, l) => s + l.avstandM!, 0) / barande.length : null;",
  },
  {
    namn: 'omätta lass räknas som 0 m i snittet',
    fil: A,
    fran: '  const barande = lassMedStracka(valda);',
    till: '  const barande = valda.map(l => ({ ...l, avstandM: l.avstandM ?? 0 }));',
  },
  {
    namn: 'källorna summeras i stället för att vägas mot varandra',
    fil: A,
    fran: '  const valda = valjLassKalla([...p.opti, ...p.app]);',
    till: '  const valda = [...p.opti, ...p.app];',
  },
];

let dodade = 0;
for (const m of MUTANTER) {
  const original = readFileSync(m.fil, 'utf8');
  if (!original.includes(m.fran)) {
    console.log(`⚠  ${m.namn}: hittade inte koden att mutera — kontrollera skriptet`);
    continue;
  }
  writeFileSync(m.fil, original.replace(m.fran, m.till));
  let overlevde = true;
  try {
    execSync(`npx vitest run ${TESTER}`, { stdio: 'pipe' });
  } catch {
    overlevde = false;
  } finally {
    writeFileSync(m.fil, original);
  }
  if (overlevde) {
    console.log(`✗ ÖVERLEVDE: ${m.namn}`);
  } else {
    dodade++;
    console.log(`✓ dödad: ${m.namn}`);
  }
}

console.log(`\n${dodade} av ${MUTANTER.length} mutanter dödade.`);
process.exit(dodade === MUTANTER.length ? 0 : 1);
