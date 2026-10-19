// Vad händer med ett lass? EN ren funktion som kor.ts och testerna delar.
//
//   avvisad           inget flyttlass (enstaka mätning, för lite last, ingen transport)
//   matchad_manuell   föraren har redan registrerat flytten: koppla, skapa ingen dubblett
//   auto (skapas)     maskinen är HÖG (eget GPS-spår följde bilen) OCH platserna är säkra OCH kund finns om flytten faktureras
//   vantar_maskin     allt annat: appen frågar "Vilken maskin?" (eller "Vilken kund?" när bara kunden saknas)
//
// Platserna kräver mer än maskinen: en flytt som hamnar på fel trakt syns som fel Från/Till på fakturan. Därför skapas en flytt av
// sig själv bara när bilen STOD STILLA vid båda ändarna (≤ 2 km/h, eller kröp alldeles vid en trakt) och båda ligger inom 2 km från
// en trakt/plats. Annars frågar appen — och den som svarar ser det framräknade Från/Till och kan rätta det i Fakturering.
//
// Kund: till-traktens bolag (Privat → markägaren). Saknas den och flytten faktureras är lasset osäkert — ingen gissad kund.

import { fakturerbarEffektiv } from '@/lib/flytt/fakturerbar';
import { kundFranTrakt } from '@/lib/flytt/kundForslag';
import { LASS, type DetektLass } from './detektera';
import type { MaskinBedomning } from './maskin';
import type { ManuellTraff } from './matcha';
import { PLATS_NARA_M, type FunnenPlats } from './plats';

export type LassStatus = 'auto_flytt' | 'vantar_maskin' | 'matchad_manuell' | 'avvisad';
export type StatusOrsak = 'sakerhet' | 'kund_saknas' | 'plats_osaker' | string;

export interface BeslutIn {
  lass: DetektLass;
  fran: FunnenPlats | null;
  till: FunnenPlats | null;
  bedomning: MaskinBedomning;
  manuell: ManuellTraff;
}

export interface Beslut {
  status: LassStatus;
  status_orsak: StatusOrsak | null;
  /** Skapa flytten nu (anropa skapa_flytt_ur_lass). Raden skrivs först som vantar_maskin; funktionen sätter auto_flytt. */
  autoSkapa: boolean;
  kund: string | null;
  flyttTyp: 'produktion' | 'service';
  fakturerbar: boolean;
}

/** Flyttyp som databasfunktionen sätter: verkstad som mål = service, annars produktion. */
export function flyttTypFor(till: FunnenPlats | null): 'produktion' | 'service' {
  return till?.typ === 'plats' && till.kandidat.platsTyp === 'verkstad' ? 'service' : 'produktion';
}

export function kundForLass(till: FunnenPlats | null): string | null {
  if (!till || till.typ !== 'objekt') return null;
  return kundFranTrakt({ bolag: till.kandidat.bolag, markagare: till.kandidat.markagare })?.namn ?? null;
}

export function beslutaLass(i: BeslutIn): Beslut {
  const flyttTyp = flyttTypFor(i.till);
  const kund = kundForLass(i.till);
  const fakturerbar = i.lass.km != null && fakturerbarEffektiv(flyttTyp, i.lass.km, null);
  const bas = { kund, flyttTyp, fakturerbar, autoSkapa: false };

  if (i.lass.avvisad) return { ...bas, status: 'avvisad', status_orsak: i.lass.avvisad };
  if (i.manuell?.typ === 'match') return { ...bas, status: 'matchad_manuell', status_orsak: null };

  const hog = i.bedomning.sakerhet === 'hog' && !!i.bedomning.forslag;
  const platsOk = !!i.fran && !!i.till
    && i.fran.avstandM <= PLATS_NARA_M && i.till.avstandM <= PLATS_NARA_M
    && i.lass.lassning.saker && i.lass.lossning.saker
    && i.lass.km != null && i.lass.km >= LASS.MIN_TRANSPORT_KM;

  if (hog && platsOk && (!fakturerbar || !!kund)) return { ...bas, status: 'vantar_maskin', status_orsak: null, autoSkapa: true };
  if (hog && platsOk) return { ...bas, status: 'vantar_maskin', status_orsak: 'kund_saknas' };
  if (hog) return { ...bas, status: 'vantar_maskin', status_orsak: 'plats_osaker' };
  return { ...bas, status: 'vantar_maskin', status_orsak: 'sakerhet' };
}
