// "Produktion per dag" — staplarna (utbruten ur UppfoljningVy 2026-11-26 så
// att den går att mäta i riktig Chromium, ProdChart.matt.test.ts). Reglerna för
// hur staplarna ryms bor i lib/prodStaplar.
import React, { useEffect, useRef, useState } from 'react';
import { FARG, AVSTAND, RADIE, overgang } from '@/lib/design/tokens';
import { stapelLayout, visaDatum } from './lib/prodStaplar';

const V6_GREY = FARG.text2;
const V6_GREY2 = FARG.text3;
const V6_CARD = FARG.kort;
const V6_SEP = FARG.linje;

export function ProdChart({ data, color, snitt }: { data: { datum: string; m3: number; lass?: number }[]; color: string; snitt: number }) {
  const [active, setActive] = useState<number | null>(null);
  // Staplarna delar på kortets bredd (lib/prodStaplar): siffror bara när de
  // ryms, datum glesade. Okänd bredd (första ritningen) = som förut.
  const radRef = useRef<HTMLDivElement | null>(null);
  const [bredd, setBredd] = useState(0);
  useEffect(() => {
    const el = radRef.current;
    if (!el) return;
    const las = () => setBredd(el.clientWidth);
    las();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(las);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = stapelLayout(bredd, data.length);
  const harLass = data.some(d => d.lass != null);
  const max = Math.max(...data.map(d => d.m3), 1);
  const chartH = 130;
  const barMaxH = chartH - 20;
  const snittH = snitt ? (snitt / max) * barMaxH : 0;
  return (
    <div style={{ background: V6_CARD, borderRadius: RADIE.kort, padding: `${AVSTAND.l}px` }}>
      <div style={{ position: 'relative', height: chartH, borderBottom: `0.5px solid ${V6_SEP}`, paddingBottom: 4 }}>
        {snitt > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 4 + snittH, height: 0, borderTop: `1px dashed ${V6_GREY2}`, pointerEvents: 'none', zIndex: 2 }}>
            <span style={{ position: 'absolute', right: 0, top: -16, fontSize: 13, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700, background: V6_CARD, padding: `0 ${AVSTAND.xs}px` }}>snitt {Math.round(snitt)} m³</span>
          </div>
        )}
        <div ref={radRef} style={{ display: 'flex', alignItems: 'flex-end', gap: layout.gap, height: '100%' }}>
          {data.map((d, i) => {
            const h = (d.m3 / max) * barMaxH;
            const isActive = active === i;
            // Rutan med dagens tal hålls inom kortet vid kanterna.
            const plats = i < data.length / 4 ? { left: 0 } : i >= (data.length * 3) / 4 ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' };
            return (
              <div key={i} data-stapel onClick={() => setActive(isActive ? null : i)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', cursor: 'pointer', position: 'relative' }}>
                {isActive && (
                  <div data-stapel-ruta style={{ position: 'absolute', bottom: h + (layout.visaSiffror ? 30 : 12), ...plats, background: FARG.upphojt, border: `0.5px solid ${FARG.linje}`, borderRadius: RADIE.rad, padding: `${AVSTAND.s}px`, whiteSpace: 'nowrap', fontSize: 11, color: FARG.text, zIndex: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                    {d.datum} · {d.lass != null ? `${d.lass} lass · ` : ''}{Math.round(d.m3)} m³
                  </div>
                )}
                {layout.visaSiffror && <div style={{ fontSize: 11, color: FARG.text, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Math.round(d.m3)}</div>}
                <div style={{ width: '100%', maxWidth: 26, height: `${h}px`, background: color, borderRadius: RADIE.stapel, minHeight: 4, opacity: active != null && !isActive ? 0.4 : 1, transition: overgang('opacity') }} />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: layout.gap, marginTop: 8 }}>
        {data.map((d, i) => (
          <div key={i} data-datum={visaDatum(i, layout.datumVarK) ? '' : undefined} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', overflow: 'visible', whiteSpace: 'nowrap', fontSize: 13, color: V6_GREY, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {visaDatum(i, layout.datumVarK) ? d.datum : ''}
          </div>
        ))}
      </div>
      {(harLass || !layout.visaSiffror) && (
        <div style={{ fontSize: 13, color: V6_GREY2, marginTop: AVSTAND.s, textAlign: 'center' }}>
          {harLass ? 'Tryck på en stapel för att se antal lass' : 'Tryck på en stapel för att se dagen'}
        </div>
      )}
    </div>
  );
}
