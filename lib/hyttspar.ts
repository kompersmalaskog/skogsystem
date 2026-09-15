// Hyttspår-segmentering — DELAD av eget-spåret, #498:s andras-spårvisning OCH källbytet (hyttspar →
// skordarstrak-fallback i skotarkörvyn).
//
// FANTOMLINJE-BUGGEN: ett hyttspår lagras som EN punkt-array per (objekt, roll, datum). När loggningen
// tystnat mitt i passet (appen stängd/bakgrundad) OCH maskinen sedan flyttat sig en bit innan
// loggningen kom igång igen, ligger två punkter LÅNGT ISÄR i arrayen — och ritas hela arrayen som EN
// LineString dras en rak förbindelselinje TVÄRS glappet.
//
// RÄTTELSE (Martins DB-bevis Hålabäck 2026-09-11, skotare): dela ENDAST på RUMSLIG lucka, inte på tid.
// En skotare står stilla 10–25 min vid lastning/lossning (t.ex. 10:28–10:54: 29 m på 25 min) och en
// skördare står stilla medan den avverkar — det är ARBETE, inte tappad signal, och punkterna ligger
// tätt (4–120 m mellan varandra i 09-11-passet). Tidsglapp-delning högg därför sönder EN sammanhängande
// körning i 18 bitar (fel). En äkta signalförlust visar sig i stället som ett stort AVSTÅND mellan två
// efterföljande punkter (maskinen kördes en bit medan appen var tyst). Därför: dela när avståndet mellan
// två på varandra följande punkter > HYTTSPAR_SEGMENT_GAP_M. Tid ignoreras helt. Samma regel för båda
// rollerna. (Skilt från #526:s avsluts-skydd, som nekar det stora hem-hoppet vid inmatning; detta är
// render-/härlednings-sidan.)

export interface HyttPunkt { lat: number; lng: number; tid: string }

// > 200 m mellan två efterföljande punkter = maskinen har flyttat sig utan att logga (signalförlust/
// app stängd mitt i förflyttning) → dela i nytt segment så ingen rak fantom-brygga dras. Satt tydligt
// ÖVER det största äkta steget i tät loggning (09-11-passet: max ~120 m mellan punkter under lastnings-
// pauser och normal körning) → arbetspauser på stället bryter ALDRIG spåret, bara verkliga hopp.
export const HYTTSPAR_SEGMENT_GAP_M = 200;

// Data-grind för källbytet: ett hyttspår-SEGMENT måste vara minst så här stort för att duga som
// "riktig körväg" och ersätta skordarstrak. Under grinden → för glest (loggningen dog av skärmlås,
// eller GPS-vakten gallrade bort mest i tät skog) → OSYNLIG fallback på skordarstrak.
// Medvetet HÖGT satt (ej de 5 punkter som först föreslogs): ett fåtalspunkts-segment får ALDRIG
// ersätta en tät rekonstruktion. Fältfynd: Akelius hade en 5-punkters-session — den skulle annars
// bytt ut 51 rekonstruerade stråk mot EN gles linje (sämre klumpning). Ett RIKTIGT arbetspass ger
// lätt hundratals punkter/kilometer, så den här nivån håller dagens glesa data inert men släpper in
// äkta täta spår automatiskt. Med rumslig (ej tidslig) segmentering blir ett helt pass ETT segment →
// grinden mäts på hela passet, inte på tidsfragment. Tunbart när fältdata visar vad telefonen klarar.
export const HYTTSPAR_MIN_PUNKTER = 15;
export const HYTTSPAR_MIN_LANGD_M = 150;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Total haversine-längd (m) för en sekvens punkter. */
export function hyttsparLangdM(seg: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < seg.length; i++) d += haversineM(seg[i - 1].lat, seg[i - 1].lng, seg[i].lat, seg[i].lng);
  return d;
}

/**
 * Dela ett hyttspår i sammanhängande segment vid RUMSLIG lucka > maxGapM (meter) mellan två
 * efterföljande punkter. TID IGNORERAS — arbetspauser på stället (lastning/lossning/avverkning) delar
 * aldrig spåret, bara verkliga hopp där maskinen flyttat sig utan att logga. Behåller punktordningen;
 * ett ogiltigt avstånd (NaN, t.ex. saknad koordinat) bryter aldrig (behandlas som fortsättning).
 * Tomt in → tomt ut.
 */
export function segmenteraHyttspar(points: HyttPunkt[], maxGapM: number = HYTTSPAR_SEGMENT_GAP_M): HyttPunkt[][] {
  const segs: HyttPunkt[][] = [];
  let cur: HyttPunkt[] = [];
  for (const p of points || []) {
    if (cur.length === 0) { cur = [p]; continue; }
    const prev = cur[cur.length - 1];
    const avst = haversineM(prev.lat, prev.lng, p.lat, p.lng);
    if (Number.isFinite(avst) && avst > maxGapM) { segs.push(cur); cur = [p]; }
    else cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/**
 * Hyttspår-punkter → LineString-koordinater [[lng,lat], …] per segment. Segment med < 2 punkter
 * kastas (kan inte ritas som linje) → INGEN fantom-brygga över glappet.
 */
export function hyttsparTillLinjer(points: HyttPunkt[], maxGapM: number = HYTTSPAR_SEGMENT_GAP_M): [number, number][][] {
  return segmenteraHyttspar(points, maxGapM)
    .filter(s => s.length >= 2)
    .map(s => s.map(p => [p.lng, p.lat] as [number, number]));
}

/**
 * Källbytets grind: segment som duger som riktig körväg (≥ HYTTSPAR_MIN_PUNKTER punkter OCH
 * ≥ HYTTSPAR_MIN_LANGD_M meter). Returnerar { geometri, langd_m } per godkänt segment. Tomt =
 * hyttsparet räcker inte → anroparen faller tillbaka på skordarstrak.
 */
export function hyttsparDugligaSegment(
  points: HyttPunkt[],
  maxGapM: number = HYTTSPAR_SEGMENT_GAP_M,
): { geometri: [number, number][]; langd_m: number }[] {
  const ut: { geometri: [number, number][]; langd_m: number }[] = [];
  for (const seg of segmenteraHyttspar(points, maxGapM)) {
    if (seg.length < HYTTSPAR_MIN_PUNKTER) continue;
    const langd = hyttsparLangdM(seg);
    if (langd < HYTTSPAR_MIN_LANGD_M) continue;
    ut.push({ geometri: seg.map(p => [p.lng, p.lat] as [number, number]), langd_m: Math.round(langd * 10) / 10 });
  }
  return ut;
}
