'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, FONT, KOLUMN_CSS, ROT_MIN_HOJD, VY_ROT, designCss } from '@/lib/design/tokens';
import VyKolumn from '@/components/design/VyKolumn';
import Rubrik from './_components/Rubrik';
import NuFlik from './_components/NuFlik';
import Overgang from './_components/Overgang';
import { periodNu, type Period } from './_components/period';
import { lasUrl, skrivUrl, type Flik } from './_components/url';
import { useFakturerbart } from './_components/useFakturerbart';
import { useLastbilNu } from './_components/useLastbilNu';

/**
 * Lastbilen — EN vy för det man tittar på (omtaget 2026-10, byggt som Arbetsrapporten: flikar är
 * frågor, varje flik öppnar på svaret, detaljen ligger ett ark bort):
 *   Körningar   – vad har bilen gjort och vad drog det?   (steg 2)
 *   Fakturering – vad kan faktureras? (bara admin)        (steg 3)
 *   Nu          – kan jag köra, och var är den?
 * Förarflödet (Lassat, Lassat av, Framme) ligger kvar i /maskinflytt — det är en göra-yta och rörs inte.
 *
 * Designad för admin (fakturering och månadskoll är huvudärendena); förare öppnar på Nu och ser
 * varken fakturerbart-remsan eller Fakturering.
 */
export default function LastbilVy() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';

  // Hooks ligger ALLTID före tidiga returer (skillen: React #310 2026-10-02).
  const [valdFlik, setValdFlik] = useState<Flik | null>(() => lasUrl(typeof window === 'undefined' ? '' : window.location.search).flik);
  const [period, setPeriod] = useState<Period>(() => lasUrl(typeof window === 'undefined' ? '' : window.location.search).period ?? periodNu());

  // Admin öppnar på Körningar (månadskollen), förare på Nu. Fakturering finns bara för admin.
  const flik: Flik = !valdFlik ? (arAdmin ? 'korningar' : 'nu') : valdFlik === 'fakturering' && !arAdmin ? 'nu' : valdFlik;

  const nu = useLastbilNu(!loading && flik === 'nu');
  const fakt = useFakturerbart(period, arAdmin);

  useEffect(() => {
    if (loading) return;
    window.history.replaceState(null, '', `${window.location.pathname}${skrivUrl(flik, period)}`);
  }, [loading, flik, period]);

  const valjFlik = useCallback((f: Flik) => setValdFlik(f), []);

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}{KOLUMN_CSS}</style>
      <VyKolumn>
        {loading ? (
          <p role="status" style={{ color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser …</p>
        ) : (
          <>
            <Rubrik flik={flik} onFlik={valjFlik} arAdmin={arAdmin} period={period} onPeriod={setPeriod}
              remsa={fakt.status} onRemsaForsokIgen={fakt.forsokIgen} />
            <div style={{ paddingTop: AVSTAND.s }}>
              {flik === 'nu' && <NuFlik lage={nu.lage} onForsokIgen={nu.forsokIgen} />}
              {flik === 'korningar' && (
                <Overgang rubrik="Körningar" text="Körningarna per månad flyttar hit i nästa steg. Tills dess finns de i Flyttloggen." />
              )}
              {flik === 'fakturering' && (
                <Overgang rubrik="Fakturering" text="Faktureringskvittot flyttar hit i ett senare steg. Tills dess finns det i Flyttloggen." />
              )}
            </div>
          </>
        )}
      </VyKolumn>
    </div>
  );
}
