// Lassdetekteringen: lastbilens bruttovikt (rFMS grossCombinationVehicleWeight i lastbil_logg) → lass.
//
// Ren modul (ingen Supabase, ingen klocka): loggpunkter in, lass ut. Cron:en (kor.ts) läser loggen, kör den här och skriver.
//
// VAD MÄTNINGEN ÄR. Bilen är tom ≈ 22–32 t och bär en maskin 34–60 t. Viktgivaren svajar ±5 t (samma maskin ger 21–34 t last),
// och loggen är gles: Scania sänder vid händelser och var 10:e minut, så ett lass kan bestå av en enda lastad punkt eller ha
// 70 minuter mellan punkterna. Därför:
//
//  • HYSTERES. Lastad när vikten når ≥ 34 t (men aldrig över tom-nivån + 6 t, golv 33 t); tom först när den är tillbaka ≤ 32 t.
//    Allt däremellan behåller förra läget. 34 t och inte högre: skördaren H8E väger 36–38 t med bilen (11 punkter på 34,7–37,6 t
//    den 21 aug, 37,9 t den 16 sep) — ett högre tak, och den fasta gränsen 38 t som användes i förstudien, missar den helt.
//  • ENSTAKA PUNKTER. Ett lass med bara en lastad punkt godtas först när den ligger ≥ 15 t över tomvikten (en 57 t-mätning är
//    ingen svajning). Annars är det en avläsning, inte en maskin.
//  • FALSK TOM MITT I ETT LASS. Står bilen med lasset och viktgivaren släpper en minut (22+23 den 1 sep: 49,3 t → 27,5 t → 49,0 t
//    med nio minuter mellan första och sista lastade punkten) är det ETT lass. Lastade perioder med högst 15 minuter emellan slås
//    ihop. Ett maskinbyte på samma plats (en av, en på) ligger alltid längre isär än så i facit (25 och 10 minuter, 26 och 27 den 2 sep).
//  • LASTVIKT = median lastad minus tom (snitt av punkten före och efter, tom-nivån annars). Under 6 t är det inget lass.
//
// PLATS. Loggen är gles, så den första lastade punkten är sällan där maskinen lastades. En punkt litas på när bilen stod stilla
// (≤ 2 km/h) eller kröp (≤ 8 km/h) alldeles vid en trakt (≤ 1 km). Lastningsplatsen är den första lastade punkten om den litas på,
// annars den sista tomma före. Lossningsplatsen är den sista lastade om den litas på, annars den första tomma efter. Litas ingen
// på är platsen OSÄKER — då skapas aldrig en flytt automatiskt.

import { haversine } from '@/utils/geo';

export const LASS = {
  LASTAD_KG: 34_000,
  GOLV_KG: 33_000,
  TOM_KG: 32_000,
  TOM_PLUS_KG: 6_000,
  STANDARD_TOM_KG: 28_500,
  ENSTAKA_PLUS_KG: 15_000,
  MIN_LASTVIKT_KG: 6_000,
  SAMMANSLAG_MIN: 15,
  MIN_TRANSPORT_KM: 1,
  STILLA_KMH: 2,
  KRYPER_KMH: 8,
  NARA_PLATS_M: 1_000,
  /** En tom punkt äldre än så här före lastningen säger inget om var lastningen skedde. */
  FORE_MAX_MIN: 180,
  TOMHISTORIK: 7,
} as const;

export interface LoggPunkt {
  tidpunkt: string;
  lat: number | null;
  lng: number | null;
  hastighet: number | null;   // km/h
  odometer_m: number | null;
  vikt_kg: number | null;
}

/** Den punkt som valts som lass- eller lossningsplats. */
export interface ValdPunkt {
  tidpunkt: string;
  lat: number | null;
  lng: number | null;
  odometer_m: number | null;
  /** Bilen stod stilla/kröp vid en trakt här: platsen går att lita på. */
  saker: boolean;
  /** Vilken punkt: första lastade/sista tomma före (lassning), sista lastade/första tomma efter (lossning). */
  kalla: 'lastad' | 'tom';
}

export interface DetektLass {
  forstaLastadTid: string;
  sistaLastadTid: string;
  lassningFran: string | null;       // sista tomma punkten före
  lassningTid: string;               // första lastade punkten
  lossningTid: string;               // bedömd lossningstid (se nedan)
  lossningTill: string | null;       // första tomma punkten efter
  lassning: ValdPunkt;
  lossning: ValdPunkt;
  tomKg: number | null;
  lastadKg: number;                  // median bruttovikt medan lastad
  lastviktKg: number;
  km: number | null;
  /** Lastade loggpunkter i lasset, med läge — det maskinens GPS-spår jämförs mot. */
  punkter: LoggPunkt[];
  antalPunkter: number;
  sammanslagen: boolean;
  /** Det finns en tom punkt efter: lossningen är sedd. false = bilen är fortfarande lastad. */
  klar: boolean;
  /** Satt = inget flyttlass, och orsaken. */
  avvisad: 'enstaka_matning' | 'for_lag_lastvikt' | 'ingen_transport' | null;
}

export interface DetektResultat {
  lass: DetektLass[];
  /** Loggen började med bilen lastad: starten är okänd och lasset räknas inte (vi vet inte var det började). */
  okandStart: boolean;
}

export interface DetektAlternativ {
  /** Avstånd i meter till närmaste trakt/plats, eller null om ingen finns inom räckhåll. */
  narPlatsM?: (lat: number, lng: number) => number | null;
  /**
   * Bilens hemmabas. En TOM punkt på basen säger inte var maskinen lämnades: loggen är gles, och bilen kan ha lossat mitt på
   * vägen och kommit hem innan nästa punkt (H8E-flytten 16 sep: lastad 14:20, nästa punkt 15:36 hemma på LBC). Platsen blir då osäker.
   */
  bas?: { lat: number; lng: number; radieM: number };
}

const MIN_MS = 60_000;

export const tidMs = (t: string): number => Date.parse(t);

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Bara punkter med en riktig vikt (0 och null betyder "ingen mätning"), äldst först, en per tidpunkt. */
export function viktPunkter(rader: readonly LoggPunkt[]): LoggPunkt[] {
  const sedd = new Set<number>();
  return rader
    .filter(p => p.vikt_kg != null && Number.isFinite(p.vikt_kg) && p.vikt_kg > 0 && Number.isFinite(tidMs(p.tidpunkt)))
    .sort((a, b) => tidMs(a.tidpunkt) - tidMs(b.tidpunkt))
    .filter(p => { const t = tidMs(p.tidpunkt); if (sedd.has(t)) return false; sedd.add(t); return true; });
}

/** Vikten där en punkt räknas som lastad, givet hur tom bilen brukar vara. */
export const lastadTroskel = (tomNivaKg: number): number =>
  Math.min(LASS.LASTAD_KG, Math.max(LASS.GOLV_KG, tomNivaKg + LASS.TOM_PLUS_KG));

interface Period { a: number; b: number; e: number | null }

function hittaPerioder(pts: LoggPunkt[]): { perioder: Period[]; okandStart: boolean } {
  const tomHist: number[] = [];
  const perioder: Period[] = [];
  let lastad = false;
  let start = -1;
  let okandStart = false;
  for (let i = 0; i < pts.length; i++) {
    const w = pts[i].vikt_kg as number;
    const tomNiva = tomHist.length ? median(tomHist) : LASS.STANDARD_TOM_KG;
    if (!lastad) {
      if (w >= lastadTroskel(tomNiva)) {
        lastad = true; start = i;
        if (i === 0) okandStart = true;
      } else if (w <= LASS.TOM_KG) {
        tomHist.push(w);
        if (tomHist.length > LASS.TOMHISTORIK) tomHist.shift();
      }
    } else if (w <= LASS.TOM_KG) {
      perioder.push({ a: start, b: i - 1, e: i });
      lastad = false;
      tomHist.push(w);
      if (tomHist.length > LASS.TOMHISTORIK) tomHist.shift();
    }
  }
  if (lastad) perioder.push({ a: start, b: pts.length - 1, e: null });
  return { perioder, okandStart };
}

/** Lastade perioder med högst SAMMANSLAG_MIN mellan sista lastade och nästa första lastade är ETT lass. */
function slaIhop(perioder: Period[], pts: LoggPunkt[]): (Period & { sammanslagen: boolean })[] {
  const ut: (Period & { sammanslagen: boolean })[] = [];
  for (const p of perioder) {
    const f = ut[ut.length - 1];
    if (f && f.e != null && tidMs(pts[p.a].tidpunkt) - tidMs(pts[f.b].tidpunkt) <= LASS.SAMMANSLAG_MIN * MIN_MS) {
      f.b = p.b; f.e = p.e; f.sammanslagen = true;
    } else {
      ut.push({ ...p, sammanslagen: false });
    }
  }
  return ut;
}

const rang = (hastighet: number | null): 0 | 1 | 2 =>
  hastighet == null ? 0 : hastighet <= LASS.STILLA_KMH ? 2 : hastighet <= LASS.KRYPER_KMH ? 1 : 0;

function kanLitas(p: LoggPunkt, narPlatsM?: DetektAlternativ['narPlatsM']): boolean {
  if (p.lat == null || p.lng == null) return false;
  const r = rang(p.hastighet);
  if (r === 2) return true;
  if (r === 1 && narPlatsM) {
    const m = narPlatsM(p.lat, p.lng);
    return m != null && m <= LASS.NARA_PLATS_M;
  }
  return false;
}

const vald = (p: LoggPunkt, saker: boolean, kalla: 'lastad' | 'tom'): ValdPunkt =>
  ({ tidpunkt: p.tidpunkt, lat: p.lat, lng: p.lng, odometer_m: p.odometer_m, saker, kalla });

/** En tom punkt hemma på basen litas aldrig på som lass- eller lossningsplats. */
function utanBas(v: ValdPunkt, bas: DetektAlternativ['bas']): ValdPunkt {
  if (!bas || v.kalla !== 'tom' || v.lat == null || v.lng == null) return v;
  return haversine(v.lat, v.lng, bas.lat, bas.lng) * 1000 <= bas.radieM ? { ...v, saker: false } : v;
}

function valjLassning(f: LoggPunkt | null, a: LoggPunkt, narPlatsM?: DetektAlternativ['narPlatsM']): ValdPunkt {
  const foreOk = f != null && tidMs(a.tidpunkt) - tidMs(f.tidpunkt) <= LASS.FORE_MAX_MIN * MIN_MS;
  if (kanLitas(a, narPlatsM)) return vald(a, true, 'lastad');
  if (f && foreOk && kanLitas(f, narPlatsM)) return vald(f, true, 'tom');
  if (f && foreOk && f.lat != null) return vald(f, false, 'tom');
  return vald(a, false, 'lastad');
}

function valjLossning(b: LoggPunkt, e: LoggPunkt | null, narPlatsM?: DetektAlternativ['narPlatsM']): ValdPunkt {
  if (kanLitas(b, narPlatsM)) return vald(b, true, 'lastad');
  if (e && kanLitas(e, narPlatsM)) return vald(e, true, 'tom');
  if (e && e.lat != null) return vald(e, false, 'tom');
  return vald(b, false, 'lastad');
}

export const avrunda1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Hittar lassen i loggen. `rader` får innehålla punkter utan vikt (de hoppas över). Räkna med att fönstret ska börja med bilen
 * TOM — annars är första perioden avskuren och rapporteras som `okandStart` (och ingår inte).
 */
export function detekteraLass(rader: readonly LoggPunkt[], alt: DetektAlternativ = {}): DetektResultat {
  const pts = viktPunkter(rader);
  const { perioder, okandStart } = hittaPerioder(pts);
  const lass: DetektLass[] = [];

  for (const p of slaIhop(perioder.filter(x => !(okandStart && x.a === 0)), pts)) {
    const lastade = pts.slice(p.a, p.b + 1);
    const f = p.a > 0 ? pts[p.a - 1] : null;
    const e = p.e != null ? pts[p.e] : null;
    const a = pts[p.a];
    const b = pts[p.b];

    const tomKand = [f, e].filter((x): x is LoggPunkt => !!x && (x.vikt_kg as number) <= LASS.TOM_KG).map(x => x.vikt_kg as number);
    const tomKg = tomKand.length ? Math.round(tomKand.reduce((s, x) => s + x, 0) / tomKand.length) : null;
    const lastadKg = Math.round(median(lastade.map(x => x.vikt_kg as number)));
    const lastviktKg = lastadKg - (tomKg ?? LASS.STANDARD_TOM_KG);

    const lassning = utanBas(valjLassning(f, a, alt.narPlatsM), alt.bas);
    const lossning = utanBas(valjLossning(b, e, alt.narPlatsM), alt.bas);
    // Bedömd lossningstid: valdes den sista lastade punkten (bilen stod lastad där) skedde lossningen efter den — mitt emellan
    // den och första tomma punkten. Valdes den tomma punkten är det den.
    const lossningTid = lossning.kalla === 'tom' || !e
      ? lossning.tidpunkt
      : new Date(Math.round((tidMs(b.tidpunkt) + tidMs(e.tidpunkt)) / 2 / MIN_MS) * MIN_MS).toISOString();

    const km = lassning.odometer_m != null && lossning.odometer_m != null && lossning.odometer_m >= lassning.odometer_m
      ? avrunda1((lossning.odometer_m - lassning.odometer_m) / 1000) : null;

    let avvisad: DetektLass['avvisad'] = null;
    if (lastade.length === 1 && lastadKg < (tomKg ?? LASS.STANDARD_TOM_KG) + LASS.ENSTAKA_PLUS_KG) avvisad = 'enstaka_matning';
    else if (lastviktKg < LASS.MIN_LASTVIKT_KG) avvisad = 'for_lag_lastvikt';
    else if (p.e != null && km != null && km < LASS.MIN_TRANSPORT_KM) avvisad = 'ingen_transport';

    lass.push({
      forstaLastadTid: a.tidpunkt,
      sistaLastadTid: b.tidpunkt,
      lassningFran: f ? f.tidpunkt : null,
      lassningTid: a.tidpunkt,
      lossningTid,
      lossningTill: e ? e.tidpunkt : null,
      lassning, lossning,
      tomKg, lastadKg, lastviktKg, km,
      punkter: lastade,
      antalPunkter: lastade.length,
      sammanslagen: p.sammanslagen,
      klar: p.e != null,
      avvisad,
    });
  }
  return { lass, okandStart };
}

/** Meter mellan två punkter. */
export const meterMellan = (lat1: number, lng1: number, lat2: number, lng2: number): number =>
  Math.round(haversine(lat1, lng1, lat2, lng2) * 1000);
