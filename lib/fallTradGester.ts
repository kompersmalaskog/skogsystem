// KARTGESTEN för kör upp och backa (planeringsvyn) — ren DOM-kod utan React, så att den går att prova i en riktig webbläsare (lib/fallTradKorUpp.hytt.test.ts).
//   • RITA KÖR UPP OCH BACKA: dra ett finger från vägen mot gränsen → en vit dubbelpil. Var draget BÖRJAR (närmaste väg) = från vilken väg, längden = hur långt in.
// Träden har ingen gest på kartan: de vrids i kortet, som de gamla pilarna. Samma DOM-mönster som "Redigera hörn" och frihandsritningen: canvas mousedown/touchstart + document move/up, och kartans panorering stängs av medan draget pågår.
// Allt som kan prövas utan karta ligger i lib/fallTrad och lib/korUpp; här finns bara händelserna.

import { KORUPP_MIN_M, korUppLangdM, snappaTillVag, type SnappVag } from './korUpp';
import type { LatLon } from './larm/geo';

export interface FallOchKorUppIn {
  map: any | null;
  klar: boolean;
  /** Kör upp och backa-läget är på: ett drag ritar en pil. */
  korUppRita: boolean;
  vagarRef: { current: readonly SnappVag[] };
  /** Pilen medan den dras (null när draget är slut): sidan ritar den som en vanlig pil. */
  onForhandsvisning: (pil: { start: LatLon; slut: LatLon } | null) => void;
  /** Draget blev en pil. */
  onKorUpp: (pil: { start: LatLon; slut: LatLon; vagId: string | null }) => void;
}

const EMULERAD_MUS_MS = 700;

/** Kopplar gesterna till kartans canvas. `hamta` ger alltid senaste läget (sidan byter funktioner varje rendering). Returnerar en avkopplare. */
export function kopplaFallOchKorUppGester(map: any, hamta: () => FallOchKorUppIn): () => void {
  const canvas: HTMLCanvasElement = map.getCanvas();
  let rita: { start: LatLon; fingret: LatLon; vagId: string | null; slut: LatLon } | null = null;
  let senasteTouch = 0;

  const pt = (cx: number, cy: number) => { const r = canvas.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
  const llFran = (p: { x: number; y: number }): LatLon => { const q = map.unproject([p.x, p.y]); return { lat: q.lat, lon: q.lng }; };
  const klientXY = (e: MouseEvent | TouchEvent) => ('touches' in e ? { cx: (e.touches[0] ?? (e as TouchEvent).changedTouches[0]).clientX, cy: (e.touches[0] ?? (e as TouchEvent).changedTouches[0]).clientY } : { cx: e.clientX, cy: e.clientY });

  const ned = (e: MouseEvent | TouchEvent) => {
    const { cx, cy } = klientXY(e);
    const p = pt(cx, cy);
    const nu = hamta();
    if (nu.korUppRita) {
      const snapp = snappaTillVag(nu.vagarRef.current, p, (c) => { const q = map.project([c[0], c[1]]); return { x: q.x, y: q.y }; });
      rita = { start: snapp ? snapp.punkt : llFran(p), fingret: llFran(p), vagId: snapp ? snapp.id : null, slut: llFran(p) };
      map.dragPan.disable();
      return;
    }
  };
  const flytt = (e: MouseEvent | TouchEvent) => {
    if (!rita) return;
    const { cx, cy } = klientXY(e);
    const ll = llFran(pt(cx, cy));
    rita.slut = ll; hamta().onForhandsvisning({ start: rita.start, slut: ll });
  };
  const upp = () => {
    if (rita) {
      const r = rita; rita = null; map.dragPan.enable();
      hamta().onForhandsvisning(null);
      // Hur långt FINGRET drog avgör om det är en pil — inte sträckan från vägen: ett tryck nära en väg ska inte bli en pil bara för att starten hoppar till vägen.
      if (korUppLangdM({ start: r.fingret, slut: r.slut }) >= KORUPP_MIN_M) hamta().onKorUpp({ start: r.start, slut: r.slut, vagId: r.vagId });
    }
  };

  const onTouchStart = (e: TouchEvent) => { senasteTouch = Date.now(); if (e.touches.length === 1) ned(e); };
  const onTouchMove = (e: TouchEvent) => { if (rita) { if (e.cancelable) e.preventDefault(); flytt(e); } };
  const onTouchEnd = () => { senasteTouch = Date.now(); upp(); };
  const arEmulerad = () => Date.now() - senasteTouch < EMULERAD_MUS_MS;
  const onMouseDown = (e: MouseEvent) => { if (arEmulerad() || e.button !== 0) return; ned(e); };
  const onMouseMove = (e: MouseEvent) => { if (!arEmulerad()) flytt(e); };
  const onMouseUp = () => { if (!arEmulerad()) upp(); };

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('touchend', onTouchEnd);
  document.addEventListener('touchcancel', onTouchEnd);
  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
    if (map.dragPan) map.dragPan.enable();
  };
}
