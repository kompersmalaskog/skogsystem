"use client";
// ─────────────────────────────────────────────────────────────
// Arket för en utjämningsperiod (Admin → Avtal), iOS Kalender-stil, ett beslut i taget.
//
// Navigationsrad: Avbryt vänster · Ny period/Ändra period · Lägg till/Spara höger (grå tills namn, Börjar och förare är satta).
// Rader: Namn · Börjar › · Längd (− / +) · Förare › · Anteckning (valfri) · [Överenskommen › om längden är över 16 veckor]
//
//  - Börjar: tryck på raden fäller ut ETT kalenderblad direkt under raden. Ett tryck på valfri dag sätter Börjar till den veckans
//    måndag, punkt. Bladet visar hela perioden som band och är öppet medan man trycker − och + på Längd.
//  - Längd: antal veckor med stegare (minst 1). Under står, grått, 'Slutar sön 5 jul · v27'. Ingen Slutar-rad att välja.
//  - Förare: en push-vy med bockar, Alla överst som egen grupp och en tillbakapil '‹ Ny period' uppe till vänster. Valet sparas
//    vid tillbaka (state ligger här i arket), ingen separat Klar. Raden visar namnen, 'N förare' om de inte får plats, eller 'Alla'.
//  - Anteckning ligger direkt under Förare och rullas i sikte när man kommer tillbaka från förarlistan.
//  - Skogsavtalet §5 mom 2: längd över 16 veckor kräver överenskommelse med lokal facklig organisation. Då visas en orange text direkt
//    under Längd och raden Överenskommen (datum). Högst 16 veckor: ingen av dem.
//
// EN period = flera rader i databasen (en per förare, eller en med medarbetare_id NULL för Alla) med samma namn, start och slut.
// Att ändra en period ändrar hela gruppen: de förare som finns kvar uppdateras, urbockade förare raderas, ibockade får en ny rad.
// Överenskommelsens datum skrivs på ALLA rader. Ta bort tar bort alla rader i gruppen (med bekräftelse).
//
// Skrivningarna kontrolleras på det som kom tillbaka: 0 rader utan fel = RLS stoppade (bara admin skriver).
// Borttagning nekas om perioden berört en redan EXPORTERAD löneperiod, och om det inte går att läsa nekas den också.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { ymdLokal } from "@/lib/datumLokal";
import {
  veckoText, arLangPeriod, slutFranMandag, mandagFranSlut, kontrolleraPeriod, forareNamn, forareRadText, kortDatumMedAr, planeraAndring,
  krockMening, krockarIVecka, krockarIUrval, loneperioderBerorda, arExporterad, borjarText, slutarText, slutMandag, langdVeckor,
  mandagForDag, flyttaManad, KRAVER_FACKLIG_OVERENSKOMMELSE, MAX_NAMN_TECKEN, type PeriodGrupp, type PeriodRad,
} from "@/lib/admin/utjamningsperiod";
import { Stod, Tertiar, Destruktiv, Besked, Bekrafta, Sheet, Ikon } from "./ui";
import PeriodKalender, { type ManadVal } from "./PeriodKalender";

export type Person = { id: string; namn: string | null };
export type Arbete = { slag: "ny" } | { slag: "redigera"; grupp: PeriodGrupp };

const mandagIdag = () => mandagForDag(ymdLokal(new Date()));
const raderText = (n: number) => (n > 1 ? ` (${n} rader)` : "");
const manadFor = (dag: string): ManadVal => ({ ar: Number(dag.slice(0, 4)), manad0: Number(dag.slice(5, 7)) - 1 });
const navKnapp = { ...KNAPP.lank, width: "auto", display: "inline-flex", alignItems: "center", gap: AVSTAND.xs, fontFamily: "inherit", ...TYP.text } as const;
/** Lägg till / Spara när något saknas: grå text, inte blå som dämpats. Blå betyder "går att trycka", och det gör den inte. */
const navInaktiv = { color: FARG.text3, cursor: "default" } as const;

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
  const [namn, setNamn] = useState(grupp ? grupp.namn : "");
  // Börjar (måndag) + Längd (veckor). En ny period börjar på veckan vi är i och är en vecka lång; en befintlig öppnas som den är.
  const [borjar, setBorjar] = useState(grupp ? grupp.startdatum : mandagIdag());
  const [langd, setLangd] = useState(grupp ? langdVeckor(grupp.startdatum, mandagFranSlut(grupp.slutdatum)) : 1);
  const [oppnaKalender, setOppnaKalender] = useState(false);
  const [manad, setManad] = useState<ManadVal>(manadFor(grupp ? grupp.startdatum : mandagIdag()));
  // Förare: Alla (en rad med medarbetare_id NULL) och/eller personer (en rad var).
  const [alla, setAlla] = useState(grupp ? grupp.alla : false);
  const [ids, setIds] = useState<string[]>(grupp ? grupp.forare : []);
  const [overenskommen, setOverenskommen] = useState(grupp?.overenskommen ?? "");
  const [anteckning, setAnteckning] = useState(grupp?.anteckning ?? "");
  const [vy, setVy] = useState<"form" | "forare">("form");
  const [oppenOverenskommen, setOppenOverenskommen] = useState(false);
  const [upptagen, setUpptagen] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [bekrafta, setBekrafta] = useState<"kontrollerar" | "fraga" | null>(null);
  const [nekad, setNekad] = useState<string | null>(null);

  const val = useMemo(() => ({ alla, ids }), [alla, ids]);
  const antalForare = (alla ? 1 : 0) + ids.length;
  const till = slutMandag(borjar, langd);                     // måndagen i sista veckan
  const hinder = kontrolleraPeriod({ forsta: borjar, sista: till, namn, antalForare });
  const period = { startdatum: borjar, slutdatum: slutFranMandag(till) };
  const innevarandeAr = new Date().getFullYear();

  // Samma namn och samma veckor som en befintlig period = samma period för andra förare, ingen krock.
  const ny = namn.trim() ? { namn, startdatum: period.startdatum, slutdatum: period.slutdatum } : undefined;
  const krockar = useMemo(() => krockarIUrval({ forsta: borjar, sista: till }, val, befintliga, grupp?.ids, ny), [borjar, till, val, befintliga, grupp, ny?.namn, ny?.startdatum, ny?.slutdatum]); // eslint-disable-line react-hooks/exhaustive-deps
  const fornamn = (id: string) => (personer.find(x => x.id === id)?.namn || "Okänd").split(" ")[0];
  const krockerIVecka = (m: string) => krockarIVecka(m, val, befintliga, grupp?.ids, ny);

  // Alla på rensar personerna; Alla av rör dem inte. En person på tar bort Alla; en person av rör inte Alla
  // (annars försvinner en NULL-rad av misstag när man bara ville ta bort en förare).
  const tryckAlla = () => { if (alla) setAlla(false); else { setAlla(true); setIds([]); } };
  const tryckPerson = (id: string) => { if (ids.includes(id)) setIds(cur => cur.filter(x => x !== id)); else { setAlla(false); setIds(cur => [...cur, id]); } };

  // Raden Förare visar namnen ('Stefan, Daniel, Joacim') eller, om de inte får plats på raden, 'N förare'. Det mäts i webbläsaren:
  // är texten bredare än sin ruta byts den mot antalet, och den prövas på nytt när valet ändras eller fönstret byter storlek.
  const vardeRef = useRef<HTMLSpanElement>(null);
  const [passar, setPassar] = useState(true);
  const namnNyckel = forareNamn(val, personer).join("|");
  useLayoutEffect(() => { setPassar(true); }, [namnNyckel]);
  useLayoutEffect(() => {
    const el = vardeRef.current;
    if (el && passar && el.scrollWidth > el.clientWidth) setPassar(false);
  }, [namnNyckel, passar, vy]);
  useEffect(() => { const f = () => setPassar(true); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  // Tillbaka från förarlistan: Anteckning ligger direkt under Förare — rulla den i sikte så den går att skriva i direkt.
  const anteckningRef = useRef<HTMLDivElement>(null);
  const forraVy = useRef(vy);
  useEffect(() => {
    if (forraVy.current === "forare" && vy === "form") anteckningRef.current?.scrollIntoView?.({ block: "nearest" });
    forraVy.current = vy;
  }, [vy]);

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

  const arkTitel = grupp ? "Ändra period" : "Ny period";
  const attr = { "data-utjamning-ark": "" };
  const overlayAttr = { "data-utjamning-overlay": "" };

  // ── Förarlistan: en push-vy med tillbakapil, ingen Klar ──
  if (vy === "forare") {
    return (
      <Sheet titel="Förare" vyNyckel="forare" onStang={onStang} attr={attr} overlayAttr={overlayAttr}
        vanster={(
          <button type="button" data-tillbaka onClick={() => setVy("form")} style={navKnapp}>
            <Ikon namn="chevron_left" farg={FARG.bla} />{arkTitel}
          </button>
        )}>
        <div data-forare-vy>
          <div data-forare-grupp="alla" style={{ background: FARG.bg, borderRadius: RADIE.rad, overflow: "hidden" }}>
            <Bockrad namn="Alla" vald={alla} onToggle={tryckAlla} sista />
          </div>
          <div data-forare-grupp="forare" style={{ background: FARG.bg, borderRadius: RADIE.rad, overflow: "hidden", marginTop: AVSTAND.l }}>
            {personer.map((p, i) => <Bockrad key={p.id} namn={p.namn || "Namnlös"} vald={ids.includes(p.id)} onToggle={() => tryckPerson(p.id)} sista={i === personer.length - 1} />)}
          </div>
        </div>
        <Stod>Alla gäller alla förare. Annars väljer du en eller flera; varje förare får en egen rad i perioden.</Stod>
      </Sheet>
    );
  }

  // ── Formuläret ──
  const radInnehall = { display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.m}px`, boxSizing: "border-box" } as const;
  const etikett = { ...TYP.text, color: FARG.text, flexShrink: 0 } as const;
  const inmatning = { flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, background: "transparent", border: "none", outline: "none", color: FARG.text2, fontFamily: "inherit", textAlign: "right", ...TYP.text } as const;

  /** En rad som öppnar något: etikett till vänster, värde och pil till höger. */
  const knappRad = (k: string, label: string, varde: string, onClick: () => void, oppen: boolean, ref?: React.Ref<HTMLSpanElement>) => (
    <button type="button" data-falt={k} aria-expanded={oppen} onClick={onClick}
      style={{ ...radInnehall, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
      <span style={etikett}>{label}</span>
      <span ref={ref} data-varde style={{ flex: 1, minWidth: 0, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", ...TYP.text, color: oppen ? FARG.text : FARG.text2 }}>{varde}</span>
      <span style={{ display: "inline-flex", transform: oppen ? "rotate(90deg)" : "none" }}><Ikon namn="chevron_right" farg={FARG.text3} /></span>
    </button>
  );
  const inkapsla = (k: string, barn: React.ReactNode, sista = false, ref?: React.Ref<HTMLDivElement>) => <div ref={ref} data-falt-rad={k} style={radStil(sista)}>{barn}</div>;

  // Stegaren: − och + i en kapsel, 44 px träffyta var. Minst 1 vecka.
  const stegKnapp = (etiketten: string, ikon: string, onClick: () => void, inaktiv: boolean) => (
    <button type="button" aria-label={etiketten} disabled={inaktiv} onClick={onClick}
      style={{ width: TRAFFYTA.min, minHeight: TRAFFYTA.min, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, cursor: "pointer", ...(inaktiv ? INAKTIV : null) }}>
      <Ikon namn={ikon} farg={FARG.text} />
    </button>
  );

  // §5 mom 2: högst 16 veckor kräver ingen överenskommelse; över 16 veckor krävs en med LOKAL FACKLIG ORGANISATION.
  const arLang = arLangPeriod(period);

  return (
    <Sheet titel={arkTitel} vyNyckel="form" onStang={onStang} attr={attr} overlayAttr={overlayAttr}
      vanster={<button type="button" onClick={onStang} style={navKnapp}>Avbryt</button>}
      hoger={(
        <button type="button" data-spara disabled={!!hinder || upptagen} onClick={spara}
          style={{ ...navKnapp, fontWeight: TYP.listtitel.fontWeight, ...(hinder || upptagen ? navInaktiv : null) }}>
          {upptagen ? "Sparar…" : grupp ? "Spara" : "Lägg till"}
        </button>
      )}>
      <div style={{ background: FARG.bg, borderRadius: RADIE.rad, overflow: "hidden" }}>
        {inkapsla("namn", (
          <label htmlFor="period-namn" style={{ ...radInnehall, cursor: "text" }}>
            <span style={etikett}>Namn</span>
            <input id="period-namn" type="text" value={namn} maxLength={MAX_NAMN_TECKEN} placeholder="t.ex. Gävle" onChange={e => setNamn(e.target.value)} style={inmatning} />
          </label>
        ))}

        {inkapsla("borjar", knappRad("borjar", "Börjar", borjarText(borjar, innevarandeAr), () => setOppnaKalender(o => !o), oppnaKalender))}
        {oppnaKalender && (
          <PeriodKalender borjar={borjar} langd={langd} manad={manad} onFlytta={delta => setManad(m => flyttaManad(m.ar, m.manad0, delta))} krockerIVecka={krockerIVecka}
            onTryck={dag => setBorjar(mandagForDag(dag))} />
        )}

        {inkapsla("langd", (
          <div style={radInnehall}>
            <span style={etikett}>Längd</span>
            <span style={{ flex: 1 }} />
            <span data-langd-varde style={{ ...TYP.text, color: FARG.text2 }}>{langd} v</span>
            <span style={{ display: "inline-flex", background: FARG.upphojt, borderRadius: RADIE.rad }}>
              {stegKnapp("Minska längd", "remove", () => setLangd(n => Math.max(1, n - 1)), langd <= 1)}
              {stegKnapp("Öka längd", "add", () => setLangd(n => n + 1), false)}
            </span>
          </div>
        ), true)}
        <div data-slutar style={{ ...TYP.meta, color: FARG.text2, padding: `0 ${AVSTAND.m}px ${AVSTAND.m}px`, ...radStil(arLang) }}>{slutarText(borjar, langd, innevarandeAr)}</div>

        {arLang && (
          <div data-overenskommelse-krav style={{ ...TYP.meta, color: overenskommen ? FARG.text2 : FARG.orange, padding: `0 ${AVSTAND.m}px ${AVSTAND.m}px` }}>
            {KRAVER_FACKLIG_OVERENSKOMMELSE}
          </div>
        )}
        {arLang && inkapsla("overenskommen", knappRad("overenskommen", "Överenskommen", overenskommen ? kortDatumMedAr(overenskommen) : "—", () => setOppenOverenskommen(o => !o), oppenOverenskommen))}
        {arLang && oppenOverenskommen && (
          <div data-panel="overenskommen" style={{ padding: `${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.m}px`, background: FARG.bg }}>
            <label htmlFor="period-overenskommen" style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Datum då ni kom överens</label>
            <input id="period-overenskommen" type="date" value={overenskommen} onChange={e => setOverenskommen(e.target.value)}
              style={{ width: "100%", minHeight: TRAFFYTA.min, boxSizing: "border-box", background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, padding: `0 ${AVSTAND.m}px`, color: FARG.text, fontFamily: "inherit", outline: "none", ...TYP.text }} />
            {overenskommen && <Tertiar onClick={() => setOverenskommen("")} style={{ marginTop: AVSTAND.xs }}>Ta bort datum</Tertiar>}
          </div>
        )}

        {inkapsla("forare", knappRad("forare", "Förare", forareRadText(val, personer, passar), () => setVy("forare"), false, vardeRef))}
        {inkapsla("anteckning", (
          <label htmlFor="period-anteckning" style={{ ...radInnehall, cursor: "text" }}>
            <span style={etikett}>Anteckning (valfri)</span>
            <input id="period-anteckning" type="text" value={anteckning} onChange={e => setAnteckning(e.target.value)} style={inmatning} />
          </label>
        ), true, anteckningRef)}
      </div>

      <div data-utjamning-status style={{ marginTop: AVSTAND.s }}>
        {antalForare === 0 && <Stod>Välj vilka perioden gäller</Stod>}
        {krockar.length > 0 && <Stod attr={{ "data-krock-varning": "" }}>{krockMening(krockar, fornamn)}</Stod>}
      </div>

      {sparFel && <Besked>{sparFel}</Besked>}
      {nekad && <Besked>{nekad}</Besked>}

      {grupp && (bekrafta === "fraga" ? (
        <div style={{ marginTop: AVSTAND.l }}>
          <Bekrafta text={`Ta bort perioden ${grupp.namn} ${veckoText(grupp)}${raderText(grupp.rader.length)}? Årsövertiden räknas då utan den.`}
            ja="Ja, ta bort" nej="Behåll" onJa={taBort} onNej={() => { setBekrafta(null); setSparFel(null); }} upptagen={upptagen} />
        </div>
      ) : (
        <div style={{ marginTop: AVSTAND.l, display: "flex", justifyContent: "center" }}>
          <Destruktiv smal onClick={tryckTaBort} disabled={bekrafta === "kontrollerar"}>{bekrafta === "kontrollerar" ? "Kontrollerar…" : "Ta bort"}</Destruktiv>
        </div>
      ))}
    </Sheet>
  );
}
