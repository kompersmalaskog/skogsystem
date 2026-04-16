"use client";
import React, { useState, CSSProperties, ReactNode } from "react";

/* Design-tokens — matchar arbetsrapporten */
const C = {
  bg: "#000",
  card: "#1c1c1e",
  label: "#8e8e93",
  text: "#fff",
  line: "rgba(255,255,255,0.08)",
  blue: "#0a84ff",
  green: "#34c759",
  red: "#ff453a",
  orange: "#ff9f0a",
};

const css = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; }
  *::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

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

const Card = ({ children, style, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) => (
  <div onClick={onClick} style={{
    background: "#1c1c1e",
    borderRadius: 12,
    padding: "18px 20px",
    marginBottom: 10,
    border: "1px solid rgba(255,255,255,0.06)",
    cursor: onClick ? "pointer" : "default",
    ...style,
  }}>{children}</div>
);

export default function AdminClient({ currentUser }: { currentUser: { id: string; namn?: string | null; roll: string } }) {
  const [aktiv, setAktiv] = useState<Tab>("oversikt");
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
        {aktiv === "oversikt"      && <Placeholder label="Översikt" />}
        {aktiv === "medarbetare"   && <Placeholder label="Medarbetare" />}
        {aktiv === "avtal"         && <Placeholder label="Avtal" />}
        {aktiv === "lon"           && <Placeholder label="Lön" />}
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
