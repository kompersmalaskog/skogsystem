// "Flytta mig hit" i testläget (/maskin?som=…, bara admin): tryck på kartan flyttar den visade maskinens position för hand.
// Fångar DOM-klicket i infångningsfasen på kartans container (som objektlistans fångst, lib/hooks/useObjektPrickar), så inget annat på kartan
// reagerar på trycket. Ett drag (panorering, > 8 px) räknas inte som ett tryck. Ren koppling, ingen React: provas i jsdom.

import { LANGTRYCK_MS, LANGTRYCK_RORELSE_PX } from './langtryck';

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

// ---------------------------------------------------------------------------------------------------------------------------------
// Håll fingret på kartan → flytta testpositionen dit (testläget, /maskin?som=…). Bara i testläget — aldrig med riktig GPS — och utan att "Flytta mig hit" behöver slås på:
// i testläget står maskinen still, och utan det här går inget som reagerar på positionen (larm, instruktioner, lossning) att prova hemifrån.
// Som kopplaFlyttaMig: DOM-händelser på kartans container i infångningsfasen, ingen React. Ett drag, ett nyp eller en lyft innan tiden gått räknas inte;
// klicket som följer på lyftet efter ett långtryck sväljs så inget annat på kartan (kort, symboler) reagerar på det.
// ---------------------------------------------------------------------------------------------------------------------------------


/** Hur länge efter lyftet klicket efter ett långtryck sväljs. */
export const TEST_KLICK_SLUK_MS = 500;

export function kopplaLangtryckFlytt(
  karta: KaraForLangtryck,
  vidPosition: (lat: number, lon: number) => void,
  opt: { ms?: number; rorelsePx?: number; nu?: () => number; vibrera?: () => void } = {},
): () => void {
  const behallare = karta.getContainer?.() ?? null;
  if (!behallare) return () => {};
  const ms = opt.ms ?? LANGTRYCK_MS;
  const rorelsePx = opt.rorelsePx ?? LANGTRYCK_RORELSE_PX;
  const nu = opt.nu ?? (() => Date.now());
  const vibrera = opt.vibrera ?? (() => { try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20); } catch { /* */ } });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  const nere = new Set<number>();
  let slukTill = 0;
  let flyttat = false;
  const stopp = () => { if (timer) { clearTimeout(timer); timer = null; } start = null; };

  const ned = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    nere.add(e.pointerId);
    flyttat = false;
    stopp();
    if (nere.size > 1) return;   // nyp = zoom
    start = { x: e.clientX, y: e.clientY };
    const x = e.clientX, y = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      const r = behallare.getBoundingClientRect();
      const ll = karta.unproject([x - r.left, y - r.top]);
      flyttat = true;
      vibrera();
      vidPosition(ll.lat, ll.lng);
    }, ms);
  };
  const ror = (e: PointerEvent) => { if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > rorelsePx) stopp(); };
  const upp = (e: PointerEvent) => {
    nere.delete(e.pointerId);
    if (flyttat) { slukTill = nu() + TEST_KLICK_SLUK_MS; flyttat = false; }
    stopp();
  };
  const avbryt = (e: PointerEvent) => { nere.delete(e.pointerId); flyttat = false; stopp(); };
  const klick = (e: MouseEvent) => { if (nu() < slukTill) { e.stopImmediatePropagation(); e.preventDefault(); } };
  // Långt tryck med mus/penna öppnar annars webbläsarens meny.
  const meny = (e: Event) => { if (timer || flyttat || nu() < slukTill) e.preventDefault(); };

  behallare.addEventListener('pointerdown', ned, true);
  behallare.addEventListener('pointermove', ror, true);
  behallare.addEventListener('pointerup', upp, true);
  behallare.addEventListener('pointercancel', avbryt, true);
  behallare.addEventListener('click', klick, true);
  behallare.addEventListener('contextmenu', meny, true);
  return () => {
    stopp();
    behallare.removeEventListener('pointerdown', ned, true);
    behallare.removeEventListener('pointermove', ror, true);
    behallare.removeEventListener('pointerup', upp, true);
    behallare.removeEventListener('pointercancel', avbryt, true);
    behallare.removeEventListener('click', klick, true);
    behallare.removeEventListener('contextmenu', meny, true);
  };
}

type KaraForLangtryck = KartaForFlytt;
