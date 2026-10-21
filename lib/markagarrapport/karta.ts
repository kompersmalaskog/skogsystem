// Kartan "Här växte träden" — EN regel för sidan (SkogenKarta) och PDF:en.
//
// Martin 2026-10-21: "kartan … bara grön med massa prickar". Tusentals prickar i trädslagens färger på ett mörkt
// flygfoto säger ingenting — mest gran, så mest grönt på grön skog. Kartan ska svara på EN fråga åt gången:
//   - Röta (förvald när det finns röta): alla träd som små vita prickar (trakten syns) och granarna med röta som
//     röda prickar ovanpå. Det är det kartan kan säga som inget annat i rapporten säger: VAR rötan satt.
//   - Trädslag: varje träd i sitt trädslags färg, med mörk kant så att prickarna syns mot skogen.
// Alla prickar är lika stora (storleken efter grovlek var ett tredje budskap i samma bild).
import type { MarkagarRapport } from './types';

type Stam = MarkagarRapport['karta']['stammar'][number];

export type KartLage = 'rota' | 'tradslag';

/** Lägena kartan kan visa, förvalt först. Utan röta finns bara trädslagen (ingen växel). */
export function kartLagen(stammar: Stam[]): KartLage[] {
  return stammar.some(s => s.rot_typ != null) ? ['rota', 'tradslag'] : ['tradslag'];
}

export const KART_LAGE_NAMN: Record<KartLage, string> = { rota: 'Röta', tradslag: 'Trädslag' };

/** Meningen ovanför kartan — vad prickarna betyder, i vanliga ord. */
export function kartText(lage: KartLage, stammar: Stam[]): string {
  if (lage === 'rota') {
    const rot = stammar.filter(s => s.rot_typ != null).length;
    return `Varje prick är ett träd. De ${rot === 1 ? 'röda är granen' : 'röda är granarna'} som var ${rot === 1 ? 'rutten' : 'rutna'} i roten.`;
  }
  return 'Varje prick är ett träd. Färgen visar trädslaget.';
}

/**
 * Prickens radie (samma enhet som ytan: px på skärmen, pt i PDF:en) efter hur tätt träden står: tusentals träd på en
 * liten yta får små prickar, ett fåtal får större. Inom [min, max].
 */
export function prickRadie(antal: number, bredd: number, hojd: number, min = 1, max = 3.5): number {
  if (antal <= 0) return max;
  const r = 0.25 * Math.sqrt((bredd * hojd) / antal);
  return Math.max(min, Math.min(max, r));
}

/**
 * Rötans prick är lika stor som de friska — bara färgen skiljer. Större röda prickar (med vit kant) täckte de friska där
 * träden står tätt, och kartan såg rötigare ut än den var (provat i Chromium på Tågets 5 483 stammar, 2026-10-21).
 */
export const ROT_FAKTOR = 1;
// Prickarna ritas i den ordning träden fälldes — aldrig rötan överst. Röda prickar ovanpå de vita i täta stickvägar
// gjorde kartan synbart rödare än andelen röta (provat i Chromium på Tågets stammar).
