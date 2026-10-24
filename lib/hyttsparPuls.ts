// Hyttspår: stillastående får en PULS-punkt, och en verklig lucka märks. Ren logik, inga beroenden i sidan.
//
// Fynd 2026-10-24 (Elefanten, 21–23 okt, prod): av 13,8 h "luckor" över 60 s stod maskinen still (≤ 10 m) under 11,2 h och rörde sig 10–30 m under 2,4 h;
// bara 0,25 h (4 luckor på tre dagar) hade rört sig mer än 30 m. GPS-vakten släpper en punkt närmare än 2 m från förra, så en maskin som står och lastar
// ger tystnad i spåret — och tystnad ser ut som tappad inspelning. Därför: (1) stillastående ger en puls-punkt på samma plats var 60:e sekund, så att
// tystnad i spåret betyder att det verkligen inte kom några fixar, och (2) den första punkten efter en sådan tystnad (över 90 s) märks `lucka`, så att
// linjen inte dras tvärs över den ("ingen data" i stället för en rak linje).
import { GPS_GUARD, haversineMeters, type GpsAccepted, type GpsFix } from './gps-guard'

/** Stillastående: en punkt på samma plats så ofta, så länge giltiga fixar kommer. */
export const PULS_MS = 60_000
/** Över så här lång tystnad (ingen accepterad punkt alls) är det en lucka i datan. */
export const LUCKA_MS = 90_000

/** Är kandidaten en puls-punkt? Ja: bra fix, ligger närmare än vaktens minsta steg (annars hade vakten släppt den) och förra punkten är minst PULS_MS gammal. */
export function arPulspunkt(cand: GpsFix, last: GpsAccepted | null): boolean {
  if (!last) return false
  if (!Number.isFinite(cand.accuracy) || cand.accuracy > GPS_GUARD.accuracyMaxM) return false
  if (cand.ts - last.ts < PULS_MS) return false
  return haversineMeters(last.lat, last.lon, cand.lat, cand.lon) < GPS_GUARD.minStepM
}

/** Ska punkten som läggs till märkas som första efter en lucka? `harBas`: spåret har redan punkter (dagens rad återupptogs) men inget är ackumulerat i den här sessionen. */
export function arEfterLucka(last: { ts: number } | null, nuTs: number, harBas: boolean): boolean {
  if (!last) return harBas
  return nuTs - last.ts > LUCKA_MS
}

export interface LuckPunkt { lat: number; lng: number; tid: string; lucka?: boolean }

/**
 * Tunnar de osynkade punkterna (`tunna` = RDP) men aldrig ÖVER en lucka: varje bit mellan två luckor tunnas för sig, så den märkta punkten alltid blir kvar
 * som första punkt i sin bit. Ankaret (sista redan lagrade punkten) hänger bara ihop med första biten om den inte börjar med en lucka. Ankaret returneras inte.
 */
export function tunnaOsynkade<T extends LuckPunkt>(ankar: T | null, osynkade: readonly T[], tunna: (pts: T[]) => T[]): T[] {
  const bitar: T[][] = []
  let cur: T[] = ankar ? [ankar] : []
  for (const p of osynkade) {
    if (p.lucka && cur.length > 0) { bitar.push(cur); cur = [] }
    cur.push(p)
  }
  if (cur.length > 0) bitar.push(cur)
  const ut: T[] = []
  bitar.forEach((bit, i) => {
    const tunnad = tunna(bit)
    ut.push(...(i === 0 && ankar ? tunnad.slice(1) : tunnad))
  })
  return ut
}
