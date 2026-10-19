'use client';

// DOCKAN I RUNDVYN: det flytande kortet nere på kartan — punkten du står vid, OK / Avvikelse, och "Notera här" i dockans nederkant.
//
// RUNDVYNS RAM — SJU MEDVETNA AVSTEG FRÅN PLANERINGSVYN. RÄTTA DEM INTE TILL PLANERINGENS VÄRDEN.
// Rundan ser ut som planeringsvyn (hel karta, ett huvud överst, ark och panel från samma ramar) men den som går den har handskar, en
// maskin som skakar och blicken i skogen — inte vid ett skrivbord. Därför görs sju saker MEDVETET på ett annat sätt än i planeringen
// (beslut Martin 2026-10-19, efter utredningen i PR-texten). En ny person som ser skillnaden ska läsa det här innan hen "lagar" den:
//
//  1. TÄCKT YTA, INTE GLAS. Huvud, docka och knappar är FARG.kort utan genomskinlighet. Planeringens glas (rgba .72) bär bara en ikon;
//     här bär ytorna ett namn, ett antal och ett svar, och rött i solljus är brunt. Ingenting som bär text får vara under 0,92.
//     (CentreraKnapp är undantaget: den delas med planeringen, bär bara en ikon och behåller sitt glas.)
//  2. INGET UPPE I HÖRNEN SOM MAN BEHÖVER. Planeringen har hem, objektpill och info i översta raden. Med en tumme på en hög telefon når
//     man inte dit. Allt man behöver — svara, notera, centrera, lager — ligger i den NEDRE tredjedelen. Uppe finns bara en statusrad
//     (KartHuvud) som man läser och som man kan trycka på för att öppna Rundan-arket.
//  3. PLATT OCH NORDUPP. Ingen lutning (planeringen har pitch 50°) och ingen rotation: kartan har maxPitch 0 och dragRotate av.
//     3D är bra för den som planerar och fel för den som går — norr ska alltid vara uppåt.
//  4. INGA LÅNGTRYCK OCH INGA DRAGGESTER PÅ KARTAN. Planeringens långtryck (plats för symbol), dra-och-håll och dra-för-att-flytta är
//     inte med. En handske i en buske ger dem fel. Kartan har tryck (välj punkt) — det är allt.
//  5. FÅ SAKER SAMTIDIGT. Namnrad, EN docka, EN sidokolumn (Lager, Centrera) och "Notera här" (i dockan). Inte kvitto + lista + plus +
//     centrera + info samtidigt som i planeringen.
//  6. ALLT STÅR STILL. Inga knappar som tonar in och ut, ingen docka som glider in. Dockan byter innehåll på plats; sidokolumnen följer
//     dockans överkant utan övergång. (Ett enda undantag: CentreraKnappens egen 180 ms-toning den första gången positionen finns —
//     den komponenten delas med planeringen och ändras inte här.)
//  7. TRYCK PÅ KARTAN BYTER BARA PUNKT, ALDRIG VAD DU SVARAR PÅ NÄSTA. Svarsknapparna ligger i dockan — utanför kartans tryckyta — så ett
//     oavsiktligt tryck i skogen byter högst vilken punkt som visas, aldrig ett svar.
//
// Dockan ligger 28 px över skärmens nederkant (+ hemindikatorn): kartans källhänvisning ligger i nedre vänstra hörnet och måste synas.
// Högst 55 % av skärmen: en lång plankommentar scrollar, men OK/Avvikelse ska synas utan att man scrollar (uppmätt i riktig webbläsare på 390 x 760:
// 45 % klippte svarsknapparna vid en kommentar på sex rader, 55 % rymmer dem).

import { forwardRef, type ReactNode } from 'react';
import { AVSTAND, FARG, KNAPP, KOLUMN, LAYOUT, RADIE } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';

/** Dockans avstånd från skärmens nederkant: 28 px luft (kartans källhänvisning ska synas) + hemindikatorn. */
export const DOCK_BOTTEN = `calc(${LAYOUT.safeBotten} + ${AVSTAND.xl + AVSTAND.xs}px)`;

export type RundDockProps = {
  children: ReactNode;
  /** Satt = en rad "Notera här" i dockans nederkant. Utelämnad på en avslutad runda (den är låst). */
  onNotera?: () => void;
};

const RundDock = forwardRef<HTMLDivElement, RundDockProps>(function RundDock({ children, onNotera }, ref) {
  return (
    <div
      ref={ref}
      data-testid="rund-dock"
      style={{
        position: 'absolute', left: AVSTAND.l, right: AVSTAND.l, bottom: DOCK_BOTTEN, maxWidth: KOLUMN.ark, zIndex: 10,
        display: 'flex', flexDirection: 'column', maxHeight: '55vh', boxSizing: 'border-box',
        background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, fontFamily: 'inherit',
      }}
    >
      {/* Innehållet scrollar (en lång plankommentar), "Notera här" gör det aldrig. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: AVSTAND.m, overscrollBehavior: 'contain' }}>{children}</div>
      {onNotera && (
        <div style={{ flexShrink: 0, padding: `${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.m}px`, borderTop: `1px solid ${FARG.linje}` }}>
          <button
            type="button"
            onClick={onNotera}
            aria-label="Notera här"
            style={{ ...KNAPP.sekundar, minHeight: 52 }}
          >
            <Ikon namn="add_location_alt" farg="inherit" />
            Notera här
          </button>
        </div>
      )}
    </div>
  );
});

export default RundDock;
