// Rätta och stryka en flytt (Körningar › rundans ark, bara admin). EN väg in till databasfunktionerna
// ratta_flytt och stryk_flytt (migration 20261015170000): de gör hela rättningen i EN transaktion — flytten,
// fakturaunderlaget, spåret och maskinpositionen ändras tillsammans eller inte alls. Appen skriver ALDRIG
// maskin_flytt direkt för det här (RLS på maskin_flytt är öppen för alla inloggade).
//
// Funktionerna kastar på läsfel/lås/regelbrott med ett svenskt felmeddelande som visas som det är.

import { supabase } from '@/lib/supabase';
import { fakturerbarEffektiv } from '@/lib/flytt/fakturerbar';

export type UnderlagAtgard = 'ingen' | 'skapat' | 'uppdaterat' | 'struket' | 'aterstallt';
export type PositionAtgard = 'ingen' | 'flyttad' | 'raderad' | 'osaker' | 'hittades_inte' | 'ej_hanterad';

export interface RattaResultat {
  fakturerbar_fore: boolean;
  fakturerbar_efter: boolean;
  underlag: UnderlagAtgard;
  position: PositionAtgard;
}

export type RattaSvar = { ok: true; res: RattaResultat } | { ok: false; fel: string };

/** Fälten som går att rätta — det människan angav. Allt annat avvisas av databasen. */
export interface Andringar {
  maskin_id?: string | null;
  extern_maskin?: string | null;
  fran_objekt_id?: string | null;
  fran_plats_id?: string | null;
  till_objekt_id?: string | null;
  till_plats_id?: string | null;
  flytt_typ?: string;
  kund?: string | null;
  /** true = fakturera ändå, false = fakturera inte, null = följ regeln. */
  fakturerbar_manuell?: boolean | null;
}

const FUNKTION_SAKNAS = 'Rättningen är inte installerad i databasen än (migration 20261015170000). Be den som kör migrationerna om den.';

function felText(error: { message?: string; code?: string }): string {
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')) return FUNKTION_SAKNAS;
  return error.message || 'Okänt fel';
}

async function anropa(funktion: 'ratta_flytt' | 'stryk_flytt', args: Record<string, unknown>): Promise<RattaSvar> {
  try {
    const { data, error } = await supabase.rpc(funktion, args);
    if (error) return { ok: false, fel: felText(error) };
    if (!data || typeof data !== 'object') return { ok: false, fel: 'Databasen svarade inte som väntat — kontrollera flytten innan du försöker igen.' };
    return { ok: true, res: data as RattaResultat };
  } catch (e: any) {
    return { ok: false, fel: e?.message || 'Nätverksfel' };
  }
}

export function rattaFlytt(id: string, andringar: Andringar, anledning: string, av: string): Promise<RattaSvar> {
  if (!anledning.trim()) return Promise.resolve({ ok: false, fel: 'Skriv varför flytten rättas.' });
  if (Object.keys(andringar).length === 0) return Promise.resolve({ ok: false, fel: 'Inget är ändrat.' });
  return anropa('ratta_flytt', { p_flytt: id, p_andringar: andringar, p_anledning: anledning.trim(), p_av: av });
}

export function strykEnFlytt(id: string, anledning: string, av: string): Promise<RattaSvar> {
  if (!anledning.trim()) return Promise.resolve({ ok: false, fel: 'Skriv varför flytten stryks.' });
  return anropa('stryk_flytt', { p_flytt: id, p_anledning: anledning.trim(), p_av: av });
}

/** De nio fälten som går att rätta, så som formuläret håller dem. */
export interface Falt {
  maskin_id: string | null;
  extern_maskin: string | null;
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  till_objekt_id: string | null;
  till_plats_id: string | null;
  flytt_typ: string;
  kund: string | null;
  fakturerbar_manuell: boolean | null;
}

/** Bara det som skiljer sig från flytten skickas (varje par — maskin, från, till — följs åt som databasen väntar). */
export function andradeFalt(fore: Falt, nu: Falt): Andringar {
  const ut: Andringar = {};
  const k = (v: string | null) => (v ?? '').trim() || null;
  if (nu.maskin_id !== fore.maskin_id || k(nu.extern_maskin) !== k(fore.extern_maskin)) { ut.maskin_id = nu.maskin_id; ut.extern_maskin = k(nu.extern_maskin); }
  if (nu.fran_objekt_id !== fore.fran_objekt_id || nu.fran_plats_id !== fore.fran_plats_id) { ut.fran_objekt_id = nu.fran_objekt_id; ut.fran_plats_id = nu.fran_plats_id; }
  if (nu.till_objekt_id !== fore.till_objekt_id || nu.till_plats_id !== fore.till_plats_id) { ut.till_objekt_id = nu.till_objekt_id; ut.till_plats_id = nu.till_plats_id; }
  if (nu.flytt_typ !== fore.flytt_typ) ut.flytt_typ = nu.flytt_typ;
  if (k(nu.kund) !== k(fore.kund)) ut.kund = k(nu.kund);
  if (nu.fakturerbar_manuell !== fore.fakturerbar_manuell) ut.fakturerbar_manuell = nu.fakturerbar_manuell;
  return ut;
}

/** Kunduppdrag kräver kund (CHECK i databasen) — sägs innan man sparar, inte efter ett fel. */
export const kravKund = (typ: string, kund: string | null): boolean => typ !== 'kunduppdrag' || !!(kund ?? '').trim();

/** Fakturerbar efter rättningen — samma regel som databasen (lib/flytt/fakturerbar.ts), manuellt val före regeln. */
export const fakturerbarEfter = (typ: string, km: number | null, manuell: boolean | null = null): boolean => fakturerbarEffektiv(typ, km, manuell);

/** Meningarna som står i kvittot efter en lyckad rättning (vad som faktiskt hände, ur databasens svar). */
export function rattaKvitto(res: RattaResultat, slag: 'rattning' | 'stryk'): string[] {
  const rader: string[] = [slag === 'stryk' ? 'Flytten är struken.' : 'Flytten är rättad.'];
  switch (res.underlag) {
    case 'skapat': rader.push('Den är nu fakturerbar och ligger under Att godkänna.'); break;
    case 'struket': rader.push(slag === 'stryk' ? 'Dess underlag stroks i faktureringen.' : 'Den är inte längre fakturerbar — dess underlag stroks.'); break;
    case 'aterstallt': rader.push('Dess underlag är återställt under Att godkänna.'); break;
    case 'uppdaterat': rader.push('Dess underlag i faktureringen är uppdaterat.'); break;
    default: break;
  }
  switch (res.position) {
    case 'flyttad': rader.push('Maskinens position flyttades till rätt maskin.'); break;
    case 'raderad': rader.push('Positionen som skrevs när flytten avslutades är borttagen.'); break;
    // Ärligt: osäker matchning eller ingen rad = databasen lämnade positionen orörd, och föraren ska titta på kartan.
    case 'osaker':
    case 'hittades_inte':
      rader.push(slag === 'stryk'
        ? 'Positionen kunde inte tas bort automatiskt — kolla kartan.'
        : 'Positionen kunde inte flyttas automatiskt — kolla kartan.'); break;
    case 'ej_hanterad': rader.push('Positionen rättas inte vid byte till annan maskin — kolla kartan.'); break;
    default: break;
  }
  return rader;
}

/** Kvittot som EN mening för toasten: raderna ur svaret, åtskilda med " · ". */
export const kvittoText = (res: RattaResultat, slag: 'rattning' | 'stryk'): string => rattaKvitto(res, slag).join(' · ');
