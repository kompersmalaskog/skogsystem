"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRödaDagar } from "@/lib/roda-dagar";
import { dagAvvikelser, minText, datumLang } from "@/lib/lonesystem/forarText";
import { TYP, IKON, AVSTAND, FARG, KNAPP, KORT, TRAFFYTA, TNUM, RORELSE, designCss } from "@/lib/design/tokens";
import { getPeriodRange, type Period } from "@/app/maskinvy/OversiktShared";

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
 */

const pct = (taljareMin: number, namnareMin: number) => namnareMin > 0 ? Math.round((taljareMin / namnareMin) * 100) : null;

/** Under så här många fil-dagar visas ingen lönekvot per förare — "för få dagar"
 *  i stället för 66 % som bara är en dag (Martin 2026-10-02: en pågående
 *  period ser annars färdig ut). Samma resonemang som TU:s JAMFOR_MIN_DAGAR. */
const KVOT_MIN_DAGAR = 5;

type Maskintid = { min: number; kalla: "fil" | "ingen_fil" | "ingen_maskin"; maskinens_min: number };
type Dag = {
  id: string; datum: string; start_tid: string | null; slut_tid: string | null; rast_min: number | null;
  arbetad_min: number; extra_min: number; objekt: string[]; perioddag: boolean; maskin_id: string | null;
  km_totalt: number; ersattningsmil: number; traktamente: boolean; bekraftad: boolean; ob_min: number;
  /** Lönekvot-underlag ur dry_run (loneunderlag medMaskintid): maskinens G15 under förarens inloggning. */
  maskintid?: Maskintid;
};
type Medarbetare = {
  medarbetare_id: string; namn: string; dagar: Dag[];
  synk: { datum: string; diff_min: number }[];
  deldagar: { datum: string; typ: string; fran_tid: string | null; till_tid: string | null }[];
  ledighetskollision: { datum: string; typ: string }[];
  vilobrott: { datum: string; typ: string; vila_h: number; krav_h: number }[];
};
type Rad = { nyckel: string; datum: string; namn: string; d: Dag; min: number; avv: string[] };

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

export default function DagarUnderflik() {
  const [period, setPeriod] = useState<DagarPeriod>("M");
  const [offset, setOffset] = useState(forvaltOffset("M"));
  const range = getPeriodRange(period, offset);
  const pagar = range.end >= idagISO();
  const [data, setData] = useState<{ medarbetare: Medarbetare[] } | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [baraAvv, setBaraAvv] = useState(false);
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
          if (!s) { per.set(m.medarbetare_id, { ...m, dagar: [...(m.dagar || [])], synk: [...(m.synk || [])], deldagar: [...(m.deldagar || [])], ledighetskollision: [...(m.ledighetskollision || [])], vilobrott: [...(m.vilobrott || [])] }); continue; }
          s.dagar.push(...(m.dagar || [])); s.synk.push(...(m.synk || [])); s.deldagar.push(...(m.deldagar || []));
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
      const synk = new Map((m.synk || []).map(s => [s.datum, s.diff_min]));
      const deldag = new Map((m.deldagar || []).map(x => [x.datum, x]));
      const ledig = new Map((m.ledighetskollision || []).map(x => [x.datum, x.typ]));
      for (const d of m.dagar || []) {
        const min = (d.arbetad_min || 0) + (d.extra_min || 0);
        const avv = dagAvvikelser(d, {
          rodaDagar: roda, deldag: deldag.get(d.datum) || null, ledig: ledig.get(d.datum) || null,
          synkMin: synk.get(d.datum) || null, vilobrott: (m.vilobrott || []).filter(v => v.datum === d.datum), kontroll: true,
        });
        // En rad utan någon tid alls är också något att titta på (tom skalrad).
        if (min === 0) avv.unshift("ingen tid");
        ut.push({ nyckel: `${m.medarbetare_id}|${d.datum}`, datum: d.datum, namn: m.namn, d, min, avv });
      }
    }
    return ut.sort((a, b) => a.datum.localeCompare(b.datum) || a.namn.localeCompare(b.namn, "sv"));
  }, [data, roda]);

  const antalForare = new Set(rader.map(r => r.namn)).size;
  const medAvv = rader.filter(r => r.avv.length > 0);
  const visade = baraAvv ? medAvv : rader;
  const arNu = offset >= 0;
  const periodLabel = range.label;

  // SUMMERINGEN räknas ur SAMMA rader som listan visar — filtret påverkar den,
  // annars säger den emot listan. Varje rad avrundas först (hela minuter, hela
  // km), summan sedan — så den går att räkna efter för hand. "Dagar" = rader
  // med tid; tomma skalrader räknas som rader men inte som dagar.
  // Lönekvoten räknas BARA över dagar där maskinen skickar filer (kalla 'fil'):
  // kvotDagar/kvotBetald/kvotMaskin. Filfria och maskinlösa dagar står utanför
  // — hellre ett ärligt tal med antalet dagar bredvid än ett som ljuger.
  const summa = useMemo(() => {
    const perForare = new Map<string, { namn: string; dagar: number; min: number; km: number; obekr: number; kvotDagar: number; kvotBetald: number; kvotMaskin: number; utanMaskintid: number }>();
    for (const r of visade) {
      const s = perForare.get(r.namn) || { namn: r.namn, dagar: 0, min: 0, km: 0, obekr: 0, kvotDagar: 0, kvotBetald: 0, kvotMaskin: 0, utanMaskintid: 0 };
      if (r.min > 0) s.dagar++;
      s.min += r.min;
      s.km += Math.round(r.d.km_totalt || 0);
      if (!r.d.bekraftad) s.obekr++;
      const mt = r.d.maskintid;
      if (mt && mt.kalla === "fil" && r.min > 0) {
        s.kvotDagar++; s.kvotBetald += r.min; s.kvotMaskin += mt.min;
        if (mt.min === 0) s.utanMaskintid++;
      }
      perForare.set(r.namn, s);
    }
    const lista = Array.from(perForare.values()).sort((a, b) => b.min - a.min);
    const tot = lista.reduce((t, s) => ({
      dagar: t.dagar + s.dagar, min: t.min + s.min, km: t.km + s.km, obekr: t.obekr + s.obekr,
      kvotDagar: t.kvotDagar + s.kvotDagar, kvotBetald: t.kvotBetald + s.kvotBetald, kvotMaskin: t.kvotMaskin + s.kvotMaskin, utanMaskintid: t.utanMaskintid + s.utanMaskintid,
    }), { dagar: 0, min: 0, km: 0, obekr: 0, kvotDagar: 0, kvotBetald: 0, kvotMaskin: 0, utanMaskintid: 0 });
    return { lista, ...tot };
  }, [visade]);

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
          <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text, textTransform: "capitalize" }}>{periodLabel}</span>
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
          {/* Summering + filtret. "Bara avvikelser" är AV som standard: helheten
              först, sedan zooma in. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, marginBottom: AVSTAND.l }}>
            <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
              {antalForare} förare · {rader.length} {rader.length === 1 ? "rad" : "rader"} · <span style={{ color: medAvv.length ? FARG.orange : FARG.text2 }}>{medAvv.length} med avvikelse</span>
            </span>
            <button onClick={() => setBaraAvv(b => !b)} aria-pressed={baraAvv}
              style={{ ...KNAPP.sekundar, width: "auto", flexShrink: 0, whiteSpace: "nowrap", padding: `0 ${AVSTAND.l}px`, background: baraAvv ? FARG.text : KNAPP.sekundar.background, color: baraAvv ? FARG.bg : FARG.text }}>
              Bara avvikelser
            </button>
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
                    ? `${(r.d.start_tid || "").slice(0, 5) || "–"}–${(r.d.slut_tid || "").slice(0, 5) || "–"}${r.d.rast_min ? ` · rast ${minText(r.d.rast_min)}` : " · ingen rast"}`
                    : "Inga klockslag, tiden ligger i perioder",
                  r.d.extra_min > 0 ? `Betald ${minText(r.d.arbetad_min)} vid maskinen + extra tid ${minText(r.d.extra_min)}` : null,
                  // Lönekvot per dag: maskinens G15 under förarens inloggning mot betald tid.
                  r.d.maskintid?.kalla === "fil" && r.min > 0
                    ? (r.d.maskintid.min > 0
                        ? `Maskintid ${minText(r.d.maskintid.min)} av ${minText(r.min)} betald · ${pct(r.d.maskintid.min, r.min)} %`
                        : (r.d.maskintid.maskinens_min > 0
                            ? `Ingen maskintid på förarens inloggning — maskinen gick ${minText(r.d.maskintid.maskinens_min)} under annan inloggning`
                            : "Ingen maskintid den dagen"))
                    : r.d.maskintid?.kalla === "ingen_fil" ? "Maskinen rapporterar ingen maskintid (skickar inga filer)" : null,
                  objekt ? `Objekt: ${objekt}` : "Inget objekt",
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
                        <span style={{ ...TYP.text, color: FARG.text, whiteSpace: "nowrap" }}>{r.namn.split(" ")[0]}</span>
                        <span style={{ flex: 1, minWidth: 0, ...TYP.meta, color: r.avv.length ? FARG.orange : FARG.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.avv.length ? r.avv.join(" · ") : (objekt || "—")}
                        </span>
                        <span style={{ ...TYP.text, ...TNUM, color: FARG.text, whiteSpace: "nowrap" }}>{minText(r.min)}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3, transform: ärOppen ? "rotate(90deg)" : "none", transition: `transform ${RORELSE.byte}ms ${RORELSE.kurva}` }}>chevron_right</span>
                      </button>
                      {ärOppen && (
                        <div className="tona-in" style={{ paddingBottom: AVSTAND.m }}>
                          {r.avv.length > 0 && <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.orange }}>{r.avv.join(" · ")}</p>}
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

          {/* SUMMERINGEN längst ner, som förarens Dag för dag. Per förare först
              ("vem jobbade mest" utan att räkna), månaden sist som huvudtal. */}
          {visade.length > 0 && (
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.l }}>
              <p style={{ margin: 0, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xs, ...TYP.micro, color: FARG.text2 }}>
                {baraAvv ? "Summering av avvikelserna" : `Summering ${periodLabel}`}{pagar ? " · pågår" : ""}
              </p>
              {summa.lista.map(s => (
                <div key={s.namn} style={{ borderBottom: `1px solid ${FARG.linje}`, padding: `${AVSTAND.s}px 0` }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: AVSTAND.m, minHeight: TRAFFYTA.min - AVSTAND.l }}>
                    <span style={{ flex: 1, minWidth: 0, ...TYP.text, color: FARG.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.namn.split(" ")[0]}</span>
                    <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, whiteSpace: "nowrap" }}>{s.dagar} {s.dagar === 1 ? "dag" : "dagar"} · {s.km.toLocaleString("sv-SE")} km{s.obekr ? <span style={{ color: FARG.orange }}> · {s.obekr} obekr.</span> : null}</span>
                    <span style={{ ...TYP.text, ...TNUM, color: FARG.text, whiteSpace: "nowrap" }}>{minText(s.min)}</span>
                  </div>
                  {/* Lönekvot per förare — bara över dagar med filmaskin, antalet dagar bredvid. */}
                  <p style={{ margin: 0, ...TYP.meta, ...TNUM, color: FARG.text3 }}>
                    {s.kvotDagar >= KVOT_MIN_DAGAR
                      ? `Lönekvot ${pct(s.kvotMaskin, s.kvotBetald)} % · maskintid ${minText(s.kvotMaskin)} av ${minText(s.kvotBetald)} betald på ${s.kvotDagar} dagar${s.utanMaskintid ? ` · ${s.utanMaskintid} utan maskintid` : ""}`
                      : s.kvotDagar > 0
                        ? `För få dagar för en lönekvot — ${s.kvotDagar} ${s.kvotDagar === 1 ? "dag" : "dagar"} med maskin som skickar filer (minst ${KVOT_MIN_DAGAR})`
                        : "Ingen lönekvot — ingen dag med maskin som skickar filer"}
                  </p>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "baseline", gap: AVSTAND.m, padding: `${AVSTAND.m}px 0 0` }}>
                <span style={{ flex: 1, ...TYP.listtitel, ...TNUM, color: FARG.text }}>{summa.dagar} {summa.dagar === 1 ? "dag" : "dagar"} · {summa.km.toLocaleString("sv-SE")} km</span>
                <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text, whiteSpace: "nowrap" }}>{minText(summa.min)}</span>
              </div>
              {/* Månadens lönekvot: aldrig ett tal som blandar in filfria maskiner.
                  Visas bara över dagar där båda källorna finns, med antalet dagar. */}
              <p style={{ margin: 0, padding: `${AVSTAND.xs}px 0 ${AVSTAND.m}px`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                {summa.kvotDagar >= KVOT_MIN_DAGAR
                  ? `Lönekvot ${pct(summa.kvotMaskin, summa.kvotBetald)} % — maskintid ${minText(summa.kvotMaskin)} av ${minText(summa.kvotBetald)} betald, på de ${summa.kvotDagar} dagar där maskinen skickar filer${pagar ? ` · ${periodLabel} pågår, ${arbetsdagar.hittills} av ${arbetsdagar.totalt} arbetsdagar` : ""}`
                  : summa.kvotDagar > 0
                    ? `För få dagar för en lönekvot — ${summa.kvotDagar} ${summa.kvotDagar === 1 ? "dag" : "dagar"} med maskin som skickar filer (minst ${KVOT_MIN_DAGAR})`
                    : "Lönekvot kan inte räknas — ingen dag med maskin som skickar filer"}
              </p>
              {summa.obekr > 0 && (
                <p style={{ margin: 0, paddingBottom: AVSTAND.m, ...TYP.meta, color: FARG.orange }}>{summa.obekr} {summa.obekr === 1 ? "dag är inte bekräftad" : "dagar är inte bekräftade"}</p>
              )}
            </div>
          )}
          <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text3 }}>
            Samma beräkning som löneunderlaget. Larmen är appens befintliga regler: rast över 60 min, pass över 16 tim, kortpass under 60 min, tidsavvikelse mot maskinen, vilobrott, dag utan maskin eller objekt, ej bekräftad.
            Lönekvot = maskinens G15 under förarens inloggning delat med betald tid, bara på dagar där maskinen skickar filer. Mäter verksamheten, inte föraren — flytt, service och väntan ligger utanför förarens kontroll.
          </p>
        </>
      )}
    </div>
  );
}
