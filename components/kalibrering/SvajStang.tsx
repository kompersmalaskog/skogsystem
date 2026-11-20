'use client';
// iOS-mönstret: dra ner på arket för att stänga. Bara arkets övre 200 px är dragyta (greppet + rubriken) — resten behåller scroll.
// Flyttat ur den gamla sidan (useSwipeDownToClose) oförändrat i tröskel (100 px eller 0,5 px/ms) men utan egen CSS: arket är `Ark` ur
// components/design, så vi söker upp dess ytor i DOM och flyttar dem med transform. Rörelsen använder RORELSE-tiderna.
import { useRef, type ReactNode, type TouchEvent } from 'react';
import { RORELSE } from '@/lib/design/tokens';

const DRAGYTA_PX = 200;
const AVSTAND_STANG_PX = 100;
const FART_STANG = 0.5;

export default function SvajStang({ onStang, children }: { onStang: () => void; children: ReactNode }) {
  const omslag = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const startTid = useRef(0);

  const ark = () => omslag.current?.querySelector<HTMLElement>('.sheet-upp') ?? null;

  const start = (e: TouchEvent<HTMLDivElement>) => {
    const rect = ark()?.getBoundingClientRect();
    if (!rect) return;
    const y = e.touches[0].clientY;
    if (y - rect.top > DRAGYTA_PX) return; // resten är scrollyta
    startY.current = y;
    startTid.current = Date.now();
  };

  const ror = (e: TouchEvent<HTMLDivElement>) => {
    if (startY.current == null) return;
    const delta = e.touches[0].clientY - startY.current;
    const el = ark();
    if (delta <= 0 || !el) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;
  };

  const slut = (e: TouchEvent<HTMLDivElement>) => {
    if (startY.current == null) return;
    const delta = e.changedTouches[0].clientY - startY.current;
    const fart = delta / Math.max(1, Date.now() - startTid.current);
    startY.current = null;
    const el = ark();
    const overgang = `transform ${RORELSE.byte}ms ${RORELSE.kurva}`;
    if (delta > AVSTAND_STANG_PX || fart > FART_STANG) {
      if (el) { el.style.transition = overgang; el.style.transform = 'translateY(100%)'; }
      window.setTimeout(onStang, RORELSE.byte);
    } else if (el) {
      el.style.transition = overgang;
      el.style.transform = '';
      window.setTimeout(() => { el.style.transition = ''; }, RORELSE.byte);
    }
  };

  // display: contents — omslaget tar ingen plats, händelserna bubblar ändå upp till det.
  return (
    <div ref={omslag} onTouchStart={start} onTouchMove={ror} onTouchEnd={slut} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
