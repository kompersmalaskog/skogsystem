// Mutationskontroll for raden som sager att rundan ar klar (PR "avslutet dar fingret ar").
//
// Varje mutant ar ett satt felet kan komma tillbaka. En mutant som OVERLEVER betyder att inget test ser skillnaden -
// da ar testet pynt. Kor: node scripts/mutationskontroll-avsluta.mjs
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TESTER = [
  'lib/egenkontrollAvsluta.test.ts',
  'app/egenkontroll/format.avsluta.test.ts',
  'app/egenkontroll/[objektId]/page.avsluta.render.test.tsx',
];

const MUTANTER = [
  // Regeln for nar raden visas
  ['lib/egenkontrollAvsluta.ts', 'return i.kan && !i.klar && !i.angraVisas && !i.ritar;', 'return i.kan && !i.klar && !i.ritar;', 'Angra-kvittot och raden star samtidigt'],
  ['lib/egenkontrollAvsluta.ts', 'return i.kan && !i.klar && !i.angraVisas && !i.ritar;', 'return !i.klar && !i.angraVisas && !i.ritar;', 'raden visas aven med punkter kvar'],
  ['lib/egenkontrollAvsluta.ts', 'return i.kan && !i.klar && !i.angraVisas && !i.ritar;', 'return i.kan && !i.angraVisas && !i.ritar;', 'raden visas pa en avslutad runda'],
  ['lib/egenkontrollAvsluta.ts', 'return i.kan && !i.klar && !i.angraVisas && !i.ritar;', 'return false;', 'raden visas aldrig - felet ar tillbaka'],
  // Sista svaret
  ['lib/egenkontrollAvsluta.ts', "if (p.kalla === 'observation' || !p.besvarad) continue;", 'if (!p.besvarad) continue;', 'en observation raknas som sista svaret'],
  ['lib/egenkontrollAvsluta.ts', 'if (senast === null || p.besvarad > senast) senast = p.besvarad;', 'if (senast === null) senast = p.besvarad;', 'forsta svaret vinner i stallet for sista'],
  // Gammal runda
  ['lib/egenkontrollAvsluta.ts', 'export const GAMMAL_RUNDA_DAGAR = 2;', 'export const GAMMAL_RUNDA_DAGAR = 99;', 'ingen runda ar nagonsin gammal'],
  ['lib/egenkontrollAvsluta.ts', 'return dagar >= GAMMAL_RUNDA_DAGAR;', 'return dagar > GAMMAL_RUNDA_DAGAR;', 'gransen flyttad ett dygn'],
  ['lib/egenkontrollAvsluta.ts', "if (!sistaSvar) return false;", 'if (!sistaSvar) return true;', 'runda utan svar pastas vara gammal'],
  // Texten
  ['app/egenkontroll/format.ts', 'if (!arGammalRunda(sistaSvar, nu)) return null;', 'if (false) return null;', 'noten star pa varje runda'],
  // Vyn
  ['app/egenkontroll/[objektId]/page.tsx', 'visaAvslutaRad({ kan: kanAvsluta, klar: rundanKlar, angraVisas: !!angra, ritar: !!rita })', 'false', 'raden kopplas bort ur vyn'],
  ['app/egenkontroll/[objektId]/page.tsx', '<AvslutaRad onAvsluta={() => setVisaAvslutsdialog(true)} avslutar={avslutar} />', '<AvslutaRad onAvsluta={() => {}} avslutar={avslutar} />', 'knappen gor ingenting'],
  ['app/egenkontroll/[objektId]/page.tsx', '(visaAvslutsdialog ? gammalRundaNot(sistaSvaret(allaPunkter)) : null)', 'null', 'noten kopplas bort ur bekraftelsen'],
];

const kor = () => {
  try {
    execSync(`npx vitest run ${TESTER.map((t) => JSON.stringify(t)).join(' ')}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
};

if (!kor()) { console.error('Testerna ar roda UTAN mutation - fixa dem forst.'); process.exit(1); }

let doda = 0;
for (const [fil, fran, till, vad] of MUTANTER) {
  const original = readFileSync(fil, 'utf8');
  if (!original.includes(fran)) { console.error(`SAKNAS i ${fil}: ${fran.slice(0, 60)}`); process.exit(1); }
  writeFileSync(fil, original.replace(fran, till));
  const gront = kor();
  writeFileSync(fil, original);
  if (gront) console.log(`OVERLEVDE: ${vad}`);
  else { doda++; console.log(`dod: ${vad}`); }
}
console.log(`\n${doda} av ${MUTANTER.length} mutanter dodade.`);
process.exit(doda === MUTANTER.length ? 0 : 1);
