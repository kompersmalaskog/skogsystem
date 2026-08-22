// EN palett och EN namnregel för trädslag i hela appen.
//
// Bakgrund: färgerna låg inline på minst sex ställen och sa olika saker.
// Björk var #ffd60a i maskinvyn, #FFF176 i översiktskartan, #d4c5a0 i
// markägarrapporten och blå i affärsuppföljningen. Samma trädslag, fyra
// färger — då slutar färgen vara en genväg för ögat och blir en gissning.
//
// Nya vyer importerar HÄRIFRÅN. Skriv aldrig en egen trädslagsfärg inline.
//
// Färgerna är appens egna (samma värden som T i lib/utbildning.ts), inte en
// egen palett vid sidan om:
//   Gran        grön    T.green
//   Tall        orange  T.orange
//   Björk       vit     T.t1
//   Övrigt löv  grå     T.gray
//
// Färg är ALDRIG ensam informationsbärare — varje stapel och prick som
// använder de här färgerna ska ha trädslagets namn i text bredvid sig.

export type TradslagStil = {
  fyll: string;
  /** Kontur att rita när underlaget är LJUST. Vit björk försvinner mot vitt
   *  papper, så en fyllning som inte håller mot alla bakgrunder måste bära
   *  sin egen kontur. null = fyllningen klarar sig själv.
   *
   *  På appens mörka bakgrund behövs den inte och ska inte ritas. Den finns
   *  för utskrift och PDF-export, där underlaget är vitt. */
  kontur: string | null;
};

const GRON = '#30D158';
const ORANGE = '#FF9F0A';
const VIT = '#FFFFFF';
const GRA = '#8E8E93';

export const TRADSLAG_STIL: Record<string, TradslagStil> = {
  Gran: { fyll: GRON, kontur: null },
  Tall: { fyll: ORANGE, kontur: null },
  'Björk': { fyll: VIT, kontur: GRA },
  'Övrigt löv': { fyll: GRA, kontur: null },
  // Trädslag som förekommer sällan. Egna färger så de inte krockar med de
  // fyra vanliga, men samma regel: namnet står alltid i text bredvid.
  Contorta: { fyll: '#FF6482', kontur: null },
  'Lärk': { fyll: '#FFD60A', kontur: null },
  Ek: { fyll: '#AC8E68', kontur: null },
  Bok: { fyll: '#BF5AF2', kontur: null },
  Asp: { fyll: '#64D2FF', kontur: null },
  Al: { fyll: '#5E5CE6', kontur: null },
};

/** För trädslag som inte finns i tabellen. Index håller dem isär inom samma
 *  diagram; de är sällsynta nog att en fast färg per art inte lönar sig. */
const RESERVFARGER = ['#8E8E93', '#5E5CE6', '#FF453A', '#AC8E68'];

export function tradslagStil(namn: string, i = 0): TradslagStil {
  return TRADSLAG_STIL[namn] ?? { fyll: RESERVFARGER[i % RESERVFARGER.length], kontur: null };
}

/** Bara fyllningen, för anropare som ritar mot mörk bakgrund. */
export function tradslagFarg(namn: string, i = 0): string {
  return tradslagStil(namn, i).fyll;
}

// ---------------------------------------------------------------------------
// Namn
// ---------------------------------------------------------------------------

// dim_tradslag bär maskinens egna namn i versaler, och samma trädslag stavas
// olika mellan maskiner ('ÖVR_LÖV' och 'ÖVR LÖV'). Normalisera innan
// gruppering, annars delas ett trädslag i två staplar med olika färg.
const TRADSLAG_NAMN: Record<string, string> = {
  TALL: 'Tall',
  GRAN: 'Gran',
  BJORK: 'Björk',
  'BJÖRK': 'Björk',
  OVR_LOV: 'Övrigt löv',
  'ÖVR_LÖV': 'Övrigt löv',
  CONTORTA: 'Contorta',
  LARK: 'Lärk',
  'LÄRK': 'Lärk',
  EK: 'Ek',
  BOK: 'Bok',
  ASP: 'Asp',
  AL: 'Al',
};

export function tradslagLabel(ratt: string | null | undefined): string {
  if (!ratt) return 'Okänt trädslag';
  const nyckel = ratt.trim().toUpperCase().replace(/\s+/g, '_');
  const traff = TRADSLAG_NAMN[nyckel];
  if (traff) return traff;
  const ord = nyckel.replace(/_/g, ' ').toLowerCase();
  return ord.charAt(0).toUpperCase() + ord.slice(1);
}
