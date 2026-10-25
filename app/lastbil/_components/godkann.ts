// Skrivningarna i Fakturering › Att godkänna: Godkänn, Ångra godkännandet och Rätta km/kund. EN väg in för
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

/**
 * Godkänn: sätter godkand_tid/godkand_av. Bara en aktiv, ogodkänd, ofakturerad rad.
 * `traillertimmar` (en flytt över 3 mil som saknar tid): förslaget sparas med SAMMA tryck — den som godkänner
 * flytten godkänner också tiden som står på raden. Skickas bara när raden saknar tid; en inskriven tid skrivs aldrig över.
 */
export function godkannFlytt(id: string, av: string, nu: Date = new Date(), traillertimmar?: number): Promise<Skrivsvar> {
  const varden: Record<string, unknown> = { godkand_tid: nu.toISOString(), godkand_av: av };
  if (traillertimmar !== undefined) {
    if (!Number.isFinite(traillertimmar) || traillertimmar <= 0) return Promise.resolve({ ok: false, fel: 'Tiden måste vara mer än noll.' });
    varden.traillertimmar = traillertimmar;
  }
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update(varden)
    .eq('id', id).eq('status', 'aktiv').is('godkand_tid', null).is('fakturerad_tid', null)
    .select('id') as any);
}

/**
 * Spara traillertiden (timmar, två decimaler — appen visar dem aldrig så, se `fmtTid`). Går på en aktiv rad som inte är
 * fakturerad, också en godkänd: tiden är en fakturauppgift, inte en rättning av flytten (databasens trigger rör inte spåret).
 */
export function sparaTraillertid(id: string, timmar: number): Promise<Skrivsvar> {
  if (!Number.isFinite(timmar) || timmar <= 0) return Promise.resolve({ ok: false, fel: 'Tiden måste vara mer än noll.' });
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update({ traillertimmar: timmar })
    .eq('id', id).eq('status', 'aktiv').is('fakturerad_tid', null)
    .select('id') as any);
}

/**
 * Ångra ett godkännande: tillbaka till "Att godkänna". Aldrig efter att flytten fakturerats.
 * `rensaTid`: godkännandet sparade också traillertiden (förslaget) — då tas den bort med samma ångra, så raden är som förut.
 */
export function angraGodkannande(id: string, rensaTid = false): Promise<Skrivsvar> {
  return skriv(() => supabase.from('fakturaunderlag_flytt')
    .update(rensaTid ? { godkand_tid: null, godkand_av: null, traillertimmar: null } : { godkand_tid: null, godkand_av: null })
    .eq('id', id).eq('status', 'aktiv').is('fakturerad_tid', null).not('godkand_tid', 'is', null)
    .select('id') as any);
}

/**
 * Rätta km och/eller kund före fakturering (Fakturering › Att godkänna och Hos faktureringen).
 *
 * Skickar bara de fält som faktiskt ändrats. Originalet och "redigerad" sköts av databasen
 * (trigger i migration 20261015155630): klienten skriver aldrig `km_original`/`kund_original`, och
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

// Att stryka en flytt går inte här: det gör databasfunktionen stryk_flytt (ratta.ts), som stryker flytten, underlaget och
// positionen i EN transaktion och loggar det. Att bara stryka underlaget lämnade flytten kvar utan spår.
