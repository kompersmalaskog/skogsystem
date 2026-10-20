/**
 * ENGÅNGSKÖRNING: för in lassen som bilens vikt visar för en historisk period i lastbil_lass, så de syns under "N lass saknar maskin"
 * och besvaras i appen. Startas av GitHub Actions (.github/workflows/lass-historik.yml, knappen "Run workflow"), kan också köras lokalt:
 *
 *   npx tsx scripts/lass-historik.ts --fran 2026-08-03 --till 2026-10-16            # TORRKÖRNING (standard): skriver ut vad som skulle göras
 *   npx tsx scripts/lass-historik.ts --fran 2026-08-03 --till 2026-10-16 --lage skriv
 *   npx tsx scripts/lass-historik.ts … --env sökväg/.env.local
 *
 * Reglerna (aldrig auto-flytt, inga pushar, bara tomma fält, idempotent) står i lib/lastbil/lass/historik.ts. Kräver
 * NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY (miljön, eller en .env-fil med --env). Exit 1 vid fel.
 */
import { appendFileSync, readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { koraHistoriskaLass } from '../lib/lastbil/lass/historik';
import { historikTabell } from '../lib/lastbil/lass/historikText';

const args = process.argv.slice(2);
const arg = (namn: string, standard: string): string => (args.includes(namn) ? args[args.indexOf(namn) + 1] : standard);
const lage = arg('--lage', 'torrkor');
const fran = arg('--fran', '2026-08-03');
const till = arg('--till', '2026-10-16');
const envFil = args.includes('--env') ? arg('--env', '') : null;

function fel(text: string): never { console.error(`FEL: ${text}`); process.exit(1); }

if (lage !== 'torrkor' && lage !== 'skriv') fel(`--lage ska vara "torrkor" eller "skriv", fick "${lage}"`);
if (envFil) {
  for (const rad of readFileSync(envFil, 'utf-8').split('\n')) {
    const t = rad.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('='); const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const nyckel = process.env.SUPABASE_SERVICE_ROLE_KEY;
const saknas = [!url && 'NEXT_PUBLIC_SUPABASE_URL (repository-variabel)', !nyckel && 'SUPABASE_SERVICE_ROLE_KEY (repository-SECRET)'].filter(Boolean);
if (saknas.length) fel(`saknas: ${saknas.join(', ')}. GitHub: Settings → Secrets and variables → Actions.`);

(async () => {
  const supabase = createClient(url!, nyckel!, { auth: { persistSession: false } });
  console.log(`${lage === 'skriv' ? 'SKRIVER' : 'TORRKÖRNING'} — ${fran} till ${till} (exklusiv)\n`);
  const rapport = await koraHistoriskaLass(supabase, { fran, till, skriv: lage === 'skriv' });
  const text = historikTabell(rapport);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  if (!rapport.ok) process.exit(1);
})().catch(e => fel(e?.message || String(e)));
