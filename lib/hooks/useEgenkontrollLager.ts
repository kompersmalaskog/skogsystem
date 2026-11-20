'use client';

// Egenkontrollens lagerval, sparat PER ENHET (localStorage). Ett arbetssatt, inte en objektfraga: har man valt att se hyttsparet vill man se det
// pa nasta trakt ocksa. Se lib/egenkontrollLager.ts for standarden och reglerna.
//
// LAGRINGEN FAR ALDRIG VARA NAGOT VYN BEROR PA. Kommer den tillbaka tom, trasig eller gar den inte att lasa (privat lage, rensad data) galler
// standarden - och vyn fungerar precis som forut, bara utan att minnas. Varje lasning och skrivning ar i try/catch.
//
// SKRIVER FORST NAR NAGON ANDRAT NAGOT. En kallstart som bara hamtat standarden sparar inte ner den: da hade en senare andring av standarden
// aldrig natt dem som aldrig rort menyn.

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { LAGER_LAGRING, LAGER_STANDARD, lagerValTillRaw, tolkaLagerVal } from '../egenkontrollLager';

export function useEgenkontrollLager(): [Record<string, boolean>, Dispatch<SetStateAction<Record<string, boolean>>>] {
  // Forsta renderingen ar alltid standarden (samma pa servern och i webbläsaren); det sparade valet laggs pa i en effekt.
  const [val, setVal] = useState<Record<string, boolean>>({ ...LAGER_STANDARD });
  const andrad = useRef(false);

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LAGER_LAGRING) : null;
      if (raw !== null) setVal(tolkaLagerVal(raw));
    } catch { /* lagringen gar inte att lasa: standarden galler */ }
  }, []);

  const sattVal = useCallback<Dispatch<SetStateAction<Record<string, boolean>>>>((nytt) => {
    andrad.current = true;
    setVal(nytt);
  }, []);

  useEffect(() => {
    if (!andrad.current) return;
    try { window.localStorage.setItem(LAGER_LAGRING, lagerValTillRaw(val)); } catch { /* lagringen ar full eller avstangd: valet galler i den har sessionen */ }
  }, [val]);

  return [val, sattVal];
}
