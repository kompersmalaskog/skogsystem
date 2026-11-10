'use client';

// Maskinbilden: en tecknad skördare eller skotare från sidan. Föraren trycker där felet sitter (Martin 2026-11-10:
// "bilder är alltid bättre än text", tecknad och lite levande). Delarna, deras plats och vad ett tryck betyder
// bor i lib/arbetsmiljo/maskinBild.ts — teckningen här ritar bara och stämmer med de platserna.
//
// Två lägen:
//  - välja (onVal satt): små prickar visar var man kan trycka; vald plats får en orange prick med en lugn puls.
//    Under bilden en knapp per del (samma val, för den som hellre läser).
//  - visa (onVal saknas): bara den valda pricken, för Åtgärder.
// Rörelse: maskinen tonar in, vald prick poppar och pulserar. Stilla vid "minska rörelser".

import { useId, type MouseEvent } from 'react';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, RADIE, RORELSE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { BILD_B, BILD_H, delNamn, delar, tryck, valjDel, type BildTyp, type Val } from '@/lib/arbetsmiljo/maskinBild';

const KROPP = { fill: FARG.upphojt, stroke: FARG.text2, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
const DETALJ = { fill: 'none', stroke: FARG.text3, strokeWidth: 1.5, strokeLinecap: 'round' as const };
const BOM = { fill: 'none', stroke: FARG.text2, strokeWidth: 9, strokeLinecap: 'round' as const };
const BOM_INRE = { fill: 'none', stroke: FARG.upphojt, strokeWidth: 6, strokeLinecap: 'round' as const };

function Hjul({ x, y, r = 25 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={FARG.bg} stroke={FARG.text2} strokeWidth={1.5} />
      <circle cx={x} cy={y} r={r * 0.68} {...DETALJ} />
      <circle cx={x} cy={y} r={r * 0.24} fill={FARG.text3} />
    </g>
  );
}

/** Kedjor runt ett ensamt hjul (fyrhjulig maskin). */
function Kedja({ x, y, r }: { x: number; y: number; r: number }) {
  return <circle cx={x} cy={y} r={r + 3} fill="none" stroke={FARG.text3} strokeWidth={4} strokeDasharray="3 4" />;
}

/** Band runt ett boggipar: en rundad ram med länkar. */
function Band({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <rect x={x1 - 30} y={y - 30} width={x2 - x1 + 60} height={60} rx={30}
      fill="none" stroke={FARG.text3} strokeWidth={4} strokeDasharray="3 4" />
  );
}

function Stege({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  const steg: number[] = [];
  for (let y = y1 + 8; y < y2; y += 11) steg.push(y);
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} {...DETALJ} stroke={FARG.text2} />
      <line x1={x + 9} y1={y1} x2={x + 9} y2={y2} {...DETALJ} stroke={FARG.text2} />
      {steg.map(y => <line key={y} x1={x} y1={y} x2={x + 9} y2={y} {...DETALJ} stroke={FARG.text2} />)}
    </g>
  );
}

function Slackare({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={11} height={24} rx={5} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1.5} />
      <line x1={x + 5.5} y1={y - 4} x2={x + 5.5} y2={y} {...DETALJ} stroke={FARG.text2} />
    </g>
  );
}

function Droppe({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} q5 8 0 11 q-5 -3 0 -11 z`} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1} />;
}

/** Fyrhjulig skördare (Rottne H8E): kranen längst fram, hytten bakom den, midjeled, motorn bak. */
function Skordare() {
  return (
    <g>
      <line x1={0} y1={214} x2={BILD_B} y2={214} stroke={FARG.linje} strokeWidth={2} />
      {/* Kranen: pelare längst fram, bom upp och fram, aggregat. */}
      <rect x={76} y={92} width={18} height={60} rx={4} {...KROPP} />
      <path d="M85 96 L118 26 L40 58" {...BOM} />
      <path d="M85 96 L118 26 L40 58" {...BOM_INRE} />
      <path d="M94 104 Q104 116 118 108" {...DETALJ} strokeDasharray="4 3" />
      <line x1={40} y1={58} x2={40} y2={70} stroke={FARG.text2} strokeWidth={4} />
      <path d="M20 70 H60 L64 106 H16 Z" {...KROPP} />
      <circle cx={30} cy={88} r={7} {...DETALJ} />
      <circle cx={50} cy={88} r={7} {...DETALJ} />
      {/* Främre ram, hytt, midjeled, bakre ram med motor. */}
      <rect x={66} y={150} width={144} height={18} rx={4} {...KROPP} />
      <path d="M120 150 V86 Q120 72 134 72 H188 Q200 72 200 84 V150 Z" {...KROPP} />
      <path d="M130 86 H192 V122 H130 Z" fill={FARG.kort} stroke={FARG.text3} strokeWidth={1.5} />
      <rect x={176} y={64} width={14} height={7} rx={2} fill={FARG.text3} />
      <circle cx={216} cy={160} r={7} {...KROPP} />
      <rect x={222} y={150} width={156} height={18} rx={4} {...KROPP} />
      <path d="M226 150 V112 Q226 104 234 104 H354 L378 124 V150 Z" {...KROPP} />
      <line x1={246} y1={116} x2={246} y2={140} {...DETALJ} />
      <line x1={258} y1={116} x2={258} y2={140} {...DETALJ} />
      <line x1={270} y1={116} x2={270} y2={140} {...DETALJ} />
      <rect x={240} y={88} width={6} height={16} rx={2} fill={FARG.text3} />
      <circle cx={356} cy={124} r={4} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1.5} />
      <Stege x={200} y1={140} y2={192} />
      <Slackare x={244} y={154} />
      <Droppe x={356} y={170} />
      {/* Två stora hjul, kedjor fram. */}
      <Kedja x={112} y={180} r={34} />
      <Hjul x={112} y={180} r={34} />
      <Hjul x={304} y={180} r={34} />
    </g>
  );
}

/** Åttahjulig skördare med boggier (Ponsse Scorpion): hytten fram, kranen bakom, motorn bak. */
function Skordare8() {
  return (
    <g>
      <line x1={0} y1={214} x2={BILD_B} y2={214} stroke={FARG.linje} strokeWidth={2} />
      {/* Kranen: pelare, bom, sticka, aggregat. */}
      <rect x={212} y={70} width={16} height={74} rx={4} {...KROPP} />
      <path d="M220 74 L150 24 L52 62" {...BOM} />
      <path d="M220 74 L150 24 L52 62" {...BOM_INRE} />
      <path d="M214 84 L156 40" {...DETALJ} strokeDasharray="4 3" />
      <line x1={52} y1={62} x2={52} y2={74} stroke={FARG.text2} strokeWidth={4} />
      <path d="M32 74 H72 L76 112 H28 Z" {...KROPP} />
      <circle cx={42} cy={92} r={7} {...DETALJ} />
      <circle cx={62} cy={92} r={7} {...DETALJ} />
      <line x1={26} y1={116} x2={8} y2={124} stroke={FARG.text2} strokeWidth={3} strokeLinecap="round" />
      {/* Ram, motor, hytt. */}
      <rect x={96} y={142} width={276} height={20} rx={4} {...KROPP} />
      <path d="M232 142 V108 Q232 100 240 100 H356 L374 116 V142 Z" {...KROPP} />
      <line x1={250} y1={112} x2={250} y2={134} {...DETALJ} />
      <line x1={262} y1={112} x2={262} y2={134} {...DETALJ} />
      <line x1={274} y1={112} x2={274} y2={134} {...DETALJ} />
      <rect x={244} y={84} width={6} height={16} rx={2} fill={FARG.text3} />
      <circle cx={352} cy={118} r={4} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1.5} />
      <path d="M120 142 V78 Q120 64 134 64 H194 Q206 64 206 76 V142 Z" {...KROPP} />
      <path d="M130 78 H198 V114 H130 Z" fill={FARG.kort} stroke={FARG.text3} strokeWidth={1.5} />
      <rect x={180} y={56} width={14} height={7} rx={2} fill={FARG.text3} />
      <Stege x={208} y1={128} y2={176} />
      <Slackare x={262} y={146} />
      <Droppe x={318} y={166} />
      {/* Hjul och band. */}
      <Band x1={112} x2={166} y={186} />
      <Hjul x={112} y={186} />
      <Hjul x={166} y={186} />
      <Hjul x={292} y={186} />
      <Hjul x={346} y={186} />
    </g>
  );
}

function Skotare() {
  return (
    <g>
      <line x1={0} y1={214} x2={BILD_B} y2={214} stroke={FARG.linje} strokeWidth={2} />
      {/* Lastutrymmet: ram, grind, stakar och några stockar. */}
      <rect x={166} y={142} width={214} height={16} rx={4} {...KROPP} />
      <rect x={176} y={54} width={10} height={88} rx={2} {...KROPP} />
      {[72, 92, 112].map(y => <line key={y} x1={186} y1={y} x2={196} y2={y} {...DETALJ} stroke={FARG.text2} />)}
      {[222, 272, 322, 368].map(x => (
        <path key={x} d={`M${x - 16} 142 V88 M${x + 4} 142 V88`} {...DETALJ} stroke={FARG.text2} strokeWidth={3} />
      ))}
      {[108, 120, 132].map(y => <line key={y} x1={200} y1={y} x2={376} y2={y} stroke={FARG.text3} strokeWidth={9} strokeLinecap="round" />)}
      {/* Främre ram, motorhuv, hytt, midjeled. */}
      <rect x={40} y={142} width={116} height={20} rx={4} {...KROPP} />
      <path d="M18 142 V114 Q18 104 28 104 H58 V142 Z" {...KROPP} />
      <circle cx={34} cy={112} r={4} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1.5} />
      <path d="M58 142 V80 Q58 66 72 66 H118 Q128 66 128 76 V142 Z" {...KROPP} />
      <path d="M68 80 H120 V112 H68 Z" fill={FARG.kort} stroke={FARG.text3} strokeWidth={1.5} />
      <rect x={104} y={58} width={14} height={7} rx={2} fill={FARG.text3} />
      <circle cx={161} cy={152} r={7} {...KROPP} />
      {/* Kranen: pelare, bom, sticka, grip. */}
      <rect x={146} y={74} width={14} height={68} rx={4} {...KROPP} />
      <path d="M153 78 L214 22 L300 38" {...BOM} />
      <path d="M153 78 L214 22 L300 38" {...BOM_INRE} />
      <path d="M162 86 L210 40" {...DETALJ} strokeDasharray="4 3" />
      <line x1={300} y1={38} x2={300} y2={52} stroke={FARG.text2} strokeWidth={4} />
      <path d="M300 52 Q284 60 288 80 M300 52 Q316 60 312 80" fill="none" stroke={FARG.text2} strokeWidth={4} strokeLinecap="round" />
      <Stege x={130} y1={128} y2={176} />
      <Slackare x={196} y={156} />
      <Droppe x={56} y={166} />
      {/* Hjul och band (bakre boggin har band). */}
      <Band x1={282} x2={336} y={186} />
      <Hjul x={70} y={186} />
      <Hjul x={122} y={186} />
      <Hjul x={282} y={186} />
      <Hjul x={336} y={186} />
    </g>
  );
}

const CSS = `
.mb-in { animation: mb-in ${RORELSE.sheet}ms ${RORELSE.kurva} both; }
@keyframes mb-in { from { opacity: 0; transform: translateY(${RORELSE.lyft}px); } to { opacity: 1; transform: none; } }
.mb-pop { animation: mb-pop ${RORELSE.byte}ms ${RORELSE.kurva} both; transform-box: fill-box; transform-origin: center; }
@keyframes mb-pop { from { transform: scale(0.2); } to { transform: scale(1); } }
.mb-puls { animation: mb-puls 1.8s ease-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes mb-puls { from { transform: scale(1); opacity: 0.7; } to { transform: scale(2.6); opacity: 0; } }
.mb-andas { animation: mb-andas 2.4s ease-in-out infinite; }
@keyframes mb-andas { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mb-in, .mb-pop, .mb-puls, .mb-andas { animation: none; } .mb-puls { opacity: 0; } }
`;

export default function MaskinBild({ typ, val, onVal, etikett }: {
  typ: BildTyp;
  val: Val | null;
  /** Saknas = bara visa (ingen tryckyta, inga knappar). */
  onVal?: (v: Val) => void;
  /** Tillgänglig beskrivning av bilden. */
  etikett?: string;
}) {
  const id = useId();
  const valjer = !!onVal;
  const lista = delar(typ);

  const klick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onVal) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const v = tryck(typ, ((e.clientX - r.left) / r.width) * BILD_B, ((e.clientY - r.top) / r.height) * BILD_H);
    if (v) onVal(v);
  };

  return (
    <div>
      <style>{CSS}</style>
      <svg viewBox={`0 0 ${BILD_B} ${BILD_H}`} role="img" aria-labelledby={`${id}-t`}
        onClick={klick} className="mb-in"
        style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${BILD_B} / ${BILD_H}`, background: FARG.kort, borderRadius: RADIE.kort, cursor: valjer ? 'pointer' : 'default', touchAction: 'manipulation' }}>
        <title id={`${id}-t`}>{`${etikett ?? (typ === 'skotare' ? 'Skotare' : 'Skördare')}${val ? ` · ${delNamn(val.del, typ)}` : ''}`}</title>
        {typ === 'skordare' ? <Skordare /> : typ === 'skordare8' ? <Skordare8 /> : <Skotare />}
        {valjer && lista.map(d => (
          <circle key={d.id} cx={d.x} cy={d.y} r={6} fill={FARG.text} stroke={FARG.bg} strokeWidth={2}
            className={val ? undefined : 'mb-andas'} opacity={val && val.del === d.id ? 0 : 0.85} />
        ))}
        {val && (
          <g key={`${val.del}-${val.x}-${val.y}`}>
            <circle cx={val.x} cy={val.y} r={10} fill={FARG.orange} className="mb-puls" />
            <circle cx={val.x} cy={val.y} r={10} fill={FARG.orange} stroke={FARG.text} strokeWidth={2.5} className="mb-pop" />
          </g>
        )}
      </svg>

      {valjer && (
        <div role="radiogroup" aria-label="Var på maskinen?"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
          {lista.map(d => {
            const vald = val?.del === d.id;
            return (
              <button key={d.id} type="button" role="radio" aria-checked={vald} onClick={() => onVal!(valjDel(typ, d.id))}
                style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.rad, background: vald ? FARG.upphojt : FARG.kort, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', ...TYP.text }}>
                <Ikon namn={vald ? 'radio_button_checked' : 'radio_button_unchecked'} farg={vald ? FARG.orange : FARG.text3} />
                <span style={{ minWidth: 0 }}>{d.namn}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
