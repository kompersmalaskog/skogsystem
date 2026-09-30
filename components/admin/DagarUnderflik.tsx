"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRödaDagar } from "@/lib/roda-dagar";
import { dagAvvikelser, minText, datumLang } from "@/lib/lonesystem/forarText";
import { TYP, IKON, AVSTAND, FARG, KNAPP, KORT, TRAFFYTA, TNUM, RORELSE, designCss } from "@/lib/design/tokens";

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
 */

type Dag = {
  id: string; datum: string; start_tid: string | null; slut_tid: string | null; rast_min: number | null;
  arbetad_min: number; extra_min: number; objekt: string[]; perioddag: boolean; maskin_id: string | null;
  km_totalt: number; ersattningsmil: number; traktamente: boolean; bekraftad: boolean; ob_min: number;
};
type Medarbetare = {
  medarbetare_id: string; namn: string; dagar: Dag[];
  synk: { datum: string; diff_min: number }[];
  deldagar: { datum: string; typ: string; fran_tid: string | null; till_tid: string | null }[];
  ledighetskollision: { datum: string; typ: string }[];
  vilobrott: { datum: string; typ: string; vila_h: number; krav_h: number }[];
};
type Rad = { nyckel: string; datum: string; namn: string; d: Dag; min: number; avv: string[] };

const arbetsmanadNu = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; };
const stega = (ym: string, delta: number) => { const [å, m] = ym.split("-").map(Number); const d = new Date(å, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
/** Löneperiod = arbetsmånad + 1 (samma regel som /api/lon/min-manad). */
const loneperiodFor = (ym: string) => stega(ym, 1);
const manadLabel = (ym: string) => { const [å, m] = ym.split("-").map(Number); return new Date(å, m - 1, 1).toLocaleDateString("sv-SE", { month: "long", year: "numeric" }); };
const DAG = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

export default function DagarUnderflik() {
  const [arbetsmanad, setArbetsmanad] = useState(arbetsmanadNu());
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
    fetch("/api/fortnox/salary-export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: loneperiodFor(arbetsmanad), dry_run: true }), cache: "no-store",
    })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (avbruten) return;
        if (!r.ok || !j.ok) setFel(j.meddelande || j.error || `Kunde inte räkna månaden (HTTP ${r.status})`);
        else setData({ medarbetare: j.medarbetare || [] });
      })
      .catch(e => { if (!avbruten) setFel(e?.message || String(e)); })
      .finally(() => { if (!avbruten) setLaddar(false); });
    return () => { avbruten = true; };
  }, [arbetsmanad, forsok]);

  const rader: Rad[] = useMemo(() => {
    if (!data) return [];
    const år = Number(arbetsmanad.slice(0, 4));
    const roda = { ...getRödaDagar(år - 1), ...getRödaDagar(år) };
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
  }, [data, arbetsmanad]);

  const antalForare = new Set(rader.map(r => r.namn)).size;
  const medAvv = rader.filter(r => r.avv.length > 0);
  const visade = baraAvv ? medAvv : rader;
  const arNu = arbetsmanad >= arbetsmanadNu();

  return (
    <div style={{ color: FARG.text }}>
      <style>{designCss}</style>
      {/* Månadsväljare — ARBETSMÅNAD (det man kontrollerar), inte löneperiod. */}
      <div style={{ ...KORT, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: AVSTAND.l }}>
        <button onClick={() => setArbetsmanad(stega(arbetsmanad, -1))} aria-label="Föregående månad" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>
        </button>
        <span style={{ ...TYP.listtitel, color: FARG.text, textTransform: "capitalize" }}>{manadLabel(arbetsmanad)}</span>
        <button onClick={() => !arNu && setArbetsmanad(stega(arbetsmanad, 1))} disabled={arNu} aria-label="Nästa månad" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, opacity: arNu ? 0.4 : 1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_right</span>
        </button>
      </div>

      {fel && (
        <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
          <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte räkna månaden: {fel}</p>
          <button onClick={() => setForsok(f => f + 1)} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
        </div>
      )}
      {laddar && !fel && (
        <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
          <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Räknar {manadLabel(arbetsmanad)} ur löneunderlaget…</p>
        </div>
      )}

      {data && !laddar && (
        <>
          {/* Summering + filtret. "Bara avvikelser" är AV som standard: helheten
              först, sedan zooma in. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.m, marginBottom: AVSTAND.l }}>
            <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
              {antalForare} förare · {rader.length} {rader.length === 1 ? "dag" : "dagar"} · <span style={{ color: medAvv.length ? FARG.orange : FARG.text2 }}>{medAvv.length} med avvikelse</span>
            </span>
            <button onClick={() => setBaraAvv(b => !b)} aria-pressed={baraAvv}
              style={{ ...KNAPP.sekundar, width: "auto", flexShrink: 0, whiteSpace: "nowrap", padding: `0 ${AVSTAND.l}px`, background: baraAvv ? FARG.text : KNAPP.sekundar.background, color: baraAvv ? FARG.bg : FARG.text }}>
              Bara avvikelser
            </button>
          </div>

          {rader.length === 0 && (
            <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inga arbetsdagar registrerade i {manadLabel(arbetsmanad)}. Dagar skapas av maskinfilerna och av förarnas perioder.</p></div>
          )}
          {rader.length > 0 && visade.length === 0 && (
            <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inga avvikelser i {manadLabel(arbetsmanad)}.</p></div>
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
                  r.d.extra_min > 0 ? `Maskintid ${minText(r.d.arbetad_min)} + extra tid ${minText(r.d.extra_min)}` : null,
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
          <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text3 }}>
            Samma beräkning som löneunderlaget. Larmen är appens befintliga regler: rast över 60 min, pass över 16 tim, kortpass under 60 min, tidsavvikelse mot maskinen, vilobrott, dag utan maskin eller objekt, ej bekräftad.
          </p>
        </>
      )}
    </div>
  );
}
