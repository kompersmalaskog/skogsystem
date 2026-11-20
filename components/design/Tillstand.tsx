"use client";
// Ett tillstånd som byter TONAR ÖVER i nästa — det hoppar inte, och det som
// försvinner lämnar inte ett hål. Det är skillnaden mellan villkorlig
// rendering (`{a ? <X/> : <Y/>}`, som appen gjort överallt) och Apple-känsla.
//
// Användning:
//   <Tillstand nyckel={isWorking ? "pagar" : "vantar"}>
//     {isWorking ? <Pagar/> : <Vantar/>}
//   </Tillstand>
//
// När `nyckel` ändras: det gamla innehållet tonar ut (opacity, RORELSE.byte),
// sedan tonar det nya in på plats (opacity + lyft). Höjden reserveras under
// bytet så inget under flyttar sig. Reduced motion: bara opacity (via
// designCss), ingen lyft.
//
// Kräver att designCss är renderad en gång i vyn (`<style>{designCss}</style>`).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { RORELSE } from "@/lib/design/tokens";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Props = {
  nyckel: string;
  children: ReactNode;
  style?: CSSProperties;
};

export default function Tillstand({ nyckel, children, style }: Props) {
  const [visadNyckel, setVisadNyckel] = useState(nyckel);
  const [visatInnehall, setVisatInnehall] = useState<ReactNode>(children);
  const [fas, setFas] = useState<"inne" | "ut">("inne");
  const [reserveradHojd, setReserveradHojd] = useState<number | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  // Samma nyckel: byt innehåll direkt (t.ex. ett tal som uppdateras inuti tillståndet).
  useEffect(() => {
    if (nyckel === visadNyckel) setVisatInnehall(children);
  }, [children, nyckel, visadNyckel]);

  // Ny nyckel: reservera höjden, tona ut, byt, tona in.
  useIsoLayoutEffect(() => {
    if (nyckel === visadNyckel) return;
    const h = ref.current?.offsetHeight;
    if (h) setReserveradHojd(h);
    setFas("ut");
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setVisadNyckel(nyckel);
      setVisatInnehall(children);
      setFas("inne");
      // Släpp höjden när det nya hunnit tona in.
      timer.current = window.setTimeout(() => setReserveradHojd(undefined), RORELSE.byte);
    }, RORELSE.byte);
    return () => { if (timer.current != null) window.clearTimeout(timer.current); };
  }, [nyckel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      style={{
        minHeight: reserveradHojd,
        opacity: fas === "ut" ? 0 : 1,
        transition: `opacity ${RORELSE.byte}ms ${RORELSE.kurva}`,
        ...style,
      }}
    >
      <div key={visadNyckel} className={fas === "inne" ? "tona-in" : undefined}>
        {visatInnehall}
      </div>
    </div>
  );
}
