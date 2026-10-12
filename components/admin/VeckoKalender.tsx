"use client";
// ─────────────────────────────────────────────────────────────
// Veckoväljare: en rad per vecka (v44 · 26 okt–1 nov) under månadsrubriker, scrollbar. Tryck första veckan, tryck sista
// veckan, allt emellan markeras; tryck igen = börja om (lib/admin/utjamningsperiod.tryckVecka).
//
// Veckor som redan ligger i en period för de valda förarna tonas med periodens anteckning. Det är en varning, aldrig en spärr.
// Markeringen bärs av bocken i raden (aria-pressed), inte av färgen ensam.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef } from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { arIUrval, krockText, veckoRader, type Urval } from "@/lib/admin/utjamningsperiod";
import { Ikon } from "./ui";

type Krock = { anteckning: string };

export default function VeckoKalender({ urval, onTryck, krockerIVecka, extra = [] }: {
  urval: Urval;
  onTryck: (mandag: string) => void;
  /** Perioder som ligger över veckan för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
  /** Datum som måste få plats (en sparad period från ett annat år). */
  extra?: string[];
}) {
  const ar = new Date().getFullYear();
  const rader = useMemo(() => veckoRader(ar, extra), [ar, extra.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const behallare = useRef<HTMLDivElement>(null);

  // Öppnas på det man ändrar, annars på veckan vi är i: man ska inte behöva scrolla fram.
  useEffect(() => {
    const mal = urval.forsta || (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymdLokal(d); })();
    const rad = behallare.current?.querySelector<HTMLElement>(`[data-vecka="${mal}"]`);
    if (behallare.current && rad) behallare.current.scrollTop = Math.max(0, rad.offsetTop - TRAFFYTA.min * 2);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let forraManad = "";
  return (
    <div ref={behallare} role="group" aria-label="Veckor" data-vecko-kalender
      style={{ position: "relative", maxHeight: "40vh", overflowY: "auto", background: FARG.bg, borderRadius: RADIE.rad, overscrollBehavior: "contain" }}>
      {rader.map(r => {
        const nyManad = r.manad !== forraManad;
        forraManad = r.manad;
        const valdVecka = arIUrval(urval, r.mandag);
        const krock = krockerIVecka(r.mandag);
        const text = krockText(krock);
        return (
          <React.Fragment key={r.mandag}>
            {nyManad && (
              <div data-manad={r.manad} style={{ position: "sticky", top: 0, zIndex: 1, background: FARG.bg, ...TYP.micro, color: FARG.text2, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.xs}px` }}>
                {r.manadText}
              </div>
            )}
            <button type="button" data-vecka={r.mandag} aria-pressed={valdVecka} data-krock={text || undefined}
              onClick={() => onTryck(r.mandag)}
              style={{ display: "flex", alignItems: "center", gap: AVSTAND.s, width: "100%", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                background: valdVecka ? FARG.upphojt : "transparent", color: krock.length && !valdVecka ? FARG.text3 : FARG.text, ...TYP.text }}>
              <span style={{ width: AVSTAND.xl, flexShrink: 0, display: "inline-flex" }}>{valdVecka && <Ikon namn="check" farg={FARG.text} />}</span>
              <span style={{ flexShrink: 0, ...(valdVecka ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>{r.etikett}</span>
              {text && (
                <span style={{ flex: 1, minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...TYP.meta, color: valdVecka ? FARG.orange : FARG.text3 }}>{text}</span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
