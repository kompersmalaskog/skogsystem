"use client";
// Årsövertid (Admin → Lön → Löneunderlag): EN fråga — hur nära taket (250 tim/år) är varje förare?
// En rad per förare: namn till vänster, "74,5 av 250 tim" till höger, tunn stapel under. Grå normalt, orange över
// (tak − 50), röd över taket; noll visas dämpad. Alla förare har en rad. Talen är månadsregeln (samma som lönen, sedan 2026-10-19; utjämningsmånader som
// avtalets genomsnitt, Skogsavtalet §5 mom 2). Allt förklarande ligger bakom länken "Så räknas det".
// Uppbyggnaden är ren (lib/admin/arsovertidVy): samma funktion ger Översiktens rad vid 200 tim.
import React, { useState } from "react";
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TYP } from "@/lib/design/tokens";
import { Kort } from "./ui";
import { arsovertidRader, manadRad, overlapparManad, timmarText, unikaUtjamningar, utjamningsRad, type ArsovertidSvar, type Niva } from "@/lib/admin/arsovertidVy";

const FARG_PER_NIVA: Record<Niva, string> = { noll: FARG.text3, lugn: FARG.text2, varning: FARG.orange, over: FARG.rod };

export default function ArsovertidKort({ svar, manad }: { svar: ArsovertidSvar; /** Arbetsmånaden som visas (YYYY-MM): utjämningsraden visas bara när perioden berör den. */ manad?: string }) {
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

  // Alla förare, störst först (noll dämpad). En gräns som gömde dem under halvvägs svarade inte på frågan "hur nära taket är var och en?".
  const rader = arsovertidRader(svar);
  const utjamning = unikaUtjamningar(svar.utjamning).filter(u => !manad || overlapparManad(u, manad));
  const manaderPerForare = (svar.medarbetare || []).filter(m => m.foretagsledare !== true).map(m => ({ m, rad: manadRad(m.per_manad) })).filter(x => x.rad);

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

      {/* Läsfel på frånvaron = talen är för LÅGA (basen drogs inte: en semestervecka räknas som 40 tim i basen, så övertiden blir lägre). Aldrig "ingen frånvaro". */}
      {svar.franvaro_fel && (
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>
          Kunde inte läsa frånvaron ({svar.franvaro_fel}) — basen drogs inte för frånvaro, så talen är för låga.
        </p>
      )}

      <button type="button" aria-expanded={oppen} onClick={() => setOppen(o => !o)}
        style={{ ...KNAPP.tertiar, display: "flex", width: "auto", marginTop: AVSTAND.s, padding: 0 }}>
        Så räknas det
      </button>

      {oppen && (
        <div style={{ ...TYP.meta, color: FARG.text2 }}>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            Övertid räknas per kalendermånad, med samma regel som lönen: först när månadens ordinarie timmar är fyllda. Årets tal är summan av månaderna.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            Månadens ordinarie är vardagarna × 8 tim, minus röda vardagar, frånvaro (semester, sjuk, VAB, föräldraledig, ATK, komp, tjänstledig, permission) och dagar före anställning. Övertiden är arbetad tid över ordinarie, aldrig negativ.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            Den pågående månaden visar ställningen t.o.m. igår: arbetad tid minus ordinarie för vardagarna fram till igår. Dagens timmar, både arbetade och ordinarie, tas med först nästa dag — talet rör sig alltså inte under dagen.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            En månad som överlappar en markerad utjämningsperiod (ovan) räknas som avtalet säger, Skogsavtalet §5 mom 2: ordinarie arbetstid är 40 tim/vecka <em>i genomsnitt över en beräkningsperiod om högst 16 veckor</em>. Veckorna däremellan räknas i antagna block om högst 16 veckor.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px`, color: FARG.text }}>
            Avtalet förutsätter att utjämning över mer än en vecka är <strong>överenskommen</strong>. En markerad period är en anteckning om vad som gjordes, inte ett bevis på att det var avtalat. Längre än 16 veckor kräver lokal överenskommelse.
          </p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px` }}>
            Komp (§8 mom 3) räknas inte som övertid enligt §5 mom 5 anm 3. Räknat t.o.m. {svar.tomDatum}.
          </p>
          {manaderPerForare.map(({ m, rad }) => (
            <p key={m.medarbetare_id} style={{ margin: `0 0 ${AVSTAND.s}px` }}>
              <span style={{ color: FARG.text }}>{(m.namn || "").split(" ")[0]}</span>: {rad}
            </p>
          ))}
        </div>
      )}
      </div>
    </Kort>
  );
}
