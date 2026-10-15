'use client';

// OM TRAKTEN (tavla 28, 30) — "A4:t". Allt som sagts om trakten på ett ställe, sökbart:
//   Sökfält överst (text i kommentarer och symbolnamn) · Hela trakten (Vidas text och planerarens, med avsändare) ·
//   Faror (röd rubrik) · På kartan · Vägar (varje markering MED kommentar eller foto: kommentaren som huvudtext, symbolens namn litet under, liten bild —
//   tryck = stor —, avstånd BARA när man är på trakten, "Visa ›"; flera korta kommentarer av samma typ blir EN rad som fälls ut) ·
//   utan kommentar bara antal per typ · Ytor.
// "Visa ›" stänger arket på telefon och flyger kartan dit; på bred skärm ligger panelen kvar och markeringen framhävs på kartan (sidan avgör).
// Ren presentation — sidan bygger listorna (lib/objektKort) och ritar kartsymbolerna (`ikon`).

import React, { useMemo, useState } from 'react';
import MarkeringFoto from '@/app/planering/MarkeringFoto';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import {
  antalPerTyp, arBasvag, avstandText, byggMarkeringsGrupper, efektivPos, filtreraMarkeringar, harFoto, matcharSok, samladText, visasIListan,
  type KartMarkering, type MarkeringMedAvstand, type MarkeringsRad, type TillForarenPost,
} from '@/lib/objektKort';
import { basvagText } from '@/lib/basvag';
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
  // Avstånd och "närmast först" gäller bara när man är på trakten (inom ca 1 km); annars skapad ordning och ingen avståndstext.
  const pos = useMemo(() => efektivPos(p.pos, p.markeringar), [p.pos, p.markeringar]);
  const traffar = useMemo(() => filtreraMarkeringar(p.markeringar.filter(visasIListan), q), [p.markeringar, q]);
  const grupper = useMemo(() => byggMarkeringsGrupper(traffar, pos), [traffar, pos]);
  const rader = (g: 'faror' | 'ovrigt' | 'vagar') => grupper.find((x) => x.grupp === g)?.rader ?? [];
  const utanKommentar = useMemo(() => antalPerTyp(p.markeringar), [p.markeringar]);
  const sokt = q.trim() !== '';
  const helaTraffar = p.hela.filter((h) => matcharSok(h.text, q) || matcharSok(h.avsandare, q));
  const restrTraffar = p.restriktioner.filter((r) => matcharSok(`${r.name ?? ''} ${r.type ?? ''} ${r.details ?? ''} ${r.warning ?? ''}`, q));
  const ytorTraffar = p.ytor.filter((y) => matcharSok(`${y.typLabel} ${y.text ?? ''}`, q));
  const inget = sokt && helaTraffar.length === 0 && restrTraffar.length === 0 && traffar.length === 0 && ytorTraffar.length === 0;
  const radProps = { ikon: p.ikon, framhavdId: p.framhavdId, onVisa: p.onVisa, onFoto: p.onFoto };

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

        {/* FAROR — röd rubrik; ordet "Faror" bär budskapet, färgen förstärker */}
        {rader('faror').length > 0 && (
          <section data-testid="om-faror">
            <Rubrik farg={FARG.rod}>Faror</Rubrik>
            <div data-testid="om-faror-rader" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {rader('faror').map((r) => <Rad key={r.nyckel} r={r} {...radProps} />)}
            </div>
          </section>
        )}

        {/* PÅ KARTAN */}
        {(rader('ovrigt').length > 0 || (!sokt && (p.miljo.length > 0 || utanKommentar !== '' || (p.markeringar.length > 0 && traffar.length === 0)))) && (
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
            {rader('ovrigt').length > 0 && (
              <div data-testid="om-markeringar" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {rader('ovrigt').map((r) => <Rad key={r.nyckel} r={r} {...radProps} />)}
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

        {/* VÄGAR — sist */}
        {rader('vagar').length > 0 && (
          <section data-testid="om-vagar">
            <Rubrik>Vägar</Rubrik>
            <div data-testid="om-vagar-rader" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {rader('vagar').map((r) => <Rad key={r.nyckel} r={r} {...radProps} />)}
            </div>
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

interface RadProps { ikon: (m: KartMarkering) => React.ReactNode; framhavdId: string | null; onVisa: (m: KartMarkering) => void; onFoto: (src: string) => void }

function Rad({ r, ...p }: { r: MarkeringsRad } & RadProps) {
  if (r.samlad) return <Samlad r={r} {...p} />;
  const m = r.markeringar[0];
  return <Markering m={m} ikon={p.ikon(m)} framhavd={p.framhavdId === m.id} onVisa={() => p.onVisa(m)} onFoto={p.onFoto} />;
}

/** Flera korta kommentarer av samma typ som EN rad: "Vägar · Röd väg ×3 · Gul väg ×2". Tryck fäller ut en rad per markering, var och en med Visa ›. */
function Samlad({ r, ...p }: { r: MarkeringsRad } & RadProps) {
  const [oppen, setOppen] = useState(false);
  return (
    <div data-testid="om-samlad" data-oppen={oppen ? '1' : '0'} style={{ borderRadius: RADIE.kort, background: FARG.upphojt, overflow: 'hidden' }}>
      <button type="button" data-testid="om-samlad-knapp" aria-expanded={oppen} onClick={() => setOppen((v) => !v)} className="press-row"
        style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>{p.ikon(r.markeringar[0])}</span>
        <span data-testid="om-samlad-text" style={{ flex: 1, minWidth: 0, ...TYP.listtitel, overflowWrap: 'anywhere' }}>{samladText(r)}</span>
        <span style={{ display: 'inline-flex', transform: oppen ? 'rotate(90deg)' : 'none' }}><Pil /></span>
      </button>
      {oppen && (
        <div data-testid="om-samlad-lista" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, padding: `0 ${AVSTAND.s}px ${AVSTAND.s}px` }}>
          {r.markeringar.map((m) => <Markering key={m.id} m={m} inre ikon={p.ikon(m)} framhavd={p.framhavdId === m.id} onVisa={() => p.onVisa(m)} onFoto={p.onFoto} />)}
        </div>
      )}
    </div>
  );
}

/** Kommentaren är huvudtexten (stor); symbolens namn står litet under. Utan kommentar (bara foto) är namnet huvudtexten. */
function Markering({ m, ikon, framhavd, inre = false, onVisa, onFoto }: { m: MarkeringMedAvstand; ikon: React.ReactNode; framhavd: boolean; inre?: boolean; onVisa: () => void; onFoto: (src: string) => void }) {
  const foto = harFoto(m);
  const komm = m.comment.trim();
  // Basväg: huvudtexten är "Basväg röd · 640 m" (färg och längd); en ev. kommentar står under.
  const basvag = arBasvag(m);
  const huvud = basvag ? basvagText(m.farg, m.langdM) : (komm || m.namn);
  const under = basvag ? komm : (komm ? m.namn : '');
  return (
    <div data-testid="om-markering" data-id={m.id} data-framhavd={framhavd ? '1' : '0'}
      style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: inre ? FARG.fyllning : FARG.upphojt, boxShadow: framhavd ? `inset 0 0 0 2px ${FARG.text}` : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>{ikon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span data-testid="om-huvudtext" style={{ display: 'block', ...TYP.listtitel, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{huvud}</span>
          {under && <span data-testid="om-symbolnamn" style={{ display: 'block', ...TYP.meta, color: FARG.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{under}</span>}
        </span>
        <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {m.avstandM != null && <span data-testid="om-avstand" style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{avstandText(m.avstandM)}</span>}
          <button type="button" data-testid="om-visa" onClick={onVisa} style={{ ...visaKnapp }}>Visa ›</button>
        </span>
      </div>
      {foto && (
        <div style={{ marginTop: AVSTAND.s }}>
          <span data-testid="om-foto" style={{ display: 'inline-flex' }}>
            <MarkeringFoto photoPath={m.photoPath} photoData={m.photoData} photoTs={m.photoTs} alt={`Foto: ${m.namn}`} onOpen={onFoto}
              style={{ width: AVSTAND.xxl * 2, height: AVSTAND.xxl * 2, objectFit: 'cover', borderRadius: RADIE.rad, display: 'block' }} />
          </span>
        </div>
      )}
    </div>
  );
}

const visaKnapp: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: TRAFFYTA.min, padding: `0 0 0 ${AVSTAND.m}px`, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', ...TYP.text,
};
