"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP } from "@/lib/design/tokens";
import { Sektion, Stod, Kort, Lista, Besked, Primar, Sekundar, Bekrafta, Laddar } from "./ui";
import { SYSTEM_LABELS, IMPLEMENTERADE } from "@/lib/lonesystem";
import type { SystemTyp, Koppling } from "@/lib/lonesystem/types";
import { sparaAnstallningsnummer } from "@/lib/admin/anstallningsnummer";

const ALLA_SYSTEM: SystemTyp[] = ["fortnox", "visma", "hogia", "kontek", "crona", "agda", "csv"];

type Medarbetare = { id: string; namn: string | null };

export default function LonesystemUnderflik() {
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
      const [statusRes, kopplingRes, medRes] = await Promise.all([
        system === "fortnox" ? fetch("/api/fortnox/status").then(r => r.json()) : Promise.resolve(null),
        supabase.from("lonesystem_koppling").select("id, system_typ, aktiv, senast_synkad, skapad, token_utgar").eq("system_typ", system).maybeSingle(),
        supabase.from("medarbetare").select("id, namn").order("namn"),
      ]);

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

  // Skrivningen ger tillbaka FEL som text (raden visar det) — aldrig tyst. Löneartskoderna bor under Lön → Lönearter.
  const sparaAnstallning = async (medarbetare_id: string, anstallningsnummer: string): Promise<string | null> => {
    if (!koppling) return "Anslut systemet först — anställningsnumret hör till kopplingen.";
    const fel = await sparaAnstallningsnummer(medarbetare_id, koppling.id, anstallningsnummer);
    if (fel) return fel;
    setAnstallningar(prev => ({ ...prev, [medarbetare_id]: anstallningsnummer.trim() }));
    return null;
  };

  const stödjs = IMPLEMENTERADE.includes(valdSystem);
  const ansluten = !!koppling?.aktiv;
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
              {!IMPLEMENTERADE.includes(s) && <span style={{ ...TYP.micro, color: FARG.text3, marginLeft: AVSTAND.s }}>Stub</span>}
            </button>
          );
        })}
      </div>

      {/* Status */}
      <Sektion>Status</Sektion>
      {laddar ? (
        <Laddar />
      ) : (
        <Lista>
          <StatusRad label="Anslutning" varde={status} farg={ansluten ? FARG.gron : koppling ? FARG.orange : FARG.text2} sista={!koppling?.token_utgar && !koppling?.senast_synkad} />
          {koppling?.token_utgar && <StatusRad label="Token utgår" varde={new Date(koppling.token_utgar).toLocaleString("sv-SE")} sista={!koppling?.senast_synkad} />}
          {koppling?.senast_synkad && <StatusRad label="Senast synkad" varde={new Date(koppling.senast_synkad).toLocaleString("sv-SE")} sista />}
        </Lista>
      )}
      {!laddar && !stödjs && (
        <Stod farg={FARG.orange}>{SYSTEM_LABELS[valdSystem]} är ännu inte implementerat. Det går att fylla i uppgifter här, men anslutning och utskick är stubbar.</Stod>
      )}
      {valdSystem === "fortnox" && (
        <Stod>Inloggningsuppgifterna (FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET) ligger i miljövariabler. Tokens krypteras med AES-256-GCM innan de sparas i databasen.</Stod>
      )}

      {/* Anslut-knappar */}
      <div style={{ marginTop: AVSTAND.l, display: "flex", flexDirection: "column", gap: AVSTAND.m }}>
        {valdSystem === "fortnox" && !ansluten && <Primar onClick={koppla}>Anslut till Fortnox</Primar>}
        {ansluten && !bekraftaFranKoppling && <Sekundar onClick={() => setBekraftaFranKoppling(true)}>Koppla ifrån</Sekundar>}
        {ansluten && bekraftaFranKoppling && (
          <Bekrafta text="Koppla ifrån Fortnox? Tokens raderas och exporten slutar fungera tills du ansluter igen."
            ja="Ja, koppla ifrån" onJa={koppla_ifrån} onNej={() => setBekraftaFranKoppling(false)} />
        )}
        {franKopplingFel && <Stod farg={FARG.rod}>{franKopplingFel}</Stod>}
        <Sekundar onClick={testaAnslutning} disabled={testar || !koppling}>{testar ? "Testar…" : "Testa anslutning"}</Sekundar>
      </div>

      {testResultat && <Besked slag={testResultat.ok ? "ok" : "fel"}>{testResultat.meddelande}</Besked>}
      {fel && <Besked>{fel}</Besked>}

      {valdSystem === "fortnox" && (
        <Stod attr={{ "data-lonearter-hanvisning": "" }}>Vilken löneart i Fortnox varje rad skickas som väljer du under Lön → Lönearter.</Stod>
      )}

      {/* Mappa anställningsnummer */}
      <Sektion topp={AVSTAND.xxl}>Anställningsnummer</Sektion>
      {medarbetare.length === 0 ? (
        <Kort><Stod style={{ marginTop: 0 }}>Inga medarbetare.</Stod></Kort>
      ) : (
        <Lista>
          {medarbetare.map((m, i) => (
            <AnstallningRad
              key={m.id}
              namn={m.namn || "Namnlös"}
              befintligt={anstallningar[m.id] || ""}
              disabled={!koppling}
              onSpara={(nr) => sparaAnstallning(m.id, nr)}
              sista={i === medarbetare.length - 1}
            />
          ))}
        </Lista>
      )}
      {!koppling && (
        <Stod>Anslut {SYSTEM_LABELS[valdSystem]} först för att kunna fylla i anställningsnummer.</Stod>
      )}
    </>
  );
}

function StatusRad({ label, varde, farg, sista }: { label: string; varde: string; farg?: string; sista?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
      <span style={{ ...TYP.meta, color: FARG.text2 }}>{label}</span>
      <span style={{ ...TYP.listtitel, color: farg || FARG.text }}>{varde}</span>
    </div>
  );
}

const radFalt = {
  minHeight: TRAFFYTA.min, boxSizing: "border-box" as const, background: FARG.upphojt, border: "none", borderRadius: RADIE.rad,
  padding: `0 ${AVSTAND.m}px`, color: FARG.text, fontFamily: "inherit", outline: "none", minWidth: 0, ...TYP.text,
};

function SparaKnapp({ aktiv, upptagen, onClick }: { aktiv: boolean; upptagen: boolean; onClick: () => void }) {
  return (
    <Sekundar smal onClick={onClick} disabled={!aktiv || upptagen} style={{ flexShrink: 0 }}>{upptagen ? "…" : "Spara"}</Sekundar>
  );
}

function AnstallningRad({
  namn, befintligt, disabled, onSpara, sista,
}: {
  namn: string;
  befintligt: string;
  disabled: boolean;
  onSpara: (nr: string) => Promise<string | null>;
  sista: boolean;
}) {
  const [nr, setNr] = useState(befintligt);
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  useEffect(() => { setNr(befintligt); }, [befintligt]);
  const ändrat = nr.trim() !== befintligt;
  const spara = async () => {
    setSparar(true); setFel(null);
    setFel(await onSpara(nr));
    setSparar(false);
  };
  return (
    <div style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: AVSTAND.s }}>
        <span style={{ ...TYP.text, color: FARG.text, flex: "1 1 160px" }}>{namn}</span>
        <input aria-label={`${namn}, anställningsnummer`} value={nr} onChange={e => setNr(e.target.value)} placeholder="Anst.nr" disabled={disabled}
          style={{ ...radFalt, flex: "0 1 160px", opacity: disabled ? 0.4 : 1 }} />
        <SparaKnapp aktiv={ändrat && !disabled} upptagen={sparar} onClick={spara} />
      </div>
      {fel && <Stod farg={FARG.rod}>{fel}</Stod>}
    </div>
  );
}
