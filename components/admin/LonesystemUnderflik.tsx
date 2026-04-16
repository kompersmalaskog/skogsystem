"use client";
import React, { useState, useEffect, CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { C, secHead, Card, inputStyle, btnPrimary, btnSecondary } from "./design";
import { SYSTEM_LABELS, IMPLEMENTERADE } from "@/lib/lonesystem";
import type { SystemTyp, Koppling } from "@/lib/lonesystem/types";

const ALLA_SYSTEM: SystemTyp[] = ["fortnox", "visma", "hogia", "kontek", "crona", "agda", "csv"];

type Medarbetare = { id: string; namn: string | null };
type Artikelmappning = { id?: string; intern_typ: string; extern_kod: string; beskrivning: string | null };
type Anstallning = { medarbetare_id: string; lonesystem_id: string; anstallningsnummer: string | null };

const INTERN_TYPER: { key: string; label: string }[] = [
  { key: "timlon",         label: "Timlön" },
  { key: "overtid_vardag", label: "Övertid vardag" },
  { key: "ob_kvall",       label: "OB kväll/natt" },
  { key: "ob_natt",        label: "OB nattarbete" },
  { key: "ob_lordag",      label: "OB lördag" },
  { key: "ob_sondag",      label: "OB söndag" },
  { key: "korkostnad",     label: "Körersättning (mil)" },
  { key: "fardtid",        label: "Färdtidsersättning" },
  { key: "traktamente_hel", label: "Traktamente heldag" },
  { key: "traktamente_halv", label: "Traktamente halvdag" },
  { key: "skifttillagg",   label: "Skifttillägg" },
  { key: "bortovaro",      label: "Bortovaro >12h" },
];

export default function LonesystemUnderflik() {
  const [valdSystem, setValdSystem] = useState<SystemTyp>("fortnox");
  const [koppling, setKoppling] = useState<Koppling | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);

  // Form-state för credentials
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sparar, setSparar] = useState(false);

  // Test
  const [testar, setTestar] = useState(false);
  const [testResultat, setTestResultat] = useState<{ ok: boolean; meddelande: string } | null>(null);

  // Visa felmeddelande från callback
  const [callbackFel, setCallbackFel] = useState<string | null>(null);
  const [callbackOk, setCallbackOk] = useState(false);

  // Mappningar
  const [medarbetare, setMedarbetare] = useState<Medarbetare[]>([]);
  const [anstallningar, setAnstallningar] = useState<Record<string, string>>({});
  const [artiklar, setArtiklar] = useState<Record<string, Artikelmappning>>({});

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
      const [kopplingRes, medRes, artiklarRes] = await Promise.all([
        supabase.from("lonesystem_koppling").select("*").eq("system_typ", system).maybeSingle(),
        supabase.from("medarbetare").select("id, namn").order("namn"),
        supabase.from("lonesystem_artikelmappning").select("*"),
      ]);

      const k = (kopplingRes.data as Koppling) || null;
      setKoppling(k);
      setClientId(k?.api_client_id || "");
      setClientSecret(k?.api_client_secret || "");
      setMedarbetare(medRes.data || []);

      const artMap: Record<string, Artikelmappning> = {};
      for (const a of (artiklarRes.data || [])) artMap[a.intern_typ] = a;
      setArtiklar(artMap);

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

  const sparaKoppling = async () => {
    setSparar(true);
    setFel(null);
    try {
      if (koppling) {
        await supabase.from("lonesystem_koppling").update({
          api_client_id: clientId || null,
          api_client_secret: clientSecret || null,
        }).eq("id", koppling.id);
      } else {
        await supabase.from("lonesystem_koppling").insert({
          system_typ: valdSystem,
          api_client_id: clientId || null,
          api_client_secret: clientSecret || null,
          aktiv: false,
        });
      }
      await ladda(valdSystem);
    } catch (e: any) {
      setFel(e.message || String(e));
    } finally {
      setSparar(false);
    }
  };

  const testaAnslutning = async () => {
    setTestar(true);
    setTestResultat(null);
    try {
      const res = await fetch("/api/lonesystem/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_typ: valdSystem }),
      });
      const data = await res.json();
      setTestResultat(data);
    } catch (e: any) {
      setTestResultat({ ok: false, meddelande: e.message || String(e) });
    } finally {
      setTestar(false);
    }
  };

  const koppla = () => { window.location.href = "/api/lonesystem/fortnox/auth"; };

  const koppla_ifrån = async () => {
    if (!koppling) return;
    if (!confirm("Verkligen koppla ifrån? Tokens raderas.")) return;
    await supabase.from("lonesystem_koppling").update({
      access_token: null,
      refresh_token: null,
      token_utgar: null,
      aktiv: false,
    }).eq("id", koppling.id);
    await ladda(valdSystem);
  };

  const sparaArtikel = async (intern_typ: string, extern_kod: string, beskrivning: string) => {
    const befintlig = artiklar[intern_typ];
    if (befintlig?.id) {
      await supabase.from("lonesystem_artikelmappning")
        .update({ extern_kod, beskrivning, uppdaterad: new Date().toISOString() })
        .eq("id", befintlig.id);
    } else if (extern_kod.trim()) {
      await supabase.from("lonesystem_artikelmappning").insert({ intern_typ, extern_kod, beskrivning });
    }
    await ladda(valdSystem);
  };

  const sparaAnstallning = async (medarbetare_id: string, anstallningsnummer: string) => {
    if (!koppling) return;
    if (!anstallningsnummer.trim()) {
      await supabase.from("medarbetare_lonesystem")
        .delete().eq("medarbetare_id", medarbetare_id).eq("lonesystem_id", koppling.id);
    } else {
      await supabase.from("medarbetare_lonesystem").upsert({
        medarbetare_id,
        lonesystem_id: koppling.id,
        anstallningsnummer,
        uppdaterad: new Date().toISOString(),
      }, { onConflict: "medarbetare_id,lonesystem_id" });
    }
  };

  const stödjs = IMPLEMENTERADE.includes(valdSystem);
  const ansluten = !!koppling?.access_token;

  return (
    <>
      {/* Callback-meddelanden */}
      {callbackOk && (
        <Card style={{ background: "rgba(52,199,89,0.08)", border: `1px solid rgba(52,199,89,0.25)` }}>
          <p style={{ margin: 0, fontSize: 14, color: C.green, fontWeight: 600 }}>✓ Anslutningen lyckades.</p>
        </Card>
      )}
      {callbackFel && (
        <Card style={{ background: "rgba(255,69,58,0.08)", border: `1px solid rgba(255,69,58,0.25)` }}>
          <p style={{ margin: 0, fontSize: 14, color: C.red, fontWeight: 600 }}>Anslutning misslyckades</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: C.label }}>{callbackFel}</p>
        </Card>
      )}

      {/* Välj system */}
      <p style={secHead}>Välj system</p>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {ALLA_SYSTEM.map(s => (
            <button key={s} onClick={() => setValdSystem(s)} style={{
              padding: "10px 12px",
              background: valdSystem === s ? "rgba(10,132,255,0.12)" : "rgba(255,255,255,0.04)",
              border: valdSystem === s ? `1px solid ${C.blue}` : `1px solid rgba(255,255,255,0.06)`,
              borderRadius: 8,
              color: valdSystem === s ? C.blue : C.text,
              fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>{SYSTEM_LABELS[s]}</span>
              {!IMPLEMENTERADE.includes(s) && (
                <span style={{ fontSize: 9, color: C.label, fontWeight: 500 }}>STUB</span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Status */}
      <p style={{ ...secHead, marginTop: 22 }}>Status</p>
      <Card>
        {laddar ? (
          <p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <StatusRad
              label="Anslutning"
              värde={
                ansluten ? "Anslutet" :
                koppling ? "Credentials sparade, ej ansluten" :
                "Inte anslutet"
              }
              färg={ansluten ? C.green : koppling ? C.orange : C.label}
            />
            {koppling?.token_utgar && (
              <StatusRad label="Token utgår" värde={new Date(koppling.token_utgar).toLocaleString("sv-SE")} />
            )}
            {koppling?.senast_synkad && (
              <StatusRad label="Senast synkad" värde={new Date(koppling.senast_synkad).toLocaleString("sv-SE")} />
            )}
            {!stödjs && (
              <p style={{ margin: "8px 0 0", padding: 10, background: "rgba(255,159,10,0.08)", borderRadius: 8, fontSize: 12, color: C.orange }}>
                {SYSTEM_LABELS[valdSystem]} är ännu inte implementerat — UI:t fungerar för konfiguration, men anslutning och utskick är stubbar.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Credentials (för OAuth-system) */}
      {valdSystem !== "csv" && (
        <>
          <p style={{ ...secHead, marginTop: 22 }}>API-credentials</p>
          <Card>
            <Field label="Client ID" value={clientId} onChange={setClientId} placeholder="Från lönesystemets utvecklarportal" />
            <Field label="Client Secret" value={clientSecret} onChange={setClientSecret} placeholder="Från lönesystemets utvecklarportal" type="password" />
            <button onClick={sparaKoppling} disabled={sparar} style={{ ...btnSecondary, marginTop: 8, opacity: sparar ? 0.5 : 1 }}>
              {sparar ? "Sparar…" : "Spara credentials"}
            </button>
          </Card>
        </>
      )}

      {/* Anslut-knappar */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {valdSystem === "fortnox" && !ansluten && koppling?.api_client_id && (
          <button onClick={koppla} style={btnPrimary}>Anslut till Fortnox</button>
        )}
        {ansluten && (
          <button onClick={koppla_ifrån} style={btnSecondary}>Koppla ifrån</button>
        )}
        <button onClick={testaAnslutning} disabled={testar || !koppling} style={{ ...btnSecondary, opacity: testar || !koppling ? 0.5 : 1 }}>
          {testar ? "Testar…" : "Testa anslutning"}
        </button>
      </div>

      {testResultat && (
        <div style={{
          marginTop: 12, padding: 12,
          background: testResultat.ok ? "rgba(52,199,89,0.1)" : "rgba(255,69,58,0.1)",
          borderRadius: 10, fontSize: 13,
          color: testResultat.ok ? C.green : C.red,
        }}>
          {testResultat.meddelande}
        </div>
      )}

      {fel && (
        <div style={{ marginTop: 12, padding: 12, background: "rgba(255,69,58,0.1)", borderRadius: 10, color: C.red, fontSize: 13 }}>
          {fel}
        </div>
      )}

      {/* Mappa löneartkoder */}
      <p style={{ ...secHead, marginTop: 30 }}>Löneartkoder</p>
      <Card style={{ padding: 0 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 100px 1.4fr",
          padding: "10px 16px",
          fontSize: 11, color: C.label, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
          borderBottom: `1px solid ${C.line}`,
        }}>
          <span>Intern typ</span>
          <span>Extern kod</span>
          <span>Beskrivning</span>
        </div>
        {INTERN_TYPER.map((t, i) => (
          <ArtikelRad
            key={t.key}
            label={t.label}
            internTyp={t.key}
            befintlig={artiklar[t.key]}
            onSpara={(kod, besk) => sparaArtikel(t.key, kod, besk)}
            sista={i === INTERN_TYPER.length - 1}
          />
        ))}
      </Card>

      {/* Mappa anställningsnummer */}
      <p style={{ ...secHead, marginTop: 30 }}>Anställningsnummer</p>
      <Card style={{ padding: 0 }}>
        {medarbetare.length === 0 ? (
          <p style={{ margin: 0, padding: 18, color: C.label, fontSize: 14 }}>Inga medarbetare.</p>
        ) : medarbetare.map((m, i) => (
          <AnstallningRad
            key={m.id}
            namn={m.namn || "Namnlös"}
            befintligt={anstallningar[m.id] || ""}
            disabled={!koppling}
            onSpara={(nr) => sparaAnstallning(m.id, nr)}
            sista={i === medarbetare.length - 1}
          />
        ))}
      </Card>
      {!koppling && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.label }}>
          Spara credentials för {SYSTEM_LABELS[valdSystem]} först för att kunna mappa anställningsnummer.
        </p>
      )}
    </>
  );
}

function StatusRad({ label, värde, färg }: { label: string; värde: string; färg?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 13, color: C.label }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: färg || C.text }}>{värde}</span>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: C.label, marginBottom: 6, fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle as CSSProperties}
      />
    </div>
  );
}

function ArtikelRad({
  label, internTyp, befintlig, onSpara, sista,
}: {
  label: string;
  internTyp: string;
  befintlig?: Artikelmappning;
  onSpara: (extern_kod: string, beskrivning: string) => void;
  sista: boolean;
}) {
  const [kod, setKod] = useState(befintlig?.extern_kod || "");
  const [besk, setBesk] = useState(befintlig?.beskrivning || "");

  useEffect(() => {
    setKod(befintlig?.extern_kod || "");
    setBesk(befintlig?.beskrivning || "");
  }, [befintlig?.extern_kod, befintlig?.beskrivning]);

  const ändrat = kod !== (befintlig?.extern_kod || "") || besk !== (befintlig?.beskrivning || "");

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 100px 1.4fr 80px",
      gap: 8, alignItems: "center",
      padding: "10px 16px",
      borderBottom: sista ? "none" : `1px solid ${C.line}`,
    }}>
      <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      <input
        value={kod}
        onChange={e => setKod(e.target.value)}
        placeholder="Kod"
        style={{ ...inputStyle as CSSProperties, height: 34, fontSize: 13, padding: "0 10px" }}
      />
      <input
        value={besk}
        onChange={e => setBesk(e.target.value)}
        placeholder="Beskrivning"
        style={{ ...inputStyle as CSSProperties, height: 34, fontSize: 13, padding: "0 10px" }}
      />
      <button
        onClick={() => onSpara(kod, besk)}
        disabled={!ändrat}
        style={{
          height: 30, fontSize: 12, fontWeight: 600,
          background: ändrat ? "rgba(10,132,255,0.15)" : "rgba(255,255,255,0.04)",
          color: ändrat ? C.blue : C.label,
          border: "none", borderRadius: 7,
          cursor: ändrat ? "pointer" : "default", fontFamily: "inherit",
        }}
      >Spara</button>
    </div>
  );
}

function AnstallningRad({
  namn, befintligt, disabled, onSpara, sista,
}: {
  namn: string;
  befintligt: string;
  disabled: boolean;
  onSpara: (nr: string) => void;
  sista: boolean;
}) {
  const [nr, setNr] = useState(befintligt);
  useEffect(() => { setNr(befintligt); }, [befintligt]);
  const ändrat = nr !== befintligt;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1.5fr 1fr 80px",
      gap: 8, alignItems: "center",
      padding: "10px 16px",
      borderBottom: sista ? "none" : `1px solid ${C.line}`,
    }}>
      <span style={{ fontSize: 13, color: C.text }}>{namn}</span>
      <input
        value={nr}
        onChange={e => setNr(e.target.value)}
        placeholder="Anst.nr"
        disabled={disabled}
        style={{
          ...inputStyle as CSSProperties,
          height: 34, fontSize: 13, padding: "0 10px",
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        onClick={() => onSpara(nr)}
        disabled={!ändrat || disabled}
        style={{
          height: 30, fontSize: 12, fontWeight: 600,
          background: ändrat && !disabled ? "rgba(10,132,255,0.15)" : "rgba(255,255,255,0.04)",
          color: ändrat && !disabled ? C.blue : C.label,
          border: "none", borderRadius: 7,
          cursor: ändrat && !disabled ? "pointer" : "default", fontFamily: "inherit",
        }}
      >Spara</button>
    </div>
  );
}
