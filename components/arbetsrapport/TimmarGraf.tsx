"use client";

import React, { useState } from "react";
import { TYP, VIKT, AVSTAND, RADIE, FARG, TRAFFYTA, TNUM, overgang } from "@/lib/design/tokens";

/**
 * Min tids staplar — Vecka (7 dagar) och År (12 månader).
 *
 * Grafen ska förklara sig själv, utan legend (Martin: "det måste vara Apple och
 * lätt för hjärnan"):
 *  - Vit stapel = där du är (idag / vald månad). Övriga är samma vita, dämpade.
 *  - Talet står över stapeln, dagen/månaden under. Ingen y-axel.
 *  - En tom dag är ett tunt streck — dagen finns, den var tom.
 *  - Året: talet visas bara över den valda månaden (tryck på en stapel).
 *    Månadens SCHEMA (vardagar utan röda dagar × 8, lib/arbetstid schemaTimmar)
 *    är ett dämpat streck tvärs över kolumnen — inte en snittlinje: varje månad
 *    har sitt eget schema, en linje skulle ljuga om juli och december.
 *
 * Dämpningen är `opacity`, inte en egen rgba-färg: då finns bara FARG.text och
 * FARG.text3 i grafen.
 */

export type GrafDag = { datum: string; etikett: string; h: number; idag: boolean };
export type GrafManad = {
  /** "jan" … "dec" — initialen visas under stapeln, hela namnet när den väljs. */
  namn: string;
  h: number;
  /** Schematimmar för månaden; null = framtida månad (ingen markering). */
  schemaH: number | null;
  /** Framtida månad — ingen stapel, bara initialen dämpad. */
  framtid: boolean;
  aktuell: boolean;
};

const DAMPAD = 0.22;
const STAPEL_H = 120; // grafens höjd i px — ett layoutmått för ytan, inte ett avstånd
const TOM_H = 2;      // tunt streck för en tom dag

const fmt = (h: number) => (Math.round(h * 10) / 10).toLocaleString("sv-SE");

function Segment({ lage, satt }: { lage: "vecka" | "ar"; satt: (l: "vecka" | "ar") => void }) {
  return (
    <div role="tablist" style={{ display: "flex", background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs, marginBottom: AVSTAND.l }}>
      {([["vecka", "Vecka"], ["ar", "År"]] as const).map(([k, l]) => (
        <button
          key={k}
          role="tab"
          aria-selected={lage === k}
          onClick={() => satt(k)}
          style={{
            flex: 1, minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit",
            ...TYP.meta, fontWeight: lage === k ? VIKT.halvfet : VIKT.normal,
            background: lage === k ? FARG.fyllning : "transparent",
            color: lage === k ? FARG.text : FARG.text2,
          }}
        >{l}</button>
      ))}
    </div>
  );
}

/** En kolumn: tal över, stapel, etikett under. Samma form i båda lägena. */
function Kolumn({ h, maxH, markerad, visaTal, etikett, schemaH, tom, onClick, ariaLabel }: {
  h: number; maxH: number; markerad: boolean; visaTal: boolean; etikett: string;
  schemaH?: number | null; tom?: boolean; onClick?: () => void; ariaLabel: string;
}) {
  const hojd = h > 0 ? Math.max(TOM_H * 2, (h / maxH) * STAPEL_H) : TOM_H;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={onClick ? markerad : undefined}
      style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center",
        background: "none", border: "none", padding: 0, margin: 0, fontFamily: "inherit", color: "inherit",
        cursor: onClick ? "pointer" : "default", minHeight: TRAFFYTA.min,
      }}
    >
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text, height: TYP.meta.fontSize * TYP.meta.lineHeight, marginBottom: AVSTAND.xs, whiteSpace: "nowrap", visibility: visaTal && h > 0 ? "visible" : "hidden" }}>
        {fmt(h)}
      </span>
      <div style={{ position: "relative", width: "100%", height: STAPEL_H, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {schemaH != null && schemaH > 0 && (
          <div aria-hidden style={{ position: "absolute", left: "15%", right: "15%", bottom: (Math.min(schemaH, maxH) / maxH) * STAPEL_H, height: TOM_H, background: FARG.text3, borderRadius: RADIE.stapel }} />
        )}
        {!tom && (
          <div style={{
            width: "56%", height: hojd, background: FARG.text,
            opacity: markerad ? 1 : DAMPAD,
            borderRadius: h > 0 ? `${RADIE.stapel}px ${RADIE.stapel}px 0 0` : 0,
            transition: overgang("height", "opacity"),
          }} />
        )}
      </div>
      <span style={{ ...TYP.meta, marginTop: AVSTAND.s, color: markerad ? FARG.text : tom ? FARG.text3 : FARG.text2, fontWeight: markerad ? VIKT.halvfet : VIKT.normal }}>
        {etikett}
      </span>
    </Tag>
  );
}

export default function TimmarGraf({ vecka, ar }: { vecka: GrafDag[]; ar: GrafManad[] }) {
  const [lage, setLage] = useState<"vecka" | "ar">("vecka");
  const aktuellIdx = Math.max(0, ar.findIndex(m => m.aktuell));
  const [valdManad, setValdManad] = useState<number>(aktuellIdx);

  const veckaMax = Math.max(8, ...vecka.map(d => d.h));
  const arMax = Math.max(1, ...ar.map(m => Math.max(m.h, m.schemaH ?? 0)));
  const vald = ar[valdManad];

  return (
    <section style={{ marginBottom: AVSTAND.xl }}>
      <Segment lage={lage} satt={setLage} />
      {lage === "vecka" ? (
        <div style={{ display: "flex", gap: AVSTAND.xs }}>
          {vecka.map(d => (
            <Kolumn key={d.datum} h={d.h} maxH={veckaMax} markerad={d.idag} visaTal etikett={d.etikett}
              ariaLabel={`${d.etikett}: ${d.h > 0 ? `${fmt(d.h)} timmar` : "ingen tid"}`} />
          ))}
        </div>
      ) : (
        <>
          {/* Vald månad i klartext — samma rad-höjd oavsett val, så grafen står still. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: AVSTAND.s, minHeight: TYP.listtitel.fontSize * TYP.listtitel.lineHeight }}>
            <span style={{ ...TYP.listtitel, color: FARG.text, textTransform: "capitalize" }}>{vald?.namn ?? ""}</span>
            <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>
              {vald && !vald.framtid ? `${fmt(vald.h)} tim` : ""}
              {vald?.schemaH ? <span style={{ ...TYP.meta, color: FARG.text2 }}> · schema {fmt(vald.schemaH)}</span> : null}
            </span>
          </div>
          <div style={{ display: "flex", gap: AVSTAND.xs }}>
            {ar.map((m, i) => (
              <Kolumn key={m.namn} h={m.h} maxH={arMax} markerad={i === valdManad} visaTal={false}
                etikett={m.namn.charAt(0).toUpperCase()} schemaH={m.framtid ? null : m.schemaH} tom={m.framtid}
                onClick={m.framtid ? undefined : () => setValdManad(i)}
                ariaLabel={`${m.namn}: ${m.framtid ? "kommande" : `${fmt(m.h)} timmar${m.schemaH ? `, schema ${fmt(m.schemaH)}` : ""}`}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
