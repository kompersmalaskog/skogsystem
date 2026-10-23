"use client";
// Översikt = en ren att göra-lista (Martin 2026-10-21). Bara det admin ska göra: en rad per sak, rubrik + högst en kort undertext, och
// hela raden är en knapp med › när den leder vidare. Namn, dagar och gränser ligger bakom trycket. Inget som "stämmer" visas — är listan
// tom står det "Inget att göra". En läsning som föll är en egen rad med "Försök igen" (blå, en handling — inte en rad som leder vidare).
import React from "react";
import { AVSTAND, FARG, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import { byggVilobrottArk, loneperiodForDag, manadenGarAttOppna, vilobrottPerPerson } from "@/lib/admin/vilobrottArkVy";
import { antalKraver, type Sak } from "@/lib/admin/attGora";
import { Sektion, Lista, Rad, Laddar, Ikon, Lank, Sheet } from "./ui";
import VilobrottArk, { VilobrottLista } from "./VilobrottArk";
import { useAdminNav } from "./nav";
import type { AttGora } from "./useAttGora";
import ArbetstidKort from "./ArbetstidKort";

export default function Oversikt({ att }: { att: AttGora }) {
  const { nav, gaTill, sattParam } = useAdminNav();
  if (att.laddar) return <Laddar>Kontrollerar lön, vilobrott, arbetstid, personer och maskiner …</Laddar>;

  const oppna = (s: Sak) => {
    const mal = s.mal;
    if (mal.typ === "forsok") att.ladda();
    else if (mal.typ === "sida") window.location.assign(mal.href);
    else if (mal.typ === "vilobrott") sattParam("vila", mal.medarbetare_id ?? "alla");
    else if (mal.typ === "arbetstid") sattParam("arbetstid", "1");
    else gaTill({ flik: mal.flik, underflik: mal.underflik, params: mal.params });
  };

  // Vilobrotten: listan över personer (?vila=alla) och en persons dagar (?vila=<id>) står i adressen, så en omladdning landar på samma ställe.
  const vilaId = nav.params.vila;
  const personer = vilobrottPerPerson(att.vilobrott);
  const personVy = vilaId && vilaId !== "alla" ? byggVilobrottArk(att.vilobrott, vilaId) : null;
  const idag = ymdLokal(new Date());
  const arbetstidOppen = nav.params.arbetstid === "1";
  const kraver = antalKraver(att.saker);

  return (
    <>
      {att.saker.length === 0 ? (
        <Lista>
          <div data-inget-att-gora="" style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0` }}>
            <Ikon namn="check" farg={FARG.gron} />
            <span style={{ ...TYP.listtitel, color: FARG.text }}>Inget att göra</span>
          </div>
        </Lista>
      ) : (
        <>
          {kraver > 0
            ? <Sektion orange topp={0}>{kraver} {kraver === 1 ? "sak kräver dig" : "saker kräver dig"}</Sektion>
            : <Sektion topp={0}>Att titta på</Sektion>}
          <Lista>
            {att.saker.map((s, i) => s.mal.typ === "forsok" ? (
              // Ett läsfel leder ingenstans: raden är ingen knapp, bara "Försök igen" är det.
              <Rad key={s.id} attr={{ "data-sak": s.id }} rubrik={s.rubrik} detalj={s.detalj}
                hoger={<Lank smal onClick={() => oppna(s)}>{s.knapp}</Lank>} sista={i === att.saker.length - 1} />
            ) : (
              <Rad key={s.id} attr={{ "data-sak": s.id }} rubrik={s.rubrik} detalj={s.detalj}
                chevron onClick={() => oppna(s)} sista={i === att.saker.length - 1} />
            ))}
          </Lista>
        </>
      )}

      {vilaId === "alla" && personer.length > 0 && (
        <VilobrottLista personer={personer} onPerson={id => sattParam("vila", id)} onStang={() => sattParam("vila", null)} />
      )}
      {personVy && (
        <VilobrottArk vy={personVy} onStang={() => sattParam("vila", null)}
          tillbaka={personer.length > 1 ? () => sattParam("vila", "alla") : undefined}
          hamtaManad={b => manadenGarAttOppna(b.dag, idag)
            ? () => gaTill({ flik: "lon", underflik: "underlag", params: { period: loneperiodForDag(b.dag), forare: personVy.medarbetare_id, dag: b.dag } })
            : null} />
      )}

      {arbetstidOppen && (att.arbetstid.length > 0 || att.arbetstidVarningar.length > 0) && (
        <Sheet titel="Arbetstid" onStang={() => sattParam("arbetstid", null)} vanster={<Lank smal onClick={() => sattParam("arbetstid", null)}>Stäng</Lank>}
          attr={{ "data-arbetstid-ark": "" }}>
          <ArbetstidKort forare={att.arbetstid} varningar={att.arbetstidVarningar} utanRubrik />
        </Sheet>
      )}
    </>
  );
}
