'use client';

// KÖRVYNS OBJEKTPILL: "<objekt> | Högstubbar n/krav | Evighetsträd n/krav". Tre SEPARATA tryckytor, var och en minst 56 px hög:
//   • namnet      → objektinfon
//   • Högstubbar  → sätter en högstubbe på maskinens position (räknaren ökar, kvitto med Ångra)
//   • Evighetsträd → sätter ett evighetsträd på maskinens position
// Räknarens läge (lib/miljokrav kravStatus): 'ingen' = bara antalet (ej certifierat), 'ok' = n/krav, 'efter' = dämpad orange siffra
// + "efter", 'uppfyllt' = grön siffra + bock. Mockup: skärm 7 i Hytten-canvasen (utan "Kvar ha" — den bor i objektinfon).

import React from 'react';
import type { KravStatus } from '@/lib/miljokrav';

export interface RaknareVy {
  antal: number;
  krav: number | null;
  status: KravStatus;
}

export const PILL_HOJD_PX = 56;
const ORANGE = '#ff9f0a';   // dämpad orange (mockupen), aldrig röd — "efter" är en påminnelse, inte ett larm
const GRON = '#30d158';

function Raknare({ namn, ikon, vy, smal, onTryck, testid, handling }: {
  namn: string; ikon: React.ReactNode; vy: RaknareVy; smal: boolean; onTryck: () => void; testid: string; handling: string;
}) {
  const { antal, krav, status } = vy;
  const siffraFarg = status === 'efter' ? ORANGE : status === 'uppfyllt' ? GRON : '#f2f2f2';
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
        display: 'flex', alignItems: 'center', gap: smal ? 6 : 8, height: PILL_HOJD_PX, minWidth: PILL_HOJD_PX,
        padding: smal ? '0 12px' : '0 18px', border: 'none', background: 'transparent', color: '#d4d8dd',
        fontSize: smal ? 15 : 17, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {smal ? <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>{ikon}</span> : <span>{namn}</span>}
      <b style={{ color: siffraFarg, fontSize: smal ? 17 : 19, fontVariantNumeric: 'tabular-nums' }}>{text}</b>
      {status === 'efter' && <span style={{ color: ORANGE, fontSize: smal ? 12 : 14 }}>· efter</span>}
      {status === 'uppfyllt' && <span aria-hidden="true" style={{ color: GRON, fontSize: smal ? 17 : 19, fontWeight: 700 }}>✓</span>}
    </button>
  );
}

const Avdelare = () => <span aria-hidden="true" style={{ width: 1, alignSelf: 'center', height: 24, background: '#3a3f45', flexShrink: 0 }} />;

export function KorvyObjektPill({
  namn, hogstubbar, evighetstrad, smal, ikonHogstubbe, ikonEvighetstrad, orangeKant, prefix,
  onNamn, onHogstubbe, onEvighetstrad,
}: {
  namn: string;
  hogstubbar: RaknareVy;
  evighetstrad: RaknareVy;
  /** smal skärm (telefon): ikon i stället för ordet, och pillen fyller bredden bredvid hem-knappen så namnet får plats */
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
        height: PILL_HOJD_PX, borderRadius: PILL_HOJD_PX / 2, overflow: 'hidden', background: '#1c1f22', color: '#f2f2f2',
        border: orangeKant ? '1px solid #ff9f0a' : '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
      }}
    >
      <button
        type="button"
        data-testid="korvy-pill-namn"
        aria-label={`${namn}. Tryck för objektinfo`}
        onClick={onNamn}
        className="press-dim"
        style={{
          display: 'flex', alignItems: 'center', height: PILL_HOJD_PX, minWidth: 0, flex: '1 1 auto', padding: smal ? '0 14px' : '0 22px',
          border: 'none', background: 'transparent', color: '#f2f2f2', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: smal ? 16 : 19, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.2px' }}>
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
