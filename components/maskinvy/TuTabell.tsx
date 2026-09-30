"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { maskinVisningsnamn } from "@/lib/maskinNamn";
import { tuProcent, TU_BRANSCHSNITT } from "@/lib/g15";
import { dagAvvikelser, minText } from "@/lib/lonesystem/forarText";
import { getRödaDagar } from "@/lib/roda-dagar";
import { TYP, AVSTAND, FARG, KORT, TNUM, designCss } from "@/lib/design/tokens";

/**
 * TU — alla maskiner bredvid varandra för vald period (Martins önskemål).
 * Talet är MASKINENS: G15 / (G15 + avbrott), Skogforsk-definition i lib/g15.ts.
 * Branschsnittet står som dämpad referens; ett tal under det står i orange.
 *
 * TILLFÖRLITLIGHETSRADEN knyter an till Lön → Dagar: hur många av maskinens
 * arbetsdagar (arbetsdag-raderna) som har en avvikelse enligt SAMMA regler
 * (lib/lonesystem/forarText dagAvvikelser + okvitterad tidsavvikelse). Ser man
 * att dagarna inte stämmer vet man att talet är osäkert. TU räknas aldrig ur
 * arbetsdag — det är två källor, kopplade genom en varning, inte blandade.
 */

type TidRad = {
  datum: string; maskin_id: string;
  processing_sek: number; terrain_sek: number; other_work_sek: number;
  maintenance_sek: number; disturbance_sek: number; avbrott_sek: number;
  korta_avbrott_sek?: number;
};
type Maskin = { maskin_id: string; modell: string; tillverkare: string; visningsnamn?: string | null; typ: string | null };
type Rad = {
  maskin: Maskin; slag: "skordare" | "skotare"; tu: number | null; tuPrev: number | null;
  g15: number; ma: number; di: number; av: number; korta: number; dagar: number;
};

const arSkotare = (typ: string | null) => { const t = (typ || "").toLowerCase(); return t === "forwarder" || t === "skotare"; };
const tim = (sek: number) => `${Math.round(sek / 3600).toLocaleString("sv-SE")} tim`;
const pct = (v: number | null) => v == null ? "–" : v.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function TuTabell({ tidCurr, tidPrev, maskiner, laddar, periodLabel, period }: {
  tidCurr: TidRad[]; tidPrev: TidRad[]; maskiner: Maskin[]; laddar: boolean; periodLabel: string; period: { start: string; end: string };
}) {
  // Tillförlitlighet: arbetsdag-raderna för perioden (admin läser alla via RLS).
  const [arbetsdagar, setArbetsdagar] = useState<any[] | null>(null);
  useEffect(() => {
    let avbruten = false;
    setArbetsdagar(null);
    supabase.from("arbetsdag")
      .select("datum, maskin_id, start_tid, slut_tid, rast_min, arbetad_min, bekraftad, synk_avvikelse")
      .gte("datum", period.start).lte("datum", period.end).not("maskin_id", "is", null)
      .order("datum").order("id").range(0, 1999)
      .then(({ data, error }) => { if (!avbruten) setArbetsdagar(error ? [] : (data || [])); });
    return () => { avbruten = true; };
  }, [period.start, period.end]);

  const rader: Rad[] = useMemo(() => {
    const summa = (rows: TidRad[]) => {
      const m = new Map<string, { g15: number; ma: number; di: number; av: number; korta: number; dagar: Set<string> }>();
      for (const r of rows) {
        const a = m.get(r.maskin_id) || { g15: 0, ma: 0, di: 0, av: 0, korta: 0, dagar: new Set<string>() };
        a.g15 += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
        a.ma += r.maintenance_sek || 0; a.di += r.disturbance_sek || 0; a.av += r.avbrott_sek || 0;
        a.korta += r.korta_avbrott_sek || 0; a.dagar.add(r.datum);
        m.set(r.maskin_id, a);
      }
      return m;
    };
    const nu = summa(tidCurr), forr = summa(tidPrev);
    const ut: Rad[] = [];
    for (const [mid, a] of Array.from(nu.entries())) {
      const maskin = maskiner.find(x => x.maskin_id === mid) || { maskin_id: mid, modell: mid, tillverkare: "", typ: null };
      const f = forr.get(mid);
      ut.push({
        maskin, slag: arSkotare(maskin.typ) ? "skotare" : "skordare",
        tu: tuProcent(a.g15, a.korta, a.ma + a.di + a.av),
        tuPrev: f ? tuProcent(f.g15, f.korta, f.ma + f.di + f.av) : null,
        g15: a.g15, ma: a.ma, di: a.di, av: a.av, korta: a.korta, dagar: a.dagar.size,
      });
    }
    return ut.sort((x, y) => x.slag.localeCompare(y.slag) || maskinVisningsnamn(x.maskin).localeCompare(maskinVisningsnamn(y.maskin), "sv"));
  }, [tidCurr, tidPrev, maskiner]);

  // Avvikelser per maskin ur arbetsdag — samma regler som Dagar (utan förar-
  // kontext: deldag/ledighet/vilobrott saknas här, så talet är ett golv).
  const avvikelser = useMemo(() => {
    if (!arbetsdagar) return null;
    const år = Number(period.start.slice(0, 4));
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
  }, [arbetsdagar, period.start]);

  return (
    <div style={{ color: FARG.text }}>
      <style>{designCss}</style>
      <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 }}>TU per maskin · {periodLabel}</p>
      {laddar && <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Räknar {periodLabel}…</p></div>}
      {!laddar && rader.length === 0 && (
        <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Ingen maskintid i {periodLabel}. Tiden kommer ur maskinfilerna (MOM).</p></div>
      )}
      {!laddar && rader.length > 0 && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
          {rader.map((r, i) => {
            const ref = TU_BRANSCHSNITT[r.slag];
            const under = r.tu != null && r.tu < ref;
            const delta = r.tu != null && r.tuPrev != null ? Math.round((r.tu - r.tuPrev) * 10) / 10 : null;
            const tf = avvikelser?.get(r.maskin.maskin_id);
            const namn = maskinVisningsnamn(r.maskin);
            return (
              <div key={r.maskin.maskin_id} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: i < rader.length - 1 ? `1px solid ${FARG.linje}` : "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: AVSTAND.m }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...TYP.listtitel, color: FARG.text }}>{namn}</span>
                    <span style={{ marginLeft: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>{r.slag === "skordare" ? "skördare" : "skotare"}</span>
                  </span>
                  <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3, whiteSpace: "nowrap" }}>bransch {ref}</span>
                  <span style={{ ...TYP.rubrik, ...TNUM, color: under ? FARG.orange : FARG.text, whiteSpace: "nowrap" }}>{pct(r.tu)} %</span>
                </div>
                <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
                  G15 {tim(r.g15)} · avbrott {tim(r.ma + r.di + r.av)}
                  {r.ma + r.di + r.av > 0 ? ` (underhåll ${tim(r.ma)}, störning ${tim(r.di)}, övrigt ${tim(r.av)})` : ""}
                  {r.korta > 0 ? ` · korta avbrott ${minText(Math.round(r.korta / 60))} räknas i G15` : ""}
                  {delta != null ? ` · ${delta >= 0 ? "+" : ""}${delta.toLocaleString("sv-SE")} mot förra perioden` : ""}
                </p>
                {/* Kopplingen till Lön → Dagar: samma regler, samma ord. */}
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
        TU = G15 / (G15 + avbrott). Avbrott under 15 min räknas i G15, rast räknas inte. Branschsnitt enligt Skogforsk: skördare 85 %, skotare 90 %. TU mäter maskinen, inte föraren — han rår inte över underhåll och störningar.
      </p>
    </div>
  );
}
