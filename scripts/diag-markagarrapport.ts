// Steg-för-steg-diagnostik. Slängs efter att huvudtestet fungerar.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(): void {
  const wtMatch = process.cwd().match(/^(.*[\\\/]skogsystem-claude)[\\\/]\.claude[\\\/]worktrees/);
  const path = wtMatch ? resolve(wtMatch[1], '.env.local') : resolve(process.cwd(), '.env.local');
  const text = readFileSync(path, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/i.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);
const objektId = '11124774';

async function step(name: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${name}...`);
  try {
    const result = await fn();
    console.log(` OK (${Date.now()-t0}ms)`, typeof result === 'object' ? '' : result);
    return result;
  } catch (err) {
    console.log(` FEL (${Date.now()-t0}ms):`, err);
    throw err;
  }
}

async function main() {
  await step('1. dim_objekt', async () => {
    const { data, error } = await supabase.from('dim_objekt').select('objekt_id, object_name, atgard, areal_ha, vo_nummer').eq('objekt_id', objektId).maybeSingle();
    if (error) throw error;
    console.log('\n   →', data);
    return data;
  });

  await step('2. objekt via vo_nummer', async () => {
    const { data, error } = await supabase.from('objekt').select('id, areal, namn').eq('vo_nummer', objektId).maybeSingle();
    if (error) throw error;
    console.log('\n   →', data);
    return data;
  });

  const objektUuid = (await supabase.from('objekt').select('id').eq('vo_nummer', objektId).maybeSingle()).data?.id;
  console.log('   objektUuid =', objektUuid);

  await step('3. hpr_filer', async () => {
    if (!objektUuid) return null;
    const { data, error } = await supabase.from('hpr_filer').select('id, maskin_id, filnamn').eq('objekt_id', objektUuid);
    if (error) throw error;
    console.log('\n   → antal:', data?.length, 'första:', data?.[0]);
    return data;
  });

  await step('4a. detalj_stock COUNT', async () => {
    const { count, error } = await supabase.from('detalj_stock').select('*', { count: 'exact', head: true }).eq('objekt_id', objektId);
    if (error) throw error;
    console.log('\n   → count:', count);
    return count;
  });

  await step('4b. detalj_stam COUNT', async () => {
    const { count, error } = await supabase.from('detalj_stam').select('*', { count: 'exact', head: true }).eq('objekt_id', objektId);
    if (error) throw error;
    console.log('\n   → count:', count);
    return count;
  });

  await step('5. detalj_stock första 1000', async () => {
    const { data, error } = await supabase.from('detalj_stock').select('stock_key, sortiment_namn, volym_m3sub').eq('objekt_id', objektId).range(0, 999);
    if (error) throw error;
    console.log('\n   → antal:', data?.length, 'första stock_key:', data?.[0]?.stock_key);
    return data;
  });

  await step('6. dim_sortiment per maskin', async () => {
    const { data: hpr } = await supabase.from('hpr_filer').select('maskin_id').eq('objekt_id', objektUuid);
    const maskinIds = Array.from(new Set((hpr ?? []).map(h => h.maskin_id).filter(Boolean)));
    console.log('\n   maskinIds:', maskinIds);
    const { data, error } = await supabase.from('dim_sortiment').select('sortiment_id, namn, pris_per_m3, dia_min_mm, dia_max_mm').in('maskin_id', maskinIds);
    if (error) throw error;
    console.log('   → antal sortiment:', data?.length);
    console.log('   → första 3:', data?.slice(0, 3));
    return data;
  });

  console.log('\n--- detalj_stam-utredning ---');
  // Hämta första hpr-filen
  const { data: hpr1 } = await supabase.from('hpr_filer').select('id, filnamn, maskin_id').eq('objekt_id', 'cf68572a-8315-41e1-975b-895581f46ff8').limit(1);
  const filnamn = hpr1?.[0]?.filnamn;
  console.log('Första hpr-filens filnamn:', filnamn);

  await step('detalj_stam med objekt_id + filnamn', async () => {
    const { data, error } = await supabase.from('detalj_stam').select('stam_key, filnamn, maskin_id, tradslag_id').eq('objekt_id', '11124774').eq('filnamn', filnamn!).limit(5);
    if (error) throw error;
    console.log('\n   → antal:', data?.length, 'första:', data?.[0]);
    return data;
  });

  await step('detalj_stam med BARA filnamn (utan objekt_id)', async () => {
    const { data, error } = await supabase.from('detalj_stam').select('stam_key, filnamn, objekt_id, maskin_id').eq('filnamn', filnamn!).limit(5);
    if (error) throw error;
    console.log('\n   → antal:', data?.length, 'första:', data?.[0]);
    return data;
  });

  await step('detalj_stam DISTINCT filnamn för objekt_id', async () => {
    const { data, error } = await supabase.from('detalj_stam').select('filnamn').eq('objekt_id', '11124774').limit(5);
    if (error) throw error;
    console.log('\n   → antal:', data?.length, 'sample:', data?.slice(0, 3).map(x => x.filnamn));
    return data;
  });

  await step('detalj_stock med samma filnamn', async () => {
    const { data, error } = await supabase.from('detalj_stock').select('stock_key, filnamn, maskin_id').eq('objekt_id', '11124774').eq('filnamn', filnamn!).limit(5);
    if (error) throw error;
    console.log('\n   → antal:', data?.length, 'första:', data?.[0]);
    return data;
  });

  console.log('\nKLART.');
}

main().catch(err => { console.error('FEL:', err); process.exit(1); });
