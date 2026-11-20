'use client';

// Ark eller panel — skärmens BREDD styr (lib/plusArk.plusLage: < 900 px ark nerifrån, ≥ 900 px panel från höger). Delas av plus-arket (PlusRad)
// och objektlistan (ObjektLista) så båda följer samma regel.
//
// Läget avgörs VARJE GÅNG menyn öppnas (oppen false → true läser bredden på nytt) och ligger sedan fast tills nästa öppning: en iPad som vrids eller ett
// fönster som ändras medan menyn är stängd ger rätt läge vid nästa öppning, och ingenting byter ram mitt i en öppen meny eller mitt i en utglidning.
// Ingen resize-lyssnare, ingen extra rendering; läses redan vid första renderingen (ingen bildruta med fel läge).

import { useRef } from 'react';
import { plusLage, type PlusLage } from '../plusArk';

const lageNu = (): PlusLage => (typeof window !== 'undefined' ? plusLage(window.innerWidth) : 'panel');

export function useSkarmLage(oppen: boolean): PlusLage {
  const lageRef = useRef<PlusLage>(lageNu());
  const forraOppen = useRef(oppen);
  if (oppen && !forraOppen.current) lageRef.current = lageNu();
  forraOppen.current = oppen;
  return lageRef.current;
}
