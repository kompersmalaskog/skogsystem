/**
 * "Har vädret ändrat sig sedan senaste kontrollen?" (Kalibrering, 2026-11-18, Martin: "vädret måste komma i realtid så maskinen får en varning –
 * kolla längden, för vädret har ändrat sig"). Skogforsk: fruset virke mäts annorlunda än ofruset, så efter ett väderomslag ska man
 * kontrollmäta i stället för att vänta på nästa planerade kontroll.
 *
 * Underlaget är SMHI:s timvärden från stationen närmast maskinen (lib/smhi-obs), samma station för "då" och "nu" — så det fungerar samma
 * dag, inte efter ERA5-arkivets fem dagar. Saknas stationens värde vid kontrollen används kontrollens eget väder (weather_at_harvest).
 *
 * Tre lägen, gränserna ur appens befintliga regel (KALL_GRANS_C = −7 °C, "I sträng kyla"):
 *   varmt  över 0 °C   · ofruset virke
 *   fruset 0 till −7   · virket fryser
 *   kallt  −7 och under · sträng kyla
 * Omslag = läget nu (snitt senaste 6 timmarna) är ett annat än vid kontrollen (snitt 6 h före till 1 h efter) OCH skillnaden är minst 4 grader —
 * annars skulle en dag som svänger runt noll ge en varning varje timme. Appen föreslår ingen justering, bara en kontrollmätning.
 */
import type { TempObs } from '@/lib/smhi-obs';
import { KALL_GRANS_C, grader } from './kontrollLista';

export type VaderKlass = 'varmt' | 'fruset' | 'kallt';

export const OMSLAG_MIN_GRADER = 4;
export const NU_FONSTER_H = 6;
export const MIN_VARDEN = 3;
const TIM = 3_600_000;

export const vaderKlass = (t: number): VaderKlass => (t > 0 ? 'varmt' : t > KALL_GRANS_C ? 'fruset' : 'kallt');

/** Snitt av värdena i [fran, till]. null under MIN_VARDEN värden (en enstaka timme är ingen temperatur). */
export function medelTemp(obs: readonly TempObs[], franMs: number, tillMs: number, minVarden = MIN_VARDEN): number | null {
  let s = 0, n = 0;
  for (const o of obs) if (o.ms >= franMs && o.ms <= tillMs) { s += o.temp; n++; }
  return n >= minVarden ? s / n : null;
}

export type VaderLage = {
  /** Snitt senaste 6 h. null = stationen har inga färska värden. */
  nu: number | null;
  /** Temperaturen vid senaste kontrollen. null = okänd. */
  vidKontroll: number | null;
  kalla: 'station' | 'kontroll' | null;
  omslag: boolean;
};

export function vaderLage(a: { obs: readonly TempObs[]; kontrollMs: number | null; kontrollTemp: number | null; nuMs: number }): VaderLage {
  const nu = medelTemp(a.obs, a.nuMs - NU_FONSTER_H * TIM, a.nuMs);
  let vidKontroll: number | null = null;
  let kalla: VaderLage['kalla'] = null;
  if (a.kontrollMs != null) {
    vidKontroll = medelTemp(a.obs, a.kontrollMs - NU_FONSTER_H * TIM, a.kontrollMs + TIM);
    if (vidKontroll != null) kalla = 'station';
  }
  if (vidKontroll == null && a.kontrollTemp != null) { vidKontroll = a.kontrollTemp; kalla = 'kontroll'; }
  const omslag = nu != null && vidKontroll != null
    && vaderKlass(nu) !== vaderKlass(vidKontroll)
    && Math.abs(nu - vidKontroll) >= OMSLAG_MIN_GRADER;
  return { nu, vidKontroll, kalla, omslag };
}

/** "det har blivit kallt" / "det har blivit varmare" — åt vilket håll vädret gick. */
export function omslagOrd(l: VaderLage): string {
  if (l.nu == null || l.vidKontroll == null) return 'vädret har ändrat sig';
  if (l.nu > l.vidKontroll) return vaderKlass(l.nu) === 'varmt' ? 'det har blivit plusgrader' : 'det har blivit mildare';
  return vaderKlass(l.nu) === 'kallt' ? 'det har blivit sträng kyla' : 'det har blivit minusgrader';
}

/** Pushens text. null = inget omslag. */
export function omslagText(namn: string, l: VaderLage, kontrollDag: string | null): { title: string; body: string } | null {
  if (!l.omslag || l.nu == null || l.vidKontroll == null) return null;
  const da = kontrollDag ? `Vid senaste kontrollen ${kontrollDag}` : 'Vid senaste kontrollen';
  return {
    title: `Gör en kontrollmätning · ${namn}`,
    body: `${da} var det ${grader(l.vidKontroll)}, nu ${grader(l.nu)} – ${omslagOrd(l)}. Kolla längd och diameter.`,
  };
}

/** Läget-raden "Vädret". */
export function vaderRad(l: VaderLage): { varde: string; under: string | null; orange: boolean } | null {
  if (l.nu == null) return null;
  if (l.omslag && l.vidKontroll != null) {
    return { varde: `${grader(l.nu)} nu`, under: `${grader(l.vidKontroll)} vid senaste kontrollen · gör en kontroll`, orange: true };
  }
  return { varde: `${grader(l.nu)} nu`, under: l.vidKontroll != null ? `${grader(l.vidKontroll)} vid senaste kontrollen` : null, orange: false };
}
