'use client';

// Egenkontroll - rundan for ett objekt.
//
// Rundan skapas FORST nar planeraren trycker "Starta egenkontroll" - aldrig
// av att vyn oppnas. Att bara titta pa ett objekt far inte lamna spar i
// databasen, och det partiella unika indexet gor en oavsiktlig runda dyr:
// den blockerar varje nytt forsok tills nagon stadar bort den.
//
// TVA DELAR. Del 1 = planpunkterna, kontroll MOT PLANEN, svaras OK/Avvikelse.
// Del 2 = Utforandet, hantverket, svaras Bra/Godkant/Kan bli battre. De far
// aldrig dela svarsskala: "Kan bli battre" ar ingen avvikelse.
//
// KARTAN AR HELA VYN (PR 4, ramen). Huvud overst (pil, objektnamn, ETT tal: vad som aterstar), kartan under, och ett ark NEDERST
// som kan dras upp. Arkets understa lage ar dockan: raden for det markerade och de tio eller elva brickorna (utforandet). Brickorna
// ligger alltid overst i arket, sa man nar dem utan att byta lage och utan att tappa kartan. Rundan-innehallet (listan, kommentaren,
// observationerna, stubbehandlingen, avslutet) ligger under brickorna och syns nar arket dras upp.
//
// EN REGEL: TRYCK MARKERAR, RADEN SVARAR (lib/egenkontrollBricka.ts). Ett tryck pa en bricka markerar den; en OBESVARAD bricka far Bra i
// samma tryck (med Angra i fem sekunder). Raden under markeringen bar svaren: Bra, Godkant, Battre och "Foto - Not". Ett tryck pa en
// BESVARAD bricka skriver aldrig. Inga langtryck, inga svep, ingen gest att lara sig.
//
// Planpunkterna (kontroll MOT PLANEN, OK/Avvikelse) ligger pa kartan och i listan i arket; ett tryck pa en markerar den, och raden bar
// OK, Avvikelse och Foto - Not. Observationer ar tillagg ("Notera har" vid kartan) och ingar aldrig i "N kvar".
//
// Rundan skapas FORST nar planeraren trycker "Starta egenkontroll" - aldrig av att vyn oppnas.
//
// SJU MEDVETNA AVSTEG FRAN PLANERINGSVYN star som kodkommentarer dar de goers, markta "AVSTEG n/7":
//   1 RundDock.tsx (dockan med brickor)   2 Bricka.tsx (svarsstatus pa varje bricka)   3 har (kartan navigerar inte bort vid svar)
//   4 RundArk.tsx (tre lagen)   5 lib/egenkontrollBricka.ts (katalogdriven, ej redigerbar lista)   6 har (avslut i arket)
//   7 BrickaRad.tsx (lastriggern gor vyn helt lasbar nar rundan ar klar)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import SectionHeader from '@/components/SectionHeader';
import PageContainer from '@/components/PageContainer';
import { typLabel } from '@/lib/objekt/typ';
import { T } from '@/lib/listTema';
import {
  hamtaRunda,
  generateEgenkontroll,
  svaraPaPunkt,
  angraForstaSvaret,
  avslutaRunda,
  sparaRundKommentar,
  kompletteraRunda,
  saknadeUtforandepunkter,
  hamtaFoton,
  hamtaKontextmarkeringar,
  hamtaVidaGrans,
  hamtaProvytor,
  hamtaAvverkadeStammar,
  hamtaStammoln,
  hamtaHyttspar,
  punktPlatser,
  stubbeDom,
  KRAVNIVA_STUBBEHANDLING,
  type RundVy,
  type EgenkontrollPunkt,
  type PunktDel,
  type PunktStatus,
  type EgenkontrollFoto,
  type EgenkontrollProvyta,
} from '@/lib/egenkontroll';
import { signeraFoto } from '@/lib/egenkontrollfoto';
import AvvikelseSheet, { type SheetLage } from '../AvvikelseSheet';
import RundKarta from '../RundKarta';
import StubbeSheet from '../StubbeSheet';
import ProvytaSheet from '../ProvytaSheet';
import ObservationSheet from '../ObservationSheet';
import ObservationLista, { observationAntalText } from '../ObservationLista';
import ProvyteLista, { type MinPosition } from '../ProvyteLista';
import Forutsattningar from '../Forutsattningar';
import KartLagerMeny, { type EgetLager } from '@/components/KartLagerMeny';
import { BASKARTOR, BASKARTA_DEFAULT, type BaskartaId } from '@/lib/mapLayers';
import { useMapLayers, useStringSetting } from '@/lib/hooks/useMapLayers';
import ProvyteSammanstallning from '../ProvyteSammanstallning';
import RundKommentarSheet, { KOMMENTAR_FALT, KOMMENTAR_PLATSHALLARE } from '../RundKommentarSheet';
import RapportDela from '../RapportDela';
import { byggRapport } from '@/lib/egenkontrollRapport';
import { byggRapportIndata } from '@/lib/egenkontrollRapportIndata';
import { arUtkast, lasUtkast, rensaUtkast, sparaUtkast } from '@/lib/egenkontrollKommentarUtkast';
import GaTillYta from '../GaTillYta';
import { skadeandel as _skadeandel, type LatLng } from '@/lib/provytor';
import {
  beslutaOrigo,
  markeringsGranser,
  markeringsPunkter,
  origoForklaring,
  snapshotPunkter,
  type OrigoBeslut,
  type VidaGrans,
} from '@/lib/egenkontrollOrigo';
import { AVSLUTA_KONSEKVENS, anmarkningsText, kortDatum } from '../format';
import { AVSTAND, FARG, INAKTIV, KNAPP, KOLUMN, LAYOUT, RADIE, TRAFFYTA, TYP, designCss, medSafeBotten } from '@/lib/design/tokens';
import KartHuvud, { underKartHuvud } from '@/components/design/KartHuvud';
import KartKnapp from '@/components/design/KartKnapp';
import Ikon from '@/components/design/Ikon';
import { CentreraKnapp } from '@/components/planering/CentreraKnapp';
import RundArk from '../RundArk';
import RundDock from '../RundDock';
import BrickaRad from '../BrickaRad';
import { useKartPadding } from '../useKartPadding';
import { ANGRA_MS, DOCK_SKYDD_MS, brickaTryck, byggBrickor, inomDockSkydd, kvarText, svarsDel, type Bricka as BrickaData } from '@/lib/egenkontrollBricka';
import { nastaGreppLage, type ArkLage } from '@/lib/egenkontrollArk';
import {
  UTAN_POSITION_MENING,
  avstandPerPunkt as beraknaAvstand,
  positionSkalText,
} from '@/lib/egenkontrollFlode';
import { useLevandePosition, type LevandePosition } from '../useMinPosition';
import { GUL, statusEtikett } from '../svar';
import { avslutaStatus } from '@/lib/egenkontrollAvsluta';

/** Hela meter. GPS:en under krontak ar 5-15 m - decimaler hade latsats om en
 *  precision som inte finns. Over en kilometer: en decimal i km. */
function avstandText(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

// Egenkontrollens egna lager i kartmenyn.
//
// TRE TOGGLAR, INTE FEM. "Din position" har ingen: den ar ankaret, och den som
// rakar slacka sig sjalv i skogen vinner ingenting pa det. Avvikelser har inget
// eget lager heller - de AR kontrollpunkter med en status, och tva strombrytare
// for samma punkt skulle gora att den kan vara bade tand och slackt.
const EGNA_LAGER: EgetLager[] = [
  { id: 'ekPunkter', namn: 'Kontrollpunkter', beskrivning: 'Punkterna ur planen, fargade efter svar' },
  { id: 'ekProvytor', namn: 'Provytor', beskrivning: 'Lottade ytor, matta och omatta' },
  { id: 'ekObservationer', namn: 'Observationer', beskrivning: 'Det du själv noterat ute på rundan' },
  { id: 'ekStammar', namn: 'Avverkade stammar', beskrivning: '' },
];

/** Stammolnets rad sager sitt eget tillstand - tomt far inte betyda tva saker. */
function stamBeskrivning(stammar: LatLng[] | null, fel: boolean): string {
  if (stammar === null) return 'Hämtas när lagret slås på';
  if (fel) return 'Kunde inte läsas — försök igen senare';
  if (stammar.length === 0) return 'Inga hittades för objektet';
  return `${stammar.length.toLocaleString('sv-SE')} stammar ur maskindatan`;
}

/** Rad i avslutsdialogen. Siffran ar hogerstalld sa tre rader gar att skanna. */
function Sammanfattningsrad({
  etikett,
  varde,
  farg,
}: {
  etikett: string;
  varde: string;
  farg?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
      <span style={{ color: T.t2 }}>{etikett}</span>
      <span style={{ fontWeight: 600, color: farg ?? T.t1 }}>{varde}</span>
    </div>
  );
}

/**
 * Matningskortet. Ingen svarsskala - matningen ar ett TAL, och statusen faller
 * ut av det. Kortstorleken foljer PunktKort, som ar bekraftad i falt.
 */
function MatningsKort({
  punkt,
  fotoUrler,
  last,
  onOppna,
}: {
  punkt: EgenkontrollPunkt;
  fotoUrler: string[];
  last: boolean;
  onOppna: () => void;
}) {
  const varde = punkt.varde_bekraftat != null ? Number(punkt.varde_bekraftat) : null;
  const dom = varde != null ? stubbeDom(varde) : null;
  const domFarg = dom == null ? T.t2 : dom.status === 'ok' ? T.green : GUL;
  const antalStubbar = fotoUrler.length;

  return (
    <div style={{ background: T.group, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{punkt.rubrik}</div>

      {varde == null ? (
        <div style={{ fontSize: 13, color: T.t2, fontWeight: 600, margin: '2px 0 0' }}>
          Obesvarad
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: domFarg, fontWeight: 600, margin: '2px 0 0' }}>
            {varde} % · {dom!.text}
            {antalStubbar > 1 && (
              <span style={{ color: T.t2, fontWeight: 400 }}>
                {' · '}{antalStubbar} stubbar
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.t2, marginTop: 2 }}>
            Kravnivå {KRAVNIVA_STUBBEHANDLING} %
          </div>
        </>
      )}

      {fotoUrler.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {fotoUrler.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          ))}
        </div>
      )}

      {!last && (
        <button
          onClick={onOppna}
          style={{
            marginTop: 10, width: '100%', minHeight: 44, borderRadius: 10,
            border: `1.5px solid ${varde == null ? T.green : 'rgba(255,255,255,0.14)'}`,
            background: varde == null ? T.green : 'transparent',
            color: varde == null ? '#000' : T.t1,
            fontSize: 16, fontWeight: 600, fontFamily: T.ff,
          }}
        >
          {varde == null ? 'Mät stubbehandling' : 'Fler stubbar'}
        </button>
      )}
    </div>
  );
}

/**
 * En planpunkt som INTE har nagon plats pa kartan (ingen betrodd kartplacering): den enda vagen att MARKERA den. Alla andra planpunkter markeras
 * genom att man trycker pa dem pa kartan - de ar aldrig med har. Raden svarar aldrig sjalv: ett tryck markerar punkten och raden i dockan
 * bar svarsknapparna, precis som for en punkt pa kartan.
 */
function PunktRad({
  punkt,
  markerad,
  onMarkera,
}: {
  punkt: EgenkontrollPunkt;
  markerad: boolean;
  onMarkera: () => void;
}) {
  const besvarad = punkt.status !== null;
  const et = statusEtikett(punkt.status);
  return (
    <button
      type="button"
      onClick={onMarkera}
      aria-pressed={markerad}
      aria-label={`${punkt.rubrik} — markera`}
      data-testid="plan-rad"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s,
        border: 'none', borderRadius: RADIE.kort, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
        background: markerad ? FARG.text : FARG.upphojt, color: markerad ? FARG.bg : FARG.text, WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ ...TYP.listtitel }}>{punkt.rubrik}</span>
      <span style={{ ...TYP.meta, color: markerad ? FARG.bg : besvarad ? et.farg : FARG.text2, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {besvarad ? `✓ ${et.text}` : 'Kvar'}
      </span>
    </button>
  );
}

/**
 * Positionens tillstand i klartext. Sager rakt ut vad som saknas och varfor,
 * och ger en vag tillbaka (ett tryck startar bevakningen om, i en gest).
 * Ritar ingenting nar positionen duger.
 */
function PositionRad({ pos }: { pos: LevandePosition }) {
  if (pos.status === 'ok') return null;
  if (pos.status === 'soker') {
    return (
      <div role="status" style={{ fontSize: 14, color: T.t2 }}>
        Söker din position…
      </div>
    );
  }
  const skal = positionSkalText(pos.skal, pos.senasteNoggrannhet);
  return (
    <div role="status" style={{ fontSize: 13, color: T.orange, lineHeight: 1.45 }}>
      <div>{UTAN_POSITION_MENING}</div>
      {skal && <div style={{ color: T.t2 }}>{skal}</div>}
      <button
        onClick={pos.forsokIgen}
        style={{
          marginTop: 6, minHeight: 44, width: '100%', borderRadius: 10,
          border: '1.5px solid rgba(255,255,255,0.14)', background: 'transparent',
          color: T.t1, fontSize: 15, fontWeight: 600, fontFamily: T.ff,
        }}
      >
        Försök hämta positionen igen
      </button>
    </div>
  );
}

export default function EgenkontrollRundaPage() {
  const params = useParams<{ objektId: string }>();
  const objektId = params.objektId;

  const [vy, setVy] = useState<RundVy | null>(null);
  const [laddarRunda, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [startar, setStartar] = useState(false);
  const [sparStatus, setSparStatus] = useState<Record<string, boolean>>({});
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [visaAvslutsdialog, setVisaAvslutsdialog] = useState(false);
  // Signerade URL:er per punkt. Misslyckad signering ger INGEN post - kortet
  // visar da ingen miniatyr i stallet for en trasig bildikon.
  const [fotoPerPunkt, setFotoPerPunkt] = useState<Record<string, string[]>>({});
  // Fotoraderna som de ar (sokvag, punkt, tackningsgrad) - rapportens bilaga behover dem, kortet bara URL:erna.
  const [fotoRader, setFotoRader] = useState<EgenkontrollFoto[]>([]);
  const [sheet, setSheet] = useState<{ lage: SheetLage; punkt: EgenkontrollPunkt } | null>(null);
  // Markerad punkt: en bricka (utforande) eller en planpunkt pa kartan/i listan. Raden i dockan visar den.
  const [markeradId, setMarkeradId] = useState<string | null>(null);
  const [stubbePunkt, setStubbePunkt] = useState<EgenkontrollPunkt | null>(null);
  const [provytor, setProvytor] = useState<EgenkontrollProvyta[]>([]);
  const [provytaVald, setProvytaVald] = useState<EgenkontrollProvyta | null>(null);
  // "Notera har": ny observation (med positionen i det ogonblick man tryckte) eller en befintlig som oppnats for andring.
  const [observationSheet, setObservationSheet] = useState<
    | { lage: 'ny'; start: { lat: number; lng: number; noggrannhet: number | null } | null }
    | { lage: 'andra'; observation: EgenkontrollPunkt }
    | null
  >(null);

  // DIN POSITION, levande. Sidan ager bevakningen och delar ut den - kartan,
  // kortet och listan ska aldrig kunna vara oense om var man ar.
  const pos = useLevandePosition();
  const minPosition: MinPosition = pos.position;

  // ARKETS LAGE och det MARKERADE: val man gjort pa skarmen - ingenting harleds, ingenting lagras.
  const [arkLage, setArkLage] = useState<ArkLage>('dock');
  // Kartans padding mats om nar arket bytt lage (matNyckel); sidoknapparna doljs medan arket dras.
  const huvudRef = useRef<HTMLElement>(null);
  const malRef = useRef<HTMLDivElement>(null);
  const [matNyckel, setMatNyckel] = useState('');
  const [drar, setDrar] = useState(false);
  const [centreraPa, setCentreraPa] = useState<{ lat: number; lng: number } | null>(null);
  // Angra efter ett svar som ett TRYCK pa en bricka skrev (ANGRA_MS). Bara det forsta svaret - att andra ett svar gors med raden.
  const [angra, setAngra] = useState<{ punktId: string; rubrik: string } | null>(null);
  // DOCKVAKTEN (lib/egenkontrollBricka.ts, DOCK_SKYDD_MS): tidpunkten da skyddet efter senaste svaret i dockan upphor. Ett ref, inte state: ingenting ritas om.
  const dockSkyddTill = useRef(0);
  // KARTLAGREN. overlays delas med planeringsvyn genom mapLayers_v4 - slar
  // man pa Markfuktighet har ar den pa dar ocksa, och tvartom. Baskartan
  // sparas per vy: planeringsvyn haller sin i en vanlig useState och tappar
  // valet vid varje omladdning, egenkontrollen minns det. Skillnaden ar
  // avsiktlig och forsvinner i PR B.
  const [overlays, setOverlays] = useMapLayers();
  const [baskarta, setBaskarta] = useStringSetting<BaskartaId>(
    'egenkontroll_baskarta', BASKARTA_DEFAULT, BASKARTOR.map((b) => b.id),
  );
  const [lagerMeny, setLagerMeny] = useState(false);

  // Egenkontrollens egna lager. Punkter och provytor ar PA som default - de ar
  // vad rundan handlar om. Stammolnet ar av: det ar 12 000 prickar som ska
  // tandas nar man vill se var det ar kort, inte ligga och skrapa.
  const [egnaVarden, setEgnaVarden] = useState<Record<string, boolean>>({
    ekPunkter: true, ekProvytor: true, ekObservationer: true, ekStammar: false,
  });
  const visaStammar = egnaVarden.ekStammar === true;
  const [gaTill, setGaTill] = useState<EgenkontrollProvyta | null>(null);
  // Stammarna hamtas EN gang och bara nar lagret slas pa i menyn.
  const [stammar, setStammar] = useState<LatLng[] | null>(null);
  const [stamFel, setStamFel] = useState(false);
  // Kontextlagret - orientering, aldrig dokumentets innehall.
  const [kontext, setKontext] = useState<{ data: any }[]>([]);
  // Kontexten och Vidas traktgrans ar UNDERLAGET till origobeslutet (beslutaOrigo). Medan de laddas, eller om de inte gick att lasa, ar origot
  // inte beslutat - det far aldrig tolkas som "inga markeringar" (da hade en strikt kontroll tyst blivit en svag).
  const [kontextStatus, setKontextStatus] = useState<'laddar' | 'ok' | 'fel'>('laddar');
  const [vida, setVida] = useState<VidaGrans>({ typ: 'laddar' });
  const [avslutar, setAvslutar] = useState(false);
  // Rundans kommentar: utkastet (null = inget utkast, det sparade galler) och arket. Samma falt skrivs i arket och i avslutsdialogen.
  const [kommentarUtkast, setKommentarUtkast] = useState<string | null>(null);
  const [visaKommentar, setVisaKommentar] = useState(false);
  // Utforandepunkter som saknas pa rundan och inte gick att lagga till (ingen tackning) - sags i listan, aldrig tyst.
  const [kompletteringSaknas, setKompletteringSaknas] = useState(0);

  // TYST OMLASNING. Efter varje sparad avvikelse, provyta och stubbe las rundan om -
  // och den gamla ladda() satte laddar=true, sa HELA vyn byttes mot "Hamtar
  // rundan…" och kartan avmonterades mitt i rundan. Kartan ar nu huvudsaken, sa
  // en omlasning far aldrig synas: gamla vyn star kvar tills den nya ar framme,
  // och ett fel pa vagen ar ett meddelande, inte en tom skarm.
  const ladda = useCallback(async (val: { tyst?: boolean } = {}) => {
    if (!val.tyst) { setLaddar(true); setFel(null); }
    try {
      let rund = await hamtaRunda(objektId);
      // RYGGRADEN: en PAGAENDE runda far de utforandepunkter katalogen kraver NAR DEN OPPNAS (additivt, se kompletteraRunda). Bara vid en riktig
      // oppning, inte vid de tysta omlasningarna efter varje sparning - en misslyckad komplettering ska inte gora varje sparning langsammare.
      // Gar det inte (ingen tackning) oppnas rundan som forut och sidan sager hur manga punkter som saknas.
      if (rund.egenkontroll && rund.egenkontroll.status !== 'klar' && !val.tyst) {
        const saknas = saknadeUtforandepunkter(rund.egenkontroll.objekt_typ, rund.punkter.map((p) => p.punkt_typ)).length;
        if (saknas > 0) {
          try {
            await kompletteraRunda(rund.egenkontroll.id);
            rund = await hamtaRunda(objektId);
            setKompletteringSaknas(0);
          } catch {
            setKompletteringSaknas(saknas);
          }
        } else {
          setKompletteringSaknas(0);
        }
      }
      setVy(rund);
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Kunde inte hämta egenkontrollen.';
      if (val.tyst) {
        setSparFel(`Ändringen sparades, men rundan kunde inte läsas om: ${text} Ladda om sidan.`);
      } else {
        setVy(null);
        setFel(text);
      }
    } finally {
      if (!val.tyst) setLaddar(false);
    }
  }, [objektId]);

  useEffect(() => {
    ladda();
  }, [ladda]);

  // Stammolnet: hamtas forst nar lagret slas pa i menyn, och bara en gang. Det ar
  // 12 000 rader pa en gallring. Forr hamtades det nar den stora kartan oppnades;
  // nu ar kartan standardvyn, och da skulle varje runda ladda 12 000 rader i onodan.
  const vo = vy?.kartObjekt?.vo_nummer ?? null;
  useEffect(() => {
    if (!visaStammar || stammar !== null || !vo) return;
    let avbruten = false;
    hamtaAvverkadeStammar(vo)
      .then((s) => { if (!avbruten) { setStammar(s); setStamFel(false); } })
      .catch(() => { if (!avbruten) { setStammar([]); setStamFel(true); } });
    return () => { avbruten = true; };
  }, [visaStammar, stammar, vo]);

  // Kontextmarkeringarna hamtas separat: gar de inte att lasa ska kartan anda
  // rita kontrollpunkterna, som ar det dokumentet handlar om.
  useEffect(() => {
    let avbruten = false;
    setKontextStatus('laddar');
    hamtaKontextmarkeringar(objektId)
      .then((m) => { if (!avbruten) { setKontext(m as { data: any }[]); setKontextStatus('ok'); } })
      .catch(() => { if (!avbruten) { setKontext([]); setKontextStatus('fel'); } });
    return () => { avbruten = true; };
  }, [objektId]);

  // Vidas traktgrans (L_TRAKTDEL), for kvittot i beslutaOrigo. Hamtas en gang per objekt; har objektet kartbild_bounds behovs den inte
  // (beslutaOrigo vantar inte pa den da), och zip-objekten har ingen geometrirad.
  useEffect(() => {
    let avbruten = false;
    setVida({ typ: 'laddar' });
    hamtaVidaGrans(objektId)
      .then((g) => { if (!avbruten) setVida(g); })
      .catch((e) => { if (!avbruten) setVida({ typ: 'fel', meddelande: e instanceof Error ? e.message : undefined }); });
    return () => { avbruten = true; };
  }, [objektId]);

  // PROVYTOR OCH FOTON hamtas separat fran rundan - och las om efter VARJE sparad
  // andring (se onSparad nedan).
  //
  // Forr las den har effekten bara pa rundans id, och ladda() andrar aldrig det.
  // Efter en sparad provytematning visade darfor kartan, listan och sammanstallningen
  // ytan som omatt tills sidan laddades om - sedan provytorna byggdes (PR 9). Samma
  // sak gallde fotominiatyrerna efter en avvikelse eller en stubbe.
  //
  // Bilderna signeras efterat, och provytorna och fotona hamtas var for sig: en
  // misslyckad signering ska aldrig gora att punkterna inte gar att besvara, och
  // ett fel pa fotona far aldrig tomma provytorna (forr gjorde det det - ett
  // gemensamt catch).
  //
  // Lopnumret gor att det SENASTE anropet vinner. Tva sparningar tat efter varandra
  // far annars svaren i fel ordning, och den aldre kan skriva over den nyare.
  const rundaId = vy?.egenkontroll?.id;
  // Forst nar provytorna ar inlasta kan Avsluta-knappen veta om nagon yta ar omatt; annars blinkar den till aktiv.
  const [ytorLasta, setYtorLasta] = useState(false);
  const tillbehorLopnr = useRef(0);
  const laddaTillbehor = useCallback(async (omlasning = false) => {
    const mitt = ++tillbehorLopnr.current;
    const galler = () => mitt === tillbehorLopnr.current;
    if (!rundaId) { setFotoPerPunkt({}); setFotoRader([]); setProvytor([]); setYtorLasta(false); return; }
    let miste = false;
    try {
      const ytor = await hamtaProvytor(rundaId);
      if (galler()) setProvytor(ytor);
    } catch {
      // Forsta laddningen: tomt, som forr. Omlasning: behall det som visas och SAG det.
      if (galler()) { if (omlasning) miste = true; else setProvytor([]); }
    }
    if (galler()) setYtorLasta(true);
    try {
      const foton = await hamtaFoton(rundaId);
      const par = await Promise.all(
        foton.map(async (f: EgenkontrollFoto) => ({
          punktId: f.punkt_id,
          url: await signeraFoto(f.sokvag),
        })),
      );
      if (!galler()) return;
      const karta: Record<string, string[]> = {};
      for (const p of par) {
        if (!p.punktId || !p.url) continue; // osignerbar bild hoppas over tyst i kortet
        (karta[p.punktId] ??= []).push(p.url);
      }
      setFotoPerPunkt(karta);
      setFotoRader(foton);
    } catch {
      if (galler()) { if (omlasning) miste = true; else { setFotoPerPunkt({}); setFotoRader([]); } }
    }
    if (miste && galler()) {
      setSparFel('Ändringen sparades, men provytor eller bilder kunde inte läsas om. Ladda om sidan.');
    }
  }, [rundaId]);

  useEffect(() => {
    laddaTillbehor();
    // Avmontering eller ny runda: kasta svar som fortfarande ar pa vag.
    return () => { tillbehorLopnr.current++; };
  }, [laddaTillbehor]);

  const starta = async () => {
    setStartar(true);
    setSparFel(null);
    try {
      await generateEgenkontroll(objektId);
      await ladda();
    } catch (e) {
      setSparFel(e instanceof Error ? e.message : 'Kunde inte starta egenkontrollen.');
    } finally {
      setStartar(false);
    }
  };

  const svara = async (punkt: EgenkontrollPunkt, status: PunktStatus): Promise<boolean> => {
    // Trycket pa redan valt svar ar en no-op: ingen skrivning, ingen blink. Det raknas
    // som lyckat - serien gar da vidare utan att skriva nagot.
    if (punkt.status === status) return true;
    setSparStatus((s) => ({ ...s, [punkt.id]: true }));
    setSparFel(null);
    try {
      // Delen skickas med sa en punkt inte kan fa fel statusklass.
      const sparad = await svaraPaPunkt(punkt.id, status, punkt.del as PunktDel);
      // Ersatt raden med den som DB faktiskt returnerade - skarmen visar det
      // som star i databasen, aldrig det vi hoppades skriva.
      setVy((v) =>
        v ? { ...v, punkter: v.punkter.map((p) => (p.id === sparad.id ? sparad : p)) } : v,
      );
      return true;
    } catch (e) {
      setSparFel(e instanceof Error ? e.message : 'Kunde inte spara svaret.');
      return false;
    } finally {
      setSparStatus((s) => ({ ...s, [punkt.id]: false }));
    }
  };

  const avsluta = async () => {
    if (!vy?.egenkontroll) return;
    setAvslutar(true);
    setSparFel(null);
    try {
      // KOMMENTAREN FORST: skrivs den inte ska rundan inte heller avslutas - efteraat gar den inte att andra. Gar sparningen fel
      // stannar texten kvar som utkast och rundan ar fortfarande oppen.
      if (arUtkast(kommentarUtkast, vy.egenkontroll.kommentar)) {
        try {
          await sparaRundKommentar(vy.egenkontroll.id, kommentarUtkast);
        } catch (e) {
          setVisaAvslutsdialog(false);
          setSparFel(`Rundan är inte avslutad — kommentaren sparades inte. ${e instanceof Error ? e.message : ''} Det du skrivit ligger kvar.`.trim());
          return;
        }
        rensaUtkast(vy.egenkontroll.id);
        setKommentarUtkast(null);
      }
      await avslutaRunda(vy.egenkontroll.id);
      setVisaAvslutsdialog(false);
      await ladda(); // las om fran DB - skarmen visar det som faktiskt star dar
    } catch (e) {
      setVisaAvslutsdialog(false);
      setSparFel(e instanceof Error ? e.message : 'Kunde inte avsluta rundan.');
    } finally {
      setAvslutar(false);
    }
  };

  const planpunkter = useMemo(
    () => (vy?.punkter ?? []).filter((p) => p.del === 'plan'),
    [vy?.punkter],
  );
  const matningspunkter = useMemo(
    () => (vy?.punkter ?? []).filter((p) => p.del === 'matning').sort((a, b) => a.ordning - b.ordning),
    [vy?.punkter],
  );
  // FALLBACK: en framtida del far aldrig falla bort tyst. Allt som inte ar
  // plan/utforande/matning hamnar i en egen sektion i stallet for att
  // forsvinna - avslutaRunda raknar den anda, och en punkt som kravs men inte
  // syns gor rundan omojlig att avsluta.
  const ovrigaPunkter = useMemo(
    () => (vy?.punkter ?? [])
      .filter((p) => !['plan', 'utforande', 'matning'].includes(p.del))
      .sort((a, b) => a.ordning - b.ordning),
    [vy?.punkter],
  );

  // ORIGO: objektStartKamera, SAMMA som planeringsvyn, med ett kvitto mot Vidas traktgrans nar objektet saknar kartbild_bounds
  // (lib/egenkontrollOrigo.ts - lasa huvudet dar innan du andrar nagot har, och SKRIV ALDRIG kartbild_bounds for att losa det).
  // Ingen egen regel har: att den var "bara bounds" gjorde alla objekt fran Vidas envz-leverans blinda.
  const origoBeslut = useMemo<OrigoBeslut>(
    () => beslutaOrigo({
      objekt: vy?.kartObjekt ?? null,
      punkter: [...snapshotPunkter(vy?.punkter ?? []), ...markeringsPunkter(kontext)],
      granser: markeringsGranser(kontext),
      // Utan lasta markeringar vet kvittot inte om det finns gransmarkeringar: da ar beslutet inte taget (aldrig en tyst svagare kontroll).
      vida: kontextStatus === 'laddar' ? { typ: 'laddar' }
        : kontextStatus === 'fel' ? { typ: 'fel', meddelande: 'Markeringarna gick inte att läsa.' }
        : vida,
    }),
    [vy?.kartObjekt, vy?.punkter, kontext, kontextStatus, vida],
  );
  const origoText = origoForklaring(origoBeslut);
  // Origot ar inte beslutat an (Vidas traktgrans / markeringarna laddas): vyn laddar. Annars hade en runda utan kartbild_bounds oppnats i
  // LISTAN och last dar - startvalet fryser forsta gangen (effekten nedan) - trots att kartan hade gatt att anvanda en kort stund senare.
  const origoVantar = !!vy?.egenkontroll && !origoBeslut.ok && origoBeslut.skal === 'laddar';
  const laddar = laddarRunda || origoVantar;
  // Stabil identitet efter VARDE: en tyst omlasning bygger nya objekt, och kartans geometrier far inte byggas om for det.
  const origoVarde = origoBeslut.ok ? origoBeslut.origo : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const origo = useMemo(() => origoVarde, [origoVarde?.lat, origoVarde?.lng, origoVarde?.zoom]);

  // Avstand och riktning per punkt (en LINJE matas till sin narmaste brytpunkt -
  // lib/egenkontrollFlode.ts), ur din position nu. Visas pa raden i dockan for den markerade planpunkten.
  const avstandLive = useMemo(
    () => beraknaAvstand(planpunkter, origo, minPosition),
    [planpunkter, origo, minPosition],
  );

  // Punkterna som FINNS pa kartan. De markeras genom att man trycker pa dem dar. Resten gissas aldrig in pa kartan - de far en egen,
  // snal lista i arket (planUtanPlats) sa att de inte blir omojliga att besvara.
  const harPlats = useMemo(() => {
    const s = new Set<string>();
    if (!origo) return s;
    for (const p of planpunkter) if (punktPlatser(p, origo).length > 0) s.add(p.id);
    return s;
  }, [planpunkter, origo]);
  const antalAvvikelser = planpunkter.filter((p) => p.status === 'avvikelse').length;
  const antalMatning = matningspunkter.length;
  const besvaradeMatning = matningspunkter.filter((p) => p.status !== null).length;

  // Avslutet raknar BADA delarna. Kvar-talet ar det som faktiskt aterstar,
  // aldrig en gissning - det star pa knappen sa man vet hur langt man har kvar
  // utan att blada.
  const allaPunkter = vy?.punkter ?? [];
  // OBSERVATIONER ar tillagg, inga punkter: de ar redan bortdelade i hamtaRunda och ingar aldrig i allaPunkter,
  // kvar, "N av M klara" eller avslutsknappen.
  const observationer = vy?.observationer ?? [];
  const kvar = allaPunkter.filter((p) => p.status === null).length;
  const antalBattre = allaPunkter.filter((p) => p.status === 'battre').length;
  const rundanKlar = vy?.egenkontroll?.status === 'klar';

  // RUNDANS KOMMENTAR. Ett utkast som sparats lokalt (appen laddades om, tackningen forsvann) tas tillbaka nar rundan laddats - men bara
  // om det skiljer sig fran det som redan star pa servern, och aldrig for en klar runda (den ar last). Servern ar sanningen.
  const rundaKommentar = vy?.egenkontroll?.kommentar ?? null;
  useEffect(() => {
    if (!rundaId || rundanKlar) { setKommentarUtkast(null); return; }
    const lagrad = lasUtkast(rundaId);
    if (arUtkast(lagrad, rundaKommentar)) setKommentarUtkast(lagrad);
    else { if (lagrad !== null) rensaUtkast(rundaId); setKommentarUtkast(null); }
  }, [rundaId, rundanKlar, rundaKommentar]);
  const kommentarText = kommentarUtkast ?? rundaKommentar ?? '';
  const andraKommentar = (t: string) => { setKommentarUtkast(t); if (rundaId) sparaUtkast(rundaId, t); };
  // AVSLUTA RAKNAR BADA SLAGEN, som avslutaRunda. Forr raknade knappen bara punkterna: den var
  // aktiv med omatta provytor kvar och gav sedan ett fel ("6 provytor aterstar") - sedan
  // provytorna byggdes. Sa "kan avslutas" och "avslutaRunda tar emot det" kan inte vara oense.
  const avsl = avslutaStatus(allaPunkter, provytor);
  const kanAvsluta = !!vy?.egenkontroll && !rundanKlar && avsl.kan && ytorLasta;

  // --- BRICKORNA OCH DET MARKERADE ------------------------------------------
  const brickor = useMemo(() => byggBrickor(vy?.punkter ?? []), [vy?.punkter]);
  const markerad = markeradId ? allaPunkter.find((p) => p.id === markeradId) ?? null : null;
  // ETT tal i huvudet: allt som aterstar (punkter OCH provytor), samma som avslutsknappen raknar.
  const kvarTotalt = avsl.kvarPunkter + avsl.kvarProvytor;
  // Kartan ar hela vyn nar rundan finns och ar inladdad - ocksa utan koordinater (da tom bakgrund + en forklarande rad, brickorna fungerar anda).
  const kartaSynlig = !!vy?.egenkontroll && !laddar && !fel;
  const mat = useKartPadding(huvudRef, malRef, kartaSynlig, matNyckel);

  // RAPPORTENS KARTLAGER hamtas bara for en AVSLUTAD runda (stammolnet kan vara over 12 000 punkter): stammoln och hyttspar, var for sig sa att
  // ett fel pa det ena aldrig tar det andra. Ett lasfel blir null och sags pa kartan - aldrig "inga stammar".
  const [rapportKartdata, setRapportKartdata] = useState<{
    stammar: LatLng[] | null; antalStammar: number | null; hyttspar: Awaited<ReturnType<typeof hamtaHyttspar>> | null;
  } | null>(null);
  useEffect(() => {
    if (!rundanKlar || !vo) { setRapportKartdata(null); return; }
    let avbruten = false;
    (async () => {
      const [st, hy] = await Promise.allSettled([hamtaStammoln(vo), hamtaHyttspar(objektId)]);
      if (avbruten) return;
      setRapportKartdata({
        stammar: st.status === 'fulfilled' ? st.value.punkter : null,
        antalStammar: st.status === 'fulfilled' ? st.value.antal : null,
        hyttspar: hy.status === 'fulfilled' ? hy.value : null,
      });
    })();
    return () => { avbruten = true; };
  }, [rundanKlar, vo, objektId]);

  // RAPPORTEN (A4 + bilaga): bara pa en AVSLUTAD runda. Samma tillstand som sidan visar - origot ar det som beslutaOrigo betrodde
  // (null = inga platser och ingen traktgrans i rapporten, hellre farre pinnar an en punkt pa fel plats).
  const rapportModell = useMemo(() => {
    if (!vy?.egenkontroll || vy.egenkontroll.status !== 'klar' || !rapportKartdata) return null;
    return byggRapport(byggRapportIndata({
      objektNamn: vy.objektNamn,
      voNummer: vy.kartObjekt.vo_nummer,
      runda: vy.egenkontroll,
      punkter: vy.punkter,
      observationer: vy.observationer,
      foton: fotoRader,
      provytor,
      origo,
      granserXy: markeringsGranser(kontext),
      // Kartlagren: ett lasfel ar null (sagt i rapporten), aldrig "inga".
      kontext: kontextStatus === 'ok' ? kontext : null,
      stammar: rapportKartdata.stammar,
      antalStammar: rapportKartdata.antalStammar,
      hyttspar: rapportKartdata.hyttspar,
      areal: vy.kartObjekt.areal ?? null,
    }));
  }, [vy, fotoRader, provytor, origo, kontext, kontextStatus, rapportKartdata]);

  // ANGRA star i ANGRA_MS - och forsvinner om svaret hunnit andras med raden (da vore Angra att skriva over ett annat svar).
  useEffect(() => {
    if (!angra) return;
    const t = setTimeout(() => setAngra(null), ANGRA_MS);
    return () => clearTimeout(t);
  }, [angra]);
  useEffect(() => {
    if (angra && allaPunkter.find((p) => p.id === angra.punktId)?.status !== 'bra') setAngra(null);
  }, [angra, allaPunkter]);

  /** Tryck pa en bricka: markera ALLTID; en obesvarad far Bra i samma tryck (lib/egenkontrollBricka.ts, brickaTryck). */
  const trycktBricka = async (b: BrickaData) => {
    if (inomDockSkydd(Date.now(), dockSkyddTill.current)) return;
    const p = allaPunkter.find((q) => q.id === b.id);
    if (!p) return;
    const t = brickaTryck({ id: p.id, status: p.status }, rundanKlar);
    setMarkeradId(t.markera);
    if (t.svara === null) return;
    dockSkyddTill.current = Date.now() + DOCK_SKYDD_MS;
    if (await svara(p, t.svara)) setAngra({ punktId: p.id, rubrik: p.rubrik });
  };

  // AVSTEG 3/7 FRAN PLANERINGSVYN: KARTAN NAVIGERAR INTE BORT NAR MAN SVARAR.
  // Planeringsvyn flyttar kameran till det man just gjort (en ny symbol, en ny markering). Den tidigare rundvyn gjorde likadant: efter ett
  // svar gick kortet - och med det kartan - vidare till nasta narmaste obesvarade punkt. Det ar bra i en bil och fel till fots: den som just
  // svarat vill se vad hen svarade, och en karta som hoppar medan fingret ar kvar pa skarmen ger ett oavsiktligt tryck pa nasta sak.
  // Darfor: ett svar skriver svaret och ror ingenting annat. Ingen auto-markering av "nasta", ingen kameraflytt, ingen timer. Kartan flyttar
  // sig bara nar man SJALV markerar en punkt (tryck pa en symbol eller en rad i listan) eller trycker Centrera.
  const radSvarar = (status: PunktStatus) => {
    if (!markerad || inomDockSkydd(Date.now(), dockSkyddTill.current)) return;
    // Bara ett tryck som SKRIVER startar skyddet (samma svar igen skriver ingenting).
    if (markerad.status !== status) dockSkyddTill.current = Date.now() + DOCK_SKYDD_MS;
    void svara(markerad, status);
  };

  /** Tryck pa en symbol pa kartan eller en rad i listan: markera punkten och ha dockan framme sa att raden syns. */
  const markeraPunkt = (id: string) => { setMarkeradId(id); setArkLage('dock'); };

  const angraSvaret = async () => {
    const a = angra;
    if (!a) return;
    setAngra(null);
    setSparFel(null);
    try {
      await angraForstaSvaret(a.punktId, 'utforande', 'bra');
      await ladda({ tyst: true });
    } catch (e) {
      setSparFel(e instanceof Error ? e.message : 'Kunde inte ångra svaret.');
      await ladda({ tyst: true });
    }
  };

  /**
   * "Notera har": positionen tas NU, i trycket. Saknas den (ingen fix an) startar bevakningen om i samma tryck -
   * i en installerad PWA pa iOS ges ingen platsprompt utan en riktig gest - och arket tar forsta duglig fix.
   */
  const noteraHar = () => {
    setSparFel(null);
    if (pos.status === 'saknas') pos.forsokIgen();
    setObservationSheet({ lage: 'ny', start: pos.status === 'ok' ? pos.position : null });
  };

  // PLANPUNKTER UTAN PLATS PA KARTAN: de enda planpunkter som far en rad i arket. Alla andra markeras pa kartan och besvaras i raden i dockan -
  // en punkt har EN vag in, aldrig tva. Utan en betrodd kartplacering (t.ex. objekt vars traktgrans saknas, se lib/egenkontrollOrigo.ts) finns
  // ingen symbol att trycka pa, och da vore punkten omojlig att besvara och rundan omojlig att avsluta. Avslutad runda: ingen lista.
  const planUtanPlats = rundanKlar ? [] : planpunkter.filter((p) => !harPlats.has(p.id)).sort((a, b) => a.ordning - b.ordning);

  const sidoknapparSynliga = arkLage !== 'hel' && !drar;
  const sidoBottom = (extra: number) => `${mat.bottom + AVSTAND.m + extra}px`;
  /** En rad ovanfor arket, i arkets kolumn: tryck gar igenom mellan knapparna (pointerEvents none) och varje knapp slar pa sin egen. */
  const kolumnStil = (bottom: string): React.CSSProperties => ({
    position: 'fixed', left: 0, right: 0, bottom, marginLeft: 'auto', marginRight: 'auto', maxWidth: KOLUMN.ark, boxSizing: 'border-box', padding: `0 ${AVSTAND.l}px`,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 5,
  });

  // RUNDAN-INNEHALLET: det som syns nar arket dras upp, under brickorna. RUNDAN, INTE PUNKTERNA (Martin 2026-10-19): utforandepunkterna bor i
  // dockan och planpunkterna pa kartan, och ingen av dem har en rad har - annars gar samma punkt att namnge och markera pa tva stallen, och
  // det ar den gamla fraga-listan tillbaka bakom ett drag. Har ligger: objektets namn och atgard, vagbeskrivningen (PR 5), forutsattningarna,
  // kommentaren, matningarna (stubbehandling och provytor, som inte ar brickor), observationerna och avslutet. Undantaget ar planUtanPlats.
  const rundanInnehall = vy?.egenkontroll ? (
    <>
      <div style={{ marginTop: AVSTAND.s }} data-testid="rund-rubrik">
        <div style={{ ...TYP.rubrik }}>{vy.objektNamn}</div>
        <div style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{typLabel(vy.egenkontroll.objekt_typ)}</div>
        <p style={{ ...TYP.text, color: antalAvvikelser > 0 ? FARG.rod : antalBattre > 0 ? FARG.orange : FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
          {anmarkningsText(antalAvvikelser, antalBattre)}
        </p>
      </div>

      {/* VAGBESKRIVNINGEN: PR 5 lagger in den har, direkt under namn och atgard (innan forutsattningarna). Ingenting ritas till dess -
          ett tomt kort ar en tom rad. */}

      {kompletteringSaknas > 0 && !rundanKlar && (
        <div role="status" style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px 0 0` }}>
          {kompletteringSaknas === 1 ? '1 punkt saknas och läggs' : `${kompletteringSaknas} punkter saknas och läggs`} till när det finns täckning.
        </div>
      )}

      {/* Forutsattningarna ses en gang och scrollas bort - aldrig nere vid svarsknapparna (se filhuvudet i Forutsattningar.tsx). */}
      {!gaTill && (
        <Forutsattningar vader={vy.egenkontroll.vader} maskiner={vy.egenkontroll.maskiner} rundaId={vy.egenkontroll.id} />
      )}

      {/* RUNDANS KOMMENTAR: texten syns, ett tryck oppnar arket. En klar runda visar den skrivskyddad (ingen text = ingen rad). */}
      {!gaTill && (rundanKlar ? !!kommentarText.trim() : true) && (
        <div style={{ marginTop: AVSTAND.s }}>
          <button
            type="button"
            onClick={rundanKlar ? undefined : () => setVisaKommentar(true)}
            disabled={rundanKlar}
            data-testid="kommentar-rad"
            style={{
              width: '100%', textAlign: 'left', background: FARG.upphojt, border: 'none', borderRadius: RADIE.kort, padding: AVSTAND.l, color: FARG.text,
              fontFamily: 'inherit', minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m, cursor: rundanKlar ? 'default' : 'pointer',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...TYP.micro, color: FARG.text2, display: 'block', marginBottom: AVSTAND.xs }}>KOMMENTAR OM RUNDAN</span>
              <span style={{ ...TYP.text, color: kommentarText.trim() ? FARG.text : FARG.text2, display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {kommentarText.trim() ? kommentarText : 'Skriv några rader — de hamnar sist i rapporten.'}
              </span>
            </span>
            {!rundanKlar && <Ikon namn="chevron_right" />}
          </button>
        </div>
      )}

      <div style={{ marginTop: AVSTAND.s }}>
        <ProvyteLista
          provytor={provytor}
          minPosition={minPosition}
          last={rundanKlar}
          onValj={(y) => setProvytaVald(y)}
          onGaTill={(y) => setGaTill(y)}
        />
      </div>

      {harPlats.size > 0 && !rundanKlar && pos.status !== 'ok' && (
        <div style={{ margin: `${AVSTAND.s}px 0` }}><PositionRad pos={pos} /></div>
      )}

      {/* PLANPUNKTER UTAN PLATS PA KARTAN - den enda punktlistan, och bara nar det finns sadana (se planUtanPlats). */}
      {planUtanPlats.length > 0 && (
        <div data-testid="plan-utan-plats">
          <SectionHeader>Punkter utan markering på kartan</SectionHeader>
          <div style={{ ...TYP.meta, color: FARG.text2, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
            De har ingen symbol på kartan. Tryck här och svara i raden under kartan.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {planUtanPlats.map((p) => (
              <PunktRad key={p.id} punkt={p} markerad={markeradId === p.id} onMarkera={() => markeraPunkt(p.id)} />
            ))}
          </div>
        </div>
      )}

      {/* MATNINGAR: stubbehandlingen ar en matning, inget betyg - den bor i arket, inte bland brickorna. */}
      {(antalMatning > 0 || provytor.length > 0) && (
        <div>
          <SectionHeader>Mätningar</SectionHeader>
          {antalMatning > 0 && (
            <div style={{ ...TYP.text, color: FARG.text2, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>{besvaradeMatning} av {antalMatning}</div>
          )}
          {provytor.length > 0 && (
            <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.m, marginBottom: AVSTAND.s }}>
              <ProvyteSammanstallning provytor={provytor} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {matningspunkter.map((p) => (
              <MatningsKort key={p.id} punkt={p} fotoUrler={fotoPerPunkt[p.id] ?? []} last={rundanKlar} onOppna={() => setStubbePunkt(p)} />
            ))}
          </div>
        </div>
      )}

      {/* OBSERVATIONERNA: det besiktaren sag ute, atskilt fran det planen fragade om. Egen rubrik, aldrig i "N kvar". */}
      {observationer.length > 0 && (
        <div>
          <SectionHeader>Observationer</SectionHeader>
          <div style={{ ...TYP.meta, color: FARG.text2, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
            {observationAntalText(observationer.length)} — det du såg ute, utöver det planen frågade om
          </div>
          <ObservationLista
            observationer={observationer}
            fotoPerPunkt={fotoPerPunkt}
            onOppna={rundanKlar ? undefined : (o) => setObservationSheet({ lage: 'andra', observation: o })}
          />
        </div>
      )}

      {/* En okand del far aldrig forsvinna tyst - avslutaRunda raknar den. Antalet sags, punkten namnges inte (ingen punktlista har). */}
      {ovrigaPunkter.length > 0 && (
        <div role="status" data-testid="okand-del" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.s }}>
          {ovrigaPunkter.length === 1 ? '1 punkt av en okänd sort kan inte visas här' : `${ovrigaPunkter.length} punkter av en okänd sort kan inte visas här`}.
        </div>
      )}

      {/* AVSTEG 6/7 FRAN PLANERINGSVYN: AVSLUT LIGGER I ARKET OCH INTE I HUVUDET.
          Planeringsvyn lagger "Avsluta objekt" i en meny hogst upp (Mer). Har ar avslutet oåterkalleligt - rundan lases i databasen och blir
          rapporten till Vida - och det kommer EFTER allt annat: forst de som aterstar, sedan avslutet. Huvudet bar darfor bara talet (vad som
          aterstar); knappen ligger sist i listan i arket och ar aldrig ett tryck fran kartan. En klar runda har ingen knapp alls - den ska
          kannas last, inte som en knapp man inte far trycka pa. */}
      {rundanKlar ? (
        <>
          <div style={{ marginTop: AVSTAND.xxl, background: FARG.upphojt, borderRadius: RADIE.kort, padding: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
            <Ikon namn="check_circle" farg={FARG.gron} />
            <span style={{ ...TYP.text }}>
              Avslutad {vy.egenkontroll.klar ? kortDatum(vy.egenkontroll.klar) : 'datum saknas'}
              {' — '}
              {anmarkningsText(antalAvvikelser, antalBattre)}
            </span>
          </div>
          {/* RAPPORTEN: A4 och bilaga (lib/egenkontrollRapport.ts). Bara pa en avslutad runda. */}
          {rapportModell && <RapportDela modell={rapportModell} />}
          {!rapportModell && (
            <div role="status" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xl }}>Förbereder rapporten — hämtar kartlagren…</div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setVisaAvslutsdialog(true)}
          disabled={!kanAvsluta}
          data-testid="avsluta-knapp"
          style={{ ...KNAPP.primar, marginTop: AVSTAND.xxl, ...(kanAvsluta ? {} : INAKTIV) }}
        >
          {avsl.etikett}
        </button>
      )}
    </>
  ) : null;

  return (
    <div style={{ minHeight: '100vh', background: FARG.bg, color: FARG.text, fontFamily: T.ff }}>
      <style>{designCss}</style>

      {kartaSynlig && vy?.egenkontroll ? (
        // KARTAN AR HELA VYN. z 40: under felbannern (900), formularen och dialogen (1100) och ga-vyn (1200), sa ingenting de visar hamnar
        // bakom kartan. Huvud, ark och sidoknappar ligger i samma lager (ovanpa kartan).
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, background: FARG.bg }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <RundKarta
              objekt={vy.kartObjekt}
              origo={origo}
              origoText={origoText}
              punkter={vy.punkter}
              kontext={kontext}
              provytor={provytor}
              observationer={observationer}
              valdPunktId={markeradId}
              hojd="100%"
              kartPadding={{ top: mat.top, bottom: mat.bottom }}
              centreraPa={centreraPa}
              stammar={stammar ?? []}
              visaStammar={visaStammar}
              baskarta={baskarta}
              overlays={overlays}
              egnaVarden={egnaVarden}
              position={pos.position}
              onValjPunkt={markeraPunkt}
              onValjProvyta={(nr) => {
                const y = provytor.find((q) => q.nummer === nr);
                if (y) setProvytaVald(y);
              }}
              // En observation oppnas for andring bara medan rundan ar oppen - en klar runda ar last.
              onValjObservation={rundanKlar ? undefined : (id) => {
                const o = observationer.find((q) => q.id === id);
                if (o) setObservationSheet({ lage: 'andra', observation: o });
              }}
            />
            {/* Sag varfor stammolnet ar tomt - tyst avstangt ser ut som trasigt. */}
            {visaStammar && stammar !== null && stammar.length === 0 && (
              <div
                style={{
                  position: 'absolute', top: `calc(${mat.top}px + ${AVSTAND.s}px)`, left: AVSTAND.l, right: AVSTAND.l, zIndex: 5, pointerEvents: 'none',
                  padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.kort, background: FARG.kort, ...TYP.meta, color: FARG.orange,
                }}
              >
                {stamFel
                  ? 'Stammarna kunde inte läsas.'
                  : 'Inga avverkade stammar hittades för objektet — lägena kunde inte kontrolleras mot avverkad yta.'}
              </div>
            )}
          </div>

          <KartHuvud
            ref={huvudRef}
            flytande
            tillbakaHref="/egenkontroll"
            tillbakaEtikett="Tillbaka till egenkontroll"
            titel={vy.objektNamn}
            meta={kvarText(kvarTotalt, rundanKlar)}
            onTryck={() => setArkLage((l) => nastaGreppLage(l))}
            tryckEtikett="Visa rundan"
            oppen={arkLage !== 'dock'}
          />

          {/* SIDOKNAPPARNA ligger ovanfor arket och foljer dess overkant (mat.bottom): Notera har till vanster, Lager och Centrera till hoger.
              Doljs nar arket ar helt uppdraget eller dras (da ligger de annars ovanpa huvudet). */}
          {sidoknapparSynliga && (
            <>
              {/* Notera har (vanster), Lager (hoger) och kvittot ligger i SAMMA kolumn som huvudet och arket (max KOLUMN.ark, centrerad) -
                  pa en bred skarm sprids de annars till var sin kant. Centrera ar den delade knappen och ligger vid skarmkanten, som i planeringen. */}
              <div style={kolumnStil(sidoBottom(0))}>
                {!rundanKlar ? (
                  <div style={{ pointerEvents: 'auto' }}><KartKnapp ikon="add_location_alt" etikett="Notera här" onClick={noteraHar} stor /></div>
                ) : <span />}
                <div style={{ pointerEvents: 'auto' }}><KartKnapp ikon="layers" etikett="Lager" ariaLabel="Kartlager" onClick={() => setLagerMeny(true)} /></div>
              </div>
              <CentreraKnapp
                synlig={pos.position != null}
                // Ett NYTT objekt vid varje tryck: effekten i RundKarta kor da pa nytt, aven om man stannat pa samma plats.
                onTryck={() => { if (pos.position) setCentreraPa({ lat: pos.position.lat, lng: pos.position.lng }); }}
                bottom={sidoBottom(TRAFFYTA.primar + AVSTAND.s)}
              />
              {angra && (
                <div style={kolumnStil(sidoBottom(TRAFFYTA.primar + AVSTAND.s))}>
                  <div
                    role="status"
                    data-testid="angra-kvitto"
                    style={{
                      pointerEvents: 'auto', flex: 1, minWidth: 0, marginRight: TRAFFYTA.min + AVSTAND.s, display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp,
                      background: FARG.kort, color: FARG.text, ...TYP.text,
                    }}
                  >
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{angra.rubrik}: Bra</span>
                    <button type="button" onClick={angraSvaret} style={{ ...KNAPP.lank }}>Ångra</button>
                  </div>
                </div>
              )}
            </>
          )}

          <RundArk
            lage={arkLage}
            onLage={setArkLage}
            malRef={malRef}
            onMatt={setMatNyckel}
            onDrar={setDrar}
            topp={
              <RundDock
                brickor={brickor}
                markeradId={markeradId}
                sparStatus={sparStatus}
                onTryck={trycktBricka}
                visaHjalp={!rundanKlar && brickor.length > 0 && brickor.every((b) => b.status === null)}
                rad={
                  markerad && svarsDel(markerad.del) ? (
                    <BrickaRad
                      punkt={markerad}
                      fotoUrler={fotoPerPunkt[markerad.id] ?? []}
                      sparar={!!sparStatus[markerad.id]}
                      last={rundanKlar}
                      avstandText={markerad.del === 'plan' && avstandLive.get(markerad.id) ? avstandText(avstandLive.get(markerad.id)!.m) : null}
                      onSvara={radSvarar}
                      onAvvikelse={() => setSheet({ lage: 'avvikelse', punkt: markerad })}
                      onFotoNot={() => setSheet({ lage: 'foto', punkt: markerad })}
                    />
                  ) : null
                }
              />
            }
          >
            {rundanInnehall}
          </RundArk>
        </div>
      ) : (
        // INGEN KARTA: rundan laddas, kunde inte laddas, eller ar inte startad. Samma huvud som pa kartan, men en vanlig sida under.
        // Layoutens toppfaltsluft (paddingTop LAYOUT.topbar i app/layout.tsx, till for TopBar) dras tillbaka sa huvudet sitter dar toppfaltet satt.
        <div style={{ marginTop: `calc(-1 * ${LAYOUT.topbar})` }}>
          <KartHuvud tillbakaHref="/egenkontroll" tillbakaEtikett="Tillbaka till egenkontroll" titel={vy?.objektNamn ?? 'Egenkontroll'} />
          <PageContainer width="smal" style={{ paddingBottom: medSafeBotten(AVSTAND.xxl * 4), paddingTop: 0 }}>
            {laddar && <div style={{ padding: `${AVSTAND.xxl}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.text2 }}>Hämtar rundan…</div>}

            {!laddar && fel && (
              <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.l, marginTop: AVSTAND.m }}>
                <div style={{ ...TYP.text, marginBottom: AVSTAND.m }}>{fel}</div>
                <button type="button" onClick={() => ladda()} style={{ ...KNAPP.primar }}>Försök igen</button>
              </div>
            )}

            {!laddar && !fel && vy && !vy.egenkontroll && (
              <>
                <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.l}px 0 ${AVSTAND.xl}px` }}>
                  Ingen egenkontroll är startad. När du startar skapas checklistan ur objektets planering — hänsyn, kulturlämningar, basvägar och
                  avlägg som planerades — plus punkterna om själva utförandet.
                </p>
                <button type="button" onClick={starta} disabled={startar} style={{ ...KNAPP.primar, ...(startar ? INAKTIV : {}) }}>
                  {startar ? 'Startar…' : 'Starta egenkontroll'}
                </button>
              </>
            )}
          </PageContainer>
        </div>
      )}

      {/* Allt nedan ligger UTANFOR kartans omslag: formularen, dialogen och menyn ska oppnas OVANPA kartan och arket (z-index over 1000). */}

        {/* MENYN - samma komponent som planeringsvyn ska anvanda i PR B.
            Bara de props som hor till egenkontrollen skickas; planeringens sex
            sektioner far inga och ritas darfor inte alls. */}
        <KartLagerMeny
          oppen={lagerMeny}
          onStang={() => setLagerMeny(false)}
          // OVER toppfaltet (1000) och kartlagret (40). Menyn oppnas fran kartan, och
          // en meny under sitt eget underlag ar en knapp som fyrar utan att
          // nagot syns - se doc-kommentaren i KartLagerMeny.
          zIndex={1250}
          mapType={baskarta}
          setMapType={setBaskarta}
          overlays={overlays}
          setOverlays={setOverlays}
          egnaLager={EGNA_LAGER.map((l) =>
            l.id === 'ekStammar'
              ? { ...l, beskrivning: stamBeskrivning(stammar, stamFel) }
              : l,
          )}
          egnaVarden={egnaVarden}
          setEgnaVarden={setEgnaVarden}
        />

        {gaTill && vy && (
          <GaTillYta
            yta={gaTill}
            objekt={vy.kartObjekt}
            origo={origo}
            origoText={origoText}
            punkter={vy.punkter}
            kontext={kontext}
            provytor={provytor}
            baskarta={baskarta}
            overlays={overlays}
            egnaVarden={egnaVarden}
            onStang={() => setGaTill(null)}
            onMat={() => { setProvytaVald(gaTill); setGaTill(null); }}
          />
        )}

        {provytaVald && vy?.egenkontroll && (
          <ProvytaSheet
            yta={provytaVald}
            egenkontrollId={vy.egenkontroll.id}
            noggrannhetM={minPosition?.noggrannhet ?? null}
            onStang={() => setProvytaVald(null)}
            onSparad={() => { setProvytaVald(null); ladda({ tyst: true }); laddaTillbehor(true); }}
          />
        )}

        {stubbePunkt && vy?.egenkontroll && (
          <StubbeSheet
            punkt={stubbePunkt}
            egenkontrollId={vy.egenkontroll.id}
            antalSedanTidigare={(fotoPerPunkt[stubbePunkt.id] ?? []).length}
            onStang={() => setStubbePunkt(null)}
            onSparad={() => {
              // Efter en stubbe star kortet kvar ("Fler stubbar" / "Klar"): man tar ofta flera.
              setStubbePunkt(null);
              ladda({ tyst: true });
              laddaTillbehor(true);
            }}
          />
        )}

        {sheet && vy?.egenkontroll && (
          <AvvikelseSheet
            lage={sheet.lage}
            punkt={sheet.punkt}
            egenkontrollId={vy.egenkontroll.id}
            onStang={() => setSheet(null)}
            onSparad={() => { setSheet(null); ladda({ tyst: true }); laddaTillbehor(true); }}
          />
        )}

        {/* NOTERA HAR / ANDRA EN OBSERVATION. Bildens sokvag bar punktens id (lasbarande - ror inte byggSokvag). */}
        {observationSheet && vy?.egenkontroll && (
          <ObservationSheet
            key={observationSheet.lage === 'ny' ? 'ny' : observationSheet.observation.id}
            lage={observationSheet.lage}
            egenkontrollId={vy.egenkontroll.id}
            observation={observationSheet.lage === 'andra' ? observationSheet.observation : undefined}
            fotoUrler={observationSheet.lage === 'andra' ? fotoPerPunkt[observationSheet.observation.id] ?? [] : []}
            startPosition={observationSheet.lage === 'ny' ? observationSheet.start : null}
            pos={pos}
            onStang={() => setObservationSheet(null)}
            onSparad={() => { setObservationSheet(null); ladda({ tyst: true }); laddaTillbehor(true); }}
          />
        )}

        {/* APP-EGEN DIALOG - aldrig confirm(). Den blockeras tyst i inbaddade
            lagen, och ett tyst blockerat confirm() betyder att avslutet bara
            "inte hander" utan att nagon forstar varfor.
            Sammanfattningen sager vad som sparas INNAN det sparas: efterat gar
            rundan inte att andra i appen. */}
        {visaAvslutsdialog && vy?.egenkontroll && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Avsluta rundan"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
            onClick={() => { if (!avslutar) setVisaAvslutsdialog(false); }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: T.group,
                borderRadius: '16px 16px 0 0',
                padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
                width: '100%',
                maxWidth: 480,
                fontFamily: T.ff,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
                Avsluta rundan?
              </div>
              <div data-testid="avsluta-konsekvens" style={{ ...TYP.listtitel, color: FARG.text, marginBottom: AVSTAND.xs }}>{AVSLUTA_KONSEKVENS}</div>
              <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.l }}>
                Detta sparas som egenkontrollens dokument.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                <Sammanfattningsrad etikett="Punkter" varde={`${allaPunkter.length}`} />
                {observationer.length > 0 && (
                  <Sammanfattningsrad etikett="Observationer" varde={`${observationer.length}`} />
                )}
                <Sammanfattningsrad
                  etikett="Avvikelser"
                  varde={`${antalAvvikelser}`}
                  farg={antalAvvikelser > 0 ? T.red : undefined}
                />
                <Sammanfattningsrad
                  etikett="Kan bli bättre"
                  varde={`${antalBattre}`}
                  farg={antalBattre > 0 ? GUL : undefined}
                />
              </div>

              {/* KOMMENTAREN TILL RAPPORTEN: samma falt som arket under rundan, med det som redan star. Sista chansen - efteraat gar
                  rundan inte att andra. Sparas FORE avslutet; gar det inte avslutas inte rundan. */}
              <div style={{ marginBottom: AVSTAND.l }}>
                <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.xs }}>KOMMENTAR TILL RAPPORTEN</div>
                <textarea
                  value={kommentarText}
                  onChange={(e) => andraKommentar(e.target.value)}
                  placeholder={KOMMENTAR_PLATSHALLARE}
                  aria-label="Kommentar till rapporten"
                  disabled={avslutar}
                  style={{ ...KOMMENTAR_FALT, minHeight: 96, background: FARG.upphojt }}
                />
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Hamnar sist på sida 1. Valfritt.</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={avsluta}
                  disabled={avslutar}
                  style={{
                    width: '100%', minHeight: 52, borderRadius: 12, border: 'none',
                    background: T.green, color: '#000', fontSize: 17, fontWeight: 700,
                    fontFamily: T.ff, opacity: avslutar ? 0.5 : 1,
                  }}
                >
                  {avslutar ? 'Avslutar…' : 'Avsluta rundan'}
                </button>
                <button
                  onClick={() => setVisaAvslutsdialog(false)}
                  disabled={avslutar}
                  style={{
                    width: '100%', minHeight: 52, borderRadius: 12,
                    border: '1.5px solid rgba(255,255,255,0.14)',
                    background: 'transparent', color: T.t1, fontSize: 17, fontWeight: 600,
                    fontFamily: T.ff,
                  }}
                >
                  Gå tillbaka
                </button>
              </div>
            </div>
          </div>
        )}

        {visaKommentar && vy?.egenkontroll && !rundanKlar && (
          <RundKommentarSheet
            egenkontrollId={vy.egenkontroll.id}
            sparad={vy.egenkontroll.kommentar}
            text={kommentarText}
            onText={andraKommentar}
            onStang={() => setVisaKommentar(false)}
            onSparad={() => { setVisaKommentar(false); setKommentarUtkast(null); ladda({ tyst: true }); }}
          />
        )}

        {/* App-egen felruta - aldrig alert(), den blockeras tyst i inbaddade lagen. */}
        {sparFel && (
          <div
            role="alert"
            style={{
              position: 'fixed',
              left: 12,
              right: 12,
              // PA KARTAN ligger kortet med OK/Avvikelse nere - da hamnar felet
              // OVER kartan, sa det aldrig skymmer knapparna man just forsokte trycka pa.
              ...(kartaSynlig ? { top: underKartHuvud(AVSTAND.s) } : { bottom: 88 }),
              background: T.red,
              color: '#fff',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              lineHeight: 1.4,
              zIndex: 900,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <span style={{ flex: 1 }}>{sparFel}</span>
            <button
              onClick={() => setSparFel(null)}
              style={{
                minHeight: 44,
                minWidth: 44,
                border: 'none',
                background: 'transparent',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: T.ff,
              }}
            >
              Stäng
            </button>
          </div>
        )}
    </div>
  );
}
