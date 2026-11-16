/**
 * LUGN KÖRRIKTNING OCH LUGN KARTA I KÖRVYN (Martin 2026-11-16, efter en helg i H8:an: pilen visade inte tydligt åt vilket håll man kör och
 * kartan flyttade sig ryckigt).
 *
 * Förut togs kursen rakt ur GPS:en vid varje fix. En maskin som står still och arbetar får då en kurs som hoppar av bruset – pilen snurrar
 * och kartan vrider sig. Här räknas kursen ur hur maskinen faktiskt FLYTTAT SIG:
 *  • ny kurs först när maskinen flyttat sig minst MIN_M från förra punkten – står den still står pilen still,
 *  • kursen jämnas ut (VIKT) så att ett enstaka snett steg inte rycker,
 *  • backar maskinen en kort bit (under BACK_M) vänder varken pilen eller kartan – först när den kört längre åt andra hållet,
 *  • ett GPS-hopp (över HOPP_M mellan två punkter) ger ingen kurs alls.
 * Rena funktioner; sidan håller läget i en ref.
 */
export const KURS = { MIN_M: 4, VIKT: 0.6, BACK_GRAD: 120, BACK_M: 15, HOPP_M: 60 } as const;

export interface Pos { lat: number; lon: number }
export interface KursLage { kurs: number | null; ankare: Pos | null; bak: number }
export const TOM_KURS: KursLage = { kurs: null, ankare: null, bak: 0 };

const R = 6371000, rad = (g: number) => (g * Math.PI) / 180;
export function avstandM(a: Pos, b: Pos): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function baring(a: Pos, b: Pos): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** Kortaste vägen från a till b i grader, −180…180. */
export function vinkelSkillnad(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}
const norm = (g: number) => ((g % 360) + 360) % 360;

/** En ny position → nytt läge. Samma objekt tillbaka när inget ändrats (maskinen står still). */
export function stegaKurs(l: KursLage, pos: Pos): KursLage {
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return l;
  if (!l.ankare) return { ...l, ankare: pos };
  const d = avstandM(l.ankare, pos);
  if (d < KURS.MIN_M) return l;
  if (d > KURS.HOPP_M) return { ...l, ankare: pos, bak: 0 };
  const b = baring(l.ankare, pos);
  if (l.kurs == null) return { kurs: b, ankare: pos, bak: 0 };
  const diff = vinkelSkillnad(l.kurs, b);
  if (Math.abs(diff) > KURS.BACK_GRAD) {
    const bak = l.bak + d;
    // Backar en kort bit: riktningen står kvar. Efter BACK_M åt andra hållet är det den nya körriktningen.
    return bak < KURS.BACK_M ? { kurs: l.kurs, ankare: pos, bak } : { kurs: b, ankare: pos, bak: 0 };
  }
  return { kurs: norm(l.kurs + diff * KURS.VIKT), ankare: pos, bak: 0 };
}

/** Kartan vrids inte för småändringar: under DODBAND grader står den kvar på sin riktning. */
export const KART_DODBAND_GRAD = 6;
export function kartRiktning(nuvarande: number | null, mal: number): number {
  if (nuvarande == null) return mal;
  return Math.abs(vinkelSkillnad(nuvarande, mal)) < KART_DODBAND_GRAD ? nuvarande : mal;
}

/**
 * Hur länge kartan glider till en ny position: lika länge som det gått sedan förra (GPS:en ger en punkt i sekunden), så att glidningen
 * hänger ihop i stället för att starta och stanna. Okänt eller orimligt mellanrum → en sekund.
 */
export const FOLJ = { MIN_MS: 500, MAX_MS: 1600, STANDARD_MS: 1000 } as const;
export function foljTid(dtMs: number | null): number {
  if (dtMs == null || !Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 5000) return FOLJ.STANDARD_MS;
  return Math.max(FOLJ.MIN_MS, Math.min(FOLJ.MAX_MS, Math.round(dtMs * 1.1)));
}
