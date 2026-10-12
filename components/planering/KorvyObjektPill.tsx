'use client';

// KÖRVYNS OBJEKTPILL: "<objekt> | Högstubbar n/krav | Evighetsträd n/krav". Tre SEPARATA tryckytor, var och en 56 px hög:
//   • namnet       → objektinfon
//   • Högstubbar   → sätter en högstubbe på maskinens position (räknaren ökar, kvitto med Ångra)
//   • Evighetsträd → sätter ett evighetsträd på maskinens position
// Räknarens läge (lib/miljokrav kravStatus): 'ingen' = bara antalet (ej certifierat), 'ok' = n/krav, 'efter' = orange siffra + ordet
// "efter" (färg bär aldrig ensam), 'uppfyllt' = grön siffra + bock. Via designtokens.

import React from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import type { KravStatus } from '@/lib/miljokrav';

export interface RaknareVy {
  antal: number;
  krav: number | null;
  status: KravStatus;
}

export const PILL_HOJD_PX = 56;

function Raknare({ namn, ikon, vy, smal, onTryck, testid, handling }: {
  namn: string; ikon: React.ReactNode; vy: RaknareVy; smal: boolean; onTryck: () => void; testid: string; handling: string;
}) {
  const { antal, krav, status } = vy;
  const siffraFarg = status === 'efter' ? FARG.orange : status === 'uppfyllt' ? FARG.gron : FARG.text;
  const text = krav != null ? `${antal}/${krav}` : `${antal}`;
  const aria = `${namn} ${antal}${krav != null ? ` av ${krav}` : ''}${status === 'efter' ? ', ligger efter' : status === 'uppfyllt' ? ', klart' : ''}. ${handling}`;
  return (
    <button
      type="button"
      data-testid={testid}
      data-status={status}
      aria-label={aria}
      onClick={onTryck}
      className="press-dim"
      style={{
        display: 'flex', alignItems: 'center', gap: AVSTAND.s, height: PILL_HOJD_PX, minWidth: PILL_HOJD_PX, padding: `0 ${smal ? AVSTAND.m : AVSTAND.l}px`,
        border: 'none', background: 'transparent', color: FARG.text2, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, ...TYP.text,
      }}
    >
      {smal ? <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>{ikon}</span> : <span>{namn}</span>}
      <b style={{ color: siffraFarg, ...TYP.rubrik, ...TNUM }}>{text}</b>
      {status === 'efter' && <span style={{ color: FARG.orange, ...TYP.meta }}>· efter</span>}
      {status === 'uppfyllt' && <span aria-hidden="true" style={{ color: FARG.gron, ...TYP.rubrik }}>✓</span>}
    </button>
  );
}

const Avdelare = () => <span aria-hidden="true" style={{ width: 1, alignSelf: 'center', height: AVSTAND.xl, background: FARG.linje, flexShrink: 0 }} />;

export function KorvyObjektPill({
  namn, hogstubbar, evighetstrad, smal, ikonHogstubbe, ikonEvighetstrad, orangeKant, prefix,
  onNamn, onHogstubbe, onEvighetstrad,
}: {
  namn: string;
  hogstubbar: RaknareVy;
  evighetstrad: RaknareVy;
  /** telefon: ikon i stället för ordet, och pillen fyller bredden bredvid hem-knappen så namnet får plats */
  smal: boolean;
  ikonHogstubbe: React.ReactNode;
  ikonEvighetstrad: React.ReactNode;
  /** "Visa som"-läget: orange kant som i den gamla pillen */
  orangeKant?: boolean;
  prefix?: React.ReactNode;
  onNamn: () => void;
  onHogstubbe: () => void;
  onEvighetstrad: () => void;
}) {
  return (
    <div
      data-testid="korvy-objektpill"
      style={{
        pointerEvents: 'auto', flex: smal ? '1 1 auto' : '0 1 auto', minWidth: 0, maxWidth: smal ? 'none' : 'calc(100% - 120px)', display: 'flex', alignItems: 'stretch',
        height: PILL_HOJD_PX, borderRadius: PILL_HOJD_PX / 2, overflow: 'hidden', background: FARG.kort, color: FARG.text,
        border: orangeKant ? `1px solid ${FARG.orange}` : `1px solid ${FARG.linje}`,
      }}
    >
      <button
        type="button"
        data-testid="korvy-pill-namn"
        aria-label={`${namn}. Tryck för objektinfo`}
        onClick={onNamn}
        className="press-dim"
        style={{
          display: 'flex', alignItems: 'center', height: PILL_HOJD_PX, minWidth: 0, flex: '1 1 auto', padding: `0 ${smal ? AVSTAND.m : AVSTAND.xl}px`,
          border: 'none', background: 'transparent', color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ ...(smal ? TYP.listtitel : TYP.rubrik), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {prefix}{namn}
        </span>
      </button>
      <Avdelare />
      <Raknare namn="Högstubbar" ikon={ikonHogstubbe} vy={hogstubbar} smal={smal} onTryck={onHogstubbe} testid="korvy-pill-hogstubbar" handling="Tryck för att sätta en högstubbe här" />
      <Avdelare />
      <Raknare namn="Evighetsträd" ikon={ikonEvighetstrad} vy={evighetstrad} smal={smal} onTryck={onEvighetstrad} testid="korvy-pill-evighetstrad" handling="Tryck för att sätta ett evighetsträd här" />
    </div>
  );
}
