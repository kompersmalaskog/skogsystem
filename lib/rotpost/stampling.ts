// STÄMPLINGEN MOT SKÖRDAREN — vad stämplingslängden sa att trakten skulle ge, och vad den gav.
//
// Prognosen räknas med SAMMA berakna() som stämplingssidan (Räkna → Ladda upp stämplingslängd): vår egen avverkade skog per
// trädslag och diameterklass, rötan vid vår median (det man hade antagit vid köpet). Bara barr finns i modellen; löv och torra
// träd i stämplingslängden räknas inte. Facit är skördarens mätning för hela trakten (utfall_objekt).
//
// Obs: trakten själv kan ingå i modellen (stamplings_klass bygger på all avverkad skog) — det gör prognosen något för bra.

import { berakna, type Cell, type Meta, type Rad, type Volymer } from '@/lib/stampling/berakna';
import { slagTyp } from '@/lib/stampling/pdf/kontroll';
import type { Lasning } from '@/lib/stampling/pdf/rapport';

export type StamplingJamforelse = {
  /** Vad stämplingslängden borde ge enligt modellen, m³fub. */
  prognos: Volymer;
  /** Barrträd i stämplingslängden som räknats (tall, gran, övrigt barr). */
  trad: number;
  /** Träd i stämplingslängden som inte räknats (löv, torra, okända). */
  utanforModellen: number;
  forrattare: string | null;
  datum: string | null;
};

/** Stämplingslängdens rader i modellens form. Bara tall, gran och övrigt barr. */
export function raderUrLasning(l: Lasning): { rader: Rad[]; utanfor: number } {
  const rader: Rad[] = [];
  let utanfor = 0;
  for (const t of l.tradslag) {
    const typ = slagTyp(t.namn);
    const antal = t.klasser.reduce((a, k) => a + (k.antal > 0 ? k.antal : 0), 0);
    if (typ === 'tall' || typ === 'gran' || typ === 'ovrigt_barr') {
      for (const k of t.klasser) if (k.antal > 0) rader.push({ slag: typ, cm: k.diameter_cm, antal: k.antal });
    } else utanfor += antal;
  }
  return { rader, utanfor };
}

export function jamforStampling(l: Lasning, celler: Cell[], meta: Meta): StamplingJamforelse {
  const { rader, utanfor } = raderUrLasning(l);
  const res = berakna(rader, celler, meta, null);   // null = rötan vid vår median, som vid ett köp
  return { prognos: res.total, trad: res.trad, utanforModellen: utanfor, forrattare: l.post.forrattare, datum: l.post.datum };
}

/** Skillnad i procent mot prognosen, avrundad till hela procent; null när prognosen är noll. */
export function procentMot(faktiskt: number, prognos: number): number | null {
  return prognos > 0 ? Math.round((100 * (faktiskt - prognos)) / prognos) : null;
}
