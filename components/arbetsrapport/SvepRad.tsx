"use client";
// SVEPRAD — en rad som tas bort med ett svep åt vänster (iOS-mönstret): svepet visar en röd "Ta bort" bakom raden, ett tryck på
// den tar bort. Svepet skriver ingenting. Ett tryck på raden (utan drag) gör det raden annars gör (onTryck); är raden öppnad
// stänger det den. Bara sidled räknas: ett drag mer uppåt/nedåt än åt sidan är scroll, och ett svep åt höger gör ingenting.
// Pekare (mus, penna och touch) via pointer events; touch-action: pan-y låter sidan scrolla vertikalt. Trycket är webbläsarens click
// (som ett drag inte får räknas som).
import { useRef, useState, type ReactNode } from "react";
import { TYP, AVSTAND, FARG, KNAPP, TRAFFYTA, RORELSE } from "@/lib/design/tokens";

/** Bredden på den röda knappen och hur långt ett svep måste gå för att räknas (halva knappen). */
const KNAPP_BREDD = 88;
const SVEP_TROSKEL = KNAPP_BREDD / 2;
/** Så lite rörelse är fortfarande ett tryck. */
const TRYCK_MAX = 8;

export default function SvepRad({ children, onTryck, onTaBort }: { children: ReactNode; onTryck: () => void; onTaBort: () => void }) {
  const [forskjutning, setForskjutning] = useState(0); // 0 … -KNAPP_BREDD
  const [drar, setDrar] = useState(false);
  const start = useRef<{ x: number; y: number; bas: number } | null>(null);
  const riktning = useRef<"sidled" | "lodrat" | null>(null);
  const drogs = useRef(false); // ett drag följs av ett click i webbläsaren — det är inget tryck

  const oppen = forskjutning <= -SVEP_TROSKEL;
  const klampa = (v: number) => Math.max(-KNAPP_BREDD, Math.min(0, v));
  const stillsam = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {forskjutning < 0 && (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: KNAPP_BREDD, display: "flex", alignItems: "center", justifyContent: "center", background: FARG.upphojt }}>
          <button onClick={onTaBort} style={{ ...KNAPP.destruktiv, minWidth: KNAPP_BREDD, minHeight: TRAFFYTA.min, justifyContent: "center" }}>Ta bort</button>
        </div>
      )}
      <div
        data-svep="rad"
        onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY, bas: oppen ? -KNAPP_BREDD : 0 }; riktning.current = null; }}
        onPointerMove={e => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x, dy = e.clientY - s.y;
          if (!riktning.current) {
            if (Math.abs(dx) <= TRYCK_MAX && Math.abs(dy) <= TRYCK_MAX) return;
            riktning.current = Math.abs(dx) > Math.abs(dy) ? "sidled" : "lodrat";
          }
          if (riktning.current !== "sidled") return;
          setDrar(true);
          drogs.current = true;
          setForskjutning(klampa(s.bas + dx));
        }}
        onPointerUp={() => {
          start.current = null;
          const var_sidled = riktning.current === "sidled";
          riktning.current = null;
          setDrar(false);
          if (var_sidled) setForskjutning(f => (f <= -SVEP_TROSKEL ? -KNAPP_BREDD : 0));
        }}
        onClick={() => {
          if (drogs.current) { drogs.current = false; return; }
          if (oppen) setForskjutning(0); else onTryck();
        }}
        onPointerCancel={() => { start.current = null; riktning.current = null; setDrar(false); setForskjutning(f => (f <= -SVEP_TROSKEL ? -KNAPP_BREDD : 0)); }}
        style={{
          touchAction: "pan-y", background: FARG.kort, cursor: "pointer",
          transform: `translateX(${forskjutning}px)`,
          transition: drar || stillsam ? "none" : `transform ${RORELSE.tryck}ms ${RORELSE.kurva}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
