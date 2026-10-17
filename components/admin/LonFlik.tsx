"use client";
import React, { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { sistaDagenIManaden } from "@/lib/datumLokal";
import { AVSTAND, FARG, RADIE, TYP, KNAPP, TRAFFYTA } from "@/lib/design/tokens";
import { Kort, Ikon, Lista, Rad, Lank } from "./ui";
import { useAdminNav } from "./nav";
import { tidigarelagdMonster } from "@/lib/tidigarelagdStart";
import { fmtMangd } from "@/lib/lonesystem/loneart";
import { blockerandeLonearter } from "@/lib/lonesystem/loneartSaknas";
import { kodRadAttGora, oppnaFragor } from "@/lib/lonesystem/attTaMed";
import { arbetsManadText } from "@/lib/lonesystem/lonemanad";
import ManadRubrik from "@/components/design/ManadRubrik";
import { byggForarKort, saknarAnstallningsdatum, antalAttKolla, type ForarKort, type Mal } from "@/lib/admin/loneunderlagVy";
import Svarsrad from "@/components/design/Svarsrad";
import OppnaFragorArk from "./OppnaFragor";
// Tidsavvikelser, ledighetskollision, OB och oenighet bor nu i granskningsvyn
// (FortnoxExportSektion) — de kommer ur dry_run-svaret, samma kodväg som exporten.
import LonesystemUnderflik from "./LonesystemUnderflik";
import LonearterUnderflik from "./LonearterUnderflik";
import { LoneradLista, SaknasKort, SkickaDialog, lonerader as loneraderAv } from "./LoneraderForhandsvisning";
import AtkUnderflik from "./AtkUnderflik";
import VilobrottUnderflik from "./VilobrottUnderflik";
// Dagar = kontrollvyn: alla förares dagar ur samma dry_run, larm på befintliga
// regler. Byggd mot lib/design/tokens — första admin-ytan som är det.
import DagarUnderflik from "./DagarUnderflik";
import ArsovertidKort from "./ArsovertidKort";

// Kort i granskningen: luft mellan staplade kort.
const Card = ({ children, style }: { children: React.ReactNode; style?: CSSProperties }) => <Kort style={{ marginBottom: AVSTAND.m, ...style }}>{children}</Kort>;

// Sektionsrubrik i granskningen (liten, versal, grå).
const secHead: CSSProperties = { ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.sektion}px 0 ${AVSTAND.m}px` };
const btnPrimary: CSSProperties = KNAPP.primar;
const btnSecondary: CSSProperties = KNAPP.sekundar;

type Underflik = "underlag" | "dagar" | "lonearter" | "system" | "atk" | "vila";
type CurrentUser = { id: string; namn?: string | null; roll: string };

const UNDERFLIKAR: { key: Underflik; label: string }[] = [
  { key: "underlag", label: "Löneunderlag" },
  { key: "dagar",    label: "Dagar" },
  { key: "lonearter", label: "Lönearter" },
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
      {aktiv === "lonearter" && <LonearterUnderflik />}
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

function periodNu(): string {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
}

function periodOffset(period: string, delta: number): string {
  const [å, m] = period.split("-").map(Number);
  const d = new Date(å, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** En period som står i adressen (?period=2026-09) gäller om den är en riktig månad som inte ligger i framtiden. */
function periodUrAdress(p: string | undefined): string {
  return p && /^\d{4}-(0[1-9]|1[0-2])$/.test(p) && p <= periodNu() ? p : periodNu();
}

function Loneunderlag() {
  const { nav, sattParam, gaTill } = useAdminNav();
  const [period, setPeriod] = useState(() => periodUrAdress(nav.params.period));
  /** Månadsbyte skrivs till adressen: en omladdning och en länk hamnar på samma månad. */
  const valjPeriod = (p: string) => { setPeriod(p); sattParam("period", p); };
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [tidigarelagdAlla, setTidigarelagdAlla] = useState<any[]>([]);
  const [tlFel, setTlFel] = useState<string | null>(null);
  const [fortnoxData, setFortnoxData] = useState<any>(null);
  const [fortnoxLaddar, setFortnoxLaddar] = useState(false);
  const [visaBekräftelse, setVisaBekräftelse] = useState(false);
  const [skickar, setSkickar] = useState(false);
  const [exportResultat, setExportResultat] = useState<any>(null);
  // Årets övertid per förare (avtalets modell, lib/lonesystem/arsovertid) — vyn: ArsovertidKort.
  const [arsovertid, setArsovertid] = useState<any>(null);

  // Löneperiod = arbetsmånad + 1 (samma regel som Fortnox-granskningen och /api/lon/min-manad). Adressen och API:erna talar
  // löneperiod; det som SYNS är arbetsmånaden ("Augusti") med utbetalningen i liten text (lib/lonesystem/lonemanad).
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

  /** Vart en rad leder. "Se dagen" öppnar Dagar på samma arbetsmånad, bara avvikelserna. */
  const gaMal = (mal: Mal) => {
    if (mal.typ === "dagar") {
      const nu = new Date();
      const [å, m] = arbetsManad.split("-").map(Number);
      gaTill({ flik: "lon", underflik: "dagar", params: { dagper: "M", dagoff: String((å - nu.getFullYear()) * 12 + (m - 1 - nu.getMonth())), avv: "1" } });
    }
    else if (mal.typ === "maskin") gaTill({ flik: "maskiner", params: { maskin: mal.id } });
    else if (mal.typ === "person") gaTill({ flik: "medarbetare", params: { person: mal.id } });
    else if (mal.typ === "personer") gaTill({ flik: "medarbetare" });
    else gaTill({ flik: "lon", underflik: "lonearter" });
  };

  return (
    <>
      {/* Månadsväljare: arbetsmånaden är namnet, vilken månad lönen kommer står bredvid ("Augusti · lön i september"). */}
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${AVSTAND.s}px ${AVSTAND.l}px` }}>
        <button onClick={() => valjPeriod(periodOffset(period, -1))} aria-label="Föregående månad" style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, color: FARG.text }}>
          <Ikon namn="chevron_left" farg={FARG.text} />
        </button>
        <div style={{ ...TYP.listtitel, color: FARG.text, textAlign: "center" }}><ManadRubrik arbetsManad={arbetsManad} /></div>
        <button onClick={() => valjPeriod(periodOffset(period, 1))} disabled={period >= periodNu()} aria-label="Nästa månad"
          style={{ ...KNAPP.tertiar, width: TRAFFYTA.min, padding: 0, color: FARG.text, opacity: period >= periodNu() ? 0.4 : 1, cursor: period >= periodNu() ? "default" : "pointer" }}>
          <Ikon namn="chevron_right" farg={FARG.text} />
        </button>
      </Card>

      {/* Fortnox-granskningen: svaret först (är det klart att skicka?), sedan det som ska kollas, sedan förarna. */}
      <FortnoxExportSektion
        period={period}
        arbetsManad={arbetsManad}
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
        onMal={gaMal}
        exportResultat={exportResultat}
      />

      {/* ÅRSÖVERTID: en fråga — hur nära taket är varje förare? Avtalets modell (§5 mom 2); förklaringen ligger bakom
          "Så räknas det" (components/admin/ArsovertidKort). */}
      {arsovertid && <div style={{ marginTop: AVSTAND.m }}><ArsovertidKort svar={arsovertid} manad={arbetsManad} /></div>}

      {tlFel && (
        <Card style={{ border: `1px solid ${FARG.rod}` }}>
          <p style={{ margin: 0, color: FARG.rod, ...TYP.meta }}>Kunde inte läsa maskinstart-kortet: {tlFel}</p>
        </Card>
      )}
      {!tlFel && tlMon.length > 0 && (
        <Card>
          <p style={{ ...secHead, marginTop: 0 }}>Maskinstart senare än angiven · {arbetsManadText(arbetsManad)}</p>
          <p style={{ margin: '0 0 8px', ...TYP.meta, color: FARG.text2 }}>Föraren angav en start mer än 30 min före maskinens login. Angiven tid styr lönen.</p>
          {tlMon.map((m, i) => (
            <div key={m.medarbetare_id} style={{ display: 'flex', justifyContent: 'space-between', ...TYP.meta, color: FARG.text, padding: '9px 0', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
              <span>{tlNamn.get(m.medarbetare_id) || m.medarbetare_id}</span>
              <span style={{ color: m.dagar >= 10 ? FARG.orange : FARG.text2, fontWeight: m.dagar >= 10 ? 600 : 400 }}>{m.dagar} dag{m.dagar === 1 ? '' : 'ar'} · {fmtH(m.summaMin)}</span>
            </div>
          ))}
        </Card>
      )}

          {/* Bekräftelsedialog: med röda rader finns ingen "Skicka till Fortnox" här (components/admin/LoneraderForhandsvisning). */}
      {visaBekräftelse && fortnoxData?.medarbetare && (
        <SkickaDialog
          arbetsManad={arbetsManad}
          data={fortnoxData}
          blockerande={fortnoxData.blockerande ?? blockerandeLonearter(fortnoxData.medarbetare)}
          skickar={skickar}
          onStang={() => setVisaBekräftelse(false)}
          onKoppla={() => { setVisaBekräftelse(false); gaTill({ flik: "lon", underflik: "lonearter" }); }}
          onSkicka={async (skickaUtanSaknade) => {
            setSkickar(true);
            try {
              const res = await fetch("/api/fortnox/salary-export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Flaggan följer bara med när admin uttryckligen valt det (andra steget i dialogen).
                body: JSON.stringify(skickaUtanSaknade ? { period, skicka_utan_saknade: true } : { period }),
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
        />
      )}
    </>
  );
}

/* ─── FORTNOX EXPORT SEKTION ─── */

function FortnoxExportSektion({
  period, arbetsManad, fortnoxData, fortnoxLaddar, onFörhandsgranska, onSkicka, onMal, exportResultat,
}: {
  period: string;
  arbetsManad: string;
  fortnoxData: any;
  fortnoxLaddar: boolean;
  onFörhandsgranska: () => void;
  onSkicka: () => void;
  onMal: (mal: Mal) => void;
  exportResultat: any;
}) {
  const [visaFragor, setVisaFragor] = useState(false);
  if (!fortnoxData) {
    return (
      <Card>
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>
          {fortnoxLaddar ? `Läser löneunderlag för ${arbetsManadText(arbetsManad)}…` : "Löneunderlaget är inte läst."}
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
  // Företagsledare (medarbetare.foretagsledare) har inga lönerader: lönen ligger utanför appen. De står kvar i listan, med den noten.
  const lonMedarbetare = medarbetare.filter((m: any) => !m.foretagsledare);
  const kopplingar = fortnoxData.kopplingar || {};
  // Samma lista som sändningen stoppas av (serverns svar); äldre svar utan den räknas om ur raderna.
  const blockerande = fortnoxData.blockerande ?? blockerandeLonearter(medarbetare);
  const kort = medarbetare.map((m: any) => byggForarKort(m, fortnoxData.oenighet || []));
  const saknarDatum = saknarAnstallningsdatum(medarbetare);
  const kodRad = kodRadAttGora(kopplingar, blockerande);
  const antal = antalAttKolla(kort, saknarDatum.length, !!kodRad);
  const allaSkickade = lonMedarbetare.length > 0 && lonMedarbetare.every((m: any) => m.status === "skickat");
  const kanInteSkicka = lonMedarbetare.every((m: any) => m.status === "skickat" || !m.anstallningsnummer);

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
          {exportResultat.utelamnade?.length > 0 && (
            <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>
              Skickades inte: {exportResultat.utelamnade.map((u: any) => `${u.label} ${fmtMangd(u.mangd)} ${u.enhet} (${u.namn})`).join(", ")}.
            </p>
          )}
          {exportResultat.felMeddelanden?.length > 0 && (
            <ul style={{ margin: `${AVSTAND.s}px 0 0`, paddingLeft: AVSTAND.l, ...TYP.meta, color: FARG.rod }}>
              {exportResultat.felMeddelanden.map((f: string, i: number) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </Card>
      )}

      {/* SVARET: är det klart att skicka? Med röda rader är svaret kortet "Kan inte skickas än" (en primärknapp: Koppla koder). */}
      <SaknasKort blockerande={blockerande} onKoppla={() => onMal({ typ: "lonearter" })} />
      {blockerande.length === 0 && (
        <div data-svar="">
          <Svarsrad
            rubrik={allaSkickade ? "Skickat till Fortnox" : antal === 0 ? "Klart att skicka" : `${antal} ${antal === 1 ? "sak" : "saker"} att kolla`}
            avvikelse={!allaSkickade && antal > 0}
            rad={`${lonMedarbetare.length} ${lonMedarbetare.length === 1 ? "förare" : "förare"} · ${fortnoxData.totalt_rader} lönerader`} />
        </div>
      )}
      <div style={{ display: "flex", gap: AVSTAND.s, marginBottom: AVSTAND.m }}>
        <button onClick={onFörhandsgranska} disabled={fortnoxLaddar} style={{ ...btnSecondary, flex: 1, opacity: fortnoxLaddar ? 0.5 : 1 }}>
          {fortnoxLaddar ? "Beräknar…" : "Uppdatera"}
        </button>
        <button
          onClick={onSkicka}
          disabled={kanInteSkicka}
          style={{ ...(blockerande.length > 0 ? btnSecondary : btnPrimary), flex: 1, opacity: kanInteSkicka ? 0.4 : 1 }}
        >Skicka till Fortnox</button>
      </div>

      {/* Det som gäller alla förare på en gång: EN rad var, med knappen bredvid. De långa avtalsfrågorna ligger bakom en rad. */}
      <Lista style={{ marginBottom: AVSTAND.m }}>
        {kodRad && <Rad attr={{ "data-att-ta-med": "gor" }} rubrik={kodRad.rubrik} hoger={<Lank smal onClick={() => onMal({ typ: "lonearter" })}>Koppla</Lank>} />}
        {saknarDatum.length > 0 && (
          <Rad attr={{ "data-att-ta-med": "anstallningsdatum" }}
            rubrik={`Anställningsdatum saknas: ${saknarDatum.map(f => f.namn.split(" ")[0]).join(", ")}`}
            hoger={<Lank smal onClick={() => onMal(saknarDatum.length === 1 ? { typ: "person", id: saknarDatum[0].id } : { typ: "personer" })}>Fyll i</Lank>} />
        )}
        <Rad rubrik={`${oppnaFragor.length} öppna frågor`} chevron onClick={() => setVisaFragor(true)} sista />
      </Lista>
      {visaFragor && <OppnaFragorArk fragor={oppnaFragor} onStang={() => setVisaFragor(false)} />}

      {/* Per förare: vad som går till Fortnox, och det som ska kollas. (Ett kort per förare med detaljvy är en senare, större ändring.) */}
      <Card style={{ padding: 0 }}>
        {medarbetare.map((m: any, mi: number) => {
          const k: ForarKort = kort[mi];
          return (
            <div key={mi} data-forare={m.medarbetare_id} style={{
              padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
              borderBottom: mi === medarbetare.length - 1 ? "none" : `1px solid ${FARG.linje}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: AVSTAND.s }}>
                <span style={{ ...TYP.listtitel, fontWeight: 600, color: FARG.text }}>{m.namn}</span>
                {!k.ledare && <StatusBadge status={m.status} />}
              </div>
              {k.saknarAnstNr && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
                  <span style={{ ...TYP.meta, color: FARG.rod }}>Anställningsnummer saknas — går inte att skicka</span>
                  <Lank smal onClick={() => onMal({ typ: "person", id: m.medarbetare_id })}>Fyll i</Lank>
                </div>
              )}

              {/* Lönerader: varje löneart som har ett antal. Företagsledare har inga: lönen ligger utanför appen. */}
              {k.ledare ? (
                <p data-foretagsledare="" style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Företagsledare – lön utanför appen</p>
              ) : (
                <>
                  <LoneradLista rader={loneraderAv(m)} />
                  {k.helglon.map(t => <p key={t} style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{t}</p>)}
                </>
              )}

              {k.kolla.length > 0 && (
                <>
                  <p style={{ margin: `${AVSTAND.m}px 0 ${AVSTAND.xs}px`, ...TYP.micro, color: FARG.orange }}>Att kolla</p>
                  {k.kolla.map(r => (
                    <div key={r.id} data-kolla={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, minHeight: TRAFFYTA.min }}>
                      <span style={{ ...TYP.meta, color: FARG.orange }}>{r.text}</span>
                      {r.mal && <Lank smal onClick={() => onMal(r.mal!)} style={{ flexShrink: 0 }}>{r.knapp}</Lank>}
                    </div>
                  ))}
                </>
              )}
              {k.info.map(r => <p key={r.id} {...(r.id.startsWith("utj-") ? { "data-utjamning-period": "" } : {})} style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{r.text}</p>)}
            </div>
          );
        })}
      </Card>
    </>
  );
}

/** Skickat och fel är något att veta; UTKAST är normalläget och visas inte (det stod som ett märke på varje förare). */
function StatusBadge({ status }: { status: string }) {
  if (!status || status === "utkast") return null;
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
