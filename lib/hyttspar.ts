// Hyttspår-segmentering — DELAD av eget-spåret, #498:s andras-spårvisning OCH källbytet (hyttspar →
// skordarstrak-fallback i skotarkörvyn).
//
// FANTOMLINJE-BUGGEN: ett hyttspår lagras som EN punkt-array per (objekt, roll, datum). När appen
// stängts/loggningen tystnat mitt i passet finns ett TIDSGLAPP i arrayen — och ritas hela arrayen som
// EN LineString dras en rak förbindelselinje TVÄRS glappet (fältfynd: Martins fredagsspår, tio glapp på
// 5–26 min). Fixen: dela arrayen i SEGMENT vid tidsglapp och rita varje segment som egen linje.
// (Skilt från #526:s avsluts-skydd, som bara nekar det stora hem-hoppet vid inmatning; detta är
// render-/härlednings-sidan och fångar ALLA glapp, även korta och nära.)

export interface HyttPunkt { lat: number; lng: number; tid: string }

// > 2 min mellan två accepterade punkter = loggningen tystnade (appen stängd/bakgrundad). Aktiv
// loggning ger punkter var ~sekund–20 s (GPS-watch + 20 s-spar), så 2 min är tydligt ett glapp.
// Samma storleksordning som skordarstråk-beräkningens TIDSLUCKA (120 s).
export const HYTTSPAR_SEGMENT_GAP_MS = 2 * 60 * 1000;

// Data-grind för källbytet: ett hyttspår-SEGMENT måste vara minst så här stort för att duga som
// "riktig körväg" och ersätta skordarstrak. Under grinden → för glest (loggningen dog av skärmlås,
// eller GPS-vakten gallrade bort mest i tät skog) → OSYNLIG fallback på skordarstrak.
// Medvetet HÖGT satt (ej de 5 punkter som först föreslogs): ett fåtalspunkts-segment får ALDRIG
// ersätta en tät rekonstruktion. Fältfynd: Akelius hade en 5-punkters-session — den skulle annars
// bytt ut 51 rekonstruerade stråk mot EN gles linje (sämre klumpning). Ett RIKTIGT arbetspass ger
// lätt hundratals punkter/kilometer, så den här nivån håller dagens glesa data inert men släpper in
// äkta täta spår automatiskt. Tunbart när fältdata visar vad telefonen faktiskt klarar i skog.
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
 * Dela ett hyttspår i sammanhängande segment vid tidsglapp > maxGapMs. Behåller punktordningen;
 * en punkt utan giltig tid bryter aldrig (behandlas som fortsättning). Tomt in → tomt ut.
 */
export function segmenteraHyttspar(points: HyttPunkt[], maxGapMs: number = HYTTSPAR_SEGMENT_GAP_MS): HyttPunkt[][] {
  const segs: HyttPunkt[][] = [];
  let cur: HyttPunkt[] = [];
  for (const p of points || []) {
    if (cur.length === 0) { cur = [p]; continue; }
    const prev = cur[cur.length - 1];
    const gap = Date.parse(p.tid) - Date.parse(prev.tid);
    if (Number.isFinite(gap) && gap > maxGapMs) { segs.push(cur); cur = [p]; }
    else cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/**
 * Hyttspår-punkter → LineString-koordinater [[lng,lat], …] per segment. Segment med < 2 punkter
 * kastas (kan inte ritas som linje) → INGEN fantom-brygga över glappet.
 */
export function hyttsparTillLinjer(points: HyttPunkt[], maxGapMs: number = HYTTSPAR_SEGMENT_GAP_MS): [number, number][][] {
  return segmenteraHyttspar(points, maxGapMs)
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
  maxGapMs: number = HYTTSPAR_SEGMENT_GAP_MS,
): { geometri: [number, number][]; langd_m: number }[] {
  const ut: { geometri: [number, number][]; langd_m: number }[] = [];
  for (const seg of segmenteraHyttspar(points, maxGapMs)) {
    if (seg.length < HYTTSPAR_MIN_PUNKTER) continue;
    const langd = hyttsparLangdM(seg);
    if (langd < HYTTSPAR_MIN_LANGD_M) continue;
    ut.push({ geometri: seg.map(p => [p.lng, p.lat] as [number, number]), langd_m: Math.round(langd * 10) / 10 });
  }
  return ut;
}
