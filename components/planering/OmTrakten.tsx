'use client';

// OM TRAKTEN (tavla 28, 30) — "A4:t". Allt som sagts om trakten på ett ställe, sökbart:
//   Sökfält överst (text i kommentarer och symbolnamn) · Hela trakten (Vidas text och planerarens, med avsändare) ·
//   På kartan (varje markering MED kommentar eller foto: symbol, namn, hela kommentaren, liten bild — tryck = stor —, avstånd om GPS finns, "Visa ›") ·
//   utan kommentar bara antal per typ · Ytor.
// "Visa ›" stänger arket på telefon och flyger kartan dit; på bred skärm ligger panelen kvar och markeringen framhävs på kartan (sidan avgör).
// Ren presentation — sidan bygger listorna (lib/objektKort) och ritar kartsymbolerna (`ikon`).

import React, { useMemo, useState } from 'react';
import MarkeringFoto from '@/app/planering/MarkeringFoto';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import {
  antalPerTyp, avstandText, filtreraMarkeringar, harFoto, harInnehall, matcharSok, sorteraMarkeringar,
  type KartMarkering, type MarkeringMedAvstand, type TillForarenPost,
} from '@/lib/objektKort';
import { Gruppkort, Huvud, Pil, Rubrik } from './infoDelar';

export interface OmYta { nr: number; typLabel: string; text: string | null; harLjud: boolean; harFoto: boolean; onOppna: () => void }
export interface OmRestriktion { name?: string; type?: string; details?: string; warning?: string }
export interface OmMiljoRad { id: string; namn: string; antal: number; krav: number | null; uppfyllt: boolean }

export interface OmTraktenProps {
  objektNamn: string;
  onTillbaka: () => void;
  onStang: () => void;
  /** Vidas text och planerarens text, hela, med avsändare */
  hela: TillForarenPost[];
  /** "ca 14–22 m mellan träden" ur direktivet — stöd under Vidas text */
  planttext: string | null;
  restriktioner: OmRestriktion[];
  markeringar: KartMarkering[];
  pos: { lat: number; lng: number } | null;
  /** Högstubbar 5 av 15 — EN gång, här under På trakten */
  miljo: OmMiljoRad[];
  ytor: OmYta[];
  ikon: (m: KartMarkering) => React.ReactNode;
  onVisa: (m: KartMarkering) => void;
  onFoto: (src: string) => void;
  framhavdId: string | null;
}

export default function OmTrakten(p: OmTraktenProps) {
  const [q, setQ] = useState('');
  const sorterade = useMemo(() => sorteraMarkeringar(p.markeringar.filter(harInnehall), p.pos), [p.markeringar, p.pos]);
  const traffar = useMemo(() => filtreraMarkeringar(sorterade, q), [sorterade, q]);
  const utanKommentar = useMemo(() => antalPerTyp(p.markeringar), [p.markeringar]);
  const sokt = q.trim() !== '';
  const helaTraffar = p.hela.filter((h) => matcharSok(h.text, q) || matcharSok(h.avsandare, q));
  const restrTraffar = p.restriktioner.filter((r) => matcharSok(`${r.name ?? ''} ${r.type ?? ''} ${r.details ?? ''} ${r.warning ?? ''}`, q));
  const ytorTraffar = p.ytor.filter((y) => matcharSok(`${y.typLabel} ${y.text ?? ''}`, q));
  const inget = sokt && helaTraffar.length === 0 && restrTraffar.length === 0 && traffar.length === 0 && ytorTraffar.length === 0;

  return (
    <>
      <Huvud titel="Om trakten" tillbaka={p.objektNamn} onTillbaka={p.onTillbaka} onStang={p.onStang} />
      <div style={{ flexShrink: 0, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
        <input type="search" data-testid="om-sok" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök i kommentarer och symboler" aria-label="Sök i kommentarer och symboler"
          autoCapitalize="none" autoCorrect="off"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.rad, border: 'none', background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', outline: 'none', ...TYP.text }} />
      </div>

      <div data-testid="om-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
        {inget && <div data-testid="om-inget" style={{ ...TYP.text, color: FARG.text2 }}>Inget i trakten matchar ”{q.trim()}”. Sökningen gäller text i kommentarer och namn på symboler.</div>}

        {/* HELA TRAKTEN */}
        {(helaTraffar.length > 0 || restrTraffar.length > 0) && (
          <section data-testid="om-hela">
            <Rubrik>Hela trakten</Rubrik>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {helaTraffar.map((h) => (
                <div key={h.id} data-testid={`om-post-${h.id}`} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
                  <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{h.avsandare}</div>
                  <div style={{ ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{h.text}</div>
                  {h.id === 'vida' && p.planttext && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{p.planttext}</div>}
                </div>
              ))}
              {restrTraffar.map((r, i) => (
                <div key={i} data-testid="om-restriktion" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
                  <div style={{ ...TYP.listtitel }}>{r.name || 'Område'}{r.type && <span style={{ ...TYP.meta, color: FARG.text2 }}> · {r.type}</span>}</div>
                  {r.details && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{r.details}</div>}
                  {r.warning && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>{r.warning}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PÅ KARTAN */}
        {(!sokt || traffar.length > 0) && (p.markeringar.length > 0 || p.miljo.length > 0) && (
          <section data-testid="om-pa-kartan">
            <Rubrik>På kartan</Rubrik>
            {!sokt && p.miljo.length > 0 && (
              <div data-testid="om-miljo" style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
                {p.miljo.map((m) => (
                  <div key={m.id} data-testid={`om-miljo-${m.id}`} style={{ padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
                    <span style={{ ...TYP.meta, color: FARG.text2 }}>{m.namn} </span>
                    <span style={{ ...TYP.listtitel, color: m.uppfyllt ? FARG.gron : FARG.text, ...TNUM }}>{m.krav != null ? `${m.antal} av ${m.krav}` : `${m.antal}`}{m.uppfyllt ? ' ✓' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {traffar.length > 0 && (
              <div data-testid="om-markeringar" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {traffar.map((m) => <Markering key={m.id} m={m} ikon={p.ikon(m)} framhavd={p.framhavdId === m.id} onVisa={() => p.onVisa(m)} onFoto={p.onFoto} />)}
              </div>
            )}
            {!sokt && traffar.length === 0 && p.markeringar.length > 0 && (
              <div data-testid="om-ingen-kommentar" style={{ ...TYP.meta, color: FARG.text2 }}>Ingen markering har kommentar eller foto än.</div>
            )}
            {!sokt && utanKommentar && (
              <div data-testid="om-utan-kommentar" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.m }}>
                <span style={{ ...TYP.meta }}>Utan kommentar </span>{utanKommentar}
              </div>
            )}
          </section>
        )}

        {/* YTOR */}
        {ytorTraffar.length > 0 && (
          <section data-testid="om-ytor">
            <Rubrik>Ytor</Rubrik>
            <Gruppkort>
              {ytorTraffar.map((y, i) => (
                <button key={`${y.nr}-${i}`} type="button" onClick={y.onOppna} className="press-row"
                  style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', borderTop: i > 0 ? `1px solid ${FARG.linje}` : 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', ...TYP.text }}>
                  <span style={{ flexShrink: 0, width: AVSTAND.xl + AVSTAND.xs, height: AVSTAND.xl + AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.fyllning, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...TYP.meta, fontWeight: 700, ...TNUM }}>{y.nr}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', ...TYP.listtitel }}>{y.typLabel}</span>
                    <span style={{ display: 'block', ...TYP.meta, color: y.text ? FARG.text2 : FARG.text3, overflowWrap: 'anywhere' }}>{y.text || 'Ingen anteckning'}</span>
                  </span>
                  {(y.harLjud || y.harFoto) && <span style={{ ...TYP.meta, color: FARG.text2 }}>{y.harLjud ? 'Ljud' : ''}{y.harLjud && y.harFoto ? ' · ' : ''}{y.harFoto ? 'Foto' : ''}</span>}
                  <Pil />
                </button>
              ))}
            </Gruppkort>
          </section>
        )}

        {!sokt && p.hela.length === 0 && p.restriktioner.length === 0 && p.markeringar.length === 0 && p.ytor.length === 0 && (
          <div data-testid="om-tomt" style={{ ...TYP.text, color: FARG.text2 }}>Inget är skrivet om trakten än. Vidas direktiv och planerarens text hamnar här, och markeringar med kommentar eller foto listas på kartan.</div>
        )}
      </div>
    </>
  );
}

function Markering({ m, ikon, framhavd, onVisa, onFoto }: { m: MarkeringMedAvstand; ikon: React.ReactNode; framhavd: boolean; onVisa: () => void; onFoto: (src: string) => void }) {
  const foto = harFoto(m);
  return (
    <div data-testid="om-markering" data-id={m.id} data-framhavd={framhavd ? '1' : '0'}
      style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, boxShadow: framhavd ? `inset 0 0 0 2px ${FARG.text}` : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>{ikon}</span>
        <span style={{ flex: 1, minWidth: 0, ...TYP.listtitel }}>{m.namn}</span>
        {m.avstandM != null && <span data-testid="om-avstand" style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{avstandText(m.avstandM)}</span>}
      </div>
      {m.comment.trim() && <div style={{ ...TYP.text, marginTop: AVSTAND.s, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.comment.trim()}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginTop: AVSTAND.s }}>
        {foto && (
          <span data-testid="om-foto" style={{ flexShrink: 0, display: 'inline-flex' }}>
            <MarkeringFoto photoPath={m.photoPath} photoData={m.photoData} photoTs={m.photoTs} alt={`Foto: ${m.namn}`} onOpen={onFoto}
              style={{ width: AVSTAND.xxl * 2, height: AVSTAND.xxl * 2, objectFit: 'cover', borderRadius: RADIE.rad, display: 'block' }} />
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="om-visa" onClick={onVisa} style={{ ...visaKnapp }}>Visa ›</button>
      </div>
    </div>
  );
}

const visaKnapp: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', ...TYP.text,
};
