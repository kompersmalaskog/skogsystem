// Standalone-test för markagarrapport-algoritmen.
// Kör: npx tsx scripts/test-markagarrapport.ts <objekt_id>
// Default objekt_id = 11124774 (Hössjömåla, Första gallring).
// Slängs när Husjönäs-verifieringen är klar.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { aggregateMarkagarRapport } from '../lib/markagarrapport/aggregate';

function loadEnvLocal(): void {
  // Sök .env.local i CWD och uppåt (worktrees ärver inte untracked filer från huvud-repot)
  const candidates: string[] = [];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(resolve(dir, '.env.local'));
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Och hoppa direkt till skogsystem-claude-roten om vi är i en worktree
  const wtMatch = process.cwd().match(/^(.*[\\\/]skogsystem-claude)[\\\/]\.claude[\\\/]worktrees/);
  if (wtMatch) candidates.push(resolve(wtMatch[1], '.env.local'));

  for (const path of candidates) {
    try {
      const text = readFileSync(path, 'utf-8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/i.exec(trimmed);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
      }
      console.log(`[env] Läste ${path}`);
      return;
    } catch {
      continue;
    }
  }
  console.warn('[env] Hittade ingen .env.local i', candidates);
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;

  if (!url || !key) {
    console.error('Saknar NEXT_PUBLIC_SUPABASE_URL eller key i .env.local');
    process.exit(1);
  }
  if (!serviceKey) {
    console.warn('[env] SUPABASE_SERVICE_ROLE_KEY saknas — använder anon-nyckel. RLS kan filtrera bort rader.');
  }

  const objektId = process.argv[2] ?? '11124774';
  console.log(`\nMarkägarrapport-test mot objekt_id = ${objektId}`);
  console.log('Bypassar atgard-checken.\n');

  const t0 = Date.now();
  const supabase = createClient(url, key);
  const limitFiles = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
  console.log(`Begränsar till första ${limitFiles} hpr-fil(er) för att hålla tiden rimlig.\n`);

  const result = await aggregateMarkagarRapport(supabase as any, objektId, {
    bypassAtgardCheck: true,
    includeDebug: true,
    limitToFirstNFiles: limitFiles,
  });
  const ms = Date.now() - t0;

  if (result.status !== 'ok') {
    console.error('Status:', result.status);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const d = result.data;
  const fmt = (n: number, decs = 1) => n.toLocaleString('sv-SE', { minimumFractionDigits: decs, maximumFractionDigits: decs });
  const kr = (n: number) => Math.round(n).toLocaleString('sv-SE');

  console.log('=== HEADER ===');
  console.log(`Namn:           ${d.objekt.namn ?? '–'}`);
  console.log(`Skogsägare:     ${d.objekt.skogsagare ?? '–'}`);
  console.log(`Åtgärd:         ${d.objekt.atgard ?? '–'}`);
  console.log(`Första datum:   ${d.objekt.forsta_datum ?? '–'}`);
  console.log(`Operatör:       ${d.objekt.operator}`);
  console.log(`Maskin:         ${d.objekt.maskin}`);

  console.log('\n=== ÖVERSIKT ===');
  console.log(`Yta:            ${d.oversikt.yta_ha ?? '–'} ha  (källa: ${d.oversikt.yta_kalla ?? 'Saknas'})`);
  console.log(`Stammar:        ${d.oversikt.stammar.toLocaleString('sv-SE')}`);
  console.log(`Volym:          ${fmt(d.oversikt.volym_m3sub)} m³sub`);
  console.log(`Virkesvärde:    ${kr(d.oversikt.virkesvarde_kr)} kr`);

  console.log('\n=== TRÄDSLAG ===');
  for (const t of d.tradslag) {
    const dia = t.medeldiameter_cm != null ? fmt(t.medeldiameter_cm) + ' cm' : '–';
    console.log(`  ${t.namn.padEnd(10)} ${fmt(t.volym_m3sub).padStart(9)} m³  ${fmt(t.andel_pct).padStart(5)}%  ${String(t.stammar).padStart(5)} stammar  medeldia ${dia}`);
  }

  console.log('\n=== ROTRÖTA ===');
  const r = d.rotrota;
  console.log(`Stammar med rot:    ${r.stammar_med_rot}  (Bmav ${r.bmav_count}, Avkap ${r.avkap_count}, Grade9 ${r.grade9_count})`);
  console.log(`Andel av gran:      ${fmt(r.pct_av_gran)}%`);
  console.log(`Rotpåverkad volym:  ${fmt(r.rotpaverkad_volym_m3)} m³  (${fmt(r.rotpaverkad_pct)}% av total)`);
  console.log(`Värdeförlust:       ${kr(r.vardeforlust_kr)} kr  (${fmt(r.vardeforlust_pct, 2)}% av virkesvärde)`);

  console.log('\n=== AVKAP-SKICKLIGHET ===');
  const a = d.avkap_skicklighet;
  console.log(`Totalt avkap:       ${a.totalt}`);
  console.log(`Lyckade:            ${a.lyckade}`);
  console.log(`Räddat värde:       +${kr(a.raddat_kr)} kr`);
  console.log(`Utfall:             lyckad ${a.utfall.lyckad}, misslyckad ${a.utfall.misslyckad}, avkap-igen ${a.utfall.avkap_igen}, övrigt ${a.utfall.ovrigt}`);

  console.log('\n=== TIMMER TOP 2 ===');
  if (d.timmer_top2.length === 0) console.log('  (inga timmer-sortiment)');
  for (const t of d.timmer_top2) {
    console.log(`  ${t.sortiment_namn}  —  ${fmt(t.total_volym_m3sub)} m³`);
    for (const dim of t.dimensioner) {
      console.log(`    ${dim.dia_klass}: ${fmt(dim.volym_m3sub)} m³  pris ${dim.pris_per_m3 ?? '–'} kr/m³`);
    }
  }

  console.log('\n=== STUBBAR ===');
  console.log(`Behandlade:         ${d.stubbar.behandlade} av ${d.stubbar.totalt}`);

  console.log('\n=== SORTIMENT (top 15 efter värde) ===');
  for (const s of d.sortiment.slice(0, 15)) {
    const namn = (s.namn || s.sortiment_id).padEnd(40).slice(0, 40);
    console.log(`  ${namn} ${s.tradslag.padEnd(8)} ${String(s.stockar).padStart(6)} st  ${fmt(s.volym_m3sub).padStart(9)} m³  ${kr(s.varde_kr).padStart(10)} kr`);
  }

  console.log('\n=== KARTA ===');
  console.log(`Stammar med koordinater: ${d.karta.stammar.length}`);

  console.log('\n=== DEBUG ===');
  const m1 = d.debug?.massa_pris_per_maskin ?? {};
  console.log('Massa-snittpris per maskin (volymviktat över Bmav-stockar):');
  for (const [maskin, pris] of Object.entries(m1)) {
    console.log(`  ${maskin}: ${pris.toFixed(2)} kr/m³`);
  }
  if (Object.keys(m1).length === 0) console.log('  (inga — pris_per_m3 sannolikt null)');

  const m2 = d.debug?.timmer_pris_per_maskin ?? {};
  console.log('Gran-timmer-snittpris per maskin (volymviktat, dia 180–300 mm):');
  for (const [maskin, pris] of Object.entries(m2)) {
    console.log(`  ${maskin}: ${pris.toFixed(2)} kr/m³`);
  }
  if (Object.keys(m2).length === 0) console.log('  (inga — sannolikt pga tomt pris_per_m3)');

  console.log(`\nKlart på ${ms} ms.\n`);
  console.log('=== RÅ JSON DTO ===');
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch(err => {
  console.error('FEL:', err);
  process.exit(1);
});
