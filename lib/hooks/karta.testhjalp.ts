// Låtsaskarta för jsdom-tester av prickarna (ingen MapLibre i jsdom): container + canvas-behållare, källor/lager, kamera och sökning av prickar.
import { vi } from 'vitest';

export function laggKarta(trakffar: { id: string; x: number; y: number; prio?: number }[] = []) {
  const container = document.createElement('div');
  const canvasBeh = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvasBeh.appendChild(canvas); container.appendChild(canvasBeh); document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, bottom: 800, width: 390, height: 800, x: 0, y: 0, toJSON() {} } as DOMRect);
  const kallor: Record<string, any> = {}; const lager: string[] = [];
  const karta: any = {
    kamera: { center: { lng: 14.9, lat: 56.5 }, zoom: 15, bearing: 20, pitch: 45 },
    container, canvas, canvasBeh, kallor, lager,
    getContainer: () => container, getCanvasContainer: () => canvasBeh,
    getCenter: () => karta.kamera.center, getZoom: () => karta.kamera.zoom, getBearing: () => karta.kamera.bearing, getPitch: () => karta.kamera.pitch,
    getSource: (id: string) => kallor[id], addSource: (id: string, s: any) => { kallor[id] = { ...s, setData: vi.fn((d: any) => { kallor[id].data = d; }) }; },
    getLayer: (id: string) => (lager.includes(id) ? {} : undefined), addLayer: (s: any) => { lager.push(s.id); },
    minZoom: 8, getMinZoom: () => karta.minZoom, setMinZoom: vi.fn((z: number) => { karta.minZoom = z; }),
    sparadeEfter: {} as Record<string, () => void>, once: (ev: string, fn: () => void) => { karta.sparadeEfter[ev] = fn; },
    fitBounds: vi.fn(), easeTo: vi.fn(),
    queryRenderedFeatures: vi.fn(() => trakffar.map((t) => ({ geometry: { coordinates: [t.x, t.y] }, properties: { id: t.id, prio: t.prio ?? 1 } }))),
    project: (c: [number, number]) => ({ x: c[0], y: c[1] }),
  };
  return karta;
}
