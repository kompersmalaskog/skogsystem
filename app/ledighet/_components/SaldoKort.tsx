'use client';

import React from 'react';
import { C, ff, kortStyle, labelStyle } from './tema';
import { fmtTidpunkt } from './datum';
import type { Saldo } from './typer';

function fmtTal(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

/**
 * Två saldokort — värdena kommer LAGRADE ur medarbetare_saldo (manuellt/Fortnox),
 * aldrig beräknade ur ansökningar. NULL betyder "okänt", aldrig 0.
 *
 * Tre olika "tomt" som aldrig får blandas ihop:
 *  - `saldoLasfel`: läsningen FELADE — vi vet inget. Kortet säger det, och påstår
 *    inte "Kopplas via Fortnox" / "Inte satt ännu" (det är kunskap vi inte har).
 *  - `saldoSaknas`: läsningen gick bra men raden finns inte (nyanställd utan seed).
 *  - NULL i fältet: raden finns, admin har inte satt värdet / Fortnox är inte kopplat.
 */
export default function SaldoKort({ saldo, saldoSaknas, saldoLasfel = false }: { saldo: Saldo | null; saldoSaknas: boolean; saldoLasfel?: boolean }) {
  const uppdaterad = saldo ? `uppdaterad ${fmtTidpunkt(saldo.uppdaterad_at)}` : null;

  const tomText = (text: string, hint: string) => (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.t2, lineHeight: 1.3, marginTop: 4 }}>{text}</div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{hint}</div>
    </>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontFamily: ff }}>
      {/* ATK — timmar */}
      <div style={kortStyle}>
        <div style={labelStyle}>ATK KVAR</div>
        {saldoLasfel ? (
          tomText('Kunde inte läsas', 'ladda om appen')
        ) : saldoSaknas ? (
          tomText('Saldo saknas', 'be admin lägga upp dig')
        ) : saldo?.atk_timmar_kvar == null ? (
          tomText('Kopplas via Fortnox', 'ingen siffra ännu')
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.t1, lineHeight: 1.1 }}>
              {fmtTal(saldo.atk_timmar_kvar)}<span style={{ fontSize: 14, fontWeight: 400, color: C.t3 }}> h</span>
            </div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{uppdaterad}</div>
          </>
        )}
      </div>

      {/* Semester — dagar */}
      <div style={kortStyle}>
        <div style={labelStyle}>SEMESTER KVAR</div>
        {saldoLasfel ? (
          tomText('Kunde inte läsas', 'ladda om appen')
        ) : saldoSaknas ? (
          tomText('Saldo saknas', 'be admin lägga upp dig')
        ) : saldo?.semester_dagar_kvar == null ? (
          tomText('Inte satt ännu', 'admin sätter ditt saldo')
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.t1, lineHeight: 1.1 }}>
              {fmtTal(saldo.semester_dagar_kvar)}<span style={{ fontSize: 14, fontWeight: 400, color: C.t3 }}> dagar</span>
            </div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{uppdaterad}</div>
          </>
        )}
      </div>
    </div>
  );
}
