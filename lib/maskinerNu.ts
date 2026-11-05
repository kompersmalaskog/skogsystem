// MASKINERNA PÅ KARTAN (Martin 2026-11-05: "så man ser maskinerna på kartan direkt").
// En prick per maskin där den senast skickade sin position (sista hyttspårspunkten, RPC maskin_senaste_position),
// i maskinens rollfärg med namnet bredvid. Äldre än en timme = grå prick och "· 14:32" / "· igår" efter namnet,
// så en gammal position aldrig ser ut som en färsk. Planeringskartan, körvyn och maskinläget (där visas bara de ANDRA maskinerna).
//
// Rena funktioner + en tunn koppling till kartan. Lagren heter maskin-andra-* (följer med in i körvyn och objektlistan,
// ligger under den egna positionen — lib/lagerOrdning).

import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from './sparStil';
import { FARG } from './design/tokens';

export interface MaskinPosRad {
  maskin_id: string; roll: string | null; objekt_id: string | null; objekt_namn: string | null;
  datum: string | null; lat: number | null; lng: number | null; tid: string | null;
}
export interface MaskinRegister { maskin_id: string; visningsnamn?: string | null; maskin_typ?: string | null; aktiv_till?: string | null }

export interface MaskinNu {
  maskinId: string; namn: string; roll: 'skordare' | 'skotare'; lat: number; lng: number;
  /** Färsk = högst en timme gammal. */
  farsk: boolean;
  /** "" när färsk, annars "14:32", "igår", "3 nov". */
  nar: string;
  objektNamn: string | null;
}

/** Äldre än så här = grå prick med tiden utskriven. */
export const FARSK_MIN = 60;

const SV = 'Europe/Stockholm';
const dag = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: SV });

/** "" (färsk) · "14:32" (idag) · "igår" · "3 nov". Tiden okänd → dagen ur datum. */
export function narText(tid: string | null, datum: string | null, nu: Date): { farsk: boolean; nar: string } {
  const t = tid ? new Date(tid) : null;
  if (t && !Number.isNaN(t.getTime())) {
    const min = (nu.getTime() - t.getTime()) / 60000;
    if (min < FARSK_MIN) return { farsk: true, nar: '' };
    if (dag(t) === dag(nu)) return { farsk: false, nar: t.toLocaleTimeString('sv-SE', { timeZone: SV, hour: '2-digit', minute: '2-digit' }) };
    if (dag(t) === dag(new Date(nu.getTime() - 86_400_000))) return { farsk: false, nar: 'igår' };
    return { farsk: false, nar: t.toLocaleDateString('sv-SE', { timeZone: SV, day: 'numeric', month: 'short' }).replace('.', '') };
  }
  if (datum) {
    if (datum === dag(nu)) return { farsk: false, nar: 'idag' };
    const d = new Date(`${datum}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return { farsk: false, nar: d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '') };
  }
  return { farsk: false, nar: 'tid okänd' };
}

const rollAv = (rad: MaskinPosRad, reg?: MaskinRegister): 'skordare' | 'skotare' | null => {
  const t = (reg?.maskin_typ ?? '').toLowerCase();
  if (t === 'harvester') return 'skordare';
  if (t === 'forwarder') return 'skotare';
  return rad.roll === 'skordare' || rad.roll === 'skotare' ? rad.roll : null;
};

/**
 * Raderna → prickarna. Bort: utan position, avslutade maskiner (aktiv_till före idag), och den egna maskinen (`utan`, maskinläget
 * — den har redan sin egen prick). Namnet ur registret (visningsnamn: Giant, H8E -26, Wisent …) — aldrig ett maskin-id; saknas namnet står "Okänd maskin".
 */
export function byggMaskinerNu(rader: MaskinPosRad[], register: MaskinRegister[], nu: Date, utan: string | null = null): MaskinNu[] {
  const reg = new Map(register.map((r) => [r.maskin_id, r]));
  const ut: MaskinNu[] = [];
  for (const r of rader) {
    if (!r.maskin_id || r.maskin_id === utan) continue;
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number' || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    const m = reg.get(r.maskin_id);
    // Avslutad maskin: aktiv_till före idag (sista dagen räknas som aktiv, som i maskinvyns sidolista).
    if (m?.aktiv_till && m.aktiv_till < dag(nu)) continue;
    const roll = rollAv(r, m);
    if (!roll) continue;
    const { farsk, nar } = narText(r.tid, r.datum, nu);
    ut.push({ maskinId: r.maskin_id, namn: (m?.visningsnamn ?? '').trim() || 'Okänd maskin', roll, lat: r.lat, lng: r.lng, farsk, nar, objektNamn: r.objekt_namn });
  }
  return ut.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}

/** Texten bredvid pricken: "Giant" (färsk) eller "Giant · 14:32". */
export const etikett = (m: MaskinNu) => (m.farsk ? m.namn : `${m.namn} · ${m.nar}`);

/** Vad ett tryck på pricken säger: "Giant · Bondeskog AU 2026" / "Giant · senast 14:32 · Bondeskog AU 2026". */
export function tryckText(m: MaskinNu): string {
  return [m.namn, m.farsk ? null : `senast ${m.nar}`, m.objektNamn].filter(Boolean).join(' · ');
}

export const MASKINER_NU_KALLA = 'maskin-andra-source';
export const MASKINER_NU_LAGER = ['maskin-andra-ring', 'maskin-andra-prick', 'maskin-andra-namn'] as const;
export const MASKINER_NU_TRAFF = 'maskin-andra-ring';

export function maskinerNuGeoJson(maskiner: MaskinNu[]) {
  return {
    type: 'FeatureCollection' as const,
    features: maskiner.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
      properties: {
        maskinId: m.maskinId,
        etikett: etikett(m),
        farg: m.farsk ? (m.roll === 'skordare' ? ROLLFARG_SKORDARE : ROLLFARG_SKOTARE) : FARG.text2,
        farsk: m.farsk,
      },
    })),
  };
}

/** Lägger källan och lagren om de saknas och sätter datan. Tål att kartan inte är klar (gör då ingenting). */
export function ritaMaskinerNu(map: any, maskiner: MaskinNu[]): void {
  if (!map || typeof map.getSource !== 'function') return;
  try {
    const data = maskinerNuGeoJson(maskiner);
    const src = map.getSource(MASKINER_NU_KALLA);
    if (src) { src.setData(data); return; }
    map.addSource(MASKINER_NU_KALLA, { type: 'geojson', data });
    // Osynlig träffyta 44 px (22 px radie) — samma som symbolerna.
    map.addLayer({ id: 'maskin-andra-ring', type: 'circle', source: MASKINER_NU_KALLA, paint: { 'circle-radius': 22, 'circle-opacity': 0 } });
    map.addLayer({
      id: 'maskin-andra-prick', type: 'circle', source: MASKINER_NU_KALLA,
      paint: { 'circle-radius': 8, 'circle-color': ['get', 'farg'], 'circle-stroke-width': 3, 'circle-stroke-color': FARG.text, 'circle-opacity': 1 },
    });
    map.addLayer({
      id: 'maskin-andra-namn', type: 'symbol', source: MASKINER_NU_KALLA,
      layout: { 'text-field': ['get', 'etikett'], 'text-size': 14, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Open Sans Semibold'] },
      paint: { 'text-color': FARG.text, 'text-halo-color': FARG.bg, 'text-halo-width': 2 },
    });
  } catch (e) { console.error('[MaskinerNu] kunde inte rita:', e); }
}
