// STRECKET ÖVER HÖGARNA (skotarläget och planeringsvyn, Martin 2026-11-01: "som John Deere — ett tjockt streck"). Medan läget är på:
// ETT finger ritar (kartan panorerar inte), två fingrar nyper och vrider kartan som vanligt och avbryter strecket. Släpper man fingret
// lämnas strecket till sidan som en linje [lng, lat] — sidan sparar det som en markering 'tagen'. Ett kort tryck utan rörelse är inget streck.
// Pekarhändelserna tas i fångstfasen på kartans container (mus och finger samma väg), samma mönster som Redigera linjer.

export const HOG_STRECK_FORHAND_KALLA = 'skotar-hogstreck-forhand-source';
export const HOG_STRECK_KALLA = 'skotar-hogstreck-source';
/** Ett streck kortare än så här är ett tryck, inget streck. */
export const STRECK_MIN_M = 2;
/** Punkter tätare än så här sparas inte (strecket är brett ändå). */
export const STRECK_STEG_M = 1.5;

type LngLat = [number, number];
const M_PER_LAT = 111_320;
export const avstandM = (a: LngLat, b: LngLat): number => {
  const kx = M_PER_LAT * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * M_PER_LAT);
};

/** Glesa ut ett drag: första och sista punkten alltid med, däremellan bara punkter minst `steg` meter från den förra. */
export function glesaStreck(p: readonly LngLat[], steg = STRECK_STEG_M): LngLat[] {
  if (p.length <= 2) return p.slice();
  const ut: LngLat[] = [p[0]];
  for (let i = 1; i < p.length - 1; i++) if (avstandM(ut[ut.length - 1], p[i]) >= steg) ut.push(p[i]);
  const sista = p[p.length - 1];
  if (avstandM(ut[ut.length - 1], sista) > 0) ut.push(sista);
  return ut;
}

/** Strecket är ett streck (inte ett tryck): minst STRECK_MIN_M långt från början till någon punkt. */
export function arStreck(p: readonly LngLat[]): boolean {
  return p.length >= 2 && p.some((x) => avstandM(p[0], x) >= STRECK_MIN_M);
}

/**
 * Bredd i pixlar som motsvarar `meter` på marken vid latituden — som MapLibre-uttryck på zoom (exponentiellt, bas 2).
 * meter per pixel vid zoom z = 40 075 016,686 · cos(lat) / (512 · 2^z) (512 px rutor i MapLibre).
 */
export function breddUttryck(meter: number, lat: number): unknown {
  const mPerPxZ0 = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / 512;
  const px = (z: number) => (meter * 2 ** z) / mPerPxZ0;
  return ['interpolate', ['exponential', 2], ['zoom'], 10, px(10), 22, px(22)];
}

export function kopplaHogStreck(map: any, onKlar: (coords: LngLat[]) => void): () => void {
  const container: HTMLElement = map.getContainer();
  const foreTouch = container.style.touchAction;
  let panFanns = false;
  try { panFanns = !!map.dragPan?.isEnabled?.(); if (panFanns) map.dragPan.disable(); } catch { /* */ }
  let drag: { id: number; p: LngLat[] } | null = null;
  const aktiva = new Set<number>();

  const ll = (e: PointerEvent): LngLat => {
    const r = container.getBoundingClientRect();
    const x = map.unproject([e.clientX - r.left, e.clientY - r.top]);
    return [x.lng, x.lat];
  };
  const forhand = (p: LngLat[]) => {
    try {
      (map.getSource(HOG_STRECK_FORHAND_KALLA) as any)?.setData({
        type: 'FeatureCollection',
        features: p.length >= 2 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} }] : [],
      });
    } catch { /* källan inte klar */ }
  };
  const slapp = () => { drag = null; forhand([]); };

  const ned = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    aktiva.add(e.pointerId);
    if (aktiva.size > 1) { slapp(); return; }   // två fingrar: nyp/vrid, inget streck
    drag = { id: e.pointerId, p: [ll(e)] };
    e.stopPropagation();
    try { container.setPointerCapture?.(e.pointerId); } catch { /* */ }
  };
  const flytt = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const med = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
    for (const ce of med && med.length ? med : [e]) drag.p.push(ll(ce));
    forhand(drag.p);
  };
  const upp = (e: PointerEvent) => {
    aktiva.delete(e.pointerId);
    if (!drag || e.pointerId !== drag.id) return;
    drag.p.push(ll(e));
    const p = drag.p;
    slapp();
    try { container.releasePointerCapture?.(e.pointerId); } catch { /* */ }
    if (arStreck(p)) onKlar(glesaStreck(p));
  };
  const avbruten = (e: PointerEvent) => { aktiva.delete(e.pointerId); if (drag && e.pointerId === drag.id) slapp(); };

  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', ned, true);
  container.addEventListener('pointermove', flytt);
  container.addEventListener('pointerup', upp);
  container.addEventListener('pointercancel', avbruten);
  return () => {
    container.removeEventListener('pointerdown', ned, true);
    container.removeEventListener('pointermove', flytt);
    container.removeEventListener('pointerup', upp);
    container.removeEventListener('pointercancel', avbruten);
    container.style.touchAction = foreTouch;
    slapp();
    try { if (panFanns) map.dragPan.enable(); } catch { /* */ }
  };
}
