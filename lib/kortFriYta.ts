import { linjeMitt } from './kommentarTecken';
// Var på kartan syns det som kortet handlar om? (Martin 2026-11-05: "när jag trycker i listan … kommer kortet upp men då ser jag inte symbolen")
// Kartkortet ligger nerifrån och kan täcka det mesta av en låg skärm. Den här funktionen väljer den största fria biten av kartan
// — höger om kortet, vänster om det eller ovanför det — och ger kamerans padding så att platsen hamnar mitt i den biten. Ren och testad.

export interface Ruta { left: number; top: number; right: number; bottom: number }
export interface Padding { top: number; bottom: number; left: number; right: number }

/** Minsta bredd/höjd en fri bit måste ha för att räknas. */
export const FRI_MIN_PX = 160;

/**
 * kartan = kartans ruta, kort = kortets ruta (båda i skärmkoordinater), luft = marginal runt platsen, topp = det som ligger överst (namnfältet).
 * Den bit som är störst vinner. Ryms ingen bit: platsen läggs ovanför kortet ändå (bättre än bakom).
 */
export function friYtaPadding(kartan: Ruta, kort: Ruta | null, luft: number, topp: number): Padding {
  const bas = { top: topp + luft, bottom: luft, left: luft, right: luft };
  if (!kort) return bas;
  const k = {
    left: Math.max(kartan.left, kort.left), right: Math.min(kartan.right, kort.right),
    top: Math.max(kartan.top, kort.top), bottom: Math.min(kartan.bottom, kort.bottom),
  };
  if (k.left >= k.right || k.top >= k.bottom) return bas;   // kortet ligger inte över kartan
  const H = kartan.bottom - kartan.top;
  const hoger = kartan.right - k.right;
  const vanster = k.left - kartan.left;
  const ovan = k.top - kartan.top - topp;
  const kandidater: Array<{ yta: number; p: Padding }> = [];
  if (hoger >= FRI_MIN_PX) kandidater.push({ yta: hoger * H, p: { ...bas, left: k.right - kartan.left + luft } });
  if (vanster >= FRI_MIN_PX) kandidater.push({ yta: vanster * H, p: { ...bas, right: kartan.right - k.left + luft } });
  if (ovan >= FRI_MIN_PX / 2) kandidater.push({ yta: ovan * (kartan.right - kartan.left), p: { ...bas, bottom: kartan.bottom - k.top + luft } });
  if (kandidater.length === 0) return { ...bas, bottom: Math.max(luft, kartan.bottom - k.top + luft / 2), top: topp };
  kandidater.sort((a, b) => b.yta - a.yta);
  return kandidater[0].p;
}

export type Granser = [[number, number], [number, number]];


/** Den fasta närzoomen när en rad i listan trycks — alltid samma (Martin 2026-11-05: "det zoomar ut för mycket"). */
export const LISTA_ZOOM = 17.5;

/** Hur långt från trakten en del av en linje får ligga och ändå tas med i bilden. Längre bort = bara närmaste punkten (Martin 2026-11-05: "nu zoomar du ut för mycket"). */
export const NARA_TRAKT_KAMERA_M = 300;

const avstandTillRutaM = (lng: number, lat: number, r: Granser): number => {
  const dx = Math.max(r[0][0] - lng, 0, lng - r[1][0]) * 111320 * Math.cos((lat * Math.PI) / 180);
  const dy = Math.max(r[0][1] - lat, 0, lat - r[1][1]) * 110540;
  return Math.hypot(dx, dy);
};

/**
 * Vad kameran ska rymma när en rad i listan trycks. En symbol: bara den. En linje eller yta: trakten + den del av linjen som ligger
 * inom 300 m från trakten — en lång stig ut genom skogen ska inte dra ut kameran flera kilometer. Ligger hela linjen längre bort
 * tas bara dess närmaste punkt med, så man ser var den börjar sett från trakten.
 */
export function kameraGranser(sak: Granser | null, trakt: Granser | null, slag: 'symbol' | 'linje' | 'zon', punkter: ReadonlyArray<{ lat: number; lng: number }> = []): Granser | null {
  if (!sak) return null;
  if (slag === 'symbol' || !trakt) return sak;
  const nara = punkter.filter((q) => avstandTillRutaM(q.lng, q.lat, trakt) <= NARA_TRAKT_KAMERA_M);
  const med = nara.length > 0 ? nara
    : punkter.length > 0 ? [punkter.reduce((a, b) => (avstandTillRutaM(b.lng, b.lat, trakt) < avstandTillRutaM(a.lng, a.lat, trakt) ? b : a))]
    : [{ lng: sak[0][0], lat: sak[0][1] }, { lng: sak[1][0], lat: sak[1][1] }];
  let [[w, so], [e, n]] = trakt;
  for (const q of med) { w = Math.min(w, q.lng); e = Math.max(e, q.lng); so = Math.min(so, q.lat); n = Math.max(n, q.lat); }
  return [[w, so], [e, n]];
}

/**
 * VAR kartan ska stå när en rad i listan trycks: en punkt, aldrig en ruta som ska rymmas (en lång väg kan då aldrig dra ut kartan).
 * Symbol: dess plats. Linje/yta: mitten längs linjen (där pratbubblan sitter) — ligger mitten mer än 300 m utanför trakten tas
 * i stället den punkt på linjen som ligger närmast trakten (en väg in till trakten visas där den når trakten).
 */
export function listaPunkt(m: { lat: number | null; lng: number | null; geometri?: ReadonlyArray<{ lat: number; lng: number }> }, trakt: Granser | null): { lat: number; lng: number } | null {
  const g = m.geometri ?? [];
  if (g.length < 2) return m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng } : null;
  const mitt = linjeMitt(g.map((q) => [q.lng, q.lat] as [number, number]));
  const mittPunkt = mitt ? { lng: mitt[0], lat: mitt[1] } : { lng: g[0].lng, lat: g[0].lat };
  if (!trakt || avstandTillRutaM(mittPunkt.lng, mittPunkt.lat, trakt) <= NARA_TRAKT_KAMERA_M) return mittPunkt;
  const nar = g.reduce((a, b) => (avstandTillRutaM(b.lng, b.lat, trakt) < avstandTillRutaM(a.lng, a.lat, trakt) ? b : a));
  return { lat: nar.lat, lng: nar.lng };
}
