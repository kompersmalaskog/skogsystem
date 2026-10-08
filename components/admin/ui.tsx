"use client";
// Admins byggstenar — ur lib/design/tokens, samma känsla som arbetsrapporten: kort utan ram, tysta
// grå rader, små versala rubriker. Orange bara för det som kräver handling, grått för det som stämmer.
// Ersätter den gamla components/admin/design.tsx (egen palett, egna mått).
import React, { type CSSProperties, type ReactNode } from "react";
import {
  TYP, TNUM, AVSTAND, RADIE, FARG, KNAPP, INAKTIV, KORT, TRAFFYTA, IKON, RORELSE,
} from "@/lib/design/tokens";

/** Innehållskolumnens maxbredd på dator (Martin sitter vid skärm). Ett layoutmått, inte ett avstånd. */
export const MAXBREDD_ADMIN = 720;

const LINJE = `1px solid ${FARG.linje}`;

// ── Text ────────────────────────────────────────────────────────────────

/** Vyns rubrik. */
export function Titel({ children }: { children: ReactNode }) {
  return <h1 style={{ margin: `0 0 ${AVSTAND.xl}px`, ...TYP.titel, color: FARG.text }}>{children}</h1>;
}

/** Liten versal rubrik över en lista. `orange` bara när sektionen kräver handling. */
export function Sektion({ children, orange, topp = AVSTAND.sektion }: { children: ReactNode; orange?: boolean; topp?: number }) {
  return (
    <div style={{ ...TYP.micro, color: orange ? FARG.orange : FARG.text2, margin: `${topp}px 0 ${AVSTAND.m}px`, padding: `0 ${AVSTAND.xs}px` }}>
      {children}
    </div>
  );
}

/** Stödtext under en lista eller ett fält. */
export function Stod({ children, farg = FARG.text2, style }: { children: ReactNode; farg?: string; style?: CSSProperties }) {
  return <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: farg, ...style }}>{children}</p>;
}

// ── Ytor ────────────────────────────────────────────────────────────────

/** Kort med innehåll på fri yta. */
export function Kort({ children, style, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ ...KORT, cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </div>
  );
}

/** Lista: ett kort där raderna delar linjer. Sidmarginal i kortet, ingen ram. */
export function Lista({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `0 ${AVSTAND.sidmarginal}px`, ...style }}>
      {children}
    </div>
  );
}

/**
 * En rad i en lista: rubrik + dämpad detaljrad till vänster, valfritt innehåll till höger.
 * Hela raden är en knapp när `onClick` finns (44 px träffyta). Sista raden saknar linje.
 */
export function Rad({ rubrik, detalj, hoger, onClick, chevron, sista, rubrikFarg = FARG.text, dampad, children }: {
  rubrik: ReactNode;
  detalj?: ReactNode;
  hoger?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  sista?: boolean;
  rubrikFarg?: string;
  /** Grått för det som stämmer. */
  dampad?: boolean;
  children?: ReactNode;
}) {
  const inre = (
    <div style={{ display: "flex", alignItems: "center", gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: dampad ? FARG.text2 : rubrikFarg, overflowWrap: "anywhere" }}>{rubrik}</div>
        {detalj != null && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, overflowWrap: "anywhere" }}>{detalj}</div>}
      </div>
      {hoger != null && <div style={{ flexShrink: 0, ...TYP.meta, color: FARG.text2, textAlign: "right" }}>{hoger}</div>}
      {chevron && <Ikon namn="chevron_right" farg={FARG.text3} />}
    </div>
  );
  return (
    <div style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? "none" : LINJE }}>
      {onClick ? (
        <button type="button" onClick={onClick} style={{ display: "block", width: "100%", padding: 0, background: "none", border: "none", color: "inherit", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
          {inre}
        </button>
      ) : inre}
      {children}
    </div>
  );
}

/** Material Symbols-ikon (laddas av appen i layouten). */
export function Ikon({ namn, farg = FARG.text2, storlek = IKON.rad, fylld }: { namn: string; farg?: string; storlek?: number; fylld?: boolean }) {
  return (
    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: storlek, color: farg, lineHeight: 1, flexShrink: 0, fontVariationSettings: fylld ? "'FILL' 1" : "'FILL' 0" }}>
      {namn}
    </span>
  );
}

// ── Knappar ─────────────────────────────────────────────────────────────

type KnappProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Bredd efter innehåll i stället för full bredd. */
  smal?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
  href?: string;
  target?: string;
};

function knapp(bas: CSSProperties) {
  return function Knapp({ children, onClick, disabled, smal, style, type = "button" }: KnappProps) {
    return (
      <button type={type} onClick={onClick} disabled={disabled}
        style={{ ...bas, ...(smal ? { width: "auto", display: "inline-flex" } : null), ...(disabled ? INAKTIV : null), ...style }}>
        {children}
      </button>
    );
  };
}
/** Skärmens EN handling. */
export const Primar = knapp(KNAPP.primar);
/** Vanlig handling. */
export const Sekundar = knapp(KNAPP.sekundar);
/** Undantag, grå text. */
export const Tertiar = knapp(KNAPP.tertiar);
/** Blå text: bara navigerar eller avbryter (Avbryt, Tillbaka). */
export const Lank = knapp(KNAPP.lank);
/** Röd text: kräver alltid bekräftelse. */
export const Destruktiv = knapp(KNAPP.destruktiv);

/** Tillbakaknapp överst i en detaljvy. */
export function Tillbaka({ onClick, children = "Tillbaka" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...KNAPP.lank, marginBottom: AVSTAND.s, gap: AVSTAND.xs }}>
      <Ikon namn="chevron_left" farg={FARG.bla} />{children}
    </button>
  );
}

// ── Formulär ────────────────────────────────────────────────────────────

const faltStil: CSSProperties = {
  width: "100%",
  minHeight: TRAFFYTA.min,
  boxSizing: "border-box",
  background: FARG.upphojt,
  border: "none",
  borderRadius: RADIE.rad,
  padding: `0 ${AVSTAND.m}px`,
  color: FARG.text,
  fontFamily: "inherit",
  ...TYP.text,
  outline: "none",
};

export function Falt({ label, value, onChange, placeholder, type = "text", hint, min, max, step, disabled, id }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: ReactNode;
  min?: string;
  max?: string;
  step?: string;
  disabled?: boolean;
  id?: string;
}) {
  const nyckel = id || `falt-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <label htmlFor={nyckel} style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{label}</label>
      <input id={nyckel} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        min={min} max={max} step={step} disabled={disabled} style={{ ...faltStil, ...(disabled ? { opacity: 0.4 } : null) }} />
      {hint && <Stod>{hint}</Stod>}
    </div>
  );
}

export function Val({ label, value, onChange, options, hint, id }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
  id?: string;
}) {
  const nyckel = id || `val-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <label htmlFor={nyckel} style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{label}</label>
      <select id={nyckel} value={value} onChange={e => onChange(e.target.value)} style={faltStil}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: FARG.upphojt, color: FARG.text }}>{o.label}</option>)}
      </select>
      {hint && <Stod>{hint}</Stod>}
    </div>
  );
}

/** På/av. Vit när på, grå när av: aldrig grön eller blå fyllning. */
export function Reglage({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
        <span style={{ ...TYP.text, color: FARG.text }}>{label}</span>
        <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
          style={{ width: TRAFFYTA.primar + AVSTAND.s, height: AVSTAND.xxl, borderRadius: AVSTAND.xl, border: "none", cursor: "pointer", flexShrink: 0, position: "relative", background: value ? FARG.text : FARG.upphojt, transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>
          <span style={{ position: "absolute", top: AVSTAND.xs, left: value ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xs, width: AVSTAND.xl, height: AVSTAND.xl, borderRadius: RADIE.cirkel, background: value ? FARG.bg : FARG.text2, transition: `left ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
        </button>
      </div>
      {hint && <Stod>{hint}</Stod>}
    </div>
  );
}

// ── Lägen: laddar, fel, tomt, besked ────────────────────────────────────

export function Laddar({ children = "Laddar…" }: { children?: ReactNode }) {
  return <Kort><p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{children}</p></Kort>;
}

/** Ett fel som står kvar tills man gör något. Rött bara för själva ordet fel. */
export function Fel({ children, onForsok }: { children: ReactNode; onForsok?: () => void }) {
  return (
    <Kort>
      <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>{children}</p>
      {onForsok && <Sekundar smal onClick={onForsok} style={{ marginTop: AVSTAND.m }}>Försök igen</Sekundar>}
    </Kort>
  );
}

/** Besked under ett formulär: fel (rött) eller en bekräftelse (grönt). */
export function Besked({ children, slag = "fel" }: { children: ReactNode; slag?: "fel" | "ok" | "info" }) {
  const farg = slag === "fel" ? FARG.rod : slag === "ok" ? FARG.gron : FARG.text2;
  return <div role={slag === "fel" ? "alert" : "status"} style={{ marginTop: AVSTAND.l, padding: AVSTAND.m, background: FARG.kort, borderRadius: RADIE.rad, ...TYP.meta, color: farg }}>{children}</div>;
}

export function Tomt({ children }: { children: ReactNode }) {
  return <div style={{ padding: `${AVSTAND.xl}px ${AVSTAND.l}px`, textAlign: "center", ...TYP.meta, color: FARG.text2 }}>{children}</div>;
}

/** Bekräftelse i sidan för det som är destruktivt (window.confirm blockeras tyst i inbäddade miljöer). */
export function Bekrafta({ text, ja, nej = "Avbryt", onJa, onNej, upptagen }: {
  text: ReactNode; ja: string; nej?: string; onJa: () => void; onNej: () => void; upptagen?: boolean;
}) {
  return (
    <Kort>
      <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.text }}>{text}</p>
      <div style={{ display: "flex", gap: AVSTAND.m }}>
        <Sekundar onClick={onNej} style={{ flex: 1 }}>{nej}</Sekundar>
        <Sekundar onClick={onJa} disabled={upptagen} style={{ flex: 1, background: FARG.rod, color: FARG.text }}>{ja}</Sekundar>
      </div>
    </Kort>
  );
}

// ── Små etiketter ───────────────────────────────────────────────────────

/** Ord i en liten ruta: roll, status. Färgen förstärker ordet, bär det aldrig ensam. */
export function Etikett({ children, farg = FARG.text2 }: { children: ReactNode; farg?: string }) {
  return (
    <span style={{ ...TYP.micro, color: farg, background: FARG.fyllning, borderRadius: RADIE.stapel, padding: `${AVSTAND.xs}px ${AVSTAND.s}px`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** Siffra i orange cirkel: hur mycket som väntar. */
export function Markering({ antal }: { antal: number }) {
  return (
    <span style={{ ...TYP.micro, ...TNUM, letterSpacing: 0, minWidth: AVSTAND.xl, height: AVSTAND.xl, padding: `0 ${AVSTAND.s}px`, boxSizing: "border-box", borderRadius: AVSTAND.xl, background: FARG.orange, color: FARG.bg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {antal}
    </span>
  );
}
