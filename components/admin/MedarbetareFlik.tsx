"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, TYP } from "@/lib/design/tokens";
import { Sektion, Stod, Kort, Lista, Rad, Falt, Val, Reglage, Sekundar, Tillbaka, Destruktiv, Lank, Besked, Fel, Laddar, Tomt, Bekrafta } from "./ui";
import { useAdminNav } from "./nav";
import MedarbetareKontroller from "./MedarbetareKontroller";
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";
import { maskinNamnMap, DIM_MASKIN_NAMN_KOLUMNER } from "@/lib/maskinNamn";
import { hamtaAnstallning, sparaAnstallningsnummer } from "@/lib/admin/anstallningsnummer";
import { introKlara, introSaknas, ochLista } from "@/lib/admin/introduktion";
import NyMedarbetare from "./NyMedarbetare";
import { ROLLER, HempunktKort, KopplaOperatörModal, useAnstKontroll, AnstKontrollText, type Medarbetare, type OperatorRad } from "./medarbetarDelar";

/** Listan är grupperad på roll: Förare först, sedan Admin. */
const GRUPP_ORDNING = ["forare", "admin"] as const;
const GRUPP_RUBRIK: Record<(typeof GRUPP_ORDNING)[number], string> = { forare: "Förare", admin: "Admin" };

/** Kolumnerna i personlistan. `foretagsledare` läggs till separat (migration 20261013155407) så listan går att läsa före den. */
const MED_KOLUMNER = "id, namn, epost, hemadress, roll, maskin_id, timlon_kr, manadslon_kr, anstallningsdatum, user_id, hem_lat, hem_lng, hem_koord_kalla, hem_geokod_status, hem_geokod_etikett, hem_geokod_precision, hem_geokod_lat, hem_geokod_lng, hem_bekraftad_tid";

export default function MedarbetareFlik() {
  // Vad som är öppet står i adressen (?person=…, ?ny=1), så en omladdning stannar kvar.
  const { nav, gaTill } = useAdminNav();
  const personId = nav.params.person || null;
  const arNy = !!nav.params.ny;
  const tillLista = () => gaTill({ flik: "medarbetare" });
  const oppnaPerson = (id: string) => gaTill({ flik: "medarbetare", params: { person: id } });

  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [operatorerPerMed, setOperatorerPerMed] = useState<Record<string, OperatorRad[]>>({});
  const [maskiner, setMaskiner] = useState<Record<string, string>>({});
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [kontroller, setKontroller] = useState<MedarbetarKontroller | null>(null);
  const [kontrollFel, setKontrollFel] = useState<string | null>(null);
  // false tills migrationen 20261013155407 är körd: då finns ingen kolumn att visa eller skriva.
  const [harForetagsledare, setHarForetagsledare] = useState(true);

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    // Kontrollerna hämtas vid sidan av — ett fel där får inte fälla listan,
    // men det ska stå (MedarbetareKontroller visar det).
    fetch("/api/medarbetare/kontroller", { cache: "no-store" })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`); setKontroller(j); setKontrollFel(null); })
      .catch(e => { setKontroller(null); setKontrollFel(e?.message || String(e)); });
    try {
      const [medRes0, opMedRes, dimOpRes, maskinRes] = await Promise.all([
        supabase.from("medarbetare")
          .select(`${MED_KOLUMNER}, foretagsledare, skyddsombud`)
          .order("namn"),
        supabase.from("operator_medarbetare").select("operator_id, medarbetare_id"),
        supabase.from("dim_operator").select("operator_id, operator_namn, operator_key, maskin_id"),
        // Maskinnamn: EN källa, dim_maskin (lib/maskinNamn) — aldrig `maskiner`.
        supabase.from("dim_maskin").select(DIM_MASKIN_NAMN_KOLUMNER),
      ]);
      // Kolumnen foretagsledare kommer med migrationen 20261013155407. Före den läses listan utan den (och rutan döljs).
      let medRes: { data: any[] | null; error: any } = medRes0 as any;
      let harForetagsledare = true;
      if (medRes0.error && /foretagsledare/i.test(String(medRes0.error.message || ""))) {
        harForetagsledare = false;
        medRes = await supabase.from("medarbetare").select(MED_KOLUMNER).order("namn") as any;
      }
      if (medRes.error) throw medRes.error;
      setHarForetagsledare(harForetagsledare);

      const opMap = new Map<string, OperatorRad>();
      for (const o of (dimOpRes.data || [])) opMap.set(o.operator_id, o);

      const maskinMap = maskinNamnMap(maskinRes.data || []);

      const opPerMed: Record<string, OperatorRad[]> = {};
      for (const m of (opMedRes.data || [])) {
        const op = opMap.get(m.operator_id);
        if (!op) continue;
        if (!opPerMed[m.medarbetare_id]) opPerMed[m.medarbetare_id] = [];
        opPerMed[m.medarbetare_id].push(op);
      }

      setMedarbetare(medRes.data || []);
      setOperatorerPerMed(opPerMed);
      setMaskiner(maskinMap);
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(); }, []);

  if (arNy) return <NyMedarbetare />;
  if (laddar) return <Laddar />;
  if (fel) return <Fel onForsok={ladda}>Kunde inte ladda medarbetare: {fel}</Fel>;

  if (personId) {
    const m = medarbetare.find(x => x.id === personId);
    if (!m) {
      return (
        <>
          <Tillbaka onClick={tillLista}>Medarbetare</Tillbaka>
          <Tomt>Personen finns inte längre.</Tomt>
        </>
      );
    }
    return (
      <DetaljVy
        key={m.id}
        medarbetare={m}
        operatorer={operatorerPerMed[m.id] || []}
        maskiner={maskiner}
        harForetagsledare={harForetagsledare}
        // Listan i minnet följer med: öppnas personen igen utan omladdning ska reglaget visa det som sparades.
        onForetagsledareSparad={(id, v) => setMedarbetare(lista => lista.map(x => x.id === id ? { ...x, foretagsledare: v } : x))}
        onSkyddsombudSparad={(id, v) => setMedarbetare(lista => lista.map(x => x.id === id ? { ...x, skyddsombud: v } : x))}
        onKlar={() => { tillLista(); ladda(); }}
        onLadda={() => ladda()}
        onTillbaka={tillLista}
      />
    );
  }

  return (
    <>
      <MedarbetareKontroller kontroller={kontroller} fel={kontrollFel} maskiner={maskiner} onValj={oppnaPerson} />
      <ListaVy
        medarbetare={medarbetare}
        operatorerPerMed={operatorerPerMed}
        maskiner={maskiner}
        onValj={oppnaPerson}
        onNy={() => gaTill({ flik: "medarbetare", params: { ny: "1" } })}
      />
    </>
  );
}

/* ─── LISTA ─── */

function ListaVy({
  medarbetare, operatorerPerMed, maskiner, onValj, onNy,
}: {
  medarbetare: Medarbetare[];
  operatorerPerMed: Record<string, OperatorRad[]>;
  maskiner: Record<string, string>;
  onValj: (id: string) => void;
  onNy: () => void;
}) {
  return (
    <>
      {medarbetare.length === 0 ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m }}>
            <Sektion topp={0}>Medarbetare</Sektion>
            <Lank onClick={onNy} style={{ marginBottom: AVSTAND.m }}>+ Lägg till</Lank>
          </div>
          <Kort><Tomt>Inga medarbetare. Lägg till den första med + Lägg till.</Tomt></Kort>
        </>
      ) : (
        // Grupper som i iOS Inställningar: rollen är rubriken, inte ett märke på varje rad.
        GRUPP_ORDNING.map((roll, gi) => {
          const grupp = medarbetare.filter(m => (roll === "admin" ? m.roll === "admin" : m.roll !== "admin"));
          if (grupp.length === 0) return null;
          return (
            <React.Fragment key={roll}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m }}>
                <Sektion topp={gi === 0 ? 0 : AVSTAND.sektion}>{GRUPP_RUBRIK[roll]} ({grupp.length})</Sektion>
                {gi === 0 && <Lank onClick={onNy} style={{ marginBottom: AVSTAND.m }}>+ Lägg till</Lank>}
              </div>
              <Lista>
                {grupp.map((m, i) => {
                  const ops = operatorerPerMed[m.id] || [];
                  const maskinNamn = new Set<string>();
                  for (const o of ops) if (o.maskin_id) maskinNamn.add(maskiner[o.maskin_id] || o.maskin_id);
                  if (m.maskin_id) maskinNamn.add(maskiner[m.maskin_id] || m.maskin_id);
                  // En förare utan koppling till maskinfilerna får ingen tid till lönen: det är det enda som står på raden utöver maskinen.
                  const utanKoppling = m.roll === "forare" && ops.length === 0;
                  const skyddsombud = m.roll === "forare" && m.skyddsombud === true;
                  return (
                    <Rad key={m.id} onClick={() => onValj(m.id)} chevron sista={i === grupp.length - 1}
                      rubrik={m.namn || "Namnlös"}
                      detalj={(maskinNamn.size > 0 || utanKoppling || skyddsombud) ? <>
                        {Array.from(maskinNamn).join(", ")}
                        {skyddsombud && <>{maskinNamn.size > 0 ? " · " : ""}Skyddsombud</>}
                        {utanKoppling && <span style={{ color: FARG.orange }}>{maskinNamn.size > 0 || skyddsombud ? " · " : ""}saknar koppling till maskinen</span>}
                      </> : undefined} />
                  );
                })}
              </Lista>
            </React.Fragment>
          );
        })
      )}
    </>
  );
}

/* ─── DETALJ ─── */

function DetaljVy({
  medarbetare, operatorer, maskiner, harForetagsledare, onForetagsledareSparad, onSkyddsombudSparad, onKlar, onLadda, onTillbaka,
}: {
  medarbetare: Medarbetare;
  operatorer: OperatorRad[];
  maskiner: Record<string, string>;
  /** Kolumnen medarbetare.foretagsledare finns (migration 20261013155407 körd). */
  harForetagsledare: boolean;
  /** Reglaget sparades (verifierat med .select()): uppdatera personen i listans minne. */
  onForetagsledareSparad: (id: string, varde: boolean) => void;
  onSkyddsombudSparad: (id: string, varde: boolean) => void;
  onKlar: () => void;
  /** Ladda om och STANNA på personen (efter geokodning — se var adressen hamnade). */
  onLadda: () => void;
  onTillbaka: () => void;
}) {
  const [namn, setNamn] = useState(medarbetare.namn || "");
  const [epost, setEpost] = useState(medarbetare.epost || "");
  const [hemadress, setHemadress] = useState(medarbetare.hemadress || "");
  const [roll, setRoll] = useState(medarbetare.roll);
  // Maskinen på medarbetarraden — fanns inte i formuläret alls förut, fast
  // Dag-vyn och "Starta arbetspass" läser den (Oscar, JD810E 2026-09-29).
  const [maskinId, setMaskinId] = useState(medarbetare.maskin_id || "");
  const [timlon, setTimlon] = useState<string>(medarbetare.timlon_kr != null ? String(medarbetare.timlon_kr) : "");
  const [manadslon, setManadslon] = useState<string>(medarbetare.manadslon_kr != null ? String(medarbetare.manadslon_kr) : "");
  const [anstallningsdatum, setAnstallningsdatum] = useState(medarbetare.anstallningsdatum || "");
  // Reglaget sparar SJÄLVT, direkt när det slås om (se valjForetagsledare) — det hör inte till formulärets "Spara ändringar".
  const [foretagsledare, setForetagsledare] = useState(medarbetare.foretagsledare === true);
  const [foretagsledareSparar, setForetagsledareSparar] = useState(false);
  // Skyddsombud: samma mönster — sparas direkt när reglaget slås om.
  const [skyddsombud, setSkyddsombud] = useState(medarbetare.skyddsombud === true);
  const [skyddsombudSparar, setSkyddsombudSparar] = useState(false);
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [taBortLäge, setTaBortLäge] = useState(false);
  const [visaKopplaModal, setVisaKopplaModal] = useState(false);
  const { gaTill } = useAdminNav();
  // Anställningsnumret ligger på lönesystemets koppling, inte på personraden — men hör till personen och ändras här.
  const [anst, setAnst] = useState("");
  const [anstOriginal, setAnstOriginal] = useState("");
  const [anstKoppling, setAnstKoppling] = useState<string | null>(null);
  const [anstLaddad, setAnstLaddad] = useState(false);
  useEffect(() => {
    let avbruten = false;
    hamtaAnstallning(medarbetare.id).then(k => {
      if (avbruten) return;
      setAnst(k.nr); setAnstOriginal(k.nr); setAnstKoppling(k.lonesystemId); setAnstLaddad(true);
      if (k.fel) setSparFel(`Kunde inte läsa anställningsnumret: ${k.fel}`);
    });
    return () => { avbruten = true; };
  }, [medarbetare.id]);

  const personAndrat =
    namn !== (medarbetare.namn || "") ||
    epost !== (medarbetare.epost || "") ||
    hemadress !== (medarbetare.hemadress || "") ||
    roll !== medarbetare.roll ||
    maskinId !== (medarbetare.maskin_id || "") ||
    timlon !== (medarbetare.timlon_kr != null ? String(medarbetare.timlon_kr) : "") ||
    manadslon !== (medarbetare.manadslon_kr != null ? String(medarbetare.manadslon_kr) : "") ||
    anstallningsdatum !== (medarbetare.anstallningsdatum || "");
  const anstAndrat = anstLaddad && anst.trim() !== anstOriginal;
  // Det SPARADE numret kontrolleras mot Fortnox när anslutningen finns (annars: "kontrolleras när anslutningen finns").
  const anstKontroll = useAnstKontroll(anstOriginal, anstLaddad);
  const ändrat = personAndrat || anstAndrat;

  /**
   * Företagsledare / delägare sparas direkt när reglaget slås om. Förut låg det bakom "Spara ändringar" längst ner på sidan, och ett
   * reglage ser ut som något som gäller på en gång: Martin slog på det för sig själv och Joacim, gick därifrån, och prod hade false
   * (2026-10-14: inget skrivanrop mot medarbetare nådde Supabase; databasen släpper igenom skrivningen). Skrivningen verifieras som
   * övriga: .select() visar vad som faktiskt landade, och 0 rader eller fel sätter tillbaka reglaget och säger varför.
   */
  const valjForetagsledare = async (nytt: boolean) => {
    const fore = foretagsledare;
    setForetagsledare(nytt);
    setForetagsledareSparar(true);
    setSparFel(null);
    const { data: skrivet, error } = await supabase.from("medarbetare").update({ foretagsledare: nytt }).eq("id", medarbetare.id).select("id, foretagsledare");
    setForetagsledareSparar(false);
    if (error || !skrivet?.length || skrivet[0].foretagsledare !== nytt) {
      setForetagsledare(fore);
      setSparFel(`Företagsledare sparades inte: ${error?.message || "inget sparades — raden träffades inte"}`);
      return;
    }
    onForetagsledareSparad(medarbetare.id, nytt);
  };

  /** Skyddsombud sparas direkt, verifierat som Företagsledare. Väljs av förarna — admin registrerar bara vem det blev. */
  const valjSkyddsombud = async (nytt: boolean) => {
    const fore = skyddsombud;
    setSkyddsombud(nytt);
    setSkyddsombudSparar(true);
    setSparFel(null);
    const { data: skrivet, error } = await supabase.from("medarbetare").update({ skyddsombud: nytt }).eq("id", medarbetare.id).select("id, skyddsombud");
    setSkyddsombudSparar(false);
    if (error || !skrivet?.length || skrivet[0].skyddsombud !== nytt) {
      setSkyddsombud(fore);
      setSparFel(`Skyddsombud sparades inte: ${error?.message || "inget sparades — raden träffades inte"}`);
      return;
    }
    onSkyddsombudSparad(medarbetare.id, nytt);
  };

  const spara = async () => {
    setSparar(true);
    setSparFel(null);
    if (!personAndrat) {
      // Bara anställningsnumret ändrat: skriv det, och stanna kvar med felet om det inte gick.
      const fel = await sparaAnstallningsnummer(medarbetare.id, anstKoppling, anst);
      setSparar(false);
      if (fel) { setSparFel(fel); return; }
      onKlar();
      return;
    }
    const update: any = {
      namn: namn.trim() || null,
      epost: epost.trim() || null,
      hemadress: hemadress.trim() || null,
      roll,
      maskin_id: maskinId || null,
      timlon_kr: timlon === "" ? null : parseFloat(timlon),
      manadslon_kr: manadslon === "" ? null : parseFloat(manadslon),
      anstallningsdatum: anstallningsdatum || null,
    };
    const { data: skrivet, error } = await supabase.from("medarbetare").update(update).eq("id", medarbetare.id).select("id");
    if (error || !skrivet?.length) { setSparar(false); setSparFel(error?.message || "Inget sparades — raden träffades inte"); return; }
    if (anstAndrat) {
      const fel = await sparaAnstallningsnummer(medarbetare.id, anstKoppling, anst);
      if (fel) { setSparar(false); setSparFel(fel); return; }
    }
    // Ny hemadress → geokoda direkt och STANNA, så man ser var adressen hamnade.
    // (Triggern har redan märkt raden 'vantar' — nattjobbet tar den annars i natt.)
    if ((hemadress.trim() || null) !== (medarbetare.hemadress || null) && hemadress.trim()) {
      await fetch("/api/medarbetare/geokoda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: medarbetare.id }) }).catch(() => null);
      setSparar(false);
      onLadda();
      return;
    }
    setSparar(false);
    onKlar();
  };

  const taBort = async () => {
    setSparar(true);
    setSparFel(null);
    // Ta bort kopplingar först (FK)
    const kopplingar = await supabase.from("operator_medarbetare").delete().eq("medarbetare_id", medarbetare.id);
    if (kopplingar.error) { setSparar(false); setSparFel(kopplingar.error.message); return; }
    // .select() ger tillbaka raderna som faktiskt försvann: 0 rader utan fel = RLS stoppade den tyst.
    const { data, error } = await supabase.from("medarbetare").delete().eq("id", medarbetare.id).select("id");
    setSparar(false);
    if (error) { setSparFel(error.message); return; }
    if (!data?.length) { setSparFel("Inget raderades — raden träffades inte (bara admin kan ta bort en medarbetare)."); return; }
    onKlar();
  };

  const kopplaLossOperator = async (operator_id: string) => {
    setSparFel(null);
    const { data, error } = await supabase.from("operator_medarbetare")
      .delete().eq("operator_id", operator_id).eq("medarbetare_id", medarbetare.id).select("operator_id");
    if (error) { setSparFel(error.message); return; }
    if (!data?.length) { setSparFel("Kopplingen togs inte bort — raden träffades inte (bara admin kan ändra kopplingar)."); return; }
    onKlar();
  };

  return (
    <>
      {/* Sidhuvudet: tillbaka till vänster, Spara till höger (grå tills något är ändrat) — inte 1 700 px längre ned. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: AVSTAND.m }}>
        <Tillbaka onClick={onTillbaka}>Medarbetare</Tillbaka>
        <Lank onClick={spara} disabled={!ändrat || sparar}>{sparar ? "Sparar…" : "Spara"}</Lank>
      </div>
      {sparFel && <Besked>{sparFel}</Besked>}

      {/* Introduktionen: en förare som saknar maskin, hempunkt eller nummer hittar tillbaka till flödet härifrån. */}
      {anstLaddad && medarbetare.roll === "forare" && (() => {
        const saknas = introSaknas(introKlara(medarbetare, anstOriginal));
        if (saknas.length === 0) return null;
        return (
          <Kort style={{ marginBottom: AVSTAND.l }}>
            <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>Introduktionen är inte klar</p>
            <Stod>Personen saknar {ochLista(saknas)}.</Stod>
            <Sekundar smal onClick={() => gaTill({ flik: "medarbetare", params: { ny: "1", person: medarbetare.id } })} style={{ marginTop: AVSTAND.m }}>Fortsätt introduktionen</Sekundar>
          </Kort>
        );
      })()}

      {/* Grunduppgifter */}
      <Sektion topp={AVSTAND.s}>Personuppgifter</Sektion>
      <Kort>
        <Falt label="Namn" value={namn} onChange={setNamn} placeholder="För- och efternamn" />
        <Falt label="E-post" value={epost} onChange={setEpost} placeholder="namn@exempel.se" type="email"
          hint={medarbetare.user_id
            ? undefined
            : <span style={{ color: FARG.orange }}>Ingen inloggning kopplad — den kopplas när ett konto med samma e-post finns.</span>} />
        <Falt label="Hemadress" value={hemadress} onChange={setHemadress} placeholder="Kompersmåla 3, 362 96 Ryd" />
        <Val label="Roll" value={roll} onChange={setRoll} options={ROLLER} />
        <Val label="Maskin" value={maskinId} onChange={setMaskinId} options={[
          { value: "", label: "Ingen maskin" },
          ...Object.entries(maskiner).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: id, label: `${n} (${id})` })),
        ]} />
        {harForetagsledare && (
          <Reglage label="Företagsledare / delägare" value={foretagsledare} onChange={v => { if (!foretagsledareSparar) valjForetagsledare(v); }}
            hint={foretagsledareSparar ? "Sparar…" : "Sparas direkt. Ingen lön i appen."} />
        )}
        {medarbetare.roll === "forare" && (
          <Reglage label="Skyddsombud" value={skyddsombud} onChange={v => { if (!skyddsombudSparar) valjSkyddsombud(v); }}
            hint={skyddsombudSparar ? "Sparar…" : "Väljs av förarna. Ser alla maskinkoller och åtgärder."} />
        )}
      </Kort>

      {/* Hempunkten — var km räknas ifrån. Visar VAR adressen hamnade. */}
      <Sektion>Hempunkt för km</Sektion>
      <HempunktKort m={medarbetare} onLadda={onLadda} />

      {/* Löneuppgifter */}
      <Sektion>Löneuppgifter</Sektion>
      <Kort>
        <Falt label="Timlön (kr)" value={timlon} onChange={setTimlon} placeholder="—" type="number" />
        <Falt label="Månadslön (kr)" value={manadslon} onChange={setManadslon} placeholder="—" type="number" />
        <Falt label="Anställningsdatum" value={anstallningsdatum} onChange={setAnstallningsdatum} type="date" />
        <Falt label="Anställningsnummer" value={anst} onChange={setAnst} placeholder="—" disabled={!anstLaddad}
          hint={anstOriginal
            ? <AnstKontrollText kontroll={anstKontroll.kontroll} laddar={anstKontroll.laddar} nr={anstOriginal} />
            : anstLaddad && !anstKoppling
              ? "Fortnox är inte kopplat ännu — numret kontrolleras när det är det."
              : "Utan nummer kan lönen inte skickas."} />
      </Kort>

      {/* Kopplade operatörer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m }}>
        <Sektion>Kopplade operatörer ({operatorer.length})</Sektion>
        <Lank onClick={() => setVisaKopplaModal(true)} style={{ marginTop: AVSTAND.sektion, marginBottom: AVSTAND.m }}>+ Koppla</Lank>
      </div>
      {operatorer.length === 0 ? (
        <Kort><Tomt>Tiden når inte lönen utan koppling till maskinfilerna. Tryck + Koppla.</Tomt></Kort>
      ) : (
        <Lista>
          {operatorer.map((o, i) => (
            <Rad key={o.operator_id} sista={i === operatorer.length - 1}
              rubrik={o.operator_namn || o.operator_key || o.operator_id}
              detalj={`${o.operator_id}${o.maskin_id ? ` · ${maskiner[o.maskin_id] || o.maskin_id}` : ""}`}
              hoger={<Destruktiv smal onClick={() => kopplaLossOperator(o.operator_id)}>Ta bort</Destruktiv>} />
          ))}
        </Lista>
      )}

      {/* Ta bort: det enda som ligger längst ned. */}
      <div style={{ marginTop: AVSTAND.xl, display: "flex", flexDirection: "column", gap: AVSTAND.m }}>
        {!taBortLäge ? (
          <Destruktiv onClick={() => setTaBortLäge(true)} style={{ alignSelf: "center" }}>Ta bort medarbetare</Destruktiv>
        ) : (
          <Bekrafta
            text={`Säker på att du vill ta bort ${medarbetare.namn || "medarbetaren"}? Operatörskopplingar tas också bort.`}
            ja={sparar ? "Tar bort…" : "Ja, ta bort"} upptagen={sparar}
            onJa={taBort} onNej={() => setTaBortLäge(false)} />
        )}
      </div>

      {visaKopplaModal && (
        <KopplaOperatörModal
          medarbetareId={medarbetare.id}
          onKlar={() => { setVisaKopplaModal(false); onKlar(); }}
          onAvbryt={() => setVisaKopplaModal(false)}
        />
      )}
    </>
  );
}
