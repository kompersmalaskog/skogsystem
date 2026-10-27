'use client';

// Reglagens värden som state, sparade per enhet i localStorage (lib/kartReglage). Läses efter mount (SSR-säkert, som useMapLayers) och skrivs direkt vid varje ändring,
// så ett värde överlever en omladdning och ett lager som slås av och på behåller sitt värde (nyckeln är lagrets id, inte om det är påslaget).
import { useCallback, useEffect, useState } from 'react';
import type { Kartlager } from '@/lib/kartlager';
import { klamLagerOp, klamStyrka, lasLagerOp, lasStyrkor, skrivLagerOp, skrivStyrkor, type LagerOpacitet, type Styrkor } from '@/lib/kartReglage';

const lagring = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } };

export interface KartReglage {
  /** Bakgrundens "Dämpad ↔ Skarp" per bakgrund (saknas = standard). */
  styrkor: Styrkor;
  setStyrka: (lager: Kartlager, v: number) => void;
  /** Överläggens "Kartan syns ↔ Bara lagret" i procent per överlägg (saknas = lagrets eget värde). */
  lagerOp: LagerOpacitet;
  setLagerOp: (id: string, v: number) => void;
}

export function useKartReglage(): KartReglage {
  const [styrkor, setStyrkor] = useState<Styrkor>({});
  const [lagerOp, setLagerOpState] = useState<LagerOpacitet>({});

  useEffect(() => {
    setStyrkor(lasStyrkor(lagring()));
    setLagerOpState(lasLagerOp(lagring()));
  }, []);

  const setStyrka = useCallback((lager: Kartlager, v: number) => {
    setStyrkor((prev) => {
      const nytt = { ...prev, [lager]: klamStyrka(v) };
      skrivStyrkor(lagring(), nytt);
      return nytt;
    });
  }, []);

  const setLagerOp = useCallback((id: string, v: number) => {
    setLagerOpState((prev) => {
      const nytt = { ...prev, [id]: klamLagerOp(v) };
      skrivLagerOp(lagring(), nytt);
      return nytt;
    });
  }, []);

  return { styrkor, setStyrka, lagerOp, setLagerOp };
}
