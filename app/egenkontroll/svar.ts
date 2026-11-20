// Svarens ord och farger - EN gang, delat av rundvyn (page.tsx), provytorna och Oversikten.
//
// Ligger i en egen fil for att en Next-sida bara far exportera sin default: det som
// flera vyer behover kan inte bo i page.tsx.

import { T } from '@/lib/listTema';

// GULT, INTE ROTT, for "Kan bli battre". Ingen har brutit mot nagot - blir det
// rott slutar folk satta det, och da far vi "Godkant" pa allt och verktyget ar
// dott. Rott ar reserverat for avvikelser mot planen i Del 1.
// #FFD60A ar samma gult som datahalsobannern pa startsidan; T.orange betyder
// redan "gar ut snart" pa utbildningssidorna.
export const GUL = '#FFD60A';

/** Status i TEXT. Fargen upprepar bara det som redan star - den bar aldrig ensam. */
export const STATUS_TEXT: Record<string, { text: string; farg: string }> = {
  ok: { text: 'OK', farg: T.green },
  avvikelse: { text: 'Avvikelse', farg: T.red },
  bra: { text: 'Bra', farg: T.green },
  godkant: { text: 'Godkänt', farg: T.blue },
  battre: { text: 'Kan bli bättre', farg: GUL },
};

export function statusEtikett(status: string | null): { text: string; farg: string } {
  if (status && STATUS_TEXT[status]) return STATUS_TEXT[status];
  return { text: 'Obesvarad', farg: T.t2 };
}
