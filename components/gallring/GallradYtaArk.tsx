'use client';
// "Var gallrades det?" — kartan över den gallrade ytan i tre färger och frågorna om bitarna.
// Appen har redan bedömt varje bit (lib/gallradYta.ts); den som vet bättre svarar, och svaret går före.
// Ett ark: kartan + en rad per bit; tryck på en bit = dess svar i samma ark (‹ tillbaka till kartan).
import { useEffect, useState } from 'react';
import { AVSTAND, FARG, RADIE, RORELSE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import GallradYtaKarta from './GallradYtaKarta';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import {
  EJ_GALLRAT_ORD, RUTA, UTANFOR_ORD,
  type EjGallratBit, type EjGallratSvar, type GallradYta, type UtanforBit, type UtanforSvar,
} from '@/lib/gallradYta';
import { fmtAntal, fmtDecimal } from '@/lib/gallring';

type Bit = UtanforBit | EjGallratBit;

/** Färgerna på kartan. Ord står alltid bredvid (teckenförklaringen) — färgen bär aldrig ensam. */
export const YTA_FARG = {
  gallrat: FARG.diagram1,
  annat: FARG.text3,
  ejGallrat: FARG.orange,
} as const;

/** Vidas gräns i teckenförklaringen — samma streck som på kartan. */
const STRECK_PX = 2;
/** Enhetens val av lager (flygfoto, stammar). Bara en bekvämlighet — saknas det gäller förvalet. */
const LAGER_NYCKEL = 'gallring_karta_lager_v1';
type Lager = { flygfoto: boolean; stammar: boolean };
const LAGER_FORVAL: Lager = { flygfoto: true, stammar: false };

function lasLager(): Lager {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAGER_NYCKEL) ?? 'null');
    if (v && typeof v.flygfoto === 'boolean' && typeof v.stammar === 'boolean') return v;
  } catch { /* privat läge, trasigt värde */ }
  return LAGER_FORVAL;
}
function sparaLager(l: Lager) {
  try { window.localStorage.setItem(LAGER_NYCKEL, JSON.stringify(l)); } catch { /* inget minne: valet gäller bara nu */ }
}

const ha = (v: number) => `${fmtDecimal(v, 1)} ha`;

export function bitRubrik(b: Bit): string {
  return b.typ === 'utanfor' ? `Utanför gränsen · ${ha(b.ha)}` : `Innanför, inte gallrat · ${ha(b.ha)}`;
}

/** Vad som gäller för biten, i ord. */
export function bitGaller(b: Bit): string {
  if (b.typ === 'utanfor') return UTANFOR_ORD[b.galler];
  return b.svar ? EJ_GALLRAT_ORD[b.svar] : 'Inte gallrat';
}

function Teckenforklaring({ stammar }: { stammar: boolean }) {
  const rad = (farg: string, ord: string, streckad = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
      <span style={{ width: AVSTAND.l, height: AVSTAND.m, borderRadius: RADIE.stapel, background: streckad ? 'transparent' : farg,
        border: streckad ? `${STRECK_PX}px dashed ${farg}` : 'none', boxSizing: 'border-box' }} />
      {ord}
    </span>
  );
  return (
    <p style={{ margin: `${AVSTAND.s}px 0 0`, display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>
      {rad(YTA_FARG.gallrat, 'Gallrat, räknas')}
      {rad(YTA_FARG.annat, 'Utanför, räknas inte')}
      {rad(YTA_FARG.ejGallrat, 'Inte gallrat')}
      {rad(FARG.text, 'Vidas gräns', true)}
      {stammar && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}>
          <span style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: FARG.text, border: `1px solid ${FARG.bg}`, boxSizing: 'border-box' }} />
          Avverkad stam
        </span>
      )}
    </p>
  );
}

/** En rad med en brytare (som Backväg i kartkortet): 44 px träffyta, spåret syns inuti. */
function Brytare({ titel, under, pa, onAndra, id }: { titel: string; under?: string; pa: boolean; onAndra: () => void; id: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
      <div>
        <div style={{ ...TYP.text, color: FARG.text }}>{titel}</div>
        {under && <div style={{ ...TYP.meta, color: FARG.text2 }}>{under}</div>}
      </div>
      <button type="button" role="switch" aria-checked={pa} aria-label={titel} data-lager={id} onClick={onAndra}
        style={{ minWidth: TRAFFYTA.primar + AVSTAND.s, minHeight: TRAFFYTA.min, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span aria-hidden="true" style={{ width: TRAFFYTA.primar + AVSTAND.s, height: AVSTAND.xxl, borderRadius: AVSTAND.xl, position: 'relative', background: pa ? FARG.text : FARG.upphojt, transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>
          <span style={{ position: 'absolute', top: AVSTAND.xs, left: pa ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xs, width: AVSTAND.xl, height: AVSTAND.xl, borderRadius: RADIE.cirkel, background: pa ? FARG.bg : FARG.text2, transition: `left ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
        </span>
      </button>
    </div>
  );
}

type Props = {
  yta: GallradYta;
  svarSparas: boolean;
  onSvar: (nyckel: string, svar: UtanforSvar | EjGallratSvar | null) => Promise<void>;
  onStang: () => void;
};

export default function GallradYtaArk({ yta, svarSparas, onSvar, onStang }: Props) {
  const [valdNyckel, setValdNyckel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [lager, setLager] = useState<Lager>(LAGER_FORVAL);
  const bitar: Bit[] = [...yta.utanfor, ...yta.ejGallrat];
  const andraLager = (l: Lager) => { setLager(l); sparaLager(l); };
  useEffect(() => { setLager(lasLager()); }, []);
  const vald = bitar.find((b) => b.nyckel === valdNyckel) ?? null;

  const svara = async (svar: UtanforSvar | EjGallratSvar | null) => {
    if (!vald) return;
    setSparar(true);
    setFel(null);
    try {
      await onSvar(vald.nyckel, svar);
      setValdNyckel(null);
    } catch {
      setFel('Svaret sparades inte. Försök igen.');
    } finally {
      setSparar(false);
    }
  };

  if (vald) {
    const val: [UtanforSvar | EjGallratSvar, string][] = vald.typ === 'utanfor'
      ? (Object.entries(UTANFOR_ORD) as [UtanforSvar, string][])
      : (Object.entries(EJ_GALLRAT_ORD) as [EjGallratSvar, string][]);
    const aktuellt = vald.typ === 'utanfor' ? vald.galler : vald.svar;
    const appens = vald.typ === 'utanfor' ? `Appen bedömde: ${UTANFOR_ORD[vald.klass]}` : 'Ingen stam är fälld här.';
    return (
      <Ark rubrik={`${vald.nr} · ${bitRubrik(vald)}`} stang="Klar" onStang={onStang}>
        <button type="button" onClick={() => { setValdNyckel(null); setFel(null); }}
          style={{ background: 'none', border: 'none', padding: `${AVSTAND.m}px 0`, minHeight: TRAFFYTA.min, color: FARG.bla, ...TYP.text, cursor: 'pointer' }}>
          ‹ Kartan
        </button>
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.text2 }}>
          {vald.typ === 'utanfor' ? `${fmtAntal(vald.stammar)} stammar. ${appens}` : appens}
        </p>
        {!svarSparas && (
          <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.orange }} data-svar-sparas-inte="">
            Svaren kan inte sparas just nu, så valen nedan går inte att trycka på. Appens bedömning gäller.
          </p>
        )}
        <Sektion rubrik={vald.typ === 'utanfor' ? 'Vad är det här?' : 'Varför?'} kort={false}>
          {val.map(([nyckel, ord], i) => (
            <Rad key={nyckel} titel={ord} sista={i === val.length - 1}
              hoger={aktuellt === nyckel ? <Ikon namn="check" farg={FARG.text} /> : undefined}
              onTryck={svarSparas && !sparar ? () => svara(nyckel) : undefined}
              dampad={!svarSparas} attr={{ 'data-svar': nyckel }} />
          ))}
        </Sektion>
        {vald.svar && svarSparas && (
          <button type="button" disabled={sparar} onClick={() => svara(null)}
            style={{ background: 'none', border: 'none', padding: `${AVSTAND.m}px 0`, minHeight: TRAFFYTA.min, color: FARG.bla, ...TYP.text, cursor: 'pointer' }}>
            Återgå till appens bedömning
          </button>
        )}
        {fel && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, color: FARG.rod }}>{fel}</p>}
      </Ark>
    );
  }

  return (
    <Ark rubrik="Var gallrades det?" stang="Klar" onStang={onStang}>
      <GallradYtaKarta yta={yta} farg={YTA_FARG} flygfoto={lager.flygfoto} stammar={lager.stammar}
        onBit={(n) => { setValdNyckel(n); setFel(null); }} />
      <Teckenforklaring stammar={lager.stammar} />
      <Sektion rubrik="Visa på kartan" kort={false}>
        <Brytare id="flygfoto" titel="Flygfoto" pa={lager.flygfoto} onAndra={() => andraLager({ ...lager, flygfoto: !lager.flygfoto })} />
        <Brytare id="stammar" titel="Avverkade stammar" under={`${fmtAntal(yta.karta.stammar.length)} stammar med position`}
          pa={lager.stammar} onAndra={() => andraLager({ ...lager, stammar: !lager.stammar })} />
      </Sektion>
      {bitar.length > 0 && (
        <Sektion rubrik="Bitarna" kort={false}>
          {bitar.map((b, i) => (
            <Rad key={b.nyckel} titel={`${b.nr} · ${bitRubrik(b)}`}
              under={b.typ === 'utanfor' ? `${fmtAntal(b.stammar)} stammar` : undefined}
              hoger={bitGaller(b)} hogerUnder={b.svar ? 'svarat' : 'appens bedömning'}
              pil onTryck={() => setValdNyckel(b.nyckel)} sista={i === bitar.length - 1}
              attr={{ 'data-bit': b.nyckel }} />
          ))}
        </Sektion>
      )}
    </Ark>
  );
}
