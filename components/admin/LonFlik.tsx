"use client";
import React, { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { sistaDagenIManaden } from "@/lib/datumLokal";
import { AVSTAND, FARG, RADIE, TYP, KNAPP, TRAFFYTA } from "@/lib/design/tokens";
import { Kort, Ikon } from "./ui";
import { useAdminNav } from "./nav";
import { tidigarelagdMonster } from "@/lib/tidigarelagdStart";
// Tidsavvikelser, ledighetskollision, OB och oenighet bor nu i granskningsvyn
// (FortnoxExportSektion) — de kommer ur dry_run-svaret, samma kodväg som exporten.
import LonesystemUnderflik from "./LonesystemUnderflik";
import AtkUnderflik from "./AtkUnderflik";
import VilobrottUnderflik from "./VilobrottUnderflik";
// Dagar = kontrollvyn: alla förares dagar ur samma dry_run, larm på befintliga
// regler. Byggd mot lib/design/tokens — första admin-ytan som är det.
import DagarUnderflik from "./DagarUnderflik";

// Kort i granskningen: luft mellan staplade kort.
const Card = ({ children, style }: { children: React.ReactNode; style?: CSSProperties }) => <Kort style={{ marginBottom: AVSTAND.m, ...style }}>{children}</Kort>;

// Sektionsrubrik i granskningen (liten, versal, grå).
const secHead: CSSProperties = { ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.sektion}px 0 ${AVSTAND.m}px` };
const btnPrimary: CSSProperties = KNAPP.primar;
const btnSecondary: CSSProperties = KNAPP.sekundar;

type Underflik = "underlag" | "dagar" | "system" | "atk" | "vila";
type CurrentUser = { id: string; namn?: string | null; roll: string };

const UNDERFLIKAR: { key: Underflik; label: string }[] = [
  { key: "underlag", label: "Löneunderlag" },
  { key: "dagar",    label: "Dagar" },
  { key: "system",   label: "Lönesystem" },
  { key: "atk",      label: "ATK-val" },
  { key: "vila",     label: "Vilobrott" },
];

export default function LonFlik({ currentUser }: { currentUser: CurrentUser }) {
  // Underfliken står i adressen (?underflik=…): en omladdning stannar på samma ställe.
  const { nav, sattUnderflik } = useAdminNav();
  const aktiv: Underflik = UNDERFLIKAR.some(u => u.key === nav.underflik) ? (nav.underflik as Underflik) : "underlag";
  return (
    <>
      <UnderflikTabs aktiv={aktiv} onValj={sattUnderflik} />
      {aktiv === "underlag" && <Loneunderlag />}
      {aktiv === "dagar"    && <DagarUnderflik />}
      {aktiv === "system"   && <LonesystemUnderflik />}
      {aktiv === "atk"      && <AtkUnderflik currentUser={currentUser} />}
      {aktiv === "vila"     && <VilobrottUnderflik />}
    </>
  );
}

/** Flikraden bryter aldrig rad: i telefon rullar den i sidled i stället. */
function UnderflikTabs({ aktiv, onValj }: { aktiv: Underflik; onValj: (k: Underflik) => void }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: AVSTAND.xs, marginBottom: AVSTAND.sektion, overflowX: "auto", scrollbarWidth: "none" }}>
      {UNDERFLIKAR.map(t => (
        <button key={t.key} role="tab" aria-selected={aktiv === t.key} onClick={() => onValj(t.key)} style={{
          flex: "0 0 auto", minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, whiteSpace: "nowrap",
          background: aktiv === t.key ? FARG.fyllning : "transparent", border: "none", borderRadius: RADIE.knapp,
          color: aktiv === t.key ? FARG.text : FARG.text2, ...TYP.listtitel, fontSize: TYP.meta.fontSize,
          cursor: "pointer", fontFamily: "inherit",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

/* ─── LÖNEUNDERLAG ─── */
// Löneunderlaget ÄR Fortnox-granskningen (dry_run = exakt det exporten skickar). Den tidigare kronalistan
// (Sammanlagt, Per medarbetare i kronor, förarens kronvy, CSV) är borttagen: appen visar mängder och
// Fortnox räknar kronor, och listan räknade km som totalt + kväll (1,5 gånger för höga) mot hårdkodade satser.

type Medarbetare = { id: string; namn: string | null };

function månadsLabel(period: string): string {
  const [å, m] = period.split("-").map(Number);
  return new Date(å, m - 1, 1).toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
}

function periodNu(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
}

function periodOffset(period: string, delta: number): string {
  const [å, m] = period.split("-").map(Number);
  const d = new Date(å, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Loneunderlag() {
  const [period, setPeriod] = useState(periodNu());
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [tidigarelagdAlla, setTidigarelagdAlla] = useState<any[]>([]);
  const [tlFel, setTlFel] = useState<string | null>(null);
  const [fortnoxData, setFortnoxData] = useState<any>(null);
  const [fortnoxLaddar, setFortnoxLaddar] = useState(false);
  const [visaBekräftelse, setVisaBekräftelse] = useState(false);
  const [skickar, setSkickar] = useState(false);
  const [exportResultat, setExportResultat] = useState<any>(null);
  // Årets övertid per förare — tre modeller, ingen vald (lib/lonesystem/arsovertid).
  const [arsovertid, setArsovertid] = useState<any>(null);

  // Löneperiod = arbetsmånad + 1 (samma regel som Fortnox-granskningen och /api/lon/min-manad).
  // Allt som visas under en löneperiod gäller ARBETSMÅNADEN, så "maskinstart senare" läser den, inte löneperiodens egen månad.
  const arbetsManad = periodOffset(period, -1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lon/arsovertid")
      .then(r => r.json())
      .then(j => { if (!cancelled) setArsovertid(j); })
      .catch(e => { if (!cancelled) setArsovertid({ ok: false, meddelande: e?.message || String(e) }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTlFel(null);
    (async () => {
      try {
        const [å, m] = arbetsManad.split("-").map(Number);
        const start = arbetsManad + "-01";
        const slut = sistaDagenIManaden(å, m); // sista dagen i månaden (LOKALT — toISOString tappade den i UTC+2)
        const [medRes, tlRes] = await Promise.all([
          supabase.from("medarbetare").select("id, namn").order("namn"),
          // "Maskinstart senare än angiven" — eget kort, ingår ej i löneunderlaget
          supabase.from("arbetsdag").select("medarbetare_id, datum, tidigarelagd_start")
            .not("tidigarelagd_start", "is", null)
            .gte("datum", start).lte("datum", slut),
        ]);
        if (cancelled) return;
        if (medRes.error) throw medRes.error;
        if (tlRes.error) throw tlRes.error;
        setMedarbetare(medRes.data || []);
        setTidigarelagdAlla(tlRes.data || []);
      } catch (e: any) {
        if (!cancelled) { setTidigarelagdAlla([]); setTlFel(e.message || String(e)); }
      }
    })();
    return () => { cancelled = true; };
  }, [arbetsManad]);

  // Granskningsvyn auto-laddar löneunderlaget (dry_run = EXAKT det exporten skickar,
  // per konstruktion — samma resultat itereras vid skarp sändning). Martin ser hela
  // underlaget direkt när månaden byts, utan att trycka Förhandsgranska först.
  useEffect(() => {
    let cancelled = false;
    setFortnoxLaddar(true); setFortnoxData(null); setExportResultat(null);
    (async () => {
      try {
        const res = await fetch("/api/fortnox/salary-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, dry_run: true }),
        });
        if (!cancelled) setFortnoxData(await res.json());
      } catch (e: any) {
        if (!cancelled) setFortnoxData({ ok: false, meddelande: e.message });
      } finally {
        if (!cancelled) setFortnoxLaddar(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const tlNamn = new Map<string, string>(medarbetare.map(m => [m.id, m.namn || m.id] as [string, string]));
  const tlMon = tidigarelagdMonster(tidigarelagdAlla);
  const fmtH = (min: number) => { const h = Math.floor(min / 60), mm = min % 60; return mm ? `${h} tim ${mm} min` : `${h} tim`; };

  return (
    <>
      {/* Månadsväljare */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${AVSTAND.s}px ${AVSTAND.l}px` }}>
        <button onClick={() => setPeriod(periodOffset(period, -1))} aria-label="Föregående månad" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, color: FARG.text }}>
          <Ikon namn="chevron_left" farg={FARG.text} />
        </button>
        <span style={{ ...TYP.listtitel, color: FARG.text, textTransform: "capitalize" }}>
          {månadsLabel(period)}
        </span>
        <button onClick={() => setPeriod(periodOffset(period, 1))} disabled={period >= periodNu()} aria-label="Nästa månad"
          style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, color: FARG.text, opacity: period >= periodNu() ? 0.4 : 1, cursor: period >= periodNu() ? "default" : "pointer" }}>
          <Ikon namn="chevron_right" farg={FARG.text} />
        </button>
      </Card>

      {/* ÅRETS ÖVERTID MOT TAKET — det Martin behöver se som arbetsgivare.
          Fyra modeller: de tre appen räknat med, och AVTALETS (§5 mom 2: 40 tim
          i genomsnitt över ≤ 16 veckor). Beräkningsperioderna är markerade
          utjämningsperioder (tabellen utjamningsperiod — Gävle v17–27 2026 var
          ordinarie tid utlagd ojämnt, INTE komp) plus antagna block däremellan.
          Ingen av de tre första är avtalets, frånvaro/komp är inte avdragna —
          talen är sannolikt för höga. Därför INGET rött "passerat taket"
          (2026-09-17: det larmet var falskt — Stefan låg på 34 tim/vecka i snitt
          när kortet sa 271). Färg bara på avtalskolumnen: orange inom 50 tim,
          röd över. */}
      {arsovertid && (
        <Card>
          <p style={{ ...secHead, marginTop: 0 }}>Övertid {arsovertid.ar ?? new Date().getFullYear()} mot taket{arsovertid.tak ? ` ${arsovertid.tak} tim` : ""}</p>
          {!arsovertid.ok ? (
            <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte läsa årets övertid: {arsovertid.meddelande || "okänt fel"}</p>
          ) : (() => {
            const tak = Number(arsovertid.tak || 250);
            const modeller: any[] = arsovertid.modeller || [];
            const farg = (h: number) => h >= tak ? FARG.rod : h >= tak - 50 ? FARG.orange : FARG.text;
            const rader: any[] = [...(arsovertid.medarbetare || [])].sort((a, b) => (b.modeller?.genomsnitt || 0) - (a.modeller?.genomsnitt || 0));
            const utjamning: any[] = arsovertid.utjamning || [];
            const periodText = (p: any) => `v${p.fran}–${p.till}${p.markerad ? " (markerad)" : " (antagen)"}: ${Number(p.timmar).toLocaleString("sv-SE")} tim på ${p.veckor} v → ${Number(p.overtid).toLocaleString("sv-SE")}`;
            return (
              <>
                <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text }}>
                  <strong>Ingen av de tre första kolumnerna är avtalets modell.</strong> Skogsavtalet §5 mom 2: ordinarie arbetstid är 40 tim/vecka <em>i genomsnitt över en beräkningsperiod om högst 16 veckor</em> — kolumnen <strong>Genomsnitt</strong>. Perioderna är de markerade utjämningsperioderna nedan; veckorna däremellan räknas i antagna block om högst 16 veckor.
                </p>
                {/* Markerade utjämningsperioder = fakta om vad som gjordes. Avtalet
                    förutsätter att utjämningen är ÖVERENSKOMMEN — raden bevisar inte det. */}
                {arsovertid.utjamning_fel ? (
                  <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.orange }}>Kunde inte läsa utjämningsperioder ({arsovertid.utjamning_fel}) — allt räknas som antagna block.</p>
                ) : utjamning.length === 0 ? (
                  <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>Inga markerade utjämningsperioder {arsovertid.ar} — allt räknas som antagna block från vecka 1.</p>
                ) : utjamning.map((u: any, ui: number) => (
                  <p key={ui} style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text }}>
                    <strong>Utjämningsperiod {u.startdatum} – {u.slutdatum}</strong>{u.medarbetare_id ? "" : " (alla)"}: <span style={{ color: FARG.text2 }}>{u.anteckning}</span>
                  </p>
                ))}
                <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text }}>
                  Avtalet förutsätter att utjämning över mer än en vecka är <strong>överenskommen</strong>. En markerad period är en anteckning om vad som gjordes, inte ett bevis på att det var avtalat. Längre än 16 veckor kräver lokal överenskommelse.
                </p>
                <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.text2 }}>
                  En tom vecka räknas i basen bara om den är utjämnad ordinarie tid — var den semester ska den inte vara med, och då stiger övertiden; inom en markerad period vet appen vad en tom vecka betyder, utanför vet den det inte. Frånvaro och komp (§8 mom 3, räknas inte som övertid enligt §5 mom 5 anm 3) är inte avdragna, så alla tal är sannolikt för höga. Exporten räknar i dag mot arbetade dagar, Min tid mot kalenderns vardagar. T.o.m. {arsovertid.tomDatum}.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: `1.4fr repeat(${modeller.length}, 1fr)`, gap: "4px 8px", ...TYP.meta, alignItems: "baseline" }}>
                  <span style={{ color: FARG.text2 }}>Förare</span>
                  {modeller.map(m => <span key={m.key} style={{ color: m.avtalet ? FARG.text : FARG.text2, fontWeight: m.avtalet ? 700 : 400, textAlign: "right" }} title={`${m.beskrivning} — ${m.anvandsAv}`}>{m.namn}{m.avtalet ? " (avtalet)" : ""}</span>)}
                  {rader.map(r => (
                    <React.Fragment key={r.medarbetare_id}>
                      <span style={{ color: FARG.text, ...TYP.meta, padding: `${AVSTAND.xs}px 0`, borderTop: `1px solid ${FARG.linje}` }}>{r.namn} <span style={{ color: FARG.text2, ...TYP.meta }}>{Number(r.timmar).toLocaleString("sv-SE")} tim</span></span>
                      {modeller.map(m => {
                        const h = Number(r.modeller?.[m.key] || 0);
                        const title = m.avtalet && Array.isArray(r.perioder) ? r.perioder.map(periodText).join("\n") : undefined;
                        return <span key={m.key} title={title} style={{ textAlign: "right", ...TYP.meta, fontWeight: m.avtalet ? 700 : 400, color: m.avtalet ? farg(h) : FARG.text2, padding: `${AVSTAND.xs}px 0`, borderTop: `1px solid ${FARG.linje}`, fontVariantNumeric: "tabular-nums" }}>{h.toLocaleString("sv-SE")}</span>;
                      })}
                    </React.Fragment>
                  ))}
                </div>
                {/* Per förare: hur genomsnittet fördelar sig på perioderna — så man
                    ser VAR övertiden kommer ifrån (Stefan: v1–16 och sensommaren, inte Gävle). */}
                {rader.some(r => Array.isArray(r.perioder) && r.perioder.length > 0) && (
                  <div style={{ marginTop: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
                    {rader.filter(r => Array.isArray(r.perioder)).map(r => (
                      <p key={`per-${r.medarbetare_id}`} style={{ margin: `0 0` }}>
                        <span style={{ color: FARG.text }}>{r.namn.split(" ")[0]}</span>: {r.perioder.map(periodText).join(" · ")}
                      </p>
                    ))}
                  </div>
                )}
                <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
                  {modeller.map(m => `${m.namn}: ${m.beskrivning} (${m.anvandsAv})`).join(" · ")}
                </p>
              </>
            );
          })()}
        </Card>
      )}

      {tlFel && (
        <Card style={{ border: `1px solid ${FARG.rod}` }}>
          <p style={{ margin: 0, color: FARG.rod, ...TYP.meta }}>Kunde inte läsa maskinstart-kortet: {tlFel}</p>
        </Card>
      )}
      {!tlFel && tlMon.length > 0 && (
        <Card>
          <p style={{ ...secHead, marginTop: 0 }}>Maskinstart senare än angiven · {månadsLabel(arbetsManad)}</p>
          <p style={{ margin: '0 0 8px', ...TYP.meta, color: FARG.text2 }}>Dagar där föraren angav en start mer än 30 min före maskinens login. Mönster, inte enskilda dagar — angiven tid styr fortsatt lönen.</p>
          {tlMon.map((m, i) => (
            <div key={m.medarbetare_id} style={{ display: 'flex', justifyContent: 'space-between', ...TYP.meta, color: FARG.text, padding: '9px 0', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
              <span>{tlNamn.get(m.medarbetare_id) || m.medarbetare_id}</span>
              <span style={{ color: m.dagar >= 10 ? FARG.orange : FARG.text2, fontWeight: m.dagar >= 10 ? 600 : 400 }}>{m.dagar} dag{m.dagar === 1 ? '' : 'ar'} · {fmtH(m.summaMin)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Fortnox-granskningen */}
      <p style={{ ...secHead, marginTop: AVSTAND.xl }}>Fortnox-export</p>
      <FortnoxExportSektion
        period={period}
        fortnoxData={fortnoxData}
        fortnoxLaddar={fortnoxLaddar}
        onFörhandsgranska={async () => {
          setFortnoxLaddar(true); setExportResultat(null);
          try {
            const res = await fetch("/api/fortnox/salary-export", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ period, dry_run: true }),
            });
            setFortnoxData(await res.json());
          } catch (e: any) {
            setFortnoxData({ ok: false, meddelande: e.message });
          } finally { setFortnoxLaddar(false); }
        }}
        onSkicka={() => setVisaBekräftelse(true)}
        exportResultat={exportResultat}
      />

          {/* Bekräftelsedialog */}
          {visaBekräftelse && fortnoxData?.medarbetare && (
            <div onClick={() => setVisaBekräftelse(false)} style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.7)", zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center", padding: AVSTAND.xl,
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: FARG.kort, borderRadius: RADIE.sheet, padding: AVSTAND.xl,
                width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "auto",
              }}>
                <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.listtitel, fontWeight: 700, color: FARG.text, textAlign: "center" }}>
                  Skicka till Fortnox?
                </p>
                <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>
                  Löneperiod {månadsLabel(period)} (arbetstid {fortnoxData.arbetsperiod ? månadsLabel(fortnoxData.arbetsperiod) : "—"}).
                  {" "}{fortnoxData.medarbetare.length} medarbetare, {fortnoxData.totalt_rader} lönerader.
                </p>
                {fortnoxData.medarbetare.filter((m: any) => m.varningar?.length > 0).length > 0 && (
                  <div style={{ marginBottom: AVSTAND.m, padding: AVSTAND.m, background: FARG.upphojt, borderRadius: RADIE.rad, ...TYP.meta, color: FARG.orange }}>
                    ⚠ Det finns varningar — granska innan du skickar.
                  </div>
                )}
                {fortnoxData.medarbetare.map((m: any, i: number) => (
                  <div key={i} style={{ padding: `${AVSTAND.s}px 0`, borderBottom: `1px solid ${FARG.linje}`, ...TYP.meta }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: FARG.text }}>{m.namn}</span>
                      <span style={{ color: m.status === "skickat" ? FARG.gron : FARG.text }}>{m.rader.length} rader</span>
                    </div>
                    {m.status === "skickat" && <span style={{ ...TYP.meta, color: FARG.gron }}>Redan skickat</span>}
                    {!m.anstallningsnummer && <span style={{ ...TYP.meta, color: FARG.rod }}>Saknar anst.nr</span>}
                  </div>
                ))}
                <div style={{ display: "flex", gap: AVSTAND.s, marginTop: AVSTAND.l }}>
                  <button onClick={() => setVisaBekräftelse(false)} style={{ ...btnSecondary, flex: 1 }}>Avbryt</button>
                  <button
                    onClick={async () => {
                      setSkickar(true);
                      try {
                        const res = await fetch("/api/fortnox/salary-export", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ period }),
                        });
                        setExportResultat(await res.json());
                      } catch (e: any) {
                        setExportResultat({ ok: false, meddelande: e.message });
                      } finally {
                        setSkickar(false);
                        setVisaBekräftelse(false);
                        // Refresh förhandsgranskning
                        const res2 = await fetch("/api/fortnox/salary-export", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ period, dry_run: true }),
                        });
                        setFortnoxData(await res2.json());
                      }
                    }}
                    disabled={skickar}
                    style={{ ...btnPrimary, flex: 1, opacity: skickar ? 0.5 : 1 }}
                  >{skickar ? "Skickar…" : "Skicka till Fortnox"}</button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}

/* ─── FORTNOX EXPORT SEKTION ─── */

const LONEART_LABELS: Record<string, string> = {
  "11": "Timlön", "136": "Vältlappar mm", "821": "Färdtidsersättning",
  "1354": "Premielön skotare", "1355": "Premielön skördare",
  "1435": "Övertid skördare", "1436": "Övertid skotare",
};

// Enhet per löneart — MÄNGDER, inte kronor (Fortnox äger satsen). Antalet i
// Number tolkas alltså som: timmar / veckor / påbörjade mil.
const LONEART_ENHET: Record<string, string> = {
  "11": "tim", "1354": "tim", "1355": "tim", "1435": "tim", "1436": "tim",
  "136": "veckor", "821": "mil",
};

function FortnoxExportSektion({
  period, fortnoxData, fortnoxLaddar, onFörhandsgranska, onSkicka, exportResultat,
}: {
  period: string;
  fortnoxData: any;
  fortnoxLaddar: boolean;
  onFörhandsgranska: () => void;
  onSkicka: () => void;
  exportResultat: any;
}) {
  if (!fortnoxData) {
    return (
      <Card>
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>
          {fortnoxLaddar
            ? `Läser löneunderlag för ${månadsLabel(period)}…`
            : `Löneperiod ${månadsLabel(period)} = arbetstid föregående månad.`}
        </p>
        {!fortnoxLaddar && (
          <button onClick={onFörhandsgranska} style={btnSecondary}>Läs löneunderlag</button>
        )}
      </Card>
    );
  }

  if (!fortnoxData.ok) {
    return (
      <Card style={{ border: `1px solid ${FARG.rod}` }}>
        <p style={{ margin: 0, color: FARG.rod, ...TYP.meta }}>{fortnoxData.meddelande || "Kunde inte beräkna."}</p>
      </Card>
    );
  }

  const medarbetare = fortnoxData.medarbetare || [];
  const arbetsperiodLabel = fortnoxData.arbetsperiod ? månadsLabel(fortnoxData.arbetsperiod) : "—";

  return (
    <>
      {/* Export-resultat */}
      {exportResultat && (
        <Card style={{ marginBottom: AVSTAND.m }}>
          <p style={{ margin: 0, ...TYP.meta, fontWeight: 600, color: exportResultat.ok ? FARG.gron : FARG.rod }}>
            {exportResultat.ok
              ? `✓ ${exportResultat.skickade} lönerader skickade till Fortnox.`
              : `Fel: ${exportResultat.meddelande || `${exportResultat.fel} fel uppstod.`}`}
          </p>
          {exportResultat.felMeddelanden?.length > 0 && (
            <ul style={{ margin: `${AVSTAND.s}px 0 0`, paddingLeft: AVSTAND.l, ...TYP.meta, color: FARG.rod }}>
              {exportResultat.felMeddelanden.map((f: string, i: number) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </Card>
      )}

      {/* Periodinfo */}
      <Card>
        <p style={{ margin: 0, ...TYP.text, color: FARG.text }}>
          Löneperiod <strong>{månadsLabel(period)}</strong> — arbetstid <strong>{arbetsperiodLabel}</strong>
        </p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          {medarbetare.length} medarbetare · {fortnoxData.totalt_rader} lönerader. Mängder (timmar, veckor, mil) — aldrig kronor. Fortnox äger satserna.
        </p>
      </Card>

      {/* Att ta med löneansvarig — tre slag. Reseersättningens två frågor
          besvarades 2026-09-12 (koden gjorde rätt). Avtalsboken lästes
          2026-09-17 (docs/lonesystem/skogsavtalet-arbetstid.md) och svarade på
          fyra av de tidigare frågorna — de står nu som BEKRÄFTELSER av avtals-
          text, inte som öppna frågor. Kvar som rena frågor: två lönearter. Två
          saker är Martins egna beslut som arbetsgivare, inte löneansvarigas.
          Tills lönearterna är svarade läggs OB, sjuk och helglön INTE som
          lönerader — de står under "påverkar riktigheten". */}
      <Card style={{ marginTop: AVSTAND.m }}>
        <p style={{ ...secHead, marginTop: 0, color: FARG.orange }}>Att ta med löneansvarig</p>
        {([
          ["Fråga", "Löneart för brandrisk-OB", "timmarna räknas (lib/ob) men skickas inte förrän koden är fastställd."],
          ["Fråga", "Löneart för sjuklön, VAB och föräldraledig", "dagarna ur morgonkortet och godkänd ledighet syns i underlaget men skickas inte."],
          ["Fråga", "Levereras sjukfrånvaro i timmar per dag?", "§12 mom 3 räknar karens i timmar (20 % av veckoarbetstiden = 8 tim vid 40) och sjuklön per timme som skulle ha arbetats. En halv sjukdag är 3 tim, inte en dag. Räknar Fortnox karensavdraget och de 80 procenten själv när appen skickar timmarna?"],
          ["Bekräfta", "Ordinarie tid är ett genomsnitt", "§5 mom 2: 40 tim/vecka i genomsnitt över en beräkningsperiod om högst 16 veckor. Ingen av appens tre gamla modeller är avtalets."],
          ["Bekräfta", "Komp räknas inte mot 250-taket", "§8 mom 3: övertid kan efter överenskommelse tas ut som ledighet, 1,4 tim per övertidstimme. §5 mom 5 anm 3: sådan tid är inte övertid enligt arbetstidslagen."],
          ["Bekräfta", "Gävle var utjämnad ordinarie tid", "§5 mom 2: 72–80 tim varannan vecka med tom vecka emellan och lön enligt schema är genomsnittsberäkning av ordinarie tid — inte kompensationsledighet. Perioden (v17–27 2026) är markerad i systemet; att utjämningen var överenskommen är inte bevisat av det."],
          ["Bekräfta", "Arbetad röd dag ger ingen helglön", "§10 mom 2: helglön är grundlön för timmar som bortfaller. Den som jobbar får lön för timmarna + söndagstillägg (§8 mom 1) — inte helglön dessutom. Närvarokravet står i §10 mom 4."],
          ["Bekräfta", "Bytesdag är skoftning", "§5 mom 4: ledig vardag mot inarbetning avtalas samtidigt, lön enligt ordinarie schema om totalen är lika. Ingen helglön flyttas."],
          ["Martins beslut", "Beräkningsperiod och schema", "vilka 16-veckorsperioder som gäller (kortet överst antar v1–16, v17–32, …), och om förarna ska ha ett fastställt schema. Utjämningen ska vara överenskommen. Samma beslut avgör deldagens \"timmar som skulle ha arbetats\" (§12 mom 3 anm 2) — tills dess antar granskningen 8 tim/dag."],
          ["Martins beslut", "Var komp-saldot bor", "i Fortnox (appen rapporterar bara intjänat/uttaget) eller i appen (appen räknar saldot). Appen räknar aldrig kronor — men ett saldo i timmar är en mängd."],
        ] as [string, string, string][]).map(([slag, rubrik, text], i, arr) => (
          <div key={rubrik} style={{ display: "flex", gap: AVSTAND.s, padding: `${AVSTAND.xs}px 0`, borderBottom: i === arr.length - 1 ? "none" : `1px solid ${FARG.linje}` }}>
            <span style={{ color: FARG.orange }}>▸</span>
            <p style={{ margin: 0, ...TYP.meta, color: FARG.text }}><span style={{ color: FARG.text2, ...TYP.meta, textTransform: "uppercase", letterSpacing: 0.4, marginRight: AVSTAND.xs }}>{slag}</span><strong>{rubrik}</strong> — <span style={{ color: FARG.text2 }}>{text}</span></p>
          </div>
        ))}
      </Card>

      {/* Granskningsvy — per medarbetare: vad som GÅR till Fortnox (löneart, mängd,
          enhet) och vad som PÅVERKAR RIKTIGHETEN men inte går med. Allt ur dry_run-
          svaret = exakt samma kodväg som exporten. */}
      <Card style={{ padding: 0 }}>
        {medarbetare.map((m: any, mi: number) => {
          const rader = m.rader || [];
          const synk = m.synk || [];
          const ledK = m.ledighetskollision || [];
          const maskinLuckor = m.maskin_utan_typ || [];
          const ob = m.ob || { timmar: 0, dagar: 0, obesvarade: 0 };
          const rastLanga = m.rast_langa || [];
          const kortpass = m.kortpass || [];
          const orimliga = m.orimliga || [];
          const utanRast = m.utan_rast || { dagar: 0, timmar: 0, datum: [] };
          const helglon = m.helglon || { dagar: [], timmar: 0 };
          const byten: any[] = m.byten || []; // bytesdagar (inarbetad, §5 mom 4) som rör månaden
          const deldagar: any[] = m.deldagar || []; // sjuk/VAB från ett klockslag — arbete plus frånvaro (§12 mom 3 räknar timmar)
          // "saknar typ" och kortpass visas som strukturerade rader — filtrera bort
          // ur textvarningarna så samma sak inte står två gånger.
          const ovrigaVarn = (m.varningar || []).filter((v: string) => !/saknar typ|^Kortpass|^Helglön/i.test(v));
          const oen = (fortnoxData.oenighet || []).filter((o: any) => o.svar.some((s: any) => s.medarbetare_id === m.medarbetare_id));
          const harRiktighet = maskinLuckor.length > 0 || synk.length > 0 || ledK.length > 0 ||
            (m.obekraftade || 0) > 0 || ob.timmar > 0 || ob.obesvarade > 0 || oen.length > 0 || ovrigaVarn.length > 0 ||
            rastLanga.length > 0 || kortpass.length > 0 || orimliga.length > 0 || utanRast.dagar > 0 || helglon.dagar.length > 0 || byten.length > 0 || deldagar.length > 0;
          const fmtMin = (min: number) => { const h = Math.floor(min / 60), mm = Math.round(min % 60); return mm ? `${h} tim ${mm} min` : `${h} tim`; };
          return (
            <div key={mi} style={{
              padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
              borderBottom: mi === medarbetare.length - 1 ? "none" : `1px solid ${FARG.linje}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: AVSTAND.s }}>
                <span style={{ ...TYP.listtitel, fontWeight: 600, color: FARG.text }}>{m.namn}</span>
                <StatusBadge status={m.status} />
              </div>
              {!m.anstallningsnummer && (
                <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.rod }}>⚠ Anställningsnummer saknas — går inte att skicka</p>
              )}

              {/* SEKTION 1 — Går till Fortnox */}
              <p style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.meta, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: FARG.gron }}>Går till Fortnox</p>
              {rader.length > 0 ? (
                <div>
                  {rader.map((r: any, ri: number) => (
                    <div key={ri} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", ...TYP.meta, padding: `${AVSTAND.xs}px 0`, gap: AVSTAND.s }}>
                      <span style={{ color: FARG.text }}>{LONEART_LABELS[r.SalaryCode] || r.SalaryCode} <span style={{ color: FARG.text2, ...TYP.meta }}>({r.SalaryCode})</span></span>
                      <span style={{ color: FARG.text, fontWeight: 600, whiteSpace: "nowrap" }}>{r.Number} <span style={{ ...TYP.meta, color: FARG.text2 }}>{LONEART_ENHET[r.SalaryCode] || ""}</span></span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: `0 0 0`, ...TYP.meta, color: FARG.text2 }}>Inga lönerader denna period.</p>
              )}

              {/* SEKTION 2 — Påverkar riktigheten men går inte med */}
              {harRiktighet && (
                <>
                  <p style={{ margin: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, ...TYP.meta, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: FARG.orange }}>Påverkar riktigheten — går inte med</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: AVSTAND.xs }}>
                    {maskinLuckor.map((mid: string) => (
                      <p key={mid} style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>
                        Maskin <strong>{mid}</strong> saknar typ i maskinregistret → premielön beräknas inte. Lägg in maskinen (skördare/skotare) för att få med premien.
                      </p>
                    ))}
                    {/* Lång rast = troligen stillestånd bokfört som "Meal break" i terminalen.
                        Maskinens egna avbrott samma dag är stödet — ett "Övrigt" med samma
                        start som rasten är mönstret (lib/arbetsdagRegler). Fel rast = fel
                        betald tid, rakt in i övertiden. */}
                    {/* Orimliga pass — en FRÅGA, inte ett påstående om fel: en 16-timmarsdag
                        kan vara äkta (Dalarna). Negativ tid = rasten längre än passet;
                        kläms aldrig till noll, ska synas tills någon rättar. */}
                    {/* Ingen rast på långa pass — EN summeringsrad, inte en per dag: på
                        Ponsse-skotarna loggas rasten aldrig i filen och förarna kör i regel
                        hela dagar utan rast, så noll är korrekt där. Information till
                        arbetsgivaren, ingen fråga till föraren (lib/arbetsdagRegler). */}
                    {utanRast.dagar > 0 && (
                      <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>
                        <strong style={{ color: FARG.text }}>{utanRast.dagar} dag{utanRast.dagar === 1 ? "" : "ar"} över 6 tim utan rast</strong> ({utanRast.timmar.toLocaleString("sv-SE")} tim) — noll rast räknas som hel arbetstid, i övertid och vilotid. Skotarna loggar ingen rast i filen och körs i regel utan.
                        <span title={utanRast.datum.join(", ")}> {utanRast.datum.slice(0, 6).map((d: string) => d.slice(5)).join(", ")}{utanRast.datum.length > 6 ? " …" : ""}</span>
                      </p>
                    )}
                    {orimliga.map((o: any) => {
                      const tim = (Math.round(Math.abs(o.arbetad_min) / 6) / 10).toLocaleString("sv-SE");
                      const kl = `${String(o.start_tid || "").slice(0, 5)}–${String(o.slut_tid || "").slice(0, 5)}, rast ${o.rast_min} min`;
                      return (
                        <p key={`orim-${o.datum}`} style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>
                          {o.datum}: {o.slag === "lang"
                            ? <><strong>passet är {tim} tim</strong> ({kl}) — stämmer det? Längre än någon äkta dag hittills; en felskriven sluttid ger samma bild.</>
                            : <><strong>rasten är längre än passet</strong> ({kl}, {o.arbetad_min} min) — stämmer det? Tiden räknas som negativ tills den rättas.</>}
                          <span style={{ color: FARG.text2 }}> Rättas i förarens Redigera.</span>
                        </p>
                      );
                    })}
                    {rastLanga.map((r: any) => {
                      const ovrigt = (r.avbrott || []).filter((a: any) => /övrigt|default/i.test(`${a.typ} ${a.kategori || ""}`));
                      const andra = (r.avbrott || []).filter((a: any) => !ovrigt.includes(a));
                      const beskriv = (a: any) => `${a.typ}${a.kategori && !/default/i.test(a.kategori) ? ` (${a.kategori})` : ""} ${a.minuter} min${a.klockslag ? ` kl ${a.klockslag}` : ""}`;
                      return (
                        <p key={`rast-${r.datum}`} style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>
                          {r.datum}: <strong>rast {r.rast_min} min</strong> — mer än en lunch. {ovrigt.length > 0
                            ? <>Maskinen loggade samtidigt {ovrigt.map(beskriv).join(", ")} — stillestånd bokfört som rast? </>
                            : <>Inget parallellt avbrott loggat. </>}
                          {andra.length > 0 && <span style={{ color: FARG.text2 }}>Övriga avbrott den dagen: {andra.map(beskriv).join(", ")}. </span>}
                          <span style={{ color: FARG.text2 }}>Skogsavtalet §5 mom 6: schemalagd rast är högst 75 min per skift. Rätt rast = rätt betald tid; rättas i förarens Redigera.</span>
                        </p>
                      );
                    })}
                    {/* Kortpass: under arbetsdagströskeln — betald tid men ingen arbetsdag.
                        Oftast en inloggning på någon annans maskin. */}
                    {kortpass.map((k: any) => (
                      <p key={`kort-${k.datum}`} style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>
                        {k.datum}: kortpass <strong>{k.minuter} min</strong>{k.km_totalt > 0 ? ` · ${k.km_totalt} km` : ""} — räknas som tid men inte som arbetsdag (ingen ×8 i övertidsbasen, ingen vältlappsvecka, ingen reseersättning). Felinloggning? Ta bort dagen.
                      </p>
                    ))}
                    {synk.map((s: any, si: number) => (
                      <p key={`syn-${si}`} style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>
                        {s.datum}: <strong>{s.diff_min} min</strong> oförklarad tidsavvikelse — du sa {s.bekraftat}, maskinen {s.maskinen}.
                      </p>
                    ))}
                    {ledK.map((k: any, ki: number) => (
                      <p key={`led-${ki}`} style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>
                        {k.datum}: godkänd ledighet ({k.typ}) OCH {fmtMin(k.arbetad_min)} registrerat arbete.
                      </p>
                    ))}
                    {/* Utjämningsperiod (§5 mom 2) som överlappar månaden: upplysning, inte
                        en lönerad. Månadens övertid mot arbetade dagar × 8 är inte avtalets
                        modell i perioden — genomsnittet står i årsövertiden överst. */}
                    {(m.utjamning || []).map((u: any, ui: number) => (
                      <p key={`utj-${ui}`} style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>
                        Utjämningsperiod <strong style={{ color: FARG.text }}>{u.startdatum} – {u.slutdatum}</strong>: {u.anteckning} Månadens övertidsrad (arbetade dagar × 8) är inte avtalets modell här — se årsövertiden. Avtalet förutsätter att utjämningen är överenskommen; markeringen bevisar inte det.
                      </p>
                    ))}
                    {(m.obekraftade || 0) > 0 && (
                      <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>
                        <strong>{m.obekraftade}</strong> obekräftad{m.obekraftade === 1 ? "" : "e"} arbetsdag{m.obekraftade === 1 ? "" : "ar"} — tiden är med i underlaget men ingen har granskat den.
                      </p>
                    )}
                    {ob.timmar > 0 && (
                      <p style={{ margin: 0, ...TYP.meta, color: FARG.bla }}>
                        Brandrisk-OB: <strong>{ob.timmar} tim</strong> ({ob.dagar} dag{ob.dagar === 1 ? "" : "ar"}) — <em>löneart ej fastställd</em>, läggs inte som lönerad.
                      </p>
                    )}
                    {/* Helglön §10 (lib/lonesystem/helglon): röda vardagar i arbetsmånaden ur
                        avtalets tolv namn, 8 tim per dag utan arbete. Samma väg som OB och
                        sjuk tills lönearten och de två avtalsfrågorna är på plats. */}
                    {helglon.dagar.length > 0 && (
                      <p style={{ margin: 0, ...TYP.meta, color: FARG.bla }}>
                        Helglön §10: <strong>{helglon.timmar} tim</strong> — {helglon.dagar.map((h: any) => `${h.datum.slice(5)} ${h.namn}${h.arbetad ? " (arbetad — ingen helglön, §10 mom 2: inga timmar bortföll; timmarna lönas + söndagstillägg §8 mom 1)" : ""}${h.bytesLedig ? ` (byts mot ledig ${h.bytesLedig.slice(5)}, inarbetad)` : ""}`).join(", ")} — <em>löneart ej fastställd</em>, läggs inte som lönerad.
                      </p>
                    )}
                    {/* Deldagar: arbete PLUS frånvaro samma dag. Timmarna härledda mot
                        schematimmar/dag (antagande tills schema beslutats). Löneart öppen. */}
                    {deldagar.map((dd: any, di: number) => (
                      <p key={`deldag-${di}`} style={{ margin: 0, ...TYP.meta, color: FARG.bla }}>
                        Deldag {dd.datum.slice(5)}: <strong>{dd.typ} {dd.fran_tid ? `från ${dd.fran_tid}` : `till ${dd.till_tid}`}</strong> — {Number(dd.timmar).toLocaleString("sv-SE")} tim frånvaro, arbetade {(Math.round(dd.arbetad_min / 6) / 10).toLocaleString("sv-SE")} tim. Räknat mot {dd.schema_timmar} tim/dag — <em>antagande tills schema beslutats</em> (§12 mom 3 anm 2). Dagen är arbetsdag. <em>Löneart ej fastställd</em>, läggs inte som lönerad.
                      </p>
                    ))}
                    {/* Bytesdagar (skoftning §5 mom 4): upplysning, aldrig lönerad, aldrig avdrag.
                        Orange när något inte stämmer (arbete på den lediga dagen, eller ingen
                        arbetstid på den röda), annars dämpad. */}
                    {byten.map((b: any, bi: number) => {
                      const fel = b.ledigArbetad || !b.ersatterArbetad;
                      return (
                        <p key={`byte-${bi}`} style={{ margin: 0, ...TYP.meta, color: fel ? FARG.orange : FARG.text2 }}>
                          Bytesdag: <strong style={{ color: FARG.text }}>{b.ledig.slice(5)}</strong> inarbetad ledighet ersätter {b.ersatterNamn} {b.ersatter.slice(5)}
                          {b.ledigArbetad
                            ? <> — men den lediga dagen har registrerat arbete: bytet togs inte ut, den röda dagen är en vanlig arbetad röd dag. Granska.</>
                            : !b.ersatterArbetad
                              ? <> — men ingen arbetstid finns registrerad den röda dagen: inarbetningen saknas. Granska; byt typ om dagen ska räknas som annan ledighet.</>
                              : <> (arbetad). Ingen lönerad, inget avdrag; den röda dagens timmar är ordinarie tid + söndagstillägg om beordrat (löneart OB öppen). Helglönen flyttas inte.</>}
                        </p>
                      );
                    })}
                    {ob.obesvarade > 0 && (
                      <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>
                        {ob.obesvarade} obesvarad{ob.obesvarade === 1 ? "" : "e"} tidig start väntar på förarens brandrisk-svar.
                      </p>
                    )}
                    {oen.map((o: any) => (
                      <p key={`oen-${o.datum}`} style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>
                        {o.datum}: förare svarar olika på brandriskfrågan — {o.svar.map((s: any) => `${s.namn} ${s.brandrisk_beordrad ? "ja" : "nej"}`).join(", ")}.
                      </p>
                    ))}
                    {ovrigaVarn.map((v: string, vi: number) => (
                      <p key={`v-${vi}`} style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{v}</p>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </Card>

      {/* Knappar */}
      <div style={{ marginTop: AVSTAND.l, display: "flex", gap: AVSTAND.s }}>
        <button onClick={onFörhandsgranska} disabled={fortnoxLaddar} style={{ ...btnSecondary, flex: 1, opacity: fortnoxLaddar ? 0.5 : 1 }}>
          {fortnoxLaddar ? "Beräknar…" : "Uppdatera"}
        </button>
        <button
          onClick={onSkicka}
          disabled={medarbetare.every((m: any) => m.status === "skickat" || !m.anstallningsnummer)}
          style={{
            ...btnPrimary,
            flex: 1,
            opacity: medarbetare.every((m: any) => m.status === "skickat" || !m.anstallningsnummer) ? 0.4 : 1,
          }}
        >Skicka till Fortnox</button>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; fg: string; text: string }> = {
    utkast:  { bg: FARG.fyllning, fg: FARG.text2, text: "UTKAST" },
    skickat: { bg: FARG.fyllning, fg: FARG.gron, text: "SKICKAT" },
    fel:     { bg: FARG.fyllning, fg: FARG.rod, text: "FEL" },
  };
  const c = cfg[status] || cfg.utkast;
  return (
    <span style={{
      ...TYP.meta, fontWeight: 700, color: c.fg,
      background: c.bg, padding: `0 ${AVSTAND.s}px`, borderRadius: RADIE.stapel,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{c.text}</span>
  );
}
