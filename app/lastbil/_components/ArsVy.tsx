'use client';

import { AVSTAND, FARG, IKON, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { Anmarkningar } from './Korningar';
import { manaderIAr, manadForStart, periodEtikett, type Period } from './period';
import { fmtLPerMil, summera, type Runda, type Summa } from './rundor';

// År-vyn: körning (km, rundor, l/mil, övrig %) per månad — inte fakturering. Flyttades hit oförändrad ur Korningar.tsx när
// Månad/År-växeln togs bort (2026-10-19); den flyttar vidare till statistiken i en senare PR.

const litTxt = (s: Summa) => (s.liter != null ? `${s.liter.toLocaleString('sv-SE')} l` : 'diesel saknas i datan');
/** "5 rundor · 349 l · 4,3 l/mil" (liter står kvar här — årsvyn är orörd). */
const metaRad = (s: Summa) =>
  [`${s.antal} ${s.antal === 1 ? 'runda' : 'rundor'}`, litTxt(s), fmtLPerMil(s.lPerMil) ? `${fmtLPerMil(s.lPerMil)} l/mil` : null].filter(Boolean).join(' · ');

/** År: månaderna som rader. Ett tryck går till månaden. En månad utan rundor syns med det. */
export default function ArsVy({ period, rundor, summa, onValjManad }: { period: Extract<Period, { typ: 'ar' }>; rundor: Runda[]; summa: Summa; onValjManad: (p: Period) => void }) {
  const manader = manaderIAr(period.ar);
  const perManad = manader.map(m => {
    const rs = rundor.filter(r => { const x = manadForStart(r.start); return x?.ar === m.ar && x.man === m.man; });
    return { m, s: summera(rs) };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <section style={KORT} aria-label="Året">
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Körd {period.ar}</div>
        <div style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.xs }}>{summa.km.toLocaleString('sv-SE')} km</div>
        <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{metaRad(summa)}</div>
      </section>
      <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Månader">
        {perManad.map(({ m, s }, i) => (
          <button key={m.man} type="button" onClick={() => onValjManad(m)}
            style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, background: 'none', border: 'none', borderBottom: i === perManad.length - 1 ? 'none' : `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TYP.listtitel, color: FARG.text }}>{periodEtikett(m).split(' ')[0]}</div>
              <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{s.antal === 0 ? 'Inga rundor' : metaRad(s)}</div>
            </div>
            <div style={{ textAlign: 'right', ...TNUM }}>
              <div style={{ ...TYP.listtitel, color: FARG.text }}>{s.km.toLocaleString('sv-SE')} km</div>
              {s.km > 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Övrig {Math.round((100 * s.kmOvrig) / s.km)} %</div>}
            </div>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
          </button>
        ))}
      </section>
      <Anmarkningar s={summa} />
    </div>
  );
}
