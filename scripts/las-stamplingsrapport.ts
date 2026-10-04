// SKARP LÄSNING av en stämplingsrapport (PDF → Claude → kontroll). Samma kod som /api/stampling/rapport/[id]/las kör,
// men från terminalen — så att läsningen kan provas mot en riktig rapport utan att starta appen eller ladda upp något.
//
//   npx tsx scripts/las-stamplingsrapport.ts <rapport.pdf>            läs, skriv ut kontrollen
//   npx tsx scripts/las-stamplingsrapport.ts <rapport.pdf> --json fil.json   spara även läsningen (t.ex. som ny fixtur)
//
// Kräver ANTHROPIC_API_KEY (i miljön eller .env.local). Skriver aldrig nyckeln. Kostar ett API-anrop.
// Utgångskod: 0 = alla summor stämmer · 2 = åtgärd behövs · 1 = läsningen misslyckades.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { lasStamplingsrapport, LasFel } from '../lib/stampling/pdf/las';
import { kontrollera, stammerRader } from '../lib/stampling/pdf/kontroll';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const args = process.argv.slice(2);
const fil = args.find(a => !a.startsWith('--') && a.toLowerCase().endsWith('.pdf'));
const jsonUt = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
if (!fil || !existsSync(fil)) { console.error('Ange en PDF: npx tsx scripts/las-stamplingsrapport.ts <rapport.pdf> [--json ut.json]'); process.exit(1); }

const n = (x: number | null, d = 0) => (x == null ? '–' : x.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }));

async function main() {
  const t0 = Date.now();
  const svar = await lasStamplingsrapport(new Uint8Array(readFileSync(fil as string)));
  const k = kontrollera(svar.lasning);
  const p = svar.lasning.post;
  console.log(`\n${p.namn ?? '(inget namn)'}  —  förrättare: ${p.forrattare ?? '–'}  —  datum: ${p.datum ?? '–'}  —  total volym: ${n(p.total_volym_m3sk, 1)} m³sk`);
  console.log(`modell ${svar.modell} · ${((Date.now() - t0) / 1000).toFixed(1)} s${svar.tokens ? ` · ${svar.tokens.in} in / ${svar.tokens.ut} ut tokens` : ''}\n`);
  console.log('Trädslag'.padEnd(14), 'rader'.padStart(5), 'Σ antal'.padStart(9), 'tryckt'.padStart(8), 'Σ volym'.padStart(10), 'tryckt'.padStart(9), '  resultat');
  for (const t of k.tradslag) {
    console.log(t.namn.padEnd(14), String(t.rader).padStart(5), n(t.summaAntal).padStart(9), n(t.tryktAntal).padStart(8), n(t.summaVolym, 1).padStart(10), n(t.tryktVolym, 1).padStart(9),
      ' ', t.iModellen ? (t.ok ? 'STÄMMER' : 'AVVIKER') : '(räknas inte)', t.misstankta.length ? `· misstänkta rader: ${t.misstankta.join(', ')} cm` : '');
  }
  for (const v of k.varningar) console.log('  varning:', v);
  for (const e of k.ejIModellen) console.log('  utanför:', e);
  if (jsonUt) { writeFileSync(jsonUt, JSON.stringify(svar.lasning, null, 1) + '\n'); console.log(`\nLäsningen sparad: ${jsonUt}`); }
  if (k.klart) { console.log('\nALLA SUMMOR STÄMMER.'); stammerRader(k).forEach(r => console.log('  ' + r)); process.exit(0); }
  console.log('\nÅTGÄRD BEHÖVS:'); k.atgard.forEach(a => console.log('  ' + a.text));
  process.exit(2);
}
main().catch(e => { console.error(e instanceof LasFel ? `${e.kod}: ${e.message}` : e); process.exit(1); });
