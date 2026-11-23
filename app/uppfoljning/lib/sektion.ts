// Var en trakt hör hemma i uppföljningens meny. EN regel för menyn och sidan
// "Ligger i skogen" — flyttad oförändrad ur UppfoljningMeny.
import type { UppfoljningObjekt } from './transform';
import { paBackenKvar } from '@/lib/skotat';

// Egen skotning (säljaren skotar själv) → virket är inte VÅRT väntande arbete.
export function kvarM3(o: UppfoljningObjekt): number {
  return paBackenKvar(o.volymSkordare, o.volymSkotare, o.egenSkotning === true);
}

export type Sektion = 'skordare' | 'oskotat' | 'ovrigt' | 'avslutade';

// Brytdatum: historiken färdigmarkerades i DB detta datum. Objekt avverkade
// FÖRE med 0 lass skotades utan lassregistrering → Övrigt; EFTER → genuint
// oskotat på backen. (Oförändrad regel från gamla indexsidan.)
export const LASSDATA_START = '2026-07-21';

export function sektionAv(o: UppfoljningObjekt): Sektion {
  const seven = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const skordareAktiv = !!(o.skordareLastDate && o.skordareLastDate >= seven);
  // "Skördas ännu" bara när skördningen INTE är klar. skordareAktiv (fil senaste
  // 7 dagarna) är en proxy för "skördar fortfarande" — en trakt som blev
  // färdigskördad för 2–5 dagar sen har kvar en färsk fil men ÄR klar och väntar
  // på skotning. skordning_avslutad är den riktiga signalen; respektera den, så
  // ett sånt objekt landar i oskotat (liggetid) i stället för "skördas ännu".
  if (skordareAktiv && !o.skotningAvslutad && !o.skordningAvslutad) return 'skordare';
  if (o.skotningAvslutad) return 'avslutade';
  if (o.externSkotning || o.egenSkotning) return 'ovrigt';
  if (kvarM3(o) > 0) {
    if (o.antalLass > 0) return 'oskotat';
    if (o.sistaAvverkning && o.sistaAvverkning >= LASSDATA_START) return 'oskotat';
  }
  return 'ovrigt';
}
