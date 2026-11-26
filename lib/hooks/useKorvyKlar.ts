// Körvyns dämpade symboler (lib/korvyKlar): vilka symboler föraren är klar med på det här objektet, och knappen som växlar dem.
// Värdet läses SYNKRONT när maskin eller objekt byts (som useKorvySkyddslager), så en symbol aldrig hinner ritas full på ett objekt där föraren dämpat den
// och ett annat objekt aldrig ärver förra objektets val.
import { useCallback, useEffect, useRef, useState } from 'react';
import { hamtaKlara, klarNyckel, sparaKlara, vaxlaKlar } from '../korvyKlar';

export function useKorvyKlar(maskinId: string | null | undefined, objektId: string | null | undefined) {
  const nyckel = klarNyckel(maskinId, objektId);
  const [lagrad, setLagrad] = useState<{ nyckel: string | null; klara: Set<string> }>({ nyckel: null, klara: new Set() });
  const klara: Set<string> = lagrad.nyckel === nyckel ? lagrad.klara : hamtaKlara(maskinId, objektId);
  const ref = useRef<Set<string>>(klara);
  ref.current = klara;
  useEffect(() => { if (lagrad.nyckel !== nyckel) setLagrad({ nyckel, klara }); }, [nyckel]); // eslint-disable-line react-hooks/exhaustive-deps
  const vaxla = useCallback((id: string) => {
    const ny = vaxlaKlar(ref.current, id);
    sparaKlara(maskinId, objektId, ny);
    ref.current = ny;
    setLagrad({ nyckel, klara: ny });
  }, [maskinId, objektId, nyckel]);
  return { klara, vaxla };
}
