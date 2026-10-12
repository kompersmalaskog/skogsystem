// STARTA JOBB — jobb utan Vida-objekt: privata jobb, och jobb där Vida inte levererat än.
//
// EN plats för hur ett sådant jobb föds, så att Starta jobb-sidan (telefon/dator/maskindator) och maskindatorns
// "Inget objekt här — Starta jobb?"-kort skapar exakt samma rad:
//   • P-VO ur rpc('next_privat_vo') — maskinerna matas in med det numret, importens VO-koppling limmar ihop maskindatan.
//   • typ: slutavverkning | gallring | grot | energiklippning (GROT/energi är en TYP — aldrig via objekt.grot-flaggan).
//   • ursprung: 'privat' (ingen Vida kommer) | 'vanta_vida' (Vida levererar objektet senare → förslag att slå ihop, lib/vidaSammanslagning).
//   • position (lat/lng) valfri på telefon/dator; på maskindator alltid maskinens position + maskinen tilldelad + pågående.
//   • GROT: valfritt hor_till_objekt_id = virkesobjektet på samma trakt (visar dess traktgräns, ytor, anteckningar, skördarspår).
//
// Rena delar (byggObjektRad, validering) + EN tunn skrivning (skapaJobb) som LÄSER TILLBAKA raden den skapade — ett insert
// utan returnerad rad är ett fel, aldrig en tyst succé. Testas i startaJobb.test.ts.

import { haversineMeters } from './gps-guard';

export type JobbTyp = 'slutavverkning' | 'gallring' | 'grot' | 'energiklippning';
export type JobbUrsprung = 'privat' | 'vanta_vida';
export type JobbRoll = 'skordare' | 'skotare';

export const JOBBTYPER: { typ: JobbTyp; label: string }[] = [
  { typ: 'slutavverkning', label: 'Slutavverkning' },
  { typ: 'gallring', label: 'Gallring' },
  { typ: 'grot', label: 'GROT' },
  { typ: 'energiklippning', label: 'Energiklippning' },
];

export const URSPRUNG_VAL: { varde: JobbUrsprung; label: string; hjalp: string }[] = [
  { varde: 'vanta_vida', label: 'Väntar på Vida', hjalp: 'Vida levererar objektet senare — jobbet kan då slås ihop med det.' },
  { varde: 'privat', label: 'Privat', hjalp: 'Inget Vida-objekt kommer. Jobbet blir kvar som det är.' },
];

export const jobbTypLabel = (typ: string | null | undefined): string =>
  JOBBTYPER.find((t) => t.typ === typ)?.label ?? 'Jobb';

/** GROT och energiklippning delar kolumn i Avslutade ("GROT och energi") och är jobb, inte virkesobjekt. */
export const arGrotEllerEnergi = (typ: string | null | undefined): boolean => {
  const t = (typ || '').toLowerCase();
  return t.includes('grot') || t.includes('energi');
};

/** Etiketten som vyer som bara läser `objekt.atgard` (oversikt, oversikt-v2) visar. Slutavverkning/gallring behöver ingen — där räcker typ. */
export const atgardForTyp = (typ: JobbTyp): string | null =>
  typ === 'grot' ? 'GROT' : typ === 'energiklippning' ? 'Energiklippning' : null;

/** Sverige-rimlig koordinat? (Skyddar mot 0,0 och omkastade lat/lng från en kartklick eller ett geokodsvar.) */
export function giltigPlats(lat: unknown, lng: unknown): boolean {
  const la = Number(lat), lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo) && la >= 54 && la <= 70 && lo >= 9 && lo <= 25;
}

/** Ett objekt som ett GROT-jobb kan höra till (virkesobjektet): slutavverkning eller gallring — aldrig ett annat GROT-/energijobb. */
export interface VirkesobjektRad {
  id: string; namn?: string | null; vo_nummer?: string | null; typ?: string | null; status?: string | null;
  lat?: unknown; lng?: unknown;
}
export const arVirkesobjekt = (o: Pick<VirkesobjektRad, 'typ'> | null | undefined): boolean => {
  const t = (o?.typ || '').toLowerCase();
  return t.includes('slut') || t.includes('gallr');
};

/** Virkesobjekten sorterade närmast först (avstånd i m till `pos`); utan position eller utan objektets punkt: sist, på namn. Max `max` rader. */
export function narmasteVirkesobjekt<T extends VirkesobjektRad>(
  pos: { lat: number; lng: number } | null | undefined,
  objekt: T[],
  max = 8,
): (T & { avstandM: number | null })[] {
  const kand = (objekt || []).filter((o) => arVirkesobjekt(o) && (o.namn || '').trim());
  const med = kand.map((o) => {
    const oLat = o.lat == null || o.lat === '' ? NaN : Number(o.lat), oLng = o.lng == null || o.lng === '' ? NaN : Number(o.lng);
    const d = pos && Number.isFinite(oLat) && Number.isFinite(oLng) ? haversineMeters(pos.lat, pos.lng, oLat, oLng) : null;
    return { ...o, avstandM: d };
  });
  med.sort((a, b) => {
    if (a.avstandM != null && b.avstandM != null) return a.avstandM - b.avstandM;
    if (a.avstandM != null) return -1;
    if (b.avstandM != null) return 1;
    return String(a.namn).localeCompare(String(b.namn), 'sv');
  });
  return med.slice(0, max);
}

/** Vilka objekt vars ytanteckningar/media/spår ett objekt visar: sig självt, och — för ett GROT-jobb som hör till ett virkesobjekt — virkesobjektet. */
export function ytaKontextIds(o: { id: string; hor_till_objekt_id?: string | null } | null | undefined): string[] {
  if (!o?.id) return [];
  return o.hor_till_objekt_id && o.hor_till_objekt_id !== o.id ? [o.id, o.hor_till_objekt_id] : [o.id];
}

/** "850 m" / "2,4 km". */
export function avstandText(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export interface JobbIndata {
  namn: string;
  typ: JobbTyp;
  ursprung: JobbUrsprung;
  /** Position (valfri på telefon/dator). Ogiltig → sparas inte. */
  lat?: number | null;
  lng?: number | null;
  markagare?: string | null;
  bolag?: string | null;
  /** GROT: virkesobjektet på samma trakt (objekt.id). Ignoreras för alla andra typer. */
  horTillObjektId?: string | null;
  /** Maskindator: maskinen som startar jobbet → tilldelas i rätt rollfält, status pågående. Utan maskin: ingen tilldelning (planerat jobb). */
  maskin?: { maskinId: string; roll: JobbRoll } | null;
}

export type JobbValidering = { ok: true } | { ok: false; fel: string };

export function valideraJobb(i: JobbIndata): JobbValidering {
  if (!i.namn || !i.namn.trim()) return { ok: false, fel: 'Jobbet behöver ett namn' };
  if (!JOBBTYPER.some((t) => t.typ === i.typ)) return { ok: false, fel: 'Välj typ av jobb' };
  if (i.ursprung !== 'privat' && i.ursprung !== 'vanta_vida') return { ok: false, fel: 'Välj Privat eller Väntar på Vida' };
  return { ok: true };
}

/** Raden som skrivs i `objekt`. Tomma valfria fält utelämnas (databasens default gäller). `nu` = ISO-tid. */
export function byggObjektRad(i: JobbIndata, vo: string, nu: string): Record<string, unknown> {
  const rad: Record<string, unknown> = {
    namn: i.namn.trim(),
    vo_nummer: vo,
    markagare: i.markagare?.trim() || null,
    bolag: i.bolag?.trim() || null,
    typ: i.typ,
    kalla: 'starta-jobb',
    ursprung: i.ursprung,
  };
  const atgard = atgardForTyp(i.typ);
  if (atgard) rad.atgard = atgard;
  if (giltigPlats(i.lat, i.lng)) { rad.lat = Number(i.lat); rad.lng = Number(i.lng); }
  if (i.typ === 'grot' && i.horTillObjektId) rad.hor_till_objekt_id = i.horTillObjektId;
  if (i.maskin?.maskinId) {
    rad[i.maskin.roll === 'skordare' ? 'skordare_maskin_id' : 'skotare_maskin_id'] = i.maskin.maskinId;
    rad.status = 'pagaende';
    rad.pagaende_startad_timestamp = nu;
  } else {
    // Planerat jobb utan maskin: samma default som tidigare ('planerad' = klart att köra) sätts uttryckligen, aldrig av kolumnens default.
    rad.status = 'planerad';
  }
  return rad;
}

/** Minsta delmängd av supabase-js som skapaJobb använder (så testet kan skicka en fake). */
export interface StartaJobbKlient {
  rpc(namn: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(tabell: string): {
    insert(rad: Record<string, unknown>): { select(kol: string): PromiseLike<{ data: any[] | null; error: { message: string } | null }> };
  };
}

export type SkapaJobbSvar =
  | { ok: true; rad: any; vo: string }
  | { ok: false; fel: string; /** true = VO-numret hann hämtas (och är förbrukat) innan det gick fel */ voForbrukat: boolean };

/** Hämta P-VO och skapa jobbet. Läser tillbaka den skapade raden (select '*'). */
export async function skapaJobb(supabase: StartaJobbKlient, i: JobbIndata, nu: string = new Date().toISOString()): Promise<SkapaJobbSvar> {
  const v = valideraJobb(i);
  if (!v.ok) return { ok: false, fel: v.fel, voForbrukat: false };

  let vo: unknown, rpcFel: { message: string } | null = null;
  try { ({ data: vo, error: rpcFel } = await supabase.rpc('next_privat_vo')); }
  catch (e: any) { return { ok: false, fel: 'Kunde inte hämta VO-nummer: ' + (e?.message || 'nätverksfel'), voForbrukat: false }; }
  if (rpcFel || !vo || typeof vo !== 'string') {
    return { ok: false, fel: 'Kunde inte hämta VO-nummer' + (rpcFel ? `: ${rpcFel.message}` : ' — inget svar från databasen'), voForbrukat: false };
  }

  let data: any[] | null = null, insFel: { message: string } | null = null;
  try { ({ data, error: insFel } = await supabase.from('objekt').insert(byggObjektRad(i, vo, nu)).select('*')); }
  catch (e: any) { return { ok: false, fel: 'Jobbet kunde inte skapas: ' + (e?.message || 'nätverksfel'), voForbrukat: true }; }
  if (insFel || !data || data.length === 0) {
    return { ok: false, fel: 'Jobbet kunde inte skapas' + (insFel ? `: ${insFel.message}` : ' — inga rader sparades'), voForbrukat: true };
  }
  return { ok: true, rad: data[0], vo };
}
