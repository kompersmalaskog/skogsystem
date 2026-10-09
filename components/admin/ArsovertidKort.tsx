"use client";
// Årsövertid (Admin → Lön → Löneunderlag): EN fråga — hur nära taket (250 tim/år) är varje förare?
// En rad per förare: namn till vänster, "74,5 av 250 tim" till höger, tunn stapel under. Grå normalt, orange över
// (tak − 50), röd över taket; noll visas dämpad. Talen är avtalets modell (Skogsavtalet §5 mom 2), exakt kolumnen
// "Genomsnitt" som kortet visade förut. Allt förklarande ligger bakom länken "Så räknas det".
// Uppbyggnaden är ren (lib/admin/arsovertidVy): samma funktion ger Översiktens rad vid 200 tim.
import React, { useState } from "react";
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TYP } from "@/lib/design/tokens";
import { Kort } from "./ui";
import { arsovertidRader, timmarText, utjamningsRad, type ArsovertidSvar, type Niva } from "@/lib/admin/arsovertidVy";

const FARG_PER_NIVA: Record<Niva, string> = { noll: FARG.text3, lugn: FARG.text2, varning: FARG.orange, over: FARG.rod };

const periodText = (p: any) =>
  `v${p.fran}–${p.till}${p.markerad ? " (markerad)" : " (antagen)"}: ${timmarText(Number(p.timmar))} tim på ${p.veckor} v → ${timmarText(Number(p.overtid))}`;

export default function ArsovertidKort({ svar }: { svar: ArsovertidSvar }) {
  const [oppen, setOppen] = useState(false);
  const rubrik = <p style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.m}px` }}>Årsövertid {svar.ar ?? new Date().getFullYear()}</p>;

  if (!svar.ok) {
    return (
      <Kort style={{ marginBottom: AVSTAND.m }}>
        {rubrik}
        <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte läsa årets övertid: {svar.meddelande || "okänt fel"}</p>
      </Kort>
    );
  }

  const rader = arsovertidRader(svar);
  const utjamning = svar.utjamning || [];
  const perioderPerForare = (svar.medarbetare || []).filter(m => Array.isArray(m.perioder) && m.perioder.length > 0);

  return (
    <Kort style={{ marginBottom: AVSTAND.m }}>
      <div data-arsovertid-kort>
      {rubrik}

      {rader.length === 0 && (
        <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Ingen förare har registrerad arbetstid i år än.</p>
      )}
      {rader.map((r, i) => (
        <div key={r.id} data-arsovertid-rad data-niva={r.niva}
          style={{ padding: `${AVSTAND.m}px 0`, borderTop: i === 0 ? "none" : `1px solid ${FARG.linje}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: AVSTAND.m }}>
            <span style={{ ...TYP.text, color: r.niva === "noll" ? FARG.text2 : FARG.text }}>{r.namn}</span>{" "}
            <span data-arsovertid-tal style={{ ...TYP.text, ...TNUM, color: r.niva === "noll" ? FARG.text3 : r.niva === "lugn" ? FARG.text : FARG_PER_NIVA[r.niva] }}>
              {timmarText(r.timmar)} av {r.tak} tim
            </span>
          </div>
          <div role="progressbar" aria-label={`${r.namn}: övertid mot taket`} aria-valuemin={0} aria-valuemax={r.tak} aria-valuenow={r.timmar}
            style={{ marginTop: AVSTAND.s, height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.fyllning, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(r.andel * 1000) / 10}%`, height: "100%", borderRadius: RADIE.stapel, background: FARG_PER_NIVA[r.niva] }} />
          </div>
        </div>
      ))}

      {/* Markerade utjämningsperioder: en grå rad var. */}
      {utjamning.map((u, i) => (
        <p key={i} style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{utjamningsRad(u)}</p>
      ))}

      {/* Ett fel som påverkar talen är ingen förklaring: det står kvar även när länken är ihopfälld. */}
      {svar.utjamning_fel && (
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>
          Kunde inte läsa utjämningsperioder ({svar.utjamning_fel}) — allt räknas som antagna block.
        </p>
      )}

      <button type="button" aria-expanded={oppen} onClick={() => setOppen(o => !o)}
        style={{ ...KNAPP.tertiar, display: "flex", width: "auto", marginTop: AVSTAND.s, padding: 0 }}>
        Så räknas det
      </button>

      {oppen && (
        <div style={{ ...TYP.meta, color: FARG.text2 }}>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            Skogsavtalet §5 mom 2: ordinarie arbetstid är 40 tim/vecka <em>i genomsnitt över en beräkningsperiod om högst 16 veckor</em>. Perioderna är de markerade utjämningsperioderna ovan; veckorna däremellan räknas i antagna block om högst 16 veckor.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            Avtalet förutsätter att utjämning över mer än en vecka är <strong>överenskommen</strong>. En markerad period är en anteckning om vad som gjordes, inte ett bevis på att det var avtalat. Längre än 16 veckor kräver lokal överenskommelse.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px` }}>
            En tom vecka räknas i basen bara om den är utjämnad ordinarie tid — var den semester ska den inte vara med, och då stiger övertiden; inom en markerad period vet appen vad en tom vecka betyder, utanför vet den det inte. Frånvaro och komp (§8 mom 3, räknas inte som övertid enligt §5 mom 5 anm 3) är inte avdragna, så talen är sannolikt för höga. Räknat t.o.m. {svar.tomDatum}.
          </p>
          {perioderPerForare.map(m => (
            <p key={m.medarbetare_id} style={{ margin: 0 }}>
              <span style={{ color: FARG.text }}>{(m.namn || "").split(" ")[0]}</span>: {m.perioder!.map(periodText).join(" · ")}
            </p>
          ))}
        </div>
      )}
      </div>
    </Kort>
  );
}
