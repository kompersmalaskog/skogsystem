'use client';
// Systematisk avvikelse (mm) per grovlek och månad. Svajar tecknet = tryck · ligger still = kurva. Färgen förstärker bara talet: tunt underlag är nedtonat,
// 2–4 mm orange yta, över 4 mm röd yta. Flyttad ur gamla Senaste › Siffror, oförändrad.
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { stabilitetCell, stabilitetManader } from '@/lib/kalibrering/diagnos';
import { fmtSig1 } from '@/lib/kalibrering/format';
import type { DiagKlass } from '@/lib/kalibrering/typer';

export default function StabilitetTabell({ klasser }: { klasser: DiagKlass[] }) {
  const manader = stabilitetManader(klasser);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', ...TYP.meta, ...TNUM }}>
        <thead><tr><th />{manader.map(mo => <th key={mo} style={{ color: FARG.text2, fontWeight: 400, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, textAlign: 'center' }}>{mo.slice(2).replace('-', '/')}</th>)}</tr></thead>
        <tbody>
          {klasser.map(k => {
            const perManad = new Map(k.systMonthly.map(m => [m.manad, m]));
            return (
              <tr key={k.klass}>
                <td style={{ color: FARG.text, padding: `${AVSTAND.xs}px ${AVSTAND.m}px ${AVSTAND.xs}px 0`, whiteSpace: 'nowrap' }}>{k.klass}</td>
                {manader.map(mo => {
                  const c = perManad.get(mo);
                  if (!c) return <td key={mo} style={{ textAlign: 'center', color: FARG.text3 }}>·</td>;
                  const cls = stabilitetCell(c);
                  const yta = cls === 'hot' ? FARG.rod : cls === 'hi' ? FARG.orange : null;
                  return (
                    <td key={mo} title={`n=${c.n}`}
                      style={{ padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, textAlign: 'center', borderRadius: RADIE.rad, color: cls === 'tunn' ? FARG.text3 : cls === 'ok' ? FARG.text2 : FARG.text,
                        background: yta ? `color-mix(in srgb, ${yta} 16%, transparent)` : undefined }}>
                      {fmtSig1(c.systematik)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
