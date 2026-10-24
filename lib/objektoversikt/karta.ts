// Objektöversiktens karta: det som räknas och skrivs, utan karta och databas.
//
//  - högarna (skördarens stammar klustrade, lib/produktionshogar — samma som planeringsvyn) som features,
//  - "Hur mycket avverkades här?": stammarna inne i ett ritat område → m³fub, träd, trädslag, ha,
//  - maskinernas senaste position och tiden i ord,
//  - skotat i området (skotarens lass och var den lastade),
//  - det som står på en markering (namn, kommentarer, foto).
//
// Volymen är stammarnas total_volym (m³sub = m³fub, detalj_stam). Stammar utan position kan inte ligga i ett område
// och räknas inte — det sägs (`utanPosition`), aldrig tyst.

import { klustraStammar, type HogStam } from '@/lib/produktionshogar';
import { tradslagFarg, tradslagLabel } from '@/lib/tradslag';
import { ringAreaM2 } from '@/lib/geoMat';
import { SYMBOL_FORKLARING, linjeKort, ytaForklaring } from '@/lib/symboler';
import { forfattarText, markerNyckel } from '@/lib/kartkommentar';
import { markeringNamn } from '@/app/oversikt/markeringar';

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

// --- Skotat i området --------------------------------------------------------------------------------------------------
//
// Skotaren rapporterar VAD den lossade, inte VAR den lastade. Var den lastade läses ur dess körspår mellan två lossningar:
// appens lass bär spåret själva (skotar_lass.spar), Opti-lassen får skotarens hyttspår mellan förra lossningen och den här.
// Lassets volym delas på området efter hur stor del av spårets punkter INNE I TRAKTEN som ligger i området; punkterna
// närmast lossningen (avlägget) räknas inte, där kör maskinen bara. Det är en uppskattning — därför "ca" överallt.
//
// Samma regel som skotarläget mot dubbelräkning (lib/skotarLass/opti): ett Opti-lass räknas bara för tiden INNAN
// maskinen började rapportera lass i appen.

export type SkotarLass = {
  maskin: string;
  /** Lossningen (verkligt UTC-ögonblick), null = okänd. */
  tidMs: number | null;
  /** Maskinens lokala dag. */
  datum: string;
  m3: number;
  /** true = rapporterat i appen, false = Opti-filen. */
  app: boolean;
  /** Appens eget spår sedan förra lossningen (null för Opti-lass). */
  spar: LngLat[] | null;
};

/** En skotares körspår med tider (hyttspar), för att hitta Opti-lassens väg. */
export type SkotarSpar = { maskin: string; punkter: { lng: number; lat: number; ms: number }[] };

/** Punkter så här nära lossningen räknas inte: där kör maskinen till avlägget. */
export const AVLAGG_RADIE_M = 50;
/** Det första lasset i en följd har ingen förra lossning: spåret så här lång tid bakåt. */
export const FORSTA_LASS_MS = 3 * 3600_000;

const sthlmDag = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: SV });

/** Avstånd i meter (litet område: plan approximation räcker). */
export function avstandM(a: LngLat, b: LngLat): number {
  const ky = 111_320;
  const kx = ky * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky);
}

/** Lassen som räknas: alla appens, och Opti-lassen före maskinens första app-lass. */
export function raknadeSkotarLass(lass: readonly SkotarLass[]): SkotarLass[] {
  const start = new Map<string, number>();
  for (const l of lass) if (l.app && l.tidMs != null) start.set(l.maskin, Math.min(start.get(l.maskin) ?? Infinity, l.tidMs));
  return lass.filter(l => {
    if (l.app) return true;
    const s = start.get(l.maskin);
    if (s == null) return true;
    if (l.tidMs != null) return l.tidMs < s;
    return l.datum < sthlmDag(s);
  });
}

/** Opti-lassens väg: skotarens punkter mellan förra lossningen (samma maskin) och den här. */
export function medOptiSpar(lass: readonly SkotarLass[], spar: readonly SkotarSpar[]): SkotarLass[] {
  const perMaskin = new Map<string, { lng: number; lat: number; ms: number }[]>();
  for (const s of spar) perMaskin.set(s.maskin, [...(perMaskin.get(s.maskin) ?? []), ...s.punkter]);
  const tider = new Map<string, number[]>();
  for (const l of lass) if (l.tidMs != null) tider.set(l.maskin, [...(tider.get(l.maskin) ?? []), l.tidMs]);
  for (const t of tider.values()) t.sort((a, b) => a - b);
  return lass.map(l => {
    if (l.app || l.tidMs == null) return l;
    const t = tider.get(l.maskin) ?? [];
    const forra = t.filter(x => x < l.tidMs!).pop();
    const fran = forra ?? l.tidMs - FORSTA_LASS_MS;
    const p = (perMaskin.get(l.maskin) ?? []).filter(q => q.ms > fran && q.ms <= l.tidMs!).sort((a, b) => a.ms - b.ms);
    return { ...l, spar: p.length > 0 ? p.map(q => [q.lng, q.lat] as LngLat) : null };
  });
}

export type Skotat = {
  /** Skotat i området, m³fub (avrundat som skördat). */
  m3: number;
  /** Lass som inte gick att placera (inget spår i trakten). */
  ejPlacerade: number;
  ejPlaceradM3: number;
};

/** Hur mycket som skotats ur området. null = inget område (under tre hörn) eller inga lass alls. */
export function skotatIOmradet(lass: readonly SkotarLass[], ring: readonly LngLat[], trakt: readonly LngLat[][]): Skotat | null {
  if (ring.length < 3 || lass.length === 0) return null;
  let m3 = 0, ejPlacerade = 0, ejPlaceradM3 = 0;
  for (const l of lass) {
    if (!(l.m3 > 0)) continue;
    const spar = l.spar ?? [];
    const slut = spar[spar.length - 1];
    const lastning = spar.filter(p => !slut || avstandM(p, slut) > AVLAGG_RADIE_M)
      .filter(p => trakt.length === 0 || trakt.some(r => inneIRing(p[0], p[1], r)));
    if (lastning.length === 0) { ejPlacerade++; ejPlaceradM3 += l.m3; continue; }
    const inne = lastning.filter(p => inneIRing(p[0], p[1], ring)).length;
    m3 += l.m3 * inne / lastning.length;
  }
  return { m3: rundaM3(m3, m3), ejPlacerade, ejPlaceradM3: rundaM3(ejPlaceradM3, ejPlaceradM3) };
}

/** Raderna under "Skördat": skotat och kvar, i ord. Kvar bara när alla lass gick att placera. */
export function skotatRader(skordatM3: number, s: Skotat | null): { skotat: string; kvar: string | null; not: string | null } | null {
  if (!s) return null;
  const skotat = s.m3 === 0 && s.ejPlacerade > 0 ? 'går inte att räkna' : `ca ${tal(s.m3)} m³fub`;
  if (s.ejPlacerade > 0) {
    const lass = s.ejPlacerade === 1 ? '1 lass' : `${tal(s.ejPlacerade)} lass`;
    return { skotat, kvar: null, not: `${lass} (${tal(s.ejPlaceradM3)} m³fub) saknar körspår – därför visas inte vad som är kvar.` };
  }
  const kvar = Math.max(0, rundaM3(skordatM3 - s.m3, skordatM3));
  return { skotat, kvar: `ca ${tal(kvar)} m³fub`, not: null };
}

// --- Tryck på en markering ---------------------------------------------------------------------------------------------

export type MarkKommentar = { forfattare: string | null; text: string };
export type MarkKort = {
  namn: string;
  /** Vad markeringen betyder, en mening (samma text som teckenförklaringen). */
  forklaring: string;
  kommentarer: MarkKommentar[];
  foto: { photoPath: string | null; photoData: string | null; photoTs: number | null } | null;
};
export type KartKommentarRad = { yta_nyckel: string; text: string; namn: string | null; skapad_at: string };

/** Det som står på en markering: namnet, kommentarerna (äldst först, den gamla kommentaren först av alla) och fotot. */
export function markeringKort(data: unknown, rader: readonly KartKommentarRad[], nu: Date = new Date()): MarkKort {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  let forklaring = '';
  if (str(d.type)) forklaring = SYMBOL_FORKLARING[str(d.type)] ?? '';
  else if (str(d.zoneType)) forklaring = ytaForklaring(str(d.zoneType))?.forklaring ?? '';
  else if (str(d.lineType)) forklaring = linjeKort(str(d.lineType)).forklaring;
  const kommentarer: MarkKommentar[] = [];
  const aldre = str(d.comment).trim();
  if (aldre) kommentarer.push({ forfattare: null, text: aldre });
  const id = d.id;
  if (id != null) {
    const nyckel = markerNyckel(String(id));
    for (const r of [...rader].filter(r => r.yta_nyckel === nyckel && r.text.trim()).sort((a, b) => a.skapad_at.localeCompare(b.skapad_at))) {
      kommentarer.push({ forfattare: forfattarText(r.namn, r.skapad_at, nu), text: r.text.trim() });
    }
  }
  const photoPath = str(d.photoPath) || null;
  const photoData = str(d.photoData) || null;
  return {
    namn: markeringNamn(d),
    forklaring,
    kommentarer,
    foto: photoPath || photoData ? { photoPath, photoData, photoTs: typeof d.photoTs === 'number' ? d.photoTs : null } : null,
  };
}

// --- Hela trakten ------------------------------------------------------------------------------------------------------

export type TraktSiffror = { skordat: string; skotat: string | null; kvar: string | null };

/**
 * Siffrorna under kartan, utan att man ritar: skördat (stammarna med position), skotat (lassen som räknas, oavsett var
 * de lastades) och kvar. null = går inte att säga (skotarens lass kunde inte läsas). Inga lass = "inga lass än".
 */
export function traktSiffror(stammar: readonly KartStam[], lass: readonly SkotarLass[] | null): TraktSiffror {
  const s = stammar.reduce((a, x) => a + (x.volym || 0), 0);
  const skordatM3 = rundaM3(s, s);
  const skordat = `${tal(skordatM3)} m³fub`;
  if (lass == null) return { skordat, skotat: null, kvar: null };
  const raknade = lass.filter(l => l.m3 > 0);
  if (raknade.length === 0) return { skordat, skotat: 'inga lass än', kvar: null };
  const k = raknade.reduce((a, l) => a + l.m3, 0);
  const skotatM3 = rundaM3(k, k);
  const kvarM3 = Math.max(0, rundaM3(skordatM3 - skotatM3, skordatM3));
  return { skordat, skotat: `${tal(skotatM3)} m³fub`, kvar: `ca ${tal(kvarM3)} m³fub` };
}
