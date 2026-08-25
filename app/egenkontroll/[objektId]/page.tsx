'use client';

// Egenkontroll - rundan for ett objekt. Avskalad: ingen karta i denna PR.
//
// Rundan skapas FORST nar planeraren trycker "Starta egenkontroll" - aldrig
// av att vyn oppnas. Att bara titta pa ett objekt far inte lamna spar i
// databasen, och det partiella unika indexet gor en oavsiktlig runda dyr:
// den blockerar varje nytt forsok tills nagon stadar bort den.
//
// TVA DELAR. Del 1 = planpunkterna, kontroll MOT PLANEN, svaras OK/Avvikelse.
// Del 2 = Utforandet, hantverket, svaras Bra/Godkant/Kan bli battre. De far
// aldrig dela svarsskala: "Kan bli battre" ar ingen avvikelse.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import ProvytaSheet from '../ProvytaSheet';
import ProvyteLista, { type MinPosition } from '../ProvyteLista';
import Forutsattningar from '../Forutsattningar';
import KartLagerMeny, { type EgetLager } from '@/components/KartLagerMeny';
import { BASKARTOR, BASKARTA_DEFAULT, type BaskartaId } from '@/lib/mapLayers';
import { useMapLayers, useStringSetting } from '@/lib/hooks/useMapLayers';
import ProvyteSammanstallning from '../ProvyteSammanstallning';
import GaTillYta from '../GaTillYta';
import { skadeandel as _skadeandel, type LatLng } from '@/lib/provytor';
import { anmarkningsText, kortDatum } from '../format';

// GULT, INTE ROTT, for "Kan bli battre". Ingen har brutit mot nagot - blir det
// rott slutar folk satta det, och da far vi "Godkant" pa allt och verktyget ar
// dott. Rott ar reserverat for avvikelser mot planen i Del 1.
// #FFD60A ar samma gult som datahalsobannern pa startsidan; T.orange betyder
// redan "gar ut snart" pa utbildningssidorna.
const GUL = '#FFD60A';

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
  if (stammar === null) return 'Hämtas när stor karta öppnas';
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
  /** Markerad pa kartan just nu. */
  vald: boolean;
  onSvara: (status: PunktStatus) => void;
  onOppnaSheet: (lage: SheetLage) => void;
  /** null = punkten ar ingen plats (kalla='fast') och gar inte att centrera. */
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
            {vald ? 'visas på kartan' : 'visa'}
          </span>
        </button>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 500 }}>{punkt.rubrik}</div>
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
  const [minPosition, setMinPosition] = useState<MinPosition>(null);
  const [helskarm, setHelskarm] = useState(false);
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
  // Stammarna hamtas EN gang och bara nar de behovs (helskarm eller ga-vy).
  const [stammar, setStammar] = useState<LatLng[] | null>(null);
  const [stamFel, setStamFel] = useState(false);
  // Kontextlagret - orientering, aldrig dokumentets innehall.
  const [kontext, setKontext] = useState<{ data: any }[]>([]);
  const [avslutar, setAvslutar] = useState(false);

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    try {
      setVy(await hamtaRunda(objektId));
    } catch (e) {
      setVy(null);
      setFel(e instanceof Error ? e.message : 'Kunde inte hämta egenkontrollen.');
    } finally {
      setLaddar(false);
    }
  }, [objektId]);

  useEffect(() => {
    ladda();
  }, [ladda]);

  // Stammolnet: hamtas forst nar helskarmen oppnas, och bara en gang. Det ar
  // 12 000 rader pa en gallring - de ska inte lasas for en 180 px karta.
  const vo = vy?.kartObjekt?.vo_nummer ?? null;
  useEffect(() => {
    if (!helskarm || stammar !== null || !vo) return;
    let avbruten = false;
    hamtaAvverkadeStammar(vo)
      .then((s) => { if (!avbruten) { setStammar(s); setStamFel(false); } })
      .catch(() => { if (!avbruten) { setStammar([]); setStamFel(true); } });
    return () => { avbruten = true; };
  }, [helskarm, stammar, vo]);

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

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff }}>
      <PageContainer width="smal" style={{ paddingBottom: 120, paddingTop: 8 }}>
        <Link
          href="/egenkontroll"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            minHeight: 44,
            color: T.blue,
            textDecoration: 'none',
            fontSize: 17,
            marginLeft: -6,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>
            chevron_left
          </span>
          Egenkontroll
        </Link>

        {laddar && (
          <div style={{ padding: '32px 4px', color: T.t2, fontSize: 15 }}>Hämtar rundan…</div>
        )}

        {!laddar && fel && (
          <div style={{ background: T.group, borderRadius: 12, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 15, marginBottom: 12 }}>{fel}</div>
            <button
              onClick={ladda}
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
            {vy.egenkontroll && !helskarm && !gaTill && (
              <Forutsattningar
                vader={vy.egenkontroll.vader}
                maskiner={vy.egenkontroll.maskiner}
                rundaId={vy.egenkontroll.id}
              />
            )}

            {/* Kartan ligger kvar synlig medan listan scrollas. Sticky, inte
                fixed - den ska folja med i flodet och inte lagga sig over
                nagot. 180 px ar en tredjedel av skarmen och ett medvetet pris. */}
            {/* ETT KARTLAGE I TAGET. Tva MapLibre-instanser skulle ge tva
                GPS-prenumerationer, och den dolda panelen komponerar anda inte.
                Kameralaget overlever medvetet INTE vaxlingen: den som oppnar
                helskarm vill se helheten, den som stanger ar klar med den. */}
            {vy.egenkontroll && !helskarm && !gaTill && (
              <div
                style={{
                  position: 'sticky', top: 'calc(56px + env(safe-area-inset-top))',
                  zIndex: 5, background: T.bg, paddingTop: 8,
                }}
              >
                <RundKarta
                  objekt={vy.kartObjekt}
                  punkter={vy.punkter}
                  kontext={kontext}
                  provytor={provytor}
                  valdPunktId={valdPunktId}
                  baskarta={baskarta}
                  overlays={overlays}
                  egnaVarden={egnaVarden}
                  onPosition={setMinPosition}
                />
                <button
                  onClick={() => setHelskarm(true)}
                  style={{
                    width: '100%', minHeight: 44, borderRadius: 10, marginBottom: 10,
                    border: '1.5px solid rgba(255,255,255,0.14)', background: 'transparent',
                    color: T.t2, fontSize: 15, fontWeight: 600, fontFamily: T.ff,
                  }}
                >
                  Öppna stor karta
                </button>
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

                {grupper.map(({ grupp, punkter }) => (
                  <div key={grupp}>
                    <SectionHeader>{grupp}</SectionHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {punkter.map((p) => (
                        <PunktKort
                          key={p.id}
                          punkt={p}
                          sparar={!!sparStatus[p.id]}
                          last={rundanKlar}
                          fotoUrler={fotoPerPunkt[p.id] ?? []}
                          vald={valdPunktId === p.id}
                          onSvara={(status) => svara(p, status)}
                          onOppnaSheet={(lage) => setSheet({ lage, punkt: p })}
                          onValj={p.geometri_snapshot ? () => setValdPunktId(p.id) : null}
                        />
                      ))}
                    </div>
                  </div>
                ))}

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
                          vald={valdPunktId === p.id}
                          onSvara={(status) => svara(p, status)}
                          onOppnaSheet={(lage) => setSheet({ lage, punkt: p })}
                          onValj={p.geometri_snapshot ? () => setValdPunktId(p.id) : null}
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
                          vald={valdPunktId === p.id}
                          onSvara={(status) => svara(p, status)}
                          onOppnaSheet={(lage) => setSheet({ lage, punkt: p })}
                          onValj={p.geometri_snapshot ? () => setValdPunktId(p.id) : null}
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

        {helskarm && vy && (
          <div style={{
            position: 'fixed', inset: 0, background: T.bg, zIndex: 1150,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px',
            }}>
              <button onClick={() => setHelskarm(false)} style={{
                minHeight: 44, border: 'none', background: 'transparent',
                color: T.blue, fontSize: 17, fontFamily: T.ff,
              }}>
                Stäng
              </button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 600 }}>
                {vy.objektNamn}
              </span>
              <span style={{ minWidth: 44 }} />
            </div>
            {/* Sag varfor knappen ar slack - tyst avstangd ser ut som trasig. */}
            {visaStammar && stammar !== null && stammar.length === 0 && (
              <div style={{ fontSize: 13, color: T.orange, padding: '0 14px 8px', lineHeight: 1.45 }}>
                {stamFel
                  ? 'Stammarna kunde inte läsas.'
                  : 'Inga avverkade stammar hittades för objektet — lägena kunde inte kontrolleras mot avverkad yta.'}
              </div>
            )}
            {/* position:relative gor omslutningen till ankare for knappen. */}
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
                onPosition={setMinPosition}
              />
              {/* LAGERKNAPPEN - flytande nere till hoger, ovanpa kartan.
                  Samma plats i varje vy som har en karta, sa handen lar sig
                  var den sitter. Bara i helskarmen: i 180 px skulle den ata
                  det lilla som finns, och den lilla kartan arver valen tyst.
                  zIndex 10 lagger den over MapLibres canvas (som ligger pa 0)
                  utan att na kartkontrollerna; attributionen har flyttat till
                  vanster hornet just for att inte hamna under den. */}
              <button
                onClick={() => setLagerMeny(true)}
                aria-label="Kartlager"
                style={{
                  position: 'absolute', right: 12,
                  bottom: 'calc(12px + env(safe-area-inset-bottom))',
                  zIndex: 10,
                  minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 22,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(28,28,30,0.92)',
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  color: T.t1, fontSize: 14, fontWeight: 600, fontFamily: T.ff,
                  display: 'flex', alignItems: 'center', gap: 7,
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
                  layers
                </span>
                Lager
              </button>
            </div>
          </div>
        )}

        {/* MENYN - samma komponent som planeringsvyn ska anvanda i PR B.
            Bara de props som hor till egenkontrollen skickas; planeringens sex
            sektioner far inga och ritas darfor inte alls. */}
        <KartLagerMeny
          oppen={lagerMeny}
          onStang={() => setLagerMeny(false)}
          // OVER helskarmens 1150. Med komponentens default (500) monterades
          // menyn UNDER den ogenomskinliga helskarmen: knappen fyrade, men
          // ingenting syntes. Se doc-kommentaren i KartLagerMeny.
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
            onSparad={() => { setProvytaVald(null); ladda(); }}
          />
        )}

        {stubbePunkt && vy?.egenkontroll && (
          <StubbeSheet
            punkt={stubbePunkt}
            egenkontrollId={vy.egenkontroll.id}
            antalSedanTidigare={(fotoPerPunkt[stubbePunkt.id] ?? []).length}
            onStang={() => setStubbePunkt(null)}
            onSparad={() => { setStubbePunkt(null); ladda(); }}
          />
        )}

        {sheet && vy?.egenkontroll && (
          <AvvikelseSheet
            lage={sheet.lage}
            punkt={sheet.punkt}
            egenkontrollId={vy.egenkontroll.id}
            onStang={() => setSheet(null)}
            onSparad={() => { setSheet(null); ladda(); }}
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
              bottom: 88,
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
      </PageContainer>
    </div>
  );
}
