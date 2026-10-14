// Extra nummer på ett objekt (tabellen objekt_alt_nummer) — rena funktioner + EN läsning.
//
// En HPR-fils ordernummer kan skilja sig från objekt.vo_nummer (Bågskyttebanan: filen 11271849, objektet 11166440).
// Importen (objekt_koppling.py) sparar då filens nummer som ett extra nummer på objektet — via exakt namnträff — och
// "Koppla till objekt" i /redigering gör detsamma för hand. Nyckeln filen skrivs under ändras ALDRIG (hpr_filer.objekt_nyckel
// '<maskin>:<nummer>', detalj_stam.objekt_id): det gör att redan importerad data och nya filer landar på samma rader.
// Kopplingen ligger i aliaset, och de som läser per objekt tar med det: planeringsvyns produktionshögar och "kvar att köra".
//
// Före migrationen (20261014140000_objekt_alt_nummer.sql) finns ingen tabell → läsningen ger [] och allt beter sig som förut.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AltNummer {
  /** '11271849' (kontraktsnummer, globalt) eller 'k132' (maskinens eget jobbnummer, bara för maskin_id) */
  nummer: string;
  maskin_id: string | null;
}

export interface AltNummerRad extends AltNummer {
  objekt_id: string;
}

const SIFFROR = /^\d+$/;

/** 'PONS20SDJAA270231:11271849' → { maskin, ident }. Trasig/tom nyckel → null. */
export function nyckelDelar(nyckel: string | null | undefined): { maskin: string; ident: string } | null {
  const s = String(nyckel ?? '');
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  return { maskin: s.slice(0, i), ident: s.slice(i + 1) };
}

/** Hör numret i en fil-nyckel till det här extra numret? Kontraktsnummer gäller alla maskiner, k-nummer bara sin egen. */
export function altNummerTraffar(a: AltNummer, maskin: string, ident: string): boolean {
  if (a.nummer !== ident) return false;
  return a.maskin_id == null || a.maskin_id === '' || a.maskin_id === maskin;
}

/** Hör filens nyckel till objektet — vo_nummer eller något av dess extra nummer? */
export function nyckelHorTillObjekt(nyckel: string | null | undefined, vo: string | null | undefined, alt: readonly AltNummer[]): boolean {
  const d = nyckelDelar(nyckel);
  if (!d) return false;
  if (vo && d.ident === String(vo).trim()) return true;
  return alt.some((a) => altNummerTraffar(a, d.maskin, d.ident));
}

/** Värdet detalj_stam.objekt_id bär för ett extra nummer: kontraktsnumret självt, eller 'MASKIN_<ObjectKey>' för k-nummer
 *  (importens make_objekt_id). */
export function stamObjektId(a: AltNummer): string {
  if (SIFFROR.test(a.nummer)) return a.nummer;
  return `${a.maskin_id ?? ''}_${a.nummer.replace(/^k/, '')}`;
}

/** Alla objekt_id objektets produktionshögar kan ligga under: objektets vo_nummer och dess extra nummer. */
export function hogarObjektIds(vo: string, alt: readonly AltNummer[]): string[] {
  const ut = [vo];
  for (const a of alt) {
    const id = stamObjektId(a);
    if (a.maskin_id != null && a.maskin_id !== '' && SIFFROR.test(a.nummer)) continue;   // trasig rad — kontraktsnummer har ingen maskin
    if (!ut.includes(id)) ut.push(id);
  }
  return ut;
}

/** Objektets extra nummer. Fel (t.ex. migrationen ej körd) → [] och en rad i konsolen — aldrig ett kast. */
export async function hamtaAltNummer(supabase: SupabaseClient, objektUuid: string | null | undefined): Promise<AltNummer[]> {
  if (!objektUuid) return [];
  try {
    const { data, error } = await supabase.from('objekt_alt_nummer').select('nummer, maskin_id').eq('objekt_id', objektUuid);
    if (error) { console.warn('objekt_alt_nummer:', error.message); return []; }
    return ((data ?? []) as AltNummer[]).filter((a) => typeof a.nummer === 'string' && a.nummer !== '');
  } catch (e) {
    console.warn('objekt_alt_nummer:', e);
    return [];
  }
}

// ---- Filer utan objekt ---------------------------------------------------------------------------------------------

export interface HprFilRad {
  filnamn: string | null;
  objekt_nyckel: string | null;
  fil_datum?: string | null;
  stammar_count?: number | null;
}
export interface ObjektNamnRad {
  id: string;
  namn: string | null;
  vo_nummer: string | null;
}

export interface OkopplatJobb {
  /** hpr_filer.objekt_nyckel; null = filen saknar nyckel och kan inte kopplas här */
  nyckel: string | null;
  maskin: string | null;
  /** numret/k-numret efter ':' */
  ident: string | null;
  filnamn: string;
  /** objektnamnet maskinen lade i filnamnet */
  namn: string | null;
  datum: string | null;
  stammar: number;
  kanKopplas: boolean;
}

/** Namnet maskinen lägger i HPR-filnamnet. Ponsse: "<Namn>_<MASKIN>_<14 siffror>.hpr"; Rottne: "<Namn> ÅÅÅÅ-MM-DD[ HHMM].hpr". */
export function namnUrHprFilnamn(filnamn: string | null | undefined, maskinId: string | null | undefined): string | null {
  const f = String(filnamn ?? '');
  const ponsse = f.match(/^(.+)_[A-Za-z0-9]+_\d{14}\.hpr$/i);
  if (ponsse && ponsse[1].trim() && ponsse[1].toLowerCase() !== String(maskinId ?? '').toLowerCase()) return ponsse[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const rottne = f.match(/^(.+?)\s+\d{4}-\d{2}-\d{2}(\s+\d{4})?\.hpr$/i);
  if (rottne) return rottne[1].trim();
  if (maskinId && f.toLowerCase().startsWith(String(maskinId).toLowerCase())) return null;
  const rent = f.replace(/\.hpr$/i, '').trim();
  return rent || null;
}

/** Samma jämförelse som importens namnregel: utan skillnad i mellanslag och versaler, inget annat. */
export function namnLika(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => String(s ?? '').split(/\s+/).join('').toLocaleLowerCase('sv');
  const x = n(a);
  return x !== '' && x === n(b);
}

/**
 * HPR-jobb vars nummer varken är något objekts vo_nummer eller ett extra nummer — dvs filer som planeringsvyn inte kan visa
 * under något objekt. Ett jobb per nyckel (senaste filen); filer utan nyckel kommer med var för sig. Senast först.
 */
export function okopplatJobb(filer: readonly HprFilRad[], objekt: readonly ObjektNamnRad[], alias: readonly AltNummerRad[]): OkopplatJobb[] {
  const voSet = new Set(objekt.map((o) => String(o.vo_nummer ?? '').trim()).filter(Boolean));
  const perNyckel = new Map<string, OkopplatJobb>();
  const utanNyckel: OkopplatJobb[] = [];
  for (const f of filer) {
    const d = nyckelDelar(f.objekt_nyckel);
    const filnamn = String(f.filnamn ?? '');
    if (!d) {
      utanNyckel.push({ nyckel: null, maskin: null, ident: null, filnamn, namn: namnUrHprFilnamn(filnamn, null), datum: f.fil_datum ?? null, stammar: f.stammar_count ?? 0, kanKopplas: false });
      continue;
    }
    if (voSet.has(d.ident) || alias.some((a) => altNummerTraffar(a, d.maskin, d.ident))) continue;
    const jobb: OkopplatJobb = {
      nyckel: String(f.objekt_nyckel), maskin: d.maskin, ident: d.ident, filnamn,
      namn: namnUrHprFilnamn(filnamn, d.maskin), datum: f.fil_datum ?? null, stammar: f.stammar_count ?? 0,
      kanKopplas: /^(\d+|k\d+)$/.test(d.ident),   // bara former tabellen tillåter (siffror eller k<ObjectKey>)
    };
    const prev = perNyckel.get(jobb.nyckel!);
    if (!prev || (jobb.datum ?? '') > (prev.datum ?? '')) perNyckel.set(jobb.nyckel!, jobb);
  }
  return [...Array.from(perNyckel.values()), ...utanNyckel].sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? '') || a.filnamn.localeCompare(b.filnamn, 'sv'));
}

/** Objekt vars namn är lika (mellanslag/versaler) som jobbets namn — "troligast" överst i väljaren. */
export function troligaObjekt(jobb: Pick<OkopplatJobb, 'namn'>, objekt: readonly ObjektNamnRad[]): ObjektNamnRad[] {
  return objekt.filter((o) => namnLika(o.namn, jobb.namn));
}

/** Raden som skrivs till objekt_alt_nummer när Martin kopplar för hand. Filer utan nyckel kan inte kopplas (null). */
export function altNummerAttSkriva(jobb: OkopplatJobb, objektUuid: string): { objekt_id: string; nummer: string; maskin_id: string | null; kalla: 'manuell'; filnamn: string } | null {
  if (!jobb.kanKopplas || !jobb.ident || !jobb.maskin) return null;
  return {
    objekt_id: objektUuid,
    nummer: jobb.ident,
    maskin_id: SIFFROR.test(jobb.ident) ? null : jobb.maskin,
    kalla: 'manuell',
    filnamn: jobb.filnamn,
  };
}
