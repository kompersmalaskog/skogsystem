'use client';
// Avvikelsen längs stammen: x = läge rot → topp, y = maskin − klave i mm. En nollinje, ett svagt band för ±toleransen (ur kravprofilen), en
// prick per mätpunkt och tunna lodräta linjer vid stockgränserna med stockens nummer. Prickar utanför bandet får kontrollarkets färg (orange
// över, röd långt över, blå under) och talet bredvid; inom bandet är pricken grå. Där greppet släppte (maskinens mått står still) är glipan
// mellan nollinjen och avvikelsen färgad, med felets färg. Räknandet bor i lib/kalibrering (stam, grepp); här ritas bara.
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { fmtAvvikelse, fmtKrav } from '@/lib/kalibrering/format';
import type { Grepp } from '@/lib/kalibrering/grepp';
import { stamPrickar, stamSkala, stamTon, type StamGeometri } from '@/lib/kalibrering/stam';
import { Lugn, Meta, TON_FARG } from './delar';

const W = 320, PAD_L = 30, PAD_R = 18, PAD_T = 22, PLOT_H = 160, PAD_B = 24;
const H = PAD_T + PLOT_H + PAD_B;
const PLOT_W = W - PAD_L - PAD_R;
const PRICK_R = 3.6;
/** Hur tät glipans yta är: tydlig mot bandet men prickarna syns igenom. */
const GLIPA_YTA = 0.55;
/** Ett ställe är ofta bara 30 cm på en stam om 20 m — några pixlar. Smalare än så vidgas ytan så den syns (höjden, glipan, rörs inte). */
const GLIPA_MIN_BREDD = 6;

/** En liten prick i förklaringen, i tonens färg. */
function Provprick({ farg }: { farg: string }) {
  return (
    <svg width={AVSTAND.m} height={AVSTAND.m} viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={6} cy={6} r={4} fill={farg} stroke={FARG.kort} strokeWidth={1} />
    </svg>
  );
}

/** Glipans yta i förklaringen: en fylld ruta. */
function Provyta() {
  return (
    <svg width={AVSTAND.m} height={AVSTAND.m} viewBox="0 0 12 12" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x={1} y={2} width={10} height={8} fill={FARG.text2} fillOpacity={GLIPA_YTA} stroke={FARG.text2} strokeWidth={1} />
    </svg>
  );
}

export default function StamAvvikelse({ g, tol, stallen }: { g: StamGeometri; tol: number; stallen: Grepp[] }) {
  const prickar = stamPrickar(g, tol);
  if (g.totalCm <= 0 || prickar.length === 0) return <Lugn ikon="info">Inga klavmått på stammen att jämföra mot.</Lugn>;

  const skala = stamSkala(prickar, tol);
  const xFor = (cm: number) => PAD_L + (cm / g.totalCm) * PLOT_W;
  const yFor = (mm: number) => PAD_T + (1 - (mm + skala) / (2 * skala)) * PLOT_H;
  const botten = PAD_T + PLOT_H;

  const metersteg = g.totalCm > 1500 ? 5 : g.totalCm > 600 ? 2 : 1;
  const mTicks: number[] = [];
  for (let m = 0; m * 100 <= g.totalCm; m += metersteg) mTicks.push(m);
  const yTicks = Array.from(new Set([-skala, -tol, 0, tol, skala])).sort((a, b) => a - b);
  const etikettStil = { fill: FARG.text2, fontSize: TYP.micro.fontSize, style: TNUM } as const;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Avvikelse mellan maskinens och klavens mått längs stammen, rot till topp"
        style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Bandet ±tolerans: svagt, med streckade kanter. Allt inom bandet är godkänt. */}
        <rect x={PAD_L} y={yFor(tol)} width={PLOT_W} height={yFor(-tol) - yFor(tol)} fill={FARG.text2} fillOpacity={0.14} />
        {[tol, -tol].map(v => (
          <line key={`b${v}`} x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)} stroke={FARG.text3} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
        {/* Stockgränser: tunna lodräta linjer, stockens nummer överst i mitten av stocken. */}
        {g.granserCm.slice(1, -1).map((cm, i) => (
          <line key={`g${i}`} x1={xFor(cm)} y1={PAD_T} x2={xFor(cm)} y2={botten} stroke={FARG.text3} strokeWidth={1} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
        ))}
        {g.stockNr.map((nr, i) => (
          <text key={`n${i}`} x={(xFor(g.granserCm[i]) + xFor(g.granserCm[i + 1])) / 2} y={PAD_T - 7} {...etikettStil} textAnchor="middle">{nr}</text>
        ))}
        {/* Där greppet släppte: glipan mellan nollinjen och avvikelsen, i felets färg (kontrollarkets, grå inom bandet). */}
        {stallen.filter(p => p.glipa.length > 1 && p.felMm != null).map((p, i) => {
          const farg = TON_FARG[stamTon(Math.round(p.felMm as number))];
          const x0 = xFor(p.glipa[0].posCm), x1 = xFor(p.glipa[p.glipa.length - 1].posCm);
          const mitt = (x0 + x1) / 2, vidga = Math.max(1, GLIPA_MIN_BREDD / Math.max(x1 - x0, 0.01));
          const xv = (cm: number) => mitt + (xFor(cm) - mitt) * vidga;
          const kurva = p.glipa.map(q => `${xv(q.posCm)},${yFor(Math.max(-skala, Math.min(skala, q.mm)))}`);
          return <polygon key={`s${i}`} data-grepp points={`${xv(p.glipa[0].posCm)},${yFor(0)} ${kurva.join(' ')} ${xv(p.glipa[p.glipa.length - 1].posCm)},${yFor(0)}`} fill={farg} fillOpacity={GLIPA_YTA} />;
        })}
        {/* Nollinjen: maskinen och klaven är lika. */}
        <line x1={PAD_L} y1={yFor(0)} x2={W - PAD_R} y2={yFor(0)} stroke={FARG.text2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {yTicks.map(v => (
          <text key={`y${v}`} x={PAD_L - 4} y={yFor(v) + 3} {...etikettStil} textAnchor="end">{v === 0 ? '0' : fmtAvvikelse(v, 'mm')}</text>
        ))}
        <text x={PAD_L - 4} y={PAD_T - 7} {...etikettStil} textAnchor="end">mm</text>

        {prickar.map((p, i) => (
          <circle key={`p${i}`} cx={xFor(p.posCm)} cy={yFor(p.avvik)} r={PRICK_R} fill={TON_FARG[p.ton]} stroke={FARG.kort} strokeWidth={1.5} />
        ))}
        {/* Talet bredvid varje prick utanför bandet: över nollinjen ovanför pricken, under den nedanför. */}
        {prickar.filter(p => p.etikett).map((p, i) => (
          <text key={`t${i}`} x={xFor(p.posCm) + (p.ankare === 'end' ? 3 : p.ankare === 'start' ? -3 : 0)} y={yFor(p.avvik) + (p.avvik > 0 ? -7 : 15)} textAnchor={p.ankare}
            fill={FARG.text} fontSize={TYP.micro.fontSize} fontWeight={TYP.listtitel.fontWeight} style={TNUM}
            stroke={FARG.kort} strokeWidth={3} paintOrder="stroke">{fmtAvvikelse(p.avvik, 'mm')}</text>
        ))}

        {mTicks.map(m => (
          <text key={`m${m}`} x={xFor(m * 100)} y={H - 8} {...etikettStil} textAnchor={m === 0 ? 'start' : 'middle'}>{m === mTicks[mTicks.length - 1] ? `${m} m` : m}</text>
        ))}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, marginTop: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Provprick farg={TON_FARG.hi} />Grövre</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Provprick farg={TON_FARG.hot} />Mycket grövre</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Provprick farg={TON_FARG.cold} />Klentare</span>
        {stallen.some(p => p.glipa.length > 1) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Provyta />Greppet släppte</span>}
      </div>
      <Meta style={{ marginTop: AVSTAND.xs }}>
        Maskinens mått minus klavens, rot → topp. Bandet är ±{fmtKrav(tol)} mm: pricken får färg först utanför det. Färgad yta: maskinens mått stod still — glipan mot klaven.
      </Meta>
    </div>
  );
}
