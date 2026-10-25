"use client";
import React, { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { sistaDagenIManaden } from "@/lib/datumLokal";
import { AVSTAND, FARG, RADIE, TYP, KNAPP, TRAFFYTA, VIKT } from "@/lib/design/tokens";
import { Kort, Ikon, Lista, Rad, Lank } from "./ui";
import { StatusRad, AttKolla } from "./ForarKortDelar";
import { useAdminNav } from "./nav";
import { tidigarelagdMonster } from "@/lib/tidigarelagdStart";
import { enhetForMangd, fmtMangd } from "@/lib/lonesystem/loneart";
import { blockerandeLonearter } from "@/lib/lonesystem/loneartSaknas";
import { kodRadAttGora, oppnaFragor } from "@/lib/lonesystem/attTaMed";
import { arbetsManadText } from "@/lib/lonesystem/lonemanad";
import ManadRubrik from "@/components/design/ManadRubrik";
import { byggForarKort, saknarAnstallningsdatum, antalAttKolla, type ForarKort, type Kvittering, type Mal, type VyRad } from "@/lib/admin/loneunderlagVy";
import { arSandbar } from "@/lib/lonesystem/forarGodkannande";
import Svarsrad from "@/components/design/Svarsrad";
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
import ForarManadArk from "./ForarManadArk";

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

// Två flikar är det man gör varje månad. Resten ställer man in sällan (eller slår upp) och ligger som rader
// under "Mer" längst ner — samma adresser som förut (?underflik=lonearter …), så länkar och notiser hittar dit (Martin 2026-10-25).
const FLIKRAD: Underflik[] = ["underlag", "dagar"];
const MER: Underflik[] = ["vila", "lonearter", "system", "atk"];
const MER_UNDERTEXT: Partial<Record<Underflik, string>> = {
  vila: "Alla förares vilobrott",
  lonearter: "Koder till Fortnox",
  system: "Kopplingen till Fortnox",
  atk: "Förarnas val i maj",
};

export default function LonFlik({ currentUser }: { currentUser: CurrentUser }) {
  // Underfliken står i adressen (?underflik=…): en omladdning stannar på samma ställe.
  const { nav, sattUnderflik } = useAdminNav();
  const aktiv: Underflik = UNDERFLIKAR.some(u => u.key === nav.underflik) ? (nav.underflik as Underflik) : "underlag";
  const iFlikrad = FLIKRAD.includes(aktiv);
  return (
    <>
      {iFlikrad
        ? <UnderflikTabs aktiv={aktiv} onValj={sattUnderflik} />
        : <TillbakaTillLon etikett={UNDERFLIKAR.find(u => u.key === aktiv)!.label} onTillbaka={() => sattUnderflik(null)} />}
      {aktiv === "underlag" && <Loneunderlag currentUser={currentUser} />}
      {aktiv === "dagar"    && <DagarUnderflik />}
      {aktiv === "lonearter" && <LonearterUnderflik />}
      {aktiv === "system"   && <LonesystemUnderflik />}
      {aktiv === "atk"      && <AtkUnderflik currentUser={currentUser} />}
      {aktiv === "vila"     && <VilobrottUnderflik />}
      {iFlikrad && <MerRader onValj={sattUnderflik} />}
    </>
  );
}

/** Löneunderlag | Dagar — en segmentväljare som i resten av appen. */
function UnderflikTabs({ aktiv, onValj }: { aktiv: Underflik; onValj: (k: Underflik) => void }) {
  return (
    <div role="tablist" style={{ display: "flex", maxWidth: 360, background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs, marginBottom: AVSTAND.sektion }}>
      {UNDERFLIKAR.filter(t => FLIKRAD.includes(t.key)).map(t => (
        <button key={t.key} role="tab" aria-selected={aktiv === t.key} onClick={() => onValj(t.key)} style={{
          flex: 1, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, whiteSpace: "nowrap",
          background: aktiv === t.key ? FARG.fyllning : "transparent", border: "none", borderRadius: RADIE.rad,
          color: aktiv === t.key ? FARG.text : FARG.text2, ...TYP.meta, fontWeight: aktiv === t.key ? VIKT.halvfet : VIKT.normal,
          cursor: "pointer", fontFamily: "inherit",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

/** I en sällan-sida: "‹ Lön" tillbaka och sidans namn, i stället för flikraden. */
function TillbakaTillLon({ etikett, onTillbaka }: { etikett: string; onTillbaka: () => void }) {
  return (
    <div data-tillbaka-lon="" style={{ marginBottom: AVSTAND.sektion }}>
      <button type="button" onClick={onTillbaka} style={{ ...KNAPP.tertiar, display: "inline-flex", alignItems: "center", gap: AVSTAND.xs, padding: 0, minHeight: TRAFFYTA.min }}>
        <Ikon namn="chevron_left" farg={FARG.bla} /> Lön
      </button>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.rubrik, color: FARG.text }}>{etikett}</p>
    </div>
  );
}

/** Det man rör sällan: rader längst ner, en tryckning bort. */
function MerRader({ onValj }: { onValj: (k: Underflik) => void }) {
  const rader = UNDERFLIKAR.filter(t => MER.includes(t.key)).sort((a, b) => MER.indexOf(a.key) - MER.indexOf(b.key));
  return (
    <div data-lon-mer="" style={{ marginTop: AVSTAND.sektion }}>
      <p style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px` }}>Mer</p>
      <Lista>
        {rader.map((t, i) => (
          <Rad key={t.key} attr={{ "data-lon-mer-rad": t.key }} rubrik={t.label} detalj={MER_UNDERTEXT[t.key]} chevron onClick={() => onValj(t.key)} sista={i === rader.length - 1} />
        ))}
      </Lista>
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

function Loneunderlag({ currentUser }: { currentUser: CurrentUser }) {
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
  // Kvitterade punkter under "Att kolla" ("Ser rätt ut", tabellen lon_kvittering). null = går inte att läsa/spara än: inga kvittera-knappar, ingen tyst förlust.
  const [kvitteringar, setKvitteringar] = useState<Kvittering[] | null>(null);
  const [kvittFel, setKvittFel] = useState<string | null>(null);
  // Påminn-knappen per förare: skickar / skickad / köad / nyss / fel:<text>.
  const [paminnStatus, setPaminnStatus] = useState<Record<string, string>>({});

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

  useEffect(() => {
    let cancelled = false;
    setKvitteringar(null); setKvittFel(null); setPaminnStatus({});
    supabase.from("lon_kvittering").select("medarbetare_id, punkt, text").eq("period", arbetsManad)
      .then(({ data, error }: any) => { if (!cancelled) setKvitteringar(error ? null : (data || [])); });
    return () => { cancelled = true; };
  }, [arbetsManad]);

  /** "Ser rätt ut": sparas med radens text. Gäller bara så länge texten är densamma. */
  const kvittera = async (medarbetareId: string, rad: VyRad) => {
    setKvittFel(null);
    const { error } = await supabase.from("lon_kvittering").upsert(
      { medarbetare_id: medarbetareId, period: arbetsManad, punkt: rad.id, text: rad.text, kvitterad_av: currentUser.id },
      { onConflict: "medarbetare_id,period,punkt" },
    );
    if (error) { setKvittFel(`Kunde inte spara: ${error.message}`); return; }
    setKvitteringar(k => [...(k || []).filter(x => !(x.medarbetare_id === medarbetareId && x.punkt === rad.id)), { medarbetare_id: medarbetareId, punkt: rad.id, text: rad.text }]);
  };
  const angraKvittering = async (medarbetareId: string, rad: VyRad) => {
    setKvittFel(null);
    const { error } = await supabase.from("lon_kvittering").delete().eq("medarbetare_id", medarbetareId).eq("period", arbetsManad).eq("punkt", rad.id);
    if (error) { setKvittFel(`Kunde inte ångra: ${error.message}`); return; }
    setKvitteringar(k => (k || []).filter(x => !(x.medarbetare_id === medarbetareId && x.punkt === rad.id)));
  };

  /** Knappen "Påminn" på ett förarkort: samma notis som den 1:a, direkt (/api/lon/paminn). */
  const paminn = async (medarbetareId: string) => {
    setPaminnStatus(s => ({ ...s, [medarbetareId]: "skickar" }));
    let ut = "fel:Kunde inte skicka påminnelsen.";
    try {
      const res = await fetch("/api/lon/paminn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ medarbetare_id: medarbetareId, arbetsmanad: arbetsManad }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) ut = j.skickades ? "skickad" : j.koad ? "koad" : "nyss";
      else if (j.meddelande) ut = `fel:${j.meddelande}`;
    } catch { /* ut är redan felet */ }
    setPaminnStatus(s => ({ ...s, [medarbetareId]: ut }));
  };

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

  // Ingen Uppdatera-knapp: underlaget läses om av sig självt när man kommer tillbaka till fliken (en förare kan ha godkänt
  // under tiden). Tyst — inget "Beräknar…", och högst en gång i halvminuten.
  useEffect(() => {
    let senast = Date.now();
    const omLas = () => {
      if (document.visibilityState !== "visible" || Date.now() - senast < 30_000) return;
      senast = Date.now();
      fetch("/api/fortnox/salary-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period, dry_run: true }) })
        .then(r => r.json()).then(j => { if (j?.ok) setFortnoxData(j); }).catch(() => { /* ett tyst omläsningsfel ändrar inget som visas */ });
    };
    window.addEventListener("focus", omLas);
    document.addEventListener("visibilitychange", omLas);
    return () => { window.removeEventListener("focus", omLas); document.removeEventListener("visibilitychange", omLas); };
  }, [period]);

  const laddaOmDryRun = async () => {
    const res = await fetch("/api/fortnox/salary-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, dry_run: true }),
    });
    setFortnoxData(await res.json());
  };

  /** EN förare skickas utan att ha godkänt (arket Förare · Månad, efter en extra bekräftelse). Aldrig fler på en gång. */
  const skickaUtanGodkannande = async (medarbetareId: string): Promise<{ ok: boolean; meddelande?: string }> => {
    try {
      const res = await fetch("/api/fortnox/salary-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, medarbetare_ids: [medarbetareId], skicka_utan_godkannande: true }),
      });
      const j = await res.json();
      setExportResultat(j);
      await laddaOmDryRun();
      return { ok: res.ok && j.ok === true, meddelande: j.meddelande || (j.felMeddelanden || []).join(" ") || undefined };
    } catch (e: any) {
      return { ok: false, meddelande: e?.message || String(e) };
    }
  };

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
        onForare={id => sattParam("forare", id)}
        exportResultat={exportResultat}
        kvitteringar={kvitteringar}
        kvittFel={kvittFel}
        onKvittera={kvittera}
        onAngraKvittering={angraKvittering}
        paminnStatus={paminnStatus}
        onPaminn={paminn}
      />

      {/* Förare · Månad: varför blev lönen, övertiden och milen som de blev. Förarens id står i adressen (?forare=…). */}
      {(() => {
        const m = fortnoxData?.ok ? (fortnoxData.medarbetare || []).find((x: any) => x.medarbetare_id === nav.params.forare) : null;
        return m ? <ForarManadArk m={m} arbetsManad={arbetsManad} dag={nav.params.dag} onSkickaUtanGodkannande={skickaUtanGodkannande} onStang={() => {
          // Kom man från Dagar (dagper i adressen) går man tillbaka dit, på samma period och månad och med samma filter.
          if (nav.params.dagper) gaTill({ flik: "lon", underflik: "dagar", params: { dagper: nav.params.dagper, dagoff: nav.params.dagoff ?? "0", avv: nav.params.avv ?? "1" } });
          else { sattParam("forare", null); sattParam("dag", null); }
        }} /> : null;
      })()}

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
  period, arbetsManad, fortnoxData, fortnoxLaddar, onFörhandsgranska, onSkicka, onMal, onForare, exportResultat,
  kvitteringar, kvittFel, onKvittera, onAngraKvittering, paminnStatus, onPaminn,
}: {
  period: string;
  arbetsManad: string;
  fortnoxData: any;
  fortnoxLaddar: boolean;
  onFörhandsgranska: () => void;
  onSkicka: () => void;
  onMal: (mal: Mal) => void;
  onForare: (id: string) => void;
  exportResultat: any;
  kvitteringar: Kvittering[] | null;
  kvittFel: string | null;
  onKvittera: (medarbetareId: string, rad: VyRad) => void;
  onAngraKvittering: (medarbetareId: string, rad: VyRad) => void;
  paminnStatus: Record<string, string>;
  onPaminn: (medarbetareId: string) => void;
}) {
  const { gaTill } = useAdminNav();
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
  // Företagsledare (medarbetare.foretagsledare) har inga lönerader — lönen ligger utanför appen — och står inte i listan alls (Martin 2026-10-21).
  const lonMedarbetare = medarbetare.filter((m: any) => !m.foretagsledare);
  const kopplingar = fortnoxData.kopplingar || {};
  // Samma lista som sändningen stoppas av (serverns svar, räknad på dem som faktiskt skickas); äldre svar utan den räknas om ur raderna.
  const blockerande = fortnoxData.blockerande ?? blockerandeLonearter(medarbetare);
  const kort = lonMedarbetare.map((m: any) => byggForarKort(m, fortnoxData.oenighet || [], kvitteringar || []));
  const saknarDatum = saknarAnstallningsdatum(medarbetare);
  const kodRad = kodRadAttGora(kopplingar, blockerande);
  const antal = antalAttKolla(kort, saknarDatum.length, !!kodRad);
  const allaSkickade = lonMedarbetare.length > 0 && lonMedarbetare.every((m: any) => m.status === "skickat");
  // Förarens godkännande styr exporten: bara de som godkänt (och har anställningsnummer) skickas. Övriga står kvar som "Väntar på föraren".
  const sandbara = lonMedarbetare.filter((m: any) => arSandbar(m) && m.anstallningsnummer);
  const vantar = lonMedarbetare.filter((m: any) => m.status !== "skickat" && !arSandbar(m));
  const kanInteSkicka = sandbara.length === 0;
  const rubrik = allaSkickade ? "Skickat till Fortnox"
    : antal > 0 ? `${antal} ${antal === 1 ? "sak" : "saker"} att kolla`
    : vantar.length > 0 ? (sandbara.length === 0 ? "Ingen har godkänt än" : `${sandbara.length} av ${lonMedarbetare.length} har godkänt`)
    : "Klart att skicka";

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
          {exportResultat.vantar?.length > 0 && (
            <p data-skickades-inte-vantar="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
              Väntar på föraren (skickades inte): {exportResultat.vantar.map((v: any) => v.namn).join(", ")}.
            </p>
          )}
          {exportResultat.utelamnade?.length > 0 && (
            <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>
              Skickades inte: {exportResultat.utelamnade.map((u: any) => `${u.label} ${fmtMangd(u.mangd)} ${enhetForMangd(u.enhet, u.mangd)} (${u.namn})`).join(", ")}.
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
            rubrik={rubrik}
            avvikelse={!allaSkickade && antal > 0}
            rad={`${lonMedarbetare.length} förare · ${fortnoxData.totalt_rader} lönerader${vantar.length > 0 && !allaSkickade ? ` · ${vantar.length} väntar på föraren` : ""}`} />
        </div>
      )}
      {/* EN knapp: underlaget läses om av sig självt (byte av månad, tillbaka till fliken) — ingen Uppdatera bredvid. */}
      <div style={{ marginBottom: AVSTAND.m }}>
        <button
          data-skicka=""
          onClick={onSkicka}
          disabled={kanInteSkicka}
          style={{ ...(blockerande.length > 0 ? btnSecondary : btnPrimary), width: "100%", opacity: kanInteSkicka ? 0.4 : 1 }}
        >{sandbara.length > 0 ? `Skicka ${sandbara.length} till Fortnox` : "Ingen att skicka"}</button>
        {!allaSkickade && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2, textAlign: "center" }}>Bara förare som godkänt skickas.</p>}
      </div>
      {kvittFel && <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.rod }}>{kvittFel}</p>}

      {/* Det som gäller alla förare på en gång: EN rad var, med knappen bredvid. De långa avtalsfrågorna ligger under Avtal → Öppna frågor. */}
      <Lista style={{ marginBottom: AVSTAND.m }}>
        {kodRad && <Rad attr={{ "data-att-ta-med": "gor" }} rubrik={kodRad.rubrik} hoger={<Lank smal onClick={() => onMal({ typ: "lonearter" })}>Koppla</Lank>} />}
        {saknarDatum.length > 0 && (
          <Rad attr={{ "data-att-ta-med": "anstallningsdatum" }}
            rubrik={`Anställningsdatum saknas: ${saknarDatum.map(f => f.namn.split(" ")[0]).join(", ")}`}
            hoger={<Lank smal onClick={() => onMal(saknarDatum.length === 1 ? { typ: "person", id: saknarDatum[0].id } : { typ: "personer" })}>Fyll i</Lank>} />
        )}
        {/* Bara när något är obesvarat — och raden leder till Avtal, där frågorna bor. */}
        {oppnaFragor.length > 0 && (
          <Rad attr={{ "data-oppna-fragor-rad": "" }} rubrik={`${oppnaFragor.length} öppna ${oppnaFragor.length === 1 ? "fråga" : "frågor"}`} chevron
            onClick={() => gaTill({ flik: "avtal", params: { fragor: "1" } })} sista />
        )}
      </Lista>

      {/* Per förare: godkännande, vad som går till Fortnox, och det som ska kollas. (Ett kort per förare med detaljvy är en senare, större ändring.) */}
      <Card style={{ padding: 0 }}>
        {lonMedarbetare.length === 0 && <p style={{ margin: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>Inga förare med lön den här månaden.</p>}
        {lonMedarbetare.map((m: any, mi: number) => {
          const k: ForarKort = kort[mi];
          return (
            // Hela kortet är en rad (iOS): tryck öppnar Förare · Månad. Knapparna inuti (Se dagen, Påminn, Fyll i …) gör sitt eget och öppnar inget.
            <div key={m.medarbetare_id} data-forare={m.medarbetare_id} role="button" tabIndex={0} aria-label={`${m.namn}, öppna månaden`}
              onClick={e => { if (!(e.target as HTMLElement).closest("button")) onForare(m.medarbetare_id); }}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onForare(m.medarbetare_id); } }}
              style={{
                padding: `${AVSTAND.m}px ${AVSTAND.l}px`, cursor: "pointer",
                borderBottom: mi === lonMedarbetare.length - 1 ? "none" : `1px solid ${FARG.linje}`,
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...TYP.listtitel, fontWeight: 600, color: FARG.text }}>{m.namn}</span>
                <Ikon namn="chevron_right" farg={FARG.text3} />
              </div>
              <StatusRad k={k} paminn={paminnStatus[m.medarbetare_id]} onPaminn={() => onPaminn(m.medarbetare_id)} />
              {k.saknarAnstNr && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
                  <span style={{ ...TYP.meta, color: FARG.rod }}>Anställningsnummer saknas — går inte att skicka</span>
                  <Lank smal onClick={() => onMal({ typ: "person", id: m.medarbetare_id })}>Fyll i</Lank>
                </div>
              )}

              {/* Lönerader: varje löneart som har ett antal. */}
              <div style={{ marginTop: AVSTAND.s }}>
                <LoneradLista rader={loneraderAv(m)} />
                {k.helglon.map(t => <p key={t} style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{t}</p>)}
              </div>

              <AttKolla k={k} kanKvittera={kvitteringar !== null} onMal={onMal}
                onKvittera={rad => onKvittera(m.medarbetare_id, rad)} onAngra={rad => onAngraKvittering(m.medarbetare_id, rad)} />
              {k.info.map(r => <p key={r.id} {...(r.id.startsWith("utj-") ? { "data-utjamning-period": "" } : {})} style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{r.text}</p>)}
            </div>
          );
        })}
      </Card>
    </>
  );
}
