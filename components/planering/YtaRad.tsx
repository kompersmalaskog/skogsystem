'use client';

// BRICKAN OCH RADEN FÖR EN YTA (lib/ytaNamn, lib/ytaRader): kartans namn på ytan ("Hänsyn 1", "Övrigt 4") som bricka i gruppens färg + typen + första punkten av instruktionen på EN rad.
// Samma bricka i ⓘ-panelens lista, instruktionskortet vid inkörning, påminnelsen i ytan och kartkortet — ett barn ska kunna koppla texten till ytan på kartan.

import React from 'react';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { brickaFarg, type BrickaGrupp } from '@/lib/ytaNamn';
import type { YtaRad as YtaRadData } from '@/lib/ytaRader';
import { Pil } from './infoDelar';

/** Brickan: kartans etikett i gruppens färg (Natur grön, Kultur brun, Övrigt vit …), svart text — färg är aldrig ensam, ordet och numret står i brickan. */
export function YtaBricka({ bricka, grupp, testid = 'yta-bricka' }: { bricka: string; grupp: BrickaGrupp; testid?: string }) {
  return (
    <span data-testid={testid} data-grupp={grupp}
      style={{ display: 'inline-block', flexShrink: 0, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, borderRadius: RADIE.rad, background: brickaFarg(grupp), color: FARG.bg, ...TYP.listtitel, whiteSpace: 'nowrap' }}>
      {bricka}
    </span>
  );
}

/** Den lilla blå pricken: ytan har en instruktion som föraren inte sett. Blått är "ny/navigera" i appen — och ordet "ny" finns i aria-label. */
export function BlaPrick({ testid = 'yta-osedd' }: { testid?: string }) {
  return <span data-testid={testid} role="img" aria-label="Inte sedd" style={{ flexShrink: 0, width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: FARG.bla }} />;
}

/**
 * En rad i listan: [bricka] typ · osedd-prick · pil, och under den första punkten av instruktionen på en rad (avkortad med …). Ett tryck flyger kartan till ytan.
 * Rad 56 px hög som övriga rader i kortet; bara tokens.
 */
export function YtaRadVy({ rad, onTryck, forstaRad = false }: { rad: YtaRadData; onTryck: (nyckel: string) => void; forstaRad?: boolean }) {
  return (
    <button type="button" data-testid="yta-rad" data-nyckel={rad.nyckel} data-osedd={rad.osedd ? 'ja' : 'nej'} onClick={() => onTryck(rad.nyckel)} className="press-row"
      aria-label={`${rad.bricka}${rad.typ ? ` ${rad.typ}` : ''}${rad.osedd ? ', inte sedd' : ''}. Visa på kartan`}
      style={{
        width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, boxSizing: 'border-box', padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m,
        background: 'transparent', border: 'none', borderTop: forstaRad ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
      }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minWidth: 0 }}>
          <YtaBricka bricka={rad.bricka} grupp={rad.grupp} />
          {rad.typ && <span data-testid="yta-rad-typ" style={{ ...TYP.listtitel, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.typ}</span>}
        </span>
        {rad.text && <span data-testid="yta-rad-text" style={{ ...TYP.text, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rad.text}</span>}
      </span>
      {rad.osedd && <BlaPrick />}
      <Pil />
    </button>
  );
}
