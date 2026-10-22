/**
 * GREPPET SLÄPPTE — ställena på en stam där maskinens diameter står still (stamvyns lista och diagram).
 *
 * DEFINITIONEN (Martin 2026-10-22): ett ställe är en sträcka där maskinens diameter inte sjunker (lika eller större än föregående punkt i den
 * täta profilen, `stem_diameter_profile`, en punkt var 10:e cm) och som är minst `GREPP_MIN_CM` lång — Skogforsks planområde. Klaven avgör
 * INTE om ett ställe räknas. Ett försök att kräva att klaven sjunker över sträckan filtrerade nästan inget (Skälviken stam 1: 8 → 7): klavpunkterna
 * är ~1 m isär, och mellan två punkter sjunker en rät linje nästan alltid.
 *
 * Klaven används bara för att visa FELET per ställe: maskin − klave vid sträckans slut, där glipan vuxit mest (positivt = maskinen mäter grövre).
 * Klavens mått vid ett läge läses som rät linje mellan närmaste klavpunkter. Ligger sträckans slut utanför klavpunkterna, eller saknas klavmått
 * på stammen, är felet null — stället räknas ändå, men vi säger inte hur stort felet blev.
 *
 * Tryckmätaren i Över tid använder INTE den här funktionen: den räknar andelen steg där maskinens diameter inte sjunker (bara maskinens profil,
 * ingen klave, ingen minsta längd) och ersätts av ett mått på alla stammar i en senare ändring.
 */

/** Kortaste sträcka som räknas (cm). Skogforsks gräns för ett planområde. */
export const GREPP_MIN_CM = 30;

export type ProfilPunkt = { position_cm: number; diameter_mm: number };
export type KlavePunkt = { posCm: number; klave: number };

export type Grepp = {
  startCm: number;
  endCm: number;
  lengthCm: number;
  /** maskin − klave vid sträckans slut, mm. null när klavens mått inte går att läsa där. */
  felMm: number | null;
  /** Glipan (maskin − klave) längs sträckan, en punkt per profilpunkt — så diagrammet kan färga den. Tom när klavens mått saknas i början eller slutet. */
  glipa: { posCm: number; mm: number }[];
};

/** Klavens mått vid ett läge på stammen, läst mellan närmaste klavpunkter. null utanför första/sista klavpunkten. Förutsätter sorterad lista. */
export const klaveVid = (klave: KlavePunkt[], posCm: number): number | null => {
  if (klave.length < 2 || posCm < klave[0].posCm || posCm > klave[klave.length - 1].posCm) return null;
  for (let i = 0; i < klave.length - 1; i++) {
    const a = klave[i], b = klave[i + 1];
    if (posCm >= a.posCm && posCm <= b.posCm) {
      const span = b.posCm - a.posCm;
      return span === 0 ? a.klave : a.klave + ((posCm - a.posCm) / span) * (b.klave - a.klave);
    }
  }
  return null;
};

/** Ställena där maskinens diameter står still minst `GREPP_MIN_CM`, rot → topp, med felet per ställe ur klaven där den mätt. */
export const findGreppSlapp = (profil: ProfilPunkt[], klavePunkter: KlavePunkt[]): Grepp[] => {
  const p = profil.filter(x => x.diameter_mm != null && x.position_cm != null).sort((a, b) => a.position_cm - b.position_cm);
  const klave = klavePunkter.slice().sort((a, b) => a.posCm - b.posCm);
  const stallen: Grepp[] = [];
  let i = 0;
  while (i < p.length - 1) {
    let j = i + 1;
    while (j < p.length && p[j].diameter_mm >= p[j - 1].diameter_mm) j++;
    const startCm = p[i].position_cm, endCm = p[j - 1].position_cm;
    if (endCm - startCm >= GREPP_MIN_CM) {
      const ks = klaveVid(klave, startCm), ke = klaveVid(klave, endCm);
      stallen.push({
        startCm, endCm, lengthCm: endCm - startCm,
        felMm: ke != null ? p[j - 1].diameter_mm - ke : null,
        glipa: ks != null && ke != null ? p.slice(i, j).map(x => ({ posCm: x.position_cm, mm: x.diameter_mm - (klaveVid(klave, x.position_cm) as number) })) : [],
      });
    }
    i = j;
  }
  return stallen;
};
