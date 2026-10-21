'use client';
// Diameterprofilen rot → topp: maskinens mått som heldragen linje och klavens som streckad, ur mätpunkterna längs stockarna. Fältet mellan
// linjerna fylls svagt — orange där maskinen mäter grovare än klaven, blått där den mäter klentare, neutralt inom toleransen. Tunna lodräta
// linjer vid stockgränserna med stockens nummer överst. Talet står bredvid varje avvikelse som ligger utanför toleransen. Räknandet bor i
// lib/kalibrering/stam; här ritas bara. Färgerna är avvikelseskalan (TON_FARG) — grå/orange/blå, samma betydelse som i resten av vyn.
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { fmtAvvikelse, fmtKrav } from '@/lib/kalibrering/format';
import { klaveBitar, stamEtiketter, stamFalt, type StamGeometri } from '@/lib/kalibrering/stam';
import { Lugn, Meta, TON_FARG } from './delar';

const W = 320, H = 280, PAD_L = 30, PAD_R = 26, PAD_T = 22, PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R, PLOT_H = H - PAD_T - PAD_B;

/** Jämna steg för axlarna: 50 mm när spannet är litet, annars 100 mm. */
const diaSteg = (spann: number) => (spann < 200 ? 50 : 100);

const FALT_FARG = { ok: FARG.text2, hi: TON_FARG.hi, cold: TON_FARG.cold } as const;
const FALT_OPACITET = { ok: 0.2, hi: 0.55, cold: 0.55 } as const;

/** En liten linjeprov i förklaringen: heldragen eller streckad. */
function Linjeprov({ streckad }: { streckad?: boolean }) {
  return (
    <svg width={AVSTAND.xl} height={AVSTAND.m} viewBox="0 0 24 12" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1={1} y1={6} x2={23} y2={6} stroke={FARG.text} strokeWidth={streckad ? 1.6 : 2} strokeDasharray={streckad ? '4 3' : undefined} strokeLinecap="round" />
    </svg>
  );
}

export default function StamProfil({ g, tol }: { g: StamGeometri; tol: number }) {
  const { punkter, granserCm, stockNr, totalCm } = g;
  if (punkter.length === 0 || totalCm <= 0) return <Lugn ikon="info">Inga mätpunkter på stammen.</Lugn>;

  const varden = punkter.flatMap(p => (p.klave != null ? [p.maskin, p.klave] : [p.maskin]));
  const lo = Math.min(...varden), hi = Math.max(...varden);
  const marg = Math.max(8, (hi - lo) * 0.06);
  const yMin = lo - marg, yMax = hi + marg;
  const xFor = (cm: number) => PAD_L + (cm / totalCm) * PLOT_W;
  const yFor = (mm: number) => PAD_T + (1 - (mm - yMin) / (yMax - yMin)) * PLOT_H;

  const steg = diaSteg(yMax - yMin);
  const diaTicks: number[] = [];
  for (let v = Math.ceil(yMin / steg) * steg; v <= yMax; v += steg) diaTicks.push(v);
  const metersteg = totalCm > 1500 ? 5 : totalCm > 600 ? 2 : 1;
  const mTicks: number[] = [];
  for (let m = 0; m * 100 <= totalCm; m += metersteg) mTicks.push(m);

  const falt = stamFalt(punkter, tol);
  const bitar = klaveBitar(punkter);
  const etiketter = stamEtiketter(punkter, tol);
  const harKlave = bitar.length > 0;
  const maskinPunkter = punkter.map(p => `${xFor(p.posCm)},${yFor(p.maskin)}`).join(' ');
  const rutnat = { stroke: FARG.linje, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' } as const;
  const etikettStil = { fill: FARG.text2, fontSize: TYP.micro.fontSize, style: TNUM } as const;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Diameterprofil från rot till topp: maskinens mått och klavens mått"
        style={{ width: '100%', height: 'auto', display: 'block' }}>
        {diaTicks.map(v => (
          <g key={v}>
            <line x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)} {...rutnat} />
            <text x={PAD_L - 4} y={yFor(v) + 3} {...etikettStil} textAnchor="end">{v}</text>
          </g>
        ))}
        {/* Stockgränser: tunna lodräta linjer, stockens nummer överst i mitten av stocken. */}
        {granserCm.slice(1, -1).map((cm, i) => (
          <line key={`g${i}`} x1={xFor(cm)} y1={PAD_T} x2={xFor(cm)} y2={PAD_T + PLOT_H} stroke={FARG.text3} strokeWidth={1} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
        ))}
        {stockNr.map((nr, i) => (
          <text key={`n${i}`} x={(xFor(granserCm[i]) + xFor(granserCm[i + 1])) / 2} y={PAD_T - 7} {...etikettStil} textAnchor="middle">{nr}</text>
        ))}
        {falt.map((b, i) => (
          <polygon key={`f${i}`} points={`${xFor(b.x0)},${yFor(b.m0)} ${xFor(b.x1)},${yFor(b.m1)} ${xFor(b.x1)},${yFor(b.k1)} ${xFor(b.x0)},${yFor(b.k0)}`}
            fill={FALT_FARG[b.ton]} fillOpacity={FALT_OPACITET[b.ton]} />
        ))}
        {bitar.map((bit, i) => bit.length === 1
          ? <circle key={`k${i}`} cx={xFor(bit[0].posCm)} cy={yFor(bit[0].klave)} r={2} fill={FARG.text} />
          : <polyline key={`k${i}`} points={bit.map(p => `${xFor(p.posCm)},${yFor(p.klave)}`).join(' ')} fill="none" stroke={FARG.text} strokeWidth={1.6}
              strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        <polyline points={maskinPunkter} fill="none" stroke={FARG.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* Utanför toleransen: en prick i avvikelsens färg och talet bredvid. */}
        {etiketter.map((e, i) => {
          const x = xFor(e.posCm);
          const over = e.avvik > 0;
          // Profilen sjunker från vänster till höger: utrymmet är uppe till höger (grövre) och nere till vänster (klentare), inte ovanpå linjen.
          return (
            <g key={`e${i}`}>
              <circle cx={x} cy={yFor(e.maskin)} r={3.2} fill={TON_FARG[e.ton]} stroke={FARG.kort} strokeWidth={1.5} />
              <text x={x + (over ? 6 : -6)} y={yFor(e.maskin) + (over ? -5 : 14)} textAnchor={over ? 'start' : 'end'}
                fill={FARG.text} fontSize={TYP.micro.fontSize} fontWeight={TYP.listtitel.fontWeight} style={TNUM}
                stroke={FARG.kort} strokeWidth={3} paintOrder="stroke">{fmtAvvikelse(e.avvik, 'mm')}</text>
            </g>
          );
        })}
        <text x={PAD_L - 4} y={PAD_T - 7} {...etikettStil} textAnchor="end">mm</text>
        {mTicks.map(m => (
          <text key={`m${m}`} x={xFor(m * 100)} y={H - 8} {...etikettStil} textAnchor={m === 0 ? 'start' : 'middle'}>{m === mTicks[mTicks.length - 1] ? `${m} m` : m}</text>
        ))}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, marginTop: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Linjeprov />Maskinen</span>
        {harKlave && <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Linjeprov streckad />Klaven</span>}
        <span>Rot → topp · siffrorna överst är stockarnas nummer</span>
      </div>
      {harKlave && (
        <Meta style={{ marginTop: AVSTAND.xs }}>
          Fältet mellan linjerna är orange där maskinen mäter grövre än klaven och blått där den mäter klentare — bara när skillnaden är över ±{fmtKrav(tol)} mm.
        </Meta>
      )}
    </div>
  );
}
