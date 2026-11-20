// MIN TID: årets övertid, förarens egen vy. Samma beräkning som lagkontrollen i Admin och som lönen — månadens ordinarie, per kalendermånad
// (lib/lonesystem/arsovertid `modeller.manad`; Martin 2026-10-19). Förut räknade Min tid en egen loop (timmar − vardagar × 8 per månad,
// utan frånvaro, anställning eller utjämning) och visade ett annat tal än Admin för samma förare.
//
// Tunn omslagsfunktion: tar det Min tid redan har i minnet (årets arbetsdag-rader, årets extra tid, årets frånvaro, utjämningsperioderna)
// och hämtar året och dagens datum ur `idag`. Rader utanför det året räknas inte.
import { beraknaArsovertid, type ArsovertidDag, type ArsovertidExtra, type Utjamningsperiod } from "./arsovertid";
import type { FranvaroRad } from "../franvaro";

export type MinTidArsovertidIndata = {
  dagar: ArsovertidDag[];
  extra: ArsovertidExtra[];
  franvaro: FranvaroRad[];
  utjamning: Utjamningsperiod[];
  /** medarbetare.anstallningsdatum. */
  anstallningsdatum?: string | null;
  /** gs_avtal.helglon_dagar. */
  helglonNamn?: string | null;
  /** gs_avtal.ordinarie_vecka_h. */
  ordinarieVeckaH?: number | null;
  /** Nu — i förarens lokala tid (året och "hittills" följer den). */
  idag: Date;
};

const lokalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Timmar övertid hittills i år (en decimal), månadsregeln. */
export function minTidArsovertid(i: MinTidArsovertidIndata): { timmar: number } {
  const ar = i.idag.getFullYear();
  const a = beraknaArsovertid(i.dagar, i.extra, ar, lokalIso(i.idag), i.utjamning, i.franvaro, {
    anstallningsdatum: i.anstallningsdatum ?? null, helglonNamn: i.helglonNamn ?? null, ordinarieVeckaH: i.ordinarieVeckaH ?? null,
  });
  return { timmar: a.modeller.manad };
}
