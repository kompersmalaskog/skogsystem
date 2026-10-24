'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, FONT, KNAPP, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
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
import Sektion from '@/components/design/Sektion';
import UppfoljningSida from './_components/UppfoljningSida';
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
import { useMaskiner } from './_components/useMaskiner';
import { useVikt } from './_components/useVikt';

/**
 * Lastbilen — EN sida utan flikar (omtaget 2026-10-19). Uppifrån, och i den ordningen alltid:
 *   1. "Hämta en maskin" / "Fortsätt hämta X" direkt under titeln — flyttar sig aldrig.
 * Varje kort är en FRÅGA med svaret först, i ord (omtag 2026-10-23, Martin: "så lätt att ett barn förstår"):
 *   2. "Var är bilen?": "Står vid LBC · Sedan igår", "Tanken räcker 540 km", och bara det som gäller nu (lampa, låg diesel, service, ingen kontakt under körning).
 *   3. "Vad behöver du göra?" (bara admin, bara när något väntar): lass som saknar maskin, flyttar som väntar på godkännande.
 *      "Vad ska faktureras?" (bara admin): "89 km i oktober ›", som öppnar fakturasidan (en egen sida med tillbaka-pil).
 *   4. "Vad har bilen gjort?": månadsväljaren, svaret "Flyttat maskiner 5 gånger" med körda km under, och rundorna ("Wisent till LBC");
 *      längst ner raden "Uppföljning ›" som öppnar årets sida (egen sida, "‹ Lastbilen" tillbaka) — där bor förbrukningen.
 * Förare ser 1, 2 och 4 — ingen fakturering. Pengatalet (fakturerbart-summan) är talet i "Vad ska faktureras?" och överst på
 * fakturasidan, och byter värde bara när PERIODEN byts.
 * Gamla länkar: ?flik=fakturering → fakturasidan (en förare får huvudsidan); ?flik=korningar och ?flik=nu → huvudsidan.
 * "Hämta en maskin" ersätter förarflödet /maskinflytt: kartappen gör navigeringen, Lassa och Lassat av är frivilliga.
 */
/** Huvudsidans bredd (container) från vilken den delas i två kolumner: iPad liggande och dator. */
export const TVA_KOLUMNER_PX = 900;

// Under TVA_KOLUMNER_PX: en kolumn, högst KOLUMN.smal bred, exakt som förut. Över: vänster 38 % sticky, höger resten.
const HUVUD_CSS = `
.lb-huvud-ram { container-type: inline-size; }
.lb-huvud { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
@container (min-width: ${TVA_KOLUMNER_PX}px) {
  .lb-huvud { max-width: none; display: grid; grid-template-columns: minmax(0, 38fr) minmax(0, 62fr); column-gap: ${AVSTAND.xxl}px; align-items: start; }
  .lb-vanster { position: sticky; top: calc(${LAYOUT.topbar} + ${AVSTAND.s}px); }
}
`;

export default function LastbilVy() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';

  // Hooks ligger ALLTID före tidiga returer (skillen: React #310 2026-10-02).
  const startUrl = () => lasUrl(typeof window === 'undefined' ? '' : window.location.search);
  const [onskadSida, setOnskadSida] = useState<Sida>(() => startUrl().sida);
  // Perioden är alltid en MÅNAD (den Körningar står på, också när Uppföljning är öppen); Uppföljning har sitt eget år.
  const [period, setPeriod] = useState<Manad>(() => startUrl().period ?? periodNu());
  const [ar, setAr] = useState<number>(() => startUrl().ar ?? periodNu().ar);

  // Fakturasidan finns bara för admin: en förare som följer en gammal länk dit får huvudsidan.
  const sida: Sida = onskadSida === 'fakturering' && !arAdmin ? 'huvud' : onskadSida;

  const [valdRunda, setValdRunda] = useState<{ id: string; start: string } | null>(null);
  // Hämta-flödet ersätter hela vyn medan det pågår. Adressen bär det (?hamta=1) så en omladdning landar kvar i flödet.
  const [hamtar, setHamtar] = useState<boolean>(() => lasHamtaUrl(typeof window === 'undefined' ? '' : window.location.search));

  const nu = useLastbilNu(!loading && !hamtar && sida === 'huvud');
  const fakt = useFakturerbart(period, arAdmin);
  // Uppföljningens Betalt-läge: årets underlag (bara admin, bara när sidan är öppen).
  const faktAr = useFakturerbart({ typ: 'ar', ar }, arAdmin && !loading && onskadSida === 'ar');
  // Uppföljningens "Maskiner": årets flyttar per maskin (alla roller, direkt ur maskin_flytt).
  const maskiner = useMaskiner(ar, !loading && onskadSida === 'ar');
  // Uppföljningens Förbrukning/Körsträcka: årets körning delad på med lass / utan lass ur bilens vikt (SQL-funktionen lastbil_vikt_manad).
  const vikt = useVikt(ar, !loading && onskadSida === 'ar');
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
  // En rättning i en maskins ark: maskinerna, årets Betalt, rundorna och påminnelsen läses om tyst.
  const { laddaOmTyst: maskinerTyst } = maskiner;
  const { laddaOmTyst: faktArTyst } = faktAr;
  const efterMaskinRattning = useCallback(() => { maskinerTyst(); faktArTyst(); faktTyst(); vantarTyst(); rundorTyst(); }, [maskinerTyst, faktArTyst, faktTyst, vantarTyst, rundorTyst]);
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
  // "Uppföljning ›" längst ner i Körningar: uppföljningssidan för månadens år; tillbaka-pilen går till Lastbilen (huvudsidan).
  const oppnaAr = useCallback(() => { window.scrollTo(0, 0); setAr(period.ar); setOnskadSida('ar'); }, [period.ar]);
  const valjManadFranAr = useCallback((m: Manad) => { window.scrollTo(0, 0); setPeriod(m); setOnskadSida('huvud'); }, []);

  // Påminnelsen: på fakturasidan räknas bara det som väntar UTANFÖR perioden listan redan visar.
  const paminn = vantar.lage.lage === 'klar' ? pamminnelse(vantar.lage.rader, sida === 'fakturering' ? period : null) : null;
  const oppnaVantande = useCallback((p: Pamminnelse) => {
    if (p.mal) setPeriod(p.mal);
    oppnaFakturering();
  }, [oppnaFakturering]);

  // "Vad behöver du göra?" finns bara när något väntar (lass eller flyttar) eller en läsning av dem föll — aldrig ett tomt kort.
  const harAttGora = saknar.lage.lage === 'fel' || (saknar.lage.lage === 'klar' && saknar.lage.rader.length > 0)
    || vantar.lage.lage === 'fel' || paminn != null;

  // Bilens senaste avslutade körning (ur Var är bilen?-datan): tomtexten i en tom månad öppnar den rundans ark.
  const senasteRunda = nu.lage.lage === 'klar' ? senasteKorning(nu.lage.data.rundor) : null;
  const senaste = senasteRunda?.starttid ? { id: senasteRunda.id, start: senasteRunda.starttid } : null;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}{KOLUMN_CSS}{HUVUD_CSS}</style>
      <VyKolumn bredd={!loading && !hamtar && sida === 'huvud' ? 'bred' : 'smal'}>
        {loading ? (
          <p role="status" style={{ color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser …</p>
        ) : hamtar ? (
          <HamtaFlode onAvsluta={efterHamta} arAdmin={arAdmin} namn={medarbetare?.namn || 'admin'} />
        ) : sida === 'ar' ? (
          <UppfoljningSida ar={ar} onAr={setAr} fakt={arAdmin ? { status: faktAr.status, forsokIgen: faktAr.forsokIgen } : null}
            vikt={{ lage: vikt.lage, forsokIgen: vikt.forsokIgen }} maskiner={{ lage: maskiner.lage, forsokIgen: maskiner.forsokIgen }} arAdmin={arAdmin} namn={medarbetare?.namn || 'admin'} onMaskinAndrad={efterMaskinRattning} lage={rundor.lage} onForsokIgen={rundor.forsokIgen}
            onTillbaka={tillHuvudsidan} onValjManad={valjManadFranAr} />
        ) : sida === 'fakturering' ? (
          <FaktureringSida period={period} onPeriod={setPeriod} status={fakt.status} namn={medarbetare?.namn || 'admin'}
            vantar={vantar.lage} pamminnelse={paminn} onOppnaVantande={oppnaVantande} onVantarForsokIgen={vantar.forsokIgen}
            onTillbaka={tillHuvudsidan} onForsokIgen={fakt.forsokIgen} onAndrad={efterAndring} />
        ) : (
          // Huvudsidan: en kolumn på telefon och iPad stående (samma ordning som förut). Från TVA_KOLUMNER_PX (iPad liggande,
          // dator) två kolumner: vänster det man GÖR (Hämta, Var är bilen?, Vad behöver du göra?, Vad ska faktureras?) — sticky så den står kvar — och höger det man
          // LÄSER (Körningar), som scrollar. Ingen mätning i JS: container query, inget hopp vid första renderingen.
          <div className="lb-huvud-ram" data-lastbil-huvud="">
            <div className="lb-huvud" style={{ paddingTop: AVSTAND.s }}>
              <div className="lb-vanster" data-lastbil-vanster="">
                <div style={{ marginBottom: AVSTAND.xl }}>
                  <HamtaKnapp forareId={medarbetare?.id ?? null} aktiv={!loading && !hamtar} onStart={startaHamta} />
                  {kvitto && (
                    <p role="status" data-lass-kvitto style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{kvitto}</p>
                  )}
                </div>
                <BilenNuKort lage={nu.lage} onForsokIgen={nu.forsokIgen} />
                {arAdmin && (
                  <>
                    {harAttGora && (
                      <AttGoraKort>
                        <SaknarMaskinRad lage={saknar.lage} onOppna={setValtLass} onForsokIgen={saknar.forsokIgen} />
                        <VantarRad lage={vantar.lage} pamminnelse={paminn} onOppna={oppnaVantande} onForsokIgen={vantar.forsokIgen} />
                      </AttGoraKort>
                    )}
                    <Sektion rubrik="Vad ska faktureras?">
                      <FaktureringRad period={period} status={fakt.status} onOppna={oppnaFakturering} onForsokIgen={fakt.forsokIgen} />
                    </Sektion>
                  </>
                )}
              </div>
              <div className="lb-hoger" data-lastbil-hoger="">
                <Korningar period={period} onPeriod={setPeriod} lage={rundor.lage} onForsokIgen={rundor.forsokIgen} onOppnaAr={oppnaAr}
                  onOppna={r => setValdRunda({ id: r.id, start: r.start })} senaste={senaste} onOppnaSenaste={setValdRunda} />
              </div>
            </div>
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
