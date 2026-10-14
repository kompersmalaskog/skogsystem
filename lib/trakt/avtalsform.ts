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
  const nyckel = norm(raw);
  const form = Object.prototype.hasOwnProperty.call(URSPRUNG_TILL_AVTALSFORM, nyckel) ? URSPRUNG_TILL_AVTALSFORM[nyckel] : undefined;
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

const BOKSTAV = 'A-Za-zÅÄÖåäöÉéÜü';

/**
 * "Arbetsform" i TD:n är en KOLUMNRUBRIK, och värdet står sist på raden UNDER rubrikraden. Så här ser den ut efter unpdf (riktig fil,
 * Skälviken VO 11161397) — observera att unpdf klistrar ihop rubriken med nästa ("ArbetsformLKF"):
 *
 *   Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält:
 *   JOHANNISHUS 1:2 FSC PEFC 108101 Föryngringsavverkning
 *
 * Texten direkt efter etiketten ("LKF SKS-anmält:") är nästa rubrik, inte värdet. Rubrikraden känns igen på att den har Arbetsform OCH en
 * av sina syskonrubriker (Fastighetsbeteckning/Cert) — ett fritextstycke som nämner "arbetsform" räknas alltså inte.
 *
 * Returnerar raden under rubriken (råtext, för varningar), eller null om ingen rubrikrad hittas. Första rubrikraden som har en rad under gäller.
 */
export function parseArbetsform(text: string): string | null {
  const rader = text.split(/\r?\n/);
  for (let i = 0; i < rader.length - 1; i++) {
    if (!/Arbetsform/i.test(rader[i]) || !/Fastighetsbeteckning|\bCert\b/i.test(rader[i])) continue;
    for (let j = i + 1; j < rader.length; j++) {            // hoppa över tomma rader
      const rad = rader[j].replace(/\s+/g, ' ').trim();
      if (rad) return rad;
    }
  }
  return null;
}

export interface AtgardSvar {
  atgard: string | null;
  /** Bara när Arbetsform-raden FANNS men inget känt åtgärdsord stod i den — då är det värt att veta vad raden sade. */
  varning: string | null;
}

/** Känt åtgärdsord i raden (längsta först, hela ord — "gallringsskog" och "ÖVERGALLRING" är inte "gallring"). */
function hittaAtgardsord(rad: string): string | null {
  const lag = rad.toLowerCase();
  for (const [ord, atgard] of ARBETSFORM_TILL_ATGARD) {
    if (new RegExp(`(?<![${BOKSTAV}])${ord}(?![${BOKSTAV}])`, 'i').test(lag)) return atgard;
  }
  return null;
}

export function tolkaAtgard(text: string): AtgardSvar {
  const rad = parseArbetsform(text);
  if (rad === null) return { atgard: null, varning: null };   // ingen Arbetsform-kolumn i filen: tomt, ingen varning (det är normalt)
  const atgard = hittaAtgardsord(rad);
  if (atgard) return { atgard, varning: null };
  return { atgard: null, varning: `Arbetsform: inget känt åtgärdsord i raden "${rad.slice(0, 120)}" — åtgärd lämnades tom.` };
}
