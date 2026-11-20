// Egenkontrollens position: bedomPosition avgor om positionen duger, avstandPerPunkt raknar avstand och riktning till planpunkterna.
//
// ALLT HAR AR RENT - ingen React, ingen karta, ingen databas - sa att reglerna
// gar att testa utan en webblasare. Sidan (app/egenkontroll/[objektId]/page.tsx)
// och positionskroken (app/egenkontroll/useMinPosition.ts) anropar bara dessa.
//
// Kortflodet (narmaste obesvarade, serien, tillstand 1-3) ar borta sedan ramen (PR 4): inget markeras av sig sjalvt och inget gar vidare
// av sig sjalvt. Det som finns kvar ar positionen och avstandet som raden i dockan visar for en markerad planpunkt.

import { punktPlatser, type EgenkontrollPunkt } from './egenkontroll';
import { avstandM, riktning } from './provytor';
import type { LatLng, Origo } from './kartkoordinater';

// ---------------------------------------------------------------------------
// Positionen
// ---------------------------------------------------------------------------

/** Samre an sa raknas som ingen position. En gissad ordning ar varre an ingen. */
export const POSITION_MAX_NOGGRANNHET_M = 100;
/** Sa lange vantar vi pa FORSTA fixen innan vi sager att positionen saknas. */
export const FORSTA_FIX_MS = 10_000;
/** En position aldre an sa ar inte langre var man ar. */
export const FIX_GAMMAL_MS = 60_000;

export type Fix = { lat: number; lng: number; noggrannhet: number | null; t: number };
export type PositionFelKod = 'nekad' | 'ej_stod' | null;
export type PositionStatus = 'soker' | 'ok' | 'saknas';
export type PositionSkal = 'nekad' | 'ej_stod' | 'tidsgrans' | 'otillracklig' | 'gammal';

export type PositionsBedomning = {
  status: PositionStatus;
  /** Bara satt nar status === 'ok'. Aldrig en position som inte dugar. */
  position: { lat: number; lng: number; noggrannhet: number | null } | null;
  skal: PositionSkal | null;
};

/**
 * Duger positionen? EN funktion, sa kartan, kortet och listan aldrig kan vara
 * oense om saken. noggrannhet null = okand, och da gar det inte att doma - den
 * far galla.
 */
export function bedomPosition(
  fix: Fix | null,
  felKod: PositionFelKod,
  forstaFixTidUte: boolean,
  nu: number,
): PositionsBedomning {
  if (felKod === 'nekad') return { status: 'saknas', position: null, skal: 'nekad' };
  if (felKod === 'ej_stod') return { status: 'saknas', position: null, skal: 'ej_stod' };
  if (!fix) {
    return forstaFixTidUte
      ? { status: 'saknas', position: null, skal: 'tidsgrans' }
      : { status: 'soker', position: null, skal: null };
  }
  if (nu - fix.t > FIX_GAMMAL_MS) return { status: 'saknas', position: null, skal: 'gammal' };
  if (fix.noggrannhet != null && fix.noggrannhet > POSITION_MAX_NOGGRANNHET_M) {
    return { status: 'saknas', position: null, skal: 'otillracklig' };
  }
  return {
    status: 'ok',
    position: { lat: fix.lat, lng: fix.lng, noggrannhet: fix.noggrannhet },
    skal: null,
  };
}

/** Meningen ur briefen, ordagrant - och en rad som sager VARFOR. */
export const UTAN_POSITION_MENING = 'Utan din position går det inte att säga vad som är närmast.';

export function positionSkalText(skal: PositionSkal | null, noggrannhetM?: number | null): string {
  switch (skal) {
    case 'nekad': return 'Appen får inte använda din plats. Tillåt det i telefonens inställningar.';
    case 'ej_stod': return 'Den här enheten kan inte ge någon position.';
    case 'tidsgrans': return 'Ingen position hittades.';
    case 'otillracklig':
      return noggrannhetM != null
        ? `Positionen är för osäker (±${Math.round(noggrannhetM)} m).`
        : 'Positionen är för osäker.';
    case 'gammal': return 'Positionen är för gammal.';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Avstand
// ---------------------------------------------------------------------------

export type AvstandRad = { m: number; r: string };

/**
 * Avstand och riktning per planpunkt. En LINJE eller zon matas till sin
 * narmaste brytpunkt. Punkter utan plats (ingen geometri, eller inget origo)
 * far ingen post - de gissas aldrig in.
 */
export function avstandPerPunkt(
  planpunkter: EgenkontrollPunkt[],
  origo: Origo | null,
  pos: LatLng | null,
): Map<string, AvstandRad> {
  const karta = new Map<string, AvstandRad>();
  if (!origo || !pos) return karta;
  for (const p of planpunkter) {
    let bast: AvstandRad | null = null;
    for (const plats of punktPlatser(p, origo)) {
      const m = avstandM(pos, plats);
      if (!bast || m < bast.m) bast = { m, r: riktning(pos, plats) };
    }
    if (bast) karta.set(p.id, bast);
  }
  return karta;
}
