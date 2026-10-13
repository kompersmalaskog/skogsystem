'use client';

import React from 'react';
import { AVSTAND, FARG, KNAPP, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { fmtTidpunkt } from './datum';
import type { Saldo } from './typer';

function fmtTal(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

/**
 * Saldot: SEMESTER är vyns huvudtal (stort), ATK en lugn rad under. Värdena kommer LAGRADE
 * ur medarbetare_saldo (manuellt/Fortnox), aldrig beräknade ur ansökningar. NULL betyder
 * "okänt", aldrig 0.
 *
 * Tre olika "tomt" som aldrig får blandas ihop:
 *  - `saldoLasfel`: läsningen FELADE — vi vet inget. Kortet säger det, och påstår
 *    inte "Kopplas via Fortnox" / "Inte satt ännu" (det är kunskap vi inte har).
 *  - `saldoSaknas`: läsningen gick bra men raden finns inte (nyanställd utan seed).
 *  - NULL i fältet: raden finns, admin har inte satt värdet / Fortnox är inte kopplat.
 */
export default function SaldoKort({
  saldo, saldoSaknas, saldoLasfel = false, onForsok,
}: { saldo: Saldo | null; saldoSaknas: boolean; saldoLasfel?: boolean; onForsok?: () => void }) {
  const uppdaterad = saldo ? `uppdaterad ${fmtTidpunkt(saldo.uppdaterad_at)}` : null;

  const semester = (() => {
    if (saldoLasfel) {
      return (
        <>
          <p style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>Kunde inte läsas</p>
          {onForsok && <button onClick={onForsok} style={{ ...KNAPP.tertiar, marginTop: AVSTAND.xs }}>Försök igen</button>}
        </>
      );
    }
    if (saldoSaknas) {
      return (
        <>
          <p style={{ margin: 0, ...TYP.rubrik, color: FARG.text2 }}>Saldo saknas</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>be admin lägga upp dig</p>
        </>
      );
    }
    if (saldo?.semester_dagar_kvar == null) {
      return (
        <>
          <p style={{ margin: 0, ...TYP.rubrik, color: FARG.text2 }}>Inte satt ännu</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>admin sätter ditt saldo</p>
        </>
      );
    }
    return (
      <>
        <p style={{ margin: 0, ...TYP.tal, color: FARG.text }}>
          {fmtTal(saldo.semester_dagar_kvar)} <span style={{ ...TYP.rubrik, color: FARG.text2, fontWeight: TYP.listtitel.fontWeight }}>dagar</span>
        </p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{uppdaterad}</p>
      </>
    );
  })();

  const atk = (() => {
    if (saldoLasfel) return <span style={{ ...TYP.meta, color: FARG.text }}>Kunde inte läsas</span>;
    if (saldoSaknas) return <span style={{ ...TYP.meta, color: FARG.text2 }}>Saldo saknas</span>;
    if (saldo?.atk_timmar_kvar == null) return <span style={{ ...TYP.meta, color: FARG.text2 }}>Kopplas via Fortnox</span>;
    return <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{fmtTal(saldo.atk_timmar_kvar)} h</span>;
  })();

  return (
    <section style={{ ...KORT, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xs }}>
      <div style={{ textAlign: 'center', paddingBottom: AVSTAND.l }}>
        <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.text2 }}>Semester kvar</p>
        {semester}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>ATK kvar</span>
        {atk}
      </div>
    </section>
  );
}
