// Alla trösklar och konstanter för /helikopter — EN fil. Inga magiska tal i komponenter.
// Ändra här, aldrig i en komponent. SQL-sidan har egna kopior där det står.

/** Planeringsgolv: 8 h dagtid per arbetsdag. Övertid och extramaskin är buffert och räknas aldrig in. */
export const TIMMAR_PER_DAG = 8

/**
 * Takten (m³fub/dag) räknas på de senaste N dagar MASKINEN KÖRDE eller borde ha kört (oförklarade, räknas som 0).
 * Planerade stopp — ledig förare utan fil — hoppas över: de är varken dåliga dagar eller arbetsdagar. SQL: helikopter_ny_takt (LIMIT 5 per maskin),
 * helikopter_ny_maskin; bolagstakten (helikopter_ny_bolag) räknas fortfarande på de globala dagarna.
 */
export const TAKT_FONSTER_DAGAR = 5

/** Ingen prognos före arbetsdag 4 i månaden — kräver PROGNOS_FRAN_ARBETSDAG − 1 gångna arbetsdagar med takt. */
export const PROGNOS_FRAN_ARBETSDAG = 4

/**
 * SVARSRADEN STYRS AV PROGNOS MOT BESTÄLLT, inte av dagar efter/före plan. Läge, Uppföljningens spårkort, Veckoläget och onsdagsnotisen svarar alla på
 * EN fråga: landar vi på beställningen — både skördat och skotat? (landarRoller i berakningar.ts: hittills + takt × arbetsdagar kvar, per roll.)
 * Det finns därför ingen tröskel för "landar under": jämförelsen görs på de avrundade talen (landar < beställt).
 *
 * dagarEfter() och den här gränsen ligger kvar i berakningar.ts men styr bara det som fortfarande räknar mot plan idag (planstrecket och
 * orange stapel i MOT BESTÄLLNING på Läge) — inte längre svarsrad, spårkort, stort tal eller flaskhalsruta.
 *
 * |dagar efter| under detta visas som "På plan" i stället för ett dagtal.
 */
export const PA_PLAN_GRANS_DAGAR = 1

/**
 * "Landar över beställt": skotat-prognosen ligger mer än så här över beställt. Att köra över är inte grönt — svarsraden blir dämpad
 * ("Gallring landar 380 över beställt · Räcker ca 22 okt · resten går på november"), aldrig orange (inget är fel) och aldrig grön.
 * Jämförs på de avrundade talen. Upp till gränsen är "Landar på beställningen".
 */
export const OVER_BESTALLT_GRANS = 0.05

/** Oskotat räknas "i takt" när förändringen per dag ligger inom ± ett halvt lass. */
export const OSKOTAT_I_TAKT_M3_PER_DAG = 8

/**
 * Auto-avslut av skotning: öppna objekt utan produktion OCH lass på så här många dagar stängs (skotning_avslutad_auto).
 * 30, inte 14: skotaren kommer ofta mer än två veckor efter skördaren — med 14 stängdes objekt som bara väntade på skotaren.
 * SQL-default i helikopter_auto_avslut_skotning(p_dagar) och cron-raden (20260912110100) säger samma sak.
 */
export const AUTO_AVSLUT_DAGAR = 30

/** Bolagets historiska avvikelse (verklig/planerad volym) används först vid så här många avslutade objekt. */
export const MIN_HISTORIK_OBJEKT = 5

/** Utan historik flaggas "saknas" i Planering när gapet är större än så här stor andel av beställt. */
export const SAKNAS_GRANS_UTAN_HISTORIK = 0.10

/** Veckoorsakens maxlängd i tecken. Samma som CHECK-villkoret på helikopter_veckoorsak.orsak. */
export const ORSAK_MAX_TECKEN = 60

/** volym_m3sub är m³fub. Dokumenterad här och i migrationen; används inte i någon formel. */
export const M3FUB_FAKTOR = 1
