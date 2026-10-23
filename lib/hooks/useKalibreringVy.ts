'use client';
/**
 * VYNS VAL SOM SKA ÖVERLEVA ETT FLIKBYTE — vilket mått och vilket tidssteg Över tid visar, objektsöket och vilka grupper som är utfällda. Flikarna
 * avmonteras när man byter flik; valen bor därför här, i sidans skal.
 */
import { useState } from 'react';
import type { LagetSteg } from '@/lib/kalibrering/diagnos';

/** Över tid: fyra vinklar. Träff (träffar den rätt?), Spridning (flaxar den?), Per grovlek (var sitter felen?) och Greppet (släpper det oftare? — ersätter tryckmätaren). */
export type TidMatt = 'traff' | 'sprid' | 'grovlek' | 'grepp';

export function useKalibreringVy() {
  const [tidMatt, setTidMatt] = useState<TidMatt>('traff');
  const [lagetSteg, setLagetSteg] = useState<LagetSteg>('kvartal'); // Över tid: tidssteg (kvartal → grova når underlag)
  const [grovlekTradslag, setGrovlekTradslag] = useState<string | null>(null); // Per grovlek: null = alla trädslag
  const [objektQ, setObjektQ] = useState('');
  const [valtObjekt, setValtObjekt] = useState<string | null>(null);
  // Listans hopfällningar: "För tunt underlag" stängd som standard, "Visa äldre" per grupp.
  const [objektVisaTunt, setObjektVisaTunt] = useState(false);
  const [objektVisaAldre, setObjektVisaAldre] = useState<Record<string, boolean>>({});
  return {
    tidMatt, setTidMatt, lagetSteg, setLagetSteg, grovlekTradslag, setGrovlekTradslag, objektQ, setObjektQ, valtObjekt, setValtObjekt,
    objektVisaTunt, setObjektVisaTunt, objektVisaAldre, setObjektVisaAldre,
  };
}

export type KalibreringVy = ReturnType<typeof useKalibreringVy>;
