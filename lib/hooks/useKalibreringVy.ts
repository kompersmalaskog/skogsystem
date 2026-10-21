'use client';
/**
 * VYNS VAL SOM SKA ÖVERLEVA ETT FLIKBYTE — förarvy/siffror, tidssteget i Läget, objektsöket och vilka grupper som är utfällda. Flikarna
 * avmonteras när man byter flik; valen bor därför här, i sidans skal, precis som de gjorde som `useState` i den gamla sidan.
 */
import { useState } from 'react';
import type { LagetSteg } from '@/lib/kalibrering/diagnos';

export function useKalibreringVy() {
  const [visaSiffror, setVisaSiffror] = useState(false); // Senaste-fliken: förarvy ↔ siffror
  const [lagetSteg, setLagetSteg] = useState<LagetSteg>('kvartal'); // Läget: tidssteg (kvartal → grova når underlag)
  const [objektQ, setObjektQ] = useState('');
  const [valtObjekt, setValtObjekt] = useState<string | null>(null);
  // Listans hopfällningar: "För tunt underlag" stängd som standard, "Visa äldre" per grupp.
  const [objektVisaTunt, setObjektVisaTunt] = useState(false);
  const [objektVisaAldre, setObjektVisaAldre] = useState<Record<string, boolean>>({});
  return {
    visaSiffror, setVisaSiffror, lagetSteg, setLagetSteg, objektQ, setObjektQ, valtObjekt, setValtObjekt,
    objektVisaTunt, setObjektVisaTunt, objektVisaAldre, setObjektVisaAldre,
  };
}

export type KalibreringVy = ReturnType<typeof useKalibreringVy>;
