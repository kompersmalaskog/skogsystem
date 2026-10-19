// Hur många lass väntar på ett svar? Samma tal på /lastbil (raden överst) och som märke på startsidans Lastbilen-kort.
//
// Ett lass räknas först när frågan kan ha gått ut (NOTIS_FORDROJNING_MIN efter lossningen): under tiden väntar cron:en på maskinernas
// GPS-spår och kan lösa lasset själv — att visa "1 lass saknar maskin" som sedan försvinner av sig själv vore brus.
// Läsfel är null (inget märke), aldrig 0. Förare ser inget: RLS släpper bara igenom admin, så svaret blir 0 och ingen rad visas.

import { NOTIS_FORDROJNING_MIN } from './notis';

export const lassSaknarText = (n: number): string => `${n} lass saknar maskin`;

export const fragaGarUtFore = (nuMs: number): string => new Date(nuMs - NOTIS_FORDROJNING_MIN * 60_000).toISOString();

export async function hamtaAntalVantandeLass(sb: any, nuMs: number = Date.now()): Promise<number | null> {
  try {
    const { count, error } = await sb.from('lastbil_lass')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'vantar_maskin')
      .lte('lossning_tid', fragaGarUtFore(nuMs));
    if (error || typeof count !== 'number') return null;
    return count;
  } catch {
    return null;
  }
}
