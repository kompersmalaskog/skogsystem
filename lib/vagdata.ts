import { queryOverpass, OverpassAllFailedError } from '@/lib/overpass';

// Server-side hämtare för TMA-vägdata (cache-först). Läser objektets centrumkoordinat, hämtar all
// väggeometri i en bbox runt det, NORMALISERAR till Overpass-"elements"-form och upsertar
// objekt_vagdata med status. ALDRIG i förarens väg — anropas av /api/vagdata-hamta (manuell/
// omkörning) och /api/vagdata-cron (svep). Källan är just nu Overpass (reserv); NVDB kopplas in
// som primär när nyckeln finns — då normaliserar NVDB-grenen till SAMMA elements-form → PR 2 rörs ej.

const BBOX_KM = 2; // radie runt objektcentrum. Superset — klientens 50 m-filter smalnar mot boundaryn.

export interface VagdataResultat {
  status: 'ok' | 'misslyckad';
  kalla?: 'overpass' | 'nvdb';
  instans?: string;
  antalVagar?: number;
  bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
  fel?: string;
}

const nu = () => new Date().toISOString();

async function skrivMisslyckad(supabase: any, objektId: string, fel: string, bbox?: any): Promise<VagdataResultat> {
  // Behåll ev. tidigare geometri/kalla/hamtad_at (upsart sätter inte de fälten) → ett misslyckat
  // omhämtningsförsök raderar aldrig senast kända vägdata. status berättar sanningen.
  await supabase.from('objekt_vagdata').upsert(
    { objekt_id: objektId, status: 'misslyckad', fel, ...(bbox ? { bbox } : {}), updated_at: nu() },
    { onConflict: 'objekt_id' },
  );
  return { status: 'misslyckad', fel, bbox };
}

export async function hamtaOchLagraVagdata(supabase: any, objektId: string): Promise<VagdataResultat> {
  // Synligt "pågår" medan vi hämtar (planerarlistan). Ev. befintlig geometri lämnas orörd.
  await supabase.from('objekt_vagdata').upsert(
    { objekt_id: objektId, status: 'pagar', updated_at: nu() },
    { onConflict: 'objekt_id' },
  );

  // Centrumkoordinat: objekt.lat/lng → larmkoordinat (samma anda som km-koordinatens fallback).
  const { data: obj, error: objErr } = await supabase
    .from('objekt').select('lat, lng, larmkoordinat_lat, larmkoordinat_lng').eq('id', objektId).single();
  if (objErr || !obj) return skrivMisslyckad(supabase, objektId, 'objekt saknas: ' + (objErr?.message || objektId));
  const lat = obj.lat ?? obj.larmkoordinat_lat;
  const lon = obj.lng ?? obj.larmkoordinat_lng;
  if (lat == null || lon == null) return skrivMisslyckad(supabase, objektId, 'objekt saknar koordinat');

  // bbox ~2 km runt centrum.
  const dLat = BBOX_KM / 111;
  const dLon = BBOX_KM / (111 * Math.cos((lat * Math.PI) / 180));
  const bbox = { minLat: lat - dLat, minLon: lon - dLon, maxLat: lat + dLat, maxLon: lon + dLon };
  const query = `[out:json][timeout:15];way(${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon})["highway"];out body geom;`;

  try {
    const { data, instance } = await queryOverpass(query);
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    const antalVagar = elements.filter((e: any) => e?.type === 'way').length;
    // KONTRAKT: lagra elements-formen → checkBoundaryTma (PR 2) läser data.elements oförändrat.
    await supabase.from('objekt_vagdata').upsert(
      { objekt_id: objektId, geometri: { elements }, kalla: 'overpass', status: 'ok', hamtad_at: nu(), bbox, fel: null, updated_at: nu() },
      { onConflict: 'objekt_id' },
    );
    return { status: 'ok', kalla: 'overpass', instans: instance, antalVagar, bbox };
  } catch (e: unknown) {
    // Alla instanser föll → 'misslyckad' (INTE krasch). Cronen retryar vid nästa svep (tålmodigt).
    const fel = e instanceof OverpassAllFailedError ? e.detail : (e instanceof Error ? e.message : 'fetch failed');
    return skrivMisslyckad(supabase, objektId, fel, bbox);
  }
}
