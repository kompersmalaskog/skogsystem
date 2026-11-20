'use client';

// STAMBILDEN — förklarar rotkapet så att ett barn förstår (Martin 2026-10-23): samma stam två gånger, först som föraren
// kapade (rotbit 3,0 m), sedan med den valda längden. Rotbiten är massaved, sedan kommer timret. Allt efter rotbiten flyttas
// lika mycket mot toppen — det man ser är att timret börjar högre upp och att den biten blir massaved.
//
// En SKISS, inte en verklig stam: stocklängderna är typiska (timmer 4,9 + 4,3 m), stammen 20 m. Färg bär aldrig ensam —
// varje bit har sitt ord. Samma sortimentfärger som resten av appen (SORTIMENTFARG: mörkast är mest värt).

import { FARG, SORTIMENTFARG, TYP } from '@/lib/design/tokens';
import { nf } from '@/components/Ytform';

const STAM_M = 20;       // stammens längd i skissen — avsmalningen räknas på den
const VISA_M = 12.5;     // bara rotänden och de två timmerstockarna ritas: det är där något händer
const TIMMER_M = [4.9, 4.3];
const H = 90;            // en stams höjd i bilden (viewBox-enheter)
const B = 1000;          // viewBox-bredd; i ett 340 px brett kort blir texten 36 × 0,34 ≈ 12 px

const meter = (cm: number) => nf(cm / 100, 1);

function Stam({ y, rotbitM }: { y: number; rotbitM: number }) {
  const x = (m: number) => (Math.min(m, VISA_M) / VISA_M) * B;
  // Smalnar av mot toppen: halva höjden vid roten, en sjättedel vid toppen.
  const halv = (m: number) => (H / 2) * (1 - (m / STAM_M) * 0.67);
  const bit = (fran: number, till: number, farg: string, namn: string, mork: boolean) => {
    const mitt = y + H / 2;
    const pts = [[x(fran), mitt - halv(fran)], [x(till), mitt - halv(till)], [x(till), mitt + halv(till)], [x(fran), mitt + halv(fran)]];
    const bred = x(till) - x(fran);
    return (
      <g key={`${fran}-${namn}`}>
        <polygon points={pts.map(p => p.join(',')).join(' ')} fill={farg} stroke={FARG.kort} strokeWidth={3} />
        {bred > 200 && (
          <text x={x(fran) + bred / 2} y={mitt + 13} textAnchor="middle" fontSize={36} fontWeight={600}
            fill={mork ? FARG.text : FARG.bg}>{namn}</text>
        )}
      </g>
    );
  };
  const t1 = rotbitM + TIMMER_M[0], t2 = t1 + TIMMER_M[1];
  return (
    <>
      {bit(0, rotbitM, SORTIMENTFARG.massa, `Massa ${nf(rotbitM, 1)} m`, false)}
      {bit(rotbitM, t1, SORTIMENTFARG.timmer, 'Timmer', true)}
      {bit(t1, t2, SORTIMENTFARG.timmer, 'Timmer', true)}
      {bit(t2, VISA_M, SORTIMENTFARG.massa, 'Massa', false)}
    </>
  );
}

export default function StamBild({ referensCm, kaplangdCm }: { referensCm: number; kaplangdCm: number }) {
  const ref = referensCm / 100, kap = kaplangdCm / 100;
  const x = (m: number) => (Math.min(m, VISA_M) / VISA_M) * B;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: 4 }}>Som föraren kapade · rotbit {meter(referensCm)} m</div>
      <svg viewBox={`0 0 ${B} ${H + 4}`} width="100%" role="img" aria-label={`Stam: rotbit ${meter(referensCm)} m massaved, sedan timmer`} style={{ display: 'block' }}>
        <Stam y={2} rotbitM={ref} />
      </svg>
      <div style={{ ...TYP.meta, color: FARG.text2, margin: '12px 0 4px' }}>Om rotbiten är {meter(kaplangdCm)} m</div>
      <svg viewBox={`0 0 ${B} ${H + 48}`} width="100%" role="img"
        aria-label={`Stam: rotbit ${meter(kaplangdCm)} m massaved, timret börjar ${nf(kap - ref, 1)} m högre upp`} style={{ display: 'block' }}>
        <Stam y={2} rotbitM={kap} />
        {/* Biten som var timmer och nu blir massaved — markerad under stammen. */}
        <line x1={x(ref)} x2={x(kap)} y1={H + 20} y2={H + 20} stroke={FARG.text} strokeWidth={8} />
        <line x1={x(ref)} x2={x(ref)} y1={H + 8} y2={H + 32} stroke={FARG.text} strokeWidth={6} />
        <line x1={x(kap)} x2={x(kap)} y1={H + 8} y2={H + 32} stroke={FARG.text} strokeWidth={6} />
        <text x={x(kap) + 16} y={H + 34} fontSize={34} fontWeight={600} fill={FARG.text}>{nf(kap - ref, 1)} m blir massaved</text>
      </svg>
      <figcaption style={{ ...TYP.text, color: FARG.text, marginTop: 8, lineHeight: 1.45 }}>
        Rotbiten blir längre, så timret börjar högre upp. Biten som var timmer blir massaved.
      </figcaption>
    </figure>
  );
}
