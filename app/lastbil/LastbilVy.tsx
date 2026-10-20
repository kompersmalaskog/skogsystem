'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, FONT, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import VyKolumn from '@/components/design/VyKolumn';
import HamtaFlode from './_components/hamta/HamtaFlode';
import { lasHamtaUrl } from './_components/hamta/flode';
import HamtaKnapp from './_components/hamta/HamtaKnapp';
import BilenNuKort from './_components/BilenNuKort';
import AttGoraKort from './_components/AttGoraKort';
import FaktureringRad from './_components/FaktureringRad';
import FaktureringSida from './_components/FaktureringSida';
import VantarRad from './_components/VantarRad';
import Korningar from './_components/Korningar';
import { senasteKorning } from './_components/nu';
import RundaArk from './_components/RundaArk';
import Ark from '@/components/design/Ark';
import ArsSida from './_components/ArsSida';
import { periodNu, type Manad, type Period } from './_components/period';
import { pamminnelse, type Pamminnelse } from './_components/vantar';
import { lasLassId, lasUrl, skrivUrl, type Sida } from './_components/url';
import { useFakturerbart } from './_components/useFakturerbart';
import { useLastbilNu } from './_components/useLastbilNu';
import { useVantar } from './_components/useVantar';
import { useSaknarMaskin } from './_components/useSaknarMaskin';
import SaknarMaskinRad from './_components/SaknarMaskinRad';
import LassArk from './_components/MaskinSheet';
import { useEnRunda, useRundor } from './_components/useRundor';

/**
 * Lastbilen — EN sida utan flikar (omtaget 2026-10-19). Uppifrån, och i den ordningen alltid:
 *   1. "Hämta en maskin" / "Fortsätt hämta X" direkt under titeln — flyttar sig aldrig.
 *   2. Kortet "Bilen nu": läget, tankraden, och bara det som gäller nu (lampa, service, senast sedd).
 *   3. "Att göra" (bara admin): lass som saknar maskin, flyttar som väntar på godkännande, och raden
 *      "Fakturering · <månad>  36 km ›" som öppnar fakturasidan (en egen sida med tillbaka-pil).
 *   4. Körningar: månadsväljaren, månadens sammanfattning (körd km, rundor · liter · l/mil, Flyttrundor / Övrig körning) och rundorna.
 * Förare ser 1, 2 och 4 — inget "Att göra", ingen fakturering. Pengatalet (fakturerbart-summan) står inte längre i en sticky remsa:
 * det är talet på raden "Fakturering" och överst på fakturasidan, och byter värde bara när PERIODEN byts.
 * Gamla länkar: ?flik=fakturering → fakturasidan (en förare får huvudsidan); ?flik=korningar och ?flik=nu → huvudsidan.
 * "Hämta en maskin" ersätter förarflödet /maskinflytt: kartappen gör navigeringen, Lassa och Lassat av är frivilliga.
 */
export default function LastbilVy() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';

  // Hooks ligger ALLTID före tidiga returer (skillen: React #310 2026-10-02).
  const startUrl = () => lasUrl(typeof window === 'undefined' ? '' : window.location.search);
  const [onskadSida, setOnskadSida] = useState<Sida>(() => startUrl().sida);
  // Perioden är alltid en MÅNAD (den man kom från när År-vyn är öppen); År-vyn har sitt eget år.
  const [period, setPeriod] = useState<Manad>(() => startUrl().period ?? periodNu());
  const [ar, setAr] = useState<number>(() => startUrl().ar ?? periodNu().ar);

  // Fakturasidan finns bara för admin: en förare som följer en gammal länk dit får huvudsidan.
  const sida: Sida = onskadSida === 'fakturering' && !arAdmin ? 'huvud' : onskadSida;

  const [valdRunda, setValdRunda] = useState<{ id: string; start: string } | null>(null);
  // Hämta-flödet ersätter hela vyn medan det pågår. Adressen bär det (?hamta=1) så en omladdning landar kvar i flödet.
  const [hamtar, setHamtar] = useState<boolean>(() => lasHamtaUrl(typeof window === 'undefined' ? '' : window.location.search));

  const nu = useLastbilNu(!loading && !hamtar && sida === 'huvud');
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
  const rundor = useRundor(sida === 'ar' ? { typ: 'ar', ar } : period, !loading && (sida === 'huvud' || sida === 'ar'));
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
    window.history.replaceState(null, '', `${window.location.pathname}${hamtar ? '?hamta=1' : skrivUrl(sida, period, ar)}`);
  }, [loading, sida, period, ar, hamtar]);

  const startaHamta = useCallback(() => { window.scrollTo(0, 0); setHamtar(true); }, []);
  // Flödet slut (Klar, Avbryt): tillbaka till vyn, en rad säger vad som hände, och det som kan ha ändrats läses om tyst.
  const efterHamta = useCallback((text: string) => {
    window.scrollTo(0, 0);
    setHamtar(false);
    setKvitto(text);
    saknarTyst(); faktTyst(); vantarTyst(); rundorTyst();
  }, [saknarTyst, faktTyst, vantarTyst, rundorTyst]);

  const oppnaFakturering = useCallback(() => { window.scrollTo(0, 0); setOnskadSida('fakturering'); }, []);
  const tillHuvudsidan = useCallback(() => { window.scrollTo(0, 0); setOnskadSida('huvud'); }, []);
  // "Hela 2026 ›" längst ner i Körningar: År-vyn för månadens år; tillbaka-pilen går till månaden man kom från.
  const oppnaAr = useCallback(() => { window.scrollTo(0, 0); setAr(period.ar); setOnskadSida('ar'); }, [period.ar]);
  const valjManadFranAr = useCallback((m: Manad) => { window.scrollTo(0, 0); setPeriod(m); setOnskadSida('huvud'); }, []);

  // Påminnelsen: på fakturasidan räknas bara det som väntar UTANFÖR perioden listan redan visar.
  const paminn = vantar.lage.lage === 'klar' ? pamminnelse(vantar.lage.rader, sida === 'fakturering' ? period : null) : null;
  const oppnaVantande = useCallback((p: Pamminnelse) => {
    if (p.mal) setPeriod(p.mal);
    oppnaFakturering();
  }, [oppnaFakturering]);

  // Rubriken "Att göra" står bara när något väntar (lass eller flyttar) eller en läsning föll; Fakturering ensam står utan rubrik.
  const harAttGora = saknar.lage.lage === 'fel' || (saknar.lage.lage === 'klar' && saknar.lage.rader.length > 0)
    || vantar.lage.lage === 'fel' || paminn != null;

  // Bilens senaste avslutade körning (ur Bilen nu): tomtexten i en tom månad öppnar den rundans ark.
  const senasteRunda = nu.lage.lage === 'klar' ? senasteKorning(nu.lage.data.rundor) : null;
  const senaste = senasteRunda?.starttid ? { id: senasteRunda.id, start: senasteRunda.starttid } : null;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}{KOLUMN_CSS}</style>
      <VyKolumn>
        {loading ? (
          <p role="status" style={{ color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser …</p>
        ) : hamtar ? (
          <HamtaFlode onAvsluta={efterHamta} arAdmin={arAdmin} namn={medarbetare?.namn || 'admin'} />
        ) : sida === 'ar' ? (
          <ArsSida ar={ar} onAr={setAr} tillbakaTill={period} lage={rundor.lage} onForsokIgen={rundor.forsokIgen}
            onTillbaka={tillHuvudsidan} onValjManad={valjManadFranAr} />
        ) : sida === 'fakturering' ? (
          <FaktureringSida period={period} onPeriod={setPeriod} status={fakt.status} namn={medarbetare?.namn || 'admin'}
            vantar={vantar.lage} pamminnelse={paminn} onOppnaVantande={oppnaVantande} onVantarForsokIgen={vantar.forsokIgen}
            onTillbaka={tillHuvudsidan} onForsokIgen={fakt.forsokIgen} onAndrad={efterAndring} />
        ) : (
          <div style={{ paddingTop: AVSTAND.s }}>
            <div style={{ marginBottom: AVSTAND.xl }}>
              <HamtaKnapp forareId={medarbetare?.id ?? null} aktiv={!loading && !hamtar} onStart={startaHamta} />
              {kvitto && (
                <p role="status" data-lass-kvitto style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{kvitto}</p>
              )}
            </div>
            <BilenNuKort lage={nu.lage} onForsokIgen={nu.forsokIgen} />
            {arAdmin && (
              <AttGoraKort medRubrik={harAttGora}>
                <SaknarMaskinRad lage={saknar.lage} onOppna={setValtLass} onForsokIgen={saknar.forsokIgen} />
                <VantarRad lage={vantar.lage} pamminnelse={paminn} onOppna={oppnaVantande} onForsokIgen={vantar.forsokIgen} />
                <FaktureringRad period={period} status={fakt.status} onOppna={oppnaFakturering} onForsokIgen={fakt.forsokIgen} />
              </AttGoraKort>
            )}
            <Korningar period={period} onPeriod={setPeriod} lage={rundor.lage} onForsokIgen={rundor.forsokIgen} onOppnaAr={oppnaAr}
              onOppna={r => setValdRunda({ id: r.id, start: r.start })} senaste={senaste} onOppnaSenaste={setValdRunda} />
          </div>
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
