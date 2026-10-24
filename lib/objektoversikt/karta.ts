// Objektöversiktens karta: det som räknas och skrivs, utan karta och databas.
//
//  - högarna (skördarens stammar klustrade, lib/produktionshogar — samma som planeringsvyn) som features,
//  - "Hur mycket avverkades här?": stammarna inne i ett ritat område → m³fub, träd, trädslag, ha,
//  - maskinernas senaste position och tiden i ord.
//
// Volymen är stammarnas total_volym (m³sub = m³fub, detalj_stam). Stammar utan position kan inte ligga i ett område
// och räknas inte — det sägs (`utanPosition`), aldrig tyst.

import { klustraStammar, type HogStam } from '@/lib/produktionshogar';
import { tradslagFarg, tradslagLabel } from '@/lib/tradslag';
import { ringAreaM2 } from '@/lib/geoMat';

export type LngLat = [number, number];

export type KartStam = { lat: number; lng: number; volym: number; tradslag: string };

/** Ray casting. Ringen behöver inte vara sluten. */
export function inneIRing(lng: number, lat: number, ring: readonly LngLat[]): boolean {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}

export type OmradeTradslag = { namn: string; m3: number; farg: string };

export type Omrade = {
  /** Summan av de avrundade trädslagen — går att räkna ihop. */
  m3: number;
  trad: number;
  ha: number;
  tradslag: OmradeTradslag[];
};

/** Avrundning som visas: hela m³, en decimal under 10 m³. */
export function rundaM3(v: number, total: number): number {
  return total < 10 ? Math.round(v * 10) / 10 : Math.round(v);
}

/** Det skördaren tog ut inne i ett ritat område. null = området har under tre hörn. */
export function iOmradet(stammar: readonly KartStam[], ring: readonly LngLat[]): Omrade | null {
  if (ring.length < 3) return null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [x, y] of ring) {
    if (x < minLng) minLng = x; if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
  }
  const per = new Map<string, number>();
  let trad = 0;
  let rå = 0;
  for (const s of stammar) {
    if (s.lng < minLng || s.lng > maxLng || s.lat < minLat || s.lat > maxLat) continue;
    if (!inneIRing(s.lng, s.lat, ring)) continue;
    trad++;
    const namn = tradslagLabel(s.tradslag);
    per.set(namn, (per.get(namn) ?? 0) + (s.volym || 0));
    rå += s.volym || 0;
  }
  const tradslag = [...per.entries()]
    .map(([namn, v], i) => ({ namn, m3: rundaM3(v, rå), farg: tradslagFarg(namn, i) }))
    .filter(t => t.m3 > 0)
    .sort((a, b) => b.m3 - a.m3);
  const m3 = Math.round(tradslag.reduce((s, t) => s + t.m3, 0) * 10) / 10;
  const ha = Math.round((ringAreaM2([...ring]) / 10_000) * 10) / 10;
  return { m3, trad, ha, tradslag };
}

const tal = (n: number) => n.toLocaleString('sv-SE');

/** "312 m³fub" — svaret i stort. */
export function omradeSvar(o: Omrade): string {
  return `${tal(o.m3)} m³fub`;
}

/** "1 240 träd · 2,1 ha" — raden under. */
export function omradeUnder(o: Omrade): string {
  const ha = o.ha.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${tal(o.trad)} träd · ${ha} ha`;
}

export type Ruta = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Rutan runt alla punkter (null = inga). */
export function rutaRunt(punkter: Iterable<LngLat>): Ruta | null {
  let r: Ruta | null = null;
  for (const [x, y] of punkter) {
    if (!r) r = { minLng: x, maxLng: x, minLat: y, maxLat: y };
    else {
      if (x < r.minLng) r.minLng = x; if (x > r.maxLng) r.maxLng = x;
      if (y < r.minLat) r.minLat = y; if (y > r.maxLat) r.maxLat = y;
    }
  }
  return r;
}

/** Ligger punkten i rutan eller högst `marginalM` utanför? */
export function inomRuta(lng: number, lat: number, r: Ruta, marginalM = 300): boolean {
  const dLat = marginalM / 111_320;
  const dLng = marginalM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return lng >= r.minLng - dLng && lng <= r.maxLng + dLng && lat >= r.minLat - dLat && lat <= r.maxLat + dLat;
}

// ---------------------------------------------------------------------------
// Högarna
// ---------------------------------------------------------------------------

export type HogFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: LngLat };
  properties: { volym: number; trad: number; tradslag: string; farg: string };
};

/** Högarna som kartfeatures: dominant trädslag avgör färgen (samma palett som resten av appen). */
export function hogFeatures(stammar: readonly KartStam[]): HogFeature[] {
  const hs: HogStam[] = stammar.map(s => ({ lat: s.lat, lng: s.lng, total_volym: s.volym, tradslag: tradslagLabel(s.tradslag) }));
  return klustraStammar(hs)
    .filter(k => k.volym > 0.01)
    .map(k => {
      const dom = Object.entries(k.tradslagCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Okänt trädslag';
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [k.lng, k.lat] as LngLat },
        properties: { volym: Math.round(k.volym * 10) / 10, trad: k.n, tradslag: dom, farg: tradslagFarg(dom) },
      };
    });
}

/** "Gran · 4,2 m³fub · 12 träd" — när man trycker på en hög. */
export function hogText(p: { volym: number; trad: number; tradslag: string }): string {
  const v = p.volym.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
  return `${p.tradslag} · ${v} m³fub · ${tal(p.trad)} träd`;
}

// ---------------------------------------------------------------------------
// Maskinerna nu
// ---------------------------------------------------------------------------

export type HyttPunkt = { lat?: unknown; lng?: unknown; tid?: unknown };

/** Sista punkten med position i ett hyttspårs points. Tiden följer med om den finns. */
export function sistaPunkt(points: unknown): { lat: number; lng: number; tid: string | null } | null {
  if (!Array.isArray(points)) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i] as HyttPunkt;
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
      return { lat: p.lat, lng: p.lng, tid: typeof p.tid === 'string' ? p.tid : null };
    }
  }
  return null;
}

const SV = 'Europe/Stockholm';
const dag = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: SV });
const klocka = (d: Date) => d.toLocaleTimeString('sv-SE', { timeZone: SV, hour: '2-digit', minute: '2-digit' });

/** Gränsen för "Här nu": positionen är högst så här gammal. */
export const NU_MIN = 20;

/**
 * Tiden i ord: "nu", "kl 14:32" (idag), "igår 14:32", "21 okt". tid saknas → dagen ur `datum` ("21 okt"), annars "tid okänd".
 */
export function senastText(tid: string | null, datum: string | null, nu: Date): string {
  if (tid) {
    const t = new Date(tid);
    if (!Number.isNaN(t.getTime())) {
      const min = (nu.getTime() - t.getTime()) / 60000;
      if (min >= 0 && min < NU_MIN) return 'nu';
      if (dag(t) === dag(nu)) return `kl ${klocka(t)}`;
      const igar = new Date(nu.getTime() - 86_400_000);
      if (dag(t) === dag(igar)) return `igår ${klocka(t)}`;
      return t.toLocaleDateString('sv-SE', { timeZone: SV, day: 'numeric', month: 'short' }).replace('.', '');
    }
  }
  if (datum) {
    const d = new Date(`${datum}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      if (datum === dag(nu)) return 'idag';
      return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
    }
  }
  return 'tid okänd';
}

export type MaskinPlats = {
  maskin_id: string;
  namn: string;
  roll: 'skordare' | 'skotare';
  lat: number;
  lng: number;
  /** "nu", "kl 14:32", "igår 14:32", "21 okt". */
  nar: string;
  /** Står inom trakten (eller 300 m från den)? Avgör "här" eller "på annan plats". */
  har: boolean;
};

/** "Giant · här nu", "Wisent · här kl 14:32", "Elefant 26 · annan plats igår 16:10". */
export function maskinRad(m: MaskinPlats): { titel: string; under: string } {
  const plats = m.har ? 'Här' : 'På annan plats';
  return { titel: m.namn, under: m.nar === 'nu' ? `${plats} nu` : `${plats} · senast ${m.nar}` };
}
