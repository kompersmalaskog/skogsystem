import type { CSSProperties, ReactNode } from "react";
import { KOLUMN } from "@/lib/design/tokens";

/**
 * Kolumnen (lib/design/tokens KOLUMN): innehållet bor i en centrerad kolumn med maxbredd.
 * `smal` = listor, kort, formulär. `bred` = rutnät och tidslinjer.
 *
 * Sidmarginalen (16) ligger på vyns rot (VY_ROT), inte här — då är kolumnen exakt
 * fönsterbredden minus marginalerna under maxbredden, och på telefon händer ingenting.
 */
export default function VyKolumn({ bredd = "smal", style, children }: { bredd?: "smal" | "bred"; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ width: "100%", maxWidth: KOLUMN[bredd], margin: "0 auto", boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}
