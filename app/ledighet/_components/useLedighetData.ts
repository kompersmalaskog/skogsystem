'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Ansokan, Saldo } from './typer';

/** Säger vad som händer och vad man gör: Ansök är spärrad tills ansökningarna går att läsa. */
export const ANSOKNINGAR_LASFEL =
  'Kunde inte läsa dina ansökningar. Ansök om ledighet är spärrad tills de går att läsa — kontrollera uppkopplingen och försök igen.';

/**
 * Hämtar den inloggades saldo + ALLA ansökningar (RLS: alla läser allt —
 * behövs för kollisionsvarning och godkänn-sektionen; "mina" filtreras
 * i klienten på medarbetare_id).
 *
 * Ärliga tillstånd: laddar / fel / data hålls isär — RLS-tomt utan error
 * kan inte uppstå för ansökningar (SELECT är öppen), men saldo kan sakna
 * rad (nyanställd utan seed) vilket är skilt från läsfel.
 *
 * TVÅ läsningar, TVÅ utfall: saldot och ansökningarna lyckas eller felar var för
 * sig. Förr kastades båda när en felade — och saldokorten påstod då "Kopplas via
 * Fortnox" / "Inte satt ännu", fast vi inte visste något. Nu:
 *  - `lasfel`      = ansökningarna kunde inte läsas. `ansokningar` är då tom eller
 *                    gammal och får inte användas till något (dubbelbokning, krock,
 *                    godkänn-lista). Ansök spärras.
 *  - `saldoLasfel` = saldot kunde inte läsas. Skilt från `saldoSaknas` (ingen rad,
 *                    inget fel) och från NULL-värden (admin har inte satt dem).
 */
export function useLedighetData(medarbetareId: string | null) {
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [saldoSaknas, setSaldoSaknas] = useState(false);
  const [ansokningar, setAnsokningar] = useState<Ansokan[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [lasfel, setLasfel] = useState<string | null>(null);
  const [saldoLasfel, setSaldoLasfel] = useState(false);

  const hamta = useCallback(async () => {
    if (!medarbetareId) return;
    let saldoRes, ansRes;
    try {
      [saldoRes, ansRes] = await Promise.all([
        supabase
          .from('medarbetare_saldo')
          .select('semester_dagar_kvar, atk_timmar_kvar, kalla, uppdaterad_at')
          .eq('medarbetare_id', medarbetareId)
          .maybeSingle(),
        supabase
          .from('ledighet_ansokningar')
          .select('id, medarbetare_id, anvandare_id, typ, startdatum, slutdatum, status, kommentar, skapad_at, ersatter_datum, fran_tid, till_tid')
          .order('startdatum', { ascending: false }),
      ]);
    } catch (e) {
      // supabase-js returnerar normalt { error }, men ett kast (nätverk, auth-lås) får
      // inte lämna vyn på "Laddar…" för alltid. Båda läsningarna räknas som felade.
      console.error('[ledighet] läsning kastade:', e);
      setSaldoLasfel(true);
      setLasfel(ANSOKNINGAR_LASFEL);
      setLaddar(false);
      return;
    }

    if (saldoRes.error) {
      console.error('[ledighet] saldo läsfel:', saldoRes.error);
      setSaldoLasfel(true);
    } else {
      setSaldoLasfel(false);
      setSaldo((saldoRes.data as Saldo | null) ?? null);
      setSaldoSaknas(saldoRes.data === null);
    }

    if (ansRes.error) {
      console.error('[ledighet] ansökningar läsfel:', ansRes.error);
      setLasfel(ANSOKNINGAR_LASFEL);
    } else {
      setLasfel(null);
      setAnsokningar((ansRes.data as Ansokan[]) ?? []);
    }
    setLaddar(false);
  }, [medarbetareId]);

  useEffect(() => { hamta(); }, [hamta]);

  return { saldo, saldoSaknas, saldoLasfel, ansokningar, laddar, lasfel, hamtaOm: hamta };
}
