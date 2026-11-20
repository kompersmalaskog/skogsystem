/**
 * Frost på servern: stammarnas virkesläge (dygnet före operatörens mätning, ERA5) läggs på Var sitter felet-underlaget (felet.ts byggFeletUnderlag).
 * Positionen = stammens egen GPS (stem_lat/stem_lon), annars en annan stock i samma kontrollfil. En stam utan tid, position eller arkivvärden (de senaste
 * ca 5 dygnen) får inget läge och räknas i `utanVader` — den gissas aldrig.
 */
import { optiTidUtcMs } from '@/lib/optiTid';
import type { TempObs } from '@/lib/smhi-obs';
import { rutaAv } from './era5';
import type { FeletDia, FeletStock } from './felet';
import { virketsLage, type FrostRad } from './frost';
import { stamNyckel } from './grovlek';

export type FrostStock = FeletStock & { stem_lat: number | null; stem_lon: number | null; tid_ar_utc: boolean | null };
export type HamtaTimmar = (lat: number, lon: number, fran: string, till: string) => Promise<TempObs[] | null>;

const giltig = (lat: number | null, lon: number | null) => lat != null && lon != null && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const dag = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function frostRader(stockar: readonly FrostStock[], dia: readonly FeletDia[], hamta: HamtaTimmar, nuMs = Date.now()): Promise<{ rader: FrostRad[]; utanVader: number }> {
  // Per stam: mättid (operatörens) och position.
  const filPos = new Map<string, { lat: number; lon: number }>();
  for (const s of stockar) if (giltig(s.stem_lat, s.stem_lon) && !filPos.has(s.filnamn)) filPos.set(s.filnamn, { lat: Number(s.stem_lat), lon: Number(s.stem_lon) });
  const stam = new Map<string, { ms: number | null; pos: { lat: number; lon: number } | null }>();
  for (const s of stockar) {
    const k = stamNyckel(s);
    const ms = optiTidUtcMs(s.operator_measurement_date ?? s.harvest_date, s.tid_ar_utc);
    const pos = giltig(s.stem_lat, s.stem_lon) ? { lat: Number(s.stem_lat), lon: Number(s.stem_lon) } : filPos.get(s.filnamn) ?? null;
    const f = stam.get(k);
    if (!f) stam.set(k, { ms, pos });
    else { if (f.ms == null) f.ms = ms; if (!f.pos) f.pos = pos; }
  }

  // En hämtning per ERA5-ruta för hela perioden.
  const rutor = new Map<string, { lat: number; lon: number; min: number; max: number }>();
  for (const v of stam.values()) {
    if (v.ms == null || !v.pos) continue;
    const k = `${rutaAv(v.pos.lat)}|${rutaAv(v.pos.lon)}`;
    const r = rutor.get(k);
    if (!r) rutor.set(k, { lat: v.pos.lat, lon: v.pos.lon, min: v.ms, max: v.ms });
    else { r.min = Math.min(r.min, v.ms); r.max = Math.max(r.max, v.ms); }
  }
  const timmar = new Map<string, TempObs[] | null>();
  for (const [k, r] of rutor) {
    const till = Math.min(r.max, nuMs - 86_400_000);
    if (till < r.min) { timmar.set(k, null); continue; } // för färskt — arkivet har inte dygnet än
    timmar.set(k, await hamta(r.lat, r.lon, dag(r.min - 86_400_000), dag(till)));
  }

  const lage = new Map<string, FrostRad['lage'] | null>();
  for (const [k, v] of stam) {
    if (v.ms == null || !v.pos) { lage.set(k, null); continue; }
    const obs = timmar.get(`${rutaAv(v.pos.lat)}|${rutaAv(v.pos.lon)}`);
    lage.set(k, obs ? virketsLage(obs, v.ms) : null);
  }

  const rader: FrostRad[] = [];
  const utan = new Set<string>();
  for (const d of dia) {
    const l = lage.get(d.stam) ?? null;
    if (l == null) { utan.add(d.stam); continue; }
    rader.push({ stam: d.stam, grupp: d.grupp, n: d.n, summa: d.summa, lage: l });
  }
  return { rader, utanVader: utan.size };
}
