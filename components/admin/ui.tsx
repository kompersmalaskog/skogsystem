"use client";
// Admins byggstenar — ur lib/design/tokens, samma känsla som arbetsrapporten: kort utan ram, tysta
// grå rader, små versala rubriker. Orange bara för det som kräver handling, grått för det som stämmer.
// Ersätter den gamla components/admin/design.tsx (egen palett, egna mått).
import React, { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  TYP, TNUM, AVSTAND, RADIE, FARG, FONT, KNAPP, INAKTIV, KORT, TRAFFYTA, RORELSE, LAYOUT,
} from "@/lib/design/tokens";
import Ikon from "@/components/design/Ikon";

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
export function Stod({ children, farg = FARG.text2, style, attr }: { children: ReactNode; farg?: string; style?: CSSProperties; attr?: Record<string, string> }) {
  return <p {...attr} style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: farg, ...style }}>{children}</p>;
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

/** Material Symbols-ikon: EN komponent i components/design (admin importerar den härifrån som förut). */
export { Ikon };

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

export function Falt({ label, value, onChange, placeholder, type = "text", hint, min, max, step, disabled, id, maxLength }: {
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
  maxLength?: number;
}) {
  const nyckel = id || `falt-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <label htmlFor={nyckel} style={{ display: "block", ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{label}</label>
      <input id={nyckel} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        min={min} max={max} step={step} maxLength={maxLength} disabled={disabled} style={{ ...faltStil, ...(disabled ? { opacity: 0.4 } : null) }} />
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

/** Arkets höjd är FAST, inte innehållets: på telefon nästan hela fönstret under toppfältet, på dator högst 85 %. dvh följer adressfältet; vh är reserv. */
const ARK_UTRYMME = `${LAYOUT.topbar} - ${2 * AVSTAND.l}px`;
const arkCss = `
  .ark-dialog { height: calc(100vh - ${ARK_UTRYMME}); height: calc(100dvh - ${ARK_UTRYMME}); }
  @media (min-width: 760px) { .ark-dialog { height: min(85vh, calc(100vh - ${ARK_UTRYMME})); height: min(85dvh, calc(100dvh - ${ARK_UTRYMME})); } }
`;

/**
 * Ark ovanpå sidan för ETT formulär (Ny period, Ändra period). Mörk bakgrund, tryck utanför stänger.
 * Aldrig ark ovanpå ark: bekräftelser byter innehåll i samma ark. `attr` bär data-attribut (testfästen).
 *
 * Ritas i en PORTAL på document.body och låser sidans scroll medan det är öppet. Annars hamnar det högst upp på sidan:
 * `.tona-in` har en transform-animation, och en transform gör sin förälder till containing block för `position: fixed`,
 * så ett ark inne i sidan placeras mot sidans topp i stället för mot fönstret (man måste scrolla upp för att se det).
 */
export function Sheet({ titel, vanster, hoger, onStang, children, attr, overlayAttr, vyNyckel }: { titel: ReactNode; /** Byter innehåll i arket (formulär → förarlista): ett dubbelklick får inte nå det nya innehållet. */ vyNyckel?: string; /** Uppe till vänster i navigationsraden (iOS: Avbryt eller ‹ tillbaka). */ vanster?: ReactNode; /** Uppe till höger (iOS: Lägg till / Spara). */ hoger?: ReactNode; onStang: () => void; children: ReactNode; attr?: Record<string, string>; overlayAttr?: Record<string, string> }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bytte = useRef(0);
  useLayoutEffect(() => { bytte.current = Date.now(); }, [vyNyckel]);

  // Medan arket är öppet finns resten av sidan (sidomenyn, bottenmenyn, innehållet) inte: inert tar bort den ur tab-ordningen,
  // ur tillgänglighetsträdet och från tryck. Fokus flyttas in i dialogen och tillbaka till knappen som öppnade den när arket stängs.
  useEffect(() => {
    const overlay = overlayRef.current;
    const tidigareFokus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dolda: { el: Element; inert: string | null; ariaHidden: string | null }[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === overlay || el.hasAttribute("data-ark-overlay")) continue;
      dolda.push({ el, inert: el.getAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden") });
      el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true");
    }
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      for (const d of dolda) {
        if (d.inert == null) d.el.removeAttribute("inert"); else d.el.setAttribute("inert", d.inert);
        if (d.ariaHidden == null) d.el.removeAttribute("aria-hidden"); else d.el.setAttribute("aria-hidden", d.ariaHidden);
      }
      if (tidigareFokus && document.contains(tidigareFokus)) tidigareFokus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const kropp = document.body;
    const fore = { overflow: kropp.style.overflow, paddingRight: kropp.style.paddingRight };
    // Skrollisten försvinner när sidan låses: fyll ut den så innehållet bakom inte hoppar i sidled.
    const list = window.innerWidth - document.documentElement.clientWidth;
    kropp.style.overflow = "hidden";
    if (list > 0) kropp.style.paddingRight = `${list}px`;
    return () => { kropp.style.overflow = fore.overflow; kropp.style.paddingRight = fore.paddingRight; };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={overlayRef} data-ark-overlay="" onClick={onStang} className="tona-opacity" {...overlayAttr}
      // Andra trycket i ett dubbelklick (detail > 1) strax efter att arket öppnats eller bytt innehåll sväljs, OAVSETT var det landar. Arket byter
      // höjd när innehållet byts (förarlistan är lägre än formuläret) och centreras om, så andra trycket hamnar på det nya innehållet
      // (Förare → en förare vald; ‹ Ny period → Avbryt) eller UTANFÖR dialogen, på bakgrunden, som stänger arket. Mätt i Chrome: 13 ms mellan trycken.
      onClickCapture={e => { if (e.detail > 1 && Date.now() - bytte.current < 700) { e.stopPropagation(); e.preventDefault(); } }}
      // Arket sitter FAST: förankrat uppifrån, under toppfältet, med fast höjd (se .ark-dialog). Det centreras aldrig och byter aldrig höjd efter
      // innehållet, så toppen står på exakt samma plats i formuläret, med kalendern utfälld, vid Längd 20 v och i förarlistan. Innehållet rullar inuti.
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: `calc(${LAYOUT.topbar} + ${AVSTAND.l}px) ${AVSTAND.l}px ${AVSTAND.l}px`, overscrollBehavior: "contain" }}>
      <style>{arkCss}</style>
      <div ref={dialogRef} tabIndex={-1} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="sheet-upp ark-dialog" {...attr}
        style={{ outline: "none", background: FARG.kort, color: FARG.text, fontFamily: FONT, borderRadius: RADIE.sheet, padding: AVSTAND.xl, width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box", colorScheme: "dark" }}>
        <div data-ark-rubrik style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: AVSTAND.s, margin: `0 0 ${AVSTAND.l}px`, flexShrink: 0 }}>
          <div style={{ justifySelf: "start" }}>{vanster}</div>
          <p style={{ margin: 0, ...TYP.listtitel, color: FARG.text, textAlign: "center" }}>{titel}</p>
          <div style={{ justifySelf: "end" }}>{hoger}</div>
        </div>
        <div data-ark-innehall style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}>{children}</div>
      </div>
    </div>,
    document.body,
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
