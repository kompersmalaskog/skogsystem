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
// KARTAN AR HUVUDSAKEN, LISTAN STODET. Tre tillstand, inga lagen:
//
//   1  GA RUNDAN   Helskarmskarta med ETT kort under sig: narmaste obesvarade
//                  punkt, med avstand, plankommentar och OK/Avvikelse. Svarar man
//                  gar kortet till nasta narmaste och kartan med. Tryck pa en
//                  annan symbol byter kort.
//   2  SE ALLT     Oversikt, inget arbetsyta: grupperna kvar som rubriker, narmast
//                  forst inom gruppen, ✓ eller avstand. Tryck pa en rad -> kartan
//                  med den punkten i kortet.
//   3  AVSLUTA     Kommer av sig sjalv nar sista punkten i TERRANGEN ar besvarad.
//                  Utforande och matningar har ingen karta bakom sig - de ar
//                  omdomen om hela bestandet - och harifran avslutas rundan.
//
// MELLAN 1 OCH 2/3 FINNS EN IKON, pa samma plats, som byter form (karta/lista).
// Aldrig tva knappar, aldrig tva vagar till samma sak.
//
// TILLSTANDET HARLEDS UR DATA OCH LAGRAS ALDRIG (lib/egenkontrollFlode.ts). Det enda
// som lagras ar var anvandaren valt att vara (karta eller lista) - och inte ens det
// forran hen valt. Att en punkt skulle bli obesvarad igen efter att man natt avslutet
// gar inte via appen, men om det hander ska vyn visa det, aldrig kasta ut en.
//
// UTAN POSITION gar det inte att saga vad som ar narmast. Da ar listan flodet, som
// forr, och det star rakt ut - ingen gissad ordning, ingen tyst omsortering.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import SectionHeader from '@/components/SectionHeader';
import PageContainer from '@/components/PageContainer';
import { T } from '@/lib/utbildning';
import {
  hamtaRunda,
  generateEgenkontroll,
  svaraPaPunkt,
  avslutaRunda,
  utforandeUnderrad,
  hamtaFoton,
  hamtaKontextmarkeringar,
  hamtaProvytor,
  hamtaAvverkadeStammar,
  punktPlatser,
  stubbeDom,
  KRAVNIVA_STUBBEHANDLING,
  AVVIKELSE_ETIKETT,
  GRUPPER,
  type RundVy,
  type EgenkontrollPunkt,
  type PunktDel,
  type PunktStatus,
  type AvvikelseTyp,
  type EgenkontrollFoto,
  type EgenkontrollProvyta,
} from '@/lib/egenkontroll';
import { signeraFoto } from '@/lib/egenkontrollfoto';
import AvvikelseSheet, { type SheetLage } from '../AvvikelseSheet';
import RundKarta from '../RundKarta';
import StubbeSheet from '../StubbeSheet';
import TillbakaTillListan from '../TillbakaTillListan';
import ProvytaSheet from '../ProvytaSheet';
import ProvyteLista, { type MinPosition } from '../ProvyteLista';
import Forutsattningar from '../Forutsattningar';
import KartLagerMeny, { type EgetLager } from '@/components/KartLagerMeny';
import { BASKARTOR, BASKARTA_DEFAULT, type BaskartaId } from '@/lib/mapLayers';
import { useMapLayers, useStringSetting } from '@/lib/hooks/useMapLayers';
import ProvyteSammanstallning from '../ProvyteSammanstallning';
import GaTillYta from '../GaTillYta';
import { skadeandel as _skadeandel, type LatLng } from '@/lib/provytor';
import { kartOrigoFranBounds } from '@/lib/kartkoordinater';
import { anmarkningsText, kortDatum } from '../format';
import { designCss, medSafeBotten, underTopbar } from '@/lib/design/tokens';
import {
  UTAN_POSITION_MENING,
  arForstaSvaret,
  avstandPerPunkt as beraknaAvstand,
  efterSvar,
  narmasteObesvarade,
  ordnaGruppEfterAvstand,
  positionSkalText,
  radLage,
  startLage,
  terrangKvar as raknaTerrangKvar,
} from '@/lib/egenkontrollFlode';
import { useLevandePosition, type LevandePosition } from '../useMinPosition';

// GULT, INTE ROTT, for "Kan bli battre". Ingen har brutit mot nagot - blir det
// rott slutar folk satta det, och da far vi "Godkant" pa allt och verktyget ar
// dott. Rott ar reserverat for avvikelser mot planen i Del 1.
// #FFD60A ar samma gult som datahalsobannern pa startsidan; T.orange betyder
// redan "gar ut snart" pa utbildningssidorna.
const GUL = '#FFD60A';

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
  { id: 'ekStammar', namn: 'Avverkade stammar', beskrivning: '' },
];

/** Stammolnets rad sager sitt eget tillstand - tomt far inte betyda tva saker. */
function stamBeskrivning(stammar: LatLng[] | null, fel: boolean): string {
  if (stammar === null) return 'Hämtas när lagret slås på';
  if (fel) return 'Kunde inte läsas — försök igen senare';
  if (stammar.length === 0) return 'Inga hittades för objektet';
  return `${stammar.length.toLocaleString('sv-SE')} stammar ur maskindatan`;
}

/** Status i TEXT. Fargen upprepar bara det som redan star - den bar aldrig ensam. */
const STATUS_TEXT: Record<string, { text: string; farg: string }> = {
  ok: { text: 'OK', farg: T.green },
  avvikelse: { text: 'Avvikelse', farg: T.red },
  bra: { text: 'Bra', farg: T.green },
  godkant: { text: 'Godkänt', farg: T.blue },
  battre: { text: 'Kan bli bättre', farg: GUL },
};

function statusEtikett(status: string | null): { text: string; farg: string } {
  if (status && STATUS_TEXT[status]) return STATUS_TEXT[status];
  return { text: 'Obesvarad', farg: T.t2 };
}

/** Knapparna per del. Aldrig fler an dessa - tre val ar redan gransen i hytt. */
const SVARSALTERNATIV: Record<PunktDel, { status: PunktStatus; etikett: string; farg: string }[]> = {
  plan: [
    { status: 'ok', etikett: 'OK', farg: T.green },
    { status: 'avvikelse', etikett: 'Avvikelse', farg: T.red },
  ],
  utforande: [
    { status: 'bra', etikett: 'Bra', farg: T.green },
    { status: 'godkant', etikett: 'Godkänt', farg: T.blue },
    { status: 'battre', etikett: 'Kan bli bättre', farg: GUL },
  ],
};

/**
 * Grupp och sedan ordning. Presentationsordning valjs HAR, i vyn - ordning
 * ar punktens plats i rundan, inte ett lofte om hur den ska visas. Grupper
 * som inte finns i GRUPPER hamnar sist i stallet for att forsvinna.
 */
function gruppera(punkter: EgenkontrollPunkt[]): { grupp: string; punkter: EgenkontrollPunkt[] }[] {
  const per = new Map<string, EgenkontrollPunkt[]>();
  for (const p of punkter) {
    const g = p.grupp ?? 'Övrigt';
    if (!per.has(g)) per.set(g, []);
    per.get(g)!.push(p);
  }
  const rang = (g: string) => {
    const i = (GRUPPER as readonly string[]).indexOf(g);
    return i === -1 ? GRUPPER.length : i;
  };
  return Array.from(per.entries())
    .map(([grupp, ps]) => ({ grupp, punkter: [...ps].sort((a, b) => a.ordning - b.ordning) }))
    .sort((a, b) => rang(a.grupp) - rang(b.grupp) || (a.grupp < b.grupp ? -1 : 1));
}

function SvarsKnapp({
  etikett,
  aktiv,
  farg,
  sparar,
  onClick,
}: {
  etikett: string;
  aktiv: boolean;
  farg: string;
  sparar: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={sparar}
      aria-pressed={aktiv}
      style={{
        flex: 1,
        minHeight: 44, // handske i skog - traffytan far inte krympa
        borderRadius: 10,
        border: `1.5px solid ${aktiv ? farg : 'rgba(255,255,255,0.14)'}`,
        background: aktiv ? farg : 'transparent',
        color: aktiv ? '#000' : T.t1,
        fontSize: 16,
        fontWeight: 600,
        fontFamily: T.ff,
        opacity: sparar ? 0.5 : 1,
      }}
    >
      {etikett}
    </button>
  );
}

/**
 * Kortet. Storleken ar bekraftad i falt - andra den inte.
 *
 * Planerarens kommentar star under rubriken, mindre och nedtonad, utan
 * etikett. Saknas den ritas ingenting alls - ingen tom rad, ingen
 * platshallare som lurar ogat att leta.
 */
function PunktKort({
  punkt,
  sparar,
  last,
  fotoUrler,
  vald,
  avstand,
  riktn,
  onSvara,
  onOppnaSheet,
  onValj,
}: {
  punkt: EgenkontrollPunkt;
  sparar: boolean;
  /** Rundan ar avslutad - punkten visas men gar inte att andra. */
  last: boolean;
  /** Signerade URL:er for punktens bilder. Tom = inga, eller kunde ej signeras. */
  fotoUrler: string[];
  /** Vald pa kartan just nu. */
  vald: boolean;
  /** Meter till punkten. null = ingen position, eller punkten ar ingen plats. */
  avstand?: number | null;
  riktn?: string | null;
  onSvara: (status: PunktStatus) => void;
  onOppnaSheet: (lage: SheetLage) => void;
  /** Oppnar kartan med punkten i kortet. null = punkten ar ingen plats
   *  (kalla='fast', eller utan geometri) och har ingen karta bakom sig. */
  onValj: (() => void) | null;
}) {
  const etikett = statusEtikett(punkt.status);
  const underrad = punkt.del === 'utforande' ? utforandeUnderrad(punkt.punkt_typ) : null;
  const hjalptext = punkt.plan_kommentar ?? underrad;
  const alternativ = SVARSALTERNATIV[punkt.del as PunktDel] ?? SVARSALTERNATIV.plan;

  return (
    <div
      style={{
        background: T.group,
        borderRadius: 12,
        padding: '12px 14px',
        // Vald punkt ramas in - samma besked som den vita glorian pa kartan.
        // Texten under bar beskedet, sa ramen upprepar bara det och ar aldrig
        // ensam informationsbarare.
        outline: vald ? `2px solid ${T.blue}` : 'none',
        outlineOffset: -2,
      }}
    >
      {onValj ? (
        <button
          onClick={onValj}
          aria-pressed={vald}
          style={{
            display: 'block', width: '100%', textAlign: 'left', minHeight: 44,
            border: 'none', background: 'transparent', padding: 0,
            color: T.t1, fontSize: 16, fontWeight: 500, fontFamily: T.ff,
          }}
        >
          {punkt.rubrik}
          <span style={{ color: T.blue, fontSize: 13, fontWeight: 600, marginLeft: 8 }}>
            visa på kartan
          </span>
        </button>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 500 }}>{punkt.rubrik}</div>
      )}
      {/* HELA METER. Riktningen star i ORD bredvid - inte bara en pil. */}
      {avstand != null && (
        <div style={{ fontSize: 14, color: T.t2, marginTop: 2 }}>
          {avstandText(avstand)}
          {riktn && ` · ${riktn}`}
        </div>
      )}
      {hjalptext && (
        <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.4, marginTop: 3 }}>
          {hjalptext}
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          color: etikett.farg,
          fontWeight: 600,
          margin: '2px 0 0',
        }}
      >
        {sparar ? 'Sparar…' : etikett.text}
        {/* Typen i TEXT bredvid statusen - fargen bar aldrig ensam. */}
        {punkt.avvikelse_typ && (
          <span style={{ color: T.t2, fontWeight: 400 }}>
            {' · '}{AVVIKELSE_ETIKETT[punkt.avvikelse_typ as AvvikelseTyp] ?? punkt.avvikelse_typ}
          </span>
        )}
      </div>

      {punkt.kommentar && (
        <div style={{ fontSize: 13, color: T.t2, lineHeight: 1.4, marginTop: 3 }}>
          {punkt.kommentar}
        </div>
      )}

      {fotoUrler.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {fotoUrler.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }}
            />
          ))}
        </div>
      )}

      <div style={{ height: last ? 0 : 10 }} />
      {/* TVA PLUS EN. "Kan bli battre" ar dubbelt sa lang etikett som "OK" och
          far egen full bredd - tre i bredd kroper traffytan under 44 pt for en
          tumme med handske. Del 1 har tva alternativ och far en enda rad. */}
      {!last && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {alternativ.slice(0, 2).map((a) => (
              <SvarsKnapp
                key={a.status}
                etikett={a.etikett}
                aktiv={punkt.status === a.status}
                farg={a.farg}
                sparar={sparar}
                // Avvikelse skrivs ALDRIG rakt av - den behover typ, foto och
                // position, och det samlas i formularet.
                onClick={() =>
                  a.status === 'avvikelse' ? onOppnaSheet('avvikelse') : onSvara(a.status)
                }
              />
            ))}
          </div>
          {alternativ.slice(2).map((a) => (
            <div key={a.status} style={{ display: 'flex' }}>
              <SvarsKnapp
                etikett={a.etikett}
                aktiv={punkt.status === a.status}
                farg={a.farg}
                sparar={sparar}
                onClick={() => onSvara(a.status)}
              />
            </div>
          ))}

          {/* Foto pa utforandepunkter oavsett gradering. En bild pa en rishog
              som ligger ratt ar lika mycket vard som en pa ett spar som gatt
              fel - det ar den man kan visa nasta forare. */}
          {punkt.del === 'utforande' && (
            <button
              onClick={() => onOppnaSheet('foto')}
              disabled={sparar}
              style={{
                minHeight: 44, borderRadius: 10,
                border: '1.5px solid rgba(255,255,255,0.14)',
                background: 'transparent', color: T.t2,
                fontSize: 15, fontWeight: 600, fontFamily: T.ff,
              }}
            >
              {fotoUrler.length > 0 ? 'Lägg till fler foton' : 'Lägg till foto'}
            </button>
          )}
        </div>
      )}
    </div>
  );
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
 * Kompakt rad i oversikten (tillstand 2 och 3): rubriken och ett ✓ med svaret,
 * eller avstandet. Oversikten ar ingen arbetsyta - ett tryck oppnar kartan med
 * punkten i kortet, och DAR svarar man.
 */
function PunktRad({
  punkt,
  avstand,
  onOppna,
}: {
  punkt: EgenkontrollPunkt;
  avstand: number | null;
  onOppna: () => void;
}) {
  const besvarad = punkt.status !== null;
  const et = statusEtikett(punkt.status);
  return (
    <button
      onClick={onOppna}
      aria-label={`${punkt.rubrik} — visa på kartan`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        width: '100%', minHeight: 56, border: 'none', borderRadius: 12,
        background: T.group, padding: '8px 14px', textAlign: 'left',
        color: T.t1, fontFamily: T.ff,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 500 }}>{punkt.rubrik}</span>
      {/* Svaret i ORD bredvid bocken - fargen bar aldrig ensam. */}
      <span style={{ fontSize: 14, fontWeight: 600, color: besvarad ? et.farg : T.t2, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {besvarad ? `✓ ${et.text}` : avstand != null ? avstandText(avstand) : 'Obesvarad'}
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

/**
 * IKONEN mellan kartan och listan. EN knapp, EN plats, byter form: pa kartan
 * visar den listan, i listan visar den kartan. Ikon OCH ord - symbolen ensam
 * ar inte nog i en hytt.
 */
function VaxlaVyKnapp({ till, onClick }: { till: 'karta' | 'lista'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={till === 'karta' ? 'Visa kartan' : 'Visa listan'}
      style={{
        minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 22,
        border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(28,28,30,0.92)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        color: T.t1, fontSize: 14, fontWeight: 600, fontFamily: T.ff,
        display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
        {till === 'karta' ? 'map' : 'format_list_bulleted'}
      </span>
      {till === 'karta' ? 'Karta' : 'Lista'}
    </button>
  );
}

/** Sidmarginalen - samma pa ikonen i kartan och i listan, sa den sitter i samma horn. */
const SIDMARGINAL = 16;

export default function EgenkontrollRundaPage() {
  const params = useParams<{ objektId: string }>();
  const objektId = params.objektId;

  const [vy, setVy] = useState<RundVy | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [startar, setStartar] = useState(false);
  const [sparStatus, setSparStatus] = useState<Record<string, boolean>>({});
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [visaAvslutsdialog, setVisaAvslutsdialog] = useState(false);
  // Signerade URL:er per punkt. Misslyckad signering ger INGEN post - kortet
  // visar da ingen miniatyr i stallet for en trasig bildikon.
  const [fotoPerPunkt, setFotoPerPunkt] = useState<Record<string, string[]>>({});
  const [sheet, setSheet] = useState<{ lage: SheetLage; punkt: EgenkontrollPunkt } | null>(null);
  const [valdPunktId, setValdPunktId] = useState<string | null>(null);
  const [stubbePunkt, setStubbePunkt] = useState<EgenkontrollPunkt | null>(null);
  const [provytor, setProvytor] = useState<EgenkontrollProvyta[]>([]);
  const [provytaVald, setProvytaVald] = useState<EgenkontrollProvyta | null>(null);

  // DIN POSITION, levande. Sidan ager bevakningen och delar ut den - kartan,
  // kortet och listan ska aldrig kunna vara oense om var man ar.
  const pos = useLevandePosition();
  const minPosition: MinPosition = pos.position;

  // VAR ANVANDAREN VALT ATT VARA. null = inget val an - da harleds det ur datan
  // (startLage). Det ENDA som lagras; sjalva tillstandet (1/2/3) harleds alltid.
  const [lage, setLage] = useState<'karta' | 'lista' | null>(null);
  // Listans position FRYSES nar listan oppnas: rader som sorterar om sig under
  // fingret ar varre an ett avstand som ar nagra sekunder gammalt.
  const [frystPos, setFrystPos] = useState<MinPosition>(null);
  // Kartan monteras forsta gangen den visas och stannar sedan (dold i listan) -
  // kameran och tiles ska inte byggas om vid varje vaxling.
  const [kartaMonterad, setKartaMonterad] = useState(false);
  // Tillstand 3: terrangpunkterna ihopvikta, och utvikbara for att ratta.
  const [visaTerrang, setVisaTerrang] = useState(false);
  // Den korta stunden efter sista terrangsvaret, innan vyn byter till avslutet.
  const [klartKort, setKlartKort] = useState(false);
  // Har terrangen nagon gang varit helt besvarad i den har sessionen? Bara for
  // att kunna saga "obesvarad igen" om en omlasning visar det.
  const nattAvslut = useRef(false);
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
    ekPunkter: true, ekProvytor: true, ekStammar: false,
  });
  const visaStammar = egnaVarden.ekStammar === true;
  const [gaTill, setGaTill] = useState<EgenkontrollProvyta | null>(null);
  // Stammarna hamtas EN gang och bara nar lagret slas pa i menyn.
  const [stammar, setStammar] = useState<LatLng[] | null>(null);
  const [stamFel, setStamFel] = useState(false);
  // Kontextlagret - orientering, aldrig dokumentets innehall.
  const [kontext, setKontext] = useState<{ data: any }[]>([]);
  const [avslutar, setAvslutar] = useState(false);

  // TYST OMLASNING. Efter varje sparad avvikelse, provyta och stubbe las rundan om -
  // och den gamla ladda() satte laddar=true, sa HELA vyn byttes mot "Hamtar
  // rundan…" och kartan avmonterades mitt i rundan. Kartan ar nu huvudsaken, sa
  // en omlasning far aldrig synas: gamla vyn star kvar tills den nya ar framme,
  // och ett fel pa vagen ar ett meddelande, inte en tom skarm.
  const ladda = useCallback(async (val: { tyst?: boolean } = {}) => {
    if (!val.tyst) { setLaddar(true); setFel(null); }
    try {
      setVy(await hamtaRunda(objektId));
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
    hamtaKontextmarkeringar(objektId)
      .then((m) => { if (!avbruten) setKontext(m as { data: any }[]); })
      .catch(() => { if (!avbruten) setKontext([]); });
    return () => { avbruten = true; };
  }, [objektId]);

  // Bilderna signeras efterat, separat fran rundan: en misslyckad signering
  // ska aldrig gora att punkterna inte gar att besvara.
  const rundaId = vy?.egenkontroll?.id;
  useEffect(() => {
    if (!rundaId) { setFotoPerPunkt({}); setProvytor([]); return; }
    let avbruten = false;
    (async () => {
      try {
        setProvytor(await hamtaProvytor(rundaId));
        const foton = await hamtaFoton(rundaId);
        const par = await Promise.all(
          foton.map(async (f: EgenkontrollFoto) => ({
            punktId: f.punkt_id,
            url: await signeraFoto(f.sokvag),
          })),
        );
        if (avbruten) return;
        const karta: Record<string, string[]> = {};
        for (const p of par) {
          if (!p.punktId || !p.url) continue; // osignerbar bild hoppas over tyst i kortet
          (karta[p.punktId] ??= []).push(p.url);
        }
        setFotoPerPunkt(karta);
      } catch {
        if (!avbruten) { setFotoPerPunkt({}); setProvytor([]); }
      }
    })();
    return () => { avbruten = true; };
  }, [rundaId]);

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

  const svara = async (punkt: EgenkontrollPunkt, status: PunktStatus) => {
    // Trycket pa redan valt svar ar en no-op: ingen skrivning, ingen blink.
    if (punkt.status === status) return;
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
    } catch (e) {
      setSparFel(e instanceof Error ? e.message : 'Kunde inte spara svaret.');
    } finally {
      setSparStatus((s) => ({ ...s, [punkt.id]: false }));
    }
  };

  const avsluta = async () => {
    if (!vy?.egenkontroll) return;
    setAvslutar(true);
    setSparFel(null);
    try {
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
  const utforandepunkter = useMemo(
    () => (vy?.punkter ?? []).filter((p) => p.del === 'utforande').sort((a, b) => a.ordning - b.ordning),
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

  const grupper = useMemo(() => gruppera(planpunkter), [planpunkter]);

  // ORIGO ur kartbild_bounds - samma kalla som kartan. Saknas bounds gar
  // markeringarnas SVG-rymd inte att placera, och da har ingen punkt ett
  // avstand. Vi gissar aldrig en plats ur lat/lng: det ar ett annat origo an
  // det planeraren ritade mot.
  const origo = useMemo(
    () => (vy?.kartObjekt ? kartOrigoFranBounds(vy.kartObjekt) : null),
    [vy?.kartObjekt],
  );

  // Avstand och riktning per punkt (en LINJE matas till sin narmaste brytpunkt -
  // lib/egenkontrollFlode.ts). TVA uppsattningar, med flit:
  //   LEVANDE  ur din position nu    - kortet pa kartan ("narmaste obesvarade")
  //   LISTAN   ur positionen i det ogonblick listan oppnades - fryst, sa att rader
  //            inte sorterar om sig under fingret
  const avstandLive = useMemo(
    () => beraknaAvstand(planpunkter, origo, minPosition),
    [planpunkter, origo, minPosition],
  );
  const avstandLista = useMemo(
    () => beraknaAvstand(planpunkter, origo, frystPos),
    [planpunkter, origo, frystPos],
  );

  // Punkterna som FINNS pa kartan. Resten gar bara att svara pa i listan - de
  // gissas aldrig in pa kartan och blir aldrig en "narmaste".
  const harPlats = useMemo(() => {
    const s = new Set<string>();
    if (!origo) return s;
    for (const p of planpunkter) if (punktPlatser(p, origo).length > 0) s.add(p.id);
    return s;
  }, [planpunkter, origo]);
  const antalPlan = planpunkter.length;
  const besvaradePlan = planpunkter.filter((p) => p.status !== null).length;
  const antalAvvikelser = planpunkter.filter((p) => p.status === 'avvikelse').length;
  const antalUtforande = utforandepunkter.length;
  const besvaradeUtforande = utforandepunkter.filter((p) => p.status !== null).length;
  const antalMatning = matningspunkter.length;
  const besvaradeMatning = matningspunkter.filter((p) => p.status !== null).length;

  // Avslutet raknar BADA delarna. Kvar-talet ar det som faktiskt aterstar,
  // aldrig en gissning - det star pa knappen sa man vet hur langt man har kvar
  // utan att blada.
  const allaPunkter = vy?.punkter ?? [];
  const kvar = allaPunkter.filter((p) => p.status === null).length;
  const antalBattre = allaPunkter.filter((p) => p.status === 'battre').length;
  const rundanKlar = vy?.egenkontroll?.status === 'klar';
  const kanAvsluta = !!vy?.egenkontroll && !rundanKlar && allaPunkter.length > 0 && kvar === 0;

  // --- TILLSTANDET: harlett ur data, aldrig lagrat -------------------------
  const terrangKvar = raknaTerrangKvar(allaPunkter);
  // "Kan kartan anvandas?" = finns minst en punkt med en plats. Utan det finns
  // ingenting att visa eller trycka pa.
  const startL = startLage({
    harRunda: !!vy?.egenkontroll,
    klar: rundanKlar,
    harOrigo: harPlats.size > 0,
    terrangKvar,
    positionHarFallit: pos.status === 'saknas',
    // Har man en punkt i kortet ar man i flodet: varken sista svaret eller en
    // tappad position far byta vy under en - det gor sidan, med flit, efterat.
    harKort: valdPunktId !== null,
  });
  const effLage = lage ?? startL;
  // En avslutad runda ar ett dokument: fulla, skrivskyddade kort (kommentarer och foton syns).
  const radL = rundanKlar ? 'full' : radLage({ harFrystPosition: frystPos != null, terrangKvar });
  // Terrangen har varit helt besvarad i den har sessionen men ar det inte langre.
  const obesvaradIgen = nattAvslut.current && terrangKvar > 0 && !rundanKlar;

  // Beslutet att oppna i listan FRYSER (forsta gangen): kommer positionen i
  // efterhand ska vyn inte byta under en - det vore att kasta ut anvandaren.
  useEffect(() => {
    if (lage !== null || laddar || !vy?.egenkontroll) return;
    if (startL === 'lista') setLage('lista');
    else if (valdPunktId !== null) setLage('karta');
  }, [lage, laddar, vy?.egenkontroll, startL, valdPunktId]);

  useEffect(() => {
    if (effLage === 'karta' && !laddar && vy?.egenkontroll) setKartaMonterad(true);
  }, [effLage, laddar, vy?.egenkontroll]);

  // Sista punkten i terrangen besvarad - minns det for "obesvarad igen".
  useEffect(() => {
    if (vy?.egenkontroll && antalPlan > 0 && terrangKvar === 0) nattAvslut.current = true;
  }, [vy?.egenkontroll, antalPlan, terrangKvar]);

  // KORTET FYLLS: ett TOMT kort far narmaste obesvarade sa fort positionen finns -
  // ocksa nar den kommer efter att vyn oppnats. Ett kort som redan har en punkt
  // lamnas ifred: kortet byter aldrig punkt medan man gar.
  useEffect(() => {
    if (effLage !== 'karta' || valdPunktId !== null || !minPosition) return;
    const id = narmasteObesvarade(planpunkter, avstandLive);
    if (id) setValdPunktId(id);
  }, [effLage, valdPunktId, minPosition, planpunkter, avstandLive]);

  // KORTET GAR VIDARE efter ett FORSTA svar pa punkten i kortet. Styrs av datan,
  // inte av vilken knapp som trycktes: det gar lika for OK (sparas direkt) och for
  // Avvikelse (sparas i formularet, sidan laser sedan om).
  const forraStatus = useRef<Map<string, string | null>>(new Map());
  useEffect(() => {
    const forra = forraStatus.current;
    const svarad = valdPunktId
      ? planpunkter.find((p) => p.id === valdPunktId && arForstaSvaret(forra.get(p.id), p.status))
      : undefined;
    forraStatus.current = new Map((vy?.punkter ?? []).map((p) => [p.id, p.status]));
    if (!svarad) return;
    const nasta = efterSvar({ planpunkter, besvaradId: svarad.id, avstand: avstandLive });
    if (nasta.typ === 'punkt') setValdPunktId(nasta.id);
    else if (nasta.typ === 'klart') setKlartKort(true);
    // 'stanna': kortet star kvar med sitt svar - ingen gissad nasta.
  }, [vy?.punkter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stunden mellan sista svaret och avslutet. Kortet visar svaret, sedan toner vyn
  // over. Ikonen eller ett tryck pa en symbol avbryter - styrningen ar anvandarens.
  useEffect(() => {
    if (!klartKort) return;
    const t = setTimeout(() => { setKlartKort(false); setFrystPos(minPosition); setLage('lista'); }, 1200);
    return () => clearTimeout(t);
  }, [klartKort]); // eslint-disable-line react-hooks/exhaustive-deps

  const gaTillLista = () => { setKlartKort(false); setFrystPos(minPosition); setLage('lista'); };
  const gaTillKarta = () => { setKlartKort(false); setFrystPos(null); setLage('karta'); };
  /** Tryck pa en symbol pa kartan: byt kort. */
  const valjPunktPaKartan = (id: string) => { setKlartKort(false); setValdPunktId(id); };
  /** Tryck pa en rad i listan: till kartan med punkten i kortet. */
  const oppnaPunktPaKartan = (id: string) => {
    setKlartKort(false); setValdPunktId(id); setFrystPos(null); setLage('karta');
  };

  // Kartan syns bara nar rundan finns, ar inladdad och vyn ar karta. Annars ligger
  // den kvar monterad men dold - se kartaMonterad.
  const kartaSynlig = effLage === 'karta' && !!vy?.egenkontroll && !laddar && !fel;
  const kortPunkt = valdPunktId ? allaPunkter.find((p) => p.id === valdPunktId) ?? null : null;
  const kanVisaKarta = !!vy?.egenkontroll && harPlats.size > 0;
  const lagerKnappStil = {
    minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 22,
    border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(28,28,30,0.92)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    color: T.t1, fontSize: 14, fontWeight: 600, fontFamily: T.ff,
    display: 'flex', alignItems: 'center', gap: 7,
  } as const;

  // Terrangens grupper. EN definition som bade tillstand 2 (oversikt) och 3 (vikt
  // ihop, utvikbar for att ratta) anvander.
  //   KOMPAKT: en rad per punkt (✓ eller avstand), narmast forst i gruppen. Tryck -> kartan.
  //   FULL:    dagens kort med OK/Avvikelse direkt i listan - nar positionen saknas ar
  //            listan sjalva flodet, och tre tryck per punkt ar att straffa anvandaren
  //            for nagot appen inte klarar. Punkter UTAN plats ar alltid kort: de har
  //            ingen karta att oppna, och maste ga att besvara.
  const terrangGrupper = grupper.map(({ grupp, punkter }) => {
    const ordnade = radL === 'kompakt' ? ordnaGruppEfterAvstand(punkter, avstandLista) : punkter;
    return (
      <div key={grupp}>
        <SectionHeader>{grupp}</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ordnade.map((p) =>
            radL === 'kompakt' && harPlats.has(p.id) ? (
              <PunktRad
                key={p.id}
                punkt={p}
                avstand={avstandLista.get(p.id)?.m ?? null}
                onOppna={() => oppnaPunktPaKartan(p.id)}
              />
            ) : (
              <PunktKort
                key={p.id}
                punkt={p}
                sparar={!!sparStatus[p.id]}
                last={rundanKlar}
                fotoUrler={fotoPerPunkt[p.id] ?? []}
                vald={valdPunktId === p.id}
                avstand={rundanKlar ? null : avstandLive.get(p.id)?.m ?? null}
                riktn={rundanKlar ? null : avstandLive.get(p.id)?.r ?? null}
                onSvara={(status) => svara(p, status)}
                onOppnaSheet={(l) => setSheet({ lage: l, punkt: p })}
                onValj={harPlats.has(p.id) ? () => oppnaPunktPaKartan(p.id) : null}
              />
            ),
          )}
        </div>
      </div>
    );
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff }}>
      <style>{designCss}</style>

      {/* VAGEN UT: pilen till egenkontroll-listan, i toppfaltet pa hemknappens plats.
          I roten sa den finns i alla tillstand - karta, lista, laddar, fel. */}
      <TillbakaTillListan />

      {/* TILLSTAND 1: GA RUNDAN. Helskarmskarta under toppfaltet, kortet UNDER den
          som syskon - inte ovanpa - sa det aldrig kan skymma den valda punkten.
          z 40: under toppfaltet (1000), felbannern (900), formularen och dialogen
          (1100) och ga-vyn (1200), sa ingenting de visar hamnar bakom kartan.
          Dold (display none) i listan, inte avmonterad: kameran och tiles ska inte
          byggas om vid varje vaxling. */}
      {vy?.egenkontroll && (kartaMonterad || effLage === 'karta') && (
        <div
          className="tona-opacity"
          style={{
            position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, zIndex: 40,
            background: T.bg, display: kartaSynlig ? 'flex' : 'none', flexDirection: 'column',
          }}
        >
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <RundKarta
              objekt={vy.kartObjekt}
              punkter={vy.punkter}
              kontext={kontext}
              provytor={provytor}
              valdPunktId={valdPunktId}
              hojd="100%"
              stammar={stammar ?? []}
              visaStammar={visaStammar}
              baskarta={baskarta}
              overlays={overlays}
              egnaVarden={egnaVarden}
              position={pos.position}
              onValjPunkt={valjPunktPaKartan}
              onValjProvyta={(nr) => {
                const y = provytor.find((q) => q.nummer === nr);
                if (y) setProvytaVald(y);
              }}
            />
            {/* Vilken runda man ar i. Inget tryck - bara ett namn. */}
            <div
              style={{
                position: 'absolute', top: 12, left: SIDMARGINAL, zIndex: 10, pointerEvents: 'none',
                maxWidth: 'calc(100% - 150px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                padding: '6px 12px', borderRadius: 16, background: 'rgba(28,28,30,0.92)',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {vy.objektNamn}
            </div>
            {/* Sag varfor stammolnet ar tomt - tyst avstangt ser ut som trasigt. */}
            {visaStammar && stammar !== null && stammar.length === 0 && (
              <div
                style={{
                  position: 'absolute', top: 56, left: SIDMARGINAL, right: SIDMARGINAL, zIndex: 10,
                  pointerEvents: 'none', padding: '6px 12px', borderRadius: 12,
                  background: 'rgba(28,28,30,0.92)', fontSize: 13, color: T.orange, lineHeight: 1.45,
                }}
              >
                {stamFel
                  ? 'Stammarna kunde inte läsas.'
                  : 'Inga avverkade stammar hittades för objektet — lägena kunde inte kontrolleras mot avverkad yta.'}
              </div>
            )}
            {/* IKONEN. Samma horn som i listan. */}
            <div style={{ position: 'absolute', top: 6, right: SIDMARGINAL, zIndex: 10 }}>
              <VaxlaVyKnapp till="lista" onClick={gaTillLista} />
            </div>
            {/* LAGERKNAPPEN - flytande nere till hoger. Attributionen ligger nere
                till vanster just for att inte hamna under den. */}
            <button
              onClick={() => setLagerMeny(true)}
              aria-label="Kartlager"
              style={{ ...lagerKnappStil, position: 'absolute', right: SIDMARGINAL, bottom: 12, zIndex: 10 }}
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
                layers
              </span>
              Lager
            </button>
          </div>

          {/* KORTET. Tar bara den plats det behover, och aldrig mer an 45 % av
              skarmen (en lang plankommentar scrollar). */}
          <div
            style={{
              flexShrink: 0, maxHeight: '45vh', overflowY: 'auto', background: T.bg,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: `12px ${SIDMARGINAL}px ${medSafeBotten(12)}`,
            }}
          >
            {terrangKvar > 0 && (
              <div style={{ fontSize: 13, color: T.t2, margin: '0 0 8px' }}>
                Kvar i terrängen: {terrangKvar}
              </div>
            )}
            {kortPunkt ? (
              <>
                <PunktKort
                  key={kortPunkt.id}
                  punkt={kortPunkt}
                  sparar={!!sparStatus[kortPunkt.id]}
                  last={rundanKlar}
                  fotoUrler={fotoPerPunkt[kortPunkt.id] ?? []}
                  vald={false}
                  avstand={avstandLive.get(kortPunkt.id)?.m ?? null}
                  riktn={avstandLive.get(kortPunkt.id)?.r ?? null}
                  onSvara={(status) => svara(kortPunkt, status)}
                  onOppnaSheet={(l) => setSheet({ lage: l, punkt: kortPunkt })}
                  onValj={null}
                />
                {klartKort && (
                  <div role="status" style={{ fontSize: 14, color: T.t2, margin: '10px 0 0' }}>
                    Sista punkten i terrängen är besvarad — går vidare till avslutet.
                  </div>
                )}
                {/* Tappas positionen medan man har ett kort kvar star kortet kvar -
                    men det ska sagas att ingen "narmaste" kan raknas ut. */}
                {pos.status !== 'ok' && !klartKort && (
                  <div style={{ marginTop: 10 }}><PositionRad pos={pos} /></div>
                )}
              </>
            ) : terrangKvar === 0 ? (
              <div role="status" style={{ fontSize: 15, color: T.t2 }}>
                Alla punkter i terrängen är besvarade.
              </div>
            ) : pos.status !== 'ok' ? (
              <PositionRad pos={pos} />
            ) : (
              <div role="status" style={{ fontSize: 15, color: T.t2, lineHeight: 1.45 }}>
                Punkterna som återstår saknar plats på kartan. Svara på dem i listan.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TILLSTAND 2 OCH 3: LISTAN. display none (inte borta) medan kartan visas, sa
          att dokumentet inte kan scrollas bakom den. */}
      <div style={{ display: kartaSynlig ? 'none' : 'block' }}>
      <PageContainer width="smal" style={{ paddingBottom: 120, paddingTop: 0 }}>
        {/* STICKY rubrikrad i flodet (designreglerna: aldrig fixed + uppmatt padding).
            Ikonen sitter hogerstalld, i samma horn som pa kartan. Vagen tillbaka ar
            <TillbakaTillListan /> i toppfaltet (samma pil i bada lagena) - raden har
            ingen egen lank, sa det inte finns tva bakatknappar bredvid varandra. */}
        <div
          style={{
            position: 'sticky', top: underTopbar(), zIndex: 20, background: T.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 56,
          }}
        >
          {kanVisaKarta && !laddar && !fel && <VaxlaVyKnapp till="karta" onClick={gaTillKarta} />}
        </div>

        {laddar && (
          <div style={{ padding: '32px 4px', color: T.t2, fontSize: 15 }}>Hämtar rundan…</div>
        )}

        {!laddar && fel && (
          <div style={{ background: T.group, borderRadius: 12, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 15, marginBottom: 12 }}>{fel}</div>
            <button
              onClick={() => ladda()}
              style={{
                minHeight: 44,
                width: '100%',
                borderRadius: 10,
                border: 'none',
                background: T.blue,
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                fontFamily: T.ff,
              }}
            >
              Försök igen
            </button>
          </div>
        )}

        {!laddar && !fel && vy && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, margin: '4px 0 4px' }}>
              {vy.objektNamn}
            </h1>

            {/* Forutsattningarna OVANFOR kartan och utanfor det sticky blocket:
                de ska ses en gang och sedan scrollas bort. Aldrig nere vid
                avvikelseknappen - se filhuvudet i Forutsattningar.tsx. */}
            {vy.egenkontroll && !gaTill && (
              <Forutsattningar
                vader={vy.egenkontroll.vader}
                maskiner={vy.egenkontroll.maskiner}
                rundaId={vy.egenkontroll.id}
              />
            )}

            {/* Provytorna: oforandrade, men inte langre klistrade under en liten
                karta - kartan ar nu ett eget tillstand, och ytorna ar tryckbara dar. */}
            {vy.egenkontroll && !gaTill && (
              <div style={{ marginTop: 8 }}>
                <ProvyteLista
                  provytor={provytor}
                  minPosition={minPosition}
                  last={rundanKlar}
                  onValj={(y) => setProvytaVald(y)}
                  onGaTill={(y) => setGaTill(y)}
                />
              </div>
            )}

            {!vy.egenkontroll ? (
              <>
                <p style={{ fontSize: 15, color: T.t2, lineHeight: 1.5, margin: '0 0 20px' }}>
                  Ingen egenkontroll är startad. När du startar skapas checklistan
                  ur objektets planering — hänsyn, kulturlämningar, basvägar och
                  avlägg som planerades — plus punkterna om själva utförandet.
                </p>
                <button
                  onClick={starta}
                  disabled={startar}
                  style={{
                    width: '100%',
                    minHeight: 52,
                    borderRadius: 12,
                    border: 'none',
                    background: T.green,
                    color: '#000',
                    fontSize: 17,
                    fontWeight: 700,
                    fontFamily: T.ff,
                    opacity: startar ? 0.5 : 1,
                  }}
                >
                  {startar ? 'Startar…' : 'Starta egenkontroll'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 22, fontWeight: 600, margin: '2px 0 2px' }}>
                  {besvaradePlan} av {antalPlan} klara
                </div>
                <p style={{ fontSize: 15, color: antalAvvikelser > 0 ? T.red : antalBattre > 0 ? GUL : T.t2, margin: '0 0 8px' }}>
                  {anmarkningsText(antalAvvikelser, antalBattre)}
                </p>

                {antalPlan === 0 && (
                  <div style={{ background: T.group, borderRadius: 12, padding: 16, marginTop: 12 }}>
                    <div style={{ fontSize: 15, marginBottom: 6 }}>
                      Rundan har inga punkter mot planen.
                    </div>
                    <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.45 }}>
                      Objektet saknade markeringar som blir kontrollpunkter — hänsyn,
                      kulturlämningar, basvägar eller avlägg.
                    </div>
                  </div>
                )}

                {/* TILLSTAND 3: sista punkten i terrangen ar besvarad. */}
                {terrangKvar === 0 && antalPlan > 0 && !rundanKlar && (
                  <p style={{ fontSize: 15, color: T.t2, margin: '0 0 8px' }}>
                    Alla punkter i terrängen är besvarade.
                    {kvar > 0 && ' Utförandet och mätningarna återstår.'}
                  </p>
                )}

                {/* Om en punkt blev obesvarad igen (kan bara hanna via en andring i
                    databasen - appen skriver aldrig tillbaka till obesvarad). Vyn
                    visar det; den kastar inte ut en ur avslutet. */}
                {obesvaradIgen && (
                  <div role="status" style={{ fontSize: 14, color: T.orange, lineHeight: 1.45, margin: '0 0 10px' }}>
                    {terrangKvar === 1
                      ? '1 punkt i terrängen är obesvarad igen.'
                      : `${terrangKvar} punkter i terrängen är obesvarade igen.`}
                    {' '}Öppna kartan för att svara på {terrangKvar === 1 ? 'den' : 'dem'}.
                  </div>
                )}

                {/* UTAN POSITION ELLER UTAN PLATSER: sagt rakt ut, och aldrig en
                    gissad ordning. Tva skilda skal som atgardas OLIKA - de far inte
                    se likadana ut. */}
                {radL === 'full' && terrangKvar > 0 && !rundanKlar && (
                  origo == null ? (
                    <div style={{ fontSize: 13, color: T.orange, lineHeight: 1.45, margin: '0 4px 10px' }}>
                      Objektet saknar kartbildens hörnkoordinater, så punkterna kan inte placeras i terrängen — de listas i grupp och ordning.
                    </div>
                  ) : harPlats.size === 0 ? (
                    <div style={{ fontSize: 13, color: T.orange, lineHeight: 1.45, margin: '0 4px 10px' }}>
                      Punkterna har ingen plats på kartan — de listas i grupp och ordning.
                    </div>
                  ) : pos.status !== 'ok' ? (
                    <div style={{ margin: '0 4px 10px' }}><PositionRad pos={pos} /></div>
                  ) : null
                )}

                {radL === 'kompakt' && terrangKvar > 0 && frystPos?.noggrannhet != null && (
                  <div style={{ fontSize: 12.5, color: T.t2, lineHeight: 1.45, margin: '0 4px 8px' }}>
                    Sorterad efter din position när listan öppnades (±{Math.round(frystPos.noggrannhet)} m).
                    Två punkter som ligger nära varandra kan stå i fel ordning.
                  </div>
                )}

                {/* TERRANGEN. Besvarad i sin helhet (tillstand 3) viks den ihop till
                    EN rad - det som aterstar ar utforande och matningar - men gar att
                    veckla ut for att ratta. En avslutad runda visas alltid utvikt. */}
                {terrangKvar === 0 && antalPlan > 0 && !rundanKlar ? (
                  <div className="tona-opacity">
                    <button
                      onClick={() => setVisaTerrang((v) => !v)}
                      aria-expanded={visaTerrang}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        width: '100%', minHeight: 56, marginTop: 8, border: 'none', borderRadius: 12,
                        background: T.group, padding: '8px 14px', textAlign: 'left',
                        color: T.t1, fontFamily: T.ff,
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 500 }}>Terrängen · {antalPlan} punkter</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: antalAvvikelser > 0 ? T.red : T.t2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {antalAvvikelser === 0
                          ? 'inga avvikelser'
                          : antalAvvikelser === 1 ? '1 avvikelse' : `${antalAvvikelser} avvikelser`}
                        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22 }}>
                          {visaTerrang ? 'expand_less' : 'expand_more'}
                        </span>
                      </span>
                    </button>
                    {visaTerrang && terrangGrupper}
                  </div>
                ) : (
                  terrangGrupper
                )}

                {/* Del 2. Doljs HELT nar rundan saknar utforandepunkter - en
                    runda som startades fore denna PR far dem aldrig, sa det
                    finns ingenting att forklara sig ur. */}
                {antalUtforande > 0 && (
                  <div>
                    <SectionHeader>Utförandet</SectionHeader>
                    <div style={{ fontSize: 15, color: T.t2, padding: '0 16px 8px' }}>
                      {besvaradeUtforande} av {antalUtforande}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {utforandepunkter.map((p) => (
                        <PunktKort
                          key={p.id}
                          punkt={p}
                          sparar={!!sparStatus[p.id]}
                          last={rundanKlar}
                          fotoUrler={fotoPerPunkt[p.id] ?? []}
                          vald={false}
                          onSvara={(status) => svara(p, status)}
                          onOppnaSheet={(lage) => setSheet({ lage, punkt: p })}
                          onValj={null}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Del 3: Matningar. Ligger SIST. Rubriken star still aven nar
                    det bara finns en punkt - fler kommer i provyte-PR:en, och
                    en rubrik som byter namn nar innehallet vaxer ar samre an
                    en som star kvar. */}
                {(antalMatning > 0 || provytor.length > 0) && (
                  <div>
                    <SectionHeader>Mätningar</SectionHeader>
                    {antalMatning > 0 && (
                      <div style={{ fontSize: 15, color: T.t2, padding: '0 16px 8px' }}>
                        {besvaradeMatning} av {antalMatning}
                      </div>
                    )}
                    {provytor.length > 0 && (
                      <div style={{ background: T.group, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                        <ProvyteSammanstallning provytor={provytor} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {matningspunkter.map((p) => (
                        <MatningsKort
                          key={p.id}
                          punkt={p}
                          fotoUrler={fotoPerPunkt[p.id] ?? []}
                          last={rundanKlar}
                          onOppna={() => setStubbePunkt(p)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback: okand del ska synas, inte forsvinna. */}
                {ovrigaPunkter.length > 0 && (
                  <div>
                    <SectionHeader>Övrigt</SectionHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ovrigaPunkter.map((p) => (
                        <PunktKort
                          key={p.id}
                          punkt={p}
                          sparar={!!sparStatus[p.id]}
                          last={rundanKlar}
                          fotoUrler={fotoPerPunkt[p.id] ?? []}
                          vald={false}
                          onSvara={(status) => svara(p, status)}
                          onOppnaSheet={(lage) => setSheet({ lage, punkt: p })}
                          onValj={null}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Avslutet. En klar runda visar ingen knapp alls - den ska
                    kannas last, inte som en knapp man inte far trycka pa. */}
                {rundanKlar ? (
                  <div
                    style={{
                      marginTop: 28,
                      background: T.group,
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10, height: 10, borderRadius: 5,
                        background: T.green, flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 15 }}>
                      Avslutad {vy.egenkontroll.klar ? kortDatum(vy.egenkontroll.klar) : 'datum saknas'}
                      {' — '}
                      {anmarkningsText(antalAvvikelser, antalBattre)}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => setVisaAvslutsdialog(true)}
                    disabled={!kanAvsluta}
                    style={{
                      marginTop: 28,
                      width: '100%',
                      minHeight: 52,
                      borderRadius: 12,
                      border: 'none',
                      background: kanAvsluta ? T.green : T.groupHi,
                      color: kanAvsluta ? '#000' : T.t2,
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: T.ff,
                    }}
                  >
                    {kanAvsluta
                      ? 'Avsluta rundan'
                      : `Avsluta rundan — ${kvar} kvar`}
                  </button>
                )}
              </>
            )}
          </>
        )}

      </PageContainer>
      </div>

      {/* Allt nedan ligger UTANFOR listans omslag: formularen, dialogen och menyn ska
          kunna oppnas ovanpa kartan, och ett fixed barn i en display:none-forfader
          ritas inte alls. */}

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
            onSparad={() => { setProvytaVald(null); ladda({ tyst: true }); }}
          />
        )}

        {stubbePunkt && vy?.egenkontroll && (
          <StubbeSheet
            punkt={stubbePunkt}
            egenkontrollId={vy.egenkontroll.id}
            antalSedanTidigare={(fotoPerPunkt[stubbePunkt.id] ?? []).length}
            onStang={() => setStubbePunkt(null)}
            onSparad={() => { setStubbePunkt(null); ladda({ tyst: true }); }}
          />
        )}

        {sheet && vy?.egenkontroll && (
          <AvvikelseSheet
            lage={sheet.lage}
            punkt={sheet.punkt}
            egenkontrollId={vy.egenkontroll.id}
            onStang={() => setSheet(null)}
            onSparad={() => { setSheet(null); ladda({ tyst: true }); }}
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
              <div style={{ fontSize: 15, color: T.t2, lineHeight: 1.5, marginBottom: 14 }}>
                Detta sparas som egenkontrollens dokument. Efteråt går rundan inte
                att ändra i appen.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                <Sammanfattningsrad etikett="Punkter" varde={`${allaPunkter.length}`} />
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
              ...(kartaSynlig ? { top: underTopbar(8) } : { bottom: 88 }),
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
