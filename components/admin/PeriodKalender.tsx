"use client";
// ─────────────────────────────────────────────────────────────
// Inline kalenderblad för utjämningsperiodens ark (iOS-stil): en månad åt gången med pilar för att bläddra. Tryck en startdag,
// tryck en slutdag. Perioden snäpper till HELA veckor (start måndag, slut söndag), och hela veckorna ligger som ett band i bladet.
// Bladet ligger i flödet: det trycker ner raderna under sig i stället för att lägga sig över dem.
//
// Dagar som redan ligger i en annan period för de valda förarna får en liten prick (periodens namn i data-krock). Det är en upplysning,
// aldrig en spärr. Markeringen bärs av bandet OCH av resultatraden ovanför bladet, inte av färgen ensam.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { arDagIPerioden, krockText, manadRubrik, manadVeckor, mandagForDag, slutFranMandag, type Valt } from "@/lib/admin/utjamningsperiod";
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

export default function PeriodKalender({ valt, manad, onManad, onTryck, krockerIVecka }: {
  valt: Valt;
  manad: ManadVal;
  onManad: (m: ManadVal) => void;
  onTryck: (dag: string) => void;
  /** Perioder som ligger över veckan (måndag) för de valda förarna. */
  krockerIVecka: (mandag: string) => Krock[];
}) {
  const idag = ymdLokal(new Date());
  const rader = manadVeckor(manad.ar, manad.manad0);
  const flytta = (delta: number) => { const d = new Date(manad.ar, manad.manad0 + delta, 1); onManad({ ar: d.getFullYear(), manad0: d.getMonth() }); };
  const slutDag = slutFranMandag(valt.till);

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
              const iPerioden = arDagIPerioden(valt, dag);
              const arStart = dag === valt.fran, arSlut = dag === slutDag;
              const kt = krockText(krockerIVecka(mandagForDag(dag)));
              return (
                <button key={dag} type="button" data-dag={dag} data-veckodag-nr={k} aria-pressed={iPerioden} aria-label={`${Number(dag.slice(8))} ${manadRubrik(manad.ar, manad.manad0)}${kt ? `, ${kt}` : ""}`}
                  data-start={arStart ? "true" : undefined} data-slut={arSlut ? "true" : undefined} data-krock={kt || undefined}
                  onClick={() => onTryck(dag)}
                  style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: TRAFFYTA.min, padding: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: iPerioden ? FARG.upphojt : "transparent", color: FARG.text, ...TYP.text, ...(dag === idag ? { fontWeight: TYP.listtitel.fontWeight } : null) }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xxl + AVSTAND.s, borderRadius: RADIE.cirkel,
                    ...(arStart || arSlut ? { background: FARG.text, color: FARG.bg, fontWeight: TYP.listtitel.fontWeight } : null) }}>{Number(dag.slice(8))}</span>
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
