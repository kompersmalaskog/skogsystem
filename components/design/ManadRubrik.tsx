// "Augusti · lön i september": arbetsmånaden är namnet, vilken månad lönen kommer står bredvid i dämpad text. EN komponent för
// Löneunderlag, Dagar, Min månad och exportdialogen (lib/lonesystem/lonemanad) — så månaden aldrig skrivs på fyra olika sätt.
// `lon={false}` för kvartal och år: det är inte en månads lön. Versal sätts i texten (textTransform: capitalize gjorde "Lön I September").
import React from "react";
import { FARG, VIKT } from "@/lib/design/tokens";
import { manadNamn, utbetalningText } from "@/lib/lonesystem/lonemanad";

export default function ManadRubrik({ arbetsManad, lon = true }: { arbetsManad: string; lon?: boolean }) {
  return (
    <>
      <span data-arbetsmanad="">{manadNamn(arbetsManad)}</span>
      {lon && (
        <span style={{ color: FARG.text2, fontWeight: VIKT.normal }}>
          <span aria-hidden="true"> · </span><span data-utbetalning="">{utbetalningText(arbetsManad)}</span>
        </span>
      )}
    </>
  );
}
