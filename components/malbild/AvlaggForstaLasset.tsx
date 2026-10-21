'use client';

// "Så ska avlägget se ut" i skotarläget, FÖRSTA gången per trakt: en smal rad med den lilla bilden och Visa. Den ligger BREDVID lossningsflödet och ändrar det inte:
//  • aldrig samtidigt som lossningskortet, Ändra-arket, "Nytt avlägg här?" eller något ark — den kommer först när lossningen är hanterad och nertill är fritt, och försvinner
//    (för gott på den här trakten) så fort något av dem tar platsen igen eller man tryckt Visa eller ✕;
//  • bara efter maskinens FÖRSTA lass på trakten, och aldrig efter ett lass som föraren strukit ("det var ingen lossning");
//  • därefter finns målbilden bara när man trycker på ett avlägg på kartan (KartKort).
// Reglerna och minnet på enheten: lib/malbildSett. Själva bilden och texten: lib/malbilder. Lossningsflödet (#863) är orört.

import React, { useEffect, useRef, useState } from 'react';
import { MalbildBlad, MalbildLiten } from './Malbild';
import { harSettAvlaggsmalbild, markeraAvlaggsmalbildSett } from '@/lib/malbildSett';
import { MALBILD_SYMBOL, type Maskinroll } from '@/lib/malbilder';
import { AVSTAND, FARG, RADIE, TRAFFYTA, medSafeBotten } from '@/lib/design/tokens';

const AVLAGG = MALBILD_SYMBOL.landing;
/** Raden "Lossa här / N lass väntar på dig" (SkotarNedreRad) ligger längst ned i skotarläget; den här raden lägger sig ovanför den. */
const NEDRE_RAD_SELECTOR = '[data-testid="skotar-nedre-rad"]';

export function AvlaggForstaLasset({ objektId, kortVisas, ledigt, forstaLassId, lass, roll = 'skotare' }: {
  objektId: string;
  /** Lossningskortet visas just nu. */
  kortVisas: boolean;
  /** Inget annat ligger nertill: inget lossningskort, inget Ändra-ark, ingen "Nytt avlägg här?", inga ark. */
  ledigt: boolean;
  /** Lasset som lossningskortet visar, när det är maskinens FÖRSTA på trakten; annars null. */
  forstaLassId: string | null;
  lass: readonly { id: string; status: string }[];
  roll?: Maskinroll | null;
}) {
  const [sett, setSett] = useState(() => harSettAvlaggsmalbild(objektId));
  const [oppen, setOppen] = useState(false);
  const [vantar, setVantar] = useState<string | null>(null);   // första lasset som visats på kortet och nu ska följas av raden
  const [nedreTop, setNedreTop] = useState<number | null>(null);
  const visadesRef = useRef(false);
  useEffect(() => { setSett(harSettAvlaggsmalbild(objektId)); setVantar(null); visadesRef.current = false; setOppen(false); }, [objektId]);

  // Första lasset visas på kortet: minns det. Raden väntar tills lossningen är hanterad.
  useEffect(() => { if (kortVisas && forstaLassId && !sett) setVantar(forstaLassId); }, [kortVisas, forstaLassId, sett]);

  const status = vantar ? lass.find((l) => l.id === vantar)?.status : undefined;
  // Ett strukit lass ("det var ingen lossning") räknas inte: då väntar raden på nästa första lass.
  useEffect(() => { if (vantar && ledigt && status === 'struket') setVantar(null); }, [vantar, ledigt, status]);

  const visa = ledigt && !sett && !!vantar && !!status && status !== 'struket';
  useEffect(() => { if (visa) visadesRef.current = true; }, [visa]);
  // Något annat tar platsen nertill medan raden visas (nytt lossningskort, ark …): raden har haft sin tur och kommer inte tillbaka på den här trakten.
  useEffect(() => {
    if (!ledigt && visadesRef.current && !oppen) { markeraAvlaggsmalbildSett(objektId); setSett(true); setVantar(null); }
  }, [ledigt, oppen, objektId]);

  // Raden står ovanför "Lossa här"-raden vars höjd varierar: mät var den slutar uppåt.
  useEffect(() => {
    if (!visa || typeof document === 'undefined') { setNedreTop(null); return; }
    const mat = () => {
      const el = document.querySelector(NEDRE_RAD_SELECTOR) as HTMLElement | null;
      setNedreTop(el ? Math.round(el.getBoundingClientRect().top) : null);
    };
    mat();
    const iv = window.setInterval(mat, 300);
    return () => window.clearInterval(iv);
  }, [visa]);

  const stang = () => { markeraAvlaggsmalbildSett(objektId); setSett(true); setVantar(null); };
  const bottom = nedreTop == null ? medSafeBotten(AVSTAND.l) : `${Math.max(0, (typeof window === 'undefined' ? 0 : window.innerHeight) - nedreTop) + AVSTAND.s}px`;

  return (
    <>
      {visa && (
        <div data-testid="avlagg-forsta-lasset"
          style={{ position: 'fixed', left: AVSTAND.l, right: 96, maxWidth: 560, zIndex: 214, bottom, display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, padding: `0 ${AVSTAND.xs}px 0 ${AVSTAND.m}px`, fontFamily: 'inherit' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <MalbildLiten nyckel={AVLAGG} roll={roll} onVisa={() => { markeraAvlaggsmalbildSett(objektId); setSett(true); setVantar(null); setOppen(true); }} />
          </div>
          <button type="button" data-testid="avlagg-forsta-lasset-stang" aria-label="Visa inte målbilden för avlägg igen på den här trakten" onClick={stang} className="press-dim"
            style={{ flexShrink: 0, width: TRAFFYTA.min, height: TRAFFYTA.min, padding: 0, border: 'none', background: 'transparent', color: FARG.text2, fontFamily: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {oppen && <MalbildBlad nyckel={AVLAGG} roll={roll} onStang={() => setOppen(false)} />}
    </>
  );
}
