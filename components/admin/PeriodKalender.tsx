"use client";
// ─────────────────────────────────────────────────────────────
// Inline kalenderblad för raden Börjar i utjämningsperiodens ark (iOS-stil): en månad åt gången med pilar för att bläddra.
// Ett tryck på valfri dag sätter Börjar till den veckans måndag. Bladet visar HELA perioden som ett band (alla veckor från Börjar
// och Längd veckor framåt), med måndagen i första veckan som cirkel, så man ser vad Längd gör medan man trycker − och +.
// Bladet ligger i flödet: det trycker ner raderna under sig i stället för att lägga sig över dem.
//
// Röda dagar (lib/roda-dagar) har röd siffra, data-roda och en beskrivning i aria-label; dagar som redan ligger i en annan period för
// de valda förarna får en liten prick (periodens namn i data-krock). Det är upplysningar, aldrig spärrar.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { getRödaDagar } from "@/lib/roda-dagar";
import { arDagIPerioden, krockText, manadRubrik, manadVeckor, mandagForDag, slutMandag } from "@/lib/admin/utjamningsperiod";
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

export default function PeriodKalender({ borjar, langd, manad, onManad, onTryck, krockerIVecka }: {
  /** Måndagen i första veckan. */
  borjar: string;
  /** Antal veckor. */
  langd: number;
  manad: ManadVal;
  onManad: (m: ManadVal) => void;
  onTryck: (dag: string) => void;
  /** Perioder som ligger över veckan (måndag) för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
}) {
  const idag = ymdLokal(new Date());
  const rader = manadVeckor(manad.ar, manad.manad0);
  const flytta = (delta: number) => { const d = new Date(manad.ar, manad.manad0 + delta, 1); onManad({ ar: d.getFullYear(), manad0: d.getMonth() }); };
  const period = { fran: borjar, till: slutMandag(borjar, langd) };
  const roda = getRödaDagar(manad.ar);

  return (
    <div data-period-kalender style={{ padding: `${AVSTAND.xs}px ${AVSTAND.xs}px ${AVSTAND.s}px` }}>
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
              const arStart = dag === borjar;
              const kt = krockText(krockerIVecka(mandagForDag(dag)));
              const rod = roda[dag];
              const dagNr = Number(dag.slice(8));
              return (
                <button key={dag} type="button" data-dag={dag} data-veckodag-nr={k} aria-pressed={iPerioden}
                  aria-label={`${dagNr} ${manadRubrik(manad.ar, manad.manad0)}${rod ? `, röd dag (${rod})` : ""}${kt ? `, ${kt}` : ""}`}
                  data-start={arStart ? "true" : undefined} data-roda={rod ? "true" : undefined} data-krock={kt || undefined}
                  onClick={() => onTryck(dag)}
                  style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: TRAFFYTA.min, padding: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: iPerioden ? FARG.upphojt : "transparent", color: rod && !arStart ? FARG.rod : FARG.text, ...TYP.text, ...(dag === idag ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xxl + AVSTAND.s, borderRadius: RADIE.cirkel,
                    ...(arStart ? { background: FARG.text, color: FARG.bg, fontWeight: TYP.listtitel.fontWeight } : null) }}>{dagNr}</span>
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
