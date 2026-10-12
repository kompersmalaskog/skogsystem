"use client";
// ─────────────────────────────────────────────────────────────
// Kompakt veckoväljare som fälls ut under raden Från/Till i utjämningsperiodens ark (som Apple Kalender): en kort, scrollbar
// ruta med veckorna ±6 månader runt den valda. Tryck på en vecka väljer den; raden ovanför stänger rutan (det sköter arket).
//
// Veckor som redan ligger i en annan period för de valda förarna får en liten grå etikett med periodens NAMN. Det är en
// upplysning, aldrig en spärr, och aldrig orange. Markeringen bärs av bocken i raden (aria-pressed), inte av färgen ensam.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef } from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { krockText, veckoRader, veckoValFonster } from "@/lib/admin/utjamningsperiod";
import { Ikon } from "./ui";

type Krock = { namn?: string | null; anteckning?: string | null; startdatum?: string; slutdatum?: string };

/** Så många rader syns utan scroll i rutan. */
const SYNLIGA_RADER = 5;

export default function VeckoVal({ slag, vald, fran, onVal, krockerIVecka }: {
  slag: "fran" | "till";
  /** Måndagen i den valda veckan. */
  vald: string;
  /** Från-veckan (måndag): Till visas aldrig före den. */
  fran: string;
  onVal: (mandag: string) => void;
  /** Perioder som ligger över veckan för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
}) {
  const f = veckoValFonster(slag, vald, fran);
  const rader = useMemo(() => veckoRader(f.fran, f.till), [f.fran, f.till]);
  const ruta = useRef<HTMLDivElement>(null);
  const valdAr = new Date(vald + "T00:00:00").getFullYear();

  // Rutan öppnas med den valda veckan i sikte: man ska inte behöva scrolla fram den.
  useEffect(() => {
    const rad = ruta.current?.querySelector<HTMLElement>(`[data-vecka="${vald}"]`);
    if (ruta.current && rad) ruta.current.scrollTop = Math.max(0, rad.offsetTop - TRAFFYTA.min * 2);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ruta} role="listbox" aria-label={slag === "fran" ? "Från vecka" : "Till vecka"} data-panel={slag}
      style={{ position: "relative", maxHeight: TRAFFYTA.min * SYNLIGA_RADER, overflowY: "auto", overscrollBehavior: "contain", background: FARG.bg, borderRadius: RADIE.rad }}>
      {rader.map(r => {
        const arVald = r.mandag === vald;
        const text = krockText(krockerIVecka(r.mandag));
        return (
          <button key={r.mandag} type="button" role="option" aria-selected={arVald} aria-pressed={arVald} data-vecka={r.mandag} data-krock={text || undefined}
            onClick={() => onVal(r.mandag)}
            style={{ display: "flex", alignItems: "center", gap: AVSTAND.s, width: "100%", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              background: arVald ? FARG.upphojt : "transparent", color: text && !arVald ? FARG.text2 : FARG.text, ...TYP.text }}>
            <span style={{ width: AVSTAND.xl, flexShrink: 0, display: "inline-flex" }}>{arVald && <Ikon namn="check" farg={FARG.text} />}</span>
            <span style={{ flexShrink: 0, ...(arVald ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>{r.etikett}{r.ar !== valdAr ? ` ${r.ar}` : ""}</span>
            <span style={{ flex: 1 }} />
            {text && (
              <span data-krock-etikett style={{ ...TYP.micro, textTransform: "none", letterSpacing: 0, color: FARG.text2, background: FARG.fyllning, borderRadius: RADIE.stapel, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, whiteSpace: "nowrap", maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
