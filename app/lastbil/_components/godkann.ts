// Skrivningarna i Fakturering › Att godkänna: Godkänn, Ångra godkännandet och Stryk. EN väg in för
// alla tre så en skrivning aldrig kan se lyckad ut när den inte nådde raden.
//
// En skrivning som stoppas av RLS ger inget fel i supabase-js — den ger NOLL rader. Därför begärs
// raderna tillbaka (`.select('id')`) och noll rader är ett fel, aldrig ett lyckat tryck.
// Raden rörs bara om den fortfarande är i det läge trycket gäller (ogodkänd/aktiv/ofakturerad): ett
// Godkänn som kommer efter att någon annan hanterat flytten ändrar ingenting och säger det.

import { supabase } from '@/lib/supabase';

export type Skrivsvar = { ok: true } | { ok: false; fel: string; utdaterad?: boolean };

const UTDATERAD = 'Flytten har redan ändrats av någon annan — listan uppdateras.';

async function skriv(bygg: () => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>): Promise<Skrivsvar> {
  try {
    const { data, error } = await bygg();
    if (error) return { ok: false, fel: error.message };
    if (!data || data.length === 0) return { ok: false, fel: UTDATERAD, utdaterad: true };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, fel: e?.message || 'Nätverksfel' };
  }
}

/** Godkänn: sätter godkand_tid/godkand_av. Bara en aktiv, ogodkänd, ofakturerad rad. */
export function godkannFlytt(id: string, av: string, nu: Date = new Date()): Promise<Skrivsvar> {
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update({ godkand_tid: nu.toISOString(), godkand_av: av })
    .eq('id', id).eq('status', 'aktiv').is('godkand_tid', null).is('fakturerad_tid', null)
    .select('id') as any);
}

/** Ångra ett godkännande: tillbaka till "Att godkänna". Aldrig efter att flytten fakturerats. */
export function angraGodkannande(id: string): Promise<Skrivsvar> {
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update({ godkand_tid: null, godkand_av: null })
    .eq('id', id).eq('status', 'aktiv').is('fakturerad_tid', null).not('godkand_tid', 'is', null)
    .select('id') as any);
}

/** Stryk med anledning (obligatorisk). Stryka = MÄRKA, aldrig radera. En fakturerad flytt stryks inte. */
export function strykFlytt(id: string, av: string, anledning: string, nu: Date = new Date()): Promise<Skrivsvar> {
  const text = anledning.trim();
  if (!text) return Promise.resolve({ ok: false, fel: 'Skriv varför flytten stryks.' });
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update({ status: 'struken', struken_tid: nu.toISOString(), struken_av: av, struken_anledning: text })
    .eq('id', id).eq('status', 'aktiv').is('fakturerad_tid', null)
    .select('id') as any);
}

/**
 * Rätta km och/eller kund före fakturering (Fakturering › Att godkänna och Hos faktureringen).
 *
 * Skickar bara de fält som faktiskt ändrats. Originalet och "redigerad" sköts av databasen
 * (trigger i migration 20261015160000): klienten skriver aldrig `km_original`/`kund_original`, och
 * en fakturerad eller struken rad vägrar ändring. `redigerad_av` kräver triggern.
 * Rörs inte godkännandet — den som rättar är den som godkänner.
 */
export function andraFlytt(id: string, falt: { km?: number; kund?: string | null }, av: string): Promise<Skrivsvar> {
  const varden: Record<string, unknown> = { redigerad_av: av };
  if (falt.km !== undefined) {
    if (!Number.isFinite(falt.km) || falt.km <= 0) return Promise.resolve({ ok: false, fel: 'Skriv km som ett tal större än noll.' });
    varden.km = falt.km;
  }
  if (falt.kund !== undefined) varden.kund = falt.kund && falt.kund.trim() ? falt.kund.trim() : null;
  if (Object.keys(varden).length === 1) return Promise.resolve({ ok: false, fel: 'Inget är ändrat.' });
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update(varden)
    .eq('id', id).eq('status', 'aktiv').is('fakturerad_tid', null)
    .select('id') as any);
}
