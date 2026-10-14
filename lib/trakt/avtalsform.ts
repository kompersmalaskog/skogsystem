// Avtalsform och åtgärd ur Vidas traktdirektiv (TD-PDF:en i envz). Rena funktioner, ingen I/O.
//
// Två olika frågor som tidigare låg i samma fält (`atgard`):
//   * AVTALSFORM — hur trakten är avtalad: Rp (rotpost), Au (avverkningsuppdrag), LRK, VF/Bark. Står i TD:ns sidhuvud under "Ursprung".
//   * ÅTGÄRD     — vad som görs: Första gallring, Gallring, Föryngring, … Står i TD under "Arbetsform".
//
// Importen hårdkodade förut `atgard = slutavverkning ? 'Au' : 'Gallring'` — Skälviken (rotpost) blev Au. Nu läses värdena ur filen, och
// står det inget som går att tolka lämnas fältet TOMT med en varning som citerar råtexten. Inget gissas.

/** Värdena Redigering erbjuder för avtalsform (bara slutavverkning). */
export const AVTALSFORMER = ['Au', 'Rp', 'LRK', 'VF/Bark'] as const;
export type Avtalsform = (typeof AVTALSFORMER)[number];

/** TD:ns ord för avtalsformen -> appens kortform. Bara de två som TD-sidhuvudet faktiskt bär; allt annat är okänt. */
const URSPRUNG_TILL_AVTALSFORM: Record<string, Avtalsform> = {
  rotpost: 'Rp',
  rp: 'Rp',
  avverkningsuppdrag: 'Au',
  au: 'Au',
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Ett kort utdrag ur texten efter en etikett — för varningar som ska visa VAD filen faktiskt sade. */
function utdragEfter(text: string, etikett: RegExp, langd = 120): string {
  const m = etikett.exec(text);
  if (!m) return '';
  return text.slice(m.index, m.index + langd).replace(/\s+/g, ' ').trim();
}

/**
 * "Ursprung" ur TD-sidhuvudet. Rubrikraden är
 *   "Traktnr Kontraktsnr Ursprung Datum"
 * och värdena kommer i samma kolumnordning efter den ("887818 972548 (anges vid fakturering) Rotpost 2026-…"). Texten mellan
 * "(anges vid fakturering)" och datumet är Ursprung. Faller tillbaka på "Ursprung: <värde>" om sidhuvudet ser annorlunda ut.
 * Returnerar råtexten (tom sträng = etiketten hittades men ingen text), eller null om inget Ursprung alls kunde läsas.
 */
export function parseUrsprung(text: string): string | null {
  const efterHuvud = text.match(
    /Traktnr\s+Kontraktsnr\s+Ursprung\s+Datum\s+\d{6}\s+(?:\d{6}\s+)?\(anges vid fakturering\)\s*([A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö \-]{0,40}?)\s*(?=\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4}|\n|$)/i,
  );
  if (efterHuvud) return efterHuvud[1].trim();
  const medKolon = text.match(/Ursprung\s*:\s*([A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö \-]{0,40}?)\s*(?=\d|\n|$)/i);
  if (medKolon) return medKolon[1].trim();
  return null;
}

export interface AvtalsformSvar {
  /** Au / Rp, eller null när TD saknar uppgiften eller säger något vi inte känner igen. */
  avtalsform: Avtalsform | null;
  /** Finns bara när avtalsform blev tom — råtexten ingår så att någon kan se varför. */
  varning: string | null;
}

export function tolkaAvtalsform(text: string): AvtalsformSvar {
  const raw = parseUrsprung(text);
  if (raw === null) {
    const utdrag = utdragEfter(text, /Ursprung/i);
    return {
      avtalsform: null,
      varning: utdrag
        ? `Ursprung kunde inte läsas ur traktdirektivet (text efter etiketten: "${utdrag}") — avtalsform lämnades tom.`
        : 'Traktdirektivet har inget "Ursprung" — avtalsform lämnades tom.',
    };
  }
  if (raw === '') return { avtalsform: null, varning: 'Ursprung är tomt i traktdirektivet — avtalsform lämnades tom.' };
  const form = URSPRUNG_TILL_AVTALSFORM[norm(raw)];
  if (form) return { avtalsform: form, varning: null };
  return { avtalsform: null, varning: `Ursprung "${raw}" känns inte igen (kända: Rotpost, Avverkningsuppdrag) — avtalsform lämnades tom.` };
}

/**
 * Åtgärdsorden TD:ns "Arbetsform" kan bära, och vad de betyder i appen. Längsta först (så "första gallring" tas före "gallring").
 * Bara det som entydigt pekar på en åtgärd står här. "Slutavverkning"/"Övrig avverkning" och liknande säger typ, inte åtgärd.
 */
const ARBETSFORM_TILL_ATGARD: ReadonlyArray<readonly [string, string]> = [
  ['första gallring', 'Första gallring'],
  ['forsta gallring', 'Första gallring'],
  ['andra gallring', 'Andra gallring'],
  ['lövgallring', 'Lövgallring'],
  ['gallring', 'Gallring'],
  ['föryngringsavverkning', 'Föryngring'],
];

/** Råtexten efter etiketten "Arbetsform" (högst ~40 tecken, bokstäver). null = etiketten finns inte. */
export function parseArbetsform(text: string): string | null {
  const m = text.match(/Arbetsform\s*:?\s*([A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö \-]{0,40})/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

export interface AtgardSvar {
  atgard: string | null;
  /** Bara när Arbetsform FANNS men inte pekade entydigt på en åtgärd — då är det värt att veta vad den sade. */
  varning: string | null;
}

export function tolkaAtgard(text: string): AtgardSvar {
  const raw = parseArbetsform(text);
  if (raw === null) return { atgard: null, varning: null };   // ingen Arbetsform i filen: tomt, ingen varning (det är normalt)
  const n = norm(raw);
  for (const [ord, atgard] of ARBETSFORM_TILL_ATGARD) {
    // Ordet ska stå först och avslutas vid ordgräns ("gallringsskog" är inte "gallring").
    if (n === ord || n.startsWith(ord + ' ')) return { atgard, varning: null };
  }
  return { atgard: null, varning: `Arbetsform "${raw}" pekar inte entydigt på en åtgärd — åtgärd lämnades tom.` };
}
