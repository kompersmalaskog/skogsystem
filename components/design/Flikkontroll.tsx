import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP, VIKT } from "@/lib/design/tokens";

/**
 * Flikkontroll för "samma data, olika vinkel" — Min tids form (Arbetsrapport.tsx, `minTidFlik`):
 * `FARG.linje`-bakgrund, 4 px inre marginal, 44 px knappar, vald = `FARG.fyllning` + 600.
 * Inte navigation (skillen: tabbar är olika vyer av samma data).
 */
export default function Flikkontroll<T extends string>({ flikar, aktiv, onVal }: { flikar: readonly (readonly [T, string])[]; aktiv: T; onVal: (id: T) => void }) {
  return (
    <div role="tablist" style={{ display: "flex", background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs }}>
      {flikar.map(([id, etikett]) => {
        const vald = id === aktiv;
        return (
          <button key={id} role="tab" aria-selected={vald} onClick={() => onVal(id)}
            style={{ flex: 1, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.s}px`, borderRadius: RADIE.rad, border: "none", ...TYP.meta, fontWeight: vald ? VIKT.halvfet : VIKT.normal, cursor: "pointer", fontFamily: "inherit", background: vald ? FARG.fyllning : "transparent", color: vald ? FARG.text : FARG.text2, whiteSpace: "nowrap" }}>
            {etikett}
          </button>
        );
      })}
    </div>
  );
}
