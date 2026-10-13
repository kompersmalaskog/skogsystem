"use client";
// ─────────────────────────────────────────────────────────────
// Kompakt månadskalender under raden Börjar eller Slutar i utjämningsperiodens ark (iOS Kalender-stil): en månad med ‹ › för att byta månad.
// Ägaren (PeriodArk) bestämmer vilken månad som visas och öppnar den alltid på radens eget datum; bara en kalender är öppen åt gången.
// Ett tryck på en dag sätter bara den radens värde (Börjar snäpper till måndag, Slutar till söndag — det gör ägaren).
//
// Bladet visar HELA perioden som ett band (första veckans måndag till sista veckans söndag), också över månadsskiftena när man bläddrar.
// Dagen raden gäller är en cirkel: måndagen i första veckan i Börjar-bladet, söndagen i sista veckan i Slutar-bladet.
// Röda dagar (lib/roda-dagar) har röd siffra, data-roda och en beskrivning i aria-label; dagar som redan ligger i en annan period för
// de valda förarna får en liten prick (periodens namn i data-krock). Det är upplysningar, aldrig spärrar.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { getRödaDagar } from "@/lib/roda-dagar";
import { arDagIPerioden, flyttaManad, krockText, manadRubrik, manadVeckor, mandagForDag, slutFranMandag } from "@/lib/admin/utjamningsperiod";
import { Ikon } from "./ui";

type Krock = { namn?: string | null; anteckning?: string | null; startdatum?: string; slutdatum?: string };
export type ManadVal = { ar: number; manad0: number };

const VECKODAGAR = ["M", "T", "O", "T", "F", "L", "S"];
const KOLUMNER = { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" } as const;

function Pil({ riktning, onClick }: { riktning: "bakat" | "framat"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={riktning === "bakat" ? "Föregående månad" : "Nästa månad"}
      style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <Ikon namn={riktning === "bakat" ? "chevron_left" : "chevron_right"} farg={FARG.bla} />
    </button>
  );
}

export default function PeriodKalender({ borjar, sista, markera, manad, onManad, onTryck, krockerIVecka }: {
  /** Måndagen i första veckan. */
  borjar: string;
  /** Måndagen i sista veckan. */
  sista: string;
  /** Vilken rad bladet hör till: bestämmer vilken dag som är cirkeln. */
  markera: "borjar" | "slutar";
  manad: ManadVal;
  /** Får en uppdaterare (som setState): två snabba tryck räknas båda, ur det senaste värdet. */
  onManad: (uppdatera: (m: ManadVal) => ManadVal) => void;
  onTryck: (dag: string) => void;
  /** Perioder som ligger över veckan (måndag) för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
}) {
  const idag = ymdLokal(new Date());
  const rader = manadVeckor(manad.ar, manad.manad0);
  const flytta = (delta: number) => onManad(m => flyttaManad(m.ar, m.manad0, delta));
  const period = { fran: borjar, till: sista };
  const sistaDag = slutFranMandag(sista);
  const cirkel = markera === "borjar" ? borjar : sistaDag;
  const roda = getRödaDagar(manad.ar);

  return (
    <div data-period-kalender={markera} style={{ padding: `${AVSTAND.xs}px ${AVSTAND.xs}px ${AVSTAND.s}px` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Pil riktning="bakat" onClick={() => flytta(-1)} />
        <span data-manad-rubrik style={{ ...TYP.listtitel, color: FARG.text }}>{manadRubrik(manad.ar, manad.manad0)}</span>
        <Pil riktning="framat" onClick={() => flytta(1)} />
      </div>
      <div data-manad-nu={`${manad.ar}-${String(manad.manad0 + 1).padStart(2, "0")}`}>
        <div style={KOLUMNER}>
          {VECKODAGAR.map((v, i) => <span key={i} data-veckodag style={{ ...TYP.micro, color: FARG.text3, textAlign: "center", padding: `${AVSTAND.xs}px 0` }}>{v}</span>)}
        </div>
        {rader.map((rad, r) => (
          <div key={r} style={KOLUMNER}>
            {rad.map((dag, k) => {
              if (!dag) return <span key={k} />;
              const iPerioden = arDagIPerioden(period, dag);
              const arCirkel = dag === cirkel;
              const kt = krockText(krockerIVecka(mandagForDag(dag)));
              const rod = roda[dag];
              const dagNr = Number(dag.slice(8));
              return (
                <button key={dag} type="button" data-dag={dag} data-veckodag-nr={k} aria-pressed={iPerioden}
                  aria-label={`${dagNr} ${manadRubrik(manad.ar, manad.manad0)}${rod ? `, röd dag (${rod})` : ""}${kt ? `, ${kt}` : ""}`}
                  data-start={dag === borjar ? "true" : undefined} data-slut={dag === sistaDag ? "true" : undefined}
                  data-roda={rod ? "true" : undefined} data-krock={kt || undefined}
                  onClick={() => onTryck(dag)}
                  style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: TRAFFYTA.min, padding: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: iPerioden ? FARG.upphojt : "transparent", color: rod && !arCirkel ? FARG.rod : FARG.text, ...TYP.text, ...(dag === idag ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xxl + AVSTAND.s, borderRadius: RADIE.cirkel,
                    ...(arCirkel ? { background: FARG.text, color: FARG.bg, fontWeight: TYP.listtitel.fontWeight } : null) }}>{dagNr}</span>
                  {kt && <span data-krock-prick style={{ position: "absolute", bottom: AVSTAND.xs, width: AVSTAND.xs, height: AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.text3 }} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
