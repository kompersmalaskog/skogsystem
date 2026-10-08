'use client';

// Avsluta-laget: ETT KORT I TAGET.
//
// Ett kort fyller ytan: raknare overst ("4 av 12"), stor rubrik, underrad, och knapparna
// langst ner - pa SAMMA STALLE varje gang, sa tummen lar sig positionen i stallet for att
// leta. Svarar man kommer nasta kort pa samma plats. Man kan inte hoppa over en punkt av
// misstag, for det finns bara en pa skarmen, och de obesvarade finns inte i raden langst ner.
//
// Raden langst ner ar de BESVARADE, som numrerade rutor (44 pt) som bryts i bredd - inte en
// rad per punkt. Tryck pa en ruta = ga tillbaka och andra. Efter ett svar - aven en rattelse -
// gar man till nasta OBESVARADE punkt, aldrig "nasta ruta": den som gatt tillbaka for att
// andra en sak vill vidare dar hen var.
//
// Provytorna ar INTE kort: de har en plats och nas via kartan. Slutkortet sager hur manga som
// aterstar, for avslutaRunda raknar dem.
//
// Logiken (ordning, vilket kort, rutor, avsluta) ligger i lib/egenkontrollSerie.ts och ar
// testad; har finns bara det som ritas.

import { useEffect, useState } from 'react';
import { KRAVNIVA_STUBBEHANDLING, stubbeDom, utforandeUnderrad } from '@/lib/egenkontroll';
import type { EgenkontrollPunkt, PunktDel, PunktStatus } from '@/lib/egenkontroll';
import {
  TUMSKYDD_MS, aktivtKort, antalBesvarade, rutor, type AvslutaStatus,
} from '@/lib/egenkontrollSerie';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { GUL, STATUS_TEXT, SVARSALTERNATIV, statusEtikett } from './svar';
import { anmarkningsText } from './format';

type Props = {
  serie: EgenkontrollPunkt[];
  /** Kortet man gatt tillbaka till, eller null = det forsta obesvarade. */
  valtId: string | null;
  onVal: (id: string | null) => void;
  objektNamn: string;
  fotoPerPunkt: Record<string, string[]>;
  sparStatus: Record<string, boolean>;
  /** true = sparat (eller samma svar som redan stod). false = det gick inte, och da gar vi inte vidare. */
  onSvara: (punkt: EgenkontrollPunkt, status: PunktStatus) => Promise<boolean>;
  onFoto: (punkt: EgenkontrollPunkt) => void;
  onStubbe: (punkt: EgenkontrollPunkt) => void;
  slut: {
    status: AvslutaStatus;
    antalAvvikelser: number;
    antalBattre: number;
    avslutar: boolean;
    onAvsluta: () => void;
  };
  /** CSS-langd: ytan under toppfaltet och rubrikraden. Ett layoutmatt - kommer fran sidan. */
  minHojd: string;
};

const SVAR_KNAPP = {
  width: '100%', minHeight: 56, borderRadius: RADIE.knapp, border: 'none',
  fontFamily: 'inherit', cursor: 'pointer', ...TYP.listtitel,
} as const;

export default function UtforandeSerie({
  serie, valtId, onVal, objektNamn, fotoPerPunkt, sparStatus, onSvara, onFoto, onStubbe, slut, minHojd,
}: Props) {
  const kort = aktivtKort(serie, valtId);
  const punkt = kort.punkt;
  const nyckel = punkt ? punkt.id : 'slut';
  const besvarade = antalBesvarade(serie);
  const sparar = punkt ? !!sparStatus[punkt.id] : false;

  // TUMSKYDD: ett sent dubbeltryck far inte landa pa nasta punkt, som hamnar pa exakt samma
  // stalle. Knapparna ar inerta en kort stund efter varje kortbyte - utan att se annorlunda ut.
  const [last, setLast] = useState(true);
  useEffect(() => {
    setLast(true);
    const t = setTimeout(() => setLast(false), TUMSKYDD_MS);
    return () => clearTimeout(t);
  }, [nyckel]);
  const inert = last || sparar;

  const ruteLista = rutor(serie);
  const delText = punkt ? (punkt.del === 'matning' ? 'Mätningen' : 'Utförandet') : 'Klart';

  return (
    <section
      aria-label="Utförande och mätningar, ett kort i taget"
      style={{ minHeight: minHojd, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', paddingBottom: AVSTAND.l }}
    >
      <div style={{ padding: `${AVSTAND.xs}px ${AVSTAND.xs}px ${AVSTAND.m}px` }}>
        <div aria-live="polite" style={{ ...TYP.tal }}>{besvarade} av {serie.length}</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
          {delText} · {objektNamn}
        </div>
      </div>

      <div
        key={nyckel}
        className="tona-opacity"
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: FARG.kort, borderRadius: RADIE.sheet, padding: AVSTAND.xl,
        }}
      >
        {punkt === null ? (
          <Slutkort slut={slut} serieLangd={serie.length} />
        ) : punkt.del === 'matning' ? (
          <StubbeKort
            punkt={punkt} fotoUrler={fotoPerPunkt[punkt.id] ?? []} inert={inert}
            onStubbe={() => onStubbe(punkt)} onKlar={() => onVal(null)}
          />
        ) : (
          <GraderatKort
            punkt={punkt} arValt={kort.arValt} fotoUrler={fotoPerPunkt[punkt.id] ?? []} inert={inert}
            onSvar={async (status) => { if (await onSvara(punkt, status)) onVal(null); }}
            onFoto={() => onFoto(punkt)} onFortsatt={() => onVal(null)}
          />
        )}
      </div>

      {/* RADEN RESERVERAR SIN PLATS FRAN START: en osynlig ruta per obesvarad punkt. Annars
          vaxer raden med varje svar (forsta svaret, sedan en andra rad) och knapparna ovanfor
          flyttar sig - och hela poangen ar att de sitter pa samma stalle varje gang. De osynliga
          rutorna ar inte knappar och gar inte att trycka pa. */}
      <div
        role="group"
        aria-label="Besvarade punkter — tryck för att gå tillbaka och ändra"
        aria-hidden={ruteLista.length === 0}
        style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, paddingTop: AVSTAND.m }}
      >
          {serie.map((p, i) => {
            const r = ruteLista.find((x) => x.punkt.id === p.id);
            if (!r) return <span key={p.id} aria-hidden="true" style={{ width: 44, height: 44, visibility: 'hidden' }} />;
            const vald = kort.arValt && punkt?.id === r.punkt.id;
            return (
              <button
                key={r.punkt.id}
                onClick={() => onVal(r.punkt.id)}
                aria-pressed={vald}
                aria-label={`Punkt ${r.nummer}, ${r.punkt.rubrik}: ${r.ord}. Gå tillbaka och ändra.`}
                style={{
                  width: 44, height: 44, borderRadius: RADIE.rad, border: 'none', padding: 0,
                  background: FARG.kort, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  outline: vald ? `2px solid ${FARG.text}` : 'none', outlineOffset: -2,
                }}
              >
                <span style={{ ...TYP.listtitel, lineHeight: 1.1 }}>{r.nummer}</span>
                <span
                  aria-hidden="true"
                  style={{ ...TYP.meta, fontWeight: 700, lineHeight: 1.1, color: statusEtikett(r.punkt.status).farg }}
                >
                  {r.tecken}
                </span>
              </button>
            );
          })}
      </div>
    </section>
  );
}

/** Bra / Godkant / Kan bli battre. Foto pa varje utforandepunkt - ocksa nar allt ar bra. */
function GraderatKort({
  punkt, arValt, fotoUrler, inert, onSvar, onFoto, onFortsatt,
}: {
  punkt: EgenkontrollPunkt; arValt: boolean; fotoUrler: string[]; inert: boolean;
  onSvar: (status: PunktStatus) => void; onFoto: () => void; onFortsatt: () => void;
}) {
  const underrad = punkt.plan_kommentar ?? utforandeUnderrad(punkt.punkt_typ);
  const alternativ = SVARSALTERNATIV[punkt.del as PunktDel] ?? SVARSALTERNATIV.utforande;
  const besvarad = punkt.status !== null;
  const et = statusEtikett(punkt.status);
  return (
    <>
      <h2 style={{ ...TYP.titel, margin: 0 }}>{punkt.rubrik}</h2>
      {underrad && (
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.s }}>{underrad}</div>
      )}
      {besvarad && (
        <div style={{ ...TYP.listtitel, color: et.farg, marginTop: AVSTAND.m }}>
          Svar: {et.text}
        </div>
      )}
      {punkt.kommentar && (
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{punkt.kommentar}</div>
      )}
      <Miniatyrer urler={fotoUrler} />

      <div style={{ flex: 1, minHeight: AVSTAND.l }} />

      {arValt && besvarad && (
        <button
          onClick={onFortsatt}
          disabled={inert}
          style={{ ...SVAR_KNAPP, minHeight: 44, background: 'transparent', color: FARG.bla, marginBottom: AVSTAND.s }}
        >
          Fortsätt där jag var
        </button>
      )}
      <button
        onClick={onFoto}
        disabled={inert}
        style={{
          ...SVAR_KNAPP, minHeight: 44, background: FARG.fyllning, color: FARG.text2, marginBottom: AVSTAND.s,
        }}
      >
        {fotoUrler.length > 0 ? 'Lägg till fler foton' : 'Lägg till foto'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {alternativ.map((a) => {
          const aktiv = punkt.status === a.status;
          return (
            <button
              key={a.status}
              onClick={() => onSvar(a.status)}
              disabled={inert}
              aria-pressed={aktiv}
              style={{
                ...SVAR_KNAPP,
                background: aktiv ? a.farg : FARG.fyllning,
                color: aktiv ? '#000' : FARG.text,
                // ordet bar beskedet; en vald knapp far dessutom en tjockare ram - inte bara fyllning
                boxShadow: aktiv ? `inset 0 0 0 2px ${FARG.text}` : 'none',
              }}
            >
              {a.etikett}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Stubbehandlingen: ingen svarsskala - ett tal. Kortet foljer MatningsKort, men med serien knappar. */
function StubbeKort({
  punkt, fotoUrler, inert, onStubbe, onKlar,
}: {
  punkt: EgenkontrollPunkt; fotoUrler: string[]; inert: boolean; onStubbe: () => void; onKlar: () => void;
}) {
  const varde = punkt.varde_bekraftat != null ? Number(punkt.varde_bekraftat) : null;
  const dom = varde != null ? stubbeDom(varde) : null;
  const domFarg = dom == null ? FARG.text2 : dom.status === 'ok' ? FARG.gron : GUL;
  return (
    <>
      <h2 style={{ ...TYP.titel, margin: 0 }}>{punkt.rubrik}</h2>
      {varde == null ? (
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.s }}>
          Inte mätt. Kravnivå {KRAVNIVA_STUBBEHANDLING} %.
        </div>
      ) : (
        <>
          <div style={{ ...TYP.listtitel, color: domFarg, marginTop: AVSTAND.m }}>
            {varde} % · {dom!.text}
            {fotoUrler.length > 1 && (
              <span style={{ color: FARG.text2, fontWeight: 400 }}>{' · '}{fotoUrler.length} stubbar</span>
            )}
          </div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
            Kravnivå {KRAVNIVA_STUBBEHANDLING} %
          </div>
        </>
      )}
      <Miniatyrer urler={fotoUrler} />
      <div style={{ flex: 1, minHeight: AVSTAND.l }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {varde == null ? (
          <button
            onClick={onStubbe} disabled={inert}
            style={{ ...SVAR_KNAPP, background: FARG.gron, color: FARG.bg }}
          >
            Mät stubbehandling
          </button>
        ) : (
          <>
            <button
              onClick={onStubbe} disabled={inert}
              style={{ ...SVAR_KNAPP, background: FARG.fyllning, color: FARG.text }}
            >
              Fler stubbar
            </button>
            {/* Klar finns eftersom man ofta tar flera stubbar - kortet far inte stiga vidare efter den forsta. */}
            <button
              onClick={onKlar} disabled={inert}
              style={{ ...SVAR_KNAPP, background: FARG.gron, color: FARG.bg }}
            >
              Klar
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Nar allt ar besvarat. Sager sanningen om avslutet - provytor raknas, sa de star har. */
function Slutkort({ slut, serieLangd }: { slut: Props['slut']; serieLangd: number }) {
  const { status, antalAvvikelser, antalBattre, avslutar, onAvsluta } = slut;
  const farg = antalAvvikelser > 0 ? STATUS_TEXT.avvikelse.farg : antalBattre > 0 ? GUL : FARG.text2;
  return (
    <>
      <h2 style={{ ...TYP.titel, margin: 0 }}>Alla punkter är besvarade</h2>
      <div style={{ ...TYP.text, color: farg, marginTop: AVSTAND.s }}>
        {serieLangd} {serieLangd === 1 ? 'punkt' : 'punkter'} · {anmarkningsText(antalAvvikelser, antalBattre)}
      </div>
      {status.orsak && (
        <div role="status" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.l }}>
          {status.orsak}.{status.kvarProvytor > 0 && ' Provytorna mäts på kartan.'}
        </div>
      )}
      <div style={{ flex: 1, minHeight: AVSTAND.l }} />
      <button
        onClick={onAvsluta}
        disabled={!status.kan || avslutar}
        style={{
          ...SVAR_KNAPP,
          background: status.kan ? FARG.gron : FARG.upphojt,
          color: status.kan ? '#000' : FARG.text2,
          opacity: avslutar ? 0.5 : 1,
          cursor: status.kan ? 'pointer' : 'default',
        }}
      >
        {avslutar ? 'Avslutar…' : status.etikett}
      </button>
    </>
  );
}

function Miniatyrer({ urler }: { urler: string[] }) {
  if (urler.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m, flexWrap: 'wrap' }}>
      {urler.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" style={{ width: 56, height: 56, borderRadius: RADIE.rad, objectFit: 'cover' }} />
      ))}
    </div>
  );
}
