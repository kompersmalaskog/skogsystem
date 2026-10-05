"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AKTIVITETER, aktLabel, type AktivitetTyp } from "@/lib/aktiviteter";
import { raknaOmVilobrottEfterAndring } from "@/lib/vilobrott-storage";
import { byggArbetsObjektLista, type ArbetsObjekt } from "@/lib/arbetsobjekt";
import {
  PLANERA_TYPER, DAGENS_SLUT, KVART, RAST_FRAN_MIN, arGlomd, dagRubrik, debFor, foreslagenStart, forslagFranIgar,
  klockaTillMin, krockMed, kvartNed, kvartUpp, liggerIFramtiden, lokalISO, minTillKlocka, nuKvartNarmast, nuMinut, oppenPeriod,
  pagatt, periodMinuter, relativDag, senasteDagar, senasteTrakter, slutVidAvsluta, startLiggerIFramtiden, timText,
  traktGrupper, vanligSluttid, veckoDagar, datumKort, plusDagar, type Forslag, type PeriodRad,
} from "@/lib/planera/logik";
import { kvittoText, raderaPeriod, sparaDelar, sparaNyPeriod, uppdateraPeriod, type Bekraftelse, type NyPeriod } from "@/lib/planera/spara";
import { behovFragaRast, delarFranRader, laggTillRast, type DagDel } from "@/lib/planera/dag";
import DagRedigerare, { RastFraga, RastLangd, Segment } from "./delar";
import { TYP, VIKT, IKON, AVSTAND, RADIE, FARG, KNAPP, KORT, TRAFFYTA, TNUM, INAKTIV, VY_ROT, designCss } from "@/lib/design/tokens";

/**
 * PLANERA — en egen vy, TRAKTEN FÖRST. Samma data, samma tabeller (extra_tid),
 * samma kalender och lön som arbetsrapporten; bara en annan ingång för den som
 * planerar. Martin 2026-10-02: Dag/Lägg till period/trakt/från/till/aktivitet/
 * Spara/Klar var tio steg och såg ut som arbetsrapporten — en planerare tänker i
 * trakter, inte i dagar.
 *
 *   Skärm 1  Pågår (om något pågår) · sök · senaste · aktiva trakter per åtgärdstyp
 *            (Gallring/Slutavverkning/GROT/Övrigt) · veckan
 *   Skärm 2  tryck på trakten → trakt+dag · tiden stor (± en kvart) · hur länge
 *            (1 tim · 2 tim · 4 tim · Till nu) · Starta nu — avsluta sen ·
 *            aktivitet · Faktureras + kommentar · Spara. Vanligaste vägen:
 *            trakt → 2 tim → Spara. Inga klockfält; allt är kvartar; idag kan
 *            aldrig sluta efter nu.
 *
 * "Man vet när man kommer, inte när man går": en knapp som heter STARTA NU startar.
 * Ett tryck sparar perioden med start = klockan nu (exakt minut) och slut = null och
 * går direkt tillbaka till skärm 1 med Pågår-kortet — inget mellansteg, inga val före
 * (Planering och aktivitetens fakturering är förval; Martin missade att perioden
 * aldrig startade när knappen bara bytte läge). Perioden ligger kvar tills man trycker
 * Avsluta eller Ta bort (man ska kunna stänga appen och komma tillbaka). Kvartar finns
 * bara i förifyllning, längdknapparna (1/2/4 tim, Till nu) och plus/minus-stegen.
 * ALLT BEKRÄFTAS VID AVSLUTA — besluta när du vet, inte på morgonen när du gissar:
 * sammanfattningen "Planering · 07:34–16:52 · Faktureras · 9 tim 18 min" med aktivitet,
 * Faktureras och kommentar förvalda. Oftast ett tryck på Spara.
 * KLIPP UPP DAGEN (Martins verkliga fall: han startar planering, går över till manuellt,
 * åker till en annan trakt — och glömmer att byta eller avsluta): dagen delas i delar med
 * en färgstapel, varje del går att ändra (tider, trakt, aktivitet eller rast), och samma
 * redigerare nås från veckolistan (components/planera/delar.tsx, lib/planera/dag.ts).
 * RASTEN är aldrig förifylld och aldrig en siffra på en rad: den är en egen DEL med
 * tider som sparas som LUCKAN mellan perioderna. Är dagen längre än 5 tim utan rast
 * frågar Spara "Hade du rast?" (Ingen rast / Lägg till rast) — ett aktivt val.
 * En period från en tidigare dag som glömts får ALDRIG slut = nu.
 *
 * Vyn skapar BARA perioder. Dagen bekräftas som vanligt i Dag eller Kalender
 * (och kan inte bekräftas medan en period saknar slut). Ett förslag (Samma som
 * i går, senare bilen) sparas ALDRIG förrän föraren tryckt. docs/planera.md.
 *
 * ALLA hooks ligger före första return (React #310, 2026-10-02).
 */

type Skarm = "trakt" | "tid" | "byt" | "dag";
type FormState = {
  objektId: string | null;
  redigerarId: string | null;
  datum: string;
  startMin: number;
  slutMin: number | null; // null = längden är inte vald (eller perioden pågår, se oppen)
  oppen: boolean;         // en redan PÅGÅENDE period som ändras (slut null) — ny period startas direkt med Starta nu
  typ: AktivitetTyp;
  deb: boolean;
  kommentar: string;
};
type Steg = "start" | "slut" | null;
const LANGDER = [{ key: "1", label: "1 tim", min: 60 }, { key: "2", label: "2 tim", min: 120 }, { key: "4", label: "4 tim", min: 240 }];

const PLANERA_AKTIVITETER = PLANERA_TYPER.map(t => AKTIVITETER.find(a => a.typ === t)!).filter(Boolean);
const aktKort = (label: string) => label.replace("Manuellt arbete", "Manuellt").replace("Markägarmöte", "Markägare");
const hh = (t: string | null | undefined) => (t || "").slice(0, 5);
const arPlaneraRad = (r: PeriodRad) => !!r.objekt_id && PLANERA_TYPER.includes(r.aktivitet_typ as AktivitetTyp);
const perAvRad = (r: PeriodRad, slut: string | null): NyPeriod => ({
  datum: r.datum, start: hh(r.start_tid), slut, typ: r.aktivitet_typ as AktivitetTyp, objektId: r.objekt_id, deb: !!r.debiterbar,
});

/** Ett kvartssteg på start eller slut. null = går inte (utanför dagen, korsar den andra änden, efter nu). */
function stappaTill(f: FormState, vilken: "start" | "slut", riktning: -1 | 1, tak: number, startTak: number = tak): FormState | null {
  const flytta = (m: number) => (riktning < 0 ? (m % KVART ? kvartNed(m) : m - KVART) : (m % KVART ? kvartUpp(m) : m + KVART));
  if (vilken === "start") {
    const ny = flytta(f.startMin);
    // Utan slut (pågående) får starten stå så sent som exakt klockan nu — plus passerar aldrig det;
    // med slut måste en kvart rymmas.
    return ny < 0 || ny > (f.slutMin != null ? f.slutMin - KVART : startTak) ? null : { ...f, startMin: ny };
  }
  if (f.slutMin == null) return null;
  const ny = flytta(f.slutMin);
  return ny < f.startMin + KVART || ny > tak ? null : { ...f, slutMin: ny };
}

const rubrikStil = { margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px`, ...TYP.micro, color: FARG.text2 } as const;
const tidInputStil = { width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, ...TNUM, fontFamily: "inherit", colorScheme: "dark" } as const;

export default function PlaneraVy({ nu: nuProp }: { nu?: Date } = {}) {
  // `nu` kan styras utifrån (tester); annars klockan. Idag och "får inte sluta efter nu" räknas härifrån.
  const nu = nuProp ?? new Date();
  const idag = lokalISO(nu);
  // ── ALLA hooks först ────────────────────────────────────────────────────
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
  const [kortFel, setKortFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [steg, setSteg] = useState<Steg>(null);
  const [dagBlad, setDagBlad] = useState(false);
  const [kommentarOppen, setKommentarOppen] = useState(false);
  // Avsluta-sammanfattningen: allt förvalt från perioden, ändras bara det som är fel. Inget sparat förrän Spara.
  // `val`: perioden har pågått längre än han brukar jobba → han väljer själv mellan "Slutade 16:00?" och "Nu" (inget förval).
  const [avsluta, setAvsluta] = useState<{ id: string; slutMin: number; val: number | null; typ: AktivitetTyp; deb: boolean; kommentar: string; kOppen: boolean } | null>(null);
  // "Hade du rast?" visas i stället för Spara tills han svarat. 'avsluta' = Avsluta-sammanfattningen, 'tid' = skärm 2.
  const [rastFraga, setRastFraga] = useState<"avsluta" | "tid" | null>(null);
  const [rastLangd, setRastLangd] = useState(false); // "Lägg till rast" → "Hur lång rast?" (15 · 30 · 45 · 60 · annan)
  // Klipp och rätta dagen: delarna, dagens rader som de låg i databasen när redigeraren öppnades, och var den öppnades ifrån.
  const [dag, setDag] = useState<{ datum: string; gamla: PeriodRad[]; delar: DagDel[]; oppnaMed: "klipp" | null; fran: "avsluta" | "tid" | "vecka"; rastFraga: boolean } | null>(null);
  const [dagFel, setDagFel] = useState<string | null>(null);
  const [startFel, setStartFel] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [forsok, setForsok] = useState(0);

  const hamtaPerioder = useCallback(async (medId: string) => {
    const fran = plusDagar(idag, -60);
    const kol = "id, datum, start_tid, slut_tid, minuter, rast_min, aktivitet_typ, objekt_id, debiterbar, arbetsdag_id, kommentar";
    const [senaste, oppna] = await Promise.all([
      supabase.from("extra_tid").select(kol).eq("medarbetare_id", medId).gte("datum", fran)
        .order("datum", { ascending: false }).order("start_tid", { ascending: true }),
      // En glömd period kan vara äldre än fönstret — den ska ändå synas på Pågår-kortet.
      supabase.from("extra_tid").select(kol).eq("medarbetare_id", medId).is("slut_tid", null)
        .order("datum", { ascending: false }).order("start_tid", { ascending: true }),
    ]);
    if (senaste.error || oppna.error) { console.error("[planera] perioder", senaste.error || oppna.error); return false; }
    const rader = [...((senaste.data as PeriodRad[]) || [])];
    for (const o of ((oppna.data as PeriodRad[]) || [])) if (!rader.some(r => r.id === o.id)) rader.push(o);
    setPerioder(rader);
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
          supabase.from("objekt").select("vo_nummer, status, namn, markagare, lat, lng, atgard, dim_objekt_id, typ"),
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
  const oppenRad = useMemo(() => oppenPeriod(perioder), [perioder]);
  const vanligSl = useMemo(() => vanligSluttid(perioder, idag), [perioder, idag]);
  const forslag: Forslag | null = useMemo(() => forslagFranIgar(perioder, idag, nu), [perioder, idag, nu.getTime()]);
  const grupper = useMemo(() => traktGrupper(objekt, sok), [objekt, sok]);
  const soker = sok.trim().length >= 2;

  // Den levande räknaren på Pågår-kortet: en omritning var 30:e sekund, bara medan något pågår.
  const harOppen = !!oppenRad;
  useEffect(() => {
    if (!harOppen) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [harOppen]);

  // ── Handlingar ──────────────────────────────────────────────────────────
  // Idag: slutet får vara exakt nu eller närmaste kvart (Till nu / plus), det som är senast. En pågående period får
  // starta högst vid exakt nu.
  const taket = (datum: string) => (datum === idag ? Math.max(nuMinut(nu), nuKvartNarmast(nu)) : DAGENS_SLUT);
  const startTaket = (f: FormState) => (f.oppen && f.datum === idag ? nuMinut(nu) : taket(f.datum));
  const nyttForm = (objektId: string | null, datum = idag): FormState => ({
    objektId, redigerarId: null, datum,
    startMin: klockaTillMin(foreslagenStart(perioder, datum, idag, nu)), slutMin: null, oppen: false,
    typ: "planering", deb: debFor("planering"), kommentar: "",
  });
  const stangRastFraga = () => { setRastFraga(null); setRastLangd(false); };
  const aterstall = () => { setFormFel(null); setKortFel(null); setKvitto(null); setBekraftaBort(false); setSteg(null); setDagBlad(false); setAvsluta(null); setStartFel(null); stangRastFraga(); setDag(null); setDagFel(null); };
  const valjTrakt = (id: string) => {
    aterstall(); setKommentarOppen(false);
    if (skarm === "byt") { setForm(f => (f ? { ...f, objektId: id } : nyttForm(id))); setSkarm("tid"); return; }
    setForm(nyttForm(id)); setSkarm("tid"); setSok("");
  };
  /** Öppna en sparad (eller pågående) period för ändring. foreslaSlut: förifyll sluttiden med exakt nu. */
  const oppnaRad = (p: PeriodRad, foreslaSlut = false) => {
    aterstall();
    const oppen = !p.slut_tid;
    const iDag = p.datum === idag;
    const slutFor = oppen ? (foreslaSlut && iDag ? slutVidAvsluta(p.start_tid as string, nu) : null) : klockaTillMin(hh(p.slut_tid));
    setKommentarOppen(!!p.kommentar);
    setForm({
      objektId: p.objekt_id, redigerarId: p.id, datum: p.datum,
      startMin: klockaTillMin(hh(p.start_tid)), slutMin: slutFor,
      // En pågående period som öppnas för ändring förblir pågående tills man väljer en längd.
      oppen: oppen && iDag && slutFor == null,
      typ: (PLANERA_TYPER.includes(p.aktivitet_typ as AktivitetTyp) ? p.aktivitet_typ : "planering") as AktivitetTyp,
      deb: !!p.debiterbar, kommentar: p.kommentar || "",
    });
    setSkarm("tid");
  };
  const valjDag = (datum: string) => {
    if (!datum || datum > idag) return;
    setDagBlad(false); setSteg(null); setFormFel(null);
    // Ny dag = ny förifyllning (där den dagen slutade / förarens vanliga start); längden väljs om.
    setForm(f => (f ? { ...f, datum, startMin: klockaTillMin(foreslagenStart(perioder, datum, idag, nu)), slutMin: null, oppen: false } : f));
  };
  // En kvart per tryck. Står tiden mellan två kvartar (gammal data, 10:17) snappar första trycket till kvarten.
  const stappa = (riktning: -1 | 1) => setForm(f => (f && steg ? stappaTill(f, steg, riktning, taket(f.datum), startTaket(f)) ?? f : f));
  const tryckTid = (vilken: "start" | "slut") => {
    if (vilken === "slut" && form && form.slutMin == null) {
      // Slutet är inte valt: ett tryck ger en timme (eller så långt som ryms) att steppa från.
      const s = Math.min(form.startMin + 60, taket(form.datum));
      if (s >= form.startMin + KVART) setForm({ ...form, slutMin: s, oppen: false });
    }
    setSteg(st => (st === vilken ? null : vilken));
  };
  // Längdknapparna är för efterhandsregistrering: den förifyllda starten + vald längd (kvartar).
  const valjLangd = (key: string) => setForm(f => {
    if (!f) return f;
    if (key === "nu") { const sl = nuKvartNarmast(nu); return sl > f.startMin ? { ...f, slutMin: sl, oppen: false } : f; }
    const l = LANGDER.find(x => x.key === key);
    return l && f.startMin + l.min <= taket(f.datum) ? { ...f, slutMin: f.startMin + l.min, oppen: false } : f;
  });
  const tillbaka = () => { setSkarm("trakt"); setForm(null); setFormFel(null); setStartFel(null); setBekraftaBort(false); setSteg(null); setDagBlad(false); stangRastFraga(); setDag(null); setDagFel(null); };
  const bekrText = (b: Bekraftelse | undefined) => b === "bruten"
    ? " Dagen var bekräftad — den måste bekräftas igen under Dag eller Kalender."
    : b === "misslyckades" ? " Dagen var bekräftad men kunde inte låsas upp — öppna den under Dag eller Kalender och bekräfta om." : "";

  const klarMedKvitto = async (text: string | null) => {
    if (medarbetare) await hamtaPerioder(medarbetare.id);
    setKvitto(text); tillbaka();
  };
  const spara = async (utanRastFraga = false) => {
    if (!form || !medarbetare || !form.objektId) return;
    if (form.slutMin == null && !form.oppen) return;
    const oppenSave = form.oppen || form.slutMin == null;
    // Längre än 5 tim utan rast: fråga (ett aktivt val) innan något sparas. Rasten sätts aldrig åt föraren.
    if (!oppenSave && !utanRastFraga && (form.slutMin as number) - form.startMin > RAST_FRAN_MIN) { setRastFraga("tid"); return; }
    setSparar(true); setFormFel(null);
    const p: NyPeriod = {
      datum: form.datum, start: minTillKlocka(form.startMin), slut: oppenSave ? null : minTillKlocka(form.slutMin as number),
      typ: form.typ, objektId: form.objektId, deb: form.deb, kommentar: form.kommentar,
    };
    const svar = form.redigerarId ? await uppdateraPeriod(supabase, medarbetare.id, form.redigerarId, p, nu) : await sparaNyPeriod(supabase, medarbetare.id, p, nu);
    setSparar(false);
    if (!svar.ok) { setFormFel(svar.fel); stangRastFraga(); return; }
    omraknaVila(form.datum);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
    // Startad period: kortet "Pågår" på skärm 1 ÄR kvittot. Avslutad/sparad: kvitto ur databasens rad.
    await klarMedKvitto(p.slut == null ? null : `Sparat: ${kvittoText(svar.rad, traktNamn(form.objektId), idag)}${bekrText(svar.bekraftelse)}`);
  };
  // STARTA NU: ett tryck → perioden sparas med start = exakt nu och slut = null → tillbaka till skärm 1 med Pågår-kortet.
  // Inget mellansteg och inget som måste väljas före (Planering/fakturering är förval; en aktivitet som redan valts följer med).
  const startaNu = async () => {
    if (!form || !medarbetare || !form.objektId || sparar || form.redigerarId || form.datum !== idag) return;
    setSparar(true); setStartFel(null);
    const p: NyPeriod = { datum: idag, start: minTillKlocka(nuMinut(nu)), slut: null, typ: form.typ, objektId: form.objektId, deb: form.deb, kommentar: form.kommentar };
    const svar = await sparaNyPeriod(supabase, medarbetare.id, p, nu);
    setSparar(false);
    if (!svar.ok) { setStartFel(svar.fel); return; }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
    await klarMedKvitto(null); // kortet "Pågår" på skärm 1 ÄR kvittot
  };
  const tabort = async () => {
    if (!form?.redigerarId || !medarbetare) return;
    setSparar(true); setFormFel(null);
    const svar = await raderaPeriod(supabase, { id: form.redigerarId, datum: form.datum }, medarbetare.id);
    setSparar(false);
    if (!svar.ok) { setFormFel(svar.fel); return; }
    omraknaVila(form.datum); // borttagen period → brott som den orsakade ska bort
    await klarMedKvitto(`Borttaget: ${traktNamn(form.objektId) || "perioden"} · ${relativDag(form.datum, idag)} ${minTillKlocka(form.startMin)}${form.slutMin != null ? `–${minTillKlocka(form.slutMin)}` : " (pågående)"}.${bekrText(svar.bekraftelse)}`);
  };
  // Vilan räknas om mot NUVARANDE data efter varje ändring av perioder (lib/vilobrott-storage):
  // ett brott som en raderad eller ändrad period orsakat ska inte stå kvar och bli en fråga
  // ("Varför bröts vilan?"), och en ändring som skapar ett brott ska synas. Best-effort —
  // sparandet av perioden hänger aldrig på det.
  const omraknaVila = (datum: string) => {
    if (!medarbetare) return;
    void raknaOmVilobrottEfterAndring(medarbetare.id, datum).catch(err => console.error("[planera] vilo-omräkning misslyckades:", err));
  };
  const sparaForslag = async (f: Forslag) => {
    if (!medarbetare) return;
    setSparar(true); setFormFel(null); setKvitto(null);
    const sparade: string[] = [];
    for (const per of f.perioder) {
      const svar = await sparaNyPeriod(supabase, medarbetare.id, { datum: idag, start: per.start, slut: per.slut, typ: per.typ, objektId: per.objektId, deb: per.deb }, nu);
      if (!svar.ok) {
        setSparar(false);
        await hamtaPerioder(medarbetare.id);
        setKvitto(`${sparade.length ? `Sparat: ${sparade.join(" + ")}. ` : ""}Kunde inte spara ${traktNamn(per.objektId) || "perioden"} ${per.start}–${per.slut}: ${svar.fel}`);
        return;
      }
      sparade.push(kvittoText(svar.rad, traktNamn(per.objektId), idag));
    }
    setSparar(false);
    omraknaVila(idag);
    await hamtaPerioder(medarbetare.id);
    setKvitto(`Sparat: ${sparade.join(" + ")}`);
  };

  // Pågår-kortet: Avsluta visar sammanfattningen (slut = exakt nu) med ALLT förvalt och sparar först när man trycker
  // Spara. En period från en tidigare dag (glömd) eller utan trakt/Planera-aktivitet (startad i arbetsrapporten) får
  // aldrig en gissad sluttid — då öppnas skärm 2 så föraren väljer själv. Har perioden pågått längre än han brukar
  // jobba (glömd samma dag) väljer han mellan "Slutade 16:00?" och "Nu" — ett val, aldrig ett förval.
  const oppnaAvsluta = (rad: PeriodRad) => {
    if (!medarbetare || sparar) return;
    setKortFel(null); setKvitto(null);
    if (arGlomd(rad, idag) || !arPlaneraRad(rad)) { oppnaRad(rad, true); return; }
    const slut = slutVidAvsluta(rad.start_tid as string, nu);
    if (slut == null) { setKortFel("Perioden är mindre än en minut gammal — vänta lite, eller ändra den."); return; }
    const startMin = klockaTillMin(hh(rad.start_tid));
    const v = vanligSl;
    const val = v && nuMinut(nu) - startMin > v.spann && v.slut > startMin && v.slut < nuMinut(nu) ? v.slut : null;
    stangRastFraga();
    setAvsluta({ id: rad.id, slutMin: slut, val, typ: rad.aktivitet_typ as AktivitetTyp, deb: !!rad.debiterbar, kommentar: rad.kommentar || "", kOppen: !!rad.kommentar });
  };
  const sparaAvsluta = async (rad: PeriodRad) => {
    if (!medarbetare || !avsluta || sparar) return;
    setKortFel(null); setSparar(true);
    const svar = await uppdateraPeriod(supabase, medarbetare.id, rad.id, { ...perAvRad(rad, minTillKlocka(avsluta.slutMin)), typ: avsluta.typ, deb: avsluta.deb, kommentar: avsluta.kommentar }, nu);
    setSparar(false);
    if (!svar.ok) { setKortFel(svar.fel); stangRastFraga(); return; }
    omraknaVila(rad.datum);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
    await hamtaPerioder(medarbetare.id);
    setAvsluta(null); stangRastFraga();
    setKvitto(`Sparat: ${kvittoText(svar.rad, traktNamn(rad.objekt_id), idag)}${bekrText(svar.bekraftelse)}`);
  };

  // ── Klipp och rätta dagen ──
  const delFranForm = (f: FormState, slutMin: number): DagDel => ({
    nyckel: f.redigerarId ? `r:${f.redigerarId}` : "n:0", radId: f.redigerarId, start: f.startMin, slut: slutMin,
    typ: f.typ, objektId: f.objektId, deb: f.deb, kommentar: f.kommentar, last: false,
  });
  /** Från Avsluta-sammanfattningen: den pågående perioden (start → slut) blir EN del som kan klippas. */
  const avslutaDel = (): DagDel | null => (!oppenRad || !avsluta ? null : {
    nyckel: `r:${oppenRad.id}`, radId: oppenRad.id, start: klockaTillMin(hh(oppenRad.start_tid)), slut: avsluta.slutMin,
    typ: avsluta.typ, objektId: oppenRad.objekt_id, deb: avsluta.deb, kommentar: avsluta.kommentar, last: false,
  });
  const klippFranAvsluta = () => {
    const del = avslutaDel();
    if (!oppenRad || !del) return;
    setDagFel(null); stangRastFraga();
    setDag({ datum: oppenRad.datum, gamla: [oppenRad], delar: [del], oppnaMed: "klipp", fran: "avsluta", rastFraga: false });
    setSkarm("dag");
  };
  /** "Lägg till rast" + vald längd (Avsluta): rasten läggs MITT i perioden; redigeraren öppnas med den på plats — inget sparat än. */
  const rastFranAvsluta = (langd: number) => {
    const del = avslutaDel();
    if (!oppenRad || !del) return;
    const delar = laggTillRast([del], langd);
    if (!delar) { setKortFel("Rasten får inte plats i perioden."); stangRastFraga(); return; }
    setDagFel(null); stangRastFraga();
    setDag({ datum: oppenRad.datum, gamla: [oppenRad], delar, oppnaMed: null, fran: "avsluta", rastFraga: false });
    setSkarm("dag");
  };
  /** Från skärm 2 ("Lägg till rast" på frågan): perioden som just fyllts i blir EN del; ingenting är sparat än. */
  const rastFranTid = (langd: number) => {
    if (!form || form.slutMin == null || !form.objektId) return;
    const delar = laggTillRast([delFranForm(form, form.slutMin)], langd);
    if (!delar) { setFormFel("Rasten får inte plats i perioden."); stangRastFraga(); return; }
    const gamla = form.redigerarId ? perioder.filter(x => x.id === form.redigerarId) : [];
    setDagFel(null); stangRastFraga();
    setDag({ datum: form.datum, gamla, delar, oppnaMed: null, fran: "tid", rastFraga: false });
    setSkarm("dag");
  };
  /** Från veckolistan: tryck på en dag → alla dagens delar (luckor mellan perioderna syns som rast). */
  const oppnaDagen = (datum: string) => {
    const rader = perioder.filter(x => x.datum === datum && x.start_tid);
    if (rader.some(x => !x.slut_tid)) { setKortFel("Avsluta den pågående perioden först — sedan går dagen att klippa och rätta."); return; }
    const delar = delarFranRader(rader);
    if (!delar.length) return;
    aterstall();
    setDag({ datum, gamla: rader, delar, oppnaMed: null, fran: "vecka", rastFraga: false });
    setSkarm("dag");
  };
  const sparaDag = async (utanRastFraga = false) => {
    if (!dag || !medarbetare || sparar) return;
    if (!utanRastFraga && behovFragaRast(dag.delar)) { setDag(d => (d ? { ...d, rastFraga: true } : d)); return; }
    setSparar(true); setDagFel(null);
    const svar = await sparaDelar(supabase, medarbetare.id, dag.datum, dag.gamla, dag.delar, nu);
    setSparar(false);
    omraknaVila(dag.datum); // även efter ett delvis misslyckat försök: det som hann sparas ändrar vilan
    if (!svar.ok) {
      // Något hann sparas: koppla nya delar till sina rader och läs om dagens rader, så ett nytt försök inte infogar dubbletter.
      const lasta = await supabase.from("extra_tid").select("*").eq("medarbetare_id", medarbetare.id).eq("datum", dag.datum);
      await hamtaPerioder(medarbetare.id);
      setDag(d => d ? { ...d, rastFraga: false, gamla: lasta.error ? d.gamla : ((lasta.data as PeriodRad[]) || []), delar: d.delar.map(x => (svar.nyckelTillId[x.nyckel] ? { ...x, radId: svar.nyckelTillId[x.nyckel] } : x)) } : d);
      setDagFel(svar.fel);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
    const summa = svar.rader.reduce((s, r) => s + (r.minuter ?? 0), 0);
    const rubrik = svar.rader.length === 0 ? "Perioden är borttagen" : `Sparat · ${svar.rader.length} ${svar.rader.length === 1 ? "del" : "delar"} · ${timText(summa)} arbetad`;
    const rader = svar.rader.map(r => kvittoText(r, traktNamn(r.objekt_id), idag)).join("\n");
    await hamtaPerioder(medarbetare.id);
    setAvsluta(null);
    setKvitto(`${rubrik}${rader ? "\n" + rader : ""}${bekrText(svar.bekraftelse) ? "\n" + bekrText(svar.bekraftelse).trim() : ""}`);
    tillbaka();
  };

  const min = form && form.slutMin != null ? form.slutMin - form.startMin : 0;
  const oppenLage = !!form && form.oppen && form.slutMin == null;
  const framtid = !!form && (oppenLage ? startLiggerIFramtiden(form.datum, form.startMin, nu) : form.slutMin != null && liggerIFramtiden(form.datum, form.slutMin, nu));
  const krock = form && !framtid && (oppenLage || form.slutMin != null)
    ? krockMed(perioder, form.datum, form.startMin, oppenLage ? DAGENS_SLUT : (form.slutMin as number), form.redigerarId) : null;
  const oppenAnnan = !!oppenRad && !!form && oppenRad.id !== form.redigerarId;
  const kanSpara = !!form && !!form.objektId && !framtid && !krock && !sparar
    && (oppenLage ? !oppenAnnan && form.datum === idag : form.slutMin != null && min > 0);
  const langdStart = form ? form.startMin : 0;
  const langdInaktiva = ["1", "2", "4", "nu"].filter(k => {
    if (!form) return true;
    if (k === "nu") return !(form.datum === idag && nuKvartNarmast(nu) > langdStart);
    return langdStart + LANGDER.find(l => l.key === k)!.min > taket(form.datum);
  });
  const valdLangd = !form || form.slutMin == null ? null
    : LANGDER.find(l => form.startMin + l.min === form.slutMin)?.key ?? (form.datum === idag && form.slutMin === nuKvartNarmast(nu) ? "nu" : null);

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

  /** Aktivitet (segmenterad). Delas av skärm 2 och Avsluta-sammanfattningen. */
  const aktivitetSegment = (typ: AktivitetTyp, onTyp: (t: AktivitetTyp) => void) => (
    <Segment etikett="Aktivitet" valt={typ} onVal={onTyp} varden={PLANERA_AKTIVITETER.map(a => ({ key: a.typ, label: aktKort(a.label) }))} />
  );
  /** Faktureras (reglage, förvalt efter aktiviteten) + kommentar i ett kort. Delas av skärm 2 och Avsluta-sammanfattningen. */
  const fakturerasKommentar = (deb: boolean, onDeb: (b: boolean) => void, kommentar: string, onKommentar: (t: string) => void, kOppen: boolean, onKOppen: () => void) => (
    <section style={{ ...KORT, marginTop: AVSTAND.m, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
      <button type="button" role="switch" aria-checked={deb} onClick={() => onDeb(!deb)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: TRAFFYTA.min, padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: FARG.text, ...TYP.text }}>
        <span>Faktureras</span>
        <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs }}>
          <span style={{ ...TYP.meta, color: deb ? FARG.text : FARG.text2 }}>{deb ? "Ja" : "Nej"}</span>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: deb ? FARG.gron : FARG.text3 }}>{deb ? "toggle_on" : "toggle_off"}</span>
        </span>
      </button>
      <div style={{ borderTop: `1px solid ${FARG.linje}` }}>
        {kOppen ? (
          <textarea value={kommentar} rows={2} aria-label="Kommentar" placeholder="Kommentar" autoFocus={!kommentar}
            onChange={e => onKommentar(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", margin: `${AVSTAND.s}px 0`, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: "inherit", resize: "none" }} />
        ) : (
          <button type="button" onClick={onKOppen} style={{ ...KNAPP.lank, display: "flex", alignItems: "center", justifyContent: "flex-start", width: "100%" }}>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, marginRight: AVSTAND.s }}>add_comment</span>Lägg till kommentar
          </button>
        )}
      </div>
    </section>
  );

  /** Pågår / Avsluta-sammanfattning / Glömde du avsluta — överst på skärm 1. */
  const pagarKort = () => {
    if (!oppenRad) return null;
    const glomd = arGlomd(oppenRad, idag);
    const namn = traktNamn(oppenRad.objekt_id) || "Trakt saknas";
    const akt = aktKort(aktLabel(oppenRad.aktivitet_typ));
    // Avsluta: ALLT bekräftas här, förvalt. Inget är sparat förrän man trycker Spara.
    if (avsluta && avsluta.id === oppenRad.id) {
      const startMin = klockaTillMin(hh(oppenRad.start_tid));
      // Glömde avsluta samma dag: ett val, inte ett förval.
      if (avsluta.val != null) {
        return (
          <section role="region" aria-label="Avsluta period" className="tona-in" style={{ ...KORT, marginTop: AVSTAND.l, boxShadow: `inset 0 0 0 2px ${FARG.gron}` }}>
            <p style={{ margin: 0, ...TYP.micro, color: FARG.gron }}>Avsluta</p>
            <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.rubrik }}>{namn}</p>
            <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Perioden har pågått längre än du brukar jobba. När slutade du?</p>
            <div style={{ display: "flex", gap: AVSTAND.s, marginTop: AVSTAND.m }}>
              <button type="button" onClick={() => setAvsluta(a => (a ? { ...a, slutMin: a.val as number, val: null } : a))} style={{ ...KNAPP.sekundar, flex: 1, width: "auto" }}>Slutade {minTillKlocka(avsluta.val)}?</button>
              <button type="button" onClick={() => setAvsluta(a => (a ? { ...a, val: null } : a))} style={{ ...KNAPP.sekundar, flex: 1, width: "auto" }}>Nu, {minTillKlocka(avsluta.slutMin)}</button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.xs }}>
              <button type="button" onClick={() => setAvsluta(null)} style={KNAPP.tertiar}>Tillbaka</button>
            </div>
          </section>
        );
      }
      const brutto = avsluta.slutMin - startMin;
      const sammanfattning = [
        aktKort(aktLabel(avsluta.typ)), `${minTillKlocka(startMin)}–${minTillKlocka(avsluta.slutMin)}`,
        avsluta.deb ? "Faktureras" : "Faktureras inte", timText(brutto),
      ].join(" · ");
      return (
        <section role="region" aria-label="Avsluta period" className="tona-in" style={{ ...KORT, marginTop: AVSTAND.l, boxShadow: `inset 0 0 0 2px ${FARG.gron}` }}>
          <p style={{ margin: 0, ...TYP.micro, color: FARG.gron }}>Avsluta</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.rubrik }}>{namn}</p>
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.listtitel, ...TNUM, color: FARG.text }}>{sammanfattning}</p>
          <button type="button" onClick={() => klippFranAvsluta()} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>content_cut</span>Klipp upp dagen
          </button>
          <div style={{ marginTop: AVSTAND.m }}>
            {aktivitetSegment(avsluta.typ, t => setAvsluta(a => (a ? { ...a, typ: t, deb: debFor(t) } : a)))}
          </div>
          {fakturerasKommentar(avsluta.deb, b => setAvsluta(a => (a ? { ...a, deb: b } : a)), avsluta.kommentar,
            t => setAvsluta(a => (a ? { ...a, kommentar: t } : a)), avsluta.kOppen, () => setAvsluta(a => (a ? { ...a, kOppen: true } : a)))}
          {rastFraga === "avsluta" && brutto > RAST_FRAN_MIN
            ? (rastLangd
              ? <RastLangd onVal={rastFranAvsluta} onTillbaka={() => setRastLangd(false)} />
              : <RastFraga onIngen={() => sparaAvsluta(oppenRad)} onLagg={() => setRastLangd(true)} />)
            : (
              <button type="button" onClick={() => { if (brutto > RAST_FRAN_MIN) setRastFraga("avsluta"); else sparaAvsluta(oppenRad); }} aria-disabled={sparar} style={{ ...KNAPP.primar, marginTop: AVSTAND.m, ...(sparar ? INAKTIV : {}) }}>
                {sparar ? "Sparar…" : `Spara ${timText(brutto)}`}
              </button>
            )}
          {!rastLangd && (
            <div style={{ display: "flex", justifyContent: "center", gap: AVSTAND.l, marginTop: AVSTAND.xs }}>
              <button type="button" onClick={() => { stangRastFraga(); setAvsluta(null); }} style={KNAPP.tertiar}>Tillbaka</button>
              <button type="button" onClick={() => oppnaRad(oppenRad, true)} style={KNAPP.tertiar}>Ändra tider</button>
            </div>
          )}
        </section>
      );
    }
    const ram = glomd ? FARG.orange : FARG.gron;
    return (
      <section role="region" aria-label={glomd ? "Glömd period" : "Pågående period"} className="tona-in"
        style={{ ...KORT, marginTop: AVSTAND.l, boxShadow: `inset 0 0 0 2px ${ram}` }}>
        {glomd
          ? <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>Glömde du avsluta?</p>
          : <p style={{ margin: 0, ...TYP.micro, color: FARG.gron }}>Pågår</p>}
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.rubrik, color: oppenRad.objekt_id ? FARG.text : FARG.orange }}>{namn}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
          {glomd
            ? `${akt} · Startade ${relativDag(oppenRad.datum, idag)} ${hh(oppenRad.start_tid)}`
            : `${akt} sedan ${hh(oppenRad.start_tid)} · ${timText(pagatt(oppenRad, nu))}`}
        </p>
        <button type="button" onClick={() => oppnaAvsluta(oppenRad)} style={{ ...KNAPP.primar, marginTop: AVSTAND.m }}>Avsluta</button>
        {!glomd && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: AVSTAND.xs }}>
            <button type="button" onClick={() => oppnaRad(oppenRad)} style={KNAPP.tertiar}>Ändra eller ta bort</button>
          </div>
        )}
      </section>
    );
  };

  const traktVal = (rubrikText: string | null, onVal: (id: string) => void = valjTrakt) => (
    <>
      {rubrikText && <h1 style={{ margin: 0, ...TYP.titel }}>{rubrikText}</h1>}
      <div style={{ position: "relative", marginTop: rubrikText ? AVSTAND.l : AVSTAND.xl }}>
        <span className="material-symbols-outlined" style={{ position: "absolute", left: AVSTAND.m, top: "50%", transform: "translateY(-50%)", fontSize: IKON.rad, color: FARG.text3, pointerEvents: "none" }}>search</span>
        <input type="search" value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök trakt, markägare eller VO" aria-label="Sök trakt"
          style={{ width: "100%", boxSizing: "border-box", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px 0 ${AVSTAND.xxl + AVSTAND.s}px`, background: FARG.kort, border: "none", borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: "inherit" }} />
      </div>
      {!soker && senaste.length > 0 && (
        <>
          <p style={rubrikStil}>Senaste</p>
          <section style={{ ...KORT, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
            {senaste.map((s, i) => rad(s.objektId, "history", traktNamn(s.objektId), `${relativDag(s.datum, idag)} ${timText(s.minuter)}`, null, () => onVal(s.objektId), i === 0))}
          </section>
        </>
      )}
      {grupper.map(g => (
        <React.Fragment key={g.key}>
          <p style={rubrikStil}>{g.label} · {g.objekt.length}</p>
          <section style={{ ...KORT, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.xs }}>
            {g.objekt.map((o, i) => rad(`${g.key}-${o.id}`, "forest", o.namn, [o.ägare, o.vo].filter(Boolean).join(" · ") || null, null, () => onVal(o.id), i === 0))}
          </section>
        </React.Fragment>
      ))}
      {soker && grupper.length === 0 && (
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Ingen trakt matchar "{sok.trim()}".</p>
      )}
      {!soker && grupper.length === 0 && senaste.length === 0 && (
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Inga aktiva trakter — sök trakten ovan.</p>
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
  } else if (skarm === "dag" && dag) {
    innehall = (
      <DagRedigerare
        titel={dagRubrik(dag.datum, idag)} datum={dag.datum} idag={idag} nu={nu}
        delar={dag.delar} onDelar={d => setDag(x => (x ? { ...x, delar: d, rastFraga: false } : x))}
        traktNamn={traktNamn} traktLista={onVal => traktVal("Välj trakt", onVal)}
        oppnaMed={dag.oppnaMed} fel={dagFel} sparar={sparar}
        rastFraga={dag.rastFraga} onRastSvar={() => sparaDag(true)}
        onSpara={() => sparaDag()}
        onTillbaka={() => { setDag(null); setDagFel(null); setSkarm(dag.fran === "tid" ? "tid" : "trakt"); }}
        tillbakaText={dag.fran === "tid" ? "Tillbaka" : dag.fran === "avsluta" ? "Avsluta" : "Planera"}
      />
    );
  } else if (skarm === "tid" && form) {
    const redigerar = !!form.redigerarId;
    const tak = taket(form.datum);
    const kanMinus = !!steg && !!stappaTill(form, steg, -1, tak);
    const kanPlus = !!steg && !!stappaTill(form, steg, 1, tak);
    const langdVarden = [...LANGDER.map(l => ({ key: l.key, label: l.label })), ...(form.datum === idag ? [{ key: "nu", label: "Till nu" }] : [])];
    const ingetRymsAnnu = form.datum === idag && langdVarden.every(v => langdInaktiva.includes(v.key));
    const tidKnapp = (vilken: "start" | "slut", text: string, etikett: string, dampad = false) => (
      <button type="button" aria-label={etikett} aria-pressed={steg === vilken} onClick={() => tryckTid(vilken)}
        style={{ minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, border: "none", borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", ...TYP.tal, color: dampad ? FARG.text3 : FARG.text, background: steg === vilken ? FARG.fyllning : "transparent" }}>
        {text}
      </button>
    );
    const stegKnapp = (rikt: -1 | 1, ikon: string, etikett: string, paa: boolean) => (
      <button type="button" aria-label={etikett} disabled={!paa} onClick={() => stappa(rikt)}
        style={{ width: 64, minHeight: TRAFFYTA.min, border: "none", borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", background: FARG.fyllning, color: FARG.text, display: "inline-flex", alignItems: "center", justifyContent: "center", ...(paa ? {} : { opacity: 0.4, cursor: "default" }) }}>
        <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>{ikon}</span>
      </button>
    );
    const sparaText = sparar ? "Sparar…"
      : oppenLage ? "Spara ändring"
      : form.slutMin == null ? "Välj hur länge" : `Spara ${timText(min)}`;
    const kanStarta = form.datum === idag && !redigerar;
    innehall = (
      <>
        <button type="button" onClick={tillbaka} style={{ ...KNAPP.lank, display: "inline-flex", alignItems: "center", marginBottom: AVSTAND.s }}>
          <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>chevron_left</span>Trakter
        </button>

        {/* Block 1 — trakt och dag */}
        <h1 style={{ margin: 0, ...TYP.titel, color: form.objektId ? FARG.text : FARG.orange }}>{traktNamn(form.objektId) || "Trakt saknas"}</h1>
        {(redigerar || !form.objektId) && (
          <button type="button" onClick={() => setSkarm("byt")} style={{ ...KNAPP.lank, display: "flex", marginTop: AVSTAND.xs }}>{form.objektId ? "Byt trakt" : "Välj trakt"}</button>
        )}
        {redigerar ? (
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>{dagRubrik(form.datum, idag)}</p>
        ) : (
          <button type="button" aria-expanded={dagBlad} onClick={() => setDagBlad(v => !v)} style={{ ...KNAPP.lank, display: "flex", alignItems: "center", marginTop: AVSTAND.xs }}>
            {dagRubrik(form.datum, idag)}
            <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>{dagBlad ? "expand_more" : "chevron_right"}</span>
          </button>
        )}
        {dagBlad && !redigerar && (
          <section className="tona-in" style={{ ...KORT, marginTop: AVSTAND.s, paddingTop: AVSTAND.xs, paddingBottom: AVSTAND.m }}>
            {senasteDagar(idag).map((d, i) => (
              <button key={d} type="button" aria-pressed={d === form.datum} onClick={() => valjDag(d)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: TRAFFYTA.min, padding: 0, background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${FARG.linje}`, cursor: "pointer", fontFamily: "inherit", color: FARG.text, ...TYP.text }}>
                <span style={{ fontWeight: d === form.datum ? VIKT.halvfet : VIKT.normal }}>{dagRubrik(d, idag)}</span>
                {d === form.datum && <span className="material-symbols-outlined" style={{ fontSize: IKON.rad, color: FARG.text2 }}>check</span>}
              </button>
            ))}
            <label style={{ display: "block", marginTop: AVSTAND.s }}>
              <span style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>Äldre dag</span>
              <input type="date" max={idag} value="" aria-label="Äldre dag" onChange={e => valjDag(e.target.value)} style={tidInputStil} />
            </label>
          </section>
        )}

        {/* STARTA NU — stor grön knapp direkt under trakt och dag, bara idag. Ett tryck startar (ingen bekräftelse, inget mellansteg). */}
        {kanStarta && (
          <>
            <button type="button" onClick={startaNu} disabled={!!oppenRad || !form.objektId || sparar}
              style={{ ...KNAPP.primar, marginTop: AVSTAND.l, background: FARG.gron, color: FARG.bg, ...((oppenRad || !form.objektId) ? { opacity: 0.4, cursor: "default" } : {}) }}>
              <span className="material-symbols-outlined" style={{ fontSize: IKON.rad }}>play_circle</span>Starta nu
            </button>
            {oppenRad && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Du har redan en pågående period — avsluta den först.</p>}
            {startFel && <p role="alert" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>{startFel}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, marginTop: AVSTAND.l }}>
              <span style={{ flex: 1, height: 1, background: FARG.linje }} />
              <span style={{ ...TYP.micro, color: FARG.text3 }}>eller fyll i tid</span>
              <span style={{ flex: 1, height: 1, background: FARG.linje }} />
            </div>
          </>
        )}

        {/* Block 2 — tiden, stor. Inga klockfält: tryck på en tid, sedan +/− en kvart. */}
        <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs, marginTop: kanStarta ? AVSTAND.m : AVSTAND.xl, marginLeft: -AVSTAND.s }}>
          {tidKnapp("start", minTillKlocka(form.startMin), "Starttid")}
          <span style={{ ...TYP.tal, color: FARG.text3 }}>–</span>
          {tidKnapp("slut", oppenLage ? "pågår" : form.slutMin != null ? minTillKlocka(form.slutMin) : "--:--", "Sluttid", oppenLage)}
        </div>
        {steg ? (
          <div className="tona-in" role="group" aria-label={steg === "start" ? "Ändra starttid" : "Ändra sluttid"} style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, marginTop: AVSTAND.s }}>
            {stegKnapp(-1, "remove", "En kvart tidigare", kanMinus)}
            <span style={{ ...TYP.meta, color: FARG.text2 }}>{steg === "start" ? "Start" : "Slut"} · en kvart per tryck</span>
            {stegKnapp(1, "add", "En kvart senare", kanPlus)}
          </div>
        ) : (
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>tryck på en tid för att ändra</p>
        )}

        {/* Block 3 — hur länge (efterhandsregistrering) */}
        <div style={{ marginTop: AVSTAND.xl }}>
          <Segment etikett="Hur länge" valt={valdLangd} onVal={valjLangd} inaktiva={langdInaktiva} varden={langdVarden} />
          {ingetRymsAnnu && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text3 }}>Det finns ingen färdig tid att lägga till ännu — nästa kvart.</p>}
        </div>
        {/* Block 4 — aktivitet, Faktureras + kommentar, Spara */}
        <div style={{ marginTop: AVSTAND.xl }}>
          {aktivitetSegment(form.typ, t => setForm(f => (f ? { ...f, typ: t, deb: debFor(t) } : f)))}
        </div>

        {fakturerasKommentar(form.deb, d => setForm(f => (f ? { ...f, deb: d } : f)), form.kommentar,
          k => setForm(f => (f ? { ...f, kommentar: k } : f)), kommentarOppen, () => setKommentarOppen(true))}

        {framtid && <p role="status" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{oppenLage ? "Starten ligger efter klockan nu. Flytta den tidigare — framtida tid kan inte sparas." : "Slutet ligger efter klockan nu. Korta tiden — framtida tid kan inte sparas."}</p>}
        {krock && <p role="status" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.orange }}>Krockar med {traktNamn(krock.objekt_id) || aktLabel(krock.aktivitet_typ)} {hh(krock.start_tid)}–{hh(krock.slut_tid) || "?"}</p>}
        {formFel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{formFel}</p>}

        {rastFraga === "tid" && kanSpara && min > RAST_FRAN_MIN
          ? (rastLangd
            ? <RastLangd onVal={rastFranTid} onTillbaka={() => setRastLangd(false)} />
            : <RastFraga onIngen={() => spara(true)} onLagg={() => setRastLangd(true)} />)
          : (
            <button type="button" onClick={() => { if (kanSpara) spara(); }} aria-disabled={!kanSpara}
              style={{ ...KNAPP.primar, marginTop: AVSTAND.l, ...(kanSpara ? {} : INAKTIV) }}>
              {sparaText}
            </button>
          )}

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

        {pagarKort()}
        {kortFel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{kortFel}</p>}

        {kvitto && (
          <p role="status" className="tona-in" style={{ margin: `${AVSTAND.l}px 0 0`, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.kort, borderRadius: RADIE.rad, ...TYP.meta, ...TNUM, color: FARG.text, whiteSpace: "pre-line" }}>
            {kvitto}
          </p>
        )}

        {forslag && !oppenRad && (
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
                    <button type="button" onClick={() => oppnaDagen(d.datum)} aria-label={`Öppna dagen ${datumKort(d.datum)}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", minHeight: TRAFFYTA.min, paddingTop: AVSTAND.s, paddingBottom: 0, paddingLeft: 0, paddingRight: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", ...TYP.micro, ...TNUM, color: FARG.text2 }}>
                      <span>{relativDag(d.datum, idag) === datumKort(d.datum) ? datumKort(d.datum) : `${relativDag(d.datum, idag)} · ${datumKort(d.datum)}`}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.xs }}>{timText(d.summaMin)}<span className="material-symbols-outlined" style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span></span>
                    </button>
                    {d.perioder.map((p, i) => rad(p.id, "schedule",
                      p.objekt_id ? traktNamn(p.objekt_id) : <span style={{ color: FARG.orange }}>Trakt saknas</span>,
                      `${hh(p.start_tid)}–${hh(p.slut_tid)} · ${aktKort(aktLabel(p.aktivitet_typ))}${(p.rast_min ?? 0) > 0 ? ` · rast ${p.rast_min} min` : ""}${p.kommentar ? ` · ${p.kommentar}` : ""}`,
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
          Dagen bekräftas som vanligt under Dag eller Kalender. Fakturering och kommentar ändras via raden i listan.
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
