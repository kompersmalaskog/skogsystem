"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAll, getPeriodRange, type Period } from "@/app/maskinvy/OversiktShared";
import { useMaskinvyMaskiner } from "@/app/maskinvy/useMaskinvyMaskiner";
import { FLYTT_KATEGORI } from "@/lib/avbrott-kategorier";
import { G15_GRANS_SEK, tuProcent, TU_BRANSCHSNITT } from "@/lib/g15";
import { dagAvvikelser, minText } from "@/lib/lonesystem/forarText";
import { getRödaDagar } from "@/lib/roda-dagar";
import { TYP, IKON, AVSTAND, FARG, KNAPP, KORT, TRAFFYTA, TNUM, designCss } from "@/lib/design/tokens";

/**
 * TU — alla maskiner bredvid varandra (Jämförelse-fliken i /maskinvy?ny=1).
 * Skördare OCH skotare i samma tabell — det Martin bad om; övriga jämförelser
 * i vyn visar bara två skotare.
 *
 * TU = (G15 + avbrott < 15 min) / (G15 + avbrott), Skogforsk, lib/g15.ts.
 * SAMMA KÄLLOR som resten av vyn: fakt_tid (G15) och fakt_avbrott (avbrott,
 * som Avbrott-fliken) via maskinvyns RPC:er — aldrig fakt_tid:s DOWN-hinkar.
 * Flytt (Trailer transportation) ingår inte.
 *
 * TILLFÖRLITLIGHETSRADEN knyter an till Lön → Dagar: hur många av maskinens
 * förardagar (arbetsdag) som har en avvikelse enligt samma regler. TU räknas
 * aldrig ur arbetsdag — två källor, kopplade genom en varning, inte blandade.
 */

type Agg = { g15: number; avbr: number; korta: number; dagar: Set<string> };
type Rad = { id: string; namn: string; slag: "skordare" | "skotare"; tu: number | null; tuPrev: number | null; g15: number; avbr: number; korta: number; dagar: number };

const tim = (sek: number) => `${Math.round(sek / 3600).toLocaleString("sv-SE")} tim`;
const pct = (v: number | null) => v == null ? "–" : v.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PERIODER: { key: Period; label: string }[] = [{ key: "M", label: "Månad" }, { key: "K", label: "Kvartal" }, { key: "Å", label: "År" }];

function summera(tid: any[], avbr: any[]): Map<string, Agg> {
  const m = new Map<string, Agg>();
  const hamta = (id: string) => { const a = m.get(id) || { g15: 0, avbr: 0, korta: 0, dagar: new Set<string>() }; m.set(id, a); return a; };
  for (const r of tid) {
    const a = hamta(r.maskin_id);
    a.g15 += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
    if (r.datum) a.dagar.add(r.datum);
  }
  for (const r of avbr) {
    if (r.kategori_kod === FLYTT_KATEGORI) continue;
    const a = hamta(r.maskin_id);
    const sek = r.langd_sek || 0;
    a.avbr += sek;
    if (sek < G15_GRANS_SEK) a.korta += sek;
  }
  return m;
}

export default function TuTabell() {
  const [period, setPeriod] = useState<Period>("M");
  const [offset, setOffset] = useState(0);
  const { maskiner: skordare, laddar: lS } = useMaskinvyMaskiner("skordare");
  const { maskiner: skotare, laddar: lK } = useMaskinvyMaskiner("skotare");
  const [nu, setNu] = useState<Map<string, Agg> | null>(null);
  const [forr, setForr] = useState<Map<string, Agg> | null>(null);
  const [arbetsdagar, setArbetsdagar] = useState<any[] | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  const range = getPeriodRange(period, offset);
  const prevRange = getPeriodRange(period, offset - 1);
  const alla = useMemo(() => [...skordare.map(m => ({ ...m, slag: "skordare" as const })), ...skotare.map(m => ({ ...m, slag: "skotare" as const }))], [skordare, skotare]);
  const ids = alla.map(m => m.id);
  const idsNyckel = ids.join(",");

  useEffect(() => {
    if (lS || lK) return;
    if (ids.length === 0) { setNu(new Map()); setForr(new Map()); setArbetsdagar([]); setLaddar(false); return; }
    let avbruten = false;
    setLaddar(true); setFel(null);
    (async () => {
      try {
        const [tidNu, avbNu, tidForr, avbForr, arb] = await Promise.all([
          fetchAll("fakt_tid", "datum, maskin_id, processing_sek, terrain_sek, other_work_sek", ids, range.start, range.end),
          fetchAll("fakt_avbrott", "datum, maskin_id, kategori_kod, langd_sek", ids, range.start, range.end),
          fetchAll("fakt_tid", "datum, maskin_id, processing_sek, terrain_sek, other_work_sek", ids, prevRange.start, prevRange.end),
          fetchAll("fakt_avbrott", "datum, maskin_id, kategori_kod, langd_sek", ids, prevRange.start, prevRange.end),
          supabase.from("arbetsdag").select("datum, maskin_id, start_tid, slut_tid, rast_min, arbetad_min, bekraftad, synk_avvikelse")
            .gte("datum", range.start).lte("datum", range.end).not("maskin_id", "is", null)
            .order("datum").order("id").range(0, 1999),
        ]);
        if (avbruten) return;
        setNu(summera(tidNu, avbNu)); setForr(summera(tidForr, avbForr));
        setArbetsdagar(arb.error ? [] : (arb.data || []));
      } catch (e: any) {
        if (!avbruten) setFel(e?.message || String(e));
      } finally {
        if (!avbruten) setLaddar(false);
      }
    })();
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsNyckel, lS, lK, range.start, range.end]);

  const rader: Rad[] = useMemo(() => {
    if (!nu) return [];
    return alla.map(m => {
      const a = nu.get(m.id), f = forr?.get(m.id);
      return {
        id: m.id, namn: m.namn, slag: m.slag,
        tu: a ? tuProcent(a.g15, a.korta, a.avbr) : null,
        tuPrev: f ? tuProcent(f.g15, f.korta, f.avbr) : null,
        g15: a?.g15 || 0, avbr: a?.avbr || 0, korta: a?.korta || 0, dagar: a?.dagar.size || 0,
      };
    }).filter(r => r.g15 > 0);
  }, [alla, nu, forr]);

  // Avvikelser per maskin ur arbetsdag — samma regler som Dagar (utan förarkontext:
  // deldag/ledighet/vilobrott saknas här, så talet är ett golv).
  const avvikelser = useMemo(() => {
    if (!arbetsdagar) return null;
    const år = Number(range.start.slice(0, 4));
    const roda = { ...getRödaDagar(år - 1), ...getRödaDagar(år) };
    const m = new Map<string, { dagar: number; avv: number }>();
    for (const d of arbetsdagar) {
      const a = m.get(d.maskin_id) || { dagar: 0, avv: 0 };
      a.dagar++;
      const lista = dagAvvikelser(d, { rodaDagar: roda });
      if (d.synk_avvikelse && !d.synk_avvikelse.kvitterad) lista.push("tidsavvikelse");
      if (lista.length) a.avv++;
      m.set(d.maskin_id, a);
    }
    return m;
  }, [arbetsdagar, range.start]);

  return (
    <section style={{ color: FARG.text, marginBottom: AVSTAND.xl }}>
      <style>{designCss}</style>
      <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>TU — teknisk utnyttjandegrad, alla maskiner</p>
      <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
        <div style={{ display: "flex", background: FARG.linje, borderRadius: 10, padding: AVSTAND.xs, marginBottom: AVSTAND.s }}>
          {PERIODER.map(p => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setOffset(0); }} aria-pressed={period === p.key}
              style={{ flex: 1, minHeight: 36, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", ...TYP.meta, background: period === p.key ? FARG.fyllning : "transparent", color: period === p.key ? FARG.text : FARG.text2 }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => setOffset(o => o - 1)} aria-label="Föregående period" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>
          </button>
          <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text, textTransform: "capitalize" }}>{range.label}</span>
          <button onClick={() => offset < 0 && setOffset(o => o + 1)} disabled={offset >= 0} aria-label="Nästa period" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, opacity: offset >= 0 ? 0.4 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_right</span>
          </button>
        </div>
      </div>

      {fel && <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte läsa maskintiden: {fel}</p></div>}
      {laddar && !fel && <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Räknar {range.label}…</p></div>}
      {!laddar && !fel && rader.length === 0 && (
        <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Ingen maskintid i {range.label}. Tiden kommer ur maskinfilerna (MOM).</p></div>
      )}
      {!laddar && !fel && rader.length > 0 && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
          {rader.map((r, i) => {
            const ref = TU_BRANSCHSNITT[r.slag];
            const under = r.tu != null && r.tu < ref;
            const delta = r.tu != null && r.tuPrev != null ? Math.round((r.tu - r.tuPrev) * 10) / 10 : null;
            const tf = avvikelser?.get(r.id);
            return (
              <div key={r.id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i < rader.length - 1 ? `1px solid ${FARG.linje}` : "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: AVSTAND.m }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...TYP.listtitel, color: FARG.text }}>{r.namn}</span>
                    <span style={{ marginLeft: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>{r.slag === "skordare" ? "skördare" : "skotare"}</span>
                  </span>
                  <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3, whiteSpace: "nowrap" }}>bransch {ref}</span>
                  <span style={{ ...TYP.rubrik, ...TNUM, color: under ? FARG.orange : FARG.text, whiteSpace: "nowrap" }}>{pct(r.tu)} %</span>
                </div>
                <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                  G15 {tim(r.g15)} · avbrott {tim(r.avbr)}
                  {r.korta > 0 ? ` (varav ${minText(Math.round(r.korta / 60))} under 15 min, räknas i G15)` : ""}
                  {delta != null ? ` · ${delta >= 0 ? "+" : ""}${delta.toLocaleString("sv-SE")} mot förra perioden` : ""}
                </p>
                <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: tf && tf.avv > 0 ? FARG.orange : FARG.text3 }}>
                  {arbetsdagar == null ? "Kontrollerar dagarna…"
                    : !tf ? `${r.dagar} maskindagar · inga förardagar registrerade`
                    : tf.avv > 0 ? `${tf.avv} av ${tf.dagar} förardagar har avvikelse i Dagar — talet är osäkert`
                    : `${tf.dagar} förardagar utan avvikelse i Dagar`}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text3 }}>
        TU = G15 / (G15 + avbrott). Avbrott under 15 min räknas i G15; rast och flytt räknas inte. Avbrotten är samma som i Avbrott-fliken. Branschsnitt enligt Skogforsk: skördare 85 %, skotare 90 %. TU mäter maskinen, inte föraren.
      </p>
    </section>
  );
}
