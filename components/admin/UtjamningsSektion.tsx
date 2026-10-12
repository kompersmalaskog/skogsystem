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
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import {
  veckoText, arLangPeriod, slutFranMandag, mandagFranSlut, kontrolleraPeriod, delaUpp, tryckVecka, periodSammanfattning,
  krockarIVecka, krockarIUrval, loneperioderBerorda, arExporterad, MAX_VECKOR_UTAN_ÖVERENSKOMMELSE, type Urval,
} from "@/lib/admin/utjamningsperiod";
import { Sektion, Stod, Kort, Lista, Rad, Sekundar, Primar, Lank, Destruktiv, Besked, Fel, Laddar, Tomt, Etikett, Falt, Bekrafta, Sheet, Ikon } from "./ui";
import VeckoKalender from "./VeckoKalender";

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
          arbete={arbete} personer={personer} befintliga={rader || []} namnInloggad={namnInloggad} namnPa={namnPa}
          onStang={() => setArbete(null)}
          onKlar={() => { setArbete(null); ladda(); }} />
      )}
    </div>
  );
}

/** En rad i förarlistan: namnet, och en bock när den är vald. Hela raden är träffytan (44 px). */
function Bockrad({ namn, vald, onToggle, sista }: { namn: string; vald: boolean; onToggle: () => void; sista: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={vald} data-namn={namn} onClick={onToggle}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: "none", border: "none", borderBottom: sista ? "none" : `1px solid ${FARG.linje}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: FARG.text, ...TYP.text }}>
      <span style={vald ? { fontWeight: TYP.listtitel.fontWeight } : undefined}>{namn}</span>
      <span style={{ width: AVSTAND.xl, display: "inline-flex", justifyContent: "flex-end" }}>{vald && <Ikon namn="check" farg={FARG.text} />}</span>
    </button>
  );
}

function PeriodArk({ arbete, personer, befintliga, namnInloggad, namnPa, onStang, onKlar }: {
  arbete: Arbete; personer: Person[]; befintliga: Period[]; namnInloggad: string; namnPa: (id: string | null) => string; onStang: () => void; onKlar: () => void;
}) {
  const redigera = arbete.slag === "redigera" ? arbete.rad : null;
  const [urval, setUrval] = useState<Urval>(redigera ? { forsta: redigera.startdatum, sista: mandagFranSlut(redigera.slutdatum) } : { forsta: "", sista: "" });
  // Förare: Alla (en rad med medarbetare_id NULL) eller en eller flera personer (en rad var). Vid ändring gäller bara den raden.
  const [alla, setAlla] = useState(true);
  const [ids, setIds] = useState<string[]>([]);
  const [anteckning, setAnteckning] = useState(redigera?.anteckning ?? "");
  const [upptagen, setUpptagen] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [bekrafta, setBekrafta] = useState<"kontrollerar" | "fraga" | null>(null);
  const [nekad, setNekad] = useState<string | null>(null);

  const val = useMemo(() => redigera ? { alla: redigera.medarbetare_id == null, ids: redigera.medarbetare_id ? [redigera.medarbetare_id] : [] } : { alla, ids }, [redigera, alla, ids]);
  const antalForare = redigera ? 1 : alla ? 1 : ids.length;
  const hinder = kontrolleraPeriod({ forsta: urval.forsta, sista: urval.sista, anteckning, antalForare });

  const period = urval.forsta && urval.sista ? { startdatum: urval.forsta, slutdatum: slutFranMandag(urval.sista) } : null;
  const krockar = useMemo(() => krockarIUrval(urval, val, befintliga, redigera?.id), [urval, val, befintliga, redigera]);

  const tryckAlla = () => { setAlla(a => !a); setIds([]); };
  const tryckPerson = (id: string) => { setAlla(false); setIds(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])); };

  const spara = async () => {
    if (hinder || !period) return;
    setUpptagen(true); setSparFel(null);
    let antalForvantat = 1;
    let svar;
    if (redigera) {
      svar = await supabase.from("utjamningsperiod").update({ startdatum: period.startdatum, slutdatum: period.slutdatum, anteckning: anteckning.trim() }).eq("id", redigera.id).select("id");
    } else {
      const forare = alla ? [null] : personer.filter(p => ids.includes(p.id)).map(p => p.id);
      antalForvantat = forare.length;
      const nya = forare.map(id => ({ startdatum: period.startdatum, slutdatum: period.slutdatum, medarbetare_id: id, anteckning: anteckning.trim(), skapad_av: namnInloggad }));
      svar = await supabase.from("utjamningsperiod").insert(nya).select("id"); // ett anrop: alla rader eller ingen
    }
    setUpptagen(false);
    if (svar.error) { setSparFel(`Perioden sparades inte: ${svar.error.message}`); return; }
    if ((svar.data?.length ?? 0) !== antalForvantat) { setSparFel("Perioden sparades inte — raden träffades inte (bara admin kan ändra utjämningsperioder)."); return; }
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

  const etikettStil = { display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs } as const;

  return (
    <Sheet titel={redigera ? "Ändra utjämningsperiod" : "Ny utjämningsperiod"} onStang={onStang} attr={{ "data-utjamning-ark": "" }}>
      {redigera ? (
        <div style={{ marginBottom: AVSTAND.l }}>
          <p style={{ margin: 0, ...TYP.text, color: FARG.text }}>Gäller {namnPa(redigera.medarbetare_id)}</p>
          <Stod>Ändringen gäller bara den här raden.</Stod>
        </div>
      ) : (
        <div style={{ marginBottom: AVSTAND.l }}>
          <span style={etikettStil}>Förare</span>
          <div role="group" aria-label="Förare" style={{ background: FARG.bg, borderRadius: RADIE.rad, overflow: "hidden" }}>
            <Bockrad namn="Alla" vald={alla} onToggle={tryckAlla} sista={personer.length === 0} />
            {personer.map((p, i) => (
              <Bockrad key={p.id} namn={p.namn || "Namnlös"} vald={ids.includes(p.id)} onToggle={() => tryckPerson(p.id)} sista={i === personer.length - 1} />
            ))}
          </div>
          {antalForare === 0 && <Stod farg={FARG.orange}>Välj minst en förare.</Stod>}
        </div>
      )}

      <div style={{ marginBottom: AVSTAND.l }}>
        <span style={etikettStil}>Veckor</span>
        <VeckoKalender urval={urval} onTryck={m => setUrval(u => tryckVecka(u, m))}
          krockerIVecka={m => krockarIVecka(m, val, befintliga, redigera?.id)}
          extra={redigera ? [redigera.startdatum, redigera.slutdatum] : []} />
        <Stod>{periodSammanfattning(urval.forsta, urval.sista)}</Stod>
        {period && arLangPeriod(period) && (
          <Stod farg={FARG.orange}>Längre än {MAX_VECKOR_UTAN_ÖVERENSKOMMELSE} veckor kräver lokal överenskommelse (§5 mom 2).</Stod>
        )}
        {krockar.length > 0 && (
          <Stod farg={FARG.orange}>
            Krockar med befintlig period: {krockar.map(k => `${veckoText(k)} ${k.anteckning}`).join("; ")}. Du kan spara ändå.
          </Stod>
        )}
      </div>

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
