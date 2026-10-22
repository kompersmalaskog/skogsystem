'use client';
// Små diagram i kontroll- och stockarken: stock-svärmen och lollipop-grafen (stamvyns avvikelsediagram bor i StamAvvikelse). Portade ur page.tsx (de var CSS-klasser
// kalib-swarm-*, kalib-lollipop-*, kalib-stam-*), nu inline på tokens. Färgerna är AVVIKELSESKALAN (TON_FARG) — samma betydelse som förut.
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import type { ToneToken } from '@/lib/kalibrering/bedomning';
import { fmtAvvikelse } from '@/lib/kalibrering/format';
import type { MatpunktAvvik } from '@/lib/kalibrering/kontroll';
import { avvikelseTon } from '@/lib/kalibrering/bedomning';
import { xPctFor, yPctFor } from '@/lib/kalibrering/kontroll';
import { TON_FARG } from './delar';

// === Stock-svärmen: en prick per stock, färg per avvikelseskala ===
export type SvarmPrick = { id: number; x: number; y: number; ton: ToneToken; titel: string };

export function Svarm({ etikett, prickar, snittX, snittTitel }: { etikett: string; prickar: SvarmPrick[]; snittX?: number | null; snittTitel?: string }) {
  return (
    <div role="img" aria-label={etikett} style={{ position: 'relative', height: 64, borderRadius: RADIE.rad, background: FARG.tonad, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '25%', right: '25%', background: FARG.tonad, borderLeft: `1px dashed ${FARG.text3}`, borderRight: `1px dashed ${FARG.text3}` }} />
      <div style={{ position: 'absolute', top: AVSTAND.xs, bottom: AVSTAND.xs, left: '50%', width: 1, background: FARG.text3 }} />
      {prickar.map(p => (
        <div key={p.id} title={p.titel}
          style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: 10, height: 10, borderRadius: RADIE.cirkel, transform: 'translate(-50%, -50%)', background: TON_FARG[p.ton], boxShadow: `0 0 0 2px ${FARG.bg}` }} />
      ))}
      {snittX != null && (
        <div title={snittTitel} style={{ position: 'absolute', bottom: 0, left: `${snittX}%`, width: 2, height: 14, background: FARG.text, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', bottom: 14, left: '50%', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: `4px solid ${FARG.text}`, transform: 'translateX(-50%)' }} />
        </div>
      )}
    </div>
  );
}

/** −8 · ±4 tolerans · +8 mm under svärmen. */
export function SvarmSkala({ tol, enhet, fmt }: { tol: number; enhet: string; fmt: (n: number) => string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', ...TYP.meta, ...TNUM, color: FARG.text2, padding: `0 ${AVSTAND.xs}px`, margin: `${AVSTAND.xs}px 0 ${AVSTAND.s}px` }}>
      <span>−{fmt(2 * tol)}</span><span>±{fmt(tol)} tolerans</span><span>+{fmt(2 * tol)} {enhet}</span>
    </div>
  );
}

// === Lollipop: avvikelse per mätpunkt längs stocken ===
export function Lollipop({ punkter }: { punkter: MatpunktAvvik[] }) {
  return (
    <div role="img" aria-label="Avvikelse per mätpunkt längs stocken" style={{ position: 'relative', height: 150, margin: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, background: FARG.tonad, borderRadius: RADIE.rad }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '30%', height: '40%', background: FARG.tonad, borderTop: `1px dashed ${FARG.text3}`, borderBottom: `1px dashed ${FARG.text3}` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: FARG.text3 }} />
      {punkter.flatMap((p, i) => {
        const xP = xPctFor(p.position_cm, punkter);
        const yP = yPctFor(p.avvikelse);
        const ton = avvikelseTon(p.avvikelse, 'dia');
        const over = p.avvikelse >= 0;
        return [
          <div key={`stem-${i}`} style={{ position: 'absolute', left: `${xP}%`, top: `${Math.min(50, yP)}%`, height: `${Math.abs(yP - 50)}%`, width: 2, background: FARG.text3, transform: 'translateX(-1px)' }} />,
          <div key={`marker-${i}`} style={{ position: 'absolute', left: `${xP}%`, top: `${yP}%`, width: 14, height: 14, borderRadius: RADIE.cirkel, transform: 'translate(-50%, -50%)', background: TON_FARG[ton], boxShadow: `0 0 0 2px ${FARG.kort}` }} />,
          <div key={`label-${i}`} style={{ position: 'absolute', left: `${xP}%`, top: over ? `calc(${yP}% - 18px)` : `calc(${yP}% + 12px)`, transform: 'translateX(-50%)', ...TYP.micro, textTransform: 'none', ...TNUM, color: FARG.text, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {fmtAvvikelse(p.avvikelse, 'mm')}
          </div>,
        ];
      })}
    </div>
  );
}
