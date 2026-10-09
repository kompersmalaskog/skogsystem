"use client";
// "Inget objekt här — Starta jobb?" — maskindatorn står där inget objekt finns (ingen traktgräns, ingen punkt inom 300 m, inget tilldelat, inget
// senast valt). Kortet frågar om ett jobb ska startas: namn (förslag: närmaste ortnamn), typ, och Starta. Svarar ingen loggas spåret ändå (objekt_id NULL
// på maskinen) — det är sidan som äger det skyddsnätet, inte kortet.
//
// Kortet skapar inget själv: det ger valet till föräldern (onStarta) som skriver raden (lib/startaJobb.skapaJobb) och visar felet här (`fel`).
import React, { useEffect, useState } from "react";
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TRAFFYTA, TYP, medSafeBotten } from "@/lib/design/tokens";
import { JOBBTYPER, type JobbTyp } from "@/lib/startaJobb";

export interface IngetObjektVal { namn: string; typ: JobbTyp; privat: boolean; horTillObjektId: string | null }

export default function IngetObjektKort({ lat, lng, roll, sparar, fel, horTillForslag, onStarta, onLista }: {
  lat: number;
  lng: number;
  roll: "skordare" | "skotare";
  sparar: boolean;
  fel: string | null;
  /** Närmaste virkesobjekt (för GROT "hör till") — null om inget ligger nära. */
  horTillForslag: { id: string; namn: string; avstandText: string } | null;
  onStarta: (v: IngetObjektVal) => void;
  onLista: () => void;
}) {
  const [namn, setNamn] = useState("");
  const [namnRort, setNamnRort] = useState(false);
  const [typ, setTyp] = useState<JobbTyp>("slutavverkning");
  const [privat, setPrivat] = useState(false);
  const [horTill, setHorTill] = useState(false);
  const [forslag, setForslag] = useState<string | null>(null);

  // Närmaste ortnamn → förslag på namn. Fylls i fältet om föraren inte hunnit skriva något.
  useEffect(() => {
    let avbruten = false;
    (async () => {
      try {
        const r = await fetch(`/api/plats?lat=${lat}&lng=${lng}`);
        const j = await r.json().catch(() => null);
        if (avbruten || !r.ok || !j?.ok || !j.ort?.namn) return;
        setForslag(String(j.ort.namn));
        setNamn((nu) => (nu.trim() ? nu : String(j.ort.namn)));
      } catch { /* ett saknat förslag är inget fel — föraren skriver namnet */ }
    })();
    return () => { avbruten = true; };
  }, [lat, lng]);

  const kanStarta = namn.trim().length > 0 && !sparar;
  const valknapp = (aktiv: boolean): React.CSSProperties => ({ ...KNAPP.sekundar, ...(aktiv ? { background: FARG.text, color: FARG.bg } : null) });

  return (
    <div role="dialog" aria-modal="true" aria-label="Inget objekt här" data-testid="inget-objekt-kort"
      style={{ position: "fixed", inset: 0, zIndex: 360, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: `0 ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}`, fontFamily: "inherit" }}>
      <div style={{ width: "100%", maxWidth: 440, maxHeight: "92vh", overflowY: "auto", background: FARG.kort, borderRadius: RADIE.sheet, padding: AVSTAND.xl, color: FARG.text }}>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>Inget objekt ligger här</div>
        <div style={{ ...TYP.rubrik, marginTop: AVSTAND.xs }}>Starta jobb?</div>

        <input value={namn} onChange={(e) => { setNamn(e.target.value); setNamnRort(true); }} placeholder="Namn på jobbet" aria-label="Namn på jobbet" data-testid="inget-objekt-namn"
          style={{ width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, marginTop: AVSTAND.l, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.rad, border: "none", background: FARG.upphojt, color: FARG.text, outline: "none", fontFamily: "inherit", ...TYP.text }} />
        {forslag && !namnRort && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Förslag: närmaste ort ({forslag})</div>}

        <div role="radiogroup" aria-label="Typ" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
          {JOBBTYPER.map((t) => (
            <button key={t.typ} type="button" role="radio" aria-checked={typ === t.typ} data-testid={`inget-objekt-typ-${t.typ}`} onClick={() => { setTyp(t.typ); if (t.typ !== "grot") setHorTill(false); }} style={valknapp(typ === t.typ)}>{t.label}</button>
          ))}
        </div>

        {typ === "grot" && horTillForslag && (
          <button type="button" role="switch" aria-checked={horTill} data-testid="inget-objekt-hortill" onClick={() => setHorTill((v) => !v)}
            style={{ ...valknapp(horTill), marginTop: AVSTAND.s, justifyContent: "space-between", textAlign: "left" }}>
            <span>Hör till {horTillForslag.namn}</span><span style={{ ...TYP.meta, opacity: 0.7 }}>{horTillForslag.avstandText}</span>
          </button>
        )}

        <button type="button" role="switch" aria-checked={privat} data-testid="inget-objekt-privat" onClick={() => setPrivat((v) => !v)}
          style={{ ...KNAPP.tertiar, marginTop: AVSTAND.s, color: FARG.text }}>
          {privat ? "Privat jobb — inget Vida-objekt kommer" : "Väntar på Vida (tryck om jobbet är privat)"}
        </button>

        {fel && <div role="alert" style={{ ...TYP.meta, color: FARG.rod, marginTop: AVSTAND.m }}>{fel}</div>}

        <div style={{ marginTop: AVSTAND.l, ...(kanStarta ? null : INAKTIV) }}>
          <button type="button" data-testid="inget-objekt-starta" onClick={() => onStarta({ namn: namn.trim(), typ, privat, horTillObjektId: typ === "grot" && horTill && horTillForslag ? horTillForslag.id : null })} style={KNAPP.primar}>
            {sparar ? "Startar …" : roll === "skordare" ? "Starta och börja avverka" : "Starta och börja köra"}
          </button>
        </div>
        <div style={sparar ? INAKTIV : undefined}>
          <button type="button" data-testid="inget-objekt-lista" onClick={onLista} style={{ ...KNAPP.tertiar, width: "100%", justifyContent: "center", marginTop: AVSTAND.xs }}>Välj ur listan i stället</button>
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Svarar du inte loggas körningen ändå, och kopplas till ett objekt när något täcker den.</div>
      </div>
    </div>
  );
}
