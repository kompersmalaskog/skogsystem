#!/usr/bin/env node
// Mutationskontroll för avståndsraden och den lättade trakten (2026-11-20).
//
// Varje mutant är ett sätt regeln kan gå sönder på utan att något kraschar —
// en bortglömd handsatt siffra, ett osnittat snitt, en rad som tyst försvinner.
// Dödas den inte av ett test är testet en beskrivning, inte ett skydd.
//
//   node scripts/mutationskontroll-avstandsrad.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const G = 'lib/faktura/granskningVy.ts';
const T = 'lib/faktura/traktVy.ts';
const K = 'components/faktura/TraktKlient.tsx';

const TESTER = [
  'lib/faktura/granskningVy.test.ts',
  'lib/faktura/traktVy.test.ts',
  'components/faktura/TraktKlient.render.test.tsx',
].join(' ');

const MUTANTER = [
  {
    namn: 'avstandMeter struntar i det handsatta talet',
    fil: G,
    fran: 'return a.manuellt ?? lassSnittM(a);',
    till: 'return lassSnittM(a);',
  },
  {
    namn: 'snittet är osnittat — snitt av snitt i stället för volymviktat',
    fil: G,
    fran: 'return a.lass.reduce((s, l) => s + l.avstandM * l.volym, 0) / lassVolym;',
    till: 'return a.lass.reduce((s, l) => s + l.avstandM, 0) / a.lass.length;',
  },
  {
    namn: 'raden ritas även utan avstånd — tom rad i stället för ingen',
    fil: G,
    fran: `  const m = avstandMeter(i.a);
  if (m == null) return null;`,
    till: `  const m = avstandMeter(i.a) ?? 0;`,
  },
  {
    namn: 'handsatt tal utan jämförelse mot lassen',
    fil: G,
    fran: `      under: snitt != null
        ? \`Satt för hand · lassen säger \${heltal(snitt)} m\`
        : 'Satt för hand',`,
    till: `      under: 'Satt för hand',`,
  },
  {
    namn: 'maskinkortet struntar i metrarna',
    fil: T,
    fran: "        etikett: avstandM != null ? `Skotningsavstånd, ${heltal(avstandM)} m` : 'Skotningsavstånd',",
    till: "        etikett: 'Skotningsavstånd',",
  },
  {
    namn: 'kostnadsstället tillbaka i rubriken',
    fil: T,
    fran: "    etikett: r.kostnadsstalle ? verb : `${verb} · kostnadsställe saknas`,",
    till: "    etikett: `${verb} · kostnadsställe ${r.kostnadsstalle ?? 'SCO'}`,",
  },
  {
    namn: 'ett kostnadsställe som saknas sägs inte',
    fil: T,
    fran: "    etikett: r.kostnadsstalle ? verb : `${verb} · kostnadsställe saknas`,",
    till: '    etikett: verb,',
  },
  {
    namn: 'summan lika stor som priset igen',
    fil: K,
    fran: `                  <span style={{ ...TYP.text, ...TAL_FONT, color: FARG.text }}>
                    {k.summa != null ? \`\${nr(k.summa)} kr\` : '—'}`,
    till: `                  <span style={{ ...TYP.rubrik, ...TAL_FONT, color: FARG.text }}>
                    {k.summa != null ? \`\${nr(k.summa)} kr\` : '—'}`,
  },
  {
    namn: 'avståndsraden under Priset ritas aldrig',
    fil: K,
    fran: '          {avstandRad && (',
    till: '          {false && avstandRad && (',
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
