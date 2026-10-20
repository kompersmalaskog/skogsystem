// "Flytta mig hit" i testläget (/maskin?som=…, bara admin): tryck på kartan flyttar den visade maskinens position för hand.
// Fångar DOM-klicket i infångningsfasen på kartans container (som objektlistans fångst, lib/hooks/useObjektPrickar), så inget annat på kartan
// reagerar på trycket. Ett drag (panorering, > 8 px) räknas inte som ett tryck. Ren koppling, ingen React: provas i jsdom.

export const DRAG_GRANS_PX = 8;

export interface KartaForFlytt {
  getContainer?: () => HTMLElement | null;
  unproject: (punkt: [number, number]) => { lat: number; lng: number };
}

/** Kopplar fångsten. Ger en funktion som tar bort den igen. */
export function kopplaFlyttaMig(karta: KartaForFlytt, vidPosition: (lat: number, lon: number) => void): () => void {
  const behallare = karta.getContainer?.() ?? null;
  if (!behallare) return () => {};
  let ned: { x: number; y: number } | null = null;
  const nedFn = (e: PointerEvent) => { ned = { x: e.clientX, y: e.clientY }; };
  const klickFn = (e: MouseEvent) => {
    const flyttat = ned ? Math.hypot(e.clientX - ned.x, e.clientY - ned.y) : 0;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (flyttat > DRAG_GRANS_PX) return;
    const r = behallare.getBoundingClientRect();
    const ll = karta.unproject([e.clientX - r.left, e.clientY - r.top]);
    vidPosition(ll.lat, ll.lng);
  };
  behallare.addEventListener('pointerdown', nedFn, true);
  behallare.addEventListener('click', klickFn, true);
  return () => { behallare.removeEventListener('pointerdown', nedFn, true); behallare.removeEventListener('click', klickFn, true); };
}
