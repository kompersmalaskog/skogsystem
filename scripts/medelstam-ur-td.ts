/**
 * ENGÅNGSKÖRNING: läs medelstam ur de redan importerade traktdirektiven och fyll `objekt.medelstam` där den är TOM.
 *
 *   npx tsx scripts/medelstam-ur-td.ts                    # TORRKÖRNING (standard): skriver ut vad som skulle sättas, rör inget
 *   npx tsx scripts/medelstam-ur-td.ts --skriv            # skriver — bara objekt vars medelstam fortfarande är null
 *   npx tsx scripts/medelstam-ur-td.ts --env sökväg/.env.local
 *
 * Regler (samma som importen): SKRIVER ALDRIG ÖVER ett befintligt värde (varje skrivning är `update … where id = … and medelstam is null` och läses tillbaka),
 * ingen gissning (lib/trakt/medelstam.ts: ett entydigt tal efter ordet "Medelstam", annars inget), och en tvetydig TD lämnas orörd med sin råtext utskriven.
 * Torrkörningen skriver ut den matchade raden per objekt — läs den innan --skriv: tolkningen är skriven utan en riktig medelstam-rad som facit.
 * Kräver NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i .env.local. TD-PDF:erna ligger i den privata bucketen "kartbilder" (`<traktnr>_traktdirektiv.pdf`).
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { extractText } from 'unpdf';
import { tolkaMedelstam } from '../lib/trakt/medelstam';

const args = process.argv.slice(2);
const skriv = args.includes('--skriv');
const envFil = args.includes('--env') ? args[args.indexOf('--env') + 1] : '.env.local';

const env: Record<string, string> = {};
for (const line of readFileSync(envFil, 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('='); env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const { data: rader, error } = await supabase.from('objekt').select('id, namn, vo_nummer, traktdirektiv_url, medelstam').is('medelstam', null).not('traktdirektiv_url', 'is', null).order('namn');
  if (error) throw new Error(`kunde inte läsa objekt: ${error.message}`);
  console.log(`${skriv ? 'SKRIVER' : 'TORRKÖRNING'} — ${rader!.length} objekt med tom medelstam och ett traktdirektiv\n`);
  let satt = 0, ingen = 0, tvetydig = 0, fel = 0;
  for (const o of rader!) {
    try {
      const { data: blob, error: dl } = await supabase.storage.from('kartbilder').download(o.traktdirektiv_url);
      if (dl || !blob) throw new Error(`nedladdning: ${dl?.message ?? 'tom'}`);
      const text = (await extractText(new Uint8Array(await blob.arrayBuffer()), { mergePages: true })).text || '';
      const svar = tolkaMedelstam(text);
      const rad = text.split(/\r?\n/).find((r) => /Medelstam/i.test(r))?.replace(/\s+/g, ' ').trim() ?? '';
      if (svar.varning) { tvetydig++; console.log(`  ? ${o.namn}: ${svar.varning}`); continue; }
      if (svar.medelstam == null) { ingen++; console.log(`  – ${o.namn}: ingen medelstam i TD${rad ? ` (rad med ordet: "${rad.slice(0, 120)}")` : ''}`); continue; }
      console.log(`  ✓ ${o.namn}: ${svar.medelstam}   ← "${rad.slice(0, 120)}"`);
      if (!skriv) { satt++; continue; }
      const { data: upd, error: ue } = await supabase.from('objekt').update({ medelstam: svar.medelstam }).eq('id', o.id).is('medelstam', null).select('id, medelstam');
      if (ue) throw new Error(`skrivning: ${ue.message}`);
      if (!upd || upd.length === 0) { console.log('    (hoppades över: någon hann sätta ett värde)'); continue; }
      const { data: las } = await supabase.from('objekt').select('medelstam').eq('id', o.id).single();
      if (Number(las?.medelstam) !== svar.medelstam) throw new Error(`verifiering: läste ${las?.medelstam}, skrev ${svar.medelstam}`);
      satt++;
    } catch (e: any) { fel++; console.log(`  ✗ ${o.namn}: ${e?.message ?? e}`); }
  }
  console.log(`\n${skriv ? 'satta' : 'skulle sättas'}: ${satt} · ingen medelstam i TD: ${ingen} · tvetydiga (orörda): ${tvetydig} · fel: ${fel}`);
})().catch((e) => { console.error('FEL:', e?.message || e); process.exit(1); });
