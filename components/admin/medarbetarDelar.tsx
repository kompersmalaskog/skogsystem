"use client";
// Delar som både personens vy och Ny medarbetare-flödet använder: typerna, rollerna, hempunktskortet
// (var km räknas ifrån) och operatörskopplingen.
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { Stod, Kort, Sekundar, Primar, Besked, Tomt, Ikon } from "./ui";
import { precisionText } from "@/lib/geokod";
import { kontrolleraAnstallningsnummer, type AnstKontroll } from "@/lib/admin/anstallningsnummer";

export type Medarbetare = {
  id: string;
  namn: string | null;
  epost: string | null;
  hemadress: string | null;
  roll: string;
  maskin_id: string | null;
  timlon_kr: number | null;
  manadslon_kr: number | null;
  anstallningsdatum: string | null;
  // Kopplingen till inloggningskontot (sätts automatiskt i databasen sedan 20260929).
  user_id: string | null;
  // Hempunkten och varifrån den kom (migration 20260929_medarbetare_hem_geokod).
  hem_lat: number | null;
  hem_lng: number | null;
  hem_koord_kalla: string | null;
  hem_geokod_status: string | null;
  hem_geokod_etikett: string | null;
  hem_geokod_precision: string | null;
  hem_geokod_lat: number | null;
  hem_geokod_lng: number | null;
};

export type OperatorRad = {
  operator_id: string;
  operator_namn: string | null;
  operator_key: string | null;
  maskin_id: string | null;
};

export const ROLLER = [
  { value: "forare", label: "Förare" },
  { value: "admin", label: "Admin" },
];
/* ─── HEMPUNKT ─── */
// Var km räknas ifrån, varifrån punkten kom och — viktigast — VAR adressen
// hamnade. En landsbygdsadress i tätortens mitt ger fel km varje dag utan att
// någon märker det (Idekulla 6 ligger flera km utanför Ryd). Bara en träff på
// adressnivå används automatiskt (lib/geokod); allt grövre väntar här.
export function HempunktKort({ m, onLadda }: { m: Medarbetare; onLadda: () => void }) {
  const [kör, setKör] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const karta = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
  const anropa = async (opt: { tvinga?: boolean; acceptera?: boolean } = {}) => {
    setKör(true); setFel(null);
    const r = await fetch("/api/medarbetare/geokoda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, ...opt }) });
    const j = await r.json().catch(() => ({}));
    setKör(false);
    if (!r.ok || !j.ok) { setFel(j.error || `Geokodningen misslyckades (HTTP ${r.status})`); return; }
    onLadda();
  };
  const knapp = (text: string, onClick: () => void) => (
    <Sekundar onClick={onClick} disabled={kör} style={{ marginTop: AVSTAND.m }}>{kör ? "Geokodar…" : text}</Sekundar>
  );
  const länk = (lat: number, lng: number, text: string) => (
    <a href={karta(lat, lng)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: AVSTAND.s, color: FARG.bla, ...TYP.meta }}>{text}</a>
  );
  const kalla = m.hem_koord_kalla === "gps" ? "satt med GPS i Maskinflytt"
    : m.hem_koord_kalla === "geokod" ? `från adressen — ${m.hem_geokod_etikett || "okänd etikett"} (${precisionText(m.hem_geokod_precision)})`
    : "satt för hand";
  const s = m.hem_geokod_status;
  const text = (t: React.ReactNode, farg: string = FARG.text) => <p style={{ margin: 0, ...TYP.text, color: farg }}>{t}</p>;
  const stod = (t: React.ReactNode) => <Stod style={{ marginTop: AVSTAND.m }}>{t}</Stod>;
  return (
    <Kort>
      {!m.hemadress?.trim() && m.hem_lat == null ? (
        text("Ingen hemadress, så km räknas inte. Fyll i adressen ovan och spara.", FARG.orange)
      ) : m.hem_lat != null && m.hem_lng != null ? (
        <>
          {text(`Punkten är ${kalla}.`)}
          {länk(m.hem_lat, m.hem_lng, "Visa punkten på kartan")}
          {s === "hoppad" && (
            <>
              {stod(`Adressen har ändrats men punkten är ${m.hem_koord_kalla === "gps" ? "satt med GPS" : "satt för hand"} och skrivs inte över automatiskt.`)}
              {knapp("Geokoda adressen ändå", () => anropa({ tvinga: true }))}
            </>
          )}
          {s === "osaker" && m.hem_geokod_lat != null && m.hem_geokod_lng != null && (
            stod(`Adressen hittades bara ungefär: ${precisionText(m.hem_geokod_precision)} (${m.hem_geokod_etikett}). Punkten ovan används.`)
          )}
        </>
      ) : s === "osaker" && m.hem_geokod_lat != null && m.hem_geokod_lng != null ? (
        <>
          {text(`Adressen hittades bara ungefär: ${precisionText(m.hem_geokod_precision)} (${m.hem_geokod_etikett}). Används den blir km fel om personen bor utanför. Km räknas inte förrän du valt.`, FARG.orange)}
          {länk(m.hem_geokod_lat, m.hem_geokod_lng, "Visa förslaget på kartan")}
          {knapp("Använd förslaget ändå", () => anropa({ acceptera: true }))}
          {stod('Exaktare: personen trycker "spara nuvarande plats som hembas" hemma i Maskinflytt, eller justera adressen ovan.')}
        </>
      ) : s === "misslyckad" ? (
        <>
          {text(`Adressen hittades inte (${m.hem_geokod_etikett || "okänt fel"}). Kontrollera stavningen. Km räknas inte.`, FARG.orange)}
          {knapp("Försök igen", () => anropa())}
        </>
      ) : (
        <>
          {text("Adressen väntar på geokodning. Det sker i natt, eller nu.", FARG.text2)}
          {knapp("Geokoda nu", () => anropa())}
        </>
      )}
      {fel && <Stod farg={FARG.rod} style={{ marginTop: AVSTAND.m }}>{fel}</Stod>}
    </Kort>
  );
}

/* ─── KOPPLA OPERATÖR ─── */

export function KopplaOperatörModal({
  medarbetareId, onKlar, onAvbryt,
}: {
  medarbetareId: string;
  onKlar: () => void;
  onAvbryt: () => void;
}) {
  const [lediga, setLediga] = useState<OperatorRad[] | null>(null);
  const [valt, setValt] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [opMedRes, dimOpRes] = await Promise.all([
        supabase.from("operator_medarbetare").select("operator_id"),
        supabase.from("dim_operator").select("operator_id, operator_namn, operator_key, maskin_id").order("operator_namn"),
      ]);
      const taget = new Set((opMedRes.data || []).map((r: any) => r.operator_id));
      const lediga = (dimOpRes.data || []).filter((o: any) => !taget.has(o.operator_id));
      setLediga(lediga);
    })();
  }, []);

  const koppla = async () => {
    if (!valt) return;
    setSparar(true);
    setFel(null);
    const { error } = await supabase.from("operator_medarbetare").insert({
      operator_id: valt,
      medarbetare_id: medarbetareId,
    });
    setSparar(false);
    if (error) { setFel(error.message); return; }
    onKlar();
  };

  return (
    <div onClick={onAvbryt} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: AVSTAND.xl }}>
      <div onClick={e => e.stopPropagation()} style={{ background: FARG.kort, borderRadius: RADIE.sheet, padding: AVSTAND.xl, width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.rubrik, color: FARG.text, textAlign: "center" }}>Koppla operatör</p>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: AVSTAND.m }}>
          {lediga === null ? (
            <Tomt>Laddar…</Tomt>
          ) : lediga.length === 0 ? (
            <Tomt>Alla operatörer är redan kopplade.</Tomt>
          ) : lediga.map((o, i) => (
            <button key={o.operator_id} type="button" onClick={() => setValt(o.operator_id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px`, background: valt === o.operator_id ? FARG.fyllning : "transparent", border: "none", borderBottom: i === lediga.length - 1 ? "none" : `1px solid ${FARG.linje}`, borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: FARG.text }}>
              <div>
                <div style={{ ...TYP.listtitel }}>{o.operator_namn || o.operator_key || o.operator_id}</div>
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{o.operator_id}{o.maskin_id ? ` · ${o.maskin_id}` : ""}</div>
              </div>
              {valt === o.operator_id && <Ikon namn="check" farg={FARG.text} />}
            </button>
          ))}
        </div>
        {fel && <Besked>{fel}</Besked>}
        <div style={{ display: "flex", gap: AVSTAND.m, marginTop: AVSTAND.m }}>
          <Sekundar onClick={onAvbryt} style={{ flex: 1 }}>Avbryt</Sekundar>
          <Primar onClick={koppla} disabled={!valt || sparar} style={{ flex: 1 }}>{sparar ? "Kopplar…" : "Koppla"}</Primar>
        </div>
      </div>
    </div>
  );
}

/* ─── ANSTÄLLNINGSNUMRET MOT FORTNOX ─── */
// Numret går att spara utan Fortnox; det kontrolleras när anslutningen finns. En kontroll som inte gick att göra är aldrig
// "numret finns inte": ej_ansluten och fel säger vad som hände, bara 'saknas' säger att Fortnox inte känner numret.

/** Kontrollerar ett SPARAT nummer mot Fortnox (ingen kontroll av ett tomt). */
export function useAnstKontroll(nr: string, aktiv: boolean) {
  const [kontroll, setKontroll] = useState<AnstKontroll | null>(null);
  const [laddar, setLaddar] = useState(false);
  useEffect(() => {
    let avbruten = false;
    const n = nr.trim();
    if (!aktiv || !n) { setKontroll(null); setLaddar(false); return; }
    setLaddar(true);
    kontrolleraAnstallningsnummer(n).then(k => { if (!avbruten) { setKontroll(k); setLaddar(false); } });
    return () => { avbruten = true; };
  }, [nr, aktiv]);
  return { kontroll, laddar, setKontroll };
}

export function AnstKontrollText({ kontroll, laddar, nr }: { kontroll: AnstKontroll | null; laddar?: boolean; nr: string }) {
  if (laddar) return <span>Kontrollerar numret mot Fortnox …</span>;
  if (!kontroll) return null;
  if (kontroll.status === "hittad") return <span style={{ color: FARG.gron }}>Finns i Fortnox som {kontroll.namn}.</span>;
  if (kontroll.status === "saknas") return <span style={{ color: FARG.orange }}>Fortnox känner inte numret {nr.trim()}. Kontrollera numret.</span>;
  if (kontroll.status === "ej_ansluten") return <span>Kontrolleras mot Fortnox när anslutningen finns.</span>;
  return <span style={{ color: FARG.orange }}>Kunde inte kontrollera mot Fortnox: {kontroll.fel}</span>;
}
