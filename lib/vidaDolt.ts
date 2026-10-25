// VIDAS LINJER KAN SUDDAS — men Vidas data ändras aldrig (Martin 2026-10-25). Det som suddas sparas som DOLT per objekt och linje (tabellen objekt_linje_dolt, migration
// 20261025170000) och läggs över Vidas geometri när kartan ritas. Sträckan anges i METER längs Vidas ursprungliga linje och linjen pekas ut med den stabila nyckeln
// (`linje:<hash>`, lib/vidaNycklar) — därför överlever det dolda en ny import från Vida (objekt_geometri skrivs över, det här rörs inte) och går alltid att ta tillbaka.
//
// Det som INTE går att sudda: traktgränsen (den ändras med "Justera gräns") och Vidas KRAFTLEDNING — larmen läser den ouppklippta geometrin, och en ledning som försvinner ur
// kartan men fortfarande larmar vore värre än en som syns.

import { delstracka, restBitar, slaIhopIntervall, langdM, narmastaPunkt, type Intervall, type LngLat } from './linjeRedigering';
import { vidaLinjeKort } from './symboler';

/** nyckel → dolda sträckor (meter längs Vidas linje, sorterade, utan överlapp). */
export type DoltPerLinje = Record<string, Intervall[]>;

export interface VidaLinje {
  nyckel: string;
  coords: LngLat[];
  /** Vidas kraftledning: syns alltid, går inte att sudda. */
  skyddad: boolean;
  feature: any;
}

const arLinjeFeature = (f: any): boolean => String(f?.properties?._typ ?? '') === 'linje' && f?.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates);

/** Vidas redigerbara linjer ur objektets geometri (kräver `_nyckel`, som `medVidaNycklar` sätter). MultiLineString lämnas som den är. */
export function vidaLinjer(fc: { features?: any[] } | null | undefined): VidaLinje[] {
  const ut: VidaLinje[] = [];
  for (const f of fc?.features ?? []) {
    if (!arLinjeFeature(f)) continue;
    const nyckel = f.properties?._nyckel;
    if (typeof nyckel !== 'string' || !nyckel) continue;
    const coords = (f.geometry.coordinates as any[]).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]] as LngLat);
    if (coords.length < 2) continue;
    ut.push({ nyckel, coords, skyddad: vidaLinjeKort(f.properties?.FLBESKR).slag === 'kraftledning', feature: f });
  }
  return ut;
}

/** Städar en lista: sorterad, utan överlapp, klämd till linjens längd. */
export function stadaDolt(iv: readonly Intervall[], langd: number): Intervall[] {
  return slaIhopIntervall(iv.map(([a, b]) => [Math.max(0, a), Math.min(langd, b)] as Intervall), 0.5);
}

/** Lägger till dolda sträckor. En skyddad linje (kraftledning) eller en okänd nyckel ändras aldrig. */
export function doljMer(dolt: DoltPerLinje, linjer: readonly VidaLinje[], nyckel: string, nya: readonly Intervall[]): DoltPerLinje {
  const l = linjer.find((x) => x.nyckel === nyckel);
  if (!l || l.skyddad || nya.length === 0) return dolt;
  const ihop = stadaDolt([...(dolt[nyckel] ?? []), ...nya], langdM(l.coords));
  return ihop.length ? { ...dolt, [nyckel]: ihop } : dolt;
}

/** Tar tillbaka allt dolt på en linje ("Visa Vidas original"). */
export function visaOriginal(dolt: DoltPerLinje, nyckel: string): DoltPerLinje {
  if (!dolt[nyckel]) return dolt;
  const { [nyckel]: _bort, ...rest } = dolt;
  return rest;
}

/** Tar tillbaka EN dold sträcka (tryck på spöket). */
export function visaStracka(dolt: DoltPerLinje, nyckel: string, index: number): DoltPerLinje {
  const iv = dolt[nyckel];
  if (!iv || !iv[index]) return dolt;
  const kvar = iv.filter((_, i) => i !== index);
  if (kvar.length === 0) return visaOriginal(dolt, nyckel);
  return { ...dolt, [nyckel]: kvar };
}

/** Ändrade rader mellan två lägen: nycklar vars dolda sträckor skiljer (för att skriva bara det som ändrats). */
export function andradeNycklar(fore: DoltPerLinje, efter: DoltPerLinje): string[] {
  const alla = new Set([...Object.keys(fore), ...Object.keys(efter)]);
  return [...alla].filter((n) => JSON.stringify(fore[n] ?? []) !== JSON.stringify(efter[n] ?? []));
}

/** De synliga delarna av en Vida-linje (det som är kvar när det dolda tagits bort). */
export function synligaDelar(l: VidaLinje, dolt: DoltPerLinje): LngLat[][] {
  const iv = dolt[l.nyckel];
  if (!iv || iv.length === 0) return [l.coords];
  return restBitar(l.coords, iv, 0.5).map((b) => b.coords);
}

const kopia = (f: any, geometry: any, extra: Record<string, unknown> = {}) => ({ ...f, geometry, properties: { ...(f.properties ?? {}), ...extra } });

/**
 * Kartans version av Vidas geometri: varje linje med dolda sträckor ersätts av sina synliga delar (samma egenskaper, samma `_nyckel`). Allt annat är oförändrat och
 * indatan rörs aldrig. Utan dolt returneras SAMMA objekt (ingen onödig ritning).
 */
export function klippVidaGeometri<T extends { features?: any[] }>(fc: T | null | undefined, dolt: DoltPerLinje): T | null | undefined {
  if (!fc || Object.keys(dolt).length === 0) return fc;
  const per = new Map(vidaLinjer(fc).map((l) => [l.feature, l]));
  let andrat = false;
  const features = (fc.features ?? []).flatMap((f) => {
    const l = per.get(f);
    if (!l || l.skyddad || !dolt[l.nyckel]?.length) return [f];
    andrat = true;
    return synligaDelar(l, dolt).map((c) => kopia(f, { type: 'LineString', coordinates: c }));
  });
  return andrat ? { ...fc, features } : fc;
}

/** Spökena: de dolda sträckorna som prickade linjer, bara medan man redigerar linjer. `index` = vilken dold sträcka (för att ta tillbaka just den). */
export function doltSpoken(fc: { features?: any[] } | null | undefined, dolt: DoltPerLinje): { type: 'FeatureCollection'; features: any[] } {
  const features: any[] = [];
  for (const l of vidaLinjer(fc)) {
    const iv = dolt[l.nyckel];
    if (l.skyddad || !iv) continue;
    iv.forEach(([a, b], index) => {
      features.push({ type: 'Feature', properties: { _dolt: 1, _nyckel: l.nyckel, _index: index }, geometry: { type: 'LineString', coordinates: delstracka(l.coords, a, b) } });
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Närmaste dolda sträcka (spöke) inom `radieM` från `p` — för att kunna ta tillbaka den med ett tryck. */
export function narmasteSpoke(fc: { features?: any[] } | null | undefined, dolt: DoltPerLinje, p: LngLat, radieM: number): { nyckel: string; index: number; avstand: number } | null {
  let bast: { nyckel: string; index: number; avstand: number } | null = null;
  for (const f of doltSpoken(fc, dolt).features) {
    const n = narmastaPunkt(f.geometry.coordinates as LngLat[], p);
    if (n && n.avstand <= radieM && (!bast || n.avstand < bast.avstand)) bast = { nyckel: f.properties._nyckel, index: f.properties._index, avstand: n.avstand };
  }
  return bast;
}

/** Den synliga delen (meter längs ORIGINALET) som ligger närmast `p` — så man suddar det man ser, aldrig något som redan är dolt. */
export function narmasteSynligaVidaLinje(linjer: readonly VidaLinje[], dolt: DoltPerLinje, p: LngLat, radieM: number): { nyckel: string; avstand: number } | null {
  let bast: { nyckel: string; avstand: number } | null = null;
  for (const l of linjer) {
    if (l.skyddad) continue;
    for (const del of synligaDelar(l, dolt)) {
      const n = narmastaPunkt(del, p);
      if (n && n.avstand <= radieM && (!bast || n.avstand < bast.avstand)) bast = { nyckel: l.nyckel, avstand: n.avstand };
    }
  }
  return bast;
}

// ── Lagring: tabellen objekt_linje_dolt, med enhetens kopia som reserv (migrationen kan vara ej körd, nätet kan saknas) ──────────────────────────
const lokalNyckel = (objektId: string) => `linje_dolt_v1:${objektId}`;

export function lasLokaltDolt(objektId: string): DoltPerLinje {
  try {
    const t = typeof localStorage === 'undefined' ? null : localStorage.getItem(lokalNyckel(objektId));
    const o = t ? JSON.parse(t) : null;
    return o && typeof o === 'object' ? rensaDolt(o) : {};
  } catch { return {}; }
}

export function sparaLokaltDolt(objektId: string, dolt: DoltPerLinje): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(lokalNyckel(objektId), JSON.stringify(dolt)); } catch { /* privat läge */ }
}

/** Godtar bara välformade intervall (en trasig rad får aldrig dölja något). */
export function rensaDolt(o: unknown): DoltPerLinje {
  const ut: DoltPerLinje = {};
  if (!o || typeof o !== 'object') return ut;
  for (const [nyckel, v] of Object.entries(o as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const iv = v.filter((x): x is Intervall => Array.isArray(x) && x.length === 2 && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] > x[0] && x[0] >= 0);
    if (iv.length) ut[nyckel] = slaIhopIntervall(iv);
  }
  return ut;
}

interface DoltDb {
  from: (t: string) => any;
}

export type DoltLasning = { dolt: DoltPerLinje; kalla: 'server' | 'enhet' };

/** Läser det dolda för ett objekt. Går tabellen inte att läsa (saknas, nät, RLS) gäller enhetens kopia — aldrig ett tomt "inget dolt" som ser ut som ett svar. */
export async function lasDolt(db: DoltDb, objektId: string): Promise<DoltLasning> {
  try {
    const { data, error } = await db.from('objekt_linje_dolt').select('nyckel, intervall').eq('objekt_id', objektId);
    if (error || !Array.isArray(data)) return { dolt: lasLokaltDolt(objektId), kalla: 'enhet' };
    const dolt = rensaDolt(Object.fromEntries(data.map((r: any) => [r.nyckel, r.intervall])));
    sparaLokaltDolt(objektId, dolt);
    return { dolt, kalla: 'server' };
  } catch { return { dolt: lasLokaltDolt(objektId), kalla: 'enhet' }; }
}

/** Skriver bara det som ändrats. Faller serverns skrivning är enhetens kopia kvar (och används tills tabellen finns). Returnerar om servern fick det. */
export async function skrivDolt(db: DoltDb, objektId: string, fore: DoltPerLinje, efter: DoltPerLinje): Promise<boolean> {
  sparaLokaltDolt(objektId, efter);
  let ok = true;
  for (const nyckel of andradeNycklar(fore, efter)) {
    try {
      const iv = efter[nyckel];
      const q = iv?.length
        ? await db.from('objekt_linje_dolt').upsert({ objekt_id: objektId, nyckel, intervall: iv }, { onConflict: 'objekt_id,nyckel' })
        : await db.from('objekt_linje_dolt').delete().eq('objekt_id', objektId).eq('nyckel', nyckel);
      if (q?.error) ok = false;
    } catch { ok = false; }
  }
  return ok;
}
