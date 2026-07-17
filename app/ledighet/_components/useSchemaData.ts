'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface SchemaPerson {
  id: string;
  fornamn: string;
}

export interface SchemaLedighet {
  medarbetare_id: string;
  typ: string;
  startdatum: string;
  slutdatum: string;
}

export interface SchemaMaskin {
  maskin_id: string;
  namn: string; // visningsnamn, fallback modell
  typ: string | null; // Harvester/Forwarder — för Skördare/Skotare-gruppering
}

export interface SchemaStopp {
  id: string;
  fran_datum: string;
  till_datum: string;
  orsak: string;
  kommentar: string | null;
  maskin_ids: string[];
}

/**
 * Delad lagöversikt — scopas INTE på inloggad. Personnamn ur medarbetare_namn
 * (bara id + förnamn, läsbar för alla), ledigheter = BARA godkända (väntande
 * syns inte för laget), stopp ur stopp/stopp_maskin, maskiner ur dim_maskin
 * (aktiva, visningsnamn med modell som fallback).
 */
export function useSchemaData() {
  const [personer, setPersoner] = useState<SchemaPerson[]>([]);
  const [ledigheter, setLedigheter] = useState<SchemaLedighet[]>([]);
  const [maskiner, setMaskiner] = useState<SchemaMaskin[]>([]);
  const [stopp, setStopp] = useState<SchemaStopp[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [lasfel, setLasfel] = useState<string | null>(null);

  const hamta = useCallback(async () => {
    const idag = new Date();
    const idagIso = `${idag.getFullYear()}-${String(idag.getMonth() + 1).padStart(2, '0')}-${String(idag.getDate()).padStart(2, '0')}`;

    const [pers, led, mask, st, stMask] = await Promise.all([
      supabase.from('medarbetare_namn').select('id, fornamn').order('fornamn'),
      supabase.from('ledighet_ansokningar')
        .select('medarbetare_id, typ, startdatum, slutdatum')
        .eq('status', 'godkänd'),
      supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ, aktiv_till'),
      supabase.from('stopp').select('id, fran_datum, till_datum, orsak, kommentar'),
      supabase.from('stopp_maskin').select('stopp_id, maskin_id'),
    ]);

    const fel = pers.error ?? led.error ?? mask.error ?? st.error ?? stMask.error;
    if (fel) {
      console.error('[schema] läsfel:', fel);
      setLasfel('Kunde inte läsa schemat — ladda om appen.');
      setLaddar(false);
      return;
    }

    setLasfel(null);
    setPersoner((pers.data as SchemaPerson[]) ?? []);
    setLedigheter((led.data as SchemaLedighet[]) ?? []);

    const aktivaMaskiner = ((mask.data ?? []) as { maskin_id: string; visningsnamn: string | null; modell: string | null; maskin_typ: string | null; aktiv_till: string | null }[])
      .filter(m => !m.aktiv_till || m.aktiv_till >= idagIso)
      .map(m => ({ maskin_id: m.maskin_id, namn: m.visningsnamn || m.modell || m.maskin_id, typ: m.maskin_typ }))
      .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
    setMaskiner(aktivaMaskiner);

    const maskinerPerStopp = new Map<string, string[]>();
    for (const rad of (stMask.data ?? []) as { stopp_id: string; maskin_id: string }[]) {
      const lista = maskinerPerStopp.get(rad.stopp_id) ?? [];
      lista.push(rad.maskin_id);
      maskinerPerStopp.set(rad.stopp_id, lista);
    }
    setStopp(((st.data ?? []) as Omit<SchemaStopp, 'maskin_ids'>[]).map(s => ({
      ...s,
      maskin_ids: maskinerPerStopp.get(s.id) ?? [],
    })));

    setLaddar(false);
  }, []);

  useEffect(() => { hamta(); }, [hamta]);

  return { personer, ledigheter, maskiner, stopp, laddar, lasfel, hamtaOm: hamta };
}
