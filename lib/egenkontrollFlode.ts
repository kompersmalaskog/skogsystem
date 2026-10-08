// Egenkontrollens flode: kartan ar huvudsaken, listan stodet.
//
// ALLT HAR AR RENT - ingen React, ingen karta, ingen databas - sa att reglerna
// gar att testa utan en webblasare. Sidan (app/egenkontroll/[objektId]/page.tsx)
// och positionskroken (app/egenkontroll/useMinPosition.ts) anropar bara dessa.
//
// TILLSTANDET HARLEDS UR DATA, det lagras aldrig. En runda ar:
//   - i terrangen    : planpunkterna (del='plan'), de som har en plats pa kartan
//   - utanfor kartan : utforande, matning, ovrigt
// "Sista punkten i terrangen" ar alltsa en fraga till datan (terrangKvar === 0),
// inte ett flagga nagon satt. Ett lagrat tillstand kan sta fel mot verkligheten;
// ett harlett kan det inte.

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
// Avstand och ordning
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

/**
 * Narmaste OBESVARADE punkt som har en plats. null = ingen att peka ut.
 * `utom` lyfter bort en punkt (den man precis svarade pa), sa en punkt aldrig
 * foreslas som "nasta" direkt efter att den besvarats.
 */
export function narmasteObesvarade(
  planpunkter: EgenkontrollPunkt[],
  avstand: Map<string, AvstandRad>,
  utom?: string | null,
): string | null {
  let bast: { id: string; m: number } | null = null;
  for (const p of planpunkter) {
    if (p.status !== null || p.id === utom) continue;
    const a = avstand.get(p.id);
    if (!a) continue;
    // Strikt mindre: vid exakt lika langt vinner den som kommer forst i rundan -
    // en stabil, forklarbar ordning, inte slumpen.
    if (!bast || a.m < bast.m) bast = { id: p.id, m: a.m };
  }
  return bast?.id ?? null;
}

/**
 * Ordningen i en grupp: narmast forst, punkter utan plats SIST i sin ordning.
 * Stabil sortering - lika avstand behaller rundans egen ordning.
 */
export function ordnaGruppEfterAvstand(
  punkter: EgenkontrollPunkt[],
  avstand: Map<string, AvstandRad>,
): EgenkontrollPunkt[] {
  const med = punkter.filter((p) => avstand.has(p.id));
  const utan = punkter.filter((p) => !avstand.has(p.id));
  const sorterad = med
    .map((p, i) => ({ p, i }))
    .sort((a, b) => avstand.get(a.p.id)!.m - avstand.get(b.p.id)!.m || a.i - b.i)
    .map((x) => x.p);
  return [...sorterad, ...utan];
}

// ---------------------------------------------------------------------------
// Tillstandet
// ---------------------------------------------------------------------------

/** Punkterna "i terrangen" - de som kontrolleras mot planen. */
export function terrangPunkter(punkter: EgenkontrollPunkt[]): EgenkontrollPunkt[] {
  return punkter.filter((p) => p.del === 'plan');
}

export function terrangKvar(punkter: EgenkontrollPunkt[]): number {
  return terrangPunkter(punkter).filter((p) => p.status === null).length;
}

/**
 * Var rundan ska oppna, innan anvandaren valt nagot.
 *   karta  = gå rundan (tillstand 1)
 *   lista  = oversikt (2) eller avsluta (3)
 * Kartan kraver ett origo (annars finns ingen punkt att visa), en oppen runda
 * och minst en punkt kvar i terrangen. Allt annat oppnar listan - en fardigt
 * besvarad terrang har ingenting kvar att ga till.
 */
export function startLage(args: {
  harRunda: boolean;
  klar: boolean;
  harOrigo: boolean;
  terrangKvar: number;
  positionHarFallit: boolean;
  /** Kortet har redan en punkt: man ar i flodet. */
  harKort: boolean;
}): 'karta' | 'lista' {
  if (!args.harRunda || args.klar || !args.harOrigo) return 'lista';
  // I FLODET (kortet har en punkt) lamnas kartan aldrig av sig sjalv - inte nar
  // sista punkten besvaras (da ska kortet fa visa sitt svar en stund innan vyn
  // byter, och det byter SIDAN, med en timer) och inte nar positionen tappas.
  if (args.harKort) return 'karta';
  if (args.terrangKvar === 0) return 'lista';
  if (args.positionHarFallit) return 'lista';
  return 'karta';
}

/**
 * Hur listans rader ritas. KOMPAKT = en rad per punkt som ger oversikt (✓ eller
 * avstand) och oppnar kartan. FULL = dagens kort med OK/Avvikelse direkt i listan.
 *
 * Full nar positionen saknas: da ar listan sjalva flodet, och tre tryck per punkt
 * ar att straffa anvandaren for nagot appen inte klarar. Kompakt annars, eller
 * nar allt i terrangen redan ar besvarat (inget kvar att svara pa).
 */
export function radLage(args: { harFrystPosition: boolean; terrangKvar: number }): 'kompakt' | 'full' {
  return args.harFrystPosition || args.terrangKvar === 0 ? 'kompakt' : 'full';
}

/**
 * Vilken punkt kortet ska visa EFTER att `besvarad` just fatt sitt forsta svar.
 *   { typ: 'punkt', id }   - narmaste obesvarade
 *   { typ: 'klart' }       - sista punkten i terrangen: dags for avslutet
 *   { typ: 'stanna' }      - ingen position (eller bara punkter utan plats kvar):
 *                            kortet star kvar, aldrig en gissad nasta
 */
export type EfterSvar = { typ: 'punkt'; id: string } | { typ: 'klart' } | { typ: 'stanna' };

export function efterSvar(args: {
  planpunkter: EgenkontrollPunkt[];
  besvaradId: string;
  avstand: Map<string, AvstandRad>;
}): EfterSvar {
  const kvar = args.planpunkter.filter((p) => p.status === null && p.id !== args.besvaradId);
  if (kvar.length === 0) return { typ: 'klart' };
  const nasta = narmasteObesvarade(args.planpunkter, args.avstand, args.besvaradId);
  return nasta ? { typ: 'punkt', id: nasta } : { typ: 'stanna' };
}

/** Sagt i kortet nar punkterna som aterstar inte har nagon plats pa kartan. Samma mening som tomma kortet. */
export const SAKNAR_PLATS_MENING = 'Punkterna som återstår saknar plats på kartan. Svara på dem i listan.';

/**
 * Kan kortet stangas, och i sa fall: varfor gar det inte vidare av sig sjalvt?
 *
 * Ett kort med en BESVARAD punkt har ingenting kvar att gora. Efter ett forsta svar
 * flyttas det till narmaste obesvarade (efterSvar) - men det finns inget att flytta
 * till nar position saknas, och inte heller nar det som aterstar saknar plats. Da
 * star kortet kvar, och utan en stang-knapp fanns bara ett annat tryck pa kartan
 * som vag ut. Samma sak galler en besvarad punkt man tryckt upp for att titta pa.
 *
 *   kanStangas  - kortet visar en besvarad punkt (och vyn ar inte pa vag till avslutet)
 *   forklaring  - satt bara nar ingen nasta kan pekas ut och terrangen inte ar klar:
 *                 'position' = utan position gar ordningen inte att avgora,
 *                 'plats'    = positionen duger men det som aterstar saknar plats.
 *
 * Ett OBESVARAT kort stangs aldrig: det ska besvaras. Kortet byter inte punkt av sig
 * sjalvt, sa att det inte forsvinner medan man star vid punkten.
 */
export type KortStangning = { kanStangas: boolean; forklaring: 'position' | 'plats' | null };

export function kortStangning(args: {
  kort: Pick<EgenkontrollPunkt, 'status'> | null;
  /** Sista punkten ar besvarad och vyn byter till avslutet av sig sjalv. */
  klartKort: boolean;
  terrangKvar: number;
  /** Finns en narmaste obesvarade punkt att peka ut (narmasteObesvarade != null)? */
  nastaFinns: boolean;
  positionOk: boolean;
}): KortStangning {
  if (!args.kort || args.kort.status === null || args.klartKort) {
    return { kanStangas: false, forklaring: null };
  }
  if (args.terrangKvar === 0 || args.nastaFinns) return { kanStangas: true, forklaring: null };
  return { kanStangas: true, forklaring: args.positionOk ? 'plats' : 'position' };
}

/**
 * Ar detta en punkts FORSTA svar? Bara da gar kortet vidare. Att rattta ett
 * redan givet svar (ok -> avvikelse) ska inte flytta nagon: man star kvar pa
 * punkten man ratter.
 */
export function arForstaSvaret(forra: string | null | undefined, nu: string | null): boolean {
  return forra === null && nu !== null;
}
