'use client';
// Tidsserie-diagrammet i Trend: en linje per grovlek + valfri kravlinje/kravband + åtgärdsmarkörer. Portat ur page.tsx (renderTidsChart),
// samma regler: n < 30 ritas inte (slumpen får inte se ut som trend), 30–100 streckad + nedtonad, ≥ 100 solid. Färgerna ur FARG/DELFARG.
import { AVSTAND, DELFARG, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { GRIND_ATGARD, GRIND_MIN, type Serie } from '@/lib/kalibrering/diagnos';
import type { DiagMarkor } from '@/lib/kalibrering/typer';
import { Lugn, Meta } from './delar';

/** En färg per grovlek, klen → grov (värmeskala: grova är värst). Legenden bredvid säger klassen — färgen är aldrig ensam. */
export const KLASS_FARG: Record<string, string> = {
  '<150': DELFARG[0], '150-199': FARG.gron, '200-249': FARG.gul, '250-299': FARG.orange, '300+': FARG.rod,
};
/** Åtgärdsmarkörens linje: åtgärd = vit, reparation = orange, kalibrering = grå. */
const MARKOR_FARG: Record<DiagMarkor['kalla'], string> = { atgard: FARG.text, reparation: FARG.orange, kalibrering: FARG.text3 };

type Props = {
  manader: string[];
  series: Serie[];
  yMax: number;
  kravLinje?: { v: number; label: string };
  kravBand?: { till: number; label: string };
  riktning?: string;
  markorer: DiagMarkor[];
  fmtX?: (m: string) => string;
  markorKey?: (datum: string) => string;
};

export default function TidsDiagram({ manader, series, yMax, kravLinje, kravBand, riktning, markorer, fmtX: fmtXIn, markorKey: markorKeyIn }: Props) {
  if (manader.length === 0) return <Lugn ikon="info">Inget underlag ännu.</Lugn>;
  const fmtX = fmtXIn ?? ((m: string) => m.slice(2).replace('-', '/'));
  const markorKey = markorKeyIn ?? ((d: string) => d.slice(0, 7));
  const W = 320, H = 150, padL = 28, padR = 10, padT = 10, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xFor = (mi: number) => padL + (manader.length === 1 ? plotW / 2 : (mi / (manader.length - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * plotH;
  const monIdx = new Map(manader.map((m, i) => [m, i]));
  const step = Math.max(1, Math.ceil(manader.length / 6));
  let nagotTunt = false;
  const etikett = { fill: FARG.text2, fontSize: TYP.micro.fontSize } as const;
  const kravStil = { stroke: FARG.text2, strokeWidth: 1, strokeDasharray: '3 3', vectorEffect: 'non-scaling-stroke' } as const;

  const serieEl = series.map(s => {
    const el: JSX.Element[] = [];
    for (let i = 0; i + 1 < manader.length; i++) {
      const a = s.punkter.get(manader[i]), b = s.punkter.get(manader[i + 1]);
      if (!a || !b || a.n < GRIND_MIN || b.n < GRIND_MIN) continue; // n<30 → ingen linje
      const solid = a.n >= GRIND_ATGARD && b.n >= GRIND_ATGARD;
      if (!solid) nagotTunt = true;
      el.push(<line key={`seg${i}`} x1={xFor(i)} y1={yFor(a.v)} x2={xFor(i + 1)} y2={yFor(b.v)}
        stroke={KLASS_FARG[s.klass]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round"
        strokeOpacity={solid ? 1 : 0.4} strokeDasharray={solid ? undefined : '3 3'} />);
    }
    manader.forEach((m, i) => {
      const p = s.punkter.get(m);
      if (!p || p.n < GRIND_MIN) return; // n<30 → ingen punkt
      const solid = p.n >= GRIND_ATGARD;
      if (!solid) nagotTunt = true;
      el.push(<circle key={`dot${i}`} cx={xFor(i)} cy={yFor(p.v)} r={solid ? 2 : 1.6} fill={KLASS_FARG[s.klass]} fillOpacity={solid ? 1 : 0.5} />);
    });
    return <g key={s.klass}>{el}</g>;
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tidsserie per grovlek" style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block' }}>
        {/* Kravband: ljus zon 0→golv = det tillåtna. Linje ovanför = flaxar för mycket. */}
        {kravBand && (
          <>
            <rect x={padL} y={yFor(kravBand.till)} width={W - padL - padR} height={Math.max(0, yFor(0) - yFor(kravBand.till))} fill={FARG.tonad} />
            <line x1={padL} y1={yFor(kravBand.till)} x2={W - padR} y2={yFor(kravBand.till)} {...kravStil} />
            <text x={W - padR} y={yFor(kravBand.till) - 3} {...etikett} textAnchor="end">{kravBand.label}</text>
          </>
        )}
        {[0, yMax / 2, yMax].map(v => (
          <g key={v}>
            <line x1={padL} y1={yFor(v)} x2={W - padR} y2={yFor(v)} stroke={FARG.linje} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 4} y={yFor(v) + 3} {...etikett} textAnchor="end">{Math.round(v)}</text>
          </g>
        ))}
        {kravLinje && (
          <>
            <line x1={padL} y1={yFor(kravLinje.v)} x2={W - padR} y2={yFor(kravLinje.v)} {...kravStil} />
            <text x={W - padR} y={yFor(kravLinje.v) - 3} {...etikett} textAnchor="end">{kravLinje.label}</text>
          </>
        )}
        {markorer.map((mk, i) => {
          const mi = monIdx.get(markorKey(mk.datum));
          if (mi == null) return null;
          return <line key={`mk${i}`} x1={xFor(mi)} y1={padT} x2={xFor(mi)} y2={padT + plotH} stroke={MARKOR_FARG[mk.kalla]} strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />;
        })}
        {serieEl}
        {manader.map((m, i) => (i % step === 0 || i === manader.length - 1
          ? <text key={m} x={xFor(i)} y={H - 6} {...etikett} textAnchor="middle">{fmtX(m)}</text>
          : null))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: AVSTAND.m, marginTop: AVSTAND.s }}>
        {riktning && <span style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{riktning}</span>}
        {series.map(s => (
          <span key={s.klass} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
            <i style={{ display: 'inline-block', width: AVSTAND.m, height: AVSTAND.xs, borderRadius: AVSTAND.xs, background: KLASS_FARG[s.klass] }} />{s.klass}
          </span>
        ))}
      </div>
      {nagotTunt && <Meta style={{ marginTop: AVSTAND.s }}>Streckad/nedtonad = tunt underlag (30–100 mått i perioden). Under 30 ritas inte — slumpen ska inte se ut som en trend.</Meta>}
    </div>
  );
}
