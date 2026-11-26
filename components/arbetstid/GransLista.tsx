"use client";
// Arbetstidens gränser som en lista: samma rader för föraren (Min tid) och för admin (Lön › Arbetstid, förarens ark).
// Tryck på en rad visar vad lagen säger. Färgen förstärker talet och meningen — den bär aldrig ensam.
import { useState } from "react";
import { AVSTAND, FARG, IKON, KNAPP, KORT, RORELSE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import type { Gransstatus } from "@/lib/arbetstidsgranser";
import { LAGEN_FORARE, gransEnhet, gransRubrik, synligaGranser } from "@/lib/arbetstidVisning";

export default function GransLista({ granser, nu, kort = true }: { granser: Gransstatus[]; nu: Date; /** false = raderna direkt på ytan (i ett ark, som redan är ett kort). */ kort?: boolean }) {
  const [oppen, setOppen] = useState<string | null>(null);
  const rader = synligaGranser(granser);
  return (
    <>
      <div style={kort ? { ...KORT, paddingTop: 0, paddingBottom: 0 } : undefined}>
        {rader.map((g, i) => {
          const farg = g.niva === "rod" ? FARG.rod : g.niva === "gul" ? FARG.orange : FARG.text;
          const [namn, under] = gransRubrik(g.id, nu);
          return (
            <div key={g.id} data-grans={g.id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i < rader.length - 1 ? `1px solid ${FARG.linje}` : "none" }}>
              <button data-grans-tryck="" aria-expanded={oppen === g.id} onClick={() => setOppen(o => (o === g.id ? null : g.id))}
                style={{ ...KNAPP.tertiar, display: "flex", width: "100%", justifyContent: "space-between", alignItems: "baseline", gap: AVSTAND.m, padding: 0, minHeight: TRAFFYTA.min, height: "auto", textAlign: "left", color: FARG.text }}>
                <span style={{ ...TYP.meta, color: FARG.text, display: "inline-flex", alignItems: "center", gap: AVSTAND.xs }}>{namn}{under && <span style={{ color: FARG.text2 }}> · {under}</span>}</span>
                <span style={{ ...TYP.listtitel, ...TNUM, color: farg, whiteSpace: "nowrap" }}>
                  {g.varde == null ? "–" : `${Number(g.varde).toLocaleString("sv-SE")} ${gransEnhet(g.id)}`}
                  <span style={{ ...TYP.meta, color: FARG.text2 }}> av {Number(g.grans).toLocaleString("sv-SE")}</span>
                  <span data-grans-pil="" className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3, marginLeft: AVSTAND.xs, verticalAlign: "middle", display: "inline-block", transform: oppen === g.id ? "rotate(90deg)" : "none", transition: `transform ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>chevron_right</span>
                </span>
              </button>
              {(g.niva !== "lugn" || g.varde == null) && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: g.niva === "lugn" ? FARG.text2 : farg }}>{g.mening}</p>}
              {oppen === g.id && <p data-grans-varfor="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{LAGEN_FORARE[g.id]}</p>}
            </div>
          );
        })}
      </div>
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Tryck på en rad för att se vad lagen säger.</p>
    </>
  );
}
