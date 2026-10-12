"use client";
// ─────────────────────────────────────────────────────────────
// Veckoväljare: en rad per vecka (v44 · 26 okt–1 nov) under månadsrubriker. Tryck första veckan, tryck sista veckan, allt
// emellan markeras; tryck igen = börja om (lib/admin/utjamningsperiod.tryckVecka).
//
// EN scroll: listan scrollar inte själv, arket gör det. Därför visas bara ca sex månader framåt och sex veckor bakåt runt det
// som är valt (annars runt veckan vi är i), och två knappar tar fram 26 veckor till åt gången.
//
// En vecka som redan ligger i en annan period för de valda förarna får en liten grå etikett med periodens NAMN. Det är en
// upplysning, aldrig en spärr, och aldrig orange (orange är för det man ska göra något åt).
// Markeringen bärs av bocken i raden (aria-pressed), inte av färgen ensam.
// ─────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { arIUrval, krockText, veckoFonster, veckoRader, type Urval } from "@/lib/admin/utjamningsperiod";
import { Ikon, Tertiar } from "./ui";

type Krock = { namn?: string | null; anteckning?: string | null };

const mandagIdag = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymdLokal(d); };

export default function VeckoKalender({ urval, onTryck, krockerIVecka }: {
  urval: Urval;
  onTryck: (mandag: string) => void;
  /** Perioder som ligger över veckan för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
}) {
  // Fönstret bestäms av vad som var valt när kalendern öppnades: raderna hoppar inte medan man trycker.
  const [bas] = useState(urval);
  const [bakat, setBakat] = useState(0);
  const [framat, setFramat] = useState(0);
  const rader = useMemo(() => {
    const f = veckoFonster(bas, mandagIdag(), bakat, framat);
    return veckoRader(f.fran, f.till);
  }, [bas, bakat, framat]);

  let forraManad = "";
  return (
    <div role="group" aria-label="Veckor" data-vecko-kalender style={{ background: FARG.bg, borderRadius: RADIE.rad, overflow: "hidden" }}>
      <Tertiar onClick={() => setBakat(n => n + 1)} style={{ width: "100%" }}>Tidigare veckor</Tertiar>
      {rader.map(r => {
        const nyManad = r.manad !== forraManad;
        forraManad = r.manad;
        const valdVecka = arIUrval(urval, r.mandag);
        const text = krockText(krockerIVecka(r.mandag));
        return (
          <React.Fragment key={r.mandag}>
            {nyManad && (
              <div data-manad={r.manad} style={{ ...TYP.micro, color: FARG.text2, padding: `${AVSTAND.m}px ${AVSTAND.m}px ${AVSTAND.xs}px` }}>
                {r.manadText}
              </div>
            )}
            <button type="button" data-vecka={r.mandag} aria-pressed={valdVecka} data-krock={text || undefined}
              onClick={() => onTryck(r.mandag)}
              style={{ display: "flex", alignItems: "center", gap: AVSTAND.s, width: "100%", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                background: valdVecka ? FARG.upphojt : "transparent", color: text && !valdVecka ? FARG.text2 : FARG.text, ...TYP.text }}>
              <span style={{ width: AVSTAND.xl, flexShrink: 0, display: "inline-flex" }}>{valdVecka && <Ikon namn="check" farg={FARG.text} />}</span>
              <span style={{ flexShrink: 0, ...(valdVecka ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>{r.etikett}</span>
              <span style={{ flex: 1 }} />
              {text && (
                <span data-krock-etikett style={{ ...TYP.micro, textTransform: "none", letterSpacing: 0, color: FARG.text2, background: FARG.fyllning, borderRadius: RADIE.stapel, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, whiteSpace: "nowrap", maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
              )}
            </button>
          </React.Fragment>
        );
      })}
      <Tertiar onClick={() => setFramat(n => n + 1)} style={{ width: "100%" }}>Senare veckor</Tertiar>
    </div>
  );
}
