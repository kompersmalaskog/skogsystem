/**
 * "Har vädret slagit om sedan maskinen körde senast?" (Kalibrering, Martin 2026-11-18/19). Skogforsk: fruset virke mäts annorlunda än ofruset.
 * Martin 2026-11-19: jämför INTE med senaste kontrollen — har det slagit om under kvällen eller natten ska föraren mäta direkt på morgonen.
 * Jämförelsen är därför "nu" mot när maskinen SLUTADE förra arbetsdagen (igår, eller i fredags efter en helg).
 *
 * Underlaget är SMHI:s timvärden från stationen närmast maskinen (lib/smhi-obs), samma station för "då" och "nu".
 *
 * Tre lägen, gränserna ur appens befintliga regel (KALL_GRANS_C = −7 °C, "I sträng kyla"):
 *   varmt  över 0 °C   · ofruset virke
 *   fruset 0 till −7   · virket fryser
 *   kallt  −7 och under · sträng kyla
 * Omslag = läget nu (snitt senaste 6 timmarna) är ett annat än när maskinen slutade (snitt 4 h före till 1 h efter) OCH skillnaden är minst 4 grader —
 * annars skulle en dag som svänger runt noll ge en varning varje dag. Appen säger bara att vädret har slagit om — inga råd (Martin 2026-11-19: samla in data först).
 */
import type { TempObs } from '@/lib/smhi-obs';
import { KALL_GRANS_C, grader } from './kontrollLista';

export type VaderKlass = 'varmt' | 'fruset' | 'kallt';

export const OMSLAG_MIN_GRADER = 4;
export const NU_FONSTER_H = 6;
/** Hur länge före slutet förra arbetsdagen temperaturen räknas (eftermiddagen när man slutade). */
export const SLUT_FONSTER_H = 4;
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
  /** Temperaturen när maskinen slutade förra arbetsdagen. null = okänd (ingen arbetsdag senaste veckan, eller inga värden). */
  vidSlut: number | null;
  omslag: boolean;
};

export function vaderLage(a: { obs: readonly TempObs[]; slutMs: number | null; nuMs: number }): VaderLage {
  const nu = medelTemp(a.obs, a.nuMs - NU_FONSTER_H * TIM, a.nuMs);
  const vidSlut = a.slutMs != null ? medelTemp(a.obs, a.slutMs - SLUT_FONSTER_H * TIM, a.slutMs + TIM) : null;
  const omslag = nu != null && vidSlut != null
    && vaderKlass(nu) !== vaderKlass(vidSlut)
    && Math.abs(nu - vidSlut) >= OMSLAG_MIN_GRADER;
  return { nu, vidSlut, omslag };
}

/** Åt vilket håll vädret gick, i virkets ord. */
export function omslagOrd(l: VaderLage): string {
  if (l.nu == null || l.vidSlut == null) return 'vädret har slagit om';
  const nu = vaderKlass(l.nu), da = vaderKlass(l.vidSlut);
  if (nu === 'varmt') return 'virket har tinat';
  if (nu === 'kallt') return da === 'varmt' ? 'virket har frusit och det är sträng kyla' : 'det har blivit sträng kyla';
  return da === 'varmt' ? 'virket har frusit' : 'det har blivit mildare, men virket är fruset';
}

const VECKODAG = ['söndags', 'måndags', 'tisdags', 'onsdags', 'torsdags', 'fredags', 'lördags'];
const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const svensk = (ms: number) => {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const [y, m, d] = p.split('-').map(Number);
  return { y, m, d, dag: Date.UTC(y, m - 1, d) };
};

/** "igår" / "i fredags" (2–6 dagar bakåt) / "14 nov". */
export function slutDagOrd(slutMs: number, nuMs: number): string {
  const s = svensk(slutMs), n = svensk(nuMs);
  const dagar = Math.round((n.dag - s.dag) / 86_400_000);
  if (dagar <= 0) return 'idag';
  if (dagar === 1) return 'igår';
  if (dagar <= 6) return `i ${VECKODAG[new Date(s.dag).getUTCDay()]}`;
  return `${s.d} ${MANAD[s.m - 1]}`;
}

/** Pushens text: bara att vädret har slagit om, inget råd. null = inget omslag. */
export function omslagText(namn: string, l: VaderLage, slutMs: number | null, nuMs: number): { title: string; body: string } | null {
  if (!l.omslag || l.nu == null || l.vidSlut == null || slutMs == null) return null;
  return {
    title: `Vädret har slagit om · ${namn}`,
    body: `När maskinen slutade ${slutDagOrd(slutMs, nuMs)} var det ${grader(l.vidSlut)}, nu ${grader(l.nu)} – ${omslagOrd(l)}.`,
  };
}

/** Läget-raden "Vädret". `kontrollIdag` = en kontroll är gjord sedan maskinen startade idag (då är omslaget redan kollat). */
export function vaderRad(l: VaderLage, slutMs: number | null, nuMs: number, kontrollIdag: string | null = null): { varde: string; under: string | null; orange: boolean } | null {
  if (l.nu == null) return null;
  const varde = `${grader(l.nu)} nu`;
  if (l.vidSlut == null || slutMs == null) return { varde, under: null, orange: false };
  const da = `${grader(l.vidSlut)} när maskinen slutade ${slutDagOrd(slutMs, nuMs)}`;
  if (!l.omslag) return { varde, under: da, orange: false };
  if (kontrollIdag) return { varde, under: `${da} · kontroll gjord ${kontrollIdag}`, orange: false };
  return { varde, under: `${da} · vädret har slagit om`, orange: true };
}
