'use client';

// "Så ska avlägget se ut" i skotarläget, FÖRE första lossningen på trakten: en smal rad med den lilla bilden och Visa. Målbilden ska förhindra att första traven läggs fel,
// så den måste synas när maskinen kommer fram till avlägget — inte efteråt. Raden ligger BREDVID lossningsflödet och ändrar det inte:
//  • visas när maskinen, med trakten utan något lass än, kommer in i ett avläggs zon (samma zon som lossningsupptäckten, AVLAGG.RADIE_M = 50 m, färsk fix) och inget
//    lossningskort, Ändra-ark, "Nytt avlägg här?" eller annat ark redan ligger nertill;
//  • försvinner när lossningskortet kommer (efter 3 min stilla): kortet vinner alltid platsen, aldrig båda samtidigt;
//  • försvinner för gott på trakten vid Visa, ✕ eller när första lossningskortet visats. Därefter finns målbilden bara när man trycker på ett avlägg (KartKort);
//  • lämnar maskinen zonen utan att lossa göms raden, och kommer tillbaka nästa gång den kör in (tills den är sedd);
//  • strukna lass räknas inte som första lass (se arForstaLassetPaTrakten).
// Reglerna och minnet på enheten: lib/malbildSett. Själva bilden och texten: lib/malbilder. Lossningsflödet (#863) är orört.

import React, { useEffect, useRef, useState } from 'react';
import { MalbildBlad, MalbildLiten } from './Malbild';
import { harSettAvlaggsmalbild, markeraAvlaggsmalbildSett } from '@/lib/malbildSett';
import { MALBILD_SYMBOL, type Maskinroll } from '@/lib/malbilder';
import { AVLAGG as LOSSNINGSZON, traffaAvlagg } from '@/lib/skotarLass/avlagg';
import type { Avlagg } from '@/lib/skotarLass/typer';
import { AVSTAND, FARG, RADIE, TRAFFYTA, medSafeBotten } from '@/lib/design/tokens';

const AVLAGG = MALBILD_SYMBOL.landing;
/** Raden "Lossa här / N lass väntar på dig" (SkotarNedreRad) ligger längst ned i skotarläget; den här raden lägger sig ovanför den. */
const NEDRE_RAD_SELECTOR = '[data-testid="skotar-nedre-rad"]';
/** Bara en färsk fix räknas (som lossningsupptäckten): ingen position = ingen rad. */
export const FERSK_FIX_MS = 10_000;
/** In i zonen vid 50 m, ut först vid 60 m: GPS-brus vid kanten får inte blinka raden. */
export const ZON_UT_EXTRA_M = 10;

/** Står maskinen i (eller kommer den in i) ett avläggs zon? `redanInne` ger lite marginal ut. Ren funktion. */
export function iAvlaggsZon(pos: { lat: number; lon: number } | null, avlagg: readonly Avlagg[], redanInne: boolean): boolean {
  if (!pos || avlagg.length === 0) return false;
  const radie = LOSSNINGSZON.RADIE_M + (redanInne ? ZON_UT_EXTRA_M : 0);
  return traffaAvlagg({ lat: pos.lat, lng: pos.lon }, avlagg, radie).narmaste != null;
}

export function AvlaggForstaLasset({ objektId, kortVisas, ledigt, forstaLasset, position, avlagg, roll = 'skotare' }: {
  objektId: string;
  /** Lossningskortet visas just nu (första gången det visas är målbilden förbrukad på trakten). */
  kortVisas: boolean;
  /** Inget annat ligger nertill: inget lossningskort, inget Ändra-ark, ingen "Nytt avlägg här?", inga ark. */
  ledigt: boolean;
  /** Maskinen har inget (icke struket) lass på trakten än. */
  forstaLasset: boolean;
  position: { lat: number; lon: number } | null;
  avlagg: readonly Avlagg[];
  roll?: Maskinroll | null;
}) {
  const [sett, setSett] = useState(() => harSettAvlaggsmalbild(objektId));
  const [oppen, setOppen] = useState(false);
  const [inne, setInne] = useState(false);
  const [nedreTop, setNedreTop] = useState<number | null>(null);
  const sistFixRef = useRef(0);
  const inneRef = useRef(false);
  useEffect(() => { setSett(harSettAvlaggsmalbild(objektId)); setOppen(false); setInne(false); inneRef.current = false; }, [objektId]);

  const forbrukad = () => { markeraAvlaggsmalbildSett(objektId); setSett(true); setInne(false); inneRef.current = false; };
  // Första lossningskortet har visats: målbilden har haft sin chans på den här trakten.
  useEffect(() => { if (kortVisas && !sett) forbrukad(); }, [kortVisas, sett]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Zonen: räknas om vid varje ny fix och var 2:a sekund (så en fix som blivit gammal släpper raden). Bara medan raden kan bli aktuell.
  useEffect(() => { if (position) sistFixRef.current = Date.now(); }, [position]);
  useEffect(() => {
    if (sett || !forstaLasset) { inneRef.current = false; setInne(false); return; }
    const berakna = () => {
      const fersk = sistFixRef.current > 0 && Date.now() - sistFixRef.current <= FERSK_FIX_MS;
      const nu = fersk && iAvlaggsZon(position, avlagg, inneRef.current);
      inneRef.current = nu;
      setInne(nu);
    };
    berakna();
    const iv = window.setInterval(berakna, 2000);
    return () => window.clearInterval(iv);
  }, [sett, forstaLasset, position, avlagg]);

  const visa = !!objektId && !sett && ledigt && forstaLasset && inne;

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

  const bottom = nedreTop == null ? medSafeBotten(AVSTAND.l) : `${Math.max(0, (typeof window === 'undefined' ? 0 : window.innerHeight) - nedreTop) + AVSTAND.s}px`;

  return (
    <>
      {visa && (
        <div data-testid="avlagg-forsta-lasset"
          style={{ position: 'fixed', left: AVSTAND.l, right: 96, maxWidth: 560, zIndex: 214, bottom, display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, padding: `0 ${AVSTAND.xs}px 0 ${AVSTAND.m}px`, fontFamily: 'inherit' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <MalbildLiten nyckel={AVLAGG} roll={roll} onVisa={() => { forbrukad(); setOppen(true); }} />
          </div>
          <button type="button" data-testid="avlagg-forsta-lasset-stang" aria-label="Visa inte målbilden för avlägg igen på den här trakten" onClick={forbrukad} className="press-dim"
            style={{ flexShrink: 0, width: TRAFFYTA.min, height: TRAFFYTA.min, padding: 0, border: 'none', background: 'transparent', color: FARG.text2, fontFamily: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {oppen && <MalbildBlad nyckel={AVLAGG} roll={roll} onStang={() => setOppen(false)} />}
    </>
  );
}
