"use client";
// Ett tal som ändras räknar upp — det hoppar inte. RORELSE.tal (400 ms),
// samma kurva som allt annat. Första renderingen visar värdet direkt;
// bara ÄNDRINGAR animeras. Respekterar prefers-reduced-motion (då hopp).
//
// Användning:
//   const visat = useRaknaUpp(spec.timlon_h, 1);   // 1 decimal
//   <span style={TNUM}>{visat}</span>
//
// Returnerar en STRÄNG med svensk decimalkomma, så att bredden är stabil
// tillsammans med TNUM.

import { useEffect, useRef, useState } from "react";
import { RORELSE } from "./tokens";

// cubic-bezier(0.2, 0, 0, 1) approximerad som ease-out-kubik — nära nog för
// 400 ms på ett tal, och slipper en bezier-lösare i klienten.
function kurva(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function reduceradRorelse(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function formateraTal(v: number, decimaler: number): string {
  return v.toLocaleString("sv-SE", { minimumFractionDigits: decimaler, maximumFractionDigits: decimaler });
}

export function useRaknaUpp(mal: number | null | undefined, decimaler = 0): string {
  const malTal = typeof mal === "number" && Number.isFinite(mal) ? mal : 0;
  const [visat, setVisat] = useState(malTal);
  const fran = useRef(malTal);
  const forsta = useRef(true);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (forsta.current) { forsta.current = false; fran.current = malTal; setVisat(malTal); return; }
    if (fran.current === malTal) return;
    if (reduceradRorelse()) { fran.current = malTal; setVisat(malTal); return; }

    const start = performance.now();
    const startVarde = fran.current;
    const steg = (nu: number) => {
      const t = Math.min(1, (nu - start) / RORELSE.tal);
      const v = startVarde + (malTal - startVarde) * kurva(t);
      setVisat(v);
      if (t < 1) raf.current = requestAnimationFrame(steg);
      else fran.current = malTal;
    };
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(steg);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, [malTal]);

  return formateraTal(visat, decimaler);
}
