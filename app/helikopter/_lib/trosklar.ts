// Alla trösklar och konstanter för /helikopter — EN fil. Inga magiska tal i komponenter.
// Ändra här, aldrig i en komponent. SQL-sidan har egna kopior där det står.

/** Planeringsgolv: 8 h dagtid per arbetsdag. Övertid och extramaskin är buffert och räknas aldrig in. */
export const TIMMAR_PER_DAG = 8

/** Takten (m³fub/dag) räknas på de senaste N gångna arbetsdagarna. SQL: LIMIT 5 i helikopter_ny_spar/_bolag/_maskin. */
export const TAKT_FONSTER_DAGAR = 5

/** Ingen prognos före arbetsdag 4 i månaden — kräver PROGNOS_FRAN_ARBETSDAG − 1 gångna arbetsdagar med takt. */
export const PROGNOS_FRAN_ARBETSDAG = 4

/** |dagar efter| under detta visas som "På plan" i stället för ett dagtal. */
export const PA_PLAN_GRANS_DAGAR = 1

/** Oskotat räknas "i takt" när förändringen per dag ligger inom ± ett halvt lass. */
export const OSKOTAT_I_TAKT_M3_PER_DAG = 8

/** Auto-avslut av skotning: öppna objekt utan produktion OCH lass på så här många dagar stängs (skotning_avslutad_auto). SQL-default i helikopter_auto_avslut_skotning(p_dagar). */
export const AUTO_AVSLUT_DAGAR = 14

/** Bolagets historiska avvikelse (verklig/planerad volym) används först vid så här många avslutade objekt. */
export const MIN_HISTORIK_OBJEKT = 5

/** Utan historik flaggas "saknas" i Planering när gapet är större än så här stor andel av beställt. */
export const SAKNAS_GRANS_UTAN_HISTORIK = 0.10

/** Veckoorsakens maxlängd i tecken. Samma som CHECK-villkoret på helikopter_veckoorsak.orsak. */
export const ORSAK_MAX_TECKEN = 60

/** volym_m3sub är m³fub. Dokumenterad här och i migrationen; används inte i någon formel. */
export const M3FUB_FAKTOR = 1
