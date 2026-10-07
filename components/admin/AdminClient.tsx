"use client";
import React, { useState, useEffect, CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ymdLokal } from "@/lib/datumLokal";
import { C, adminCss as css, secHead, Card } from "./design";
import MedarbetareFlik from "./MedarbetareFlik";
import MaskinerFlik from "./MaskinerFlik";
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

type Tab = "oversikt" | "medarbetare" | "maskiner" | "avtal" | "lon";

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: "oversikt",      icon: "dashboard",   label: "Översikt" },
  { key: "medarbetare",   icon: "group",       label: "Medarbetare" },
  { key: "maskiner",      icon: "agriculture", label: "Maskiner" },
  { key: "avtal",         icon: "description", label: "Avtal" },
  { key: "lon",           icon: "payments",    label: "Lön" },
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
        {aktiv === "maskiner"      && <MaskinerFlik />}
        {aktiv === "avtal"         && <AvtalFlik />}
        {aktiv === "lon"           && <LonFlik currentUser={currentUser} />}
      </main>

      <BottomNav aktiv={aktiv} onNav={setAktiv} />
    </div>
  );
}

/* ─── ÖVERSIKT ─── */

type ÖversiktData = {
  antalMedarbetare: number;
  dagensInloggade: number;
  dagensBekraftade: number;
  momFiler: { filnamn: string; importerad_tid: string; maskin_id: string; status: string }[];
  laddar: boolean;
  fel: string | null;
};

function OversiktFlik() {
  const [data, setData] = useState<ÖversiktData>({
    antalMedarbetare: 0,
    dagensInloggade: 0,
    dagensBekraftade: 0,
    momFiler: [],
    laddar: true,
    fel: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // LOKALT datum — toISOString() ger gårdagen före 02:00 på sommaren.
        const idag = ymdLokal(new Date());

        const [med, dagensRes, momRes] = await Promise.all([
          supabase.from("medarbetare").select("id", { count: "exact" }),
          supabase.from("arbetsdag").select("medarbetare_id, bekraftad").eq("datum", idag),
          supabase.from("meta_importerade_filer")
            .select("filnamn, importerad_tid, maskin_id, status")
            .order("importerad_tid", { ascending: false })
            .limit(5),
        ]);

        if (cancelled) return;

        // Ett läsfel är aldrig "noll" — det ska stå.
        const lasFel = med.error || dagensRes.error || momRes.error;
        if (lasFel) throw lasFel;

        const antal = med.count ?? (med.data?.length || 0);
        const dagensRader = dagensRes.data || [];
        const dagensInloggade = new Set(dagensRader.map((d: any) => d.medarbetare_id)).size;
        const dagensBekraftade = dagensRader.filter((d: any) => d.bekraftad).length;

        setData({
          antalMedarbetare: antal,
          dagensInloggade,
          dagensBekraftade,
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        <Kpi label="Medarbetare" value={String(data.antalMedarbetare)} />
        <Kpi label="Inloggade idag" value={`${data.dagensInloggade} st`} />
        <Kpi label="Bekräftade idag" value={`${data.dagensBekraftade} st`} />
      </div>

      {/* Senaste MOM-filer */}
      <p style={secHead}>Senast importerade MOM-filer</p>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#1c1c1e",
      borderRadius: 12,
      padding: 16,
      border: "1px solid rgba(255,255,255,0.06)",
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
        color: C.text,
        letterSpacing: "-0.02em",
      }}>{value}</p>
    </div>
  );
}
