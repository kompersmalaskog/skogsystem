"use client";
import { useEffect, type ReactNode } from "react";
import { AVSTAND, FARG, KNAPP, KOLUMN, RADIE, TYP, medSafeBotten } from "@/lib/design/tokens";

/**
 * Ark (bottom sheet) — Arbetsrapports form (PeriodForm / rastFragaUI), ett ställe:
 *  - `KOLUMN.ark` (520) bred, förankrat nederst, centrerat; radie `RADIE.sheet`;
 *  - grabber 36×4 `FARG.fyllning`, rubrik `TYP.rubrik` till vänster och Avbryt (`KNAPP.lank`) till höger;
 *  - innehållet scrollar, `fot` (skärmens EN primära knapp) ligger FAST nederst och är alltid synlig;
 *  - nedre padding med hemindikatorhänsyn (`medSafeBotten`) — annars ritas knappen in i hemindikatorn på iPhone;
 *  - Esc och tryck utanför stänger (mus/tangentbord på kontoret, finger i maskinen — samma ark).
 * Kräver `designCss` på vyns rot (`.tona-opacity`, `.sheet-upp`).
 */
export default function Ark({ rubrik, onStang, fot, children }: { rubrik: string; onStang: () => void; fot?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") onStang(); };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [onStang]);

  return (
    <div className="tona-opacity" onClick={onStang} role="dialog" aria-modal="true" aria-label={rubrik}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1600, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div className="sheet-upp" onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: KOLUMN.ark, background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, maxHeight: "92vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: `${AVSTAND.s}px 0 ${AVSTAND.xs}px`, flexShrink: 0 }}>
          <div style={{ width: 36, height: AVSTAND.xs, borderRadius: RADIE.rad, background: FARG.fyllning }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px`, flexShrink: 0 }}>
          <h2 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{rubrik}</h2>
          <button onClick={onStang} style={KNAPP.lank}>Avbryt</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: `${AVSTAND.s}px ${AVSTAND.l}px ${fot ? `${AVSTAND.l}px` : medSafeBotten(AVSTAND.xl)}` }}>
          {children}
        </div>
        {fot && (
          <div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}`, borderTop: `1px solid ${FARG.linje}`, display: "flex", flexDirection: "column", gap: AVSTAND.s }}>
            {fot}
          </div>
        )}
      </div>
    </div>
  );
}
