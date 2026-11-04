'use client';

// ÖVERBLICKEN NÄR MASKINEN BÖRJAR PÅ EN TRAKT (lib/traktOversikt). EN sida, uppifrån:
//   namn + "Slutavverkning · PEFC · 2,5 ha" · EN mening · Faror (röd) · Till föraren (Vidas direktiv + planerarens text, i sin helhet)
//   · Inför jobbet (bara det som avviker) · På trakten (en rad per sort, "2 med text") · Börja köra.
// Ett tryck på en rad i På trakten öppnar Om trakten i den sorten — alla av sorten markeras på kartan (samma som förut).
// "Nytt" = planeraren har ändrat eller lagt till det sedan maskinen såg trakten sist. Ren presentation; sidan räknar och avgör.

import React, { useMemo } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { SammanfattningRad } from '@/lib/klarTrakt';
import type { KartMarkering, TillForarenPost } from '@/lib/objektKort';
import { byggOmGrupper, typRadText, type TypRad } from '@/lib/omTrakten';
import { oversiktMening } from '@/lib/traktOversikt';
import { Gruppkort, Huvud, Pil, Rubrik } from './infoDelar';
import { KommentarVisning } from './KommentarRuta';
import type { OmMiljoRad } from './OmTrakten';

export interface TraktOversiktProps {
  namn: string;
  /** "Slutavverkning · PEFC · 2,5 ha" (lib/traktOversikt.oversiktUnder). */
  under: string;
  /** Vidas farliga linjer (kraftledning) — de egna farorna räknas ur markeringarna. */
  faror: string[];
  tillForaren: TillForarenPost[];
  /** Bara det som avviker (lib/traktOversikt.inforJobbet). */
  infor: SammanfattningRad[];
  markeringar: KartMarkering[];
  miljo: OmMiljoRad[];
  ytor: { typLabel: string }[];
  ikon: (m: KartMarkering) => React.ReactNode;
  /** Markeringar som är nya sedan maskinen såg trakten (id). */
  nya: ReadonlySet<string>;
  /** Text (Vidas direktiv / planerarens) som är ny: post-id. */
  nyaTexter: ReadonlySet<string>;
  onRad: (nyckel: string) => void;
  onBorja: () => void;
  onStang: () => void;
}

const harText = (m: KartMarkering) => !!(m.comment?.trim() || (m.kommentarer && m.kommentarer.length > 0));

const Nytt = () => (
  <span data-testid="oversikt-nytt" style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, color: FARG.bla, flexShrink: 0 }}>
    <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: FARG.bla }} />Nytt
  </span>
);

export default function TraktOversikt(p: TraktOversiktProps) {
  const grupper = useMemo(
    () => byggOmGrupper(p.markeringar, null, p.miljo.map((m) => ({ id: m.id as 'hogstubbar' | 'evighetstrad', namn: m.namn, antal: m.antal, krav: m.krav, uppfyllt: m.uppfyllt })), p.ytor.map((y) => y.typLabel)),
    [p.markeringar, p.miljo, p.ytor],
  );
  const faroRader = grupper.find((g) => g.grupp === 'faror')?.rader ?? [];
  const faror = [...p.faror, ...faroRader.map((r) => typRadText(r))];
  const ovriga: TypRad[] = grupper.filter((g) => g.grupp !== 'faror' && g.grupp !== 'vida').flatMap((g) => g.rader);
  const paKartan = ovriga.reduce((s, r) => s + r.antal, 0);
  const medText = p.markeringar.filter(harText).length;
  const mening = oversiktMening({ faror: p.faror.length + faroRader.reduce((s, r) => s + r.antal, 0), infor: p.infor.length, paKartan, medText });

  return (
    <>
      <Huvud titel={p.namn} undertitel={p.under || undefined} onStang={p.onStang} />
      <div data-testid="oversikt-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <div data-testid="oversikt-mening" style={{ ...TYP.listtitel, color: FARG.text, ...TNUM }}>{mening}</div>

        {faror.length > 0 && (
          <section data-testid="oversikt-faror">
            <Rubrik farg={FARG.rod}>Faror</Rubrik>
            <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod, flexShrink: 0 }}>warning</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                {faror.map((f) => <span key={f} style={{ ...TYP.listtitel, color: FARG.rod, overflowWrap: 'anywhere' }}>{f}</span>)}
              </span>
            </div>
          </section>
        )}

        {p.tillForaren.length > 0 && (
          <section data-testid="oversikt-till-foraren">
            <Rubrik>Till föraren</Rubrik>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {p.tillForaren.map((t) => {
                const vida = t.id === 'vida';
                return (
                  <div key={t.id} data-testid={`oversikt-post-${t.id}`}>
                    {p.nyaTexter.has(t.id) && <div style={{ marginBottom: AVSTAND.xs }}><Nytt /></div>}
                    <KommentarVisning vida={vida} etikett={vida ? undefined : `Hela trakten · ${t.avsandare}`} vidaEtikett="Hela trakten · Vida" text={t.text} meningar={vida} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {p.infor.length > 0 && (
          <section data-testid="oversikt-infor">
            <Rubrik>Inför jobbet</Rubrik>
            <Gruppkort>
              {p.infor.map((r, i) => (
                <div key={r.id} data-testid={`oversikt-infor-${r.id}`} style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'baseline', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                  <span style={{ ...TYP.text, color: FARG.text2, flexShrink: 0 }}>{r.etikett}</span>
                  <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{r.text}</span>
                </div>
              ))}
            </Gruppkort>
          </section>
        )}

        {ovriga.length > 0 && (
          <section data-testid="oversikt-pa-trakten">
            <Rubrik>På trakten</Rubrik>
            <Gruppkort>
              {ovriga.map((r, i) => {
                const text = r.markeringar.filter(harText).length;
                const ny = r.markeringar.some((m) => p.nya.has(m.id));
                return (
                  <button key={r.nyckel} type="button" data-testid={`oversikt-rad-${r.nyckel}`} onClick={() => p.onRad(r.nyckel)} className="press-row"
                    style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m,
                      background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...TYP.text }}>
                    {r.markeringar[0] ? <span style={{ flexShrink: 0, display: 'inline-flex' }}>{p.ikon(r.markeringar[0])}</span> : <span style={{ width: AVSTAND.xl + AVSTAND.xs, flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', ...TYP.listtitel, overflowWrap: 'anywhere', ...TNUM }}>{typRadText(r)}</span>
                      {text > 0 && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{text} med text</span>}
                    </span>
                    {ny && <Nytt />}
                    <Pil />
                  </button>
                );
              })}
            </Gruppkort>
          </section>
        )}
      </div>
      <div style={{ flexShrink: 0, padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        <button type="button" data-testid="oversikt-borja" onClick={p.onBorja} className="press-scale"
          style={{ ...KNAPP.primar, width: '100%', minHeight: TRAFFYTA.primar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Börja köra</button>
      </div>
    </>
  );
}
