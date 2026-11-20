// Testläget (/maskin?som=): ställ maskinen vid ett avlägg utan GPS. Ren funktion — vilket avlägg nästa tryck på testbannerns knapp gäller.
import type { Avlagg } from './typer';

/** Avläggets som är tryckt på kartan går först; annars nästa i listan efter det maskinen redan står vid (runt), annars det första. null = inga avlägg. */
export function nastaTestAvlagg(lista: readonly Avlagg[], tryckt: string | null, nuId: string | null): Avlagg | null {
  if (lista.length === 0) return null;
  const t = tryckt ? lista.find((a) => a.id === tryckt) : null;
  if (t) return t;
  const i = nuId ? lista.findIndex((a) => a.id === nuId) : -1;
  return lista[(i + 1) % lista.length];
}

/** 200 m rakt norrut från avlägget: utanför zonen (50 m in / 60 m ut) med god marginal. */
export const KOR_UT_M = 200;
export const kalUtPunkt = (a: Pick<Avlagg, 'lat' | 'lng'>): { lat: number; lng: number } => ({ lat: a.lat + KOR_UT_M / 111320, lng: a.lng });
