'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, FONT, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import VyKolumn from '@/components/design/VyKolumn';
import Rubrik from './_components/Rubrik';
import NuFlik from './_components/NuFlik';
import FaktureringFlik from './_components/FaktureringFlik';
import VantarRad from './_components/VantarRad';
import KorningarFlik from './_components/KorningarFlik';
import RundaArk from './_components/RundaArk';
import Ark from '@/components/design/Ark';
import { periodNu, type Period } from './_components/period';
import { pamminnelse, type Pamminnelse } from './_components/vantar';
import { lasUrl, skrivUrl, type Flik } from './_components/url';
import { useFakturerbart } from './_components/useFakturerbart';
import { useLastbilNu } from './_components/useLastbilNu';
import { useVantar } from './_components/useVantar';
import { useEnRunda, useRundor } from './_components/useRundor';

/**
 * Lastbilen — EN vy för det man tittar på (omtaget 2026-10, byggt som Arbetsrapporten: flikar är
 * frågor, varje flik öppnar på svaret, detaljen ligger ett ark bort):
 *   Körningar   – vad har bilen gjort och vad drog det?
 *   Fakturering – vad kan faktureras? (bara admin)        (kvittot, steg 3)
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

  const [valdRunda, setValdRunda] = useState<{ id: string; start: string } | null>(null);

  const nu = useLastbilNu(!loading && flik === 'nu');
  const fakt = useFakturerbart(period, arAdmin);
  const vantar = useVantar(arAdmin);
  // Efter Godkänn/Stryk/Ångra: läs om remsan, listan och påminnelsen TYST (inget blinkar till "Läser …").
  const { laddaOmTyst: faktTyst } = fakt;
  const { laddaOmTyst: vantarTyst } = vantar;
  const efterAndring = useCallback(() => { faktTyst(); vantarTyst(); }, [faktTyst, vantarTyst]);
  const rundor = useRundor(period, !loading && flik === 'korningar');
  // Arket för en runda: finns den i den inlästa listan används den, annars (tryck på "Senaste körning" på Nu)
  // läses just den rundan med sina grannar i tiden.
  const iListan = valdRunda && rundor.lage.lage === 'klar' ? rundor.lage.rundor.find(r => r.id === valdRunda.id) ?? null : null;
  const enRunda = useEnRunda(valdRunda, !!iListan);
  const arkRunda = iListan ?? (valdRunda && enRunda.lage.lage === 'klar' ? enRunda.lage.rundor.find(r => r.id === valdRunda.id) ?? null : null);

  useEffect(() => {
    if (loading) return;
    window.history.replaceState(null, '', `${window.location.pathname}${skrivUrl(flik, period)}`);
  }, [loading, flik, period]);

  const valjFlik = useCallback((f: Flik) => setValdFlik(f), []);

  // Påminnelsen: på Fakturering räknas bara det som väntar UTANFÖR perioden listan redan visar.
  const paminn = vantar.lage.lage === 'klar' ? pamminnelse(vantar.lage.rader, flik === 'fakturering' ? period : null) : null;
  const oppnaVantande = useCallback((p: Pamminnelse) => {
    if (p.mal) setPeriod(p.mal);
    setValdFlik('fakturering');
  }, []);

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
              {arAdmin && (
                <div style={{ paddingBottom: AVSTAND.m }}>
                  <VantarRad lage={vantar.lage} pamminnelse={paminn} onOppna={oppnaVantande} onForsokIgen={vantar.forsokIgen} />
                </div>
              )}
              {flik === 'nu' && <NuFlik lage={nu.lage} onForsokIgen={nu.forsokIgen} onOppnaRunda={setValdRunda} />}
              {flik === 'korningar' && (
                <KorningarFlik period={period} lage={rundor.lage} onForsokIgen={rundor.forsokIgen}
                  onOppna={r => setValdRunda({ id: r.id, start: r.start })} onValjManad={setPeriod} />
              )}
              {flik === 'fakturering' && (
                <FaktureringFlik period={period} status={fakt.status} namn={medarbetare?.namn || 'admin'}
                  onForsokIgen={fakt.forsokIgen} onAndrad={efterAndring} />
              )}
            </div>
          </>
        )}
      </VyKolumn>

      {valdRunda && arkRunda && <RundaArk runda={arkRunda} onStang={() => setValdRunda(null)} />}
      {valdRunda && !arkRunda && (
        <Ark rubrik="Körning" onStang={() => setValdRunda(null)}>
          {enRunda.lage.lage === 'fel' || (enRunda.lage.lage === 'klar') ? (
            <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
              <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>
                {enRunda.lage.lage === 'klar' ? 'Rundan hittades inte.' : 'Kunde inte läsa rundan just nu.'}
              </p>
              <button type="button" onClick={enRunda.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
            </div>
          ) : (
            <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.l}px 0`, margin: 0 }}>Läser rundan …</p>
          )}
        </Ark>
      )}
    </div>
  );
}
