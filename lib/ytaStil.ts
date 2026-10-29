// YTORNAS UTSEENDE — EN källa för hur en yta ser ut på kartan (egna och Vidas): färgen är gruppens (lib/larm/grupper), ytor man inte får köra in i
// (YTA[...].forbjuden / VIDA[...].forbjuden) snedstreckas i gruppens färg, övriga är heldragna, och namnet står i ytan med mörk kant.
// Planeringsvyn, körvyn, egenkontrollens karta (lib/kartstil) och A4-rapporten hämtar härifrån — ingen egen streckning, färg eller etikettstil.

import { GRUPPER, YTA, VIDA, type FargGrupp } from './larm/grupper';
import { OVRIGA_YTKODER } from './vidaYtaTyp';

/** Snedstreckningens bildruta (px). Måste vara en multipel av periodens längd så mönstret går ihop i kanterna. */
export const SNEDSTRECK_PX = 16;
const PERIOD = 8;          // avstånd mellan streck (diagonalt, i x+y)
const STRECK = 3;          // strecktjocklek (i x+y; ≈ 2,1 px vinkelrätt)
const STRECK_ALFA = 0.9;

export const snedstreckId = (grupp: FargGrupp): string => `snedstreck-${grupp}`;

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** RGBA-pixlarna för gruppens snedstreck (45°, genomskinlig mellan strecken). Ren funktion — ingen canvas behövs. */
export function snedstreckBild(grupp: FargGrupp): { width: number; height: number; data: Uint8ClampedArray } {
  const [r, g, b] = hexRgb(GRUPPER[grupp].farg);
  const data = new Uint8ClampedArray(SNEDSTRECK_PX * SNEDSTRECK_PX * 4);
  for (let y = 0; y < SNEDSTRECK_PX; y++) {
    for (let x = 0; x < SNEDSTRECK_PX; x++) {
      if ((x + y) % PERIOD >= STRECK) continue;
      const i = (y * SNEDSTRECK_PX + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(255 * STRECK_ALFA);
    }
  }
  return { width: SNEDSTRECK_PX, height: SNEDSTRECK_PX, data };
}

/** Grupperna som har snedstreckade ytor — bilder laddas bara för dem. */
export const SNEDSTRECK_GRUPPER: readonly FargGrupp[] = Array.from(new Set([
  ...Object.values(YTA).filter((y) => y.forbjuden).map((y) => y.grupp),
  ...Object.values(VIDA).filter((v) => v.forbjuden).map((v) => v.grupp),
]));

/** Egna ytor man inte får köra in i (zoneType), per grupp — filtret för respektive streckningslager. */
export const FORBJUDNA_ZONTYPER = (grupp: FargGrupp): string[] =>
  Object.entries(YTA).filter(([, y]) => y.forbjuden && y.grupp === grupp).map(([typ]) => typ);

/** Namnet som står i ytan, i VANLIG text ("Hänsyn", inte "HÄNSYN" — Martin 2026-10-28: versalerna skrek). Blött heter Risa — instruktionen på en blick. */
export const YTA_ETIKETT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(YTA).map(([typ, y]) => [typ, typ === 'wet' ? 'Risa' : y.namn]),
);

/** Vidas ytor: namnet som står i ytan (samma vanliga text som våra egna). */
export const VIDA_ETIKETT = {
  hansynsyta: VIDA.hansynsyta.namn,
  nyckelbiotop: VIDA.nyckelbiotop.namn,
  raa_yta: VIDA.raa_yta.namn,
  /** Vidas TYP 71 ("Övrigt"): ingen hänsyn, neutral etikett. */
  ovrigt: 'Övrigt',
} as const;

/** Ytnamnets storlek (px) efter zoom — samma för alla ytor. Lugnare än förr (12/17/22 med versaler): namnet ska gå att läsa, inte skrika. */
export const YTA_ETIKETT_STORLEK = ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 14, 17, 17] as const;

/** Etikettens stil: vit text, mörk kant — läsbar på flygfoto och på vit karta. Ingen andra nyans. */
export const YTA_ETIKETT_STIL = {
  text: '#ffffff',
  kant: '#000000',
  kantBredd: 2.2,
} as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// "ÖVRIGT" (Vidas TYP 71 i tilläggsytorna) — en NEUTRAL yta, ingen hänsyn (lib/vidaYtaTyp): tunn streckad kant, ingen fyllning, ingen snedstreckning, inget larm.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Utseendet: ljus tunn streckad kant (läsbar på flygfoto och på vit karta med den mörka etikettkanten), ingen färg ur någon grupp. */
export const OVRIGT_YTA_STIL = {
  farg: '#ffffff',
  kantBredd: 1.5,
  streck: [3, 2],
  /** Fyllningen är bara en träffyta så ytan går att trycka på (kortet med Vidas text) — osynlig. */
  traffFyllning: 0.01,
} as const;

/** MapLibre-uttryck för `trakt-geo-source`: alla Vidas tilläggsytor som ÄR hänsyn (Övrigt-koderna undantagna) respektive de som är Övrigt. Samma uttryck för alla lager. */
const YTKOD = ['to-string', ['coalesce', ['get', 'TYP'], '']] as const;
export const HANSYNSYTA_FILTER = ['all', ['==', ['get', '_typ'], 'hänsynsyta'], ['!', ['in', YTKOD, ['literal', OVRIGA_YTKODER]]]] as unknown as unknown[];
export const OVRIGT_YTA_FILTER = ['all', ['==', ['get', '_typ'], 'hänsynsyta'], ['in', YTKOD, ['literal', OVRIGA_YTKODER]]] as unknown as unknown[];
