"use client";
// ─────────────────────────────────────────────────────────────
// Arket för en utjämningsperiod (Admin → Avtal), uppbyggt som Apple Kalender: ett formulär på EN skärm med rader
//   Namn · Från ›  · Till › · Förare › · Överenskommen › · Anteckning (valfri)
// Från/Till/Förare/Överenskommen fäller ut en kort ruta under raden (en åt gången; en veckovalsruta stängs vid val).
//
// EN period = flera rader i databasen (en per förare, eller en med medarbetare_id NULL för Alla) med samma namn, start och slut.
// Att ändra en period ändrar hela gruppen: de förare som finns kvar uppdateras, urbockade förare raderas, ibockade får en ny rad.
// Överenskommelsens datum skrivs på ALLA rader. Ta bort tar bort alla rader i gruppen (med bekräftelse).
//
// Skrivningarna kontrolleras på det som kom tillbaka: 0 rader utan fel = RLS stoppade (bara admin skriver).
// Borttagning nekas om perioden berört en redan EXPORTERAD löneperiod, och om det inte går att läsa nekas den också.
// ─────────────────────────────────────────────────────────────
import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import {
  veckoText, arLangPeriod, slutFranMandag, mandagFranSlut, kontrolleraPeriod, veckorText, veckoKortText, forareText, kortDatumMedAr, planeraAndring,
  krockMening, krockarIVecka, krockarIUrval, loneperioderBerorda, arExporterad, KRAVER_FACKLIG_OVERENSKOMMELSE, MAX_NAMN_TECKEN,
  type PeriodGrupp, type PeriodRad,
} from "@/lib/admin/utjamningsperiod";
import { Stod, Primar, Tertiar, Lank, Destruktiv, Besked, Bekrafta, Sheet, Ikon } from "./ui";
import VeckoVal from "./VeckoVal";

export type Person = { id: string; namn: string | null };
export type Arbete = { slag: "ny" } | { slag: "redigera"; grupp: PeriodGrupp };
type Oppen = "fran" | "till" | "forare" | "overenskommen" | null;

const mandagIdag = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymdLokal(d); };
const raderText = (n: number) => (n > 1 ? ` (${n} rader)` : "");

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

const radStil = (sista: boolean) => ({ borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }) as const;

export default function PeriodArk({ arbete, personer, befintliga, namnInloggad, onStang, onKlar, omladda }: {
  arbete: Arbete; personer: Person[]; befintliga: PeriodRad[]; namnInloggad: string; onStang: () => void; onKlar: () => void; omladda: () => void;
}) {
  const grupp = arbete.slag === "redigera" ? arbete.grupp : null;
  const idag = mandagIdag();
  const [namn, setNamn] = useState(grupp ? grupp.namn : "");
  const [fran, setFran] = useState(grupp ? grupp.startdatum : idag);
  const [till, setTill] = useState(grupp ? mandagFranSlut(grupp.slutdatum) : idag);
  // Förare: Alla (en rad med medarbetare_id NULL) och/eller personer (en rad var).
  const [alla, setAlla] = useState(grupp ? grupp.alla : false);
  const [ids, setIds] = useState<string[]>(grupp ? grupp.forare : []);
  const [overenskommen, setOverenskommen] = useState(grupp?.overenskommen ?? "");
  const [anteckning, setAnteckning] = useState(grupp?.anteckning ?? "");
  const [oppen, setOppen] = useState<Oppen>(null);
  const [upptagen, setUpptagen] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [bekrafta, setBekrafta] = useState<"kontrollerar" | "fraga" | null>(null);
  const [nekad, setNekad] = useState<string | null>(null);

  const val = useMemo(() => ({ alla, ids }), [alla, ids]);
  const antalForare = (alla ? 1 : 0) + ids.length;
  const hinder = kontrolleraPeriod({ forsta: fran, sista: till, namn, antalForare });
  const period = { startdatum: fran, slutdatum: slutFranMandag(till) };
  const innevarandeAr = new Date().getFullYear();

  // Samma namn och samma veckor som en befintlig period = samma period för andra förare, ingen krock.
  const ny = namn.trim() ? { namn, startdatum: period.startdatum, slutdatum: period.slutdatum } : undefined;
  const krockar = useMemo(() => krockarIUrval({ forsta: fran, sista: till }, val, befintliga, grupp?.ids, ny), [fran, till, val, befintliga, grupp, ny?.namn, ny?.startdatum, ny?.slutdatum]); // eslint-disable-line react-hooks/exhaustive-deps
  const fornamn = (id: string) => (personer.find(x => x.id === id)?.namn || "Okänd").split(" ")[0];

  const vaxla = (k: Exclude<Oppen, null>) => setOppen(o => (o === k ? null : k));
  const valjFran = (m: string) => { setFran(m); if (m > till) setTill(m); setOppen(null); };
  const valjTill = (m: string) => { setTill(m); setOppen(null); };
  // Alla på rensar personerna; Alla av rör dem inte. En person på tar bort Alla; en person av rör inte Alla
  // (annars försvinner en NULL-rad av misstag när man bara ville ta bort en förare).
  const tryckAlla = () => { if (alla) setAlla(false); else { setAlla(true); setIds([]); } };
  const tryckPerson = (id: string) => { if (ids.includes(id)) setIds(cur => cur.filter(x => x !== id)); else { setAlla(false); setIds(cur => [...cur, id]); } };

  const gemensamt = () => ({ startdatum: period.startdatum, slutdatum: period.slutdatum, namn: namn.trim(), anteckning: anteckning.trim(), overenskommen_datum: overenskommen || null });
  const rlsText = "raden träffades inte (bara admin kan ändra utjämningsperioder)";

  const spara = async () => {
    if (hinder) return;
    setUpptagen(true); setSparFel(null);
    const fel = await (grupp ? sparaGrupp(grupp) : sparaNy());
    setUpptagen(false);
    if (fel) { setSparFel(fel); if (grupp) omladda(); return; }
    onKlar();
  };

  async function sparaNy(): Promise<string | null> {
    const forare = alla ? [null] : personer.filter(p => ids.includes(p.id)).map(p => p.id);
    const nya = forare.map(id => ({ ...gemensamt(), medarbetare_id: id, skapad_av: namnInloggad }));
    const { data, error } = await supabase.from("utjamningsperiod").insert(nya).select("id"); // ett anrop: alla rader eller ingen
    if (error) return `Perioden sparades inte: ${error.message}`;
    if ((data?.length ?? 0) !== nya.length) return `Perioden sparades inte — ${rlsText}.`;
    return null;
  }

  /** Uppdatera de som finns kvar, lägg till de ibockade, radera de urbockade — i den ordningen, och stanna vid första felet. */
  async function sparaGrupp(g: PeriodGrupp): Promise<string | null> {
    const plan = planeraAndring(g, val);
    const delvis = " En del av ändringen kan redan vara gjord: kontrollera listan.";
    if (plan.uppdatera.length) {
      const { data, error } = await supabase.from("utjamningsperiod").update(gemensamt()).in("id", plan.uppdatera).select("id");
      if (error) return `Perioden sparades inte: ${error.message}`;
      if ((data?.length ?? 0) !== plan.uppdatera.length) return `Perioden sparades inte — ${rlsText}.`;
    }
    if (plan.ny.length) {
      const nya = plan.ny.map(id => ({ ...gemensamt(), medarbetare_id: id, skapad_av: namnInloggad }));
      const { data, error } = await supabase.from("utjamningsperiod").insert(nya).select("id");
      if (error) return `Förare lades inte till: ${error.message}.${delvis}`;
      if ((data?.length ?? 0) !== nya.length) return `Förare lades inte till — ${rlsText}.${delvis}`;
    }
    if (plan.taBort.length) {
      const { data, error } = await supabase.from("utjamningsperiod").delete().in("id", plan.taBort).select("id");
      if (error) return `Förare togs inte bort: ${error.message}.${delvis}`;
      if ((data?.length ?? 0) !== plan.taBort.length) return `Förare togs inte bort — ${rlsText}.${delvis}`;
    }
    return null;
  }

  const tryckTaBort = async () => {
    if (!grupp) return;
    setSparFel(null); setNekad(null); setBekrafta("kontrollerar");
    const { data, error } = await supabase.from("fortnox_export_logg").select("period, medarbetare_id, status")
      .eq("status", "skickat").in("period", loneperioderBerorda(grupp));
    if (error) { setBekrafta(null); setNekad(`Kunde inte kontrollera om lönen är exporterad: ${error.message}. Försök igen.`); return; }
    const logg = (data || []) as { period: string; medarbetare_id: string; status: string }[];
    if (grupp.rader.some(r => arExporterad(r, logg))) {
      const berorda = logg.filter(l => grupp.rader.some(r => !r.medarbetare_id || r.medarbetare_id === l.medarbetare_id));
      const perioder = Array.from(new Set(berorda.map(l => l.period))).sort();
      setBekrafta(null);
      setNekad(`Perioden kan inte tas bort: lönen för ${perioder.join(", ")} är redan skickad till Fortnox och bygger på den.`);
      return;
    }
    setBekrafta("fraga");
  };

  const taBort = async () => {
    if (!grupp) return;
    setUpptagen(true); setSparFel(null);
    const { data, error } = await supabase.from("utjamningsperiod").delete().in("id", grupp.ids).select("id");
    setUpptagen(false);
    if (error) { setSparFel(`Perioden togs inte bort: ${error.message}`); return; }
    if ((data?.length ?? 0) !== grupp.ids.length) { setSparFel("Perioden togs inte bort — raderna träffades inte (bara admin kan ta bort utjämningsperioder)."); omladda(); return; }
    onKlar();
  };

  // ── Rader ──
  const radInnehall = { display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.m}px`, boxSizing: "border-box" } as const;
  const etikett = { ...TYP.text, color: FARG.text, flexShrink: 0 } as const;
  const inmatning = { flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, background: "transparent", border: "none", outline: "none", color: FARG.text2, fontFamily: "inherit", textAlign: "right", ...TYP.text } as const;

  /** En rad som fäller ut en ruta: etikett till vänster, värde och pil till höger. */
  const knappRad = (k: Exclude<Oppen, null>, label: string, varde: string) => (
    <button type="button" data-falt={k} aria-expanded={oppen === k} onClick={() => vaxla(k)}
      style={{ ...radInnehall, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
      <span style={etikett}>{label}</span>
      <span style={{ flex: 1 }} />
      <span data-varde style={{ ...TYP.text, color: oppen === k ? FARG.text : FARG.text2 }}>{varde}</span>
      <span style={{ display: "inline-flex", transform: oppen === k ? "rotate(90deg)" : "none" }}><Ikon namn="chevron_right" farg={FARG.text3} /></span>
    </button>
  );
  const inkapsla = (k: string, barn: React.ReactNode, sista = false) => <div data-falt-rad={k} style={radStil(sista)}>{barn}</div>;

  // §5 mom 2: högst 16 veckor kräver ingen överenskommelse; över 16 veckor krävs en med LOKAL FACKLIG ORGANISATION. Raden visas därför
  // bara för långa perioder — eller när ett datum redan finns, så att det syns och kan tas bort.
  const arLang = arLangPeriod(period);
  const visaOverenskommen = arLang || !!overenskommen;
  const statusRader = (
    <div data-utjamning-status style={{ marginTop: AVSTAND.s, marginBottom: AVSTAND.l }}>
      <Stod>{veckorText(fran, till)}</Stod>
      {antalForare === 0 && <Stod>Välj vilka perioden gäller</Stod>}
      {krockar.length > 0 && <Stod attr={{ "data-krock-varning": "" }}>{krockMening(krockar, fornamn)}</Stod>}
    </div>
  );

  const krockerIVecka = (m: string) => krockarIVecka(m, val, befintliga, grupp?.ids, ny);

  return (
    <Sheet titel={grupp ? "Ändra utjämningsperiod" : "Ny utjämningsperiod"} onStang={onStang} attr={{ "data-utjamning-ark": "" }} overlayAttr={{ "data-utjamning-overlay": "" }}>
      <div style={{ background: FARG.bg, borderRadius: RADIE.rad, overflow: "hidden" }}>
        {inkapsla("namn", (
          <label htmlFor="period-namn" style={{ ...radInnehall, cursor: "text" }}>
            <span style={etikett}>Namn</span>
            <input id="period-namn" type="text" value={namn} maxLength={MAX_NAMN_TECKEN} placeholder="t.ex. Gävle" onChange={e => setNamn(e.target.value)} style={inmatning} />
          </label>
        ))}
        {inkapsla("fran", knappRad("fran", "Från", veckoKortText(fran, "fran", innevarandeAr)))}
        {oppen === "fran" && <VeckoVal slag="fran" vald={fran} fran={fran} onVal={valjFran} krockerIVecka={krockerIVecka} />}
        {inkapsla("till", knappRad("till", "Till", veckoKortText(till, "till", innevarandeAr)))}
        {oppen === "till" && <VeckoVal slag="till" vald={till} fran={fran} onVal={valjTill} krockerIVecka={krockerIVecka} />}
        {inkapsla("forare", knappRad("forare", "Förare", forareText(val, personer)))}
        {oppen === "forare" && (
          <div data-panel="forare" style={{ maxHeight: TRAFFYTA.min * 6, overflowY: "auto", overscrollBehavior: "contain", background: FARG.bg }}>
            <Bockrad namn="Alla" vald={alla} onToggle={tryckAlla} sista={personer.length === 0} />
            {personer.map((p, i) => <Bockrad key={p.id} namn={p.namn || "Namnlös"} vald={ids.includes(p.id)} onToggle={() => tryckPerson(p.id)} sista={i === personer.length - 1} />)}
          </div>
        )}
        {visaOverenskommen && inkapsla("overenskommen", knappRad("overenskommen", "Överenskommen", overenskommen ? kortDatumMedAr(overenskommen) : "—"))}
        {visaOverenskommen && oppen === "overenskommen" && (
          <div data-panel="overenskommen" style={{ padding: `${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.m}px`, background: FARG.bg }}>
            <label htmlFor="period-overenskommen" style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Datum då ni kom överens</label>
            <input id="period-overenskommen" type="date" value={overenskommen} onChange={e => setOverenskommen(e.target.value)}
              style={{ width: "100%", minHeight: TRAFFYTA.min, boxSizing: "border-box", background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, padding: `0 ${AVSTAND.m}px`, color: FARG.text, fontFamily: "inherit", outline: "none", ...TYP.text }} />
            {overenskommen && <Tertiar onClick={() => setOverenskommen("")} style={{ marginTop: AVSTAND.xs }}>Ta bort datum</Tertiar>}
          </div>
        )}
        {arLang && (
          <div data-overenskommelse-krav style={{ ...TYP.meta, color: overenskommen ? FARG.text2 : FARG.orange, padding: `0 ${AVSTAND.m}px ${AVSTAND.s}px`, borderBottom: `1px solid ${FARG.linje}` }}>
            {KRAVER_FACKLIG_OVERENSKOMMELSE}
          </div>
        )}
        {inkapsla("anteckning", (
          <label htmlFor="period-anteckning" style={{ ...radInnehall, cursor: "text" }}>
            <span style={etikett}>Anteckning (valfri)</span>
            <input id="period-anteckning" type="text" value={anteckning} onChange={e => setAnteckning(e.target.value)} style={inmatning} />
          </label>
        ), true)}
      </div>

      {statusRader}

      {sparFel && <Besked>{sparFel}</Besked>}
      {nekad && <Besked>{nekad}</Besked>}

      {bekrafta === "fraga" && grupp ? (
        <div style={{ marginTop: AVSTAND.l }}>
          <Bekrafta text={`Ta bort perioden ${grupp.namn} ${veckoText(grupp)}${raderText(grupp.rader.length)}? Årsövertiden räknas då utan den.`}
            ja="Ja, ta bort" onJa={taBort} onNej={() => { setBekrafta(null); setSparFel(null); }} upptagen={upptagen} />
        </div>
      ) : (
        <div style={{ marginTop: AVSTAND.l }}>
          <Primar onClick={spara} disabled={!!hinder || upptagen}>{upptagen ? "Sparar…" : "Spara"}</Primar>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: AVSTAND.s }}>
            <Lank smal onClick={onStang}>Avbryt</Lank>
            {grupp && <Destruktiv smal onClick={tryckTaBort} disabled={bekrafta === "kontrollerar"}>{bekrafta === "kontrollerar" ? "Kontrollerar…" : "Ta bort"}</Destruktiv>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
