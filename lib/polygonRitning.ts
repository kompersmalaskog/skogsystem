// Polygon-ritning på en MapLibre-karta: tryck sätter hörn, tryck nära första hörnet (≤15 px) sluter
// ringen. Kartan förblir pan/zoom-bar under ritningen (drag = panorera, tryck = hörn). Hörnen lagras
// i GEO (lng/lat) och omprojiceras varje 'move' så de sitter fast i marken, inte i glaset.
//
// Detta är EXAKT samma beprövade mekanik som skotningens "markera utkört"-ritning i planeringsvyn
// (app/planering/page.tsx), lyft till en återanvändbar primitiv så egna områden (PR B) kan använda
// den utan att duplicera ~130 rader eller röra den beprövade skotningsvägen. Ritmotorn är alltså
// oförändrad — bara inkapslad och parametriserad på färg + callbacks.

export interface PolygonRitningHandle {
  /** Slut ringen manuellt (≥3 hörn) — "Klar"-knappen anropar denna. No-op vid < 3 hörn. */
  finalize: () => void;
  /** Riv ner overlay + lyssnare utan att slutföra (avbryt / cleanup). Anropas av effektens cleanup. */
  avbryt: () => void;
  /** Antal satta hörn just nu. */
  antal: () => number;
}

export interface PolygonRitningOpts {
  map: any;                                         // MapLibre-instans (map.project/unproject/on/off)
  /** Kant- och fyllningsfärg (hex). Default: skog-grön. */
  farg?: string;
  /** Anropas när antalet hörn ändras (driver "Klar"-knappens ≥3-villkor + hörnräknaren). */
  onPunkter?: (antal: number) => void;
  /** Anropas när ringen sluts (≥3 hörn). coords = hörnen i [lng, lat], EJ slutna (första ≠ sista). */
  onKlar: (coords: [number, number][]) => void;
}

/** Starta polygon-ritning. Returnerar ett handle; anropa .avbryt() i effektens cleanup. */
export function startaPolygonRitning(opts: PolygonRitningOpts): PolygonRitningHandle {
  const { map, onKlar } = opts;
  const farg = opts.farg || '#1d9e75';
  const fyll = hexTillRgba(farg, 0.2);

  const mapCanvas = map.getCanvas();
  const container = map.getContainer();
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  const overlay = document.createElement('canvas');
  overlay.width = container.clientWidth * dpr;
  overlay.height = container.clientHeight * dpr;
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
  container.appendChild(overlay);
  const ctx = overlay.getContext('2d')!;
  ctx.scale(dpr, dpr);

  let coords: [number, number][] = [];
  let rivits = false;

  const screenToLngLat = (clientX: number, clientY: number): [number, number] => {
    const rect = mapCanvas.getBoundingClientRect();
    const pt = map.unproject([clientX - rect.left, clientY - rect.top]);
    return [pt.lng, pt.lat];
  };

  const drawOverlay = () => {
    const w = overlay.width / dpr, h = overlay.height / dpr;
    ctx.clearRect(0, 0, w, h);
    if (coords.length === 0) return;
    const pts = coords.map(g => { const p = map.project(g as any); return [p.x, p.y] as [number, number]; });

    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (pts.length >= 3) { ctx.closePath(); ctx.fillStyle = fyll; ctx.fill(); }
      ctx.strokeStyle = farg; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
      // Streckad stäng-linje (sista → första)
      const last = pts[pts.length - 1], first = pts[0];
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(first[0], first[1]);
      ctx.setLineDash([6, 6]); ctx.strokeStyle = farg; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    }
    // Hörn — första hörnet får en yttre stäng-ring när ringen kan slutas (≥3)
    for (let i = 0; i < pts.length; i++) {
      const vx = pts[i][0], vy = pts[i][1], isFirst = i === 0;
      if (isFirst && pts.length >= 3) {
        ctx.beginPath(); ctx.arc(vx, vy, 13, 0, 2 * Math.PI);
        ctx.strokeStyle = hexTillRgba(farg, 0.5); ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(vx, vy, isFirst ? 7 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = farg; ctx.lineWidth = isFirst ? 3 : 2; ctx.stroke();
    }
  };

  let downX = 0, downY = 0, lastX = 0, lastY = 0, moved = false, pressing = false;

  const teardown = () => {
    if (rivits) return; rivits = true;
    mapCanvas.removeEventListener('mousedown', onDown);
    mapCanvas.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    mapCanvas.removeEventListener('touchstart', onDown as any);
    mapCanvas.removeEventListener('touchmove', onMove as any);
    document.removeEventListener('touchend', onUp);
    map.off('move', drawOverlay);
    try { map.getCanvasContainer().classList.remove('skotning-rita'); } catch { /* */ }
    if (map.dragPan) map.dragPan.enable();
    if (map.scrollZoom) map.scrollZoom.enable();
    if (map.touchZoomRotate) map.touchZoomRotate.enable();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const finalize = () => {
    const c = [...coords];
    if (c.length < 3) return;   // behöver minst 3 hörn
    teardown();
    onKlar(c);
  };

  const onDown = (e: MouseEvent | TouchEvent) => {
    if ('button' in e && (e as MouseEvent).button !== 0) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    downX = clientX; downY = clientY; lastX = clientX; lastY = clientY; moved = false; pressing = true;
  };
  const onMove = (e: MouseEvent | TouchEvent) => {
    if (!pressing) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    lastX = clientX; lastY = clientY;
    if (Math.abs(clientX - downX) > 5 || Math.abs(clientY - downY) > 5) moved = true;   // drag = pan
  };
  const onUp = () => {
    if (!pressing) return;
    pressing = false;
    if (moved) { moved = false; return; }   // drag = panorering, ritar inte
    if (coords.length >= 3) {   // tryck nära första hörnet → slut ringen
      const rect = mapCanvas.getBoundingClientRect();
      const fp = map.project(coords[0] as any);
      const dx = fp.x - (lastX - rect.left), dy = fp.y - (lastY - rect.top);
      if (dx * dx + dy * dy < 225) { finalize(); return; }   // 15px (225 = 15²)
    }
    coords.push(screenToLngLat(lastX, lastY));
    opts.onPunkter?.(coords.length);
    drawOverlay();
  };

  mapCanvas.addEventListener('mousedown', onDown);
  mapCanvas.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  mapCanvas.addEventListener('touchstart', onDown as any, { passive: true });
  mapCanvas.addEventListener('touchmove', onMove as any, { passive: true });
  document.addEventListener('touchend', onUp);
  map.on('move', drawOverlay);
  try { map.getCanvasContainer().classList.add('skotning-rita'); } catch { /* */ }

  return { finalize, avbryt: teardown, antal: () => coords.length };
}

/** #rrggbb → rgba(r,g,b,a). Faller tillbaka till grön vid ogiltig hex. */
function hexTillRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(29,158,117,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
