'use client';

// ÄNDRA LASSET — för en stor pekskärm i en skakande hytt, utan handskar (mockupen).
//   • Ett centrerat ark, ca 640 px brett (smal skärm: full bredd minus marginal). Avlägget överst med Byt ›, totalen uppe till höger, Avbryt / Klar nederst.
//   • En rad per sortiment, minst 56 px hög: namn i två nivåer (sortimentet vitt, mottagaren grå) · [ − ] siffra [ + ], knapparna 56×56.
//   • Håll in − / + räknar snabbt (upprepning). Tryck på siffran öppnar ett sifferfält där värdet skrivs direkt.
//   • Lägg till: ett rutnät (2–3 kolumner) med knappar ≥ 56 px; fler än 8 sortiment → de 8 vanligaste och en knapp "Fler ›".
// Valen är traktens egna sortiment med skördarens namn. Raden på 0 försvinner.

import React, { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { avlaggRubrik } from '@/lib/skotarLass/avlagg';
import { kanBekrafta, lassTitel, totalM3, heltM3 } from '@/lib/skotarLass/lassModell';
import type { Avlagg, Lass, SortimentRad } from '@/lib/skotarLass/typer';
import { arkPanel, arkRam, avdelare, knappPrimar, knappStor, meta, smaRubrik, TRYCK_PX } from './stil';
import { SortimentNamn } from './SortimentNamn';
import { medSafeBotten } from '@/lib/design/tokens';

/** Siffran mellan − och +: 24 px fet (ligger mellan stegen rubrik 20 och tal 32 i tokens — avsiktligt, läsbarhet i hytten). */
const SIFFRA_PX = 24;
/** Så många sortiment visas direkt under Lägg till; resten ligger bakom "Fler ›". */
export const TILLAGG_SYNLIGA = 8;
/** Håll in: första steget direkt, upprepning efter HALL_START_MS, snabbare efter HALL_SNABB_EFTER_MS. */
export const HALL = { START_MS: 400, STEG_MS: 120, SNABB_EFTER_MS: 1500, SNABB_STEG_MS: 50 } as const;

/** − / +: ett steg vid tryck, upprepning medan man håller. Pekarhändelser (inte klick) så att ett långt tryck aldrig blir ett enda steg. */
function HallKnapp({ tecken, etikett, onSteg, testid }: { tecken: string; etikett: string; onSteg: () => void; testid: string }) {
  const stegRef = useRef(onSteg);
  stegRef.current = onSteg;
  const tider = useRef<{ start: ReturnType<typeof setTimeout> | null; rep: ReturnType<typeof setInterval> | null; snabb: ReturnType<typeof setTimeout> | null }>({ start: null, rep: null, snabb: null });
  const harPekat = useRef(false);   // pekaren har redan gett stegen — det efterföljande klicket får inte ge ett till

  const stopp = () => {
    const t = tider.current;
    if (t.start) clearTimeout(t.start);
    if (t.rep) clearInterval(t.rep);
    if (t.snabb) clearTimeout(t.snabb);
    t.start = t.rep = t.snabb = null;
  };
  useEffect(() => stopp, []);

  const borja = (e: React.PointerEvent) => {
    e.preventDefault();
    stopp();
    harPekat.current = true;
    stegRef.current();
    tider.current.start = setTimeout(() => {
      tider.current.rep = setInterval(() => stegRef.current(), HALL.STEG_MS);
      tider.current.snabb = setTimeout(() => {
        if (tider.current.rep) clearInterval(tider.current.rep);
        tider.current.rep = setInterval(() => stegRef.current(), HALL.SNABB_STEG_MS);
      }, HALL.SNABB_EFTER_MS - HALL.START_MS);
    }, HALL.START_MS);
  };
  const avbryt = () => { stopp(); harPekat.current = false; };

  return (
    <button type="button" aria-label={etikett} data-testid={testid}
      onPointerDown={borja} onPointerUp={stopp} onPointerCancel={avbryt} onPointerLeave={avbryt} onBlur={stopp}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (harPekat.current) { harPekat.current = false; return; } onSteg(); }}   // tangentbord / hjälpmedel: ett steg per aktivering
      style={{ width: TRYCK_PX, height: TRYCK_PX, borderRadius: RADIE.knapp, border: 'none', background: FARG.fyllning, color: FARG.text, ...TYP.rubrik, fontSize: SIFFRA_PX, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      {tecken}
    </button>
  );
}

/** Siffran: tryck → sifferfält (bara siffror), Enter eller att lämna fältet sparar, Esc ångrar. */
function Siffra({ varde, etikett, onSkriv, testid }: { varde: number; etikett: string; onSkriv: (n: number) => void; testid: string }) {
  const [skriver, setSkriver] = useState(false);
  const [text, setText] = useState('');
  const klar = useRef(false);
  const ram: React.CSSProperties = { width: 72, height: TRYCK_PX, textAlign: 'center', ...TYP.rubrik, fontSize: SIFFRA_PX, ...TNUM, color: FARG.text, fontFamily: 'inherit', flexShrink: 0 };
  if (!skriver) {
    return (
      <button type="button" aria-label={`${etikett}: ${varde} m³. Tryck för att skriva värdet`} data-testid={testid} onClick={() => { klar.current = false; setText(String(varde)); setSkriver(true); }}
        style={{ ...ram, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
        {varde}
      </button>
    );
  }
  const spara = () => {
    if (klar.current) return;
    klar.current = true;
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && text !== '') onSkriv(n);
    setSkriver(false);
  };
  return (
    <input data-testid={`${testid}-falt`} aria-label={`${etikett}, m³`} type="text" inputMode="numeric" pattern="[0-9]*" autoFocus maxLength={4} value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
      onBlur={spara}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); spara(); } else if (e.key === 'Escape') { klar.current = true; setSkriver(false); } }}
      style={{ ...ram, boxSizing: 'border-box', border: `2px solid ${FARG.text}`, borderRadius: RADIE.knapp, background: FARG.fyllning, padding: 0, outline: 'none' }} />
  );
}

export function AndraLassArk({ lass, delNr, avlagg, valbara, onRad, onAvlagg, onKlar, onAvbryt, onTaBort }: {
  lass: Lass;
  delNr: number;
  avlagg: readonly Avlagg[];
  /** Traktens sortiment (skördarens namn, vanligaste först) + Ved markägare när trakten har det. */
  valbara: readonly SortimentRad[];
  onRad: (rad: Pick<SortimentRad, 'nyckel' | 'namn'>, delta: number) => void;
  onAvlagg: (a: Avlagg) => void;
  onKlar: () => void;
  onAvbryt: () => void;
  onTaBort: () => void;
}) {
  const [avlaggVal, setAvlaggVal] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [fler, setFler] = useState(false);
  const del = lass.delar.find((d) => d.delNr === delNr) ?? lass.delar[0];
  const rader = del.rader;
  const finns = new Set(rader.map((r) => r.nyckel));
  const tillagg = valbara.filter((v) => !finns.has(v.nyckel));
  const synliga = fler ? tillagg : tillagg.slice(0, TILLAGG_SYNLIGA);
  const sum = totalM3(rader);
  const klarKan = kanBekrafta(lass);

  return (
    <div style={{ ...arkRam, padding: `0 ${AVSTAND.m}px`, boxSizing: 'border-box' }}>
      <div data-testid="andra-lass" role="dialog" aria-label={`Ändra ${lassTitel(lass, delNr)}`} style={{ ...arkPanel, maxWidth: 640 }}>
        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.s}px`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
          <div style={{ ...TYP.rubrik }}>{lassTitel(lass, delNr)}</div>
          <div data-testid="andra-summa" style={{ ...TYP.tal }}>{sum} <span style={{ ...TYP.listtitel, color: FARG.text2 }}>m³</span></div>
        </div>

        <div style={{ overflowY: 'auto', padding: `0 ${AVSTAND.l}px` }}>
          <button type="button" data-testid="andra-avlagg" onClick={() => setAvlaggVal((v) => !v)}
            style={{ ...knappStor, width: '100%', justifyContent: 'space-between', display: 'flex', alignItems: 'center', background: FARG.fyllning }}>
            <span>{del.avlaggNummer ? avlaggRubrik({ nummer: del.avlaggNummer }) : 'Välj avlägg'}</span>
            <span style={{ color: FARG.text2 }}>{avlaggVal ? '▴' : 'Byt ›'}</span>
          </button>
          {avlaggVal && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, marginTop: AVSTAND.s }}>
              {avlagg.map((a) => (
                <button key={a.id} type="button" data-testid={`andra-avlagg-${a.nummer}`} onClick={() => { onAvlagg(a); setAvlaggVal(false); }}
                  style={{ ...knappStor, flex: '1 1 96px', background: a.id === del.avlaggId ? FARG.text : FARG.fyllning, color: a.id === del.avlaggId ? FARG.bg : FARG.text }}>
                  {avlaggRubrik(a)}
                </button>
              ))}
            </div>
          )}

          <div style={avdelare} />
          {rader.length === 0 && <div style={{ ...meta, padding: `${AVSTAND.s}px 0` }}>Inga sortiment ännu — lägg till nedan.</div>}
          {rader.map((r) => (
            <div key={r.nyckel} data-testid={`andra-rad-${r.nyckel}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRYCK_PX, marginBottom: AVSTAND.s }}>
              <div style={{ flex: 1, minWidth: 0 }}><SortimentNamn namn={r.namn} /></div>
              <HallKnapp tecken="−" etikett={`Ett m³ mindre ${r.namn}`} testid={`minus-${r.nyckel}`} onSteg={() => onRad(r, -1)} />
              <Siffra varde={heltM3(r.m3)} etikett={r.namn} testid={`andra-siffra-${r.nyckel}`} onSkriv={(n) => { const d = n - heltM3(r.m3); if (d !== 0) onRad(r, d); }} />
              <HallKnapp tecken="+" etikett={`Ett m³ mer ${r.namn}`} testid={`plus-${r.nyckel}`} onSteg={() => onRad(r, +1)} />
            </div>
          ))}

          {tillagg.length > 0 && (
            <>
              <div style={avdelare} />
              <div style={{ ...smaRubrik, marginBottom: AVSTAND.s }}>Lägg till</div>
              <div data-testid="tillagg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: AVSTAND.s }}>
                {synliga.map((v) => (
                  <button key={v.nyckel} type="button" data-testid={`tillagg-${v.nyckel}`} onClick={() => onRad(v, +1)}
                    style={{ ...knappStor, width: '100%', minHeight: TRYCK_PX, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: AVSTAND.s, textAlign: 'left', padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.fyllning, color: FARG.text }}>
                    <span aria-hidden="true" style={{ ...TYP.listtitel, color: FARG.text2 }}>+</span>
                    <SortimentNamn namn={v.namn} />
                  </button>
                ))}
                {!fler && tillagg.length > TILLAGG_SYNLIGA && (
                  <button type="button" data-testid="tillagg-fler" onClick={() => setFler(true)}
                    style={{ ...knappStor, width: '100%', minHeight: TRYCK_PX, gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: FARG.text }}>
                    Fler ({tillagg.length - TILLAGG_SYNLIGA}) ›
                  </button>
                )}
              </div>
            </>
          )}

          <div style={avdelare} />
          {bekraftaBort ? (
            <div style={{ display: 'flex', gap: AVSTAND.s, alignItems: 'center', paddingBottom: AVSTAND.s }}>
              <div style={{ flex: 1, ...meta }}>Ta bort hela lasset?</div>
              <button type="button" data-testid="andra-ta-bort-ja" onClick={onTaBort} style={{ ...knappStor, color: FARG.rod }}>Ta bort</button>
              <button type="button" onClick={() => setBekraftaBort(false)} style={knappStor}>Behåll</button>
            </div>
          ) : (
            <button type="button" data-testid="andra-ta-bort" onClick={() => setBekraftaBort(true)}
              style={{ ...knappStor, width: '100%', background: 'transparent', color: FARG.rod }}>Det var ingen lossning — ta bort lasset</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: AVSTAND.s, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, paddingBottom: medSafeBotten(AVSTAND.l), borderTop: `1px solid ${FARG.linje}` }}>
          <button type="button" data-testid="andra-avbryt" onClick={onAvbryt} style={{ ...knappStor, flex: 1 }}>Avbryt</button>
          <button type="button" data-testid="andra-klar" onClick={onKlar} disabled={!klarKan}
            style={{ ...knappPrimar, flex: 2, opacity: klarKan ? 1 : 0.4 }}>Klar</button>
        </div>
      </div>
    </div>
  );
}
