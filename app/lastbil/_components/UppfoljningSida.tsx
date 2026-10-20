'use client';

import { useMemo, useState } from 'react';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, IKON, KNAPP, KORT, LAYOUT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { Anmarkningar } from './Korningar';
import Periodval from './Periodval';
import Staplar from './Staplar';
import { periodEtikett, type Manad, type Period } from './period';
import { fmtLPerMil, summera, type Summa } from './rundor';
import type { RundorLage } from './useRundor';
import type { FakturerbartStatus } from './useFakturerbart';
import { ENHET, betaltRader, forbrukningRader, korstrackaRader, lagen, perManad, vantandeFlyttar, type Lage } from './uppfoljning';

const litTxt = (s: Summa) => (s.liter != null ? `${s.liter.toLocaleString('sv-SE')} l` : 'diesel saknas i datan');
/** "5 rundor · 349 l · 4,3 l/mil". */
const metaRad = (s: Summa) =>
  [`${s.antal} ${s.antal === 1 ? 'runda' : 'rundor'}`, litTxt(s), fmtLPerMil(s.lPerMil) ? `${fmtLPerMil(s.lPerMil)} l/mil` : null].filter(Boolean).join(' · ');

/**
 * Uppföljning: lastbilens år som en egen sida under Lastbilen (öppnas av raden "Uppföljning ›" längst ner i Körningar, eller direkt
 * via adressen). Uppifrån: tillbaka till Lastbilen · "‹ 2026 ›" · årets km stort och en dämpad rad (rundor · liter · l/mil) · EN växel
 * över ETT diagram · månadslistan, där ett tryck går till Körningar för månaden.
 * Den visar körning, inte fakturering. Lastbilen är en egen maskin i uppföljningen: l/mil och km blandas aldrig med maskinernas l/h.
 */
export default function UppfoljningSida({ ar, onAr, fakt, lage, onForsokIgen, onTillbaka, onValjManad }: {
  ar: number; onAr: (ar: number) => void;
  /** Årets fakturaunderlag (bara admin; null = förare, då finns inget Betalt-läge). */
  fakt: { status: FakturerbartStatus; forsokIgen: () => void } | null;
  lage: RundorLage; onForsokIgen: () => void; onTillbaka: () => void; onValjManad: (m: Manad) => void;
}) {
  const period: Extract<Period, { typ: 'ar' }> = { typ: 'ar', ar };
  const rundor = lage.lage === 'klar' ? lage.rundor : null;
  const summa = useMemo(() => (rundor ? summera(rundor) : null), [rundor]);
  const manader = useMemo(() => (rundor ? perManad(ar, rundor) : null), [ar, rundor]);
  const [valt, setValt] = useState<Lage>('forbrukning');
  const flikar = useMemo(() => lagen(fakt !== null), [fakt !== null]);   // eslint-disable-line react-hooks/exhaustive-deps
  const aktivt: Lage = flikar.some(([id]) => id === valt) ? valt : 'forbrukning';
  const underlag = fakt?.status.lage === 'klar' ? fakt.status.rader : null;
  const betalt = useMemo(() => (manader && underlag ? betaltRader(manader, underlag) : null), [manader, underlag]);
  const vantar = useMemo(() => (underlag ? vantandeFlyttar(underlag) : null), [underlag]);

  return (
    <div data-ars-sida>
      <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 50, background: FARG.bg, padding: `${AVSTAND.s}px 0` }}>
        <button type="button" data-tillbaka onClick={onTillbaka} style={KNAPP.lank}>‹ Lastbilen</button>
      </div>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Uppföljning</h1>
      <div style={{ marginBottom: AVSTAND.m }}>
        <Periodval period={period} onPeriod={p => p.typ === 'ar' && onAr(p.ar)} />
      </div>
      {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser körningar …</p>}
      {(lage.lage === 'fel' || (lage.lage === 'klar' && (!rundor || !summa || !manader))) && (
        <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
          <p role="alert" style={{ ...TYP.text, color: FARG.rod, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Kunde inte läsa körningarna just nu.</p>
          <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      )}
      {rundor && summa && manader && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
          <section style={KORT} aria-label="Året">
            <div style={{ ...TYP.micro, color: FARG.text2 }}>Körd {ar}</div>
            <div style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.xs }}>{summa.km.toLocaleString('sv-SE')} km</div>
            <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{metaRad(summa)}</div>
          </section>

          <Flikkontroll flikar={flikar} aktiv={aktivt} onVal={setValt} />
          <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Diagram">
            {aktivt === 'betalt' && fakt && !betalt ? (
              fakt.status.lage === 'fel' ? (
                <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
                  <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa fakturerat just nu.</p>
                  <button type="button" onClick={fakt.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
                </div>
              ) : (
                <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.l}px 0`, margin: 0 }}>Läser fakturerat …</p>
              )
            ) : (
              <Staplar
                lage={aktivt === 'forbrukning' ? 'bredvid' : 'staplat'}
                rader={aktivt === 'forbrukning' ? forbrukningRader(manader) : aktivt === 'betalt' && betalt ? betalt : korstrackaRader(manader)}
                serier={aktivt === 'betalt' ? ['Fakturerat', 'Ej betalt'] : ['Flyttar', 'Övrig körning']}
                enhet={ENHET[aktivt]} />
            )}
          </section>
          <p data-fotnot style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>
            {aktivt === 'betalt' ? 'Ej betalt = tomkörning, service, korta och egna flyttar.' : 'Flyttar räknar hela rundan, även tomkörningen.'}
          </p>
          {aktivt === 'betalt' && vantar && vantar.antal > 0 && (
            <p data-vantar style={{ ...TYP.meta, ...TNUM, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>
              {vantar.antal} {vantar.antal === 1 ? 'flytt väntar' : 'flyttar väntar'} på godkännande · {vantar.km.toLocaleString('sv-SE')} km
            </p>
          )}

          <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Månader">
            {manader.map(({ m, s }, i) => (
              <button key={m.man} type="button" data-manad={m.man} onClick={() => onValjManad(m)}
                style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, background: 'none', border: 'none', borderBottom: i === manader.length - 1 ? 'none' : `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
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
      )}
    </div>
  );
}
