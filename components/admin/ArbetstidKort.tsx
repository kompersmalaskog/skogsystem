"use client";
// Arbetstid (Admin → Översikt, i arket bakom raden "N förare nära arbetstidsgränsen"): förare som närmar sig eller har passerat en av lagens sex gränser (lib/arbetstidsgranser).
// EN fråga: vem behöver jag titta på? En rad per förare med en mening om den värsta gränsen. Tryck på raden → de sex gränserna
// med mätvärde, stapel och "Varför?" (paragrafen). Gul från 90 % av gränsen, röd över den. Färgen förstärker alltid ett ord
// ("Nära gränsen" / "Över gränsen") och en mening med talet i — den bär aldrig ensam.
import React, { useState } from "react";
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import type { ArbetstidForare, Gransstatus, Niva } from "@/lib/arbetstidsgranser";
import { timmarText } from "@/lib/admin/arsovertidVy";
import { Ikon, Etikett, Lista, Sektion, Stod } from "./ui";

const FARG_PER_NIVA: Record<Niva, string> = { lugn: FARG.text2, gul: FARG.orange, rod: FARG.rod };
const ORD_PER_NIVA: Record<Niva, string | null> = { lugn: null, gul: "Nära gränsen", rod: "Över gränsen" };
/** Vila är ett "minst": under kravet är inte "över gränsen". */
const ordFor = (niva: Niva, g?: Gransstatus): string | null => (niva === "rod" && g?.enhet === "tim vila" ? "Under kravet" : ORD_PER_NIVA[niva]);
/** Företagsledare / delägare: arbetstidslagen gäller inte. Raden är grå, utan nivå, och går inte att fälla ut. */
export const DELAGARE_TEXT = "Delägare – arbetstidslagen gäller inte";
const MARKNING_TEXT: Record<NonNullable<Gransstatus["markning"]>, string> = { räknat: "Räknat", uppskattad: "Uppskattad fördelning", tolkning: "Tolkning" };

/** "262 av 250 tim", "36 tim · minst 36", "—" när underlag saknas. */
export function vardeText(g: Gransstatus): string {
  if (g.varde == null) return "—";
  if (g.enhet === "tim vila") return `${timmarText(g.varde)} tim · minst ${timmarText(g.grans)}`;
  return `${timmarText(g.varde)} av ${timmarText(g.grans)} ${g.enhet}`;
}

function Stapel({ g }: { g: Gransstatus }) {
  if (g.andel == null) return null;
  return (
    <div role="progressbar" aria-label={g.namn} aria-valuemin={0} aria-valuemax={g.grans} aria-valuenow={g.varde ?? 0}
      style={{ marginTop: AVSTAND.s, height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.fyllning, overflow: "hidden" }}>
      <div style={{ width: `${Math.round(g.andel * 1000) / 10}%`, height: "100%", borderRadius: RADIE.stapel, background: FARG_PER_NIVA[g.niva] }} />
    </div>
  );
}

function GransRad({ g, forareId, sista }: { g: Gransstatus; forareId: string; sista: boolean }) {
  const [varfor, setVarfor] = useState(false);
  const ord = ordFor(g.niva, g);
  return (
    <div data-arbetstid-grans={g.id} data-niva={g.niva}
      style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: AVSTAND.m }}>
        <span style={{ ...TYP.text, color: FARG.text }}>{g.namn}</span>
        <span data-arbetstid-tal style={{ ...TYP.text, ...TNUM, color: g.niva === "lugn" ? FARG.text : FARG_PER_NIVA[g.niva], textAlign: "right" }}>{vardeText(g)}</span>
      </div>
      <Stapel g={g} />
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: AVSTAND.s, marginTop: AVSTAND.s }}>
        {ord && <Etikett farg={FARG_PER_NIVA[g.niva]}>{ord}</Etikett>}
        {g.markning && <Etikett>{MARKNING_TEXT[g.markning]}</Etikett>}
      </div>
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2, overflowWrap: "anywhere" }}>{g.mening}</p>
      <button type="button" aria-expanded={varfor} aria-controls={`varfor-${forareId}-${g.id}`} onClick={() => setVarfor(v => !v)}
        style={{ ...KNAPP.tertiar, display: "flex", width: "auto", padding: 0 }}>
        Varför?
      </button>
      {varfor && (
        <p id={`varfor-${forareId}-${g.id}`} data-arbetstid-varfor style={{ margin: 0, ...TYP.meta, color: FARG.text2, overflowWrap: "anywhere" }}>{g.varfor}</p>
      )}
    </div>
  );
}

export default function ArbetstidKort({ forare, varningar, utanRubrik }: { forare: ArbetstidForare[]; varningar: string[]; /** Kortet ligger i ett ark som redan heter Arbetstid. */ utanRubrik?: boolean }) {
  const [oppen, setOppen] = useState<string | null>(null);
  if (forare.length === 0 && varningar.length === 0) return null;

  return (
    <div data-arbetstid-kort>
      {!utanRubrik && <Sektion orange={forare.some(f => f.varsta === "rod" && !f.foretagsledare)}>Arbetstid</Sektion>}
      {forare.length > 0 && (
        <Lista>
          {forare.map((f, i) => {
            if (f.foretagsledare) {
              return (
                <div key={f.medarbetare_id} data-arbetstid-forare={f.medarbetare_id} data-niva="delagare"
                  style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i === forare.length - 1 ? "none" : `1px solid ${FARG.linje}`, minHeight: TRAFFYTA.min, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <span style={{ ...TYP.listtitel, color: FARG.text2, overflowWrap: "anywhere" }}>{f.namn}</span>
                  <span data-arbetstid-delagare style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xs }}>{DELAGARE_TEXT}</span>
                </div>
              );
            }
            const vard = f.granser.filter(g => g.niva === f.varsta);
            const forsta = vard[0];
            const ord = ordFor(f.varsta, forsta);
            const ar = oppen === f.medarbetare_id;
            const sista = i === forare.length - 1;
            return (
              <div key={f.medarbetare_id} data-arbetstid-forare={f.medarbetare_id} data-niva={f.varsta}
                style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
                <button type="button" aria-expanded={ar} onClick={() => setOppen(ar ? null : f.medarbetare_id)}
                  style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min, padding: 0, background: "none", border: "none", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.s, flexWrap: "wrap" }}>
                      <span style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: "anywhere" }}>{f.namn}</span>
                      {ord && <Etikett farg={FARG_PER_NIVA[f.varsta]}>{ord}</Etikett>}
                    </div>
                    <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, overflowWrap: "anywhere" }}>
                      {forsta?.mening}{vard.length > 1 ? ` · ${vard.length - 1} till` : ""}
                    </div>
                  </div>
                  <Ikon namn={ar ? "expand_less" : "expand_more"} farg={FARG.text3} />
                </button>
                {ar && (
                  <div data-arbetstid-detalj style={{ marginTop: AVSTAND.s }}>
                    {f.granser.map((g, k) => <GransRad key={g.id} g={g} forareId={f.medarbetare_id} sista={k === f.granser.length - 1 && f.notiser.length === 0} />)}
                    {f.notiser.map(n => (
                      <p key={n} data-arbetstid-notis style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2, overflowWrap: "anywhere" }}>{n}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Lista>
      )}
      {varningar.map(v => <Stod key={v} farg={FARG.orange} attr={{ "data-arbetstid-varning": "" }}>{v}</Stod>)}
    </div>
  );
}
