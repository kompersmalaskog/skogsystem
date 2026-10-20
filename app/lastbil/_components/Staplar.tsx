'use client';

import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { Stapel, StapelRad } from './uppfoljning';

// Staplar per månad: EN komponent för uppföljningens diagram (vågräta rader, en månad per rad, så tolv månader aldrig
// trängs). Två lägen: BREDVID (en stapel per serie, värdet vid stapelns slut) och STAPLAT (serierna efter varandra i en stapel,
// summan till höger med delarna under). Färg bär aldrig ensam: första serien är vit, andra grå, och varje värde står som
// text; teckenförklaringen ovanför nämner serierna i samma ordning som staplarna. Saknad mätning är ingen stapel och
// orden står bredvid ("diesel saknas") — aldrig en nolla.

const TON = [FARG.text, FARG.text3] as const;      // serie 1 vit, serie 2 grå
const SPAR_BREDD = 0.82;                            // största värdet fyller så mycket av spåret; resten är plats för talet
const STAPEL_HOJD = AVSTAND.m;

export default function Staplar({ rader, lage, serier, enhet }: {
  rader: readonly StapelRad[]; lage: 'bredvid' | 'staplat'; serier: readonly string[]; enhet: string;
}) {
  const max = Math.max(0, ...rader.flatMap(r => lage === 'staplat'
    ? [r.staplar.reduce((s, x) => s + (x.varde ?? 0), 0)]
    : r.staplar.map(x => x.varde ?? 0)));
  const andel = (v: number) => (max > 0 ? Math.max(0, (v / max) * SPAR_BREDD) : 0);

  return (
    <div data-staplar={lage}>
      <div data-legend style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l, padding: `${AVSTAND.m}px 0`, ...TYP.meta, color: FARG.text2 }}>
        {serier.map((namn, i) => (
          <span key={namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, color: FARG.text }}>
            <span aria-hidden style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.stapel, background: TON[i], flex: 'none' }} />
            {namn}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: FARG.text2 }}>{enhet}</span>
      </div>
      {rader.map((r, i) => (
        <Rad key={r.etikett} rad={r} lage={lage} andel={andel} sista={i === rader.length - 1} />
      ))}
    </div>
  );
}

function Rad({ rad, lage, andel, sista }: { rad: StapelRad; lage: 'bredvid' | 'staplat'; andel: (v: number) => number; sista: boolean }) {
  const beskrivning = `${rad.etikett}: ` + (lage === 'staplat'
    ? (rad.total != null ? `${rad.total} (${rad.staplar.map(s => `${s.namn} ${s.text}`).join(', ')})` : 'inga rundor')
    : rad.staplar.map(s => `${s.namn} ${s.saknas ?? s.text}`).join(', '));
  const synliga = rad.staplar.filter(x => (x.varde ?? 0) > 0);
  return (
    <div role="img" aria-label={beskrivning} data-stapelrad={rad.etikett}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, borderTop: `1px solid ${FARG.linje}`, borderBottom: sista ? `1px solid ${FARG.linje}` : 'none' }}>
      <div style={{ width: AVSTAND.xxl + AVSTAND.s, flex: 'none', ...TYP.meta, color: FARG.text2, textTransform: 'capitalize' }}>{rad.etikett}</div>
      {lage === 'bredvid' ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          {rad.staplar.map((s, i) => <Enkel key={s.namn} stapel={s} ton={TON[i]} bredd={s.varde != null ? andel(s.varde) : 0} />)}
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', height: STAPEL_HOJD }}>
            {synliga.map((s, i) => (
              <div key={s.namn} title={`${s.namn} ${s.text}`}
                style={{ width: `${andel(s.varde as number) * 100}%`, background: TON[rad.staplar.indexOf(s)], borderLeft: i === 0 ? 'none' : `1px solid ${FARG.kort}`, borderRadius: `${i === 0 ? RADIE.stapel : 0}px ${i === synliga.length - 1 ? RADIE.stapel : 0}px ${i === synliga.length - 1 ? RADIE.stapel : 0}px ${i === 0 ? RADIE.stapel : 0}px` }} />
            ))}
          </div>
          <div style={{ minWidth: AVSTAND.xxl * 3, flex: 'none', textAlign: 'right', whiteSpace: 'nowrap', ...TNUM }}>
            {rad.total != null
              ? <><div style={{ ...TYP.listtitel, color: FARG.text }}>{rad.total}</div><div style={{ ...TYP.meta, color: FARG.text2 }}>{rad.delar}</div></>
              : <div style={{ ...TYP.meta, color: FARG.text2 }}>–</div>}
          </div>
        </>
      )}
    </div>
  );
}

/** En stapel med värdet bredvid. Saknas värdet: ingen stapel, bara orden. */
function Enkel({ stapel, ton, bredd }: { stapel: Stapel; ton: string; bredd: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, height: STAPEL_HOJD }}>
      {stapel.varde != null && <div title={`${stapel.namn} ${stapel.text}`} style={{ width: `${bredd * 100}%`, height: '100%', background: ton, borderRadius: RADIE.stapel, flex: 'none' }} />}
      <span style={{ ...TYP.meta, ...TNUM, color: stapel.varde != null ? FARG.text : FARG.text2, whiteSpace: 'nowrap' }}>{stapel.varde != null ? stapel.text : stapel.saknas}</span>
    </div>
  );
}
