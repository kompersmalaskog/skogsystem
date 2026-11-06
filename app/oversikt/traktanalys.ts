// VAD TRAKTANALYSEN HITTAT — visningen i Översikten. INGEN egen tolkning: allt kommer ur lib/traktAnalys/markning (#1115), som läser
// objekt.trakt_analys — serverns analys mot VIDAS TRAKTGRÄNS med exakt intersect (bara det som ligger på trakten, inte runt den).
// (Martin 2026-11-06: "jag vill ju bara ha varning på det som är innanför trakten". Den tillfälliga läsningen av Planeringens sparade lista,
// trakt_data.beraknad.restriktioner, är borta — den sökte i en ruta runt trakten och hade dubbletter.)
//
//   Ringen på kartan, raden i listorna och under trakten i planen = `listRad` (en rad: fossil åker / vattenskydd; skydd syns i trakten)
//   Texten om trakten (Min plan, arket) = `markenRader` (ett märke per sort)
//   Inte analyserad än = "Inte kontrollerad än" i texten om trakten (aldrig tomt där); ingen ring och ingen rad i listorna.

import { GRUPPER, type FargGrupp } from '@/lib/larm/grupper';
import { lasTraktAnalys as lasServer, listRad, markenRader, type TraktAnalys, type FyndKategori } from '@/lib/traktAnalys/markning';

export type { TraktAnalys, FyndKategori };
export const lasTraktAnalys = (o: object): TraktAnalys => lasServer(o as { trakt_analys?: unknown });

export const KATEGORI_GRUPP: Record<FyndKategori, FargGrupp> = { barmark: 'kultur', vattenskydd: 'blott', skydd: 'natur' };
export const fyndFarg = (k: FyndKategori): string => GRUPPER[KATEGORI_GRUPP[k]].farg;

/** Texten om trakten: märkena; inte analyserad = "Inte kontrollerad än" (orange — tomt får aldrig läsas som "inget finns"). */
export function analysRader(a: TraktAnalys): { text: string; farg: string | null; fel: boolean }[] {
  if (a.lage === 'ej_kord') return [{ text: 'Inte kontrollerad än', farg: null, fel: true }];
  return markenRader(a).map((r) => ({ text: r.text, farg: r.kategori ? fyndFarg(r.kategori) : null, fel: !r.kategori }));
}

/** Ordet på kartan, i listorna och under trakten i planen — bara fossil åker/vattenskydd (det som ändrar hur man kör). null = inget. */
export function analysKortOrd(a: TraktAnalys): string | null {
  const r = listRad(a);
  return r && r.kategori ? r.text : null;
}
