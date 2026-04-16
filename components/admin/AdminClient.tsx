"use client";
import React, { useState, useEffect, CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { expectedWorkMinutes } from "@/lib/roda-dagar";
import { C, adminCss as css, secHead, Card } from "./design";
import MedarbetareFlik from "./MedarbetareFlik";
import AvtalFlik from "./AvtalFlik";
import LonFlik from "./LonFlik";

const shell: CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#e2e2e2",
  fontFamily: "'Inter',-apple-system,'SF Pro Display',sans-serif",
  WebkitFontSmoothing: "antialiased",
  display: "flex",
  flexDirection: "column",
  padding: "0 20px 100px",
  boxSizing: "border-box",
  width: "100%",
};

const topBar: CSSProperties = { paddingTop: 24, paddingBottom: 12 };

type Tab = "oversikt" | "medarbetare" | "avtal" | "lon" | "installningar";

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: "oversikt",      icon: "dashboard",   label: "Översikt" },
  { key: "medarbetare",   icon: "group",       label: "Medarbetare" },
  { key: "avtal",         icon: "description", label: "Avtal" },
  { key: "lon",           icon: "payments",    label: "Lön" },
  { key: "installningar", icon: "settings",    label: "Inst." },
];

function BottomNav({ aktiv, onNav }: { aktiv: Tab; onNav: (t: Tab) => void }) {
  return (
    <nav style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      width: "100%",
      zIndex: 50,
      display: "flex",
      justifyContent: "space-around",
      alignItems: "center",
      padding: "10px 8px 22px",
      background: "rgba(31,31,31,0.7)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: "16px 16px 0 0",
      boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
    }}>
      {TABS.map(t => (
        <button key={t.key} onClick={() => onNav(t.key)} style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: aktiv === t.key ? "#adc6ff" : "#8b90a0",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "'Inter',sans-serif",
          borderRadius: 12,
          height: 48,
          minWidth: 56,
          padding: "0 4px",
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 22,
            marginBottom: 2,
            fontVariationSettings: aktiv === t.key ? "'FILL' 1" : "'FILL' 0",
          }}>{t.icon}</span>
          <span style={{ fontSize: 10, fontWeight: aktiv === t.key ? 600 : 500 }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function AdminClient({ currentUser }: { currentUser: { id: string; namn?: string | null; roll: string } }) {
  const sp = useSearchParams();
  const förvald = sp?.get("flik") as Tab | null;
  const giltig = förvald && TABS.some(t => t.key === förvald);
  const [aktiv, setAktiv] = useState<Tab>(giltig ? (förvald as Tab) : "oversikt");
  return (
    <div style={shell}>
      <style>{css}</style>
      <div style={topBar}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>Admin</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.label }}>
          {currentUser.namn || "—"} · {currentUser.roll}
        </p>
      </div>

      <main style={{ flex: 1, paddingTop: 16, animation: "fadeUp 0.25s ease-out" }} key={aktiv}>
        {aktiv === "oversikt"      && <OversiktFlik />}
        {aktiv === "medarbetare"   && <MedarbetareFlik />}
        {aktiv === "avtal"         && <AvtalFlik />}
        {aktiv === "lon"           && <LonFlik currentUser={currentUser} />}
        {aktiv === "installningar" && <Placeholder label="Inställningar" />}
      </main>

      <BottomNav aktiv={aktiv} onNav={setAktiv} />
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <Card>
      <p style={{ margin: 0, fontSize: 15, color: C.label }}>{label} — kommer i nästa steg.</p>
    </Card>
  );
}

/* ─── ÖVERSIKT ─── */

type ÖversiktData = {
  antalMedarbetare: number;
  dagensInloggade: number;
  dagensBekraftade: number;
  vilobrottAntal: number;
  förväntadeMin: number;
  månadensÖvertid: { medarbetare: string; jobbade: number; övertid: number }[];
  momFiler: { filnamn: string; importerad_tid: string; maskin_id: string; status: string }[];
  laddar: boolean;
  fel: string | null;
};

// Övertidstak per månad (kollektivavtal: 250h/år ≈ 21h/mån, vi använder 25h som progress-cap)
const ÖVERTID_REFERENS_MIN = 25 * 60;

function OversiktFlik() {
  const [data, setData] = useState<ÖversiktData>({
    antalMedarbetare: 0,
    dagensInloggade: 0,
    dagensBekraftade: 0,
    vilobrottAntal: 0,
    förväntadeMin: 0,
    månadensÖvertid: [],
    momFiler: [],
    laddar: true,
    fel: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const nu = new Date();
        const idag = nu.toISOString().slice(0, 10);
        const månStart = idag.slice(0, 7) + "-01";
        const förväntadeMin = expectedWorkMinutes(nu.getFullYear(), nu.getMonth());

        const [med, dagensRes, månadRes, momRes] = await Promise.all([
          supabase.from("medarbetare").select("id, namn", { count: "exact" }),
          supabase.from("arbetsdag").select("medarbetare_id, bekraftad").eq("datum", idag),
          supabase.from("arbetsdag").select("medarbetare_id, arbetad_min").gte("datum", månStart),
          supabase.from("meta_importerade_filer")
            .select("filnamn, importerad_tid, maskin_id, status")
            .order("importerad_tid", { ascending: false })
            .limit(5),
        ]);

        if (cancelled) return;

        const namnMap = new Map<string, string>(
          (med.data || []).map((m: any) => [m.id, m.namn || "—"])
        );

        const antal = med.count ?? (med.data?.length || 0);
        const dagensRader = dagensRes.data || [];
        const dagensInloggade = new Set(dagensRader.map((d: any) => d.medarbetare_id)).size;
        const dagensBekraftade = dagensRader.filter((d: any) => d.bekraftad).length;

        const minMap: Record<string, number> = {};
        for (const d of (månadRes.data || [])) {
          if (!d.medarbetare_id) continue;
          minMap[d.medarbetare_id] = (minMap[d.medarbetare_id] || 0) + (d.arbetad_min || 0);
        }
        const månadensÖvertid = Object.entries(minMap)
          .map(([id, jobbade]) => ({
            medarbetare: namnMap.get(id) || id.slice(0, 8),
            jobbade,
            övertid: Math.max(0, jobbade - förväntadeMin),
          }))
          .filter(r => r.övertid > 0)
          .sort((a, b) => b.övertid - a.övertid);

        setData({
          antalMedarbetare: antal,
          dagensInloggade,
          dagensBekraftade,
          vilobrottAntal: 0, // Beräknas i steg 7 (Vilobrott-underflik)
          förväntadeMin,
          månadensÖvertid,
          momFiler: momRes.data || [],
          laddar: false,
          fel: null,
        });
      } catch (e: any) {
        if (!cancelled) setData(d => ({ ...d, laddar: false, fel: e.message || String(e) }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (data.laddar) {
    return <Card><p style={{ margin: 0, color: C.label, fontSize: 14 }}>Laddar…</p></Card>;
  }
  if (data.fel) {
    return <Card style={{ border: `1px solid ${C.red}` }}>
      <p style={{ margin: 0, color: C.red, fontSize: 14 }}>Kunde inte ladda översikt: {data.fel}</p>
    </Card>;
  }

  return (
    <>
      {/* KPI-kort */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <Kpi label="Medarbetare" value={String(data.antalMedarbetare)} />
        <Kpi label="Inloggade idag" value={`${data.dagensInloggade} st`} />
        <Kpi label="Bekräftade idag" value={`${data.dagensBekraftade} st`} />
        <Kpi
          label="Vilobrott vecka"
          value={data.vilobrottAntal === 0 ? "0" : `${data.vilobrottAntal}`}
          highlight={data.vilobrottAntal > 0}
        />
      </div>

      {/* Månadens övertid per förare */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <p style={{ ...secHead, margin: 0 }}>Månadens övertid</p>
        <span style={{ fontSize: 11, color: C.label, fontWeight: 500 }}>
          ref. {(data.förväntadeMin / 60).toFixed(0)} h normaltid
        </span>
      </div>
      <Card>
        {data.månadensÖvertid.length === 0 ? (
          <p style={{ margin: 0, color: C.label, fontSize: 14 }}>Ingen övertid registrerad denna månad.</p>
        ) : (
          data.månadensÖvertid.map((r, i) => {
            const övTim = r.övertid / 60;
            const jobbTim = r.jobbade / 60;
            const procent = Math.min(100, (r.övertid / ÖVERTID_REFERENS_MIN) * 100);
            const överTak = r.övertid > ÖVERTID_REFERENS_MIN;
            return (
              <div key={i} style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 0",
                borderBottom: i === data.månadensÖvertid.length - 1 ? "none" : `1px solid ${C.line}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 14 }}>
                  <span style={{ color: C.text, fontWeight: 500 }}>{r.medarbetare}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ color: C.label, fontSize: 12 }}>{jobbTim.toFixed(1)} h jobbade</span>
                    <span style={{ color: överTak ? C.red : C.orange, fontWeight: 700 }}>
                      +{övTim.toFixed(1)} h
                    </span>
                  </span>
                </div>
                <div style={{
                  height: 4,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${procent}%`,
                    background: överTak ? C.red : C.orange,
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Senaste MOM-filer */}
      <p style={{ ...secHead, marginTop: 22 }}>Senast importerade MOM-filer</p>
      <Card>
        {data.momFiler.length === 0 ? (
          <p style={{ margin: 0, color: C.label, fontSize: 14 }}>Inga importerade filer hittade.</p>
        ) : (
          data.momFiler.map((f, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              borderBottom: i === data.momFiler.length - 1 ? "none" : `1px solid ${C.line}`,
              fontSize: 13,
            }}>
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, flex: 1 }}>
                <span style={{
                  color: C.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>{f.filnamn}</span>
                <span style={{ color: C.label, fontSize: 11, marginTop: 2 }}>{f.maskin_id}</span>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{ color: f.status === "OK" ? C.green : C.red, fontSize: 11, fontWeight: 600 }}>
                  {f.status}
                </span>
                <div style={{ color: C.label, fontSize: 11 }}>
                  {f.importerad_tid ? new Date(f.importerad_tid).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      background: "#1c1c1e",
      borderRadius: 12,
      padding: 16,
      border: highlight ? `1px solid ${C.red}` : "1px solid rgba(255,255,255,0.06)",
    }}>
      <p style={{
        margin: 0,
        fontSize: 11,
        color: C.label,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>{label}</p>
      <p style={{
        margin: "8px 0 0",
        fontSize: 26,
        fontWeight: 700,
        color: highlight ? C.red : C.text,
        letterSpacing: "-0.02em",
      }}>{value}</p>
    </div>
  );
}
