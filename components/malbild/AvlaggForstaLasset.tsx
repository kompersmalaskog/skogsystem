'use client';

// "Så ska avlägget se ut" i skotarläget vid FÖRSTA lasset per trakt: en smal rad med den lilla bilden och Visa, precis ovanför lossningskortet. Den tar inte
// över skärmen (föraren ska hinna trycka Stämmer), försvinner när lasset är hanterat eller bilden öppnats, och kommer inte tillbaka på samma trakt — sedan finns
// målbilden bara när man trycker på ett avlägg (KartKort). Reglerna och minnet: lib/malbildSett. Själva bilden och texten: lib/malbilder.

import React, { useEffect, useRef, useState } from 'react';
import { MalbildBlad, MalbildLiten } from './Malbild';
import { harSettAvlaggsmalbild, markeraAvlaggsmalbildSett } from '@/lib/malbildSett';
import { MALBILD_SYMBOL, type Maskinroll } from '@/lib/malbilder';
import { AVSTAND, FARG, RADIE, medSafeBotten } from '@/lib/design/tokens';

const AVLAGG = MALBILD_SYMBOL.landing;
/** Lossningskortets bottenavstånd och sidoutrymme (components/planering/skotar/stil nertillKort): raden ligger i samma kolumn, ovanpå det. */
const KORT_SELECTOR = '[data-testid="lossningskort"], [data-nertill-kort]';

export function AvlaggForstaLasset({ objektId, kortVisas, forstaLasset, roll = 'skotare' }: { objektId: string; kortVisas: boolean; forstaLasset: boolean; roll?: Maskinroll | null }) {
  const [sett, setSett] = useState(() => harSettAvlaggsmalbild(objektId));
  const [oppen, setOppen] = useState(false);
  const [kortHojd, setKortHojd] = useState(0);
  const visadesRef = useRef(false);
  useEffect(() => { setSett(harSettAvlaggsmalbild(objektId)); visadesRef.current = false; }, [objektId]);

  const visa = kortVisas && forstaLasset && !sett;
  useEffect(() => { if (visa) visadesRef.current = true; }, [visa]);
  // Lasset är hanterat (kortet borta) efter att raden visats: då är första lasset gjort och bilden visas inte mer på den här traktens lossningar.
  useEffect(() => {
    if (!kortVisas && visadesRef.current && !oppen) { markeraAvlaggsmalbildSett(objektId); setSett(true); }
  }, [kortVisas, oppen, objektId]);

  // Raden står ovanför lossningskortet vars höjd varierar (frågan, sortimenten): mät den.
  useEffect(() => {
    if (!visa || typeof document === 'undefined') { setKortHojd(0); return; }
    const kort = document.querySelector(KORT_SELECTOR) as HTMLElement | null;
    if (!kort) { setKortHojd(0); return; }
    const mat = () => setKortHojd(Math.round(kort.getBoundingClientRect().height));
    mat();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mat);
    ro.observe(kort);
    return () => ro.disconnect();
  }, [visa]);

  return (
    <>
      {visa && (
        <div data-testid="avlagg-forsta-lasset"
          style={{ position: 'fixed', left: AVSTAND.l, right: 96, maxWidth: 560, zIndex: 219, bottom: `calc(${medSafeBotten(AVSTAND.l)} + ${kortHojd + AVSTAND.s}px)`, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, padding: `0 ${AVSTAND.m}px ${AVSTAND.s}px`, fontFamily: 'inherit' }}>
          <MalbildLiten nyckel={AVLAGG} roll={roll} onVisa={() => { markeraAvlaggsmalbildSett(objektId); setSett(true); setOppen(true); }} />
        </div>
      )}
      {oppen && <MalbildBlad nyckel={AVLAGG} roll={roll} onStang={() => setOppen(false)} />}
    </>
  );
}
