// AVVIKELSE SOM BEVIS (Martin 2026-11-04): alla med inloggning — planerare, skördare, skotare — tar ett foto av en skada på trakten
// (överkörd stenmur, körskador, skadad hänsyn) så att det är dokumenterat VEM som såg den, NÄR och VAR. "Ärlighet lönar sig alltid."
//
// Den här filen är ren logik: typerna och deras ord, förvalet ur det som ligger på kartan, och kvittots mening. Databasen
// (migration *_avvikelse_bevis.sql) sätter fotografen och tiden, låser raden och fotot, och räknar SJÄLV ut om våra maskiners
// körspår gick vid platsen före kortet (`korspar_fore`). Appen visar bara det — och påstår aldrig "fanns innan vi kom":
// inget spår betyder att appen inte såg någon maskin där, inte att ingen körde där.

import type { LarmObjekt } from './larm/larm';
import { linjeObjekt, symbolObjekt, vidaObjekt, ytaObjekt } from './larm/objekt';

export const AVVIKELSE_TYPER = ['korskada', 'stenmur', 'hansyn', 'fornlamning', 'annat'] as const;
export type AvvikelseTyp = (typeof AVVIKELSE_TYPER)[number];

export const AVVIKELSE_NAMN: Readonly<Record<AvvikelseTyp, string>> = {
  korskada: 'Körskada',
  stenmur: 'Stenmur',
  hansyn: 'Hänsyn',
  fornlamning: 'Fornlämning',
  annat: 'Annat',
};

export const arAvvikelseTyp = (v: unknown): v is AvvikelseTyp => typeof v === 'string' && (AVVIKELSE_TYPER as readonly string[]).includes(v);

/** Avstånd inom vilket ett objekt på kartan föreslår typen. */
export const FORVAL_RADIE_M = 10;
/** Radien servern letar körspår inom (samma tal som SQL-funktionens standard). */
export const KORSPAR_RADIE_M = 15;

/** Vad på kartan som pekar på vilken typ. Okänt = ingen förval (Körskada gäller). */
export function typForObjekt(o: Pick<LarmObjekt, 'kalla' | 'typ' | 'grupp'>): AvvikelseTyp | null {
  const t = o.typ ?? '';
  if (o.kalla === 'linje' && t === 'stonewall') return 'stenmur';
  if (t === 'fornlamning' || t === 'raa_yta' || t === 'raa_punkt' || t === 'culturemonument' || t === 'culturestump' || t === 'culture') return 'fornlamning';
  if (t === 'protected' || t === 'hansynsyta' || t === 'nyckelbiotop') return 'hansyn';
  if (o.kalla === 'symbol' && o.grupp === 'natur') return 'hansyn';   // evighetsträd, högstubbe, naturhörna
  return null;
}

/**
 * Förvald typ: det närmaste objektet inom 10 m som pekar på en typ (en yta räknas när man står i den). Inget sådant → Körskada,
 * det vanligaste. Det är bara ett förval — fotografen trycker på en annan om det är fel.
 */
export function forvalTyp(objekt: ReadonlyArray<Pick<LarmObjekt, 'kalla' | 'typ' | 'grupp' | 'avstandM' | 'inne'>>): AvvikelseTyp {
  let bast: { typ: AvvikelseTyp; d: number } | null = null;
  for (const o of objekt) {
    const typ = typForObjekt(o);
    if (!typ) continue;
    const d = o.avstandM != null ? o.avstandM : o.inne ? 0 : Infinity;
    if (!(d <= FORVAL_RADIE_M)) continue;
    if (!bast || d < bast.d) bast = { typ, d };
  }
  return bast?.typ ?? 'korskada';
}

/** Det servern räknade ut och lagrade på raden (`korspar_fore`). */
export interface KorsparFore {
  radie_m?: number;
  kontrollerat_fore?: string;
  spar_pa_trakten_fore?: number;
  traffar?: { roll: string; maskin_id: string; forsta: string; senaste: string }[];
}

const TID = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "2 nov 14:30" i svensk tid. */
export function avvikelseTid(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return TID.format(d).replace('.', '').replace(/\s+/g, ' ').trim();
}

const rollOrd = (roll: string) => (roll === 'skotare' ? 'Skotaren' : roll === 'skordare' ? 'Skördaren' : 'En maskin');

/**
 * Kvittots mening — ett FAKTUM ur det servern räknade, aldrig en slutsats:
 *   "Scorpion körde här 2 nov 14:30" (senaste gången en av våra maskiner var inom 15 m före kortet),
 *   "Inget körspår från våra maskiner här före 4 nov 10:12",
 *   "Inga körspår på trakten före 4 nov 10:12" (appen har inte loggat något på trakten alls — den har inget att säga).
 * null = servern har inte svarat än (raden ligger i kön).
 */
export function korsparMening(k: KorsparFore | null | undefined, maskinNamn: (id: string) => string | null = () => null): string[] | null {
  if (!k || typeof k !== 'object' || !('traffar' in k)) return null;
  const fore = avvikelseTid(k.kontrollerat_fore);
  const traffar = [...(k.traffar ?? [])].sort((a, b) => Date.parse(b.senaste) - Date.parse(a.senaste));
  if (traffar.length > 0) {
    // En rad per maskin, senaste först.
    return traffar.map((t) => `${maskinNamn(t.maskin_id) || rollOrd(t.roll)} körde här ${avvikelseTid(t.senaste)}`);
  }
  if ((k.spar_pa_trakten_fore ?? 0) > 0) return [`Inget körspår från våra maskiner här före ${fore}`];
  return [`Inga körspår på trakten före ${fore}`];
}

/** Lagringens sökväg: en mapp per objekt, ett foto per avvikelse (aldrig överskrivet). */
export const avvikelseSokvag = (objektId: string, id: string) => `${objektId}/${id}.jpg`;
export const AVVIKELSE_BUCKET = 'avvikelse-foto';

/** SHA-256 som 64 hex-tecken (databasens CHECK). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Förval ur kartan ──────────────────────────────────────────────────────────────────────────────────────────────────
// Samma byggare som larmen (lib/larm/objekt), så att "det som ligger här" betyder samma sak i larmet och i förvalet.


export function forvalVidPos(p: {
  pos: { lat: number; lng: number } | null;
  markers: readonly any[];
  svgToLatLon: (x: number, y: number) => { lat: number; lon: number };
  vida?: { features?: any[] } | null;
}): AvvikelseTyp {
  if (!p.pos) return 'korskada';
  const pos = { lat: p.pos.lat, lon: p.pos.lng };
  const objekt: LarmObjekt[] = [];
  for (const m of p.markers) {
    try {
      if (m?.isMarker && typeof m.x === 'number' && typeof m.y === 'number') {
        const ll = p.svgToLatLon(m.x, m.y);
        objekt.push(symbolObjekt({ id: m.id, type: m.type, lat: ll.lat, lon: ll.lon }, '', pos, false));
      } else if (m?.isLine && m.path?.length > 1) {
        const o = linjeObjekt({ id: m.id, lineType: m.lineType, koordinater: m.path.map((q: any) => p.svgToLatLon(q.x, q.y)) }, pos);
        if (o) objekt.push(o);
      } else if (m?.isZone && m.path?.length > 2) {
        const o = ytaObjekt({ id: m.id, zoneType: m.zoneType, ring: m.path.map((q: any) => p.svgToLatLon(q.x, q.y)) }, pos);
        if (o) objekt.push(o);
      }
    } catch { /* en trasig markering hindrar inte förvalet */ }
  }
  try { objekt.push(...vidaObjekt(p.vida ?? null, pos)); } catch { /* */ }
  return forvalTyp(objekt);
}
