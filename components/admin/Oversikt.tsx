"use client";
// Översikt = att-göra-lista. Inga räknare: "N saker kräver dig" i orange, en tryckbar rad (›) per sak som leder dit det
// fixas, och under den "Stämmer" i grått så man ser att resten är kontrollerat. Inget väntande: bara Stämmer.
import React, { useState } from "react";
import { AVSTAND, FARG, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { byggVilobrottArk, loneperiodForDag, manadenGarAttOppna } from "@/lib/admin/vilobrottArkVy";
import type { Sak } from "@/lib/admin/attGora";
import { Sektion, Lista, Rad, Laddar, Ikon } from "./ui";
import VilobrottArk from "./VilobrottArk";
import { useAdminNav } from "./nav";
import type { AttGora } from "./useAttGora";
import ArbetstidKort from "./ArbetstidKort";

export default function Oversikt({ att }: { att: AttGora }) {
  const { nav, gaTill, sattParam } = useAdminNav();
  const [stammerOppen, setStammerOppen] = useState(false);
  if (att.laddar) return <Laddar>Kontrollerar lön, dagar, vilobrott, personer och maskiner …</Laddar>;

  /** Hela raden är en tryckyta med › (iOS-rad, som förarkortet i Lön): ingen knapp bredvid texten. Ett läsfel har sin egen handling, "Försök igen". */
  const oppna = (s: Sak) => {
    const mal = s.mal;
    if (mal.typ === "forsok") att.ladda();
    else if (mal.typ === "sida") window.location.assign(mal.href);
    else if (mal.typ === "vilobrott") sattParam("vila", mal.medarbetare_id);
    else gaTill({ flik: mal.flik, underflik: mal.underflik, params: mal.params });
  };

  // Arket över en persons vilobrott: personen står i adressen (?vila=<id>), så en omladdning landar på samma ställe.
  const vilaId = nav.params.vila;
  const vilaVy = vilaId ? byggVilobrottArk(att.vilobrott, vilaId) : null;
  const idag = ymdLokal(new Date());

  return (
    <>
      {att.saker.length > 0 && (
        <>
          <Sektion orange topp={0}>{att.saker.length} {att.saker.length === 1 ? "sak kräver dig" : "saker kräver dig"}</Sektion>
          <Lista>
            {att.saker.map((s, i) => (
              <Rad key={s.id} attr={{ "data-sak": s.id }} rubrik={s.rubrik} detalj={s.detalj}
                hoger={s.mal.typ === "forsok" ? <span style={{ color: FARG.text2 }}>{s.knapp}</span> : undefined}
                chevron={s.mal.typ !== "forsok"} onClick={() => oppna(s)} sista={i === att.saker.length - 1} />
            ))}
          </Lista>
        </>
      )}

      {vilaVy && (
        <VilobrottArk vy={vilaVy} onStang={() => sattParam("vila", null)}
          hamtaManad={b => manadenGarAttOppna(b.dag, idag)
            ? () => gaTill({ flik: "lon", underflik: "underlag", params: { period: loneperiodForDag(b.dag), forare: vilaVy.medarbetare_id, dag: b.dag } })
            : null} />
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
