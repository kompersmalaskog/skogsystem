// Besök på trakten — konstanter som ska gå att ändra på ETT ställe. Inget annat i besöksflödet har ett eget avstånd eller en egen tid.

/** Ringarna på besökssidans karta, i meter, per typ. Skördare: träd faller åt alla håll. Skotare: bara närmast kring maskinen (ingen gång bakom/vid lasten). Motorsåg ≈ trädlängd + marginal. */
export const BESOK_RING_M = { skordare: 70, skotare: 20, motorsag: 40 } as const;

/** Ringen runt maskinen i HYTTEN medan ett besök är aktivt — samma för alla maskiner. */
export const HYTT_RING_M = 70;

/** Ett besök är aktivt till besökstiden + detta (minuter). Ringen i hytten ritas så länge; kortet ligger kvar tills Uppfattat. */
export const BESOK_EFTERTID_MIN = 120;

/** En maskin räknas som "på trakten" på besökssidan om dess senaste hyttspårspunkt är yngre än detta (minuter). */
export const MASKIN_FERSK_MIN = 240;

/** Hytten läser besöken så här ofta (ms) — kravet är ≤ 5 s. */
export const HYTT_POLL_MS = 4000;

/** Besökssidan läser om kartan och kvitteringen så här ofta (ms). */
export const PUBLIK_POLL_MS = 15000;

/** Skydd mot att någon fyller loggen: högst så här många anmälningar per objekt och timme. */
export const BESOK_MAX_PER_TIMME = 20;

/** En anmälan får ligga högst så här långt fram (timmar). */
export const BESOK_MAX_FRAMAT_H = 36;

/** Antal dagar med produktion som takten räknas på. "Klart ca" visas bara när det finns så här många dagar för varje del som återstår (färre = ingen dag sägs). */
export const TAKT_DAGAR = 5;

/** "Klart ca" – villkor för att prognosen håller (lib/besok/framsteg). Faller något villkor visas bara "% klart".
 *  TAKT_STABIL: varje av de senaste dagarna ligger inom ±så här stor andel av snittet. SENASTE_DAG_MAX: senaste produktionsdagen får vara högst så här många kalenderdagar gammal.
 *  HORISONT_MAX: högst så här många arbetsdagar kvar – längre än så är en gissning. */
export const PROGNOS = { TAKT_STABIL: 0.5, SENASTE_DAG_MAX: 3, HORISONT_MAX: 15 } as const;

/** Företagets nummer. Står som sista rad i SMS:et när planeraren som skickar saknar eget nummer (medarbetare.telefon). SKA FYLLAS I – tomt = ingen nummerrad, och planerarkortet säger det.
 *  Format som det ska stå i SMS:et, t.ex. "0470-123 45". */
export const FORETAG_TELEFON = '';

/** Länken är en slumpad token av minst så här många tecken (databasen kräver detsamma). */
export const TOKEN_MIN_TECKEN = 32;
