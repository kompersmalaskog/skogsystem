/**
 * GREPPET SLÄPPTE — EN definition, som stamvyns lista och tryckmätaren i Över tid delar (app/api/kalibrering/diagnos).
 *
 * Ett ställe där greppet släppte är en sträcka där maskinens diameter INTE sjunker men klavens GÖR det: stammen smalnar, maskinen följer inte med.
 * Står båda still är stammen platt på riktigt (kvistvarv, rotansvällning) och det räknas inte.
 *
 *  - Maskinens sida ur den täta profilen (`stem_diameter_profile`, en punkt var 10:e cm): en sammanhängande sträcka där diametern är lika eller
 *    större än föregående punkt, minst `GREPP_MIN_CM` lång (Skogforsks planområde).
 *  - Klavens sida ur klavpunkterna (mätpunkterna längs stockarna + toppen vid kapsnittet, ~1 m isär): klavens mått vid sträckans början och slut
 *    läses mellan närmaste klavpunkter (rät linje) och måste sjunka minst `KLAVE_SJUNKER_MM`.
 *  - Ligger sträckans början eller slut utanför klavpunkterna går den inte att bedöma. Den räknas då varken som ställe eller som underlag
 *    (tryckmätarens nämnare) — en gissning vore att låtsas att klaven mätt där den inte mätt.
 *
 * Klavpunkterna är glesa (en per meter) och kan inte visa en platt bit mitt i en meter; avgörandet är klavens riktning mellan punkterna.
 * Felet som stället gav (`felMm`) är maskin − klave vid sträckans slut, där glipan vuxit mest. Positivt = maskinen mäter grövre.
 */

/** Kortaste sträcka som räknas (cm). Skogforsks gräns för ett planområde. */
export const GREPP_MIN_CM = 30;
/** Klaven måste sjunka minst så här mycket (mm) över sträckan. Klavens upplösning är 1 mm: en halv millimeter är under vad den kan skilja. */
export const KLAVE_SJUNKER_MM = 0.5;

export type ProfilPunkt = { position_cm: number; diameter_mm: number };
export type KlavePunkt = { posCm: number; klave: number };

export type Grepp = {
  startCm: number;
  endCm: number;
  lengthCm: number;
  /** maskin − klave vid sträckans slut, mm. */
  felMm: number;
  /** Hur mycket klaven sjönk över sträckan, mm. */
  klaveSjunkerMm: number;
  /** Glipan (maskin − klave) längs sträckan, en punkt per profilpunkt — så diagrammet kan färga den. */
  glipa: { posCm: number; mm: number }[];
};

/** Ett steg i profilen (föregående punkt → den här). */
export type GreppSteg = {
  posCm: number;
  diameterMm: number;
  /** Klavens mått finns på båda sidor om steget. Bara bedömbara steg är underlag för tryckmätaren. */
  bedombar: boolean;
  /** Steget ligger i ett ställe där greppet släppte. */
  grepp: boolean;
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

export type GreppAnalys = { stallen: Grepp[]; steg: GreppSteg[] };

export const analyseraGrepp = (profil: ProfilPunkt[], klavePunkter: KlavePunkt[]): GreppAnalys => {
  const p = profil.filter(x => x.diameter_mm != null && x.position_cm != null).sort((a, b) => a.position_cm - b.position_cm);
  const klave = klavePunkter.slice().sort((a, b) => a.posCm - b.posCm);
  const stallen: Grepp[] = [];
  const steg: GreppSteg[] = [];
  for (let j = 1; j < p.length; j++) {
    steg.push({
      posCm: p[j].position_cm, diameterMm: p[j].diameter_mm, grepp: false,
      bedombar: klaveVid(klave, p[j - 1].position_cm) != null && klaveVid(klave, p[j].position_cm) != null,
    });
  }
  let i = 0;
  while (i < p.length - 1) {
    let j = i + 1;
    while (j < p.length && p[j].diameter_mm >= p[j - 1].diameter_mm) j++;
    const startCm = p[i].position_cm, endCm = p[j - 1].position_cm;
    if (endCm - startCm >= GREPP_MIN_CM) {
      const ks = klaveVid(klave, startCm), ke = klaveVid(klave, endCm);
      if (ks != null && ke != null && ks - ke >= KLAVE_SJUNKER_MM) {
        stallen.push({
          startCm, endCm, lengthCm: endCm - startCm, felMm: p[j - 1].diameter_mm - ke, klaveSjunkerMm: ks - ke,
          glipa: p.slice(i, j).map(x => ({ posCm: x.position_cm, mm: x.diameter_mm - (klaveVid(klave, x.position_cm) as number) })),
        });
        for (let s = i + 1; s <= j - 1; s++) steg[s - 1].grepp = true;
      }
    }
    i = j;
  }
  return { stallen, steg };
};

/** Ställena där greppet släppte på en stam, rot → topp. */
export const findGreppSlapp = (profil: ProfilPunkt[], klave: KlavePunkt[]): Grepp[] => analyseraGrepp(profil, klave).stallen;
