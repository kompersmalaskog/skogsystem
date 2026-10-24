'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { lasInventarier } from '@/lib/inventarier/data';
import type { Inventarier } from '@/lib/inventarier/typer';

export type InventarierLage =
  | { lage: 'laddar' }
  | { lage: 'fel'; fel: string }
  | { lage: 'klar'; inv: Inventarier };

/**
 * Läser allt (små tabeller) en gång och läser om efter varje ändring. En omläsning visar det gamla tills det nya är
 * läst — listan blinkar aldrig tom. Ett läsfel vid OMläsning behåller det som syns (ändringen är redan sparad).
 */
export function useInventarier() {
  const [state, setState] = useState<InventarierLage>({ lage: 'laddar' });
  const levande = useRef(true);

  const las = useCallback(async () => {
    try {
      const inv = await lasInventarier();
      if (levande.current) setState({ lage: 'klar', inv });
    } catch (e: any) {
      if (!levande.current) return;
      setState(s => (s.lage === 'klar' ? s : { lage: 'fel', fel: e?.message ?? 'Kunde inte läsa inventarierna' }));
    }
  }, []);

  useEffect(() => {
    levande.current = true;
    las();
    return () => { levande.current = false; };
  }, [las]);

  const forsokIgen = useCallback(() => {
    setState({ lage: 'laddar' });
    las();
  }, [las]);

  return { state, lasOm: las, forsokIgen };
}
