'use client';

import { useMemo, useState } from 'react';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVSTAND, FARG, IKON, KNAPP, KORT, LAYOUT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { Anmarkningar } from './Korningar';
import Periodval from './Periodval';
import MaskinerSektion from './MaskinerSektion';
import Staplar from './Staplar';
import { periodEtikett, type Manad, type Period } from './period';
import { fmtLPerMil, summera, type Summa } from './rundor';
import type { RundorLage } from './useRundor';
import type { FakturerbartStatus } from './useFakturerbart';
import type { MaskinerLage } from './useMaskiner';
import LassMotFlyttar from './LassMotFlyttar';
import type { ViktLage } from './useVikt';
import { ENHET, MED_LASS, UTAN_LASS, betaltRader, forbrukningRader, harOkand, korstrackaRader, korstrackaSerier, lagen, perManad, vantandeFlyttar, type Lage } from './uppfoljning';
import { lassMotFlyttar, matarAr, matarKm, perViktManad } from './vikt';

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
export default function UppfoljningSida({ ar, onAr, fakt, vikt, maskiner, arAdmin, namn, onMaskinAndrad, lage, onForsokIgen, onTillbaka, onValjManad }: {
  ar: number; onAr: (ar: number) => void;
  /** Årets körning delad på med lass / utan lass / okänd ur bilens vikt (Förbrukning, Körsträcka och jämförelsen i Betalt). */
  vikt: { lage: ViktLage; forsokIgen: () => void };
  /** Årets flyttar per maskin ("Maskiner" längst ner; också Y i "Lass kan saknas"). */
  maskiner: { lage: MaskinerLage; forsokIgen: () => void };
  /** Bara admin kan öppna en flytt för att rätta den (sheeten "Flytten"). */
  arAdmin: boolean; namn: string;
  /** En flytt rättades i maskinens ark: läs om allt som kan ha ändrats. */
  onMaskinAndrad: () => void;
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

  const vantar = useMemo(() => (underlag ? vantandeFlyttar(underlag) : null), [underlag]);
  const viktRader = vikt.lage.lage === 'klar' ? vikt.lage.rader : null;
  const viktManader = useMemo(() => (viktRader ? perViktManad(ar, viktRader) : null), [ar, viktRader]);
  const flyttar = maskiner.lage.lage === 'klar' ? maskiner.lage.flyttar : null;
  // ALL körsträcka på sidan kommer från mätaren (Martin 2026-10-20): "Körd", månadslistan, Körsträcka och Betalt. Rundorna ger bara antalet, litrarna och l/mil på raderna.
  const betalt = useMemo(() => (viktManader && underlag ? betaltRader(viktManader, underlag) : null), [viktManader, underlag]);
  const matar = useMemo(() => (viktManader && manader ? matarAr(viktManader, m => manader.some(x => x.m.ar === m.ar && x.m.man === m.man && x.s.antal > 0)) : null), [viktManader, manader]);
  const lassRader = useMemo(() => (viktManader && flyttar ? lassMotFlyttar(viktManader, flyttar) : null), [viktManader, flyttar]);

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
            <div data-ars-km style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.xs }}>{matar ? `${matar.km.toLocaleString('sv-SE')} km` : '– km'}</div>
            <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>
              {metaRad(summa)}{matar && matar.saknas.length > 0 ? ` · mätare saknas för ${matar.saknas.map(m => periodEtikett(m).split(' ')[0].toLowerCase()).join(', ')}` : ''}
            </div>
          </section>

          <Flikkontroll flikar={flikar} aktiv={aktivt} onVal={setValt} />
          <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Diagram">
            {vikt.lage.lage === 'fel' ? (
              <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
                <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa vikten just nu.</p>
                <button type="button" onClick={vikt.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
              </div>
            ) : aktivt === 'betalt' && fakt && fakt.status.lage === 'fel' ? (
              <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
                <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa fakturerat just nu.</p>
                <button type="button" onClick={fakt.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
              </div>
            ) : !viktManader || (aktivt === 'betalt' && !betalt) ? (
              <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.l}px 0`, margin: 0 }}>{viktManader ? 'Läser fakturerat …' : 'Läser vikt …'}</p>
            ) : aktivt === 'betalt' && betalt ? (
              <Staplar lage="staplat" rader={betalt} serier={['Fakturerat', 'Ej betalt']} enhet={ENHET.betalt} />
            ) : aktivt === 'forbrukning' ? (
              <Staplar lage="bredvid" rader={forbrukningRader(viktManader)} serier={[MED_LASS, UTAN_LASS]} enhet={ENHET.forbrukning} />
            ) : (
              <Staplar lage="staplat" rader={korstrackaRader(viktManader)} serier={korstrackaSerier(viktManader)} enhet={ENHET.korstracka} />
            )}
          </section>
          {aktivt === 'betalt' && (
            <p data-fotnot style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>Ej betalt = tomkörning, service, korta och egna flyttar.</p>
          )}
          {aktivt === 'korstracka' && viktManader && harOkand(viktManader) && (
            <p data-fotnot style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>Okänd = lastades eller lossades under sträckan, eller så saknades vikten.</p>
          )}
          {aktivt === 'betalt' && vantar && vantar.antal > 0 && (
            <p data-vantar style={{ ...TYP.meta, ...TNUM, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>
              {vantar.antal} {vantar.antal === 1 ? 'flytt väntar' : 'flyttar väntar'} på godkännande · {vantar.km.toLocaleString('sv-SE')} km
            </p>
          )}
          {aktivt === 'betalt' && (lassRader || maskiner.lage.lage === 'fel') && (
            <LassMotFlyttar rader={lassRader ?? []} flyttarFel={maskiner.lage.lage === 'fel'} onValjManad={onValjManad} />
          )}

          <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Månader">
            {manader.map(({ m, s }, i) => {
              const v = viktManader?.find(x => x.m.ar === m.ar && x.m.man === m.man);
              const km = v ? matarKm(v) : null;
              return (
                <button key={m.man} type="button" data-manad={m.man} onClick={() => onValjManad(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, background: 'none', border: 'none', borderBottom: i === manader.length - 1 ? 'none' : `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TYP.listtitel, color: FARG.text }}>{periodEtikett(m).split(' ')[0]}</div>
                    <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{s.antal === 0 ? 'Inga rundor' : metaRad(s)}</div>
                  </div>
                  <div data-manad-km style={{ textAlign: 'right', ...TNUM }}>
                    {km != null && v ? (
                      <>
                        <div style={{ ...TYP.listtitel, color: FARG.text }}>{km.toLocaleString('sv-SE')} km</div>
                        {km > 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Med lass {Math.round((100 * v.lastad.km) / km)} %</div>}
                      </>
                    ) : (
                      <div style={{ ...TYP.meta, color: FARG.text2 }}>{viktManader ? 'mätare saknas' : '–'}</div>
                    )}
                  </div>
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
                </button>
              );
            })}
          </section>
          <Anmarkningar s={summa} />
        </div>
      )}
      {/* Maskiner läser maskin_flytt själv: ett fel i rundorna ska inte ta bort den, och tvärtom. */}
      <div style={{ marginTop: AVSTAND.xl }}>
        <MaskinerSektion ar={ar} lage={maskiner.lage} onForsokIgen={maskiner.forsokIgen} arAdmin={arAdmin} namn={namn} onAndrad={onMaskinAndrad} />
      </div>
    </div>
  );
}
