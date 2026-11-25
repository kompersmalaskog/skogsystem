// "Vad gjorde du 05:30–06:30?" — tid i förarens dag som maskinen inte gick
// (Martin 2026-11-25). Föraren rättar oftast sin tid i stället för att lägga in
// extra arbete; då ska appen fråga vad tiden var, så den kan faktureras.
//
// Källorna:
//   • synk_avvikelse — maskinens tider mot förarens. Skrivs av MOM-synken för
//     bekräftade dagar, och av appen själv när föraren ändrar sina tider
//     (avvikelseVidTidsandring nedan). Synken rör aldrig en redigerad dag, så
//     appens värde ligger kvar.
//   • tidigarelagd_start — förarens start ligger före maskinens inloggning.
//
// Luckorna ligger per definition INOM förarens pass (han har förlängt det), så
// ett svar blir ett dagsegment: tiden är redan betald, den märks bara.

import { periodMin } from "@/lib/dagsegment";

export type TidsAvvikelse = {
  bekraftad_start: string; bekraftad_slut: string; bekraftad_rast_min?: number;
  mom_start: string; mom_slut: string; mom_rast_min?: number;
  upptackt?: string; kalla?: string;
  kvitterad?: string; val?: string; aktivitet?: string | null; segment_id?: string | number;
};

export type Lucka = { start: string; slut: string; minuter: number };

/** Kortaste luckan appen frågar om. Mindre än en kvart är inloggning och sånt. */
export const LUCKA_MIN = 15;

const hhmm = (t: string | null | undefined) => (t || "").slice(0, 5);

/**
 * Ny synk_avvikelse när föraren sparar nya tider.
 *  - `andra: false` = rör inte fältet (maskinens tider är okända).
 *  - `varde: null`  = tiderna stämmer med maskinen igen, nolla fältet.
 * Maskinens tider tas ur den befintliga avvikelsen, annars ur raden själv så länge
 * den aldrig redigerats (då är det synkens tider) och maskinen skickar filer.
 */
export function avvikelseVidTidsandring(
  rad: { start_tid?: string | null; slut_tid?: string | null; rast_min?: number | null; redigerad?: boolean | null; synk_avvikelse?: TidsAvvikelse | null } | null | undefined,
  ny: { start: string; slut: string; rast: number },
  maskinSkickarFiler: boolean,
  nu: string = new Date().toISOString(),
): { andra: false } | { andra: true; varde: TidsAvvikelse | null } {
  if (!rad) return { andra: false };
  const bef = rad.synk_avvikelse || null;
  let mom: { start: string; slut: string; rast: number } | null = null;
  if (bef?.mom_start) mom = { start: hhmm(bef.mom_start), slut: hhmm(bef.mom_slut), rast: bef.mom_rast_min ?? 0 };
  else if (maskinSkickarFiler && !rad.redigerad && rad.start_tid) mom = { start: hhmm(rad.start_tid), slut: hhmm(rad.slut_tid), rast: rad.rast_min ?? 0 };
  if (!mom) return { andra: false };
  const nyS = hhmm(ny.start), nyE = hhmm(ny.slut);
  if (nyS === mom.start && nyE === mom.slut && ny.rast === mom.rast) return { andra: true, varde: null };
  // Samma förartider som förut: låt kvittensen stå.
  if (bef && hhmm(bef.bekraftad_start) === nyS && hhmm(bef.bekraftad_slut) === nyE && (bef.bekraftad_rast_min ?? 0) === ny.rast) {
    return { andra: false };
  }
  return {
    andra: true,
    varde: {
      mom_start: mom.start, mom_slut: mom.slut, mom_rast_min: mom.rast,
      bekraftad_start: nyS, bekraftad_slut: nyE, bekraftad_rast_min: ny.rast,
      upptackt: nu, kalla: "forare",
    },
  };
}

/** Luckorna (före och efter maskinen) som är minst LUCKA_MIN långa. Ett hoppat svar frågas inte igen. */
export function tidsluckor(
  rad: { synk_avvikelse?: TidsAvvikelse | null; tidigarelagd_start?: { angiven_start: string; maskin_start: string; val?: string } | null } | null | undefined,
): Lucka[] {
  if (!rad) return [];
  const kand: Lucka[] = [];
  const lagg = (start: string, slut: string) => {
    const s = hhmm(start), e = hhmm(slut);
    if (!s || !e) return;
    const m = periodMin(s, e);
    if (m >= LUCKA_MIN) kand.push({ start: s, slut: e, minuter: m });
  };
  const a = rad.synk_avvikelse;
  if (a && a.val !== "hoppad") {
    if (a.bekraftad_start && a.mom_start) lagg(a.bekraftad_start, a.mom_start);
    if (a.bekraftad_slut && a.mom_slut) lagg(a.mom_slut, a.bekraftad_slut);
  }
  const tl = rad.tidigarelagd_start;
  if (tl && tl.val !== "hoppad") lagg(tl.angiven_start, tl.maskin_start);
  // Samma lucka från två källor = en fråga.
  const unika: Lucka[] = [];
  for (const l of kand.sort((x, y) => x.start.localeCompare(y.start))) {
    if (!unika.some(u => u.start < l.slut && l.start < u.slut)) unika.push(l);
  }
  return unika;
}

/** Är luckan märkt av ett segment? Svaret = segmentets aktivitet. */
export function luckansSegment<T extends { start_tid: string | null; slut_tid: string | null }>(l: Lucka, segment: T[]): T | null {
  return segment.find(x => hhmm(x.start_tid) < l.slut && l.start < hhmm(x.slut_tid)) || null;
}
