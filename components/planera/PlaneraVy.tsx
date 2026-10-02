"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AKTIVITETER, aktLabel, type AktivitetTyp } from "@/lib/aktiviteter";
import { byggArbetsObjektLista, type ArbetsObjekt } from "@/lib/arbetsobjekt";
import {
  PLANERA_TYPER, debFor, foreslagenStart, forslagFranIgar, lokalISO, periodMinuter, plusDagar, relativDag,
  senasteTrakter, timText, veckoDagar, datumKort, type Forslag, type PeriodRad,
} from "@/lib/planera/logik";
import { kvittoText, raderaPeriod, sparaNyPeriod, uppdateraPeriod } from "@/lib/planera/spara";
import { TYP, VIKT, IKON, AVSTAND, RADIE, FARG, KNAPP, KORT, TRAFFYTA, TNUM, INAKTIV, VY_ROT, designCss } from "@/lib/design/tokens";

/**
 * PLANERA — en egen vy, TRAKTEN FÖRST. Samma data, samma tabeller (extra_tid),
 * samma kalender och lön som arbetsrapporten; bara en annan ingång för den som
 * planerar. Martin 2026-10-02: Dag/Lägg till period/trakt/från/till/aktivitet/
 * Spara/Klar var tio steg och såg ut som arbetsrapporten — en planerare tänker i
 * trakter, inte i dagar.
 *
 *   Skärm 1  välj trakt (senaste, sök, veckan)
 *   Skärm 2  tryck på trakten → dag · från/till · aktivitet → "Spara 3 tim"
 *            Tre steg: trakt, tid, spara.
 *
 * Vyn skapar BARA perioder. Dagen bekräftas som vanligt i Dag eller Kalender.
 * Fakturering följer aktivitetens default (ingen väljare); ändra via raden i
 * veckolistan. Ett förslag (Samma som i går, senare bilen) sparas ALDRIG förrän
 * föraren tryckt — ärlig data eller ingen data. docs/planera.md.
 *
 * ALLA hooks ligger före första return (React #310, 2026-10-02).
 */

type Skarm = "trakt" | "tid" | "byt";
type DagVal = "idag" | "igar" | "annan";
type FormState = {
  objektId: string | null;
  redigerarId: string | null;
  dagVal: DagVal;
  datum: string;
  start: string;
  slut: string;
  typ: AktivitetTyp;
  deb: boolean;
  startRedigerad: boolean;
};

const PLANERA_AKTIVITETER = PLANERA_TYPER.map(t => AKTIVITETER.find(a => a.typ === t)!).filter(Boolean);
const hh = (t: string | null | undefined) => (t || "").slice(0, 5);

/** Segmenterad väljare — vald = fyllning + fet text. Färgen bär aldrig ensam. */
function Segment<T extends string>({ varden, valt, onVal, etikett }: { varden: { key: T; label: string }[]; valt: T; onVal: (k: T) => void; etikett: string }) {
  return (
    <div role="group" aria-label={etikett} style={{ display: "flex", background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs, gap: AVSTAND.xs }}>
      {varden.map(v => {
        const vald = v.key === valt;
        return (
          <button key={v.key} type="button" aria-pressed={vald} onClick={() => onVal(v.key)}
            style={{ flex: 1, minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.rad - 2, cursor: "pointer", fontFamily: "inherit", ...TYP.meta, fontWeight: vald ? VIKT.halvfet : VIKT.normal, background: vald ? FARG.fyllning : "transparent", color: vald ? FARG.text : FARG.text2 }}>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

const rubrikStil = { margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 } as const;
const tidInputStil = { width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, ...TNUM, fontFamily: "inherit", colorScheme: "dark" } as const;

export default function PlaneraVy() {
  // ── ALLA hooks först ────────────────────────────────────────────────────
  const idag = useMemo(() => lokalISO(new Date()), []);
  const [laddar, setLaddar] = useState(true);
  const [ladFel, setLadFel] = useState<string | null>(null);
  const [medarbetare, setMedarbetare] = useState<{ id: string; namn: string | null } | null>(null);
  const [medSaknas, setMedSaknas] = useState(false);
  const [objekt, setObjekt] = useState<ArbetsObjekt[]>([]);
  const [perioder, setPerioder] = useState<PeriodRad[]>([]);
  const [skarm, setSkarm] = useState<Skarm>("trakt");
  const [form, setForm] = useState<FormState | null>(null);
  const [sok, setSok] = useState("");
  const [kvitto, setKvitto] = useState<string | null>(null);
  const [formFel, setFormFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [forsok, setForsok] = useState(0);

  const hamtaPerioder = useCallback(async (medId: string) => {
    const fran = plusDagar(idag, -60);
    const { data, error } = await supabase.from("extra_tid")
      .select("id, datum, start_tid, slut_tid, minuter, aktivitet_typ, objekt_id, debiterbar, arbetsdag_id, kommentar")
      .eq("medarbetare_id", medId).gte("datum", fran)
      .order("datum", { ascending: false }).order("start_tid", { ascending: true });
    if (error) { console.error("[planera] perioder", error); return false; }
    setPerioder((data as PeriodRad[]) || []);
    return true;
  }, [idag]);

  useEffect(() => {
    let avbruten = false;
    setLaddar(true); setLadFel(null);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const med = user?.id ? await supabase.from("medarbetare").select("id, namn").eq("user_id", user.id).maybeSingle() : { data: null as any };
        if (avbruten) return;
        if (!med.data) { setMedSaknas(true); return; }
        setMedarbetare(med.data);
        const [dim, obj, ok] = await Promise.all([
          supabase.from("dim_objekt").select("objekt_id, object_name, vo_nummer, skogsagare, huvudtyp, atgard, latitude, longitude").order("object_name"),
          supabase.from("objekt").select("vo_nummer, status, namn, markagare, lat, lng, atgard, dim_objekt_id"),
          hamtaPerioder(med.data.id),
        ]);
        if (avbruten) return;
        if (dim.error || obj.error || !ok) { setLadFel("Kunde inte hämta dina trakter. Kontrollera uppkopplingen och försök igen."); return; }
        setObjekt(byggArbetsObjektLista(dim.data as any[], obj.data as any[]));
      } catch (e: any) {
        if (!avbruten) setLadFel("Kunde inte hämta dina trakter. Kontrollera uppkopplingen och försök igen.");
      } finally {
        if (!avbruten) setLaddar(false);
      }
    })();
    return () => { avbruten = true; };
  }, [forsok, hamtaPerioder]);

  const namnPerId = useMemo(() => new Map(objekt.map(o => [o.id, o])), [objekt]);
  const traktNamn = useCallback((id: string | null) => (id ? namnPerId.get(id)?.namn || id : null), [namnPerId]);
  const senaste = useMemo(() => senasteTrakter(perioder, 5), [perioder]);
  const vecka = useMemo(() => veckoDagar(perioder, idag), [perioder, idag]);
  const forslag: Forslag | null = useMemo(() => forslagFranIgar(perioder, idag), [perioder, idag]);
  const traffar = useMemo(() => {
    const q = sok.trim().toLowerCase();
    if (q.length < 2) return [];
    return objekt.filter(o => `${o.namn} ${o.ägare} ${o.vo ?? ""}`.toLowerCase().includes(q)).slice(0, 12);
  }, [sok, objekt]);

  // ── Handlingar ──────────────────────────────────────────────────────────
  const nyttForm = (objektId: string | null): FormState => ({
    objektId, redigerarId: null, dagVal: "idag", datum: idag,
    start: foreslagenStart(perioder, idag), slut: "", typ: "planering", deb: debFor("planering"), startRedigerad: false,
  });
  const valjTrakt = (id: string) => {
    setFormFel(null); setKvitto(null); setBekraftaBort(false);
    if (skarm === "byt") { setForm(f => (f ? { ...f, objektId: id } : nyttForm(id))); setSkarm("tid"); return; }
    setForm(nyttForm(id)); setSkarm("tid"); setSok("");
  };
  const oppnaRad = (p: PeriodRad) => {
    setFormFel(null); setKvitto(null); setBekraftaBort(false);
    const dagVal: DagVal = p.datum === idag ? "idag" : p.datum === plusDagar(idag, -1) ? "igar" : "annan";
    setForm({
      objektId: p.objekt_id, redigerarId: p.id, dagVal, datum: p.datum, start: hh(p.start_tid), slut: hh(p.slut_tid),
      typ: (PLANERA_TYPER.includes(p.aktivitet_typ as AktivitetTyp) ? p.aktivitet_typ : "planering") as AktivitetTyp,
      deb: !!p.debiterbar, startRedigerad: true,
    });
    setSkarm("tid");
  };
  const byttDag = (v: DagVal) => {
    setForm(f => {
      if (!f) return f;
      const datum = v === "idag" ? idag : v === "igar" ? plusDagar(idag, -1) : (f.dagVal === "annan" ? f.datum : plusDagar(idag, -2));
      return { ...f, dagVal: v, datum, start: f.startRedigerad ? f.start : foreslagenStart(perioder, datum) };
    });
  };
  const tillbaka = () => { setSkarm("trakt"); setForm(null); setFormFel(null); setBekraftaBort(false); };

  const klarMedKvitto = async (text: string) => {
    if (medarbetare) await hamtaPerioder(medarbetare.id);
    setKvitto(text); tillbaka();
  };
  const spara = async () => {
    if (!form || !medarbetare || !form.objektId) return;
    setSparar(true); setFormFel(null);
    const p = { datum: form.datum, start: form.start, slut: form.slut, typ: form.typ, objektId: form.objektId, deb: form.deb };
    const svar = form.redigerarId ? await uppdateraPeriod(supabase, medarbetare.id, form.redigerarId, p) : await sparaNyPeriod(supabase, medarbetare.id, p);
    setSparar(false);
    if (!svar.ok) { setFormFel(svar.fel); return; }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
    await klarMedKvitto(`Sparat: ${kvittoText(svar.rad, traktNamn(form.objektId), idag)}`);
  };
  const tabort = async () => {
    if (!form?.redigerarId || !medarbetare) return;
    setSparar(true); setFormFel(null);
    const svar = await raderaPeriod(supabase, { id: form.redigerarId, datum: form.datum }, medarbetare.id);
    setSparar(false);
    if (!svar.ok) { setFormFel(svar.fel); return; }
    await klarMedKvitto(`Borttaget: ${traktNamn(form.objektId) || "perioden"} · ${relativDag(form.datum, idag)} ${form.start}–${form.slut}`);
  };
  const sparaForslag = async (f: Forslag) => {
    if (!medarbetare) return;
    setSparar(true); setFormFel(null); setKvitto(null);
    const sparade: string[] = [];
    for (const per of f.perioder) {
      const svar = await sparaNyPeriod(supabase, medarbetare.id, { datum: idag, start: per.start, slut: per.slut, typ: per.typ, objektId: per.objektId, deb: per.deb });
      if (!svar.ok) {
        setSparar(false);
        await hamtaPerioder(medarbetare.id);
        setKvitto(`${sparade.length ? `Sparat: ${sparade.join(" + ")}. ` : ""}Kunde inte spara ${traktNamn(per.objektId) || "perioden"} ${per.start}–${per.slut}: ${svar.fel}`);
        return;
      }
      sparade.push(kvittoText(svar.rad, traktNamn(per.objektId), idag));
    }
    setSparar(false);
    await hamtaPerioder(medarbetare.id);
    setKvitto(`Sparat: ${sparade.join(" + ")}`);
  };

  const min = form ? periodMinuter(form.start, form.slut) : 0;
  const tidOk = !!form && !!form.start && !!form.slut && min > 0;
  const kanSpara = tidOk && !!form?.objektId && !sparar;
  const tidHint = form && form.start && form.slut && min <= 0 ? "Sluttiden måste vara efter starttiden" : null;

  // ── Rendering (inga hooks härifrån) ─────────────────────────────────────
  const rad = (nyckel: string, ikon: string, rubrik: React.ReactNode, under: React.ReactNode, hoger: React.ReactNode, onClick: () => void, forst: boolean) => (
    <button key={nyckel} type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min + AVSTAND.m, padding: `${AVSTAND.s}px 0`, background: "none", border: "none", borderTop: forst ? "none" : `1px solid ${FARG.linje}`, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
      <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: FARG.text2, flexShrink: 0 }}>{ikon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", ...TYP.text, color: FARG.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rubrik}</span>
        {under && <span style={{ display: "block", ...TYP.meta, ...TNUM, color: FARG.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{under}</span>}
      </span>
      {hoger && <span style={{ ...TYP.text, ...TNUM, color: FARG.text, whiteSpace: "nowrap" }}>{hoger}</span>}
      <span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3, flexShrink: 0 }}>chevron_right</span>
    </button>
  );

  const traktVal = (rubrikText: string | null) => (
    <>
      {rubrikText && <h1 style={{ margin: 0, ...TYP.titel }}>{rubrikText}</h1>}
      {senaste.length > 0 && (
        <>
          <p style={rubrikStil}>Senaste trakter</p>
          <section style={{ ...KORT, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
            {senaste.map((s, i) => rad(s.objektId, "forest", traktNamn(s.objektId), `${relativDag(s.datum, idag)} ${timText(s.minuter)}`, null, () => valjTrakt(s.objektId), i === 0))}
          </section>
        </>
      )}
      {senaste.length === 0 && (
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Du har inte lagt någon planeringstid på en trakt ännu — sök trakten nedan.</p>
      )}
      <p style={rubrikStil}>Sök annan trakt</p>
      <div style={{ position: "relative" }}>
        <span className="material-symbols-outlined" style={{ position: "absolute", left: AVSTAND.m, top: "50%", transform: "translateY(-50%)", fontSize: IKON.rad, color: FARG.text3, pointerEvents: "none" }}>search</span>
        <input type="search" value={sok} onChange={e => setSok(e.target.value)} placeholder="Trakt, markägare eller VO" aria-label="Sök trakt"
          style={{ width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px 0 ${AVSTAND.xxl + AVSTAND.s}px`, background: FARG.kort, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: "inherit" }} />
      </div>
      {sok.trim().length >= 2 && (
        <section style={{ ...KORT, marginTop: AVSTAND.s, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
          {traffar.length === 0
            ? <p style={{ margin: 0, padding: `${AVSTAND.m}px 0`, ...TYP.meta, color: FARG.text2 }}>Ingen trakt matchar "{sok.trim()}".</p>
            : traffar.map((o, i) => rad(o.id, "forest", o.namn, [o.ägare, o.vo].filter(Boolean).join(" · ") || null, null, () => valjTrakt(o.id), i === 0))}
        </section>
      )}
    </>
  );

  let innehall: React.ReactNode;
  if (laddar) {
    innehall = <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Hämtar dina trakter…</p></div>;
  } else if (medSaknas) {
    innehall = <div style={KORT}><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Ditt konto är inte kopplat till en medarbetare, så tiden kan inte sparas. Be Martin koppla kontot under Admin, Medarbetare.</p></div>;
  } else if (ladFel) {
    innehall = (
      <div style={KORT}>
        <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>{ladFel}</p>
        <button type="button" onClick={() => setForsok(f => f + 1)} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
      </div>
    );
  } else if (skarm === "byt") {
    innehall = (
      <>
        <button type="button" onClick={() => setSkarm("tid")} style={{ ...KNAPP.lank, display: "inline-flex", alignItems: "center", marginBottom: AVSTAND.s }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>Tillbaka
        </button>
        {traktVal("Välj trakt")}
      </>
    );
  } else if (skarm === "tid" && form) {
    const redigerar = !!form.redigerarId;
    const aktiv = AKTIVITETER.find(a => a.typ === form.typ);
    innehall = (
      <>
        <button type="button" onClick={tillbaka} style={{ ...KNAPP.lank, display: "inline-flex", alignItems: "center", marginBottom: AVSTAND.s }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>Trakter
        </button>
        <h1 style={{ margin: 0, ...TYP.titel, color: form.objektId ? FARG.text : FARG.orange }}>{traktNamn(form.objektId) || "Trakt saknas"}</h1>
        <button type="button" onClick={() => setSkarm("byt")} style={{ ...KNAPP.lank, marginTop: AVSTAND.xs }}>{form.objektId ? "Byt trakt" : "Välj trakt"}</button>

        <p style={rubrikStil}>Dag</p>
        {redigerar ? (
          <p style={{ margin: 0, ...TYP.text, color: FARG.text }}>{relativDag(form.datum, idag)}{relativDag(form.datum, idag) !== datumKort(form.datum) ? ` · ${datumKort(form.datum)}` : ""}</p>
        ) : (
          <>
            <Segment etikett="Dag" valt={form.dagVal} onVal={byttDag}
              varden={[{ key: "idag", label: "Idag" }, { key: "igar", label: "I går" }, { key: "annan", label: "Annan dag" }]} />
            {form.dagVal === "annan" && (
              <input type="date" value={form.datum} max={idag} aria-label="Välj dag"
                onChange={e => { const d = e.target.value; if (d) setForm(f => f ? { ...f, datum: d, start: f.startRedigerad ? f.start : foreslagenStart(perioder, d) } : f); }}
                style={{ ...tidInputStil, marginTop: AVSTAND.s }} />
            )}
          </>
        )}

        <p style={rubrikStil}>Tid</p>
        <div style={{ display: "flex", gap: AVSTAND.s }}>
          <label style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Från</span>
            <input type="time" step={300} value={form.start} onChange={e => setForm(f => f ? { ...f, start: e.target.value, startRedigerad: true } : f)} style={tidInputStil} />
          </label>
          <label style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Till</span>
            <input type="time" step={300} value={form.slut} onChange={e => setForm(f => f ? { ...f, slut: e.target.value } : f)} style={tidInputStil} />
          </label>
        </div>
        {tidHint && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>{tidHint}</p>}

        <p style={rubrikStil}>Aktivitet</p>
        <Segment etikett="Aktivitet" valt={form.typ}
          onVal={(t: AktivitetTyp) => setForm(f => f ? { ...f, typ: t, deb: debFor(t) } : f)}
          varden={PLANERA_AKTIVITETER.map(a => ({ key: a.typ, label: a.label.replace("Manuellt arbete", "Manuellt") }))} />
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>
          {aktiv ? `${aktiv.label} · ${form.deb ? "faktureras" : "faktureras inte"}` : aktLabel(form.typ)}
        </p>

        {formFel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{formFel}</p>}

        <button type="button" onClick={() => { if (kanSpara) spara(); }} aria-disabled={!kanSpara}
          style={{ ...KNAPP.primar, marginTop: AVSTAND.xl, ...(kanSpara ? {} : INAKTIV) }}>
          {sparar ? "Sparar…" : tidOk ? `Spara ${timText(min)}` : "Välj tid"}
        </button>

        {redigerar && (bekraftaBort ? (
          <div className="tona-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>Ta bort perioden?</span>
            <div style={{ display: "flex", gap: AVSTAND.l }}>
              <button type="button" onClick={() => setBekraftaBort(false)} style={KNAPP.tertiar}>Nej</button>
              <button type="button" onClick={tabort} style={KNAPP.destruktiv}>Ja, ta bort</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.s }}>
            <button type="button" onClick={() => setBekraftaBort(true)} style={KNAPP.destruktiv}>
              <span className="material-symbols-outlined" style={{ fontSize: IKON.text }}>delete</span>Ta bort
            </button>
          </div>
        ))}
      </>
    );
  } else {
    innehall = (
      <>
        <h1 style={{ margin: 0, ...TYP.titel }}>Planera</h1>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Välj trakt, ange tiden, spara.</p>

        {kvitto && (
          <p role="status" className="tona-in" style={{ margin: `${AVSTAND.l}px 0 0`, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.kort, borderRadius: RADIE.rad, ...TYP.meta, ...TNUM, color: FARG.text }}>
            {kvitto}
          </p>
        )}

        {forslag && (
          <>
            <p style={rubrikStil}>Förslag</p>
            <section style={{ ...KORT, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
              {rad(forslag.id, "content_copy", "Samma som i går",
                forslag.perioder.map(p => `${traktNamn(p.objektId) || "Trakt"} ${p.start}–${p.slut}`).join(" + ") + ` · ${timText(forslag.perioder.reduce((s, p) => s + periodMinuter(p.start, p.slut), 0))}`,
                null, () => { if (!sparar) sparaForslag(forslag); }, true)}
            </section>
          </>
        )}

        {traktVal(null)}

        <p style={rubrikStil}>Den här veckan</p>
        <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
          {vecka.dagar.length === 0
            ? <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.meta, color: FARG.text2 }}>Inget registrerat den här veckan.</p>
            : (
              <>
                {vecka.dagar.map(d => (
                  <div key={d.datum}>
                    <p style={{ margin: 0, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xs, display: "flex", justifyContent: "space-between", ...TYP.micro, ...TNUM, color: FARG.text2 }}>
                      <span>{relativDag(d.datum, idag) === datumKort(d.datum) ? datumKort(d.datum) : `${relativDag(d.datum, idag)} · ${datumKort(d.datum)}`}</span>
                      <span>{timText(d.summaMin)}</span>
                    </p>
                    {d.perioder.map((p, i) => rad(p.id, "schedule",
                      p.objekt_id ? traktNamn(p.objekt_id) : <span style={{ color: FARG.orange }}>Trakt saknas</span>,
                      `${hh(p.start_tid)}–${hh(p.slut_tid)} · ${aktLabel(p.aktivitet_typ).replace("Manuellt arbete", "Manuellt")}`,
                      timText(p.minuter ?? periodMinuter(hh(p.start_tid), hh(p.slut_tid))), () => oppnaRad(p), i === 0))}
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}`, marginTop: AVSTAND.xs, ...TYP.listtitel, ...TNUM }}>
                  <span>Veckan</span><span>{timText(vecka.summaMin)}</span>
                </div>
              </>
            )}
        </section>
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text3 }}>
          Dagen bekräftas som vanligt under Dag eller Kalender. Fakturering följer aktiviteten — ändra via raden i listan.
        </p>
      </>
    );
  }

  return (
    <div style={VY_ROT}>
      <style>{designCss}</style>
      <main style={{ maxWidth: 520, margin: "0 auto", paddingTop: AVSTAND.l, paddingBottom: `calc(env(safe-area-inset-bottom) + ${AVSTAND.xxl * 2}px)` }}>
        {innehall}
      </main>
    </div>
  );
}
