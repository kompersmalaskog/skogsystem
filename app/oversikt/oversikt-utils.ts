import { Maskin } from './oversikt-types';

export function formatVolym(v: number): string {
  return v.toLocaleString('sv-SE');
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
