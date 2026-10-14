'use client';

import React, { useState } from 'react';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TYP, overgang } from '@/lib/design/tokens';
import { TYPINFO } from './tema';
import { arbetsdagar, fmtDatum, fmtPeriod } from './datum';
import { rodVardagNamn } from '@/lib/franvaro';
import type { Ansokan } from './typer';
import { Ikon, KORT_TEXTKNAPP, Status } from './delar';

/** "2 arbetsdagar · Semester" resp. "8 timmar · ATK" (ATK räknas i timmar). */
function fmtLangdTyp(a: Ansokan): string {
  const ad = arbetsdagar(a.startdatum, a.slutdatum);
  if (a.typ === 'atk') {
    const h = ad * 8;
    return `${h} timm${h === 1 ? 'e' : 'ar'} · ATK`;
  }
  return `${ad} arbetsdag${ad === 1 ? '' : 'ar'} · ${TYPINFO[a.typ]?.label ?? a.typ}`;
}

/** Status som prick + ord. En nyans per status; ordet bär, färgen förstärker. */
function statusAv(a: Ansokan, tidigare: boolean): { ord: string; farg: string } {
  if (a.status === 'godkänd') return tidigare ? { ord: 'Togs ut', farg: FARG.text2 } : { ord: 'Godkänd', farg: FARG.gron };
  if (a.status === 'nekad') return { ord: 'Nekad', farg: FARG.rod };
  // Anmäld i morgonkortet (sjuk/vab/föräldraledig) — ingen godkännare, gäller direkt
  if (a.status === 'registrerad') return { ord: 'Registrerad', farg: tidigare ? FARG.text2 : FARG.gron };
  return { ord: 'Väntar', farg: FARG.orange };
}

/**
 * En ansökan som RAD i en grupp (iOS-inset): perioden är rubriken, status står som prick + ord.
 * Egen väntande kan ändras/tas bort; godkänd är låst och SÄGER det i stället för att visa tomt.
 *
 * Bekräftelsen är inline ("Nej / Ja, ta bort", som PeriodForm) — aldrig window.confirm. Gäller
 * både Ta bort (egen väntande) och Neka (godkännare): båda är beslut som inte går att ångra här.
 * Själva åtgärden (`onTaBort`/`onHantera`) körs av föräldern, exakt som förut.
 */
export default function AnsokanRad({
  a, visaNamn = false, arEgen = false, tidigare = false, sista = false,
  onRedigera, onTaBort, onHantera, hanterar = false, domId, markerad = false, dolStatus = false,
}: {
  a: Ansokan;
  visaNamn?: boolean;
  arEgen?: boolean;
  tidigare?: boolean;
  sista?: boolean;
  onRedigera?: (a: Ansokan) => void;
  onTaBort?: (a: Ansokan) => void;
  onHantera?: (a: Ansokan, status: 'godkänd' | 'nekad') => void;
  hanterar?: boolean;
  /** Ankare för scroll ur en push-notis (unikt per plats: samma ansökan kan stå i två listor). */
  domId?: string;
  /** Markerad en stund efter att en notis tagit dig hit; tonar ut när den blir false. */
  markerad?: boolean;
  /** Dölj statusordet: i godkänn-listan väntar alla rader, så "Väntar" på varje rad är bara brus. */
  dolStatus?: boolean;
}) {
  const [bekrafta, setBekrafta] = useState<null | 'bort' | 'neka'>(null);
  const status = statusAv(a, tidigare);
  const kanAndras = arEgen && a.status === 'väntar';
  const textfarg = tidigare ? FARG.text2 : FARG.text;
  const knappText = { ...KNAPP.tertiar, ...KORT_TEXTKNAPP, ...TYP.text, color: FARG.text };

  const bekraftaRad = (fraga: string, jaText: string, ja: () => void) => (
    <div className="tona-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{fraga}</span>
      <div style={{ display: 'flex', gap: AVSTAND.l }}>
        <button onClick={() => setBekrafta(null)} style={knappText}>Nej</button>
        <button onClick={() => { setBekrafta(null); ja(); }} style={{ ...KNAPP.destruktiv, ...KORT_TEXTKNAPP }}>{jaText}</button>
      </div>
    </div>
  );

  return (
    <div id={domId} data-markerad={markerad ? 'true' : undefined}
      style={{ position: 'relative', padding: `${AVSTAND.m}px 0`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      {/* Markeringen ligger ÖVANPÅ och rör inte layouten (inga marginaler som hoppar när den tonar ut). */}
      <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: -AVSTAND.s, right: -AVSTAND.s, borderRadius: RADIE.rad, pointerEvents: 'none',
        background: markerad ? FARG.fyllning : 'transparent', transition: overgang('background-color') }} />
      {visaNamn && <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>{a.anvandare_id}</p>}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.s }}>
        {/* Perioden är rubriken — det man letar efter */}
        <span style={{ ...TYP.listtitel, ...TNUM, color: textfarg }}>{fmtPeriod(a.startdatum, a.slutdatum)}</span>
        {!dolStatus && <Status ord={status.ord} farg={status.farg} />}
      </div>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{fmtLangdTyp(a)}</p>

      {/* Deldag (sjuk från 11:30): dagen är arbete OCH frånvaro — säg klockslaget */}
      {(a.fran_tid || a.till_tid) && (
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          Del av dag — {a.fran_tid ? `från ${String(a.fran_tid).slice(0, 5)}` : ''}{a.fran_tid && a.till_tid ? ' ' : ''}{a.till_tid ? `till ${String(a.till_tid).slice(0, 5)}` : ''}. Förmiddagen räknas som arbete.
        </p>
      )}
      {/* Bytesdag (skoftning §5 mom 4): vilken röd dag som arbetas i stället.
          Godkännaren ska se det utan att öppna något. */}
      {a.typ === 'inarbetad' && a.ersatter_datum && (
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          Ersätter {rodVardagNamn(a.ersatter_datum) ?? 'röd dag'} {fmtDatum(a.ersatter_datum)} — jobbar den, ledig här. Helglönen flyttas inte.
        </p>
      )}
      {a.kommentar && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>&quot;{a.kommentar}&quot;</p>}

      {/* Egen väntande: Ändra / Ta bort (44 px träffyta) */}
      {kanAndras && (onRedigera || onTaBort) && (bekrafta === 'bort'
        ? bekraftaRad('Ta bort ansökan?', 'Ja, ta bort', () => onTaBort?.(a))
        : (
          <div style={{ display: 'flex', gap: AVSTAND.xl, marginTop: AVSTAND.xs }}>
            {onRedigera && <button onClick={() => onRedigera(a)} style={knappText}>Ändra</button>}
            {onTaBort && (
              <button onClick={() => setBekrafta('bort')} style={KNAPP.destruktiv}>
                <Ikon namn="delete" />Ta bort
              </button>
            )}
          </div>
        ))}

      {/* Godkänd (kommande) är låst — det säger GRUPPEN en gång (MigVy, `not` på Grupp), inte varje rad. */}

      {/* Godkännar-läge (väntande i godkänn-listan): Godkänn är sekundär, Neka destruktiv + bekräftelse */}
      {onHantera && a.status === 'väntar' && (bekrafta === 'neka'
        ? bekraftaRad('Neka ansökan?', 'Ja, neka', () => onHantera(a, 'nekad'))
        : (
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l, marginTop: AVSTAND.s, ...(hanterar ? INAKTIV : {}) }}>
            <button disabled={hanterar} onClick={() => onHantera(a, 'godkänd')} style={{ ...KNAPP.sekundar, flex: 1, width: 'auto' }}>Godkänn</button>
            <button disabled={hanterar} onClick={() => setBekrafta('neka')} style={{ ...KNAPP.destruktiv, flex: 1, justifyContent: 'center' }}>Neka</button>
          </div>
        ))}
    </div>
  );
}
