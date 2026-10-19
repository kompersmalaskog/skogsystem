'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, FONT, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import VyKolumn from '@/components/design/VyKolumn';
import Flikrad, { PengatalsRemsa } from './_components/Rubrik';
import HamtaFlode from './_components/hamta/HamtaFlode';
import { lasHamtaUrl } from './_components/hamta/flode';
import NuFlik from './_components/NuFlik';
import FaktureringFlik from './_components/FaktureringFlik';
import VantarRad from './_components/VantarRad';
import KorningarFlik from './_components/KorningarFlik';
import RundaArk from './_components/RundaArk';
import Ark from '@/components/design/Ark';
import { periodNu, type Period } from './_components/period';
import { pamminnelse, type Pamminnelse } from './_components/vantar';
import { lasLassId, lasUrl, skrivUrl, type Flik } from './_components/url';
import { useFakturerbart } from './_components/useFakturerbart';
import { useLastbilNu } from './_components/useLastbilNu';
import { useVantar } from './_components/useVantar';
import { useSaknarMaskin } from './_components/useSaknarMaskin';
import SaknarMaskinRad from './_components/SaknarMaskinRad';
import LassArk from './_components/MaskinSheet';
import { useEnRunda, useRundor } from './_components/useRundor';

/**
 * Lastbilen — EN vy för det man tittar på (omtaget 2026-10, byggt som Arbetsrapporten: flikar är
 * frågor, varje flik öppnar på svaret, detaljen ligger ett ark bort):
 *   Körningar   – vad har bilen gjort och vad drog det?
 *   Fakturering – vad kan faktureras? (bara admin)        (kvittot, steg 3)
 *   Nu          – kan jag köra, och var är den?
 * Uppifrån: pengatalet (admin) → väntar-raderna (admin, bara när något väntar) → den stora knappen "Hämta en maskin" → flikarna.
 * "Hämta en maskin" ersätter förarflödet /maskinflytt (steg 3, 2026-10): kartappen gör navigeringen, Lassa och Lassat av är frivilliga.
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
  // Hämta-flödet ersätter hela vyn medan det pågår. Adressen bär det (?hamta=1) så en omladdning landar kvar i flödet.
  const [hamtar, setHamtar] = useState<boolean>(() => lasHamtaUrl(typeof window === 'undefined' ? '' : window.location.search));

  const nu = useLastbilNu(!loading && flik === 'nu');
  const fakt = useFakturerbart(period, arAdmin);
  const vantar = useVantar(arAdmin);
  // "Vilken maskin?": lassen bilens vikt hittat men appen inte kunde para ihop med en maskin. Länken i notisen (?lass=<id>) öppnar arket direkt.
  const saknar = useSaknarMaskin(arAdmin);
  const [valtLass, setValtLass] = useState<string | null>(() => lasLassId(typeof window === 'undefined' ? '' : window.location.search));
  const [kvitto, setKvitto] = useState('');
  // Efter Godkänn/Stryk/Ångra: läs om remsan, listan och påminnelsen TYST (inget blinkar till "Läser …").
  const { laddaOmTyst: faktTyst } = fakt;
  const { laddaOmTyst: vantarTyst } = vantar;
  const efterAndring = useCallback(() => { faktTyst(); vantarTyst(); }, [faktTyst, vantarTyst]);
  const rundor = useRundor(period, !loading && flik === 'korningar');
  const { laddaOmTyst: rundorTyst } = rundor;
  // Arket för en runda: finns den i den inlästa listan används den, annars (tryck på "Senaste körning" på Nu)
  // läses just den rundan med sina grannar i tiden.
  const iListan = valdRunda && rundor.lage.lage === 'klar' ? rundor.lage.rundor.find(r => r.id === valdRunda.id) ?? null : null;
  const enRunda = useEnRunda(valdRunda, !!iListan);
  const { laddaOmTyst: enRundaTyst } = enRunda;
  // Efter en rättning/strykning av en flytt: rundan, remsan (underlag kan ha skapats/strukits) och påminnelsen läses om tyst.
  // Efter ett svar på "Vilken maskin?": arket stängs, en rad säger vad som hände, och raden, remsan och påminnelsen läses om tyst.
  const { laddaOmTyst: saknarTyst } = saknar;
  const efterLass = useCallback((text: string) => {
    setValtLass(null);
    setKvitto(text);
    saknarTyst(); faktTyst(); vantarTyst();
  }, [saknarTyst, faktTyst, vantarTyst]);
  useEffect(() => {
    if (!kvitto) return;
    const t = setTimeout(() => setKvitto(''), 6000);
    return () => clearTimeout(t);
  }, [kvitto]);
  const efterRattning = useCallback(() => { rundorTyst(); enRundaTyst(); faktTyst(); vantarTyst(); }, [rundorTyst, enRundaTyst, faktTyst, vantarTyst]);
  const arkRunda = iListan ?? (valdRunda && enRunda.lage.lage === 'klar' ? enRunda.lage.rundor.find(r => r.id === valdRunda.id) ?? null : null);

  useEffect(() => {
    if (loading) return;
    window.history.replaceState(null, '', `${window.location.pathname}${hamtar ? '?hamta=1' : skrivUrl(flik, period)}`);
  }, [loading, flik, period, hamtar]);

  const startaHamta = useCallback(() => { window.scrollTo(0, 0); setHamtar(true); }, []);
  // Flödet slut (Klar, Avbryt): tillbaka till vyn, en rad säger vad som hände, och det som kan ha ändrats läses om tyst.
  const efterHamta = useCallback((text: string) => {
    window.scrollTo(0, 0);
    setHamtar(false);
    setKvitto(text);
    saknarTyst(); faktTyst(); vantarTyst(); rundorTyst();
  }, [saknarTyst, faktTyst, vantarTyst, rundorTyst]);

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
        ) : hamtar ? (
          <HamtaFlode onAvsluta={efterHamta} arAdmin={arAdmin} namn={medarbetare?.namn || 'admin'} />
        ) : (
          <>
            {arAdmin && <PengatalsRemsa period={period} remsa={fakt.status} onForsokIgen={fakt.forsokIgen} />}
            <div style={{ paddingTop: AVSTAND.s }}>
              {kvitto && (
                <p role="status" data-lass-kvitto style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px` }}>{kvitto}</p>
              )}
              {arAdmin && (
                <div style={{ paddingBottom: AVSTAND.m }}>
                  <SaknarMaskinRad lage={saknar.lage} onOppna={setValtLass} onForsokIgen={saknar.forsokIgen} />
                </div>
              )}
              {arAdmin && (
                <div style={{ paddingBottom: AVSTAND.m }}>
                  <VantarRad lage={vantar.lage} pamminnelse={paminn} onOppna={oppnaVantande} onForsokIgen={vantar.forsokIgen} />
                </div>
              )}
              <button type="button" data-hamta-start onClick={startaHamta} style={KNAPP.primar}>Hämta en maskin</button>
              <Flikrad flik={flik} onFlik={valjFlik} arAdmin={arAdmin} period={period} onPeriod={setPeriod} />
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

      {arAdmin && valtLass && (
        <LassArk lassId={valtLass} iListan={saknar.lage.lage === 'klar' ? saknar.lage.rader.find(r => r.id === valtLass) ?? null : null}
          onStang={() => setValtLass(null)} onKlar={efterLass} />
      )}
      {valdRunda && arkRunda && (
        <RundaArk runda={arkRunda} onStang={() => setValdRunda(null)} arAdmin={arAdmin} namn={medarbetare?.namn || 'admin'} onAndrad={efterRattning} />
      )}
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
