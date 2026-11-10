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
      <circle cx={x} cy={y} r={r - 3} fill="none" stroke={FARG.text3} strokeWidth={3} strokeDasharray="2 3" />
      <circle cx={x} cy={y} r={r * 0.58} fill={FARG.upphojt} stroke={FARG.text3} strokeWidth={1.5} />
      <circle cx={x} cy={y} r={r * 0.36} fill="none" stroke={FARG.text3} strokeWidth={1} strokeDasharray="1.5 3" />
      <circle cx={x} cy={y} r={r * 0.2} fill={FARG.text3} />
    </g>
  );
}

/** Boggibalk under två hjul. */
function Boggi({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <rect x={x1} y={y - 6} width={x2 - x1} height={12} rx={6} {...KROPP} />;
}

/** Skördaraggregat: kropp, matarvalsar, kvistknivar, sågsvärd. Övre vänstra hörnet i (x, y). */
function Aggregat({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x + 6} ${y} H${x + 40} Q${x + 46} ${y} ${x + 46} ${y + 6} V${y + 42} Q${x + 46} ${y + 48} ${x + 40} ${y + 48} H${x + 6} Q${x} ${y + 48} ${x} ${y + 42} V${y + 6} Q${x} ${y} ${x + 6} ${y} Z`} {...KROPP} />
      <path d={`M${x + 2} ${y + 8} Q${x - 8} ${y + 16} ${x + 2} ${y + 24} M${x + 44} ${y + 8} Q${x + 54} ${y + 16} ${x + 44} ${y + 24}`} {...DETALJ} stroke={FARG.text2} strokeWidth={2.5} />
      <circle cx={x + 14} cy={y + 28} r={8} {...DETALJ} stroke={FARG.text2} />
      <circle cx={x + 32} cy={y + 28} r={8} {...DETALJ} stroke={FARG.text2} />
      <rect x={x + 8} y={y + 6} width={30} height={6} rx={2} fill={FARG.text3} />
      <line x1={x + 4} y1={y + 46} x2={x - 12} y2={y + 54} stroke={FARG.text2} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** Hydraulcylinder: tjockt rör + tunn kolvstång. */
function Cylinder({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mx = x1 + (x2 - x1) * 0.6, my = y1 + (y2 - y1) * 0.6;
  return (
    <g>
      <line x1={x1} y1={y1} x2={mx} y2={my} stroke={FARG.text2} strokeWidth={6} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={mx} y2={my} stroke={FARG.upphojt} strokeWidth={3} strokeLinecap="round" />
      <line x1={mx} y1={my} x2={x2} y2={y2} stroke={FARG.text2} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

/** Stor panoramahytt med glas, dörrkarm, takljus och backspegel. */
function Hytt({ x1, x2, y1, y2 }: { x1: number; x2: number; y1: number; y2: number }) {
  const mitt = Math.round(x1 + (x2 - x1) * 0.6);
  return (
    <g>
      <rect x={x1 + 2} y={y1 - 8} width={x2 - x1 - 4} height={6} rx={3} fill={FARG.text3} />
      {[x1 + 10, x2 - 18].map(lx => <rect key={lx} x={lx} y={y1 - 14} width={8} height={5} rx={1.5} fill={FARG.text2} />)}
      <path d={`M${x1} ${y2} V${y1 + 14} Q${x1} ${y1} ${x1 + 14} ${y1} H${x2 - 12} Q${x2} ${y1} ${x2} ${y1 + 12} V${y2} Z`} {...KROPP} />
      <path d={`M${x1 + 7} ${y1 + 9} H${x2 - 7} V${y2 - 16} H${x1 + 7} Z`} fill={FARG.kort} stroke={FARG.text3} strokeWidth={1.5} />
      <line x1={mitt} y1={y1 + 9} x2={mitt} y2={y2 - 2} stroke={FARG.text3} strokeWidth={2} />
      <line x1={x1 + 14} y1={y1 + 16} x2={x1 + 28} y2={y1 + 30} stroke={FARG.text3} strokeWidth={1} opacity={0.6} />
      <line x1={x2} y1={y1 + 18} x2={x2 + 10} y2={y1 + 12} stroke={FARG.text2} strokeWidth={2} strokeLinecap="round" />
      <rect x={x2 + 8} y={y1 + 4} width={5} height={10} rx={1.5} fill={FARG.text3} />
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

/** Fyrhjulig skördare (Rottne H8E): kranen längst fram på ramen, stor hytt bakom, midjeled, motorn bak. */
function Skordare() {
  return (
    <g>
      <line x1={0} y1={214} x2={BILD_B} y2={214} stroke={FARG.linje} strokeWidth={2} />
      {/* Främre ram och kranens pelare längst fram. */}
      <path d="M60 152 L72 140 H214 V164 H74 Z" {...KROPP} />
      <rect x={66} y={134} width={40} height={8} rx={3} {...KROPP} />
      <path d="M74 134 V112 Q74 104 82 104 H96 Q102 104 102 112 V134 Z" {...KROPP} />
      {/* Bom upp och bak, sticka fram och ner, cylindrar och slangar. */}
      <Cylinder x1={80} y1={128} x2={100} y2={64} />
      <path d="M88 108 L122 24 L38 52" {...BOM} />
      <path d="M88 108 L122 24 L38 52" {...BOM_INRE} />
      <Cylinder x1={112} y1={38} x2={70} y2={40} />
      <path d="M100 104 Q112 70 116 40" {...DETALJ} strokeDasharray="4 3" />
      <circle cx={122} cy={24} r={5} fill={FARG.text3} />
      <line x1={38} y1={52} x2={38} y2={64} stroke={FARG.text2} strokeWidth={4} />
      <Aggregat x={16} y={64} />
      {/* Hytt. */}
      <Hytt x1={114} x2={204} y1={66} y2={140} />
      {/* Midjeled, bakre ram, motorhuv med kylare, avgasrör, baklampa. */}
      <circle cx={222} cy={154} r={8} {...KROPP} />
      <rect x={228} y={140} width={146} height={24} rx={4} {...KROPP} />
      <path d="M232 140 V104 Q232 96 240 96 H340 Q350 96 356 104 L380 124 V140 Z" {...KROPP} />
      {[248, 258, 268, 278].map(x => <line key={x} x1={x} y1={108} x2={x} y2={132} {...DETALJ} />)}
      <path d="M326 108 H346 L360 122 H326 Z" fill={FARG.kort} stroke={FARG.text3} strokeWidth={1.5} />
      <rect x={300} y={78} width={7} height={18} rx={2} fill={FARG.text3} />
      <rect x={374} y={128} width={6} height={8} rx={1.5} fill={FARG.text2} />
      <circle cx={360} cy={130} r={4} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1.5} />
      <Stege x={208} y1={130} y2={198} />
      <Slackare x={262} y={110} />
      <Droppe x={356} y={174} />
      {/* Två stora hjul, kedjor på framhjulet. */}
      <Kedja x={118} y={176} r={38} />
      <Hjul x={118} y={176} r={38} />
      <Hjul x={300} y={176} r={38} />
    </g>
  );
}

/** Åttahjulig skördare med boggier (Ponsse Scorpion): hytten fram, kranen bakom med bommen över hytten, motorn bak. */
function Skordare8() {
  return (
    <g>
      <line x1={0} y1={214} x2={BILD_B} y2={214} stroke={FARG.linje} strokeWidth={2} />
      {/* Främre ram och hytt. */}
      <path d="M58 156 L68 146 H210 V170 H70 Z" {...KROPP} />
      <Hytt x1={72} x2={166} y1={66} y2={146} />
      {/* Kranen bakom hytten: pelare, bom i en båge över hytten, sticka fram till aggregatet. */}
      <rect x={172} y={140} width={36} height={8} rx={3} {...KROPP} />
      <path d="M178 140 V108 Q178 100 186 100 H196 Q202 100 202 108 V140 Z" {...KROPP} />
      <Cylinder x1={196} y1={132} x2={170} y2={56} />
      <path d="M190 104 L130 16 L36 54" {...BOM} />
      <path d="M190 104 L130 16 L36 54" {...BOM_INRE} />
      <Cylinder x1={142} y1={30} x2={86} y2={34} />
      <path d="M198 104 Q186 70 174 52" {...DETALJ} strokeDasharray="4 3" />
      <circle cx={130} cy={16} r={5} fill={FARG.text3} />
      <line x1={36} y1={54} x2={36} y2={66} stroke={FARG.text2} strokeWidth={4} />
      <Aggregat x={14} y={66} />
      {/* Midjeled, bakre ram, hög motor med kylare, avgasrör, baklampa. */}
      <circle cx={216} cy={160} r={8} {...KROPP} />
      <rect x={222} y={146} width={152} height={24} rx={4} {...KROPP} />
      <path d="M228 146 V100 Q228 92 236 92 H336 L374 112 V146 Z" {...KROPP} />
      {[244, 254, 264, 274].map(x => <line key={x} x1={x} y1={104} x2={x} y2={136} {...DETALJ} />)}
      <path d="M322 104 H340 L358 116 H322 Z" fill={FARG.kort} stroke={FARG.text3} strokeWidth={1.5} />
      <rect x={300} y={74} width={7} height={18} rx={2} fill={FARG.text3} />
      <rect x={368} y={130} width={6} height={8} rx={1.5} fill={FARG.text2} />
      <circle cx={358} cy={124} r={4} fill={FARG.text3} stroke={FARG.text2} strokeWidth={1.5} />
      <Stege x={203} y1={140} y2={198} />
      <Slackare x={244} y={154} />
      <Droppe x={376} y={170} />
      {/* Boggier fram och bak, band på främre. */}
      <Boggi x1={96} x2={150} y={188} />
      <Boggi x1={286} x2={340} y={188} />
      <Band x1={96} x2={150} y={188} />
      <Hjul x={96} y={188} r={26} />
      <Hjul x={150} y={188} r={26} />
      <Hjul x={286} y={188} r={26} />
      <Hjul x={340} y={188} r={26} />
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
