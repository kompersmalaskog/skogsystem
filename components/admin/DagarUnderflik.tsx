"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRödaDagar } from "@/lib/roda-dagar";
import { dagAvvikelser, minText, datumLang } from "@/lib/lonesystem/forarText";
import { rastSaknas } from "@/lib/arbetsdagRegler";
import ManadRubrik from "@/components/design/ManadRubrik";
import { laggTillDag, pct, kvotMaskinText, kvotNot, kvotVarde, summaAvKvot, tomKvot, type KvotSumma, type Maskintid } from "@/lib/admin/lonekvot";
import { TYP, IKON, AVSTAND, FARG, KNAPP, KORT, TRAFFYTA, TNUM, RORELSE, designCss } from "@/lib/design/tokens";
import { getPeriodRange, type Period } from "@/app/maskinvy/OversiktShared";
import { useAdminNav } from "./nav";
import { Ikon, Sektion } from "./ui";
import { synkVisas } from "@/lib/admin/loneunderlagVy";

/**
 * Lön → Dagar — KONTROLLVYN. Alla förares dagar för en arbetsmånad, en rad per
 * person och dag, grupperade på datum. Martin skannar efter det som ser fel ut:
 * det normala är tyst grått, avvikelsen står i orange i objektets ställe.
 *
 * ENDA KÄLLAN är samma dry_run som löneunderlaget (/api/fortnox/salary-export)
 * — vyn kan aldrig säga något annat än lönen. Larmen är de regler som redan
 * finns (lib/lonesystem/forarText dagAvvikelser + granskningens listor), i
 * samma ord som förarens spec, så förare och chef säger samma sak.
 *
 * Bara visning. Rättningen sker i förarens Redigera (steg 2, admin öppnar
 * förarens dag, är ett auth-steg för sig — inte här). Byggd mot tokens från
 * början, till skillnad från resten av admin.
 *
 * LÖNEKVOTEN (Martin 2026-10-02): hur mycket av betald tid som blir maskintid,
 * G15 per betald timme — bara här i admin, aldrig i förarens vy. Per dagrad
 * "Maskintid X av Y betald · Z %", per förare och för månaden bara över dagar
 * där maskinen skickar filer, med antalet dagar bredvid. Filfri maskin (810E)
 * = "ingen maskintid rapporteras", aldrig 0 %. Täljaren är G15, inte branschens
 * G0 — docs/lonesystem/lonekvot.md.
 *
 * SAMMANSTÄLLNINGEN PER FÖRARE (betalt · maskin · lönekvot) står ÖVERST och visas
 * alltid — den räknas över ALLA månadens dagar, inte över filtret "bara avvikelser".
 * Uppställningen är lib/admin/lonekvot, densamma som Förare · Månad, så samma
 * förare och månad ger samma tal på båda ställena.
 */

/** Neutral information i dagens detalj när ett långt pass saknar rast: ingen varning, bara hur tiden räknas. */
export const RAST_SAKNAS_INFO = "Inget stopp över 15 min – räknas som arbetstid med måltidsuppehåll (G15)";

/** Larmordet i förarens/avtalets ord; i kontrollvyn säger vi trakt, inte objekt. */
const avvOrd = (a: string) => (a === "utan objekt" ? "ingen trakt" : a === "utan maskin" ? "ingen maskin" : a);


type MaskintidDag = Maskintid & { maskinens_min: number };
type Dag = {
  id: string; datum: string; start_tid: string | null; slut_tid: string | null; rast_min: number | null;
  arbetad_min: number; extra_min: number; objekt: string[]; perioddag: boolean; maskin_id: string | null;
  km_totalt: number; ersattningsmil: number; traktamente: boolean; bekraftad: boolean; ob_min: number;
  /** Lönekvot-underlag ur dry_run (loneunderlag medMaskintid): maskinens G15 under förarens inloggning. */
  maskintid?: MaskintidDag;
};
type Medarbetare = {
  medarbetare_id: string; namn: string; dagar: Dag[];
  synk: { datum: string; diff_min: number }[];
  deldagar: { datum: string; typ: string; fran_tid: string | null; till_tid: string | null }[];
  /** Hemskickade dagar (betald tid, ingen frånvaro): dagen fylls upp till 8 tim som timlön. */
  hemskickad?: { datum: string; fran_tid: string | null; minuter: number }[];
  ledighetskollision: { datum: string; typ: string }[];
  vilobrott: { datum: string; typ: string; vila_h: number; krav_h: number }[];
};
type Rad = { nyckel: string; datum: string; id: string; namn: string; d: Dag; min: number; avv: string[] };

const stega = (ym: string, delta: number) => { const [å, m] = ym.split("-").map(Number); const d = new Date(å, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
/** Löneperiod = arbetsmånad + 1 (samma regel som /api/lon/min-manad). */
const loneperiodFor = (ym: string) => stega(ym, 1);
const DAG = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const idagISO = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

/** PERIODEN: Månad / Kvartal / År som maskinvyn (getPeriodRange). Förvalt är
 *  SENASTE AVSLUTADE period — 2 oktober visar september, inte två dagar av
 *  oktober. För År förvalt innevarande år (fjolåret har ingen data), märkt
 *  "pågår". Lönemotorn räknar per löneperiod, så en period = ett dry_run per
 *  arbetsmånad i spannet, sammanslaget per förare. */
type DagarPeriod = Extract<Period, "M" | "K" | "Å">;
const PERIODER: { key: DagarPeriod; label: string }[] = [{ key: "M", label: "Månad" }, { key: "K", label: "Kvartal" }, { key: "Å", label: "År" }];
const forvaltOffset = (p: DagarPeriod) => (p === "Å" ? 0 : -1);
/** Arbetsmånaderna (YYYY-MM) i spannet, bara till och med innevarande månad. */
function manaderI(start: string, end: string): string[] {
  const ut: string[] = []; const nu = idagISO().slice(0, 7);
  for (let ym = start.slice(0, 7); ym <= end.slice(0, 7) && ym <= nu; ym = stega(ym, 1)) ut.push(ym);
  return ut;
}
/** Arbetsdagar (mån–fre utan röd dag) i spannet: totalt och hittills. */
function arbetsdagarI(start: string, end: string, roda: Record<string, string>): { totalt: number; hittills: number } {
  const idag = idagISO(); let totalt = 0, hittills = 0;
  for (let d = new Date(`${start}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (iso > end) break;
    const wd = d.getDay(); if (wd === 0 || wd === 6 || roda[iso]) continue;
    totalt++; if (iso <= idag) hittills++;
  }
  return { totalt, hittills };
}

/** Tid i en smal tabellcell: "128 tim 10 min" bryts mellan tim och min i stället för mitt i en del. Texten är minText. */
function TidCell({ min }: { min: number }) {
  const m = Math.round(min || 0);
  const delar = m < 60 ? [`${m} min`] : m % 60 ? [`${Math.floor(m / 60)} tim`, `${m % 60} min`] : [`${Math.floor(m / 60)} tim`];
  return <>{delar.map((t, i) => <React.Fragment key={i}>{i > 0 && " "}<span style={{ display: "inline-block" }}>{t}</span></React.Fragment>)}</>;
}

/** Tabellens kolumner: förare, betalt, maskin, lönekvot (+ en pil när raden går att öppna). */
const KOL_BREDD = { betalt: 56, maskin: 56, kvot: 64 } as const;
const kolumner = (oppnabar: boolean) => `minmax(0, 1fr) ${KOL_BREDD.betalt}px ${KOL_BREDD.maskin}px ${KOL_BREDD.kvot}px${oppnabar ? ` ${IKON.text}px` : ""}`;

export default function DagarUnderflik() {
  // Översiktens länk "Se dagarna" öppnar rätt period och bara avvikelserna (?dagper=M&dagoff=-1&avv=1).
  const { nav, gaTill } = useAdminNav();
  const startPeriod: DagarPeriod = nav.params.dagper === "K" || nav.params.dagper === "Å" ? nav.params.dagper : "M";
  const [period, setPeriod] = useState<DagarPeriod>(startPeriod);
  const [offset, setOffset] = useState(/^-?\d+$/.test(nav.params.dagoff || "") ? Number(nav.params.dagoff) : forvaltOffset(startPeriod));
  const range = getPeriodRange(period, offset);
  const pagar = range.end >= idagISO();
  const [data, setData] = useState<{ medarbetare: Medarbetare[] } | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  // Förvalt: bara avvikelserna (svaret först). "Visa alla" är ett val man gör; ?avv=0 öppnar med alla.
  const [baraAvv, setBaraAvv] = useState(nav.params.avv !== "0");
  const [oppen, setOppen] = useState<string | null>(null);
  const [maskinNamn, setMaskinNamn] = useState<Record<string, string>>({});
  const [forsok, setForsok] = useState(0);

  useEffect(() => {
    supabase.from("dim_maskin").select("maskin_id, visningsnamn, modell").then(({ data }) => {
      const m: Record<string, string> = {};
      for (const r of data || []) m[r.maskin_id] = r.visningsnamn || r.modell || r.maskin_id;
      setMaskinNamn(m);
    });
  }, []);

  useEffect(() => {
    let avbruten = false;
    setLaddar(true); setFel(null); setData(null); setOppen(null);
    // Ett dry_run per arbetsmånad i spannet (lönemotorn räknar per löneperiod),
    // sammanslaget per förare. Ett fel i någon månad är ett fel för hela perioden.
    const manader = manaderI(range.start, range.end);
    Promise.all(manader.map(ym =>
      fetch("/api/fortnox/salary-export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: loneperiodFor(ym), dry_run: true }), cache: "no-store",
      }).then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.meddelande || j.error || `Kunde inte räkna ${ym} (HTTP ${r.status})`);
        return (j.medarbetare || []) as Medarbetare[];
      }),
    ))
      .then(svar => {
        if (avbruten) return;
        const per = new Map<string, Medarbetare>();
        for (const lista of svar) for (const m of lista) {
          const s = per.get(m.medarbetare_id);
          if (!s) { per.set(m.medarbetare_id, { ...m, dagar: [...(m.dagar || [])], synk: [...(m.synk || [])], deldagar: [...(m.deldagar || [])], hemskickad: [...(m.hemskickad || [])], ledighetskollision: [...(m.ledighetskollision || [])], vilobrott: [...(m.vilobrott || [])] }); continue; }
          s.dagar.push(...(m.dagar || [])); s.synk.push(...(m.synk || [])); s.deldagar.push(...(m.deldagar || [])); (s.hemskickad ||= []).push(...(m.hemskickad || []));
          s.ledighetskollision.push(...(m.ledighetskollision || [])); s.vilobrott.push(...(m.vilobrott || []));
        }
        setData({ medarbetare: Array.from(per.values()) });
      })
      .catch(e => { if (!avbruten) setFel(e?.message || String(e)); })
      .finally(() => { if (!avbruten) setLaddar(false); });
    return () => { avbruten = true; };
  }, [range.start, range.end, forsok]);

  const roda = useMemo(() => {
    const å0 = Number(range.start.slice(0, 4)), å1 = Number(range.end.slice(0, 4));
    return { ...getRödaDagar(å0 - 1), ...getRödaDagar(å0), ...getRödaDagar(å1) };
  }, [range.start, range.end]);
  const arbetsdagar = useMemo(() => arbetsdagarI(range.start, range.end, roda), [range.start, range.end, roda]);

  const rader: Rad[] = useMemo(() => {
    if (!data) return [];
    const ut: Rad[] = [];
    for (const m of data.medarbetare) {
      const synk = new Map((m.synk || []).filter(s => synkVisas(s.diff_min)).map(s => [s.datum, s.diff_min]));
      // Hemskickad är en deldag som betalas (ingen frånvaro): dagens rad säger "hemskickad 2:00 – betalas" (dagAvvikelser).
      const deldag = new Map([...(m.deldagar || []), ...(m.hemskickad || []).map(h => ({ datum: h.datum, typ: "hemskickad", fran_tid: h.fran_tid, till_tid: null }))].map(x => [x.datum, x]));
      const ledig = new Map((m.ledighetskollision || []).map(x => [x.datum, x.typ]));
      for (const d of m.dagar || []) {
        const min = (d.arbetad_min || 0) + (d.extra_min || 0);
        const avv = dagAvvikelser(d, {
          rodaDagar: roda, deldag: deldag.get(d.datum) || null, ledig: ledig.get(d.datum) || null,
          synkMin: synk.get(d.datum) || null, vilobrott: (m.vilobrott || []).filter(v => v.datum === d.datum), kontroll: true,
        });
        // En rad utan någon tid alls är också något att titta på (tom skalrad).
        if (min === 0) avv.unshift("ingen tid");
        ut.push({ nyckel: `${m.medarbetare_id}|${d.datum}`, datum: d.datum, id: m.medarbetare_id, namn: m.namn, d, min, avv });
      }
    }
    return ut.sort((a, b) => a.datum.localeCompare(b.datum) || a.namn.localeCompare(b.namn, "sv"));
  }, [data, roda]);

  const antalForare = new Set(rader.map(r => r.namn)).size;
  const medAvv = rader.filter(r => r.avv.length > 0);
  const visade = baraAvv ? medAvv : rader;
  const arNu = offset >= 0;
  const periodLabel = range.label;

  // SAMMANSTÄLLNINGEN räknas över ALLA månadens rader — aldrig över filtret "bara avvikelser" (den ska visas alltid och
  // vara samma tal vare sig man tittar på 3 dagar eller 111). Varje rad är hela minuter, summan
  // sedan — så den går att räkna efter för hand. "Dagar" = rader med tid; tomma skalrader räknas som rader men inte
  // som dagar. (Km visas inte här: tabellen svarar på lönekvoten; milen finns i Förare · Månad.) Lönekvoten räknas bara över dagar där maskinen skickar filer (lib/admin/lonekvot).
  const summa = useMemo(() => {
    const perForare = new Map<string, { id: string; namn: string; obekr: number; kvot: KvotSumma }>();
    for (const r of rader) {
      const s = perForare.get(r.id) || { id: r.id, namn: r.namn, obekr: 0, kvot: tomKvot() };
      if (!r.d.bekraftad) s.obekr++;
      laggTillDag(s.kvot, r.min, r.d.maskintid);
      perForare.set(r.id, s);
    }
    const lista = Array.from(perForare.values()).sort((a, b) => b.kvot.min - a.kvot.min);
    return {
      lista,
      kvot: summaAvKvot(lista.map(f => f.kvot)),
      obekr: lista.reduce((t, f) => t + f.obekr, 0),
    };
  }, [rader]);
  // Förare · Månad finns för arbetsmånader vars löneunderlag går att läsa (löneperioden, arbetsmånad + 1, är inte i framtiden) och
  // bara för EN månad — en rad över ett kvartal eller ett år har ingen enskild månad att öppna.
  const manadAttOppna = period === "M" && loneperiodFor(range.start.slice(0, 7)) <= idagISO().slice(0, 7);
  // Dagarnas läge (period, månad, filter) följer med i adressen, så "tillbaka" från Förare · Månad landar i samma Dagar.
  const oppnaForare = (id: string) => gaTill({ flik: "lon", underflik: "underlag", params: {
    period: loneperiodFor(range.start.slice(0, 7)), forare: id,
    dagper: period, dagoff: String(offset), avv: baraAvv ? "1" : "0",
  } });

  return (
    <div style={{ color: FARG.text }}>
      <style>{designCss}</style>
      {/* Periodväljare — ARBETSPERIOD (det man kontrollerar), inte löneperiod.
          Samma mönster som maskinvyn: Månad / Kvartal / År + ‹ ›. Förvalt senaste
          avslutade period; en pågående period märks under rubriken. */}
      <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
        <div style={{ display: "flex", background: FARG.linje, borderRadius: 10, padding: AVSTAND.xs, marginBottom: AVSTAND.s }}>
          {PERIODER.map(p => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setOffset(forvaltOffset(p.key)); }} aria-pressed={period === p.key}
              style={{ flex: 1, minHeight: 36, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", ...TYP.meta, background: period === p.key ? FARG.fyllning : "transparent", color: period === p.key ? FARG.text : FARG.text2 }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => setOffset(o => o - 1)} aria-label="Föregående period" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>
          </button>
          <div style={{ textAlign: "center" }}>
            {/* Arbetsmånaden är namnet, vilken månad lönen kommer står bredvid (bara för en månad). */}
            <div style={{ ...TYP.listtitel, ...TNUM, color: FARG.text, textTransform: period === "M" ? "none" : "capitalize" }}>
              {period === "M" ? <ManadRubrik arbetsManad={range.start.slice(0, 7)} /> : periodLabel}
            </div>
          </div>
          <button onClick={() => !arNu && setOffset(o => o + 1)} disabled={arNu} aria-label="Nästa period" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, opacity: arNu ? 0.4 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_right</span>
          </button>
        </div>
        {/* Pågående period: talen är inte jämförbara med en avslutad. Dämpat, inte larm. */}
        {pagar && (
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2, textAlign: "center" }}>
            {periodLabel} pågår · {arbetsdagar.hittills} av {arbetsdagar.totalt} arbetsdagar
          </p>
        )}
      </div>

      {fel && (
        <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
          <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte räkna perioden: {fel}</p>
          <button onClick={() => setForsok(f => f + 1)} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
        </div>
      )}
      {laddar && !fel && (
        <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
          <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Räknar {periodLabel} ur löneunderlaget…</p>
        </div>
      )}

      {data && !laddar && (
        <>
          {/* SAMMANSTÄLLNINGEN PER FÖRARE — överst och alltid synlig, räknad över ALLA månadens dagar (inte över filtret). En rad
              per förare: Betalt · Maskin · Lönekvot, "Alla" sist. Utan maskinfiler "–", under 5 fildagar "för få dagar", aldrig 0 %.
              Ett tryck öppnar Förare · Månad för föraren (bara för en månad vars löneunderlag går att läsa). */}
          {rader.length > 0 && (
            <div data-lonekvot-tabell="" style={{ marginBottom: AVSTAND.l }}>
              <Sektion topp={0}>{`Förare · ${periodLabel}${pagar ? " · pågår" : ""}`}</Sektion>
              <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: kolumner(manadAttOppna), columnGap: AVSTAND.xs, alignItems: "end", padding: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, borderBottom: `1px solid ${FARG.linje}`, ...TYP.micro, color: FARG.text2 }}>
                  <span>Förare</span><span style={{ textAlign: "right" }}>Betalt</span><span style={{ textAlign: "right" }}>Maskin</span><span style={{ textAlign: "right" }}>Lönekvot</span>
                  {manadAttOppna && <span />}
                </div>
                {summa.lista.map(f => {
                  const not = kvotNot(f.kvot);
                  const innehall = (
                    <>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", ...TYP.text, color: FARG.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.namn.split(" ")[0]}</span>
                        <span style={{ display: "block", ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                          {f.kvot.dagar} {f.kvot.dagar === 1 ? "dag" : "dagar"}{f.obekr ? <span style={{ color: FARG.orange }}> · {f.obekr} obekr.</span> : null}
                        </span>
                      </span>
                      <span style={{ textAlign: "right", ...TYP.meta, ...TNUM, color: FARG.text }}><TidCell min={f.kvot.min} /></span>
                      <span style={{ textAlign: "right", ...TYP.meta, ...TNUM, color: FARG.text }}>{f.kvot.kvotDagar > 0 ? <TidCell min={f.kvot.kvotMaskin} /> : kvotMaskinText(f.kvot)}</span>
                      <span data-kvot-varde="" style={{ textAlign: "right", ...TYP.listtitel, ...TNUM, color: FARG.text }}>{kvotVarde(f.kvot)}</span>
                      {manadAttOppna && <Ikon namn="chevron_right" farg={FARG.text3} />}
                    </>
                  );
                  const rad: React.CSSProperties = { display: "grid", gridTemplateColumns: kolumner(manadAttOppna), columnGap: AVSTAND.xs, alignItems: "center", width: "100%", minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, background: "none", border: "none", fontFamily: "inherit", textAlign: "left", color: "inherit" };
                  return (
                    <div key={f.id} style={{ borderBottom: `1px solid ${FARG.linje}` }}>
                      {manadAttOppna
                        ? <button type="button" data-kvot-rad={f.id} onClick={() => oppnaForare(f.id)} style={{ ...rad, cursor: "pointer" }}>{innehall}</button>
                        : <div data-kvot-rad={f.id} style={rad}>{innehall}</div>}
                      {not && <p style={{ margin: 0, paddingBottom: AVSTAND.s, ...TYP.meta, color: FARG.text3 }}>{not}</p>}
                    </div>
                  );
                })}
                <div data-kvot-alla="" style={{ display: "grid", gridTemplateColumns: kolumner(manadAttOppna), columnGap: AVSTAND.xs, alignItems: "center", minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", ...TYP.listtitel, color: FARG.text }}>Alla</span>
                    <span style={{ display: "block", ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                      {summa.kvot.dagar} {summa.kvot.dagar === 1 ? "dag" : "dagar"}{summa.obekr ? <span style={{ color: FARG.orange }}> · {summa.obekr} obekr.</span> : null}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", ...TYP.meta, ...TNUM, color: FARG.text, fontWeight: TYP.listtitel.fontWeight }}><TidCell min={summa.kvot.min} /></span>
                  <span style={{ textAlign: "right", ...TYP.meta, ...TNUM, color: FARG.text, fontWeight: TYP.listtitel.fontWeight }}>{summa.kvot.kvotDagar > 0 ? <TidCell min={summa.kvot.kvotMaskin} /> : kvotMaskinText(summa.kvot)}</span>
                  <span data-kvot-varde="" style={{ textAlign: "right", ...TYP.listtitel, ...TNUM, color: FARG.text }}>{kvotVarde(summa.kvot)}</span>
                  {manadAttOppna && <span />}
                </div>
              </div>
              {summa.kvot.kvotDagar > 0 && (
                <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>
                  Lönekvot = maskinens G15 under förarens inloggning delat med betald tid, över dagar med maskinfiler. Mäter verksamheten, inte föraren.
                </p>
              )}
            </div>
          )}

          {/* Svaret först: hur många dagar som avviker. "Bara avvikelser" är förvalt; alla dagar ligger bakom "Visa alla". */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, marginBottom: AVSTAND.l }}>
            <span style={{ ...TYP.meta, ...TNUM, color: medAvv.length ? FARG.orange : FARG.text2 }}>
              {baraAvv
                ? `${medAvv.length} ${medAvv.length === 1 ? "dag" : "dagar"} med avvikelse`
                : `${antalForare} förare · ${rader.length} ${rader.length === 1 ? "rad" : "rader"} · ${medAvv.length} med avvikelse`}
            </span>
            {!baraAvv && (
              <button onClick={() => setBaraAvv(true)} aria-pressed={false}
                style={{ ...KNAPP.sekundar, width: "auto", flexShrink: 0, whiteSpace: "nowrap", padding: `0 ${AVSTAND.l}px` }}>
                Bara avvikelser
              </button>
            )}
          </div>

          {rader.length === 0 && (
            <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inga arbetsdagar registrerade i {periodLabel}. Dagar skapas av maskinfilerna och av förarnas perioder.</p></div>
          )}
          {rader.length > 0 && visade.length === 0 && (
            <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inga avvikelser i {periodLabel}.</p></div>
          )}

          {visade.length > 0 && (
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
              {visade.map((r, i) => {
                const nyttDatum = i === 0 || visade[i - 1].datum !== r.datum;
                const dt = new Date(`${r.datum}T12:00:00`);
                const ärOppen = oppen === r.nyckel;
                const objekt = r.d.objekt.join(", ");
                const detaljer = [
                  r.d.maskin_id ? `Maskin ${maskinNamn[r.d.maskin_id] || r.d.maskin_id}` : (r.d.perioddag ? "Perioddag, ingen maskin" : "Ingen maskin"),
                  r.d.start_tid || r.d.slut_tid
                    ? `${(r.d.start_tid || "").slice(0, 5) || "–"}–${(r.d.slut_tid || "").slice(0, 5) || "–"}${r.d.rast_min ? ` · rast ${minText(r.d.rast_min)}` : ""}`
                    : "Inga klockslag, tiden ligger i perioder",
                  // Rast noll på ett långt pass är ingen varning (skotarna loggar ingen rast): bara information om hur tiden räknas.
                  rastSaknas(r.d.arbetad_min, r.d.rast_min) ? RAST_SAKNAS_INFO : null,
                  r.d.extra_min > 0 ? `Betald ${minText(r.d.arbetad_min)} vid maskinen + extra tid ${minText(r.d.extra_min)}` : null,
                  // Lönekvot per dag: maskinens G15 under förarens inloggning mot betald tid.
                  r.d.maskintid?.kalla === "fil" && r.min > 0
                    ? (r.d.maskintid.min > 0
                        ? `Maskintid ${minText(r.d.maskintid.min)} av ${minText(r.min)} betald · ${pct(r.d.maskintid.min, r.min)} %`
                        : (r.d.maskintid.maskinens_min > 0
                            ? `Ingen maskintid på förarens inloggning — maskinen gick ${minText(r.d.maskintid.maskinens_min)} under annan inloggning`
                            : "Ingen maskintid den dagen"))
                    : r.d.maskintid?.kalla === "ingen_fil" ? "Maskinen rapporterar ingen maskintid (skickar inga filer)" : null,
                  objekt ? `Trakt: ${objekt}` : "Ingen trakt",
                  r.d.km_totalt ? `${Math.round(r.d.km_totalt)} km${r.d.ersattningsmil ? ` · ${r.d.ersattningsmil} mil reseersättning` : ""}` : null,
                  r.d.ob_min > 0 ? `OB ${minText(r.d.ob_min)}` : null,
                  r.d.traktamente ? "Traktamente" : null,
                  r.d.bekraftad ? "Bekräftad av föraren" : "Inte bekräftad",
                ].filter(Boolean) as string[];
                return (
                  <React.Fragment key={r.nyckel}>
                    {nyttDatum && (
                      <p style={{ margin: 0, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xs, ...TYP.micro, color: FARG.text2 }}>
                        {DAG[dt.getDay()]} {datumLang(r.datum)}
                      </p>
                    )}
                    <div style={{ borderBottom: `1px solid ${FARG.linje}` }}>
                      <button type="button" onClick={() => setOppen(ärOppen ? null : r.nyckel)} aria-expanded={ärOppen}
                        style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", ...TYP.text, color: FARG.text, whiteSpace: "nowrap" }}>{r.namn.split(" ")[0]}</span>
                          <span style={{ display: "block", ...TYP.meta, color: r.avv.length ? FARG.orange : FARG.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.avv.length ? r.avv.map(avvOrd).join(" · ") : (objekt || "—")}
                          </span>
                        </span>
                        <span style={{ ...TYP.text, ...TNUM, color: FARG.text, whiteSpace: "nowrap" }}>{minText(r.min)}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3, transform: ärOppen ? "rotate(90deg)" : "none", transition: `transform ${RORELSE.byte}ms ${RORELSE.kurva}` }}>chevron_right</span>
                      </button>
                      {ärOppen && (
                        <div className="tona-in" style={{ paddingBottom: AVSTAND.m }}>
                          {r.avv.length > 0 && <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.orange }}>{r.avv.map(avvOrd).join(" · ")}</p>}
                          {detaljer.map((t, j) => <p key={j} style={{ margin: j ? `${AVSTAND.xs}px 0 0` : 0, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{t}</p>)}
                          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Rättas av {r.namn.split(" ")[0]} i Redigera.</p>
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              <div style={{ height: AVSTAND.s }} />
            </div>
          )}

          {baraAvv && rader.length > visade.length && (
            <button onClick={() => setBaraAvv(false)} data-visa-alla=""
              style={{ ...KNAPP.sekundar, marginTop: AVSTAND.l }}>
              Visa alla {rader.length}
            </button>
          )}

        </>
      )}
    </div>
  );
}
