"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { Sektion, Stod, Lista, Rad, Besked, Primar, Sekundar, Destruktiv, Lank, Bekrafta, Laddar } from "./ui";
import { SYSTEM_LABELS, IMPLEMENTERADE } from "@/lib/lonesystem";
import type { SystemTyp, Koppling } from "@/lib/lonesystem/types";
import { useAdminNav } from "./nav";
import { relativTid, relativDatum, tokenGarUtSnart } from "@/lib/lonesystem/tokenStatus";

/** Bara de som finns på riktigt. Fem knappar märkta "Stub" som inte gjorde något är borta. */
const ALLA_SYSTEM: SystemTyp[] = ["fortnox", "csv"].filter(s => IMPLEMENTERADE.includes(s as SystemTyp)) as SystemTyp[];

type Medarbetare = { id: string; namn: string | null; foretagsledare?: boolean | null };

export default function LonesystemUnderflik() {
  const { gaTill } = useAdminNav();
  const [valdSystem, setValdSystem] = useState<SystemTyp>("fortnox");
  const [koppling, setKoppling] = useState<Koppling | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  // Egen bekräftelse i sidan (window.confirm blockeras tyst i inbäddade miljöer).
  const [bekraftaFranKoppling, setBekraftaFranKoppling] = useState(false);
  const [franKopplingFel, setFranKopplingFel] = useState<string | null>(null);

  // Test
  const [testar, setTestar] = useState(false);
  const [testResultat, setTestResultat] = useState<{ ok: boolean; meddelande: string } | null>(null);

  // Visa felmeddelande från callback
  const [callbackFel, setCallbackFel] = useState<string | null>(null);
  const [callbackOk, setCallbackOk] = useState(false);

  // Mappningar
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [anstallningar, setAnstallningar] = useState<Record<string, string>>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    const fel = url.searchParams.get("lonesystem_fel");
    const ok = url.searchParams.get("lonesystem_ok");
    if (fel) setCallbackFel(fel);
    if (ok) setCallbackOk(true);
    if (fel || ok) {
      url.searchParams.delete("lonesystem_fel");
      url.searchParams.delete("lonesystem_ok");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const ladda = async (system: SystemTyp) => {
    setLaddar(true);
    setFel(null);
    setTestResultat(null);
    try {
      // Fortnox-status hämtas via server-route (tokens är krypterade i DB)
      const [statusRes, kopplingRes, medRes0] = await Promise.all([
        system === "fortnox" ? fetch("/api/fortnox/status").then(r => r.json()) : Promise.resolve(null),
        supabase.from("lonesystem_koppling").select("id, system_typ, aktiv, senast_synkad, skapad, token_utgar").eq("system_typ", system).maybeSingle(),
        // Företagsledare får inga lönerader och behöver inget anställningsnummer. Kolumnen kommer med migrationen 20261013155407.
        supabase.from("medarbetare").select("id, namn, foretagsledare").order("namn"),
      ]);
      let medRes: { data: any[] | null; error: any } = medRes0 as any;
      if (medRes0.error && /foretagsledare/i.test(String(medRes0.error.message || ""))) {
        medRes = await supabase.from("medarbetare").select("id, namn").order("namn") as any;
      }

      const k = kopplingRes.data as Koppling | null;
      // Merge status-API:ns connected-flag med DB-raden
      if (k && statusRes) {
        k.aktiv = statusRes.connected;
        k.token_utgar = statusRes.token_utgar || k.token_utgar;
        k.senast_synkad = statusRes.senast_synkad || k.senast_synkad;
      }
      setKoppling(k);
      setMedarbetare(medRes.data || []);

      if (k) {
        const ansRes = await supabase.from("medarbetare_lonesystem")
          .select("medarbetare_id, anstallningsnummer")
          .eq("lonesystem_id", k.id);
        const ansMap: Record<string, string> = {};
        for (const a of (ansRes.data || [])) ansMap[a.medarbetare_id] = a.anstallningsnummer || "";
        setAnstallningar(ansMap);
      } else {
        setAnstallningar({});
      }
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setLaddar(false);
    }
  };

  useEffect(() => { ladda(valdSystem); }, [valdSystem]);

  const testaAnslutning = async () => {
    setTestar(true);
    setTestResultat(null);
    try {
      const res = await fetch("/api/fortnox/test", {
        method: "POST",
      });
      const data = await res.json();
      setTestResultat(data);
    } catch (e: any) {
      setTestResultat({ ok: false, meddelande: e.message || String(e) });
    } finally {
      setTestar(false);
    }
  };

  const koppla = () => { window.location.href = "/api/fortnox/auth"; };

  const koppla_ifrån = async () => {
    setFranKopplingFel(null);
    try {
      const r = await fetch("/api/fortnox/disconnect", { method: "POST" });
      if (!r.ok) { setFranKopplingFel(`Kunde inte koppla ifrån (HTTP ${r.status}).`); return; }
    } catch (e: any) {
      setFranKopplingFel(e?.message || String(e));
      return;
    }
    setBekraftaFranKoppling(false);
    await ladda(valdSystem);
  };

  const ansluten = !!koppling?.aktiv;
  const tokenSnart = tokenGarUtSnart(koppling?.token_utgar);
  const saknarNr = medarbetare.filter(m => m.foretagsledare !== true && !(anstallningar[m.id] || "").trim());
  const status = ansluten ? "Anslutet" : koppling ? "Uppgifter sparade, ej ansluten" : "Inte anslutet";

  return (
    <>
      {/* Callback-meddelanden */}
      {callbackOk && <Besked slag="ok">Anslutningen lyckades.</Besked>}
      {callbackFel && (
        <Besked>
          <strong>Anslutningen misslyckades.</strong> {callbackFel}
        </Besked>
      )}

      {/* Välj system */}
      <Sektion topp={callbackOk || callbackFel ? AVSTAND.sektion : 0}>Lönesystem</Sektion>
      <div style={{ display: "flex", flexWrap: "wrap", gap: AVSTAND.s }}>
        {ALLA_SYSTEM.map(s => {
          const vald = valdSystem === s;
          return (
            <button key={s} type="button" onClick={() => setValdSystem(s)} aria-pressed={vald}
              style={{ minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, border: "none", cursor: "pointer", fontFamily: "inherit", background: vald ? FARG.fyllning : FARG.kort, color: vald ? FARG.text : FARG.text2, ...TYP.listtitel }}>
              {SYSTEM_LABELS[s]}
            </button>
          );
        })}
      </div>

      {/* Status: anslutet eller inte, och när det senast synkades. Token-datumet står bara när det går ut snart, med Förnya bredvid. */}
      <Sektion>Status</Sektion>
      {laddar ? (
        <Laddar />
      ) : (
        <Lista>
          <StatusRad label="Anslutning" varde={status} farg={ansluten ? FARG.gron : koppling ? FARG.orange : FARG.text2} sista={!tokenSnart && !koppling?.senast_synkad} />
          {tokenSnart && (
            <StatusRad label={tokenSnart.utgangen ? "Token har gått ut" : "Token går ut"} varde={relativDatum(koppling!.token_utgar!)} farg={FARG.orange}
              hoger={<Lank smal onClick={koppla}>Förnya</Lank>} sista={!koppling?.senast_synkad} />
          )}
          {koppling?.senast_synkad && <StatusRad label="Senast synkad" varde={relativTid(koppling.senast_synkad)} sista />}
        </Lista>
      )}

      {/* Knappar */}
      <div style={{ marginTop: AVSTAND.l, display: "flex", flexDirection: "column", gap: AVSTAND.m }}>
        {valdSystem === "fortnox" && !ansluten && <Primar onClick={koppla}>Anslut till Fortnox</Primar>}
        <Sekundar onClick={testaAnslutning} disabled={testar || !koppling}>{testar ? "Testar…" : "Testa anslutning"}</Sekundar>
      </div>

      {testResultat && <Besked slag={testResultat.ok ? "ok" : "fel"}>{testResultat.meddelande}</Besked>}
      {fel && <Besked>{fel}</Besked>}

      {/* Anställningsnumret ändras på personen (Medarbetare). Här bara: vilka som saknar det, med knappen dit. */}
      {koppling && saknarNr.length > 0 && (
        <>
          <Sektion topp={AVSTAND.xxl}>Anställningsnummer</Sektion>
          <Lista>
            <Rad attr={{ "data-saknar-anstnr": "" }} rubrik={`${saknarNr.length} saknar anställningsnummer`}
              detalj={saknarNr.map(m => (m.namn || "Namnlös").split(" ")[0]).join(", ")}
              hoger={<Lank smal onClick={() => gaTill(saknarNr.length === 1 ? { flik: "medarbetare", params: { person: saknarNr[0].id } } : { flik: "medarbetare" })}>Fyll i</Lank>} sista />
          </Lista>
        </>
      )}

      {/* Koppla ifrån: sist och röd — det stoppar exporten. */}
      {ansluten && (
        <div style={{ marginTop: AVSTAND.xxl }}>
          {!bekraftaFranKoppling ? (
            <div style={{ display: "flex", justifyContent: "center" }}><Destruktiv smal onClick={() => setBekraftaFranKoppling(true)}>Koppla ifrån</Destruktiv></div>
          ) : (
            <Bekrafta text="Koppla ifrån Fortnox? Tokens raderas och exporten slutar fungera tills du ansluter igen."
              ja="Ja, koppla ifrån" onJa={koppla_ifrån} onNej={() => setBekraftaFranKoppling(false)} />
          )}
          {franKopplingFel && <Stod farg={FARG.rod}>{franKopplingFel}</Stod>}
        </div>
      )}
    </>
  );
}

function StatusRad({ label, varde, farg, sista, hoger }: { label: string; varde: string; farg?: string; sista?: boolean; hoger?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: AVSTAND.s }}>
        <span style={{ ...TYP.listtitel, color: farg || FARG.text }}>{varde}</span>
        {hoger}
      </span>
    </div>
  );
}
