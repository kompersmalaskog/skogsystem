'use client';

// ⓘ-KORTET (tavla 26/26b). Info och verktyg är skilda: kortet säger VAD trakten är och vad föraren ska veta; menyvalen bor i Mer.
//
//   Halv höjd (telefon): namn · "typ · avtalsform · cert" · knapprad efter roll · Till föraren · faktabrickor.
//   Uppdraget (och bred panel, där allt syns): + På trakten · Brandrisk · Dokument · Larmkoordinat.
//   Faror (röd rad) står alltid överst under namnet — säkerhet trängs aldrig undan av ett ark som är halvt.
//
// Ren presentation: sidan bygger texterna (lib/objektKort) och bestämmer vad ett tryck gör.

import React, { useLayoutEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { SammanfattningRad } from '@/lib/klarTrakt';
import { behoverLasAllt, KORT_RADER, type Bricka, type KortKnapp, type KortKnappId, type TillForarenPost } from '@/lib/objektKort';
import BrandriskRad from './BrandriskRad';
import { Gruppkort, Huvud, Pil, RadKnapp, Rubrik } from './infoDelar';

export interface KortLarm {
  satt: boolean;
  koordinat: string;
  bekraftad: boolean;
  beskrivning: string;
  onVisa: () => void;
}

export interface ObjektKortProps {
  namn: string;
  rad: string;
  knappar: KortKnapp[];
  onKnapp: (id: KortKnappId) => void;
  onStang: () => void;
  faror: string[];
  tillForaren: TillForarenPost[];
  onLasAllt: () => void;
  brickor: Bricka[];
  extraBrickor: Bricka[];
  /** "N markeringar · M med text" — null = inga markeringar (raden visas inte) */
  paTrakten: string | null;
  onPaTrakten: () => void;
  /** "Vad betyder kartan ›" — öppnar teckenförklaringen. Saknas = ingen rad. */
  onKarta?: () => void;
  brand: { lat: number; lng: number } | null;
  onBrand: () => void;
  dokument: { antal: number; chips: React.ReactNode } | null;
  larm: KortLarm;
  /** "Klar med trakten?" — raden överst på planerarens kort medan trakten planeras. */
  /** FÖRARENS sammanfattning av planeringen: det planeraren fyllt i, utan Klar-knapp och utan redigering. null/saknas = visas inte (planerare ser kortet "Klar med trakten?" i stället). */
  planering?: { rader: SammanfattningRad[]; oplanerad: boolean; gamla: string } | null;
  klarRad?: { chip: { text: string; ton: 'orange' | 'gron' | 'neutral' } | null } | null;
  onKlar?: () => void;
  /** Skotarläget: vädret de närmaste dagarna (bara här — inget väder på kartan). Sist på kortet. */
  vader?: React.ReactNode;
}

/** En text begränsad till tre rader; "Läs allt ›" när den inte ryms (mätt i webbläsaren, annars den rena tumregeln). */
function BegransadText({ text, onLasAllt }: { text: string; onLasAllt: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [klipps, setKlipps] = useState(behoverLasAllt(text));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const matt = el.scrollHeight > el.clientHeight + 1;
    setKlipps(matt || behoverLasAllt(text));
  }, [text]);
  return (
    <>
      <div ref={ref} data-testid="kort-text"
        style={{ ...TYP.text, color: FARG.text, whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: KORT_RADER, overflowWrap: 'anywhere' }}>{text}</div>
      {klipps && (
        <button type="button" data-testid="kort-las-allt" onClick={onLasAllt}
          style={{ ...KNAPP.lank, marginTop: AVSTAND.xs, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}>Läs allt ›</button>
      )}
    </>
  );
}

export default function ObjektKort(p: ObjektKortProps) {
  const [dokOppen, setDokOppen] = useState(false);
  const n = p.knappar.length;
  // Alla knappar på EN rad. Fyra (förare) kräver tätare: 4 px mellanrum och ingen sidopadding ger 79 px per knapp på en 360 px bred telefon — "Skotning" är 73 px.
  const kolumner = Math.max(1, n);
  const tat = n >= 4;
  const alla = [...p.brickor, ...p.extraBrickor];

  return (
    <>
      <Huvud titel={p.namn} undertitel={p.rad || undefined} onStang={p.onStang} />
      <div data-testid="kort-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        {/* FAROR — röd rad med ord (färg är aldrig ensam bärare) */}
        {p.faror.length > 0 && (
          <div data-testid="kort-faror" role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod, flexShrink: 0 }}>warning</span>
            <span style={{ ...TYP.listtitel, color: FARG.rod, overflowWrap: 'anywhere' }}>Faror: {p.faror.join(', ')}</span>
          </div>
        )}

        {/* BRANDRISK — bara när någon av de fem dagarna är 3 eller högre; direkt under Faror */}
        {p.brand && <BrandriskRad lat={p.brand.lat} lng={p.brand.lng} onOppna={p.onBrand} luftUnder={AVSTAND.m} />}

        {/* KLAR MED TRAKTEN? — planerarens ingång till färdigplaneringen; "N kvar" i orange, "Klar" i grönt (ord och färg tillsammans) */}
        {p.klarRad && p.onKlar && (
          <div style={{ marginBottom: AVSTAND.m }}>
            <Gruppkort testid="kort-klar">
              <RadKnapp forstaRad testid="kort-klar-rad" etikett="Klar med trakten?" onTryck={p.onKlar}
                hoger={p.klarRad.chip ? <span data-testid="kort-klar-chip" data-ton={p.klarRad.chip.ton} style={{ ...TYP.listtitel, color: p.klarRad.chip.ton === 'orange' ? FARG.orange : p.klarRad.chip.ton === 'gron' ? FARG.gron : FARG.text }}>{p.klarRad.chip.text}</span> : undefined} />
            </Gruppkort>
          </div>
        )}

        {/* KNAPPRAD efter roll — högst EN primär: den första */}
        <div data-testid="kort-knappar" style={{ display: 'grid', gridTemplateColumns: `repeat(${kolumner}, minmax(0, 1fr))`, gap: tat ? AVSTAND.xs : AVSTAND.s, marginBottom: AVSTAND.l }}>
          {p.knappar.map((k, i) => (
            <button key={k.id} type="button" data-testid={`kort-knapp-${k.id}`} onClick={() => p.onKnapp(k.id)} className="press-scale"
              style={{ ...(i === 0 && k.id !== 'mer' ? KNAPP.primar : KNAPP.sekundar), minHeight: TRAFFYTA.primar, ...(tat ? { padding: 0, whiteSpace: 'nowrap', overflow: 'hidden' } : null), cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
              {k.etikett}
            </button>
          ))}
        </div>

        {/* TILL FÖRAREN — Vidas direktiv och planerarens text, var och en med avsändare; högst tre rader, sedan "Läs allt ›" */}
        {p.tillForaren.length > 0 && (
          <div data-testid="kort-till-foraren" style={{ marginBottom: AVSTAND.l }}>
            <Rubrik>Till föraren</Rubrik>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {p.tillForaren.map((t) => (
                <div key={t.id} data-testid={`kort-post-${t.id}`} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
                  <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{t.avsandare}</div>
                  <BegransadText text={t.text} onLasAllt={p.onLasAllt} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PLANERING — det planeraren fyllt i. Bara läsning: ingen Klar-knapp, inget att ändra. Vidas direktiv står ovanför. */}
        {p.planering && (p.planering.rader.length > 0 || p.planering.oplanerad || p.planering.gamla.trim()) && (
          <div data-testid="kort-planering" style={{ marginBottom: AVSTAND.l }}>
            <Rubrik>Planering</Rubrik>
            <Gruppkort>
              {p.planering.oplanerad && (
                <div data-testid="kort-planering-oplanerad" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, ...TYP.listtitel, color: FARG.orange }}>Inte klarplanerad än — uppgifterna kan saknas eller ändras</div>
              )}
              {p.planering.rader.map((r, i) => (
                <div key={r.id} data-testid={`kort-planering-${r.id}`} style={{ display: 'flex', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 && !p.planering!.oplanerad ? 'none' : `1px solid ${FARG.linje}` }}>
                  <span style={{ ...TYP.text, color: FARG.text2, flexShrink: 0, width: '42%' }}>{r.etikett}</span>
                  <span style={{ ...TYP.text, color: FARG.text, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.text}</span>
                </div>
              ))}
              {p.planering.gamla.trim() && (
                <div data-testid="kort-planering-gamla" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: p.planering.rader.length > 0 || p.planering.oplanerad ? `1px solid ${FARG.linje}` : 'none' }}>
                  <div style={{ ...TYP.meta, color: FARG.text3 }}>Gamla anteckningar</div>
                  <div style={{ ...TYP.text, color: FARG.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.planering.gamla.trim()}</div>
                </div>
              )}
            </Gruppkort>
          </div>
        )}

        {/* FAKTABRICKOR — bara det som har värde */}
        {alla.length > 0 && (
          <div data-testid="kort-brickor" style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, marginBottom: AVSTAND.l }}>
            {alla.map((b) => (
              <div key={b.id} data-testid={`kort-bricka-${b.id}`} style={{ padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
                <span style={{ ...TYP.listtitel, color: FARG.text, ...TNUM }}>{b.varde}</span>
                {b.etikett && <span style={{ ...TYP.meta, color: FARG.text2 }}> {b.etikett}</span>}
              </div>
            ))}
          </div>
        )}

        {/* UPPDRAGET: På trakten · Brandrisk · Dokument · Larmkoordinat */}
        <Gruppkort testid="kort-uppdrag">
          {p.paTrakten && (
            <RadKnapp forstaRad testid="kort-pa-trakten" etikett={<><span style={{ color: FARG.text2 }}>På trakten </span>{p.paTrakten}</>} onTryck={p.onPaTrakten} />
          )}
          {p.onKarta && (
            <RadKnapp forstaRad={!p.paTrakten} testid="kort-vad-betyder-kartan" etikett="Vad betyder kartan" onTryck={p.onKarta} />
          )}
          {p.dokument && (
            <>
              <RadKnapp testid="kort-dokument" ikon="description" etikett={`Dokument (${p.dokument.antal})`} onTryck={() => setDokOppen((v) => !v)}
                pil={false} hoger={<span style={{ display: 'inline-flex', transform: dokOppen ? 'rotate(90deg)' : 'none' }}><Pil /></span>} />
              {dokOppen && <div data-testid="kort-dokument-lista" style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>{p.dokument.chips}</div>}
            </>
          )}
          <LarmKort larm={p.larm} />
        </Gruppkort>
        {p.vader && <div data-testid="kort-vader" style={{ marginTop: AVSTAND.l }}>{p.vader}</div>}
      </div>
    </>
  );
}

/** Larmkoordinaten är säkerhet: alltid synlig. Satt = tryck flyger kartan dit; ej satt = ärlig varning (farligare att dölja än att visa). */
function LarmKort({ larm }: { larm: KortLarm }) {
  if (!larm.satt) {
    return (
      <div data-testid="kort-larm" data-satt="0" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, ...TYP.listtitel, color: FARG.orange }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad }}>warning</span>Larmkoordinat ej satt
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Ingen mötesplats för räddningstjänsten är angiven. Sätt den under Mer › Trakt › Larm.</div>
        {larm.beskrivning && <div style={{ ...TYP.text, marginTop: AVSTAND.s, whiteSpace: 'pre-wrap' }}>{larm.beskrivning}</div>}
      </div>
    );
  }
  return (
    <button type="button" data-testid="kort-larm" data-satt="1" onClick={larm.onVisa} className="press-row" aria-label="Visa larmkoordinaten på kartan"
      style={{ width: '100%', display: 'block', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: 'transparent', border: 'none', borderTop: `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>Larmkoordinat</span>
          <span style={{ display: 'block', ...TYP.listtitel, ...TNUM, overflowWrap: 'anywhere' }}>{larm.koordinat}</span>
          <span data-testid="kort-larm-status" style={{ display: 'block', ...TYP.meta, color: larm.bekraftad ? FARG.gron : FARG.orange }}>{larm.bekraftad ? 'Larmplats kontrollerad' : 'Larmplats inte kontrollerad'}</span>
        </span>
        <Pil />
      </span>
      {larm.beskrivning && <span style={{ display: 'block', marginTop: AVSTAND.s, ...TYP.text, whiteSpace: 'pre-wrap' }}>{larm.beskrivning}</span>}
    </button>
  );
}
