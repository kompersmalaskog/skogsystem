"use client";
// Ett vilobrott i Lön › Vilobrott: förarens svar och admins egen "hanterat"-markering.
//
// Admin svarar ALDRIG åt föraren (det gör föraren i sin Arbetsrapport). Admin markerar att brottet är hanterat och skriver vad som
// gjordes — t.ex. kompensationsledighet. Vem och när sätts av databasen (lib/admin/vilobrottHanterat).
import React, { useState } from "react";
import { AVSTAND, FARG, TNUM } from "@/lib/design/tokens";
import type { VilobrottRad } from "@/lib/admin/vilobrottLista";
import { angraHanterat, anteckningGiltig, ANTECKNING_MAX, hanteratText, markeraHanterat } from "@/lib/admin/vilobrottHanterat";
import { vilaH } from "@/lib/admin/vilobrottArkVy";
import { dagText } from "@/lib/admin/loneunderlagVy";
import { Besked, Falt, Lank, Lista, Primar, Rad, Sektion, Sheet, Stod, Tertiar } from "./ui";

export default function VilobrottHanteratArk({ brott, onStang, onAndrat }: {
  brott: VilobrottRad;
  onStang: () => void;
  /** Efter en sparning eller ångring: listan läses om. */
  onAndrat: () => void;
}) {
  const [text, setText] = useState("");
  const [upptagen, setUpptagen] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const typ = brott.typ === "dygnsvila" ? "Dygnsvila" : "Veckovila";
  const nar = brott.typ === "dygnsvila" ? dagText(brott.datum) : `v.${brott.vecka}`;

  const kor = async (fn: () => Promise<void>) => {
    setUpptagen(true); setFel(null);
    try { await fn(); onAndrat(); }
    catch (e: any) { setFel(e?.message || String(e)); }
    finally { setUpptagen(false); }
  };

  return (
    <Sheet titel={`${typ} · ${nar}`} onStang={onStang} vanster={<Lank smal onClick={onStang}>Stäng</Lank>}
      attr={{ "data-vilobrott-hanterat-ark": `${brott.typ}-${brott.datum}` }}>
      <Lista>
        <Rad rubrik={brott.namn} hoger={<span style={{ ...TNUM, color: FARG.orange }}>{vilaH(brott.vila_h)} av {vilaH(brott.krav_h)}</span>}
          detalj={brott.beskrivning} sista />
      </Lista>

      <Sektion>Förarens svar</Sektion>
      <Lista>
        <Rad attr={{ "data-vila-svar": "" }} rubrik={brott.svar ?? "Obesvarat"} rubrikFarg={brott.svar ? FARG.text : FARG.orange}
          detalj={brott.svar ? undefined : "Föraren svarar i sin Arbetsrapport."} sista />
      </Lista>

      <Sektion>Hanterat</Sektion>
      {brott.hanterat ? (
        <>
          <Lista>
            <Rad attr={{ "data-hanterat": "" }} rubrik={brott.hanterat.anteckning ?? "Ingen anteckning"} detalj={hanteratText(brott.hanterat)} sista />
          </Lista>
          <Tertiar smal disabled={upptagen} onClick={() => kor(() => angraHanterat(brott))} style={{ marginTop: AVSTAND.m, padding: 0 }}>
            Ta bort markeringen
          </Tertiar>
        </>
      ) : (
        <>
          <Falt label="Vad gjordes?" value={text} onChange={setText} maxLength={ANTECKNING_MAX}
            placeholder="Kompensationsledighet 3 h 14 okt" id="vilobrott-hanterat-text" />
          <Primar disabled={upptagen || !anteckningGiltig(text)} onClick={() => kor(() => markeraHanterat(brott, text))}>
            {upptagen ? "Sparar…" : "Markera som hanterat"}
          </Primar>
          <Stod>Föraren svarar själv på varför vilan bröts. Det här är ditt eget kvitto.</Stod>
        </>
      )}
      {fel && <div style={{ marginTop: AVSTAND.m }}><Besked>{fel}</Besked></div>}
    </Sheet>
  );
}
