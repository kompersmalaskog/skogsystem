// Slå ihop skotarens lass från Opti (fakt_lass) och appen (skotar_lass) för
// uppföljningen — SAMMA regel som helikoptern (vyn helikopter_lass):
//
//   Per maskin + svensk DAG: finns lass i BÅDA källorna räknas den med MEST
//   volym (samma lass sett från två håll) — ALDRIG summan. Annars den som finns.
//
// Opti slutade ge lass-rader när föraren började registrera i appen, så utan
// detta visar uppföljningen bara de få Opti-dagarna (t.ex. Skälviken: 40 m³ /
// 1 dag i stället för 648 m³ / 6 dagar). Att summera skulle i stället dubbel-
// räkna de dagar båda har.
//
// OBS skalning: app-lassens volym är förarens råa m³ (summan av m3_forare). För
// AVSLUTADE trakter justerar helikoptern med Färdigskotad-faktorn ur
// skotar_trakt_avslut; det gör inte den här ännu (faktorn är 1 för pågående
// trakter, där de levande talen betyder något). Att spegla den justeringen för
// avslutade objekt är en följdpunkt.

export interface LassRad {
  maskin_id?: string | null;
  datum?: string | null;
  volym_m3sub?: number | null;
  korstracka_m?: number | null;
  objekt_id?: string | null;
}

const nyckel = (r: LassRad) => `${r.maskin_id ?? ''}|${r.datum ?? ''}`;
const sumVol = (rader: LassRad[]) => rader.reduce((a, r) => a + (r.volym_m3sub || 0), 0);

/**
 * Returnerar den sammanslagna lass-listan. Rader utan maskin_id eller datum
 * (t.ex. grot-lass) går inte att dagsmerga och behålls från Opti som de är.
 */
export function mergaLassPerDag(opti: LassRad[], app: LassRad[]): LassRad[] {
  // Rader som inte går att dagsmerga behålls alltid (bara från Opti; appens lass
  // har alltid maskin+datum).
  const optiMergbar = opti.filter(r => r.maskin_id && r.datum);
  const optiOmergbar = opti.filter(r => !(r.maskin_id && r.datum));
  const appMergbar = app.filter(r => r.maskin_id && r.datum);

  const optiPerNyckel = new Map<string, LassRad[]>();
  for (const r of optiMergbar) {
    const k = nyckel(r);
    (optiPerNyckel.get(k) ?? optiPerNyckel.set(k, []).get(k)!).push(r);
  }
  const appPerNyckel = new Map<string, LassRad[]>();
  for (const r of appMergbar) {
    const k = nyckel(r);
    (appPerNyckel.get(k) ?? appPerNyckel.set(k, []).get(k)!).push(r);
  }

  const alla = new Set<string>([...optiPerNyckel.keys(), ...appPerNyckel.keys()]);
  const vald: LassRad[] = [];
  for (const k of alla) {
    const o = optiPerNyckel.get(k) ?? [];
    const a = appPerNyckel.get(k) ?? [];
    // Mest volym vinner; lika (eller bara Opti) → Opti (samma tie-brytning som
    // helikoptern, där Opti är den äldre, kanoniska källan).
    vald.push(...(sumVol(a) > sumVol(o) ? a : o));
  }
  return [...vald, ...optiOmergbar];
}
