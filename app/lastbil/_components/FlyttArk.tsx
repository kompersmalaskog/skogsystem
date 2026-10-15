'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { FLYTT_TIMDEBITERING_KM } from '@/lib/faktura/radbyggare';
import StrykArk from './StrykArk';
import { fmtDatum } from './nu';
import { fmtKm, kmAndringsText, kundAndringsText, type UnderlagRad } from './fakturerbart';

/** "46,6" → 46.6; tomt eller skräp → null (ogiltigt). */
export function tolkaKm(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Vilken artikel km avgör — samma gräns som radbyggaren: till och med 30 km fast belopp, däröver per timme. */
const pris = (km: number): 'fast' | 'tid' => (km <= FLYTT_TIMDEBITERING_KM ? 'fast' : 'tid');

/** Ett rättat km som korsar 30-gränsen byter artikel på fakturan — det ska stå innan man sparar. */
export function gransText(fore: number | null, nu: number | null): string | null {
  if (fore == null || nu == null || pris(fore) === pris(nu)) return null;
  return nu > FLYTT_TIMDEBITERING_KM
    ? `Över ${FLYTT_TIMDEBITERING_KM} km faktureras flytten på tid (artikel 3). Timmarna skriver du in på trakten.`
    : `Upp till ${FLYTT_TIMDEBITERING_KM} km är flytten ett fast belopp per maskin (artikel 5).`;
}

/**
 * Flytten: rätta km och kund innan den godkänns (eller medan den ligger hos faktureringen). Valfritt —
 * en flytt som stämmer godkänns med ett tryck på raden, utan att öppna det här. Spara är grå tills något
 * ändrats (dirty-state hör hemma på knappen). Stryk finns bara för en flytt som ännu inte godkänts, och
 * leder vidare till Stryk-arket där anledningen är obligatorisk.
 */
export default function FlyttArk({ rad, maskin, stracka, datum, sparar, fel, kanStryka, onSpara, onStryk, onStang }: {
  rad: UnderlagRad; maskin: string; stracka: string; datum: string; sparar: boolean; fel: string | null; kanStryka: boolean;
  onSpara: (falt: { km?: number; kund?: string | null }) => void;
  onStryk: (anledning: string) => void; onStang: () => void;
}) {
  const [km, setKm] = useState(rad.km == null ? '' : String(rad.km).replace('.', ','));
  const [kund, setKund] = useState(rad.kund ?? '');
  const [stryker, setStryker] = useState(false);

  if (stryker) {
    return <StrykArk rad={rad} maskin={maskin} stracka={stracka} datum={datum} sparar={sparar} fel={fel} onStryk={onStryk} onStang={onStang} />;
  }

  const nyKm = tolkaKm(km);
  const kmOk = km.trim() === '' ? rad.km == null : nyKm != null;     // tomt går bara om km redan saknades
  const kmAndrat = nyKm != null && (rad.km == null || Math.abs(nyKm - rad.km) > 1e-9);
  const kundNy = kund.trim() || null;
  const kundAndrat = kundNy !== ((rad.kund ?? '').trim() || null);
  const klar = kmOk && (kmAndrat || kundAndrat) && !sparar;
  const grans = kmAndrat ? gransText(rad.km, nyKm) : null;
  const kmFore = kmAndringsText(rad), kundFore = kundAndringsText(rad);

  function spara() {
    const falt: { km?: number; kund?: string | null } = {};
    if (kmAndrat && nyKm != null) falt.km = nyKm;
    if (kundAndrat) falt.kund = kundNy;
    onSpara(falt);
  }

  const faltStil = { ...TYP.text, ...TNUM, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: AVSTAND.m, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, minHeight: 44 };

  return (
    <Ark rubrik="Flytten" onStang={onStang}
      fot={(
        <>
          {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
          <button type="button" disabled={!klar} onClick={spara}
            style={{ ...KNAPP.primar, ...(klar ? {} : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Spara ändring'}
          </button>
          {kanStryka && (
            <button type="button" onClick={() => setStryker(true)} disabled={sparar} style={KNAPP.destruktiv}>Stryk flytten …</button>
          )}
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <div>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{maskin}</div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{stracka}</div>
          <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{datum}</div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.micro, color: FARG.text2 }}>Sträcka (km)</span>
          <input value={km} onChange={e => setKm(e.target.value)} inputMode="decimal" aria-label="Sträcka i km" style={faltStil} />
          {kmFore && rad.km_original != null && <span style={{ ...TYP.meta, color: FARG.orange }}>Original: {fmtKm(rad.km_original)} km</span>}
          {kmFore && rad.km_original == null && <span style={{ ...TYP.meta, color: FARG.orange }}>Km saknades när flytten registrerades</span>}
          {km.trim() !== '' && nyKm == null && <span role="alert" style={{ ...TYP.meta, color: FARG.rod }}>Skriv km som ett tal större än noll.</span>}
          {grans && <span role="note" style={{ ...TYP.meta, color: FARG.text2 }}>{grans}</span>}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.micro, color: FARG.text2 }}>Kund (valfritt)</span>
          <input value={kund} onChange={e => setKund(e.target.value)} aria-label="Kund" placeholder="saknas i datan" style={{ ...faltStil, ...TYP.text }} />
          {kundFore && <span style={{ ...TYP.meta, color: FARG.orange }}>Original: {rad.kund_original?.trim() || 'saknades'}</span>}
        </label>

        {rad.redigerad_tid && (
          <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>
            Senast ändrad av {rad.redigerad_av ?? 'okänd'} {fmtDatum(rad.redigerad_tid)}. Originalet ligger kvar och visas bredvid det ändrade värdet.
          </p>
        )}
      </div>
    </Ark>
  );
}
