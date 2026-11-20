"use client";
// "ATT ÅTGÄRDA" överst i Medarbetare-fliken — det som bara admin-formuläret
// sätter och som gett tyst dataförlust (lib/medarbetarKontroll):
//   * okopplad operatör vars namn matchar en medarbetare (Daniel aug, Martin
//     19–27 sep: 25 timmar utanför lönen) → EN knapp: koppla + bygg dagarna
//   * förare utan maskin → MOM kan inte skapa dagarna
//   * saknad hempunkt → km räknas inte
// Systemet föreslår, admin trycker. Ingen automatisk koppling — ett namn kan
// vara fel, därför står namnet och dagarna i klartext på raden.
import React, { useState } from "react";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import { Sektion, Lista, Rad, Kort, Sekundar, Stod } from "./ui";
import type { MedarbetarKontroller, OkandOperator } from "@/lib/medarbetarKontroll";

const kort = (d: string) => { const [, m, dd] = d.split("-"); return `${+dd}/${+m}`; };

export default function MedarbetareKontroller({
  kontroller, fel, maskiner, onValj,
}: {
  kontroller: MedarbetarKontroller | null;
  fel: string | null;
  maskiner: Record<string, string>;
  onValj: (id: string) => void;
}) {
  if (fel) {
    return (
      <Kort style={{ marginBottom: AVSTAND.sektion }}>
        <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Kontrollerna kunde inte läsas: {fel}. Ladda om fliken.</p>
      </Kort>
    );
  }
  if (!kontroller) return null;
  const { okandaOperatorer, forareUtanMaskin, saknarHempunkt } = kontroller;
  const antal = okandaOperatorer.length + forareUtanMaskin.length + saknarHempunkt.length;
  if (antal === 0) return null;

  const hemText = (o: string) =>
    o === "ingen_adress" ? "saknar hemadress — km räknas inte"
    : o === "osaker" ? "hemadressen hittades bara ungefär — kontrollera punkten"
    : o === "misslyckad" ? "hemadressen hittades inte — kontrollera adressen"
    : "hemadressen väntar på geokodning — sker i natt, eller öppna personen";

  return (
    <>
      <Sektion topp={0} orange>Att åtgärda ({antal})</Sektion>
      <Lista style={{ marginBottom: AVSTAND.sektion }}>
        {okandaOperatorer.map((o, i) => (
          <OperatorRad key={o.operator_id} o={o} maskiner={maskiner} sista={i === antal - 1} />
        ))}
        {forareUtanMaskin.map((f, i) => (
          <Rad key={`m-${f.id}`} sista={okandaOperatorer.length + i === antal - 1} onClick={() => onValj(f.id)} chevron
            rubrik={f.namn} detalj="Saknar maskin. MOM kan inte skapa dagarna och Dag-vyn vet inte vilken maskin. Sätt maskinen på personen." />
        ))}
        {saknarHempunkt.map((h, i) => (
          <Rad key={`h-${h.id}`} sista={okandaOperatorer.length + forareUtanMaskin.length + i === antal - 1} onClick={() => onValj(h.id)} chevron
            rubrik={h.namn} detalj={hemText(h.orsak)} />
        ))}
      </Lista>
    </>
  );
}

export function OperatorRad({ o, maskiner, sista }: { o: OkandOperator; maskiner: Record<string, string>; sista: boolean }) {
  const [läge, setLäge] = useState<{ steg: "vila" | "kopplar" | "bygger" | "klar" | "fel"; text?: string }>({ steg: "vila" });
  const maskin = (o.maskin_id && maskiner[o.maskin_id]) || o.maskin_id || "okänd maskin";
  const period = o.datum.length > 1 ? `${kort(o.datum[0])}–${kort(o.datum[o.datum.length - 1])}` : kort(o.datum[0]);

  const koppla = async () => {
    setLäge({ steg: "kopplar" });
    const r = await fetch("/api/medarbetare/kontroller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operator_id: o.operator_id, medarbetare_id: o.medarbetare.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { setLäge({ steg: "fel", text: j.error || `Kopplingen misslyckades (HTTP ${r.status})` }); return; }
    const datum: string[] = j.datum || [];
    // Bygg dagarna — samma synk som importen kör (/api/mom-import per datum).
    // Bekräftade dagar är heliga där; nya dagar skapas.
    const fel: string[] = [];
    for (let i = 0; i < datum.length; i++) {
      setLäge({ steg: "bygger", text: `Bygger dag ${i + 1} av ${datum.length}…` });
      const s = await fetch("/api/mom-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ datum: datum[i] }) });
      if (!s.ok) fel.push(kort(datum[i]));
    }
    setLäge(fel.length
      ? { steg: "fel", text: `Kopplad. ${datum.length - fel.length} av ${datum.length} dagar byggda — kör /api/mom-import igen för ${fel.join(", ")}.` }
      : { steg: "klar", text: `Kopplad till ${o.medarbetare.namn}. ${datum.length} ${datum.length === 1 ? "dag byggd" : "dagar byggda"}.` });
    // Ingen omladdning här — kvittot ska stå kvar tills fliken laddas om;
    // då är raden borta eftersom operatören är kopplad.
  };

  return (
    <div style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>Operatören "{o.operator_namn}"</div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
        {o.operator_id} loggade in på {maskin} {o.datum.length} {o.datum.length === 1 ? "dag" : "dagar"} ({period}) utan koppling. Tiden når inte lönen.
      </div>
      {läge.steg === "vila" ? (
        <Sekundar onClick={koppla} style={{ marginTop: AVSTAND.m }}>Koppla till {o.medarbetare.namn} och bygg dagarna</Sekundar>
      ) : (
        <Stod farg={läge.steg === "fel" ? FARG.orange : läge.steg === "klar" ? FARG.gron : FARG.text2} style={{ marginTop: AVSTAND.m }}>
          {läge.steg === "kopplar" ? "Kopplar…" : läge.text}
        </Stod>
      )}
    </div>
  );
}
