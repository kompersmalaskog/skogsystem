// Besökstiden som markägaren väljer: Nu / Om 1 h / en klockslag i dag. Svensk tid (aldrig enhetens zon). Rena funktioner.

import { sthlmLokalTillUtcMs, sthlmOffsetMin } from '@/lib/optiTid';
import { BESOK_EFTERTID_MIN, BESOK_MAX_FRAMAT_H } from './konstanter';

export type TidVal = { val: 'nu' } | { val: 'om1h' } | { val: 'tid'; tid: string };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const arKlockslag = (t: unknown): t is string => typeof t === 'string' && HHMM.test(t.trim());

/** Besökstiden som ISO-sträng (UTC), eller null om valet är ogiltigt. "Välj tid" = det klockslaget i dag; har det passerat med mer än 15 min menas i morgon. */
export function besokstid(v: TidVal, nu: Date = new Date()): string | null {
  if (v.val === 'nu') return nu.toISOString();
  if (v.val === 'om1h') return new Date(nu.getTime() + 60 * 60000).toISOString();
  if (v.val !== 'tid' || !arKlockslag(v.tid)) return null;
  const [h, m] = v.tid.trim().split(':').map(Number);
  // Svensk väggklocka idag → UTC. Väggklockan är "UTC + offset", så datumet tas ur nu + offset och klockslaget läggs på.
  const vagg = nu.getTime() + sthlmOffsetMin(nu.getTime()) * 60000;
  const dag0 = Date.UTC(new Date(vagg).getUTCFullYear(), new Date(vagg).getUTCMonth(), new Date(vagg).getUTCDate());
  let utc = sthlmLokalTillUtcMs(dag0 + (h * 60 + m) * 60000);
  if (utc < nu.getTime() - 15 * 60000) utc = sthlmLokalTillUtcMs(dag0 + 24 * 3600000 + (h * 60 + m) * 60000);
  return new Date(utc).toISOString();
}

/** Är tiden rimlig att spara? Inte i det förflutna (mer än 15 min) och inte mer än BESOK_MAX_FRAMAT_H framåt. */
export function arRimligBesokstid(iso: string, nu: Date = new Date()): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= nu.getTime() - 15 * 60000 && t <= nu.getTime() + BESOK_MAX_FRAMAT_H * 3600000;
}

/** Aktivt = från anmälan till besökstiden + BESOK_EFTERTID_MIN. */
export const arBesokAktivt = (besokstidIso: string, nu: Date = new Date()): boolean => {
  const t = Date.parse(besokstidIso);
  return Number.isFinite(t) && nu.getTime() <= t + BESOK_EFTERTID_MIN * 60000;
};

/** "14:30" i svensk tid. */
export function klockslag(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const v = new Date(t + sthlmOffsetMin(t) * 60000);
  return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
}

/** "kommer ca 14:30" / "kommer nu" — hyttens text. Inom 5 min från anmälan eller redan förbi = "kommer nu"/"är här ca". */
export function kommerText(iso: string, nu: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'kommer';
  if (Math.abs(t - nu.getTime()) <= 5 * 60000) return 'kommer nu';
  return `kommer ca ${klockslag(iso)}`;
}

/** En avrundad dag + klockslag för loggen: "22 okt 14:30" (idag: bara klockslaget). */
const KORT_MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function loggTid(iso: string | null | undefined, nu: Date = new Date()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const v = new Date(t + sthlmOffsetMin(t) * 60000);
  const n = new Date(nu.getTime() + sthlmOffsetMin(nu.getTime()) * 60000);
  const samma = v.getUTCFullYear() === n.getUTCFullYear() && v.getUTCMonth() === n.getUTCMonth() && v.getUTCDate() === n.getUTCDate();
  return samma ? klockslag(iso) : `${v.getUTCDate()} ${KORT_MAN[v.getUTCMonth()]} ${klockslag(iso)}`;
}
