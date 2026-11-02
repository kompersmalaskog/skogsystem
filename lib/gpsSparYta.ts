// SPÅRA EN YTA MED GPS (Martin 2026-11-02: "spåra alla ytor också och traktgränsen i nytt område").
// Samma spårning som linjerna (startGpsTracking, lib/gpsSparLinje) — skillnaden är bara vad som sparas vid Klar:
// en yta (zoneType) eller ett nytt område (traktgräns, lineType 'boundary' med nummer), med ringen SLUTEN tillbaka till starten.
// Spårningens id bär vad det är: 'yta:<zoneType>' eller 'omrade'. Linjernas id (lineType) börjar aldrig så.

import type { P } from './gpsSparLinje';

export const OMRADE_SPAR = 'omrade';
export const ytaSparId = (zoneType: string): string => `yta:${zoneType}`;
/** Spåras en yta eller ett område (inte en linje)? */
export const arYtSparning = (id: string | null | undefined): boolean => !!id && (id === OMRADE_SPAR || id.startsWith('yta:'));
/** Ytans zoneType ur spårningens id, eller null (område eller linje). */
export const ytaTypAv = (id: string | null | undefined): string | null => (id && id.startsWith('yta:') ? id.slice(4) : null);

/** Minsta yta som sparas (m²) — mindre än så är ett stopp på stället, inte en yta man gått runt. */
export const MIN_YTA_M2 = 25;

function areaPx2(ring: readonly P[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

/**
 * Den slutna ringen för en spårad yta, eller varför den inte sparas. `meterPerPx` = kartans skala (meter per kartenhet).
 * Ringen sluts med första punkten sist (som en ritad yta: hörnen där man gått, ingen extra utjämning).
 */
export function slutRing(spar: readonly P[], meterPerPx: number): { ok: true; ring: P[]; areaM2: number } | { ok: false; skal: string } {
  const pts = spar.filter((p, i) => i === 0 || p.x !== spar[i - 1].x || p.y !== spar[i - 1].y);
  if (pts.length < 3) return { ok: false, skal: 'För få punkter – gå runt hela ytan' };
  const areaM2 = areaPx2(pts) * meterPerPx * meterPerPx;
  if (areaM2 < MIN_YTA_M2) return { ok: false, skal: 'Ytan blev för liten – gå runt hela ytan' };
  const f = pts[0], l = pts[pts.length - 1];
  const ring = f.x === l.x && f.y === l.y ? [...pts] : [...pts, { ...f }];
  return { ok: true, ring, areaM2 };
}
