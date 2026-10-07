'use client';

/**
 * BAKATPILEN FRAN RUNDAN TILL EGENKONTROLL-LISTAN.
 *
 * Utan den fanns ingen vag ut ur en runda: kartan ar standardvyn, helskarmslaget
 * (och dess bakatpil) togs bort i PR 14, och hemknappen i TopBar leder till
 * startsidan - ett steg for langt. I en hytt utan webblasare (PWA) finns ingen
 * bakatknapp heller.
 *
 * SAMMA MONSTER SOM ANDRA HELSIDESVYER (maskinvy "ny", OversiktObjektLista,
 * MaskinflyttClient): vyn satter body[data-hide-home] sa TopBar doljer hemknappen,
 * och ritar sin egen pil pa hemknappens plats - overst till vanster, i toppfaltet.
 * Pilen ERSATTER huset, den krockar aldrig med det. Hemknappen finns kvar pa
 * /egenkontroll (listan), som pilen leder till.
 *
 * FASTA MATT: inga. Behallaren ar byggd som TopBar sjalv (fast, top 0, hojd
 * LAYOUT.topbar, systemfaltet som paddingTop) och pilen centreras med flex -
 * ingenting ar uppmatt for hand, sa den sitter ratt aven pa en iPhone med
 * Dynamic Island. Behallaren tar inga tryck (pointer-events none), bara pilen.
 *
 * Rundan sparas lopande, sa det finns inget att varna om: ingen dialog, ingen
 * fraga - bara tillbaka. Pilen renderas ur sidans rot och finns darfor i ALLA
 * tillstand: kartan, listan, medan rundan hamtas och om hamtningen misslyckas.
 * z 1001: ovanfor toppfaltet (1000), under formularen och dialogen (1100) -
 * medan ett formular ar oppet ligger det ovanpa pilen, sa man gar inte ur
 * mitt i en mating.
 *
 * Farg: blatt - tokens sager "tillbaka" = KNAPP.lank (bara navigerar eller avbryter).
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, IKON, LAYOUT, TRAFFYTA } from '@/lib/design/tokens';

/** Dit pilen leder: listan med alla objekt. */
export const EGENKONTROLL_LISTA = '/egenkontroll';

export default function TillbakaTillListan() {
  // Dolj TopBars hemknapp medan rundan ar oppen; aterstall nar sidan lamnas.
  useEffect(() => {
    document.body.setAttribute('data-hide-home', '');
    return () => document.body.removeAttribute('data-hide-home');
  }, []);

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, height: LAYOUT.topbar, boxSizing: 'border-box',
        paddingTop: LAYOUT.safeTopp, paddingLeft: AVSTAND.m,
        display: 'flex', alignItems: 'center', zIndex: 1001, pointerEvents: 'none',
      }}
    >
      <Link
        href={EGENKONTROLL_LISTA}
        aria-label="Tillbaka till egenkontroll"
        style={{
          pointerEvents: 'auto', width: TRAFFYTA.min, height: TRAFFYTA.min,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: FARG.bla, textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad }}>
          arrow_back
        </span>
      </Link>
    </div>
  );
}
