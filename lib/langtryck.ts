// Långtryck (håll fingret) — "Lägg i plus" på en rad i Lager/Inställningar och "Ta bort" på en genväg i snabbarket.
//
// En liten styrning utan React-beroenden: start() sätter en timer, stopp() avbryter den (finger släpps, glider iväg eller
// sidan scrollar), och slukKlick() används FÖRST i radens onClick — efter ett långtryck kommer fingerlyftet som ett vanligt
// klick, och det ska inte också växla lagret eller öppna något.

export const LANGTRYCK_MS = 500;
/** Rör sig fingret mer än så här (px) är det en scroll/drag, inte ett håll. */
export const LANGTRYCK_RORELSE_PX = 10;

export interface Langtryck {
  start(vid: () => void, x?: number, y?: number): void;
  /** Fingret rörde sig: avbryt om det gått för långt från starten. */
  rorelse(x: number, y: number): void;
  stopp(): void;
  /** true = det senaste trycket var ett långtryck; klicket ska ignoreras (nollställer flaggan). */
  slukKlick(): boolean;
}

export function skapaLangtryck(ms: number = LANGTRYCK_MS, rorelsePx: number = LANGTRYCK_RORELSE_PX): Langtryck {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let avfyrad = false;
  let startX = 0, startY = 0;
  const stoppa = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return {
    start(vid, x = 0, y = 0) {
      stoppa();
      avfyrad = false;
      startX = x; startY = y;
      timer = setTimeout(() => { timer = null; avfyrad = true; vid(); }, ms);
    },
    rorelse(x, y) {
      if (timer && Math.hypot(x - startX, y - startY) > rorelsePx) stoppa();
    },
    stopp: stoppa,
    slukKlick() {
      const a = avfyrad;
      avfyrad = false;
      return a;
    },
  };
}
