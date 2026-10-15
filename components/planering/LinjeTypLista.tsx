'use client';

// Linjetyperna i Rita linje och Spåra med GPS: EN lista, två ställen (så de inte glider isär). Basväg är EN rad först; ett tryck på den fäller ut
// färgvalet (röd/gul/blå, senast valda förvald) och en knapp. Övriga linjetyper startar direkt. Stickvägar finns inte här — de görs i Snitsla stickvägar.

import React, { Fragment } from 'react';
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { basvagYta, type BasvagFarg } from '@/lib/basvag';
import { BasvagStart } from './BasvagFargVal';

export interface LinjeTyp { id: string; name: string; color: string; color2?: string; striped?: boolean; dashed?: boolean }

export function LinjeTypLista({ typer, steg, basvagOppen, basvagVal, onBasvagVal, onTryckBasvag, onStartaBasvag, startText, onVal }: {
  typer: readonly LinjeTyp[];
  /** 'rita' | 'spara' — bara för testid:n */
  steg: string;
  basvagOppen: boolean;
  basvagVal: BasvagFarg;
  onBasvagVal: (f: BasvagFarg) => void;
  onTryckBasvag: () => void;
  onStartaBasvag: () => void;
  startText: string;
  onVal: (t: LinjeTyp) => void;
}) {
  return (
    <div data-testid={`linje-lista-${steg}`} style={{ padding: AVSTAND.m }}>
      <div style={{ background: FARG.bg, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.sheet, padding: AVSTAND.s }}>
        {typer.map((type) => {
          const basvag = type.id === 'mainRoad';
          const bakgrund = basvag ? basvagYta()
            : type.striped ? `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} ${AVSTAND.s - 2}px, ${type.color2} ${AVSTAND.s - 2}px, ${type.color2} ${AVSTAND.l - 4}px)`
            : type.color;
          return (
            <Fragment key={type.id}>
              <div role="button" tabIndex={0} data-testid={`linje-rad-${type.id}`} aria-expanded={basvag ? basvagOppen : undefined}
                onClick={() => (basvag ? onTryckBasvag() : onVal(type))}
                style={{ minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.l, borderRadius: RADIE.rad, cursor: 'pointer' }}>
                <div style={{ width: AVSTAND.xxl * 2, height: AVSTAND.s, borderRadius: AVSTAND.xs, overflow: 'hidden', flexShrink: 0 }}>
                  {type.dashed ? (
                    <svg width={AVSTAND.xxl * 2} height={AVSTAND.s} aria-hidden="true" style={{ display: 'block' }}>
                      <line x1="0" y1={AVSTAND.s / 2} x2={AVSTAND.xxl * 2} y2={AVSTAND.s / 2} stroke={type.color} strokeWidth={AVSTAND.xs} strokeDasharray={`${AVSTAND.s},${AVSTAND.s - 2}`} strokeLinecap="round" />
                    </svg>
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: bakgrund }} />
                  )}
                </div>
                <span style={{ ...TYP.text, color: FARG.text }}>{type.name}</span>
              </div>
              {basvag && basvagOppen && <BasvagStart testid={`basvag-steg-${steg}`} valt={basvagVal} onVal={onBasvagVal} onStarta={onStartaBasvag} text={startText} />}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
