"use client";
import React, { CSSProperties, ReactNode } from "react";

/* Design-tokens — matchar arbetsrapporten */
export const C = {
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

export const adminCss = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; }
  *::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

export const secHead: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 11,
  fontWeight: 700,
  color: "#636366",
  textTransform: "uppercase",
  letterSpacing: "0.15em",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  background: "#2a2a2c",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
  padding: "0 14px",
  color: "#fff",
  fontSize: 15,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export const btnPrimary: CSSProperties = {
  width: "100%",
  height: 48,
  background: "#34c759",
  color: "#fff",
  border: "none",
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const btnSecondary: CSSProperties = {
  width: "100%",
  height: 44,
  background: "#2a2a2a",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const btnDanger: CSSProperties = {
  width: "100%",
  height: 44,
  background: "transparent",
  color: C.red,
  border: `1px solid rgba(255,69,58,0.3)`,
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const Card = ({ children, style, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) => (
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

export const Row = ({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 0",
    borderBottom: `1px solid ${C.line}`,
    ...style,
  }}>
    <span style={{ fontSize: 14, color: C.label }}>{label}</span>
    <div style={{ fontSize: 15, color: C.text, textAlign: "right" }}>{children}</div>
  </div>
);

export const ChevronRight = () => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
    <path d="M1 1l6 6-6 6" stroke="#636366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
