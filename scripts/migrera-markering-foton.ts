// Flyttar de inbäddade base64-fotona (planering_markeringar.data.photoData) till Storage.
//
//   npx tsx scripts/migrera-markering-foton.ts                 # TORRKÖRNING (default) — skriver ingenting
//   npx tsx scripts/migrera-markering-foton.ts --apply         # skarp körning, en markering i taget
//   npx tsx scripts/migrera-markering-foton.ts --apply --id=123   # bara en rad (planering_markeringar.id)
//
// Torrkörningen LÄSER prod (rader + foton) och kör den riktiga komprimeringen i minnet, men
// laddar inte upp, ändrar eller raderar något.
//
// Skarp körning, PER markering, i den här ordningen — och stoppar hela körningen vid första felet:
//   1. läs raden på nytt, avkoda photoData, komprimera (max 1600 px, JPEG 0.7 — som appen)
//   2. spara originalet (base64) i backup-mappen UTANFÖR repot och kontrollera filstorleken
//   3. ladda upp till markering-foton/{objekt_id}/{marker_id}.jpg (upsert: false — en krock stoppar)
//   4. LADDA NER filen igen och jämför byte för byte mot det som skickades
//   5. först då: skriv raden med photoPath + photoTs och utan photoData (update mot id, exakt 1 rad)
//   6. läs tillbaka raden och kontrollera photoPath satt + photoData borta
//
// Läser NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ur .env.local (skrivs aldrig ut).
// Alla sökvägar byggs av lib/markeringFotoSokvag.ts — samma källa som appen.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { MARKERING_FOTO_BUCKET, byggFotoSokvag } from '../lib/markeringFotoSokvag';

const rot = path.resolve(__dirname, '..');
const envArg = process.argv.find((a) => a.startsWith('--env='))?.slice(6);
const envFil = [envArg, path.join(rot, '.env.local'), path.join(rot, '..', '..', '..', '.env.local'), path.join(rot, '..', '..', '..', '..', '.env.local')].filter((f): f is string => !!f).find((f) => fs.existsSync(f));
if (!envFil) { console.error('hittar ingen .env.local'); process.exit(1); }
for (const rad of fs.readFileSync(envFil, 'utf8').split('\n')) {
  const i = rad.indexOf('='); if (i < 0 || rad.startsWith('#')) continue;
  const k = rad.slice(0, i).trim(); if (!process.env[k]) process.env[k] = rad.slice(i + 1).trim().replace(/\r$/, '').replace(/^"|"$/g, '');
}

const APPLY = process.argv.includes('--apply');
const ENDAST_ID = process.argv.find((a) => a.startsWith('--id='))?.slice(5);
const BACKUP_DIR = process.argv.find((a) => a.startsWith('--backup='))?.slice(9) || 'C:/temp/markering-foto-backup';
const MAX_SIDA = 1600;
const KVALITET = 70;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const mb = (n: number) => (n / 1024 / 1024).toFixed(2) + ' MB';
const kb = (n: number) => (n / 1024).toFixed(0) + ' kB';

interface Kandidat { id: string; objekt_id: string; marker_id: string; foto: string }

/** Hittar raderna med photoData. Frågar bara i små grupper — varje rad kan bära ~9 MB. */
async function hittaKandidater(): Promise<{ kandidater: Kandidat[]; radIdn: number; harBadaIdn: string[] }> {
  const { data: rader, error } = await supabase.from('planering_markeringar').select('id, objekt_id, marker_id').order('id', { ascending: true });
  if (error || !rader) throw new Error('kunde inte lista rader: ' + error?.message);
  const kandidater: Kandidat[] = [];
  const harBadaIdn: string[] = [];
  const per = (ids: string[]) => supabase.from('planering_markeringar')
    .select('id, objekt_id, marker_id, foto:data->>photoData, path:data->>photoPath')
    .in('id', ids).not('data->>photoData', 'is', null).order('id', { ascending: true });
  const ta = (r: any) => {
    if (typeof r.foto !== 'string' || r.foto.length === 0) return;
    if (r.path) { harBadaIdn.push(r.id); return; }
    kandidater.push({ id: r.id, objekt_id: r.objekt_id, marker_id: r.marker_id, foto: r.foto });
  };
  const ids = rader.map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 10) {
    const grupp = ids.slice(i, i + 10);
    const { data, error: e } = await per(grupp);
    if (!e && data) { data.forEach(ta); continue; }
    // timeout på gruppen → en och en
    for (const id of grupp) {
      const { data: d1, error: e1 } = await per([id]);
      if (e1) throw new Error(`rad ${id}: ${e1.message}`);
      (d1 || []).forEach(ta);
    }
  }
  return { kandidater, radIdn: ids.length, harBadaIdn };
}

function avkoda(foto: string): Buffer | null {
  const m = foto.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([\s\S]*)$/);
  return m ? Buffer.from(m[1], 'base64') : null;
}

/** Samma resultat som appens komprimering: EXIF-rotation tillämpad, max 1600 px, JPEG 0.7. */
async function komprimera(orig: Buffer) {
  const meta = await sharp(orig).metadata();
  const ut = await sharp(orig).rotate().resize({ width: MAX_SIDA, height: MAX_SIDA, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: KVALITET }).toBuffer();
  const m2 = await sharp(ut).metadata();
  return { ut, fran: `${meta.width}x${meta.height}`, till: `${m2.width}x${m2.height}` };
}

async function filFinns(sokvag: string): Promise<boolean> {
  const [mapp, fil] = sokvag.split('/');
  const { data, error } = await supabase.storage.from(MARKERING_FOTO_BUCKET).list(mapp, { limit: 1000, search: fil });
  if (error) throw new Error('list: ' + error.message);
  return (data || []).some((f) => f.name === fil);
}

async function migreraEn(k: Kandidat): Promise<{ ok: boolean; bytesFore: number; bytesEfter: number; text: string }> {
  const sokvag = byggFotoSokvag(k.objekt_id, k.marker_id);
  const orig = avkoda(k.foto);
  if (!orig) return { ok: false, bytesFore: k.foto.length, bytesEfter: 0, text: 'okänt bildformat i photoData — hoppas över' };

  // 1. läs om raden — hela data behövs för att skriva tillbaka utan photoData
  const { data: farsk, error: eL } = await supabase.from('planering_markeringar').select('id, objekt_id, marker_id, data').eq('id', k.id).single();
  if (eL || !farsk) return { ok: false, bytesFore: k.foto.length, bytesEfter: 0, text: 'kunde inte läsa om raden: ' + eL?.message };
  const data = farsk.data as Record<string, unknown>;
  if (data.photoData !== k.foto) return { ok: false, bytesFore: k.foto.length, bytesEfter: 0, text: 'photoData ändrades sedan inläsningen — hoppas över (kör om)' };
  if (data.photoPath) return { ok: false, bytesFore: k.foto.length, bytesEfter: 0, text: 'raden har redan photoPath — hoppas över' };

  const { ut } = await komprimera(orig);

  // 2. backup av originalet, utanför repot
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFil = path.join(BACKUP_DIR, `${k.id}_${k.marker_id}.txt`);
  fs.writeFileSync(backupFil, k.foto);
  if (fs.statSync(backupFil).size !== Buffer.byteLength(k.foto)) throw new Error('backupfilen har fel storlek — avbryter');

  // 3. uppladdning utan upsert: en befintlig fil ska stoppa, inte skrivas över
  const { error: eU } = await supabase.storage.from(MARKERING_FOTO_BUCKET).upload(sokvag, ut, { contentType: 'image/jpeg', upsert: false });
  if (eU) return { ok: false, bytesFore: k.foto.length, bytesEfter: 0, text: 'uppladdning: ' + eU.message };

  // 4. ladda ner och jämför byte för byte
  const { data: blob, error: eD } = await supabase.storage.from(MARKERING_FOTO_BUCKET).download(sokvag);
  if (eD || !blob) return { ok: false, bytesFore: k.foto.length, bytesEfter: ut.length, text: 'kunde inte ladda ner filen för verifiering: ' + eD?.message };
  const ned = Buffer.from(await blob.arrayBuffer());
  if (!ned.equals(ut)) return { ok: false, bytesFore: k.foto.length, bytesEfter: ut.length, text: `Storage-filen skiljer sig från det som skickades (${ned.length} vs ${ut.length} byte) — raden RÖRS INTE` };

  // 5. skriv raden: photoPath in, photoData ut
  const ny: Record<string, unknown> = { ...data, photoPath: sokvag, photoTs: Date.now() };
  delete ny.photoData;
  const { data: skriven, error: eW } = await supabase.from('planering_markeringar').update({ data: ny }).eq('id', k.id).eq('objekt_id', k.objekt_id).eq('marker_id', k.marker_id).select('id');
  if (eW) return { ok: false, bytesFore: k.foto.length, bytesEfter: ut.length, text: 'update: ' + eW.message };
  if (!skriven || skriven.length !== 1) return { ok: false, bytesFore: k.foto.length, bytesEfter: ut.length, text: `update träffade ${skriven?.length ?? 0} rader (väntade 1)` };

  // 6. läs tillbaka det FAKTISKA innehållet
  const { data: kontroll, error: eK } = await supabase.from('planering_markeringar').select('p:data->>photoPath, f:data->>photoData').eq('id', k.id).single();
  if (eK || !kontroll) return { ok: false, bytesFore: k.foto.length, bytesEfter: ut.length, text: 'kunde inte läsa tillbaka: ' + eK?.message };
  if ((kontroll as any).p !== sokvag || (kontroll as any).f !== null) return { ok: false, bytesFore: k.foto.length, bytesEfter: ut.length, text: `readback fel: photoPath=${(kontroll as any).p} photoData=${(kontroll as any).f === null ? 'null' : 'KVAR'}` };

  return { ok: true, bytesFore: k.foto.length, bytesEfter: ut.length, text: `OK → ${sokvag} (${kb(ut.length)}), backup ${backupFil}` };
}

(async () => {
  console.log(APPLY ? '=== SKARP KÖRNING ===' : '=== TORRKÖRNING (inget skrivs) ===');
  const { kandidater: alla, radIdn, harBadaIdn } = await hittaKandidater();
  const kandidater = ENDAST_ID ? alla.filter((k) => String(k.id) === ENDAST_ID) : alla;
  const totFore = alla.reduce((s, k) => s + k.foto.length, 0);
  console.log(`Rader totalt: ${radIdn}. Med photoData: ${alla.length} (${mb(totFore)} base64). Har både photoData och photoPath (hoppas över): ${harBadaIdn.length}${harBadaIdn.length ? ' → id ' + harBadaIdn.join(',') : ''}`);
  if (ENDAST_ID) console.log(`--id=${ENDAST_ID}: ${kandidater.length} träff`);

  let ok = 0, fel = 0, bytesEfter = 0, bytesFoljd = 0;
  for (const k of kandidater) {
    const sokvag = byggFotoSokvag(k.objekt_id, k.marker_id);
    const rubrik = `id ${k.id}  objekt ${k.objekt_id}  marker ${k.marker_id}`;
    if (!APPLY) {
      const orig = avkoda(k.foto);
      if (!orig) { console.log(`${rubrik}\n   okänt bildformat — skulle hoppas över`); fel++; continue; }
      const { ut, fran, till } = await komprimera(orig);
      const finns = await filFinns(sokvag);
      bytesEfter += ut.length; bytesFoljd += k.foto.length;
      console.log(`${rubrik}\n   ${fran} → ${till}  ${mb(k.foto.length)} base64 → ${kb(ut.length)} JPEG  →  ${sokvag}${finns ? '   ⚠ FILEN FINNS REDAN (skulle stoppa)' : ''}`);
      if (finns) fel++; else ok++;
      continue;
    }
    console.log(rubrik);
    const r = await migreraEn(k);
    console.log('   ' + (r.ok ? '' : 'FEL: ') + r.text);
    if (!r.ok) { fel++; console.log('\nSTOPPAR vid första felet. Inget mer rörs.'); break; }
    ok++; bytesEfter += r.bytesEfter; bytesFoljd += r.bytesFore;
  }

  console.log('\n--- Sammanfattning ---');
  console.log(`${APPLY ? 'Migrerade' : 'Skulle migreras'}: ${ok}   Fel/konflikt: ${fel}`);
  console.log(`Storlek i raderna: ${mb(bytesFoljd)} base64  →  ${mb(bytesEfter)} i Storage (${bytesFoljd ? Math.round((1 - bytesEfter / bytesFoljd) * 100) : 0} % mindre)`);
  if (APPLY) {
    const efter = await hittaKandidater();
    console.log(`EFTER: rader med photoData kvar: ${efter.kandidater.length} (före: ${alla.length}). Rader totalt: ${efter.radIdn} (före: ${radIdn}).`);
    console.log('Kontrollera tabellstorleken före/efter med:\n  select pg_size_pretty(pg_total_relation_size(\'planering_markeringar\'));\nObs: gamla radversioner ligger kvar tills VACUUM/autovacuum körts.');
  }
  process.exit(fel > 0 && APPLY ? 1 : 0);
})().catch((e) => { console.error('FATALT:', e.message); process.exit(1); });
