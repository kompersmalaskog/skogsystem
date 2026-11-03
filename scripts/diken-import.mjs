// Engångsimport av Naturvårdsverkets dikeskarta (Diken Sverige, CC0) till tabellen `dike` (migration 20261103122449_ritad_dike.sql).
// Körs av .github/workflows/diken-import.yml efter att ogr2ogr gjort om länets .gdb till GeoJSONSeq i WGS84 (förenklad till 1 m).
//   node scripts/diken-import.mjs <fil.geojsonl> [<fil.geojsonl> …] [--torr]
// Läser NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY. Upsert på Dike_ID: att köra om ger samma tabell, och ett dike som går
// över en länsgräns (står i båda länens filer) blir en rad.
import fs from 'node:fs';
import readline from 'node:readline';

const filer = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const torr = process.argv.includes('--torr');
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NYCKEL = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BATCH = 1000;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const falt = (p, namn) => { const k = Object.keys(p ?? {}).find((x) => x.toLowerCase() === namn.toLowerCase()); return k ? p[k] : undefined; };

/**
 * Vägdiken sparas inte (Martin 2026-11-03): appen visar dem aldrig (lib/ritadKarta/diken.ts `visasDike`) och de är en fjärdedel av
 * raderna. Samma regel som appens `dikeSlag(...) === 'vag'` — testet i lib/ritadKarta/diken.test.ts kräver att de säger samma sak.
 */
export const arVagdike = (typ) => { const t = String(typ ?? '').toLowerCase(); return t.includes('väg') || t.includes('vag'); };

/**
 * Naturvårdsverket numrerar dikena från 1 INOM VARJE LÄN (Dike_ID 1…1 059 661 i Kronoberg, 1… i Kalmar …), så Dike_ID ensamt krockar
 * mellan län: första skarpa körningen 2026-11-03 skrev 1,7 miljoner diken till 975 000 rader. Radens id = länskod × 10 000 000 + Dike_ID.
 */
export const LANSKOD = { AB: 1, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, K: 10, M: 12, N: 13, O: 14, S: 17, T: 18, U: 19, W: 20, X: 21, Y: 22, Z: 23, AC: 24, BD: 25 };
export const LAN_STEG = 10_000_000;
export const lanUrFil = (fil) => /dike_([A-Z]+)\.geojsonl$/i.exec(String(fil))?.[1]?.toUpperCase() ?? null;
export function radId(lan, dikeId) {
  const kod = LANSKOD[String(lan ?? '').toUpperCase()];
  const n = Number(dikeId);
  if (!kod || !Number.isInteger(n) || n < 0 || n >= LAN_STEG) return null;
  return kod * LAN_STEG + n;
}

/** En feature → en rad, eller null (ingen giltig linje / inget id / okänt län). */
export function tillRad(f, lan) {
  const id = radId(lan, falt(f?.properties, 'Dike_ID'));
  if (id == null) return null;
  const g = f?.geometry;
  const delar = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
  const linjer = delar.map((l) => (l ?? []).filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])).map((p) => [r6(p[0]), r6(p[1])])).filter((l) => l.length >= 2);
  if (!linjer.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const l of linjer) for (const [x, y] of l) { if (y < minLat) minLat = y; if (y > maxLat) maxLat = y; if (x < minLng) minLng = x; if (x > maxLng) maxLng = x; }
  const typ = falt(f.properties, 'Typ');
  const langd = Number(falt(f.properties, 'Langd_m'));
  return { id, typ: typ == null ? null : String(typ), langd_m: Number.isFinite(langd) ? langd : null, min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng, coords: linjer };
}

async function skicka(rader) {
  if (torr) return;
  for (let forsok = 1; ; forsok++) {
    const r = await fetch(`${URL_}/rest/v1/dike?on_conflict=id`, {
      method: 'POST',
      headers: { apikey: NYCKEL, Authorization: `Bearer ${NYCKEL}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rader),
    });
    if (r.ok) return;
    const t = await r.text();
    if (forsok >= 4) throw new Error(`Supabase ${r.status}: ${t.slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 2000 * forsok));
  }
}

async function main() {
  if (!torr && (!URL_ || !NYCKEL)) throw new Error('Saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY');
  if (!filer.length) throw new Error('Ange minst en GeoJSONSeq-fil');
  const typer = new Map();
  let totalt = 0, hoppade = 0, vagdiken = 0;
  for (const fil of filer) {
    const lan = lanUrFil(fil);
    if (!lan || !LANSKOD[lan]) throw new Error(`Kan inte läsa länet ur filnamnet ${fil} (väntar dike_<län>.geojsonl)`);
    let batch = [];
    const rl = readline.createInterface({ input: fs.createReadStream(fil), crlfDelay: Infinity });
    for await (const rad0 of rl) {
      const rad = rad0.replace(/^\x1e/, '').trim();
      if (!rad) continue;
      let f; try { f = JSON.parse(rad); } catch { hoppade++; continue; }
      const r = tillRad(f, lan);
      if (!r) { hoppade++; continue; }
      typer.set(r.typ, (typer.get(r.typ) ?? 0) + 1);
      if (arVagdike(r.typ)) { vagdiken++; continue; }
      batch.push(r);
      if (batch.length >= BATCH) { await skicka(batch); totalt += batch.length; batch = []; if (totalt % 20000 === 0) console.log(`  ${totalt} diken …`); }
    }
    if (batch.length) { await skicka(batch); totalt += batch.length; }
    console.log(`${fil}: klar (${totalt} hittills)`);
  }
  console.log(`${torr ? 'TORRKÖRNING — inget skrivet. ' : ''}${totalt} diken, ${vagdiken} vägdiken inte sparade, ${hoppade} rader utan giltig linje eller id`);
  console.log('Typer:', JSON.stringify(Object.fromEntries(typer)));
}

if (process.argv[1] && process.argv[1].endsWith('diken-import.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
