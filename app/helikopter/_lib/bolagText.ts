// Per bolag — "Hur går det per bolag?": skotat av beställt, en stapel och ett ord ("Räcker", "Fattas 60", "Klart"). Ren modell, samma tal som förut
// (lovat = beställt, skotat, prognos = skotat + takt × dagar kvar, prognosPerBolag). Skördat visas inte här (det står i CSV:n).
import { fmt } from './format'

export type BolagVy = {
  hoger: string
  ord: string
  /** Neutral = klart eller inget att jämföra; "bra" = räcker; "brist" = fattas. Färgen förstärker bara ordet. */
  ton: 'neutral' | 'bra' | 'brist'
  /** 0–1 mot beställt; null utan beställning (ingen stapel att rita). */
  andel: number | null
  prognosAndel: number | null
}

export function bolagVy(r: { lovat: number; skotat: number; prognos: number }, harPrognos: boolean): BolagVy {
  if (r.lovat <= 0) return { hoger: fmt(r.skotat), ord: 'Ingen beställning', ton: 'neutral', andel: null, prognosAndel: null }
  const hoger = `${fmt(r.skotat)} av ${fmt(r.lovat)}`
  const andel = Math.min(1, r.skotat / r.lovat)
  if (r.skotat >= r.lovat) {
    const over = Math.round(r.skotat - r.lovat)
    return { hoger, ord: over > 0 ? `Klart · ${fmt(over)} över` : 'Klart', ton: 'neutral', andel, prognosAndel: null }
  }
  if (!harPrognos) return { hoger, ord: `Fattade ${fmt(r.lovat - r.skotat)}`, ton: 'brist', andel, prognosAndel: null }
  const prognosAndel = Math.min(1, r.prognos / r.lovat)
  if (r.prognos >= r.lovat) return { hoger, ord: `Ser ut att bli ${fmt(r.prognos)} · räcker`, ton: 'bra', andel, prognosAndel }
  return { hoger, ord: `Ser ut att bli ${fmt(r.prognos)} · fattas ${fmt(r.lovat - r.prognos)}`, ton: 'brist', andel, prognosAndel }
}
