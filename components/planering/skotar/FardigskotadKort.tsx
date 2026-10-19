'use client';

// TRAKTEN FÄRDIGSKOTAD (plusmenyn). REGEL: när trakten stängs är skotat alltid lika med skördat per sortiment, utan undantag — förarens lass
// skalas proportionellt (upp och ner) och hans ursprungliga värden sparas för uppföljning.
// Är skillnaden större än ca 3 % eller 10 m³ frågar kortet först: "Har du fått med allt?" med Kolla kartan / Färdigskotad ändå.

import React from 'react';
import { AVSTAND, FARG, TNUM, TYP, medSafeBotten } from '@/lib/design/tokens';
import type { FardigKontroll } from '@/lib/skotarLass/kvar';
import { sortimentDelar } from '@/lib/skotarLass/sortiment';
import { KVAR_SYNLIGA } from '@/lib/skotarLass/kvar';
import { arkPanel, arkRam, knappPrimar, knappStor, meta } from './stil';

export function FardigskotadKort({ kontroll, klar, onKarta, onBekrafta, onAvbryt }: {
  kontroll: FardigKontroll | null;
  /** Redan färdigskotad. */
  klar: boolean;
  onKarta: () => void;
  onBekrafta: () => void;
  onAvbryt: () => void;
}) {
  const fraga = !!kontroll && !kontroll.ok;
  // Samma sortiment som i Kvar-listan: de största för sig, resten (och Unclassified) som "Övrigt".
  const namngivna = kontroll ? kontroll.rader.filter((r) => !r.oklassat) : [];
  const synliga = namngivna.slice(0, KVAR_SYNLIGA);
  const ovrigtKvar = kontroll ? [...namngivna.slice(KVAR_SYNLIGA), ...kontroll.rader.filter((r) => r.oklassat)].reduce((s, r) => s + r.kvar, 0) : 0;
  return (
    <div style={arkRam}>
      <div data-testid="fardigskotad" data-fraga={fraga ? 'ja' : 'nej'} role="dialog" aria-label="Trakten färdigskotad" style={{ ...arkPanel, padding: AVSTAND.l, paddingBottom: medSafeBotten(AVSTAND.l) }}>
        {klar ? (
          <>
            <div style={{ ...TYP.rubrik }}><span style={{ color: FARG.gron }} aria-hidden="true">✓ </span>Trakten är färdigskotad</div>
            <button type="button" onClick={onAvbryt} style={{ ...knappStor, width: '100%', marginTop: AVSTAND.l }}>Stäng</button>
          </>
        ) : !kontroll ? (
          <>
            <div style={{ ...TYP.rubrik }}>Färdigskotad?</div>
            <div style={{ ...meta, marginTop: AVSTAND.s }}>Skördaren är inte läst än — vi kan inte räkna kvar. Försök igen när du har täckning.</div>
            <button type="button" onClick={onAvbryt} style={{ ...knappStor, width: '100%', marginTop: AVSTAND.l }}>Stäng</button>
          </>
        ) : fraga ? (
          <>
            <div style={{ ...TYP.rubrik }}>Har du fått med allt?</div>
            <div data-testid="fardigskotad-text" style={{ ...TYP.text, marginTop: AVSTAND.s }}>
              Enligt skördaren ~{Math.round(kontroll.kvarM3)} m³ kvar –{' '}
              {synliga.map((r, i) => (<span key={r.nyckel}>{i > 0 ? ', ' : ''}{sortimentDelar(r.namn).sortiment} <span style={TNUM}>~{Math.round(r.kvar)}</span></span>))}
              {ovrigtKvar >= 0.5 && <span>{synliga.length ? ', ' : ''}Övrigt <span style={TNUM}>~{Math.round(ovrigtKvar)}</span></span>}
            </div>
            <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
              <button type="button" data-testid="fardigskotad-karta" onClick={onKarta} style={{ ...knappPrimar, flex: 1 }}>Kolla kartan</button>
              <button type="button" data-testid="fardigskotad-anda" onClick={onBekrafta} style={{ ...knappStor, flex: 1 }}>Färdigskotad ändå</button>
            </div>
            <button type="button" onClick={onAvbryt} style={{ ...knappStor, width: '100%', marginTop: AVSTAND.s, background: 'transparent', color: FARG.text2 }}>Avbryt</button>
          </>
        ) : (
          <>
            <div style={{ ...TYP.rubrik }}>Trakten färdigskotad?</div>
            <div style={{ ...meta, marginTop: AVSTAND.s }}>Skotat sätts lika med skördat för varje sortiment. Dina egna siffror sparas.</div>
            <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
              <button type="button" data-testid="fardigskotad-ja" onClick={onBekrafta} style={{ ...knappPrimar, flex: 2 }}>Färdigskotad</button>
              <button type="button" onClick={onAvbryt} style={{ ...knappStor, flex: 1 }}>Avbryt</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
