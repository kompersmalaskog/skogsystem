'use client';

// OM NÅGOT HÄNDER — ett tryck på larmraden i Hela trakten (Martin 2026-11-05: "jag kan inte komma tillbaka till listan").
// Koordinaten STORT så den går att läsa upp för SOS, var platsen är, en enkel rad om täckning, och "Visa på kartan"
// (kartan visar platsen med "‹ Lista" nertill). Lathunden med bilder kommer när företagets rutin är skriven — ingen påhittad text här.

import React from 'react';
import { AVSTAND, FARG, IKON, KNAPP, TYP } from '@/lib/design/tokens';
import { Gruppkort, Huvud } from './infoDelar';
import LarmPlatser, { LarmValjSjalv } from './LarmPlatser';
import type { LarmVisning } from '@/lib/larmpunkter';

export const LARM_TACKNING = 'Kolla att du har täckning här innan du börjar.';

export default function LarmVy({ koordinat, beskrivning, onVisa, visning, onVisaPlats, onTillbaka, onStang }: {
  koordinat: string; beskrivning: string; onVisa: () => void; onTillbaka: () => void; onStang: () => void;
  /** Flera larmplatser (lib/larmpunkter): den närmaste stort, eller alla när GPS saknas. */
  visning?: LarmVisning; onVisaPlats?: (index: number) => void;
}) {
  const flera = !!visning && !!onVisaPlats && visning.platser.length > 1;
  if (flera && visning!.valjSjalv) {
    return (
      <>
        <Huvud titel="Om något händer" tillbaka="Hela trakten" onTillbaka={onTillbaka} onStang={onStang} />
        <div data-testid="larm-vy" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
          <Gruppkort>
            <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.l}px 0`, display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel, color: FARG.rod }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod }}>emergency</span>
              Ring 112 och läs upp larmkoordinaten
            </div>
            <LarmValjSjalv />
            <LarmPlatser larm={visning!} onVisa={onVisaPlats!} />
          </Gruppkort>
          {beskrivning && <div data-testid="larm-beskrivning" style={{ ...TYP.text, color: FARG.text }}>{beskrivning}</div>}
          <div data-testid="larm-tackning" style={{ ...TYP.text, color: FARG.text2 }}>{LARM_TACKNING}</div>
        </div>
      </>
    );
  }
  return (
    <>
      <Huvud titel="Om något händer" tillbaka="Hela trakten" onTillbaka={onTillbaka} onStang={onStang} />
      <div data-testid="larm-vy" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <Gruppkort>
          <div style={{ padding: `${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel, color: FARG.rod }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod }}>emergency</span>
              Ring 112 och läs upp larmkoordinaten
            </div>
            {visning && (visning.narmast || visning.namn) && <div data-testid="larm-namn" style={{ ...TYP.text, color: FARG.text2 }}>{[visning.narmast, visning.namn].filter(Boolean).join(' · ')}</div>}
            {visning?.kontroll && <div data-testid="larm-kontroll" style={{ ...TYP.text, color: visning.kontroll.ton === 'gron' ? FARG.gron : FARG.orange }}>{visning.kontroll.text}</div>}
            <div data-testid="larm-koordinat" style={{ ...TYP.tal, color: FARG.text, overflowWrap: 'anywhere', userSelect: 'text' }}>{koordinat}</div>
            {beskrivning && <div data-testid="larm-beskrivning" style={{ ...TYP.text, color: FARG.text }}>{beskrivning}</div>}
          </div>
        </Gruppkort>
        <div data-testid="larm-tackning" style={{ ...TYP.text, color: FARG.text2 }}>{LARM_TACKNING}</div>
        <button type="button" data-testid="larm-visa" onClick={onVisa} style={KNAPP.primar}>Visa på kartan</button>
        {flera && (
          <section data-testid="larm-andra">
            <div style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.l}px` }}>Alla larmplatser på trakten</div>
            <Gruppkort><LarmPlatser larm={visning!} onVisa={onVisaPlats!} forstaRad /></Gruppkort>
          </section>
        )}
      </div>
    </>
  );
}
