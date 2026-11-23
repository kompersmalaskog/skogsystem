// Körvyns skyddslager: vilka lager föraren släckt på det här objektet, och knappen som växlar dem (lib/korvySkyddslager).
// Värdet läses SYNKRONT när maskin eller objekt byts (inte i en effekt efteråt), så ett lager aldrig hinner ritas tänt på ett objekt där
// föraren släckt det — och ett objekt där han inte släckt något aldrig ärver förra objektets val.
import { useCallback, useEffect, useRef, useState } from 'react';
import { hamtaSlackta, skyddslagerNyckel, sparaSlackta, vaxlaSlackt } from '../korvySkyddslager';

export function useKorvySkyddslager(maskinId: string | null | undefined, objektId: string | null | undefined) {
  const nyckel = skyddslagerNyckel(maskinId, objektId);
  const [lagrad, setLagrad] = useState<{ nyckel: string | null; slackta: Set<string> }>({ nyckel: null, slackta: new Set() });
  const slackta: Set<string> = lagrad.nyckel === nyckel ? lagrad.slackta : hamtaSlackta(maskinId, objektId);
  // Senaste värdet för timers och effekter som inte ska startas om vid varje byte (defer-effekten i körvyn).
  const ref = useRef<Set<string>>(slackta);
  ref.current = slackta;
  useEffect(() => { if (lagrad.nyckel !== nyckel) setLagrad({ nyckel, slackta }); }, [nyckel]); // eslint-disable-line react-hooks/exhaustive-deps
  const vaxla = useCallback((id: string) => {
    const ny = vaxlaSlackt(ref.current, id);
    sparaSlackta(maskinId, objektId, ny);
    ref.current = ny;
    setLagrad({ nyckel, slackta: ny });
  }, [maskinId, objektId, nyckel]);
  return { slackta, slacktaRef: ref, vaxla };
}
