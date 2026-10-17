"use client";
// Översikt = att-göra-lista. Inga räknare: "N saker kräver dig" i orange, en rad per sak med en knapp dit det
// fixas, och under den "Stämmer" i grått så man ser att resten är kontrollerat. Inget väntande: bara Stämmer.
import React, { useState } from "react";
import { AVSTAND, FARG, KNAPP, TRAFFYTA, TYP } from "@/lib/design/tokens";
import type { Sak } from "@/lib/admin/attGora";
import { Sektion, Lista, Laddar, Ikon } from "./ui";
import { useAdminNav } from "./nav";
import type { AttGora } from "./useAttGora";
import ArbetstidKort from "./ArbetstidKort";

export default function Oversikt({ att }: { att: AttGora }) {
  const { gaTill } = useAdminNav();
  const [stammerOppen, setStammerOppen] = useState(false);
  if (att.laddar) return <Laddar>Kontrollerar lön, dagar, vilobrott, personer och maskiner …</Laddar>;

  const knapp = (s: Sak) => {
    const stil = { ...KNAPP.sekundar, width: "auto", flexShrink: 0, textDecoration: "none", whiteSpace: "nowrap" as const };
    if (s.mal.typ === "sida") return <a href={s.mal.href} style={stil}>{s.knapp}</a>;
    const mal = s.mal;
    return (
      <button type="button" style={stil} onClick={() => {
        if (mal.typ === "forsok") att.ladda();
        else if (mal.typ === "flik") gaTill({ flik: mal.flik, underflik: mal.underflik, params: mal.params });
      }}>{s.knapp}</button>
    );
  };

  return (
    <>
      {att.saker.length > 0 && (
        <>
          <Sektion orange topp={0}>{att.saker.length} {att.saker.length === 1 ? "sak kräver dig" : "saker kräver dig"}</Sektion>
          <Lista>
            {att.saker.map((s, i) => (
              <div key={s.id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i === att.saker.length - 1 ? "none" : `1px solid ${FARG.linje}`, display: "flex", alignItems: "center", gap: AVSTAND.m }}>
                {/* Knappen sitter alltid bredvid texten, med samma ord (Öppna): raden säger vad det gäller. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: "anywhere" }}>{s.rubrik}</div>
                  {s.detalj && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, overflowWrap: "anywhere" }}>{s.detalj}</div>}
                </div>
                {knapp(s)}
              </div>
            ))}
          </Lista>
        </>
      )}

      <ArbetstidKort forare={att.arbetstid} varningar={att.arbetstidVarningar} />

      {/* Det som stämmer är EN rad: "Allt annat stämmer" (tryck för att se vad som kontrollerats). */}
      {att.stammer.length > 0 && (
        <>
          <div style={{ height: att.saker.length > 0 || att.arbetstid.length > 0 ? AVSTAND.sektion : 0 }} />
          <Lista>
            <button type="button" aria-expanded={stammerOppen} onClick={() => setStammerOppen(o => !o)} data-stammer=""
              style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, background: "none", border: "none", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
              <Ikon namn="check" farg={FARG.text3} />
              <span style={{ flex: 1, ...TYP.text, color: FARG.text2 }}>{att.saker.length > 0 || att.arbetstid.length > 0 ? "Allt annat stämmer" : "Allt stämmer"}</span>
              <Ikon namn={stammerOppen ? "expand_less" : "expand_more"} farg={FARG.text3} />
            </button>
            {stammerOppen && att.stammer.map((r, i) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, padding: `${AVSTAND.s}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
                <Ikon namn="check" farg={FARG.text3} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TYP.meta, color: FARG.text2 }}>{r.rubrik}</div>
                  {r.detalj && <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xs }}>{r.detalj}</div>}
                </div>
              </div>
            ))}
          </Lista>
        </>
      )}
    </>
  );
}
