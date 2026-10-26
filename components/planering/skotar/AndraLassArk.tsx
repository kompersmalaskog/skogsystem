'use client';

// LASSKORTET (Ändra) — registreringen börjar här: tryck på "Lossa · Avlägg 2" öppnar det med sortimenten ifyllda som förra lasset; − / + per m³, Klar sparar.
// Avbryt på ett nytt lass (utkast) kastar det — inget har sparats. För en stor pekskärm i en skakande hytt, utan handskar (mockupen).
//   • Ett centrerat ark, ca 640 px brett (smal skärm: full bredd minus marginal). Avlägget överst med Byt ›, totalen uppe till höger, Avbryt / Klar nederst.
//   • En rad per sortiment, minst 56 px hög: namn i två nivåer (sortimentet vitt, mottagaren grå) · [ − ] siffra [ + ], knapparna 56×56.
//   • − / + ger ETT steg per tryck (ingen upprepning, spärr mot studs). Tryck på siffran öppnar en stor sifferknappsats (0–9, radera, Klar) som ersätter värdet.
//   • Lägg till: ett rutnät (2–3 kolumner) med knappar ≥ 56 px; fler än 8 sortiment → de 8 vanligaste och en knapp "Fler ›".
// Valen är traktens egna sortiment med skördarens namn. Raden på 0 försvinner.

import React, { useState } from 'react';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { avlaggRubrik } from '@/lib/skotarLass/avlagg';
import { kanBekrafta, lassTitel, totalM3, heltM3 } from '@/lib/skotarLass/lassModell';
import type { Avlagg, Lass, SortimentRad } from '@/lib/skotarLass/typer';
import { arkPanel, arkRam, avdelare, knappPrimar, knappStor, meta, smaRubrik, TRYCK_PX } from './stil';
import { SortimentNamn } from './SortimentNamn';
import { SiffraKnapp, SifferPlatta, StegKnapp } from './StegKnapp';
import { medSafeBotten } from '@/lib/design/tokens';

/** Så många sortiment visas direkt under Lägg till; resten ligger bakom "Fler ›". */
export const TILLAGG_SYNLIGA = 8;

export function AndraLassArk({ lass, delNr, utkast, avlagg, valbara, alla, onLasOm, onRad, onAvlagg, onKlar, onAvbryt, onTaBort }: {
  lass: Lass;
  /** Lasset är ett nytt utkast (inte sparat än): Avbryt kastar det, så "ta bort lasset" behövs inte. */
  utkast?: boolean;
  delNr: number;
  avlagg: readonly Avlagg[];
  /** Traktens sortiment (skördarens namn, vanligaste först) + Ved markägare när trakten har det. */
  valbara: readonly SortimentRad[];
  /** HELA listan (traktens + objektets + senaste 12 månadernas + Ved markägare). "Fler sortiment…" visar den, så föraren aldrig fastnar. Utan den gäller `valbara`. */
  alla?: readonly SortimentRad[];
  /** Försök läsa sortimentlistan igen (när ingenting gick att läsa alls). */
  onLasOm?: () => void;
  onRad: (rad: Pick<SortimentRad, 'nyckel' | 'namn'>, delta: number) => void;
  onAvlagg: (a: Avlagg) => void;
  onKlar: () => void;
  onAvbryt: () => void;
  onTaBort: () => void;
}) {
  const [avlaggVal, setAvlaggVal] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [fler, setFler] = useState(false);
  const [skriver, setSkriver] = useState<SortimentRad | null>(null);   // raden vars värde skrivs på sifferknappsatsen
  const del = lass.delar.find((d) => d.delNr === delNr) ?? lass.delar[0];
  const rader = del.rader;
  const finns = new Set(rader.map((r) => r.nyckel));
  const tillagg = valbara.filter((v) => !finns.has(v.nyckel));
  const primara = new Set(valbara.map((v) => v.nyckel));
  const ovriga = (alla ?? valbara).filter((v) => !finns.has(v.nyckel) && !primara.has(v.nyckel));
  const synliga = fler ? [...tillagg, ...ovriga] : tillagg.slice(0, TILLAGG_SYNLIGA);
  // Det som ligger "nedan": inget alls betyder att listan inte gick att läsa (då står det, med Försök igen) — aldrig en hänvisning till ett tomt ställe.
  const nedan = tillagg.length + ovriga.length;
  const listaSaknas = (alla ?? valbara).length === 0;
  const sum = totalM3(rader);
  const klarKan = kanBekrafta(lass);

  // Sifferknappsatsen ersätter arkets innehåll (inget tangentbord från Windows/iOS): Klar skickar skillnaden mot dagens värde som ETT steg, Avbryt rör inget.
  if (skriver) {
    const rad = rader.find((r) => r.nyckel === skriver.nyckel) ?? skriver;
    return (
      <div style={{ ...arkRam, padding: `0 ${AVSTAND.m}px`, boxSizing: 'border-box' }}>
        <div data-testid="andra-lass" style={{ ...arkPanel, maxWidth: 640, paddingBottom: medSafeBotten(AVSTAND.s) }}>
          <SifferPlatta namn={rad.namn} varde={heltM3(rad.m3)}
            onAvbryt={() => setSkriver(null)}
            onKlar={(n) => { setSkriver(null); if (n != null) { const d = n - heltM3(rad.m3); if (d !== 0) onRad(rad, d); } }} />
        </div>
      </div>
    );
  }

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
          {rader.length === 0 && !listaSaknas && <div style={{ ...meta, padding: `${AVSTAND.s}px 0` }}>Inga sortiment ännu — lägg till nedan.</div>}
          {rader.map((r) => (
            <div key={r.nyckel} data-testid={`andra-rad-${r.nyckel}`} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRYCK_PX, marginBottom: AVSTAND.s }}>
              <div style={{ flex: 1, minWidth: 0 }}><SortimentNamn namn={r.namn} /></div>
              <StegKnapp tecken="−" etikett={`Ett m³ mindre ${r.namn}`} testid={`minus-${r.nyckel}`} onSteg={() => onRad(r, -1)} />
              <SiffraKnapp varde={heltM3(r.m3)} etikett={r.namn} testid={`andra-siffra-${r.nyckel}`} onOppna={() => setSkriver(r)} />
              <StegKnapp tecken="+" etikett={`Ett m³ mer ${r.namn}`} testid={`plus-${r.nyckel}`} onSteg={() => onRad(r, +1)} />
            </div>
          ))}

          {listaSaknas ? (
            <>
              <div style={avdelare} />
              <div data-testid="sortiment-saknas" style={{ ...meta, padding: `${AVSTAND.s}px 0` }}>Sortimentlistan gick inte att läsa just nu.</div>
              {onLasOm && (
                <button type="button" data-testid="tillagg-lasom" onClick={onLasOm}
                  style={{ ...knappStor, width: '100%', minHeight: TRYCK_PX, background: FARG.fyllning, color: FARG.text }}>Försök igen</button>
              )}
            </>
          ) : (
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
                {/* ALLTID kvar medan listan är hopfälld: hela listan är ett tryck bort, även när den korta råkar vara tom eller fel. */}
                {!fler && (
                  <button type="button" data-testid="tillagg-fler" onClick={() => setFler(true)}
                    style={{ ...knappStor, width: '100%', minHeight: TRYCK_PX, gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: FARG.text }}>
                    Fler sortiment…{nedan > synliga.length ? ` (${nedan - synliga.length})` : ''}
                  </button>
                )}
              </div>
            </>
          )}

          {!utkast && (
            <>
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
            </>
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
