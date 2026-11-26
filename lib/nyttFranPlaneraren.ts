// "NYTT FRÅN …" — raden överst i körvyn när någon annan lägger till eller ändrar något på objektet (Martin 2026-11-24, Brokamåla: ~100 saker på kartan, förarens
// ögon är i skogen — en ny symbol syntes först när han råkade se den). Rena regler; hooken (lib/hooks/useNyttFranPlaneraren) och sidan kopplar.
//
// REGLERNA
//  • Något nytt eller ändrat från NÅGON ANNAN (planerare eller en annan maskin) → EN rad: "Nytt från Martin: Varning – Torrträd, 120 m". Det man själv ändrar är aldrig "nytt".
//  • Flera ändringar inom ~2 minuter → en rad: "3 nya från Jocke". Raden försvinner när man trycker på den eller efter 30 s. Inget ljud, ingen kvittering.
//  • Tryck → kartan visar ändringen och den pulserar 5 s; vid flera tas de i tur och ordning (en per tryck).
//  • Ton: röd = fara, gul = Viktigt-rad, annars neutral.
//  • Ingen rad vid start: första färska hämtningen och första läsningen av kommentarerna är baslinjen.
//
// VEM: markeringsraden har ingen författare — `andradAv` (medarbetarens id) och `andradAvNamn` (förnamn) stämplas i markeringens data när den sparas (lagraLokalt),
// bredvid `andradTs`. En rad utan stämpel (ändrad av en äldre app) heter "planeringen". Kommentarerna har skapad_av + namn på raden.

import type { PulsGeometri } from './larm/pulsKarta';
import { SYMBOL_GRUPP, LINJE_GRUPP, YTA } from './larm/grupper';
import { geometriBounds } from './ytaFlyg';
import { markeringNamn } from '../app/oversikt/markeringar';

export const NYTT_RAD_MS = 30_000;
export const NYTT_PULS_MS = 5_000;
/** Kamerans luft när ett tryck på raden visar ändringen: mest upptill (objektpillen, raden, larmkort) och nertill (plus och maskinens kort). */
export const NYTT_KAMERA_PADDING = { top: 170, bottom: 130, left: 60, right: 60 } as const;
export const NYTT_GRUPP_MS = 2 * 60_000;
/** Namnet när avsändaren inte är känd (en rad som sparats av en äldre app). */
export const NYTT_OKAND_AVSANDARE = 'planeringen';

export type NyttTon = 'fara' | 'viktigt' | 'neutral';
type Pos = [number, number];
export interface NyttPlats { lat: number; lng: number; geometri: PulsGeometri; bounds: [Pos, Pos] }
export interface NyttPost {
  /** `markering:<id>` eller `kommentar:<id>` — samma sak som ändras igen ersätter sin post. */
  nyckel: string;
  kalla: 'markering' | 'kommentar';
  av: string;
  /** "Varning", "Viktigt", "Kommentar" … */
  rubrik: string;
  /** Viktigt-radens eller kommentarens början, eller markeringens egen kommentar. */
  detalj: string | null;
  ton: NyttTon;
  plats: NyttPlats | null;
  nar: number;
  sedd?: boolean;
}

// ── Namn ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Förnamnet ur ett helt namn. Ett maskinnamn ("H8E -26", "Elefant 26", "810E") har siffror och kortas aldrig — det vore en annan maskin. */
export const forenamn = (namn: string | null | undefined): string | null => {
  const hel = (namn ?? '').trim();
  if (!hel) return null;
  if (/\d/.test(hel)) return hel.replace(/\s+/g, ' ');
  return hel.split(/\s+/)[0] || null;
};

/**
 * Namnet som stämplas på det man sparar. Personkonto → förnamn. Maskinkonto: förarens förnamn om någon låst upp med "Vem är du?", annars maskinens namn.
 * Aldrig tomt.
 */
export function andradAvNamn(i: { upplastNamn?: string | null; konto?: { namn?: string | null; roll?: string | null } | null; maskinNamn?: string | null }): string {
  const forare = forenamn(i.upplastNamn);
  if (forare) return forare;
  const maskin = (i.maskinNamn ?? '').trim() || (i.konto?.roll === 'maskin' ? (i.konto?.namn ?? '').trim() : '');
  if (i.konto?.roll === 'maskin') return maskin || 'Maskinen';
  return forenamn(i.konto?.namn) ?? (maskin || 'Okänd');
}

/** Markeringen med författaren stämplad (skrivs till lokala lagret och därmed servern; den som redan har en stämpel får den nya). */
export function stampla<M extends object>(marker: M, forfattare: { id: string | null; namn: string }): M & { andradAv?: string; andradAvNamn: string } {
  const { id, namn } = forfattare;
  return { ...marker, ...(id ? { andradAv: id } : {}), andradAvNamn: namn } as M & { andradAv?: string; andradAvNamn: string };
}

// ── Plats och avstånd ────────────────────────────────────────────────────────────────────────────────────────────────

/** Platsen för en markering (symbol, linje, yta) — `svgToLatLon` är sidans. Null när den saknar punkter. */
export function markeringPlats(m: any, svgToLatLon: (x: number, y: number) => { lat: number; lon: number }): NyttPlats | null {
  if (!m) return null;
  if (m.isMarker && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y))) {
    const p = svgToLatLon(m.x, m.y);
    return { lat: p.lat, lng: p.lon, geometri: { type: 'Point', coordinates: [p.lon, p.lat] }, bounds: [[p.lon, p.lat], [p.lon, p.lat]] };
  }
  if ((m.isLine || m.isZone) && Array.isArray(m.path) && m.path.length) {
    const c: Pos[] = m.path.map((pt: any) => { const p = svgToLatLon(pt.x, pt.y); return [p.lon, p.lat] as Pos; });
    const geometri: PulsGeometri = m.isZone && c.length >= 3 ? { type: 'Polygon', coordinates: [c] } : { type: 'LineString', coordinates: c };
    const bounds = geometriBounds(geometri);
    const mitt = c[Math.floor(c.length / 2)];
    return bounds ? { lat: mitt[1], lng: mitt[0], geometri, bounds } : null;
  }
  return null;
}

const punkterAv = (c: any, ut: Pos[] = []): Pos[] => {
  if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') ut.push([c[0], c[1]]);
  else if (Array.isArray(c)) for (const x of c) punkterAv(x, ut);
  return ut;
};

/** Meter från positionen till närmaste punkt i geometrin. Null utan position. */
export function avstandTillPlats(pos: { lat: number; lon: number } | null | undefined, plats: NyttPlats | null | undefined): number | null {
  if (!pos || !plats) return null;
  const k = 111320; const cos = Math.cos((pos.lat * Math.PI) / 180);
  let d = Infinity;
  for (const [lng, lat] of punkterAv(plats.geometri.coordinates)) d = Math.min(d, Math.hypot((lng - pos.lon) * k * cos, (lat - pos.lat) * k));
  return Number.isFinite(d) ? d : null;
}

/** "80 m" (avrundat till 10 m), från 1 km "1,2 km". */
export function avstandText(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m >= 950) return `${(Math.round(m / 100) / 10).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
}

// ── Vad som är fara ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Fara = röd grupp (larmets egen tabell): Varning, El-ledning, Brant, Jakttorn, Markkabel, Ej framkomlig … */
export function arFaraMarkering(m: any): boolean {
  if (!m) return false;
  if (m.isMarker) return SYMBOL_GRUPP[String(m.type)] === 'fara';
  if (m.isLine) return LINJE_GRUPP[String(m.lineType)] === 'fara';
  if (m.isZone) return YTA[String(m.zoneType)]?.grupp === 'fara';
  return false;
}

// ── Baslinjer och diff ───────────────────────────────────────────────────────────────────────────────────────────────

const forstaRad = (t: string | null | undefined): string => (t ?? '').trim().split(/\r?\n/)[0]?.trim() ?? '';
export const kort = (t: string | null | undefined, max = 40): string | null => {
  const r = forstaRad(t);
  if (!r) return null;
  return r.length > max ? `${r.slice(0, max - 1).trimEnd()}…` : r;
};

/** id → ändringstid för markeringarna (det första läget man ser är baslinjen — ingen rad vid start). */
export function markeringsBaslinje(markers: readonly any[]): Map<string, number> {
  const ut = new Map<string, number>();
  for (const m of markers) ut.set(String(m.id), Number(m.andradTs) || 0);
  return ut;
}

/**
 * Markeringarna som är nya eller ändrade sedan baslinjen och inte gjorda av `minId`. En markering utan `andradTs` är ny bara när id:t är nytt.
 * Borttagna räknas inte. Returnerar också nästa baslinje.
 */
export function nyaMarkeringar(bas: ReadonlyMap<string, number>, markers: readonly any[], minId: string | null): { nya: any[]; bas: Map<string, number> } {
  const nya: any[] = [];
  for (const m of markers) {
    const id = String(m.id);
    const ts = Number(m.andradTs) || 0;
    const fanns = bas.has(id);
    const andrad = !fanns || ts > (bas.get(id) ?? 0);
    if (!andrad) continue;
    if (minId && m.andradAv && String(m.andradAv) === String(minId)) continue;   // mitt eget
    nya.push(m);
  }
  return { nya, bas: markeringsBaslinje(markers) };
}

export interface KommentarRadIn { id: string; skapad_av: string | null; namn: string | null; text: string; viktigt?: string | null; yta_nyckel: string; skapad_at?: string | null; andrad_at?: string | null }

const kommentarTid = (r: KommentarRadIn): string => String(r.andrad_at || r.skapad_at || '');
export const kommentarBaslinje = (rader: readonly KommentarRadIn[]): Map<string, string> => new Map(rader.map((r) => [r.id, kommentarTid(r)]));

/** Kommentarerna som är nya eller ändrade (tiden skiljer) och inte skrivna av `minId`. */
export function nyaKommentarer(bas: ReadonlyMap<string, string>, rader: readonly KommentarRadIn[], minId: string | null): { nya: KommentarRadIn[]; bas: Map<string, string> } {
  const nya = rader.filter((r) => {
    if (minId && r.skapad_av && String(r.skapad_av) === String(minId)) return false;
    return !bas.has(r.id) || bas.get(r.id) !== kommentarTid(r);
  });
  return { nya, bas: kommentarBaslinje(rader) };
}

// ── Poster ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export function markeringPost(m: any, plats: NyttPlats | null, nu: number): NyttPost {
  return {
    nyckel: `markering:${m.id}`, kalla: 'markering', av: forenamn(m.andradAvNamn) ?? NYTT_OKAND_AVSANDARE,
    rubrik: markeringNamn(m), detalj: kort(m.comment, 30), ton: arFaraMarkering(m) ? 'fara' : 'neutral', plats, nar: nu,
  };
}

export function kommentarPost(r: KommentarRadIn, plats: NyttPlats | null, nu: number): NyttPost {
  const viktigt = kort(r.viktigt, 60);
  return {
    nyckel: `kommentar:${r.id}`, kalla: 'kommentar', av: forenamn(r.namn) ?? NYTT_OKAND_AVSANDARE,
    rubrik: viktigt ? 'Viktigt' : 'Kommentar', detalj: viktigt ?? kort(r.text, 50), ton: viktigt ? 'viktigt' : 'neutral', plats, nar: nu,
  };
}

/** Lägger posterna i loggen: samma sak som ändras igen ersätter sin post (och blir osedd), äldre än 2 min och redan sedda rensas. */
export function laggIPoster(poster: readonly NyttPost[], nya: readonly NyttPost[], nu: number): NyttPost[] {
  const ut = poster.filter((p) => nu - p.nar <= NYTT_GRUPP_MS && !nya.some((n) => n.nyckel === p.nyckel));
  return [...ut, ...nya];
}

/** Det raden visar: de osedda posterna inom 2 min, äldst först. */
export const osedda = (poster: readonly NyttPost[], nu: number): NyttPost[] => poster.filter((p) => !p.sedd && nu - p.nar <= NYTT_GRUPP_MS);

export const toneFor = (ps: readonly NyttPost[]): NyttTon => (ps.some((p) => p.ton === 'fara') ? 'fara' : ps.some((p) => p.ton === 'viktigt') ? 'viktigt' : 'neutral');

/** Raden: "Nytt från Martin: Varning – Torrträd, 120 m" · "3 nya från Jocke" · "2 nya från Martin och Jocke" · "4 nya". */
export function radText(ps: readonly NyttPost[], pos: { lat: number; lon: number } | null | undefined): string {
  if (!ps.length) return '';
  if (ps.length === 1) {
    const p = ps[0];
    const avst = avstandText(avstandTillPlats(pos, p.plats));
    return `Nytt från ${p.av}: ${p.rubrik}${p.detalj ? ` – ${p.detalj}` : ''}${avst ? `, ${avst}` : ''}`;
  }
  const namn = Array.from(new Set(ps.map((p) => p.av)));
  const fran = namn.length === 1 ? ` från ${namn[0]}` : namn.length === 2 ? ` från ${namn[0]} och ${namn[1]}` : '';
  return `${ps.length} nya${fran}`;
}
