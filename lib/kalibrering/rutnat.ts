/**
 * RUTNÄT ÖVER TID — det som Per grovlek och Greppet delar: tidsstegen, tonerna och vad en ruta är.
 *
 * Beräkningarna bor i grovlek.ts (träff mot klaven) och greppTid.ts (maskinens egna stamprofiler). De returnerar rutor i den här formen så att
 * justeringsförslagen (nästa PR) kan läsa samma tal som vyn visar, och så att vyn ritar utan att räkna.
 *
 * EN STAM RÄKNAS EN GÅNG PER RUTA. Varje stam ger ETT värde till rutan (sin egen träffandel eller sin egen greppandel) och rutans värde är medelvärdet över
 * stammarna. En grov stam med många mätpunkter eller en lång stam med 250 steg väger alltså lika mycket som en klen. Antalet som visas och som grinden
 * ser är antalet stammar, inte antalet mätpunkter — punkterna på en stam hänger ihop och är inte oberoende.
 */
import { manadNamn } from './datum';
import { fmtPeriod, periodKey, type LagetSteg } from './diagnos';

export { fmtPeriod, periodKey };
export type { LagetSteg };

/** grön = når kravet, orange = godkänt men under målet, röd = under golvet, neutral = ingen bedömning mot krav, tunn = för få stammar. */
export type RutaTon = 'gron' | 'orange' | 'rod' | 'neutral' | 'tunn';

/** Perioderna (sorterade) som har minst en månad i `manader`, i valt tidssteg. */
export const perioderIn = (manader: string[], steg: LagetSteg): string[] =>
  Array.from(new Set(manader.map(m => periodKey(m, steg)))).sort();

/** Kravet en ruta mäts mot: ≥ mal är grönt, under golv är rött, däremellan orange. Samma som kravprofilens rader (bedomning.ts statusMotKrav). */
export type RutKrav = { mal: number; golv: number };

/** Ton för en träffprocent. Dömer på det HELTAL som visas i rutan — en ruta som står "85 %" får inte vara orange mot ett mål på 85. */
export const traffTon = (pct: number, krav: RutKrav | null): RutaTon => {
  if (!krav) return 'neutral';
  const visad = Math.round(pct);
  return visad >= krav.mal ? 'gron' : visad < krav.golv ? 'rod' : 'orange';
};

/** Heltalet som visas för ett tal med tecken: halvt avrundas bort från noll (−2,5 → −3, 2,5 → 3), så att + och − beter sig likadant. */
export const rundaMedTecken = (x: number): number => Math.sign(x) * Math.round(Math.abs(x));

/** Perioden i ord: "Oktober 2026", "Kvartal 3 2026", "2026". (Rutnätets kolumnrubriker är de korta, fmtPeriod.) */
export const periodNamn = (period: string, steg: LagetSteg): string =>
  steg === 'ar' ? period : steg === 'kvartal' ? `Kvartal ${period.slice(-1)} ${period.slice(0, 4)}` : manadNamn(period);
