'use client';

// INSTRUKTIONER TILL FÖRAREN (maskinläget): kortet som kommer när maskinen kör in i ett område med kommentarer, och listan "Instruktioner på trakten" i genomgången.
// Samma plats som larmkortet (fast, högst upp) och samma "✓ Sett" som larmet — en knapp för allt på kortet, ingen ljudsignal, kortet står kvar tills Sett.
// Reglerna (vad som visas, vad som är sett) ligger i lib/instruktioner; här är bara utseendet.

import React from 'react';
import { AVSTAND, FARG, RADIE, TYP, designCss } from '@/lib/design/tokens';
import { instruktionRader, type Instruktion, type InstruktionKortData, type InstruktionerPaTrakten } from '@/lib/instruktioner/instruktioner';
import { Huvud, Rubrik } from './infoDelar';

/** Minsta höjd på Sett-knappen: tummen i en skakande hytt, ofta med handske (samma som larmets Sett). */
export const INSTRUKTION_SETT_MIN_PX = 56;
const SIFFRA_PX = 28;
/** Grindkortets höjd (ikonen 52 px + padding): instruktionskortet ligger under det när båda visas. */
export const GRIND_KORT_HOJD_PX = 52 + 2 * AVSTAND.m;

/** Etiketten över en kommentar: Vidas text i blått ("Vida · traktdirektiv"), annars "Namn · tid" eller "Äldre kommentar". */
export function InstruktionEtikett({ i }: { i: Pick<Instruktion, 'kalla' | 'forfattare' | 'vantar'> }) {
  if (i.kalla === 'vida') return <span data-testid="instruktion-etikett" data-kalla="vida" style={{ ...TYP.meta, color: FARG.bla }}>Vida · traktdirektiv</span>;
  return (
    <span data-testid="instruktion-etikett" data-kalla={i.kalla} style={{ ...TYP.meta, color: FARG.text3 }}>
      {i.forfattare ?? 'Äldre kommentar'}{i.vantar ? ' · väntar' : ''}
    </span>
  );
}

/** Texten: flera rader = numrerade punkter (vit siffra i rund bricka), en rad = vanlig text. */
export function InstruktionText({ text }: { text: string }) {
  const r = instruktionRader(text);
  if (!r.punkter) return <div data-testid="instruktion-text" style={{ ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>{r.text}</div>;
  return (
    <ol data-testid="instruktion-punkter" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      {r.punkter.map((p, n) => (
        <li key={n} data-testid="instruktion-punkt" style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.m }}>
          <span aria-hidden="true" data-testid="instruktion-siffra" style={{
            flexShrink: 0, width: SIFFRA_PX, height: SIFFRA_PX, borderRadius: RADIE.cirkel, background: FARG.text3, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYP.listtitel,
          }}>{n + 1}</span>
          <span style={{ ...TYP.text, color: FARG.text, overflowWrap: 'anywhere', paddingTop: 2 }}>{p}</span>
        </li>
      ))}
    </ol>
  );
}

/** En kommentar i egen ruta: etiketten överst, sedan texten. `sedd` dämpar den (listan i genomgången). */
export function InstruktionRuta({ i, sedd = false }: { i: Instruktion; sedd?: boolean }) {
  return (
    <div data-testid="instruktion-ruta" data-kalla={i.kalla} data-sedd={sedd ? 'ja' : 'nej'}
      style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, opacity: sedd ? 0.6 : 1 }}>
      <InstruktionEtikett i={i} />
      <InstruktionText text={i.text} />
    </div>
  );
}

/** Den stora "✓ Sett"-knappen — samma form som larmets. */
export function SettKnapp({ onSett, testid = 'instruktion-sett', etikett = 'Sett' }: { onSett: () => void; testid?: string; etikett?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8); onSett(); }}
      className="press-dim"
      style={{
        width: '100%', minHeight: INSTRUKTION_SETT_MIN_PX, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px`,
        border: 'none', borderRadius: RADIE.knapp, background: FARG.text, color: FARG.bg, fontFamily: 'inherit', cursor: 'pointer', touchAction: 'manipulation', ...TYP.rubrik,
      }}
    >
      <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 26 }}>check</span>
      <span>{etikett}</span>
    </button>
  );
}

/**
 * KORTET VID INKÖRNING. Fast högst upp, där larmkortet sitter (larmet går först — sidan visar inte det här medan ett larm visas). Ingen ljudsignal.
 * Kortet scrollar inom sig själv när det är långt; Sett-knappen står fast längst ner i kortet.
 */
export function InstruktionKortVy({ kort, top, onSett }: { kort: InstruktionKortData; top: string; onSett: () => void }) {
  return (
    <div style={{ position: 'fixed', left: AVSTAND.m, right: AVSTAND.m, top, zIndex: 620, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <style>{designCss}</style>
      <div
        role="status"
        data-testid="instruktion-kort"
        style={{
          width: '100%', maxWidth: 560, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.l}px`,
          maxHeight: `calc(100dvh - ${top} - ${AVSTAND.xxl * 3}px)`, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, color: FARG.text, pointerEvents: 'auto',
          boxShadow: '0 16px 50px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ flexShrink: 0, paddingRight: AVSTAND.s }}>
          <div data-testid="instruktion-rubrik" style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>{kort.namn} – instruktioner</div>
          <div data-testid="instruktion-under" style={{ ...TYP.text, color: FARG.text2 }}>{kort.avlagg ? 'Du är vid avlägget' : 'Du kör in i området nu'}</div>
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: AVSTAND.s, paddingRight: AVSTAND.s }}>
          {kort.instruktioner.map((i) => <InstruktionRuta key={i.ref} i={i} />)}
        </div>
        <div style={{ flexShrink: 0, paddingRight: AVSTAND.s }}>
          <SettKnapp onSett={onSett} />
          {kort.fler > 0 && <div data-testid="instruktion-fler" style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', marginTop: AVSTAND.xs }}>+{kort.fler} {kort.fler === 1 ? 'område' : 'områden'} till väntar</div>}
        </div>
      </div>
    </div>
  );
}

/** Raden "Instruktioner på trakten (N) ›" i genomgången (ObjektKort): antalet, och hur många som är nya. */
export const instruktionRadText = (d: Pick<InstruktionerPaTrakten, 'antal' | 'nya'>): string => `Instruktioner på trakten (${d.antal})`;

/**
 * Listan bakom raden: alla områden med instruktioner, de med osedda överst. "✓ Sett" här räknas precis som på kortet vid inkörning.
 * Ett område utan osedda visar sina kommentarer dämpade och ingen knapp.
 */
export function InstruktionLista({ data, objektNamn, onSett, onTillbaka, onStang }: {
  data: InstruktionerPaTrakten; objektNamn: string; onSett: (nycklar: string[]) => void; onTillbaka: () => void; onStang: () => void;
}) {
  const medNya = data.omraden.filter((o) => o.nya > 0);
  return (
    <>
      <Huvud titel="Instruktioner på trakten" undertitel={data.nya > 0 ? `${data.antal} · ${data.nya} nya` : `${data.antal} · alla sedda`} tillbaka={objektNamn} onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="instruktion-lista" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        {data.omraden.length === 0 && <div data-testid="instruktion-lista-tom" style={{ ...TYP.text, color: FARG.text2 }}>Inga instruktioner på den här trakten.</div>}
        {medNya.length > 1 && <SettKnapp testid="instruktion-sett-alla" etikett="Sett alla" onSett={() => onSett(medNya.map((o) => o.nyckel))} />}
        {data.omraden.map((o) => (
          <section key={o.nyckel} data-testid="instruktion-omrade" data-nyckel={o.nyckel}>
            <Rubrik>{o.namn}</Rubrik>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {o.instruktioner.map((i) => <InstruktionRuta key={i.ref} i={i} sedd={i.sedd} />)}
              {o.nya > 0 && <SettKnapp testid="instruktion-sett-omrade" onSett={() => onSett([o.nyckel])} />}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
