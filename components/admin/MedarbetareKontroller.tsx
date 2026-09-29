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
import { C, secHead, Card, ChevronRight } from "./design";
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
      <Card style={{ border: `1px solid ${C.orange}`, marginBottom: 22 }}>
        <p style={{ margin: 0, color: C.orange, fontSize: 14 }}>Kontrollerna kunde inte läsas: {fel}. Ladda om fliken.</p>
      </Card>
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
      <p style={secHead}>Att åtgärda ({antal})</p>
      <Card style={{ padding: 0, marginBottom: 22 }}>
        {okandaOperatorer.map((o, i) => (
          <OperatorRad key={o.operator_id} o={o} maskiner={maskiner} sista={i === antal - 1} />
        ))}
        {forareUtanMaskin.map((f, i) => (
          <Rad key={`m-${f.id}`} sista={okandaOperatorer.length + i === antal - 1} onClick={() => onValj(f.id)}
            text={<><strong>{f.namn}</strong> saknar maskin — MOM kan inte skapa dagarna och Dag-vyn vet inte vilken maskin. Sätt maskinen på personen.</>} />
        ))}
        {saknarHempunkt.map((h, i) => (
          <Rad key={`h-${h.id}`} sista={okandaOperatorer.length + forareUtanMaskin.length + i === antal - 1} onClick={() => onValj(h.id)}
            text={<><strong>{h.namn}</strong> {hemText(h.orsak)}</>} />
        ))}
      </Card>
    </>
  );
}

function Rad({ text, onClick, sista }: { text: React.ReactNode; onClick: () => void; sista: boolean }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", minHeight: 44, borderBottom: sista ? "none" : `1px solid ${C.line}`, cursor: "pointer" }}>
      <span style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>{text}</span>
      <ChevronRight />
    </div>
  );
}

function OperatorRad({ o, maskiner, sista }: { o: OkandOperator; maskiner: Record<string, string>; sista: boolean }) {
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
    <div style={{ padding: "14px 20px", borderBottom: sista ? "none" : `1px solid ${C.line}` }}>
      <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.4 }}>
        Operatören <strong>"{o.operator_namn}"</strong> ({o.operator_id}) loggade in på {maskin} {o.datum.length} {o.datum.length === 1 ? "dag" : "dagar"} ({period}) utan koppling — tiden når inte lönen.
      </p>
      {läge.steg === "vila" ? (
        <button onClick={koppla} style={{ marginTop: 10, minHeight: 44, width: "100%", background: "rgba(255,255,255,0.10)", border: "none", borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Koppla till {o.medarbetare.namn} och bygg dagarna
        </button>
      ) : (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: läge.steg === "fel" ? C.orange : läge.steg === "klar" ? C.green : C.label }}>
          {läge.steg === "kopplar" ? "Kopplar…" : läge.text}
        </p>
      )}
    </div>
  );
}
