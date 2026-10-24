'use client';
// Behållaren för kontrollens innehåll. Två former, SAMMA innehåll:
//   blad  — telefon: ett blad nerifrån (som Ark), men med två lägen som Apple Kartor: HALVT (svaret) och HELT (dra uppåt: stockarna). Greppet dras uppåt/nedåt
//           eller trycks för att växla; dras ett halvt blad nedåt stängs det. Stam, stock och plan öppnas i SAMMA blad (push, "‹ tillbaka") — aldrig blad på blad.
//   panel — iPad/dator: kontrollen ligger i panelen till höger om listan (som Mail), alltid framme, utan grepp och utan att stängas.
// Bara själva kontrollen har lägen; stam, stock och dag är helt/automatisk höjd. Reglerna för dragning är objektlistans (lib/plusArk: valjListdetent, dragHojd).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Ikon from '@/components/design/Ikon';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, IKON, KNAPP, KOLUMN, LAYOUT, RADIE, RORELSE, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import { dragHojd, valjListdetent, type Detent } from '@/lib/plusArk';

const HALV_VH = 64;
const HEL_VH = 92;
/** Pekaren rör sig mindre än så här (px) = ett tryck på greppet, inte ett drag. */
const TRYCK_MAX_PX = 6;

export type BladLage = 'blad' | 'panel';

export default function KontrollPanel({ lage, rubrik, tillbakaEtikett, onTillbaka, onStang, lagen, detent, onDetent, nyckel, children }: {
  lage: BladLage;
  /** Postens rubrik: "Kontroll", "Stam 1", "Stock 2", "Onsdag 21 oktober". */
  rubrik: string;
  /** "‹ Kontroll" — finns när bladet har något att gå tillbaka till. */
  tillbakaEtikett: string | null;
  onTillbaka: () => void;
  onStang: () => void;
  /** Bara kontrollen själv har halvt/helt läge; övriga poster är höjden de behöver (högst helt). */
  lagen: boolean;
  detent: Detent;
  onDetent: (d: Detent) => void;
  /** Byter när innehållet byter (push/pop) — innehållet tonar över. */
  nyckel: string;
  children: ReactNode;
}) {
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ y0: number; h0: number; flyttat: boolean } | null>(null);
  const arBlad = lage === 'blad';

  useEffect(() => {
    if (!arBlad) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onStang(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [arBlad, onStang]);

  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!arBlad || !lagen || (e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const h0 = (e.currentTarget.closest('[data-kontroll-blad]') as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
    drag.current = { y0: e.clientY, h0, flyttat: false };
  };
  const ror = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > TRYCK_MAX_PX) d.flyttat = true;
    if (d.flyttat) setDragPx(dragHojd(d.h0, dy, window.innerHeight));
  };
  const slut = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragPx(null);
    if (!d.flyttat) { onDetent(detent === 'halv' ? 'hel' : 'halv'); return; } // tryck på greppet växlar halvt ↔ helt
    const nasta = valjListdetent(detent, e.clientY - d.y0, true);
    if (nasta === 'stang') onStang(); else onDetent(nasta);
  };

  const hojd = !arBlad ? undefined
    : dragPx != null ? `${dragPx}px`
    : lagen ? `${detent === 'hel' ? HEL_VH : HALV_VH}vh`
    : undefined;

  const huvud = (
    <div onPointerDown={start} onPointerMove={ror} onPointerUp={slut} onPointerCancel={slut}
      style={{ flexShrink: 0, touchAction: arBlad && lagen ? 'none' : undefined, cursor: arBlad && lagen ? 'grab' : undefined }}>
      {arBlad && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>
          <div data-kontroll-grepp="" role={lagen ? 'button' : undefined} aria-label={lagen ? (detent === 'halv' ? 'Dra upp kontrollen' : 'Dra ned kontrollen') : undefined}
            style={{ width: 36, height: AVSTAND.xs, borderRadius: RADIE.rad, background: FARG.fyllning }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px` }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          {tillbakaEtikett ? (
            <button type="button" onClick={onTillbaka} aria-label={`Tillbaka till ${tillbakaEtikett}`} style={{ ...KNAPP.lank, flexShrink: 0 }}>
              <Ikon namn="chevron_left" storlek={IKON.rad} farg="inherit" /><span>{tillbakaEtikett}</span>
            </button>
          ) : (
            <h2 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{rubrik}</h2>
          )}
        </div>
        {arBlad && <button type="button" onClick={onStang} style={KNAPP.lank}>Klar</button>}
      </div>
      {tillbakaEtikett && (
        <h2 style={{ margin: `0 ${AVSTAND.l}px ${AVSTAND.xs}px`, ...TYP.rubrik, color: FARG.text }}>{rubrik}</h2>
      )}
    </div>
  );

  const innehall = (
    <div style={{
      flex: 1, minHeight: 0, overflowY: arBlad && lagen && detent === 'halv' ? 'hidden' : 'auto',
      padding: `${AVSTAND.s}px ${AVSTAND.l}px ${arBlad ? medSafeBotten(AVSTAND.xl) : `${AVSTAND.xl}px`}`,
    }}>
      <Tillstand nyckel={nyckel}>{children}</Tillstand>
    </div>
  );

  if (!arBlad) {
    return (
      <aside aria-label="Kontroll" data-kontroll-panel=""
        style={{
          position: 'sticky', top: `calc(${LAYOUT.topbar} + ${AVSTAND.l}px)`, maxHeight: `calc(100vh - ${LAYOUT.topbar} - ${AVSTAND.xl}px)`,
          display: 'flex', flexDirection: 'column', background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden',
        }}>
        {huvud}{innehall}
      </aside>
    );
  }
  return (
    <div className="tona-opacity" onClick={onStang} role="dialog" aria-modal="true" aria-label={rubrik}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="sheet-upp" data-kontroll-blad="" data-detent={lagen ? detent : 'auto'} onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: KOLUMN.ark, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', height: hojd, maxHeight: `${HEL_VH}vh`,
          transition: dragPx == null ? `height ${RORELSE.sheet}ms ${RORELSE.kurva}` : 'none',
        }}>
        {huvud}{innehall}
      </div>
    </div>
  );
}
