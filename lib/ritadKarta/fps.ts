// Mätaren för den ritade kartan (?fps=1, Martin 2026-10-29: "det kommer väl inte bli segt"): bilder per sekund medan kartan rör sig, och den
// långsammaste bilden. Över 30 känns mjukt, under 20 hackar — då ska antalet träd ner. Ren funktion; sidan matar den med kartans render-händelser.

export const FPS_FONSTER_MS = 1000;
export const FPS_MJUKT = 30;
export const FPS_HACKAR = 20;

export type FpsMatt = { fps: number; langsammastMs: number } | null;

/** Tider (ms) för de senaste bilderna → bilder per sekund i fönstret och den längsta pausen mellan två bilder. Null = kartan står still. */
export function matFps(tider: number[], nu: number): FpsMatt {
  const inne = tider.filter((t) => nu - t <= FPS_FONSTER_MS);
  if (inne.length < 2) return null;
  let langst = 0;
  for (let i = 1; i < inne.length; i++) langst = Math.max(langst, inne[i] - inne[i - 1]);
  return { fps: Math.round(((inne.length - 1) * 1000) / (inne[inne.length - 1] - inne[0] || 1)), langsammastMs: Math.round(langst) };
}

export function fpsOrd(m: FpsMatt): string {
  if (!m) return 'Står still – luta eller vrid kartan';
  return `${m.fps} bilder/s · långsammast ${m.langsammastMs} ms · ${m.fps >= FPS_MJUKT ? 'mjukt' : m.fps >= FPS_HACKAR ? 'okej' : 'hackar'}`;
}
