// Kartprickens brådska i GROT-läget (/oversikt-v2). Ren logik — ingen webbläsare, inga färger.
//
// En trakt MED markägarens datum (grot_senast) är den som någon väntar på: pricken blir större och mörkare orange med
// en liten datumetikett ('5 okt'). Har datumet passerat är pricken röd och etiketten säger 'försenad' (samma ord och
// samma gräns som listraden: dagarTillSenast < 0). Utan datum är pricken som förut. Dålig bärighet får INGEN markör på
// kartan — den står bara som text på raden och i arket.
//
// Den här filen avgör VEM som är brådskande och vad etiketten säger; page.tsx ritar. Samma lista (byggGrotLista) som
// raden, chippen och notisen — kartan har ingen egen tolkning av datumet.
import { arForsenad, type GrotRad } from './lista';
import { FORSENAD_TEXT, kortDatum } from './format';

export interface Bradskande {
  /** 'senast' = datum satt, inte passerat · 'forsenad' = datumet har passerat */
  typ: 'senast' | 'forsenad';
  /** Etikettens text: '5 okt' eller 'försenad' */
  text: string;
}

/** Brådskan för en GROT-rad, eller null när raden inte har något datum (pricken är då som förut).
 *  Datumet skrivs utan år ('5 okt'): etiketten är en skylt på kartan, och en rad som väntar på ett datum nästa år
 *  är ändå inte bråttom. Dagens datum är inte försenat (det blir det först i morgon), precis som på raden. */
export function bradskandeFor(rad: Pick<GrotRad, 'senast' | 'dagarTillSenast'>, idag: string): Bradskande | null {
  if (!rad.senast || rad.dagarTillSenast == null) return null;
  if (arForsenad(rad)) return { typ: 'forsenad', text: FORSENAD_TEXT };
  const text = kortDatum(rad.senast, idag, true);
  return text ? { typ: 'senast', text } : null;
}
