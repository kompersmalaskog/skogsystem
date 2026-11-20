"use client";
// De öppna frågorna och besluten från "Att ta med löneansvarig" (lib/lonesystem/attTaMed). De är långa avtalsfrågor
// (paragrafer, tolkningar) och hör inte på Löneunderlagets yta: där står EN rad ("8 öppna frågor"), här läser man dem.
import React from "react";
import { AVSTAND } from "@/lib/design/tokens";
import { Lank, Lista, Rad, Sheet, Stod } from "./ui";
import type { RadAttTaMed } from "@/lib/lonesystem/attTaMed";

export default function OppnaFragorArk({ fragor, onStang }: { fragor: RadAttTaMed[]; onStang: () => void }) {
  return (
    <Sheet titel="Öppna frågor" vyNyckel="oppna-fragor" onStang={onStang} attr={{ "data-oppna-fragor": "" }}
      vanster={<Lank smal onClick={onStang}>Stäng</Lank>}>
      <Stod style={{ marginTop: 0, marginBottom: AVSTAND.l }}>Frågor och beslut som ingen i appen kan se är besvarade.</Stod>
      <Lista>
        {fragor.map((f, i) => (
          <Rad key={f.rubrik} rubrik={f.rubrik} detalj={f.text} hoger={f.slag} sista={i === fragor.length - 1} />
        ))}
      </Lista>
    </Sheet>
  );
}
