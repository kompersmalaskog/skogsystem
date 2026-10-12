"use client";
// ─────────────────────────────────────────────────────────────
// Admin → Avtal → Utjämningsperioder. Veckor där ordinarie tid lades ut ojämnt (§5 mom 2): årsövertiden räknar
// genomsnittet över hela perioden. Förr bara via SQL. Hela ISO-veckor, så formuläret erbjuder bara måndagar.
//
// Skrivningarna kontrolleras på det som kom tillbaka: 0 rader utan fel = RLS stoppade (bara admin skriver).
// Borttagning nekas om perioden berört en redan EXPORTERAD löneperiod, och om det inte går att läsa nekas den också.
// ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import {
  veckoText, antalVeckor, arLangPeriod, veckoAlternativ, slutFranMandag, mandagFranSlut, kontrolleraPeriod, delaUpp,
  loneperioderBerorda, arExporterad, MAX_VECKOR_UTAN_ÖVERENSKOMMELSE,
} from "@/lib/admin/utjamningsperiod";
import { Sektion, Stod, Kort, Lista, Rad, Sekundar, Primar, Lank, Destruktiv, Besked, Fel, Laddar, Tomt, Etikett, Falt, Val, Bekrafta, Sheet } from "./ui";

type Period = { id: string; startdatum: string; slutdatum: string; medarbetare_id: string | null; anteckning: string; skapad_av?: string | null };
type Person = { id: string; namn: string | null };
type Arbete = { slag: "ny" } | { slag: "redigera"; rad: Period };

const kortDatum = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
};

export default function UtjamningsSektion({ namnInloggad }: { namnInloggad: string }) {
  const [rader, setRader] = useState<Period[] | null>(null);
  const [personer, setPersoner] = useState<Person[]>([]);
  const [fel, setFel] = useState<string | null>(null);
  const [arbete, setArbete] = useState<Arbete | null>(null);

  const ladda = useCallback(async () => {
    setFel(null);
    const [p, m] = await Promise.all([
      supabase.from("utjamningsperiod").select("id, startdatum, slutdatum, medarbetare_id, anteckning, skapad_av").order("startdatum", { ascending: true }),
      supabase.from("medarbetare").select("id, namn").order("namn", { ascending: true }),
    ]);
    const e = p.error || m.error;
    if (e) { setFel(e.message || String(e)); setRader(null); return; }
    setRader((p.data || []) as Period[]);
    setPersoner((m.data || []) as Person[]);
  }, []);
  useEffect(() => { ladda(); }, [ladda]);

  const namnPa = (id: string | null) => (id == null ? "Alla" : personer.find(x => x.id === id)?.namn || "Okänd förare");
  const idag = ymdLokal(new Date());
  const { kommande, avslutade } = useMemo(() => delaUpp(rader || [], idag), [rader, idag]);

  const radUI = (r: Period, sista: boolean) => (
    <div key={r.id} data-utjamning-rad={r.id}>
      <Rad sista={sista} onClick={() => setArbete({ slag: "redigera", rad: r })} chevron
        rubrik={<>{veckoText(r)} <span style={{ ...TYP.meta, color: FARG.text2 }}>{kortDatum(r.startdatum)}–{kortDatum(r.slutdatum)}</span></>}
        detalj={r.anteckning}
        hoger={<span style={{ display: "inline-flex", alignItems: "center", gap: AVSTAND.s }}>
          {r.startdatum <= idag && r.slutdatum >= idag && <Etikett>Pågår</Etikett>}
          <span>{namnPa(r.medarbetare_id)}</span>
        </span>} />
    </div>
  );

  return (
    <div data-utjamning>
      <Sektion>Utjämningsperioder</Sektion>
      {fel ? (
        <Fel onForsok={ladda}>Kunde inte läsa utjämningsperioderna: {fel}</Fel>
      ) : rader === null ? (
        <Laddar>Laddar utjämningsperioder…</Laddar>
      ) : (
        <>
          {rader.length === 0 ? (
            <Kort><Tomt>Inga utjämningsperioder. En period markerar veckor där ordinarie tid lades ut ojämnt, så att årsövertiden räknar genomsnittet över hela perioden. Tryck Ny period för att lägga till en.</Tomt></Kort>
          ) : (
            <>
              {kommande.length > 0 && <Lista>{kommande.map((r, i) => radUI(r, i === kommande.length - 1))}</Lista>}
              {avslutade.length > 0 && (
                <>
                  <div style={{ ...TYP.micro, color: FARG.text3, margin: `${AVSTAND.l}px 0 ${AVSTAND.s}px`, padding: `0 ${AVSTAND.xs}px` }}>Avslutade</div>
                  <Lista>{avslutade.map((r, i) => radUI(r, i === avslutade.length - 1))}</Lista>
                </>
              )}
            </>
          )}
          <Sekundar onClick={() => setArbete({ slag: "ny" })} style={{ marginTop: AVSTAND.l }}>Ny period</Sekundar>
        </>
      )}

      {arbete && (
        <PeriodArk
          arbete={arbete} personer={personer} namnInloggad={namnInloggad} namnPa={namnPa}
          onStang={() => setArbete(null)}
          onKlar={() => { setArbete(null); ladda(); }} />
      )}
    </div>
  );
}

function PeriodArk({ arbete, personer, namnInloggad, namnPa, onStang, onKlar }: {
  arbete: Arbete; personer: Person[]; namnInloggad: string; namnPa: (id: string | null) => string; onStang: () => void; onKlar: () => void;
}) {
  const redigera = arbete.slag === "redigera" ? arbete.rad : null;
  const [forsta, setForsta] = useState(redigera ? redigera.startdatum : "");
  const [sista, setSista] = useState(redigera ? mandagFranSlut(redigera.slutdatum) : "");
  const [forare, setForare] = useState(redigera?.medarbetare_id ?? "");
  const [anteckning, setAnteckning] = useState(redigera?.anteckning ?? "");
  const [upptagen, setUpptagen] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [bekrafta, setBekrafta] = useState<"kontrollerar" | "fraga" | null>(null);
  const [nekad, setNekad] = useState<string | null>(null);

  const ar = new Date().getFullYear();
  const veckor = useMemo(() => {
    const alt = veckoAlternativ(ar);
    // En sparad period utanför fönstret ska ändå gå att öppna: lägg till dess veckor.
    for (const v of [forsta, sista]) if (v && !alt.some(a => a.value === v)) alt.push({ value: v, label: v });
    alt.sort((a, b) => a.value.localeCompare(b.value));
    return [{ value: "", label: "Välj vecka" }, ...alt];
  }, [ar, forsta, sista]);

  const period = forsta && sista && sista >= forsta ? { startdatum: forsta, slutdatum: slutFranMandag(sista) } : null;
  const hinder = kontrolleraPeriod({ forsta, sista, anteckning });
  // Bara det som går att rätta syns som text: en vecka som ännu inte är vald är inget fel, bara ett tomt fält.
  const ordningsFel = forsta && sista && sista < forsta ? "Sista veckan ligger före den första." : null;

  const spara = async () => {
    if (hinder || !period) return;
    setUpptagen(true); setSparFel(null);
    const vals = { startdatum: period.startdatum, slutdatum: period.slutdatum, medarbetare_id: forare || null, anteckning: anteckning.trim() };
    const { data, error } = redigera
      ? await supabase.from("utjamningsperiod").update(vals).eq("id", redigera.id).select("id")
      : await supabase.from("utjamningsperiod").insert({ ...vals, skapad_av: namnInloggad }).select("id");
    setUpptagen(false);
    if (error) { setSparFel(`Perioden sparades inte: ${error.message}`); return; }
    if (!data?.length) { setSparFel("Perioden sparades inte — raden träffades inte (bara admin kan ändra utjämningsperioder)."); return; }
    onKlar();
  };

  const tryckTaBort = async () => {
    if (!redigera) return;
    setSparFel(null); setNekad(null); setBekrafta("kontrollerar");
    const { data, error } = await supabase.from("fortnox_export_logg").select("period, medarbetare_id, status")
      .eq("status", "skickat").in("period", loneperioderBerorda(redigera));
    if (error) { setBekrafta(null); setNekad(`Kunde inte kontrollera om lönen är exporterad: ${error.message}. Försök igen.`); return; }
    const logg = (data || []) as { period: string; medarbetare_id: string; status: string }[];
    if (arExporterad(redigera, logg)) {
      const perioder = Array.from(new Set(logg.filter(l => !redigera.medarbetare_id || l.medarbetare_id === redigera.medarbetare_id).map(l => l.period))).sort();
      setBekrafta(null);
      setNekad(`Perioden kan inte tas bort: lönen för ${perioder.join(", ")} är redan skickad till Fortnox och bygger på den.`);
      return;
    }
    setBekrafta("fraga");
  };

  const taBort = async () => {
    if (!redigera) return;
    setUpptagen(true); setSparFel(null);
    const { data, error } = await supabase.from("utjamningsperiod").delete().eq("id", redigera.id).select("id");
    setUpptagen(false);
    if (error) { setSparFel(`Perioden togs inte bort: ${error.message}`); return; }
    if (!data?.length) { setSparFel("Perioden togs inte bort — raden träffades inte (bara admin kan ta bort utjämningsperioder)."); return; }
    onKlar();
  };

  return (
    <Sheet titel={redigera ? "Ändra utjämningsperiod" : "Ny utjämningsperiod"} onStang={onStang} attr={{ "data-utjamning-ark": "" }}>
      <Val label="Första veckan" value={forsta} onChange={setForsta} options={veckor} />
      <Val label="Sista veckan" value={sista} onChange={setSista} options={veckor}
        hint={period ? `${antalVeckor(period)} veckor, ${veckoText(period)}` : undefined} />
      {ordningsFel && <Besked>{ordningsFel}</Besked>}
      {period && arLangPeriod(period) && (
        <Stod farg={FARG.orange} style={{ marginTop: 0, marginBottom: AVSTAND.l }}>
          Längre än {MAX_VECKOR_UTAN_ÖVERENSKOMMELSE} veckor kräver lokal överenskommelse (§5 mom 2).
        </Stod>
      )}
      <Val label="Förare" value={forare} onChange={setForare}
        options={[{ value: "", label: "Alla" }, ...personer.map(p => ({ value: p.id, label: p.namn || "Namnlös" }))]} />
      <Falt label="Anteckning" value={anteckning} onChange={setAnteckning} hint="Vad som gjordes, minst 3 tecken." />

      {sparFel && <Besked>{sparFel}</Besked>}
      {nekad && <Besked>{nekad}</Besked>}

      {bekrafta === "fraga" && redigera ? (
        <div style={{ marginTop: AVSTAND.l }}>
          <Bekrafta text={`Ta bort perioden ${veckoText(redigera)} (${namnPa(redigera.medarbetare_id)})? Årsövertiden räknas då utan den.`}
            ja="Ja, ta bort" onJa={taBort} onNej={() => { setBekrafta(null); setSparFel(null); }} upptagen={upptagen} />
        </div>
      ) : (
        <div style={{ marginTop: AVSTAND.xl }}>
          <Primar onClick={spara} disabled={!!hinder || upptagen}>{upptagen ? "Sparar…" : "Spara"}</Primar>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: AVSTAND.s }}>
            <Lank smal onClick={onStang}>Avbryt</Lank>
            {redigera && <Destruktiv smal onClick={tryckTaBort} disabled={bekrafta === "kontrollerar"}>{bekrafta === "kontrollerar" ? "Kontrollerar…" : "Ta bort"}</Destruktiv>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
