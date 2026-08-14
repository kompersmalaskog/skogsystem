import { Maskin } from './oversikt-types';

export function formatVolym(v: number): string {
  return v.toLocaleString('sv-SE');
}

/* ── Skotarens tillstånd, HÄRLETT ur befintlig data (inga nya fält/knappar) ──
   KLAR   = manuell registrering finns (användarens avslut, trumf-källan) ELLER skotat >= 98% av
            skördat (filvägen — samma tröskel som "Utkört").
   IGÅNG  = lass finns men inte klart. `fersk` (senaste lass ≤ FERSK_DGR) = någon jobbar där NU
            (grön ring/rad); en igång-post med gammalt sista-lass visas grå med datumet (ärligt).
   VÄNTAR = skördat finns, inga lass, ingen manuell (virke på backen, ingen börjat).
   null   = inget skördat än → inget skotar-tillstånd. Trösklarna är justerbara parametrar. */
export type SkotarState = 'klar' | 'igang' | 'vantar';
export interface SkotarInfo { state: SkotarState; kvar: number; sista: string | null; fersk: boolean; }
export const SKOTAR_KLAR_ANDEL = 0.98;   // skotat/skördat-tröskel för "klar" (filvägen)
export const SKOTAR_FERSK_DGR = 3;       // senaste lass inom så här många dgr = aktiv (grön)

export function skotarTillstand(
  skordat: number,
  skotat: number | null,
  harManuell: boolean,
  lassSista: string | null,
): SkotarInfo | null {
  if (!skordat || skordat <= 0) return null;   // inget skördat → inget skotar-tillstånd
  if (harManuell || (skotat != null && skotat >= SKOTAR_KLAR_ANDEL * skordat)) {
    return { state: 'klar', kvar: 0, sista: lassSista, fersk: false };
  }
  const kvar = Math.max(0, skordat - (skotat ?? 0));
  if (skotat != null && skotat > 0) {   // lass finns men inte klart → igång
    const d = lassSista ? dagarSedanLokal(lassSista) : null;
    return { state: 'igang', kvar, sista: lassSista, fersk: d != null && d <= SKOTAR_FERSK_DGR };
  }
  return { state: 'vantar', kvar, sista: null, fersk: false };   // inga lass, ingen manuell → på backen
}

/** Hela dagar sedan ett datum/timestamp, i LOKAL tid (undviker UTC-off-by-one på date-only). */
function dagarSedanLokal(datum: string): number {
  const d = new Date(datum.length <= 10 ? `${datum}T00:00:00` : datum);
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nu = new Date();
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return Math.round((idag.getTime() - then.getTime()) / 86400000);
}

/** Kort relativ dag: "idag" / "igår" / "för N dgr sedan" / "D mån". */
export function relativDag(datum: string | null): string {
  if (!datum) return '';
  const dgr = dagarSedanLokal(datum);
  if (dgr <= 0) return 'idag';
  if (dgr === 1) return 'igår';
  if (dgr < 7) return `för ${dgr} dgr sedan`;
  const d = new Date(datum.length <= 10 ? `${datum}T00:00:00` : datum);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

export function pc(v: number, t: number): number {
  return t ? Math.min(100, Math.round(v / t * 100)) : 0;
}

export function dKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const r = (x: number) => x * Math.PI / 180;
  const d = Math.sin(r((b.lat - a.lat) / 2)) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r((b.lng - a.lng) / 2)) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d)));
}

/** Build display name from dim_maskin data */
export function getMaskinDisplayName(m: { tillverkare?: string; modell?: string; maskin_id: string }): string {
  const { tillverkare, modell } = m;
  if (!tillverkare && !modell) return m.maskin_id;
  if (!tillverkare) return modell!;
  if (!modell) return tillverkare;
  if (modell.toLowerCase().startsWith(tillverkare.toLowerCase())) return modell;
  if (tillverkare.length <= 5 && !tillverkare.includes(' ') && modell.length > tillverkare.length) return `${modell} ${tillverkare}`;
  return `${tillverkare} ${modell}`;
}

export function getMaskinTyp(typ?: string | null): 'skördare' | 'skotare' {
  if (!typ) return 'skördare';
  const t = typ.toLowerCase();
  if (t === 'forwarder' || t === 'skotare') return 'skotare';
  return 'skördare';
}

export function getMaskinAggregatStr(m: { aggregat_tillverkare?: string; aggregat?: string }): string {
  const { aggregat_tillverkare, aggregat } = m;
  if (!aggregat_tillverkare && !aggregat) return '';
  if (!aggregat_tillverkare) return aggregat!;
  if (!aggregat) return aggregat_tillverkare;
  if (aggregat.toLowerCase().startsWith(aggregat_tillverkare.toLowerCase())) return aggregat;
  return `${aggregat_tillverkare} ${aggregat}`;
}

export function getWeekNumber(daysFromNow: number): string {
  const t = new Date(Date.now() + daysFromNow * 864e5);
  const j = new Date(t.getFullYear(), 0, 1);
  return 'v.' + Math.ceil(((t.getTime() - j.getTime()) / 864e5 + j.getDay() + 1) / 7);
}

/* ── GROT helpers ── */

/** Step index: 0=not started, 1=höglagd, 2=flisad, 3=borttransporterad */
export function grotStepIndex(status: string): number {
  switch (status) {
    case 'hoglagd': return 1;
    case 'flisad': return 2;
    case 'borttransporterad': case 'bortkord': return 3;
    default: return 0;
  }
}

/** GROT status color (without deadline consideration) */
export function grotColor(status: string): string {
  switch (status) {
    case 'hoglagd': return '#eab308';
    case 'flisad': return '#f97316';
    case 'borttransporterad': case 'bortkord': return '#22c55e';
    default: return '#71717a';
  }
}

/** Days until deadline. Negative = overdue. null = no deadline. */
export function grotDeadlineDays(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 864e5);
}

/** Effective color considering deadline. Red if overdue and not done. */
export function grotEffectiveColor(status: string, deadline: string | null): string {
  const done = status === 'borttransporterad' || status === 'bortkord';
  if (!done && deadline) {
    const days = grotDeadlineDays(deadline);
    if (days !== null && days < 0) return '#ef4444';
  }
  return grotColor(status);
}

export const GROT_STEPS = [
  { key: 'hoglagd', label: 'Höglagd', color: '#eab308' },
  { key: 'flisad', label: 'Flisad', color: '#f97316' },
  { key: 'borttransporterad', label: 'Borttransp.', color: '#22c55e' },
] as const;
