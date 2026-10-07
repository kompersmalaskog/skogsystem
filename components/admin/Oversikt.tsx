"use client";
// Översikt = att-göra-lista. Inga räknare: "N saker kräver dig" i orange, en rad per sak med en knapp dit det
// fixas, och under den "Stämmer" i grått så man ser att resten är kontrollerat. Inget väntande: bara Stämmer.
import React from "react";
import { AVSTAND, FARG, KNAPP, TYP } from "@/lib/design/tokens";
import type { Sak } from "@/lib/admin/attGora";
import { Sektion, Lista, Rad, Laddar, Ikon } from "./ui";
import { useAdminNav } from "./nav";
import type { AttGora } from "./useAttGora";

export default function Oversikt({ att }: { att: AttGora }) {
  const { gaTill } = useAdminNav();
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
              <div key={s.id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i === att.saker.length - 1 ? "none" : `1px solid ${FARG.linje}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: AVSTAND.m }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: "anywhere" }}>{s.rubrik}</div>
                  {s.detalj && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, overflowWrap: "anywhere" }}>{s.detalj}</div>}
                </div>
                {knapp(s)}
              </div>
            ))}
          </Lista>
        </>
      )}

      {att.stammer.length > 0 && (
        <>
          <Sektion topp={att.saker.length > 0 ? AVSTAND.sektion : 0}>Stämmer</Sektion>
          <Lista>
            {att.stammer.map((r, i) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, padding: `${AVSTAND.m}px 0`, borderBottom: i === att.stammer.length - 1 ? "none" : `1px solid ${FARG.linje}` }}>
                <Ikon namn="check" farg={FARG.text3} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TYP.text, color: FARG.text2 }}>{r.rubrik}</div>
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
