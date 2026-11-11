'use client';

// PRODUKTION — öppnas när föraren trycker på objektets namn i maskinläget (skördare och skotare). Ren presentation; all text i lib/produktionVy.
// Överst EN ring med svaret, under det BARA det som avviker (orange prick + ord), sist "Detaljer". Detaljer byter innehåll i samma ark (‹ Produktion).
// Arket är ett kort: inga kort i kortet (Sektion kort={false}).

import React, { useState } from 'react';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Flikkontroll from '@/components/design/Flikkontroll';
import type { SiffraRad } from '@/lib/produktionSiffror';
import { AVSTAND, FARG, KNAPP, TNUM, TYP, designCss } from '@/lib/design/tokens';
import type { DetaljRad, ProduktionVy } from '@/lib/produktionVy';

const RING_PX = 160;
const RING_TJOCK = 14;

function Ring({ andel, tal, under }: { andel: number; tal: string; under: string }) {
  const r = (RING_PX - RING_TJOCK) / 2;
  const omkrets = 2 * Math.PI * r;
  const a = Math.max(0, Math.min(1, andel));
  return (
    <div data-testid="produktion-ring" data-andel={a.toFixed(3)} style={{ position: 'relative', width: RING_PX, height: RING_PX, margin: `${AVSTAND.l}px auto ${AVSTAND.m}px` }}>
      <svg width={RING_PX} height={RING_PX} viewBox={`0 0 ${RING_PX} ${RING_PX}`} aria-hidden="true">
        <circle cx={RING_PX / 2} cy={RING_PX / 2} r={r} fill="none" stroke={FARG.upphojt} strokeWidth={RING_TJOCK} />
        {a > 0 && (
          <circle cx={RING_PX / 2} cy={RING_PX / 2} r={r} fill="none" stroke={FARG.gron} strokeWidth={RING_TJOCK} strokeLinecap="round"
            strokeDasharray={`${omkrets * a} ${omkrets}`} transform={`rotate(-90 ${RING_PX / 2} ${RING_PX / 2})`} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${AVSTAND.xl}px`, textAlign: 'center' }}>
        <div data-testid="produktion-tal" style={{ ...TYP.rubrik, ...TNUM, color: FARG.text }}>{tal}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{under}</div>
      </div>
    </div>
  );
}

const Prick = () => <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.orange, display: 'inline-block', flexShrink: 0 }} />;

export interface SkordareDetaljer {
  typ: 'skordare';
  /** Området maskinen står i, null utanför alla områden. */
  harNu: { namn: string; under: string; hogstubbar: { varde: string; efter: boolean }; evighetstrad: { varde: string; efter: boolean } } | null;
  omraden: DetaljRad[];
  /** "Hur går det?" ur maskinens filer (idag och veckan). */
  hurGarDet: { lage: 'laser' } | { lage: 'fel'; onForsok: () => void } | { lage: 'ok'; idag: SiffraRad[]; vecka: SiffraRad[]; not: string | null };
}

export interface SkotareDetaljer {
  typ: 'skotare';
  /** Detaljer = kvar per sortiment och dagens lass (KvarArk). */
  onOppna: () => void;
  hurGarDet: SkordareDetaljer['hurGarDet'];
  /** Skotat per avlägg, mest först; tomt = ingen sektion. */
  avlagg: DetaljRad[];
}

export interface ProduktionProps {
  /** "Gallring Santhe · H8E -26" */
  undertitel: string;
  vy: ProduktionVy;
  /** Skördaren: detaljerna i samma ark. Skotaren: en handling (öppnar kvar per sortiment). */
  detaljer: SkordareDetaljer | SkotareDetaljer;
  onStang: () => void;
}

export default function Produktion({ undertitel, vy, detaljer, onStang }: ProduktionProps) {
  const [visa, setVisa] = useState<'oversikt' | 'detaljer'>('oversikt');
  const [period, setPeriod] = useState<'idag' | 'vecka'>('idag');
  const iDetaljer = visa === 'detaljer' && detaljer.typ === 'skordare';
  return (
    <>
      <style>{designCss}</style>
      <Ark rubrik="Produktion" stang="Klar" onStang={onStang}>
        <div data-testid="produktion" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
          {!iDetaljer ? (
            <>
              <div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>{undertitel}</div>
                <Ring andel={vy.andel} tal={vy.tal} under={vy.talUnder} />
                <div data-testid="produktion-svar" style={{ ...TYP.rubrik, color: FARG.text, textAlign: 'center' }}>{vy.svar}</div>
                {vy.tempo && <div data-testid="produktion-tempo" style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', marginTop: AVSTAND.xs }}>{vy.tempo}</div>}
              </div>

              {vy.avvikelser.length > 0 && (
                <Sektion rubrik="Att titta på" kort={false}>
                  {vy.avvikelser.map((a, i) => (
                    <div key={a.id} data-testid="produktion-avvikelse" style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'baseline', padding: `${AVSTAND.m}px 0`, borderTop: i ? `1px solid ${FARG.linje}` : 'none' }}>
                      <Prick />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...TYP.listtitel, color: FARG.text }}>{a.titel}</div>
                        <div style={{ ...TYP.meta, color: FARG.text2 }}>{a.under}</div>
                      </div>
                    </div>
                  ))}
                </Sektion>
              )}
              {vy.avvikelser.length === 0 && vy.iFas && (
                <div data-testid="produktion-ifas" style={{ display: 'flex', gap: AVSTAND.s, alignItems: 'center', ...TYP.text, color: FARG.text }}>
                  <span aria-hidden="true" style={{ color: FARG.gron }}>✓</span>{vy.iFas}
                </div>
              )}

              <HurGarDet h={detaljer.hurGarDet} period={period} onPeriod={setPeriod} skotare={detaljer.typ === 'skotare'} />
              {detaljer.typ === 'skotare' && detaljer.avlagg.length > 0 && (
                <Sektion rubrik="Avlägg" kort={false}>
                  {detaljer.avlagg.map((r, i) => <Rad key={r.id} titel={r.titel} under={r.under} hoger={r.hoger} sista={i === detaljer.avlagg.length - 1} attr={{ 'data-testid': 'produktion-avlagg' }} />)}
                </Sektion>
              )}

              <div>
                <Rad titel="Detaljer" sista attr={{ 'data-testid': 'produktion-detaljer' }}
                  under={detaljer.typ === 'skordare' ? 'Området du står i och alla områden' : 'Kvar per sortiment och dagens lass'}
                  onTryck={() => { if (detaljer.typ === 'skordare') setVisa('detaljer'); else detaljer.onOppna(); }} />
              </div>
            </>
          ) : (
            <>
              <button type="button" data-testid="produktion-tillbaka" onClick={() => setVisa('oversikt')} style={{ ...KNAPP.lank, alignSelf: 'flex-start', paddingLeft: 0 }}>‹ Produktion</button>
              {detaljer.harNu && (
                <Sektion rubrik="Här nu" kort={false}>
                  <Rad titel={detaljer.harNu.namn} under={detaljer.harNu.under} />
                  <Rad titel="Högstubbar" hoger={<Varde v={detaljer.harNu.hogstubbar} />} />
                  <Rad titel="Evighetsträd" hoger={<Varde v={detaljer.harNu.evighetstrad} />} sista />
                </Sektion>
              )}
              <Sektion rubrik="Områden" kort={false}>
                {detaljer.omraden.map((r, i) => (
                  <Rad key={r.id} titel={r.titel} under={r.under} hoger={r.hoger === '✓' ? <span style={{ color: FARG.gron }}>✓</span> : r.hoger}
                    dampad={r.dampad} sista={i === detaljer.omraden.length - 1} attr={{ 'data-testid': 'produktion-omrade' }} />
                ))}
              </Sektion>
            </>
          )}
        </div>
      </Ark>
    </>
  );
}

function HurGarDet({ h, period, onPeriod, skotare }: { h: SkordareDetaljer['hurGarDet']; period: 'idag' | 'vecka'; onPeriod: (p: 'idag' | 'vecka') => void; skotare?: boolean }) {
  const rader = h.lage === 'ok' ? (period === 'idag' ? h.idag : h.vecka) : [];
  return (
    <Sektion rubrik="Hur går det?" kort={false} not={h.lage === 'ok' && h.not ? h.not : undefined}>
      <div style={{ marginBottom: AVSTAND.s }}>
        <Flikkontroll flikar={[['idag', 'Idag'], ['vecka', 'Veckan']] as const} aktiv={period} onVal={onPeriod} />
      </div>
      {h.lage === 'laser' && <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Läser maskinens filer …</div>}
      {h.lage === 'fel' && (
        <div data-testid="produktion-siffror-fel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.m}px 0` }}>
          <span style={{ ...TYP.text, color: FARG.orange }}>Kunde inte läsa maskinens filer</span>
          <button type="button" onClick={h.onForsok} style={KNAPP.lank}>Försök igen</button>
        </div>
      )}
      {h.lage === 'ok' && rader.length === 0 && (
        <div data-testid="produktion-siffror-tom" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>
          {skotare ? (period === 'idag' ? 'Inga lass idag än' : 'Inga lass den här veckan') : period === 'idag' ? 'Ingen fil från maskinen idag än' : 'Ingen fil från maskinen den här veckan'}
        </div>
      )}
      {rader.map((r, i) => <Rad key={r.id} titel={r.titel} hoger={r.varde} sista={i === rader.length - 1} attr={{ 'data-testid': `produktion-siffra-${r.id}` }} />)}
    </Sektion>
  );
}

function Varde({ v }: { v: { varde: string; efter: boolean } }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, color: v.efter ? FARG.text : v.varde.endsWith('✓') ? FARG.gron : FARG.text }}>
      {v.efter && <Prick />}{v.varde}
    </span>
  );
}
