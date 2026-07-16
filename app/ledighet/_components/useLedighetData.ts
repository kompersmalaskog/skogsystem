'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Ansokan, Saldo } from './typer';

/**
 * Hämtar den inloggades saldo + ALLA ansökningar (RLS: alla läser allt —
 * behövs för kollisionsvarning och godkänn-sektionen; "mina" filtreras
 * i klienten på medarbetare_id).
 *
 * Ärliga tillstånd: laddar / fel / data hålls isär — RLS-tomt utan error
 * kan inte uppstå för ansökningar (SELECT är öppen), men saldo kan sakna
 * rad (nyanställd utan seed) vilket är skilt från läsfel.
 */
export function useLedighetData(medarbetareId: string | null) {
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [saldoSaknas, setSaldoSaknas] = useState(false);
  const [ansokningar, setAnsokningar] = useState<Ansokan[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [lasfel, setLasfel] = useState<string | null>(null);

  const hamta = useCallback(async () => {
    if (!medarbetareId) return;
    const [saldoRes, ansRes] = await Promise.all([
      supabase
        .from('medarbetare_saldo')
        .select('semester_dagar_kvar, atk_timmar_kvar, kalla, uppdaterad_at')
        .eq('medarbetare_id', medarbetareId)
        .maybeSingle(),
      supabase
        .from('ledighet_ansokningar')
        .select('id, medarbetare_id, anvandare_id, typ, startdatum, slutdatum, status, kommentar, skapad_at')
        .order('startdatum', { ascending: false }),
    ]);

    if (saldoRes.error || ansRes.error) {
      console.error('[ledighet] läsfel:', saldoRes.error ?? ansRes.error);
      setLasfel('Kunde inte läsa ledighetsdata — ladda om appen.');
      setLaddar(false);
      return;
    }
    setLasfel(null);
    setSaldo((saldoRes.data as Saldo | null) ?? null);
    setSaldoSaknas(saldoRes.data === null);
    setAnsokningar((ansRes.data as Ansokan[]) ?? []);
    setLaddar(false);
  }, [medarbetareId]);

  useEffect(() => { hamta(); }, [hamta]);

  return { saldo, saldoSaknas, ansokningar, laddar, lasfel, hamtaOm: hamta };
}
