// Traktens namn på besökssidan. Objektets namn är ofta Vidas internnamn ("RP J-Hus -25", "Skälviken au 2025") – markägaren ska se platsen, inte beställarens koder.
// Regel: rensa VO-nummer och årssuffix (som i SMS:et), ta bort ledande koder, klipp vid första kod efter ett riktigt ord. Blir inget kvar → fastighetsbeteckningen.
// Hittas inget heller → "Trakten" (aldrig en kod).

import { rensaObjektnamn } from '@/app/oversikt-v2/sms';

const ORDKOD = /^(au|rp|ga|lrk|vf|sa|bark|gallring|slutavverkning|föryngring|föryngringsavverkning|rotpost|avverkningsuppdrag|grot|\+|&)$/i;
const AR = /^(?:20)?2[4-9]$/;                    // 25 / 2025
const STREKKOD = /^[A-ZÅÄÖ]-[A-Za-zåäöÅÄÖ]{1,4}$/;   // J-Hus, A-A, M-R
const ENSAMBOKSTAV = /^[A-ZÅÄÖ]$/;

const arKod = (t: string) => ORDKOD.test(t) || AR.test(t) || STREKKOD.test(t) || ENSAMBOKSTAV.test(t) || /^-\d{2,4}$/.test(t);

export function besokNamn(namn: string | null | undefined, voNummer: string | null | undefined, fastighet: string | null | undefined): string {
  const tokens = rensaObjektnamn(namn, voNummer).split(' ').filter(Boolean);
  let i = 0;
  while (i < tokens.length && arKod(tokens[i])) i++;
  let j = i;
  while (j < tokens.length && !arKod(tokens[j])) j++;
  const rent = tokens.slice(i, j).join(' ').trim();
  if (rent) return rent;
  const f = (fastighet ?? '').replace(/\s+/g, ' ').trim();
  return f || 'Trakten';
}
