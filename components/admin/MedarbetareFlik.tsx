"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { Sektion, Stod, Kort, Lista, Rad, Falt, Val, Primar, Sekundar, Tillbaka, Destruktiv, Lank, Besked, Fel, Laddar, Tomt, Bekrafta, Etikett, Ikon } from "./ui";
import { useAdminNav } from "./nav";
import MedarbetareKontroller from "./MedarbetareKontroller";
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";
import { precisionText } from "@/lib/geokod";
import { maskinNamnMap, DIM_MASKIN_NAMN_KOLUMNER } from "@/lib/maskinNamn";

type Medarbetare = {
  id: string;
  namn: string | null;
  epost: string | null;
  hemadress: string | null;
  roll: string;
  maskin_id: string | null;
  timlon_kr: number | null;
  manadslon_kr: number | null;
  anstallningsdatum: string | null;
  // Kopplingen till inloggningskontot (sätts automatiskt i databasen sedan 20260929).
  user_id: string | null;
  // Hempunkten och varifrån den kom (migration 20260929_medarbetare_hem_geokod).
  hem_lat: number | null;
  hem_lng: number | null;
  hem_koord_kalla: string | null;
  hem_geokod_status: string | null;
  hem_geokod_etikett: string | null;
  hem_geokod_precision: string | null;
  hem_geokod_lat: number | null;
  hem_geokod_lng: number | null;
};

type OperatorRad = {
  operator_id: string;
  operator_namn: string | null;
  operator_key: string | null;
  maskin_id: string | null;
};

const ROLLER = [
  { value: "forare", label: "Förare" },
  { value: "admin", label: "Admin" },
];
const ROLL_ORD: Record<string, string> = { admin: "Admin", forare: "Förare" };

export default function MedarbetareFlik() {
  // Vad som är öppet står i adressen (?person=…, ?ny=1), så en omladdning stannar kvar.
  const { nav, sattParam, gaTill } = useAdminNav();
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

  const ladda = async () => {
    setLaddar(true);
    setFel(null);
    // Kontrollerna hämtas vid sidan av — ett fel där får inte fälla listan,
    // men det ska stå (MedarbetareKontroller visar det).
    fetch("/api/medarbetare/kontroller", { cache: "no-store" })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`); setKontroller(j); setKontrollFel(null); })
      .catch(e => { setKontroller(null); setKontrollFel(e?.message || String(e)); });
    try {
      const [medRes, opMedRes, dimOpRes, maskinRes] = await Promise.all([
        supabase.from("medarbetare")
          .select("id, namn, epost, hemadress, roll, maskin_id, timlon_kr, manadslon_kr, anstallningsdatum, user_id, hem_lat, hem_lng, hem_koord_kalla, hem_geokod_status, hem_geokod_etikett, hem_geokod_precision, hem_geokod_lat, hem_geokod_lng")
          .order("namn"),
        supabase.from("operator_medarbetare").select("operator_id, medarbetare_id"),
        supabase.from("dim_operator").select("operator_id, operator_namn, operator_key, maskin_id"),
        // Maskinnamn: EN källa, dim_maskin (lib/maskinNamn) — aldrig `maskiner`.
        supabase.from("dim_maskin").select(DIM_MASKIN_NAMN_KOLUMNER),
      ]);
      if (medRes.error) throw medRes.error;

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

  if (laddar) return <Laddar />;
  if (fel) return <Fel onForsok={ladda}>Kunde inte ladda medarbetare: {fel}</Fel>;

  if (arNy) {
    return <NyMedarbetare onKlar={() => { tillLista(); ladda(); }} onAvbryt={tillLista} />;
  }

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m }}>
        <Sektion topp={0}>Medarbetare ({medarbetare.length})</Sektion>
        <Lank onClick={onNy} style={{ marginBottom: AVSTAND.m }}>+ Ny</Lank>
      </div>

      {medarbetare.length === 0 ? (
        <Kort><Tomt>Inga medarbetare. Lägg till den första med + Ny.</Tomt></Kort>
      ) : (
        <Lista>
          {medarbetare.map((m, i) => {
            const ops = operatorerPerMed[m.id] || [];
            const maskinNamn = new Set<string>();
            for (const o of ops) if (o.maskin_id) maskinNamn.add(maskiner[o.maskin_id] || o.maskin_id);
            if (m.maskin_id) maskinNamn.add(maskiner[m.maskin_id] || m.maskin_id);
            return (
              <Rad key={m.id} onClick={() => onValj(m.id)} chevron sista={i === medarbetare.length - 1}
                rubrik={<span style={{ display: "inline-flex", alignItems: "center", gap: AVSTAND.s }}>{m.namn || "Namnlös"}<Etikett>{ROLL_ORD[m.roll] || m.roll}</Etikett></span>}
                detalj={<>{ops.length} operatör{ops.length === 1 ? "" : "er"}{maskinNamn.size > 0 && <> · {[...maskinNamn].join(", ")}</>}</>} />
            );
          })}
        </Lista>
      )}
    </>
  );
}

/* ─── DETALJ ─── */

function DetaljVy({
  medarbetare, operatorer, maskiner, onKlar, onLadda, onTillbaka,
}: {
  medarbetare: Medarbetare;
  operatorer: OperatorRad[];
  maskiner: Record<string, string>;
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
  const [sparar, setSparar] = useState(false);
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [taBortLäge, setTaBortLäge] = useState(false);
  const [visaKopplaModal, setVisaKopplaModal] = useState(false);

  const ändrat =
    namn !== (medarbetare.namn || "") ||
    epost !== (medarbetare.epost || "") ||
    hemadress !== (medarbetare.hemadress || "") ||
    roll !== medarbetare.roll ||
    maskinId !== (medarbetare.maskin_id || "") ||
    timlon !== (medarbetare.timlon_kr != null ? String(medarbetare.timlon_kr) : "") ||
    manadslon !== (medarbetare.manadslon_kr != null ? String(medarbetare.manadslon_kr) : "") ||
    anstallningsdatum !== (medarbetare.anstallningsdatum || "");

  const spara = async () => {
    setSparar(true);
    setSparFel(null);
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
      <Tillbaka onClick={onTillbaka}>Medarbetare</Tillbaka>

      {/* Grunduppgifter */}
      <Sektion topp={AVSTAND.s}>Personuppgifter</Sektion>
      <Kort>
        <Falt label="Namn" value={namn} onChange={setNamn} placeholder="För- och efternamn" />
        <Falt label="E-post" value={epost} onChange={setEpost} placeholder="namn@exempel.se" type="email"
          hint={medarbetare.user_id
            ? "Inloggning kopplad."
            : <span style={{ color: FARG.orange }}>Ingen inloggning kopplad. Den kopplas automatiskt när ett konto med samma e-post finns. Utan koppling kommer personen inte in i appen.</span>} />
        <Falt label="Hemadress" value={hemadress} onChange={setHemadress} placeholder="Gata, ort" />
        <Val label="Roll" value={roll} onChange={setRoll} options={ROLLER} />
        <Val label="Maskin" value={maskinId} onChange={setMaskinId} options={[
          { value: "", label: "Ingen maskin" },
          ...Object.entries(maskiner).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: id, label: `${n} (${id})` })),
        ]} />
      </Kort>

      {/* Hempunkten — var km räknas ifrån. Visar VAR adressen hamnade. */}
      <Sektion>Hempunkt för km</Sektion>
      <HempunktKort m={medarbetare} onLadda={onLadda} />

      {/* Löneuppgifter */}
      <Sektion>Löneuppgifter</Sektion>
      <Kort>
        <Falt label="Timlön (kr)" value={timlon} onChange={setTimlon} placeholder="—" type="number" />
        <Falt label="Månadslön (kr)" value={manadslon} onChange={setManadslon} placeholder="—" type="number" />
        <Falt label="Anställningsdatum" value={anstallningsdatum} onChange={setAnstallningsdatum} type="date"
          hint="Anställningsnummer per lönesystem sätts under Lön → Lönesystem." />
      </Kort>

      {/* Kopplade operatörer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m }}>
        <Sektion>Kopplade operatörer ({operatorer.length})</Sektion>
        <Lank onClick={() => setVisaKopplaModal(true)} style={{ marginTop: AVSTAND.sektion, marginBottom: AVSTAND.m }}>+ Koppla</Lank>
      </div>
      {operatorer.length === 0 ? (
        <Kort><Tomt>Inga operatörer kopplade. En operatör är namnet i maskinfilerna. Utan koppling når tiden inte lönen.</Tomt></Kort>
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

      {sparFel && <Besked>{sparFel}</Besked>}

      {/* Knappar */}
      <div style={{ marginTop: AVSTAND.xl, display: "flex", flexDirection: "column", gap: AVSTAND.m }}>
        <Primar onClick={spara} disabled={!ändrat || sparar}>{sparar ? "Sparar…" : "Spara ändringar"}</Primar>

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

/* ─── HEMPUNKT ─── */
// Var km räknas ifrån, varifrån punkten kom och — viktigast — VAR adressen
// hamnade. En landsbygdsadress i tätortens mitt ger fel km varje dag utan att
// någon märker det (Idekulla 6 ligger flera km utanför Ryd). Bara en träff på
// adressnivå används automatiskt (lib/geokod); allt grövre väntar här.
function HempunktKort({ m, onLadda }: { m: Medarbetare; onLadda: () => void }) {
  const [kör, setKör] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const karta = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
  const anropa = async (opt: { tvinga?: boolean; acceptera?: boolean } = {}) => {
    setKör(true); setFel(null);
    const r = await fetch("/api/medarbetare/geokoda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, ...opt }) });
    const j = await r.json().catch(() => ({}));
    setKör(false);
    if (!r.ok || !j.ok) { setFel(j.error || `Geokodningen misslyckades (HTTP ${r.status})`); return; }
    onLadda();
  };
  const knapp = (text: string, onClick: () => void) => (
    <Sekundar onClick={onClick} disabled={kör} style={{ marginTop: AVSTAND.m }}>{kör ? "Geokodar…" : text}</Sekundar>
  );
  const länk = (lat: number, lng: number, text: string) => (
    <a href={karta(lat, lng)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: AVSTAND.s, color: FARG.bla, ...TYP.meta }}>{text}</a>
  );
  const kalla = m.hem_koord_kalla === "gps" ? "satt med GPS i Maskinflytt"
    : m.hem_koord_kalla === "geokod" ? `från adressen — ${m.hem_geokod_etikett || "okänd etikett"} (${precisionText(m.hem_geokod_precision)})`
    : "satt för hand";
  const s = m.hem_geokod_status;
  const text = (t: React.ReactNode, farg: string = FARG.text) => <p style={{ margin: 0, ...TYP.text, color: farg }}>{t}</p>;
  const stod = (t: React.ReactNode) => <Stod style={{ marginTop: AVSTAND.m }}>{t}</Stod>;
  return (
    <Kort>
      {!m.hemadress?.trim() && m.hem_lat == null ? (
        text("Ingen hemadress, så km räknas inte. Fyll i adressen ovan och spara.", FARG.orange)
      ) : m.hem_lat != null && m.hem_lng != null ? (
        <>
          {text(`Punkten är ${kalla}.`)}
          {länk(m.hem_lat, m.hem_lng, "Visa punkten på kartan")}
          {s === "hoppad" && (
            <>
              {stod(`Adressen har ändrats men punkten är ${m.hem_koord_kalla === "gps" ? "satt med GPS" : "satt för hand"} och skrivs inte över automatiskt.`)}
              {knapp("Geokoda adressen ändå", () => anropa({ tvinga: true }))}
            </>
          )}
          {s === "osaker" && m.hem_geokod_lat != null && m.hem_geokod_lng != null && (
            stod(`Adressen hittades bara som ${precisionText(m.hem_geokod_precision)} (${m.hem_geokod_etikett}). Punkten ovan används.`)
          )}
        </>
      ) : s === "osaker" && m.hem_geokod_lat != null && m.hem_geokod_lng != null ? (
        <>
          {text(`Adressen hittades bara som ${precisionText(m.hem_geokod_precision)}: ${m.hem_geokod_etikett}. Används den blir km fel om personen bor utanför. Km räknas inte förrän du valt.`, FARG.orange)}
          {länk(m.hem_geokod_lat, m.hem_geokod_lng, "Visa förslaget på kartan")}
          {knapp("Använd förslaget ändå", () => anropa({ acceptera: true }))}
          {stod('Exaktare: personen trycker "spara nuvarande plats som hembas" hemma i Maskinflytt, eller justera adressen ovan.')}
        </>
      ) : s === "misslyckad" ? (
        <>
          {text(`Adressen hittades inte (${m.hem_geokod_etikett || "okänt fel"}). Kontrollera stavningen. Km räknas inte.`, FARG.orange)}
          {knapp("Försök igen", () => anropa())}
        </>
      ) : (
        <>
          {text("Adressen väntar på geokodning. Det sker i natt, eller nu.", FARG.text2)}
          {knapp("Geokoda nu", () => anropa())}
        </>
      )}
      {fel && <Stod farg={FARG.rod} style={{ marginTop: AVSTAND.m }}>{fel}</Stod>}
    </Kort>
  );
}

/* ─── NY MEDARBETARE ─── */

function NyMedarbetare({ onKlar, onAvbryt }: { onKlar: () => void; onAvbryt: () => void }) {
  const [namn, setNamn] = useState("");
  const [epost, setEpost] = useState("");
  const [roll, setRoll] = useState("forare");
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const spara = async () => {
    if (!namn.trim()) { setFel("Namn krävs"); return; }
    setSparar(true);
    setFel(null);
    const { error } = await supabase.from("medarbetare").insert({
      namn: namn.trim(),
      epost: epost.trim() || null,
      roll,
    });
    setSparar(false);
    if (error) { setFel(error.message); return; }
    onKlar();
  };

  return (
    <>
      <Tillbaka onClick={onAvbryt}>Avbryt</Tillbaka>
      <Sektion topp={AVSTAND.s}>Ny medarbetare</Sektion>
      <Kort>
        <Falt label="Namn *" value={namn} onChange={setNamn} placeholder="För- och efternamn" />
        <Falt label="E-post" value={epost} onChange={setEpost} placeholder="namn@exempel.se" type="email" />
        <Val label="Roll" value={roll} onChange={setRoll} options={ROLLER} />
      </Kort>
      {fel && <Besked>{fel}</Besked>}
      <Primar onClick={spara} disabled={sparar || !namn.trim()} style={{ marginTop: AVSTAND.xl }}>{sparar ? "Skapar…" : "Skapa medarbetare"}</Primar>
    </>
  );
}

/* ─── KOPPLA OPERATÖR ─── */

function KopplaOperatörModal({
  medarbetareId, onKlar, onAvbryt,
}: {
  medarbetareId: string;
  onKlar: () => void;
  onAvbryt: () => void;
}) {
  const [lediga, setLediga] = useState<OperatorRad[] | null>(null);
  const [valt, setValt] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [opMedRes, dimOpRes] = await Promise.all([
        supabase.from("operator_medarbetare").select("operator_id"),
        supabase.from("dim_operator").select("operator_id, operator_namn, operator_key, maskin_id").order("operator_namn"),
      ]);
      const taget = new Set((opMedRes.data || []).map((r: any) => r.operator_id));
      const lediga = (dimOpRes.data || []).filter((o: any) => !taget.has(o.operator_id));
      setLediga(lediga);
    })();
  }, []);

  const koppla = async () => {
    if (!valt) return;
    setSparar(true);
    setFel(null);
    const { error } = await supabase.from("operator_medarbetare").insert({
      operator_id: valt,
      medarbetare_id: medarbetareId,
    });
    setSparar(false);
    if (error) { setFel(error.message); return; }
    onKlar();
  };

  return (
    <div onClick={onAvbryt} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: AVSTAND.xl }}>
      <div onClick={e => e.stopPropagation()} style={{ background: FARG.kort, borderRadius: RADIE.sheet, padding: AVSTAND.xl, width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.rubrik, color: FARG.text, textAlign: "center" }}>Koppla operatör</p>
        <div style={{ flex: 1, overflowY: "auto", marginBottom: AVSTAND.m }}>
          {lediga === null ? (
            <Tomt>Laddar…</Tomt>
          ) : lediga.length === 0 ? (
            <Tomt>Alla operatörer är redan kopplade.</Tomt>
          ) : lediga.map((o, i) => (
            <button key={o.operator_id} type="button" onClick={() => setValt(o.operator_id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, width: "100%", minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px`, background: valt === o.operator_id ? FARG.fyllning : "transparent", border: "none", borderBottom: i === lediga.length - 1 ? "none" : `1px solid ${FARG.linje}`, borderRadius: RADIE.rad, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: FARG.text }}>
              <div>
                <div style={{ ...TYP.listtitel }}>{o.operator_namn || o.operator_key || o.operator_id}</div>
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{o.operator_id}{o.maskin_id ? ` · ${o.maskin_id}` : ""}</div>
              </div>
              {valt === o.operator_id && <Ikon namn="check" farg={FARG.text} />}
            </button>
          ))}
        </div>
        {fel && <Besked>{fel}</Besked>}
        <div style={{ display: "flex", gap: AVSTAND.m, marginTop: AVSTAND.m }}>
          <Sekundar onClick={onAvbryt} style={{ flex: 1 }}>Avbryt</Sekundar>
          <Primar onClick={koppla} disabled={!valt || sparar} style={{ flex: 1 }}>{sparar ? "Kopplar…" : "Koppla"}</Primar>
        </div>
      </div>
    </div>
  );
}
