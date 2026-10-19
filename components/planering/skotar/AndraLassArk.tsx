'use client';

// ÄNDRA LASSET: en rad per sortiment — namn, [ − ] m³ [ + ] (1 m³ per tryck), summan överst. Valen är traktens egna sortiment med skördarens namn.
// Raden på 0 försvinner. "+ <sortiment>" lägger till ett sortiment som lasset inte har. Avlägget visas och går att byta. Avbryt / Klar.

import React, { useState } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { avlaggRubrik } from '@/lib/skotarLass/avlagg';
import { kanBekrafta, lassTitel, totalM3, heltM3 } from '@/lib/skotarLass/lassModell';
import { sortimentVisning, VED_MARKAGARE_NYCKEL } from '@/lib/skotarLass/sortiment';
import type { Avlagg, Lass, SortimentRad } from '@/lib/skotarLass/typer';
import { arkPanel, arkRam, avdelare, knappPrimar, knappStor, meta, TRYCK_PX } from './stil';
import { medSafeBotten } from '@/lib/design/tokens';

const Steg = ({ tecken, etikett, onTryck, inaktiv, testid }: { tecken: string; etikett: string; onTryck: () => void; inaktiv?: boolean; testid: string }) => (
  <button type="button" aria-label={etikett} data-testid={testid} onClick={onTryck} disabled={inaktiv}
    style={{ width: TRYCK_PX, height: TRYCK_PX, borderRadius: RADIE.knapp, border: 'none', background: FARG.fyllning, color: FARG.text, ...TYP.rubrik, fontFamily: 'inherit', cursor: 'pointer', opacity: inaktiv ? 0.4 : 1, flexShrink: 0 }}>
    {tecken}
  </button>
);

export function AndraLassArk({ lass, delNr, avlagg, valbara, onRad, onAvlagg, onKlar, onAvbryt, onTaBort }: {
  lass: Lass;
  delNr: number;
  avlagg: readonly Avlagg[];
  /** Traktens sortiment (skördarens namn) + Ved markägare när trakten har det. */
  valbara: readonly SortimentRad[];
  onRad: (rad: Pick<SortimentRad, 'nyckel' | 'namn'>, delta: number) => void;
  onAvlagg: (a: Avlagg) => void;
  onKlar: () => void;
  onAvbryt: () => void;
  onTaBort: () => void;
}) {
  const [avlaggVal, setAvlaggVal] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const del = lass.delar.find((d) => d.delNr === delNr) ?? lass.delar[0];
  const rader = del.rader;
  const finns = new Set(rader.map((r) => r.nyckel));
  const tillagg = valbara.filter((v) => !finns.has(v.nyckel));
  const sum = totalM3(rader);
  const klarKan = kanBekrafta(lass);

  return (
    <div style={arkRam}>
      <div data-testid="andra-lass" role="dialog" aria-label={`Ändra ${lassTitel(lass, delNr)}`} style={arkPanel}>
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
            <div key={r.nyckel} data-testid={`andra-rad-${r.nyckel}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRYCK_PX + AVSTAND.s }}>
              <div style={{ flex: 1, minWidth: 0, ...TYP.listtitel, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sortimentVisning(r.namn)}</div>
              <Steg tecken="−" etikett={`Ett m³ mindre ${sortimentVisning(r.namn)}`} testid={`minus-${r.nyckel}`} onTryck={() => onRad(r, -1)} />
              <div style={{ width: 56, textAlign: 'center', ...TYP.rubrik, ...TNUM }}>{heltM3(r.m3)}</div>
              <Steg tecken="+" etikett={`Ett m³ mer ${sortimentVisning(r.namn)}`} testid={`plus-${r.nyckel}`} onTryck={() => onRad(r, +1)} />
            </div>
          ))}

          {tillagg.length > 0 && (
            <>
              <div style={avdelare} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                {tillagg.map((v) => (
                  <button key={v.nyckel} type="button" data-testid={`tillagg-${v.nyckel}`} onClick={() => onRad(v, +1)}
                    style={{ ...knappStor, width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', background: 'transparent', color: FARG.text }}>
                    + {v.nyckel === VED_MARKAGARE_NYCKEL ? 'Ved markägare' : sortimentVisning(v.namn)}
                  </button>
                ))}
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
