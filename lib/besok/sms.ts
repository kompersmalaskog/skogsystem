// SMS till markägaren — texten är beställd ord för ord (Martin 2026-10-22). Appen skickar ALDRIG något: knappen öppnar telefonens Meddelanden med mottagare och text
// ifyllda (sms:-länk, samma som `app/oversikt-v2/sms`); planeraren läser, ändrar och trycker själv på skicka.

import { arIos, forstaNamn, smsHref } from '@/app/oversikt-v2/sms';
import { dagarMellan, idagStockholm } from '@/lib/grotvy/format';
import { FORETAG_TELEFON } from './konstanter';

export { arIos, smsHref };

const BOLAGSORD = /(förvaltning|\bab\b|aktiebolag|dödsbo|stiftelse|kommun|församling|förening|samfällighet|handelsbolag|\bhb\b|\bkb\b|bolag|fastigheter|\bkyrka)/i;

const stor = (s: string) => s.toLocaleLowerCase('sv-SE').replace(/(^|[-\s])(\p{L})/gu, (_m, a: string, b: string) => a + b.toLocaleUpperCase('sv-SE'));

/** Markägarens förnamn ur TD-fältet "Förnamn Efternamn" (ibland i versaler). Bolag, dödsbon och tomt namn ger null — då börjar texten med "Hej!". */
export function markagareFornamn(namn: string | null | undefined): string | null {
  const s = (namn ?? '').replace(/\s+/g, ' ').trim();
  if (!s || BOLAGSORD.test(s)) return null;
  const fn = forstaNamn(s);
  if (!fn || fn.length < 2) return null;
  return stor(fn);
}

/** "HÅLABÄCK 1:13" → "Hålabäck 1:13". Ord med siffror lämnas som de är. Tomt → null. */
export function fastighetText(f: string | null | undefined): string | null {
  const s = (f ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.split(' ').map((t) => (/\d/.test(t) ? t : stor(t))).join(' ');
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const datumOrd = (iso: string) => `${Number(iso.slice(8, 10))} ${MANADER[Number(iso.slice(5, 7)) - 1]}`;

export type NarIndata = {
  /** objekt.planerad_start (YYYY-MM-DD) */
  planeradStart: string | null | undefined;
  /** objekt.faktisk_start */
  faktiskStart?: string | null;
  /** objekt.pagaende_startad_timestamp */
  pagaendeStartad?: string | null;
  status?: string | null;
  nu?: Date;
};

/** "i dag" när en maskin redan startat eller planerad start är i dag, "i morgon" när den är i morgon, annars datumet ("den 28 oktober"), saknas allt "snart". */
export function narOrd(a: NarIndata): string {
  const nu = a.nu ?? new Date();
  const idag = idagStockholm(nu);
  const startad = a.status === 'pagaende' || a.status === 'skotning' || !!a.pagaendeStartad || (!!a.faktiskStart && ISO.test(a.faktiskStart) && a.faktiskStart <= idag);
  if (startad) return 'i dag';
  const p = a.planeradStart && ISO.test(a.planeradStart) ? a.planeradStart : null;
  if (!p) return 'snart';
  const d = dagarMellan(idag, p);
  if (d <= 0) return 'i dag';
  if (d === 1) return 'i morgon';
  return `den ${datumOrd(p)}`;
}

export type SmsIndata = {
  markagare: string | null | undefined;
  fastighet: string | null | undefined;
  nar: string;
  lank: string;
  avsandareNamn: string | null | undefined;
  avsandareTelefon: string | null | undefined;
  /** Företagets nummer – används när avsändaren saknar eget. Standard: FORETAG_TELEFON (lib/besok/konstanter). */
  foretagTelefon?: string | null;
};

/** Numret på sista raden: avsändarens eget, annars företagets. Tomt = ingen rad (planerarkortet säger det). */
export const smsNummer = (a: Pick<SmsIndata, 'avsandareTelefon' | 'foretagTelefon'>): string =>
  (a.avsandareTelefon ?? '').trim();

/** Telefon/surfplatta (kan öppna Meddelanden med en sms:-länk) eller dator? En iPad som utger sig för att vara en Mac räknas som surfplatta. */
export function arMobil(userAgent: string, maxTouchPoints: number = 0): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function besokSmsText(a: SmsIndata): string {
  const mark = markagareFornamn(a.markagare);
  const av = forstaNamn(a.avsandareNamn);
  const fast = fastighetText(a.fastighet);
  const tel = smsNummer(a);
  const rader = [
    mark ? `Hej ${mark}!` : 'Hej!',
    `${av ? `Jag heter ${av} och är` : 'Jag är'} från Kompersmåla Skog. Vi är entreprenör åt Vida och börjar avverka ${fast ? `på din fastighet ${fast}` : 'i din skog'} ${a.nar}.`,
    '',
    'Här kan du följa arbetet och se var maskinerna är:',
    a.lank,
    '',
    'Vill du komma ut? Anmäl dig i länken först, så får förarna veta att du kommer. Gå aldrig fram till en maskin som arbetar förrän föraren har sett dig och stannat.',
    '',
    'Hälsningar',
    `${av ? `${av}, ` : ''}Kompersmåla Skog`,
    ...(tel ? [tel] : []),
  ];
  return rader.join('\n');
}
