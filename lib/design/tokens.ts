// Skogsystems designvärden — EN källa. Vyer importerar härifrån och
// skriver inga egna literaler för storlek, avstånd, radie, färg eller tid.
//
// Bakgrund (utredning 2026-09-08): appen hade 33 textstorlekar, 7 vikter,
// 14 typsnittsstackar, 109 padding-kombinationer, 28 radier, 234 färger och
// fadeUp definierad sex gånger med olika värden. Premiumkänslan kommer inte
// från vad som visas utan från att allt sitter på samma linjer och beter sig
// likadant. Det här är linjerna.
//
// Regler (se .claude/skills/skogsystem-design/SKILL.md, "Värden"):
// - Sex typsteg, tre vikter, en typsnittsstack.
// - Avstånd ur skalan 4/8/12/16/24/32. Inget annat.
// - Fem hierarkinivåer, högst EN primär per skärm.
// - Blått betyder bara "navigerar eller avbryter". Aldrig fyllning, aldrig status.
// - Tre rörelsetider, en kurva. Tillstånd tonar, hoppar aldrig.
// - Ett tema (mörkt).
//
// scripts/design-lint.mjs räknar literaler utanför de här värdena i ändrade
// filer och varnar i PR:en.

import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Typsnitt
// ---------------------------------------------------------------------------

/** Den enda stacken. Sätts på vyns rot; allt under ärver (`fontFamily: "inherit"`). */
export const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Inter, system-ui, sans-serif";

/** Fasta siffrbredder — siffror som ändras får aldrig flytta text runt sig. */
export const TNUM: CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Tre vikter. 500 finns inte. */
export const VIKT = { normal: 400, halvfet: 600, fet: 700 } as const;

/**
 * Sex typsteg. `tal` är skärmens huvudsiffra (skillen: "ett tal per vy"),
 * `titel` är vyns rubrik eller tillstånd, `rubrik` sektioner, `text` brödtext
 * och listrader (`listtitel` för radens namn), `meta` sekundär rad, `micro`
 * versala sektionsetiketter.
 */
export const TYP = {
  tal:       { fontSize: 32, fontWeight: VIKT.fet,     letterSpacing: "-0.8px", lineHeight: 1,    ...TNUM },
  titel:     { fontSize: 30, fontWeight: VIKT.fet,     letterSpacing: "-0.8px", lineHeight: 1.05 },
  rubrik:    { fontSize: 20, fontWeight: VIKT.fet,     letterSpacing: "-0.3px", lineHeight: 1.2 },
  text:      { fontSize: 17, fontWeight: VIKT.normal,  letterSpacing: "-0.2px", lineHeight: 1.3 },
  listtitel: { fontSize: 17, fontWeight: VIKT.halvfet, letterSpacing: "-0.2px", lineHeight: 1.3 },
  meta:      { fontSize: 13, fontWeight: VIKT.normal,  lineHeight: 1.3 },
  micro:     { fontSize: 11, fontWeight: VIKT.halvfet, letterSpacing: "0.06em", textTransform: "uppercase" as const, lineHeight: 1.2 },
} satisfies Record<string, CSSProperties>;

/** Tillåtna textstorlekar — används av design-lint. */
export const TYP_STORLEKAR = [32, 30, 20, 17, 13, 11] as const;

// ---------------------------------------------------------------------------
// Avstånd och form
// ---------------------------------------------------------------------------

/** Skalan. Sidmarginal 16, sektion 24, mellan rader 12, inuti rad 8. */
export const AVSTAND = {
  xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32,
  sidmarginal: 16,
  sektion: 24,
  rad: 12,
  inuti: 8,
} as const;

export const AVSTAND_SKALA = [0, 4, 8, 12, 16, 24, 32] as const;

/** Radie: rad och fält 10, knapp och kort 12, sheet 16. Cirklar 50 %. */
export const RADIE = { rad: 10, knapp: 12, kort: 12, sheet: 16, cirkel: "50%" } as const;

/** Träffyta. Skillen: minst 44 pt, maskinen skakar. Primärknappen 48. */
export const TRAFFYTA = { min: 44, primar: 48 } as const;

// ---------------------------------------------------------------------------
// Färg — ett tema
// ---------------------------------------------------------------------------

export const FARG = {
  bg:       "#000000",
  kort:     "#1c1c1e",
  upphojt:  "#2c2c2e",
  linje:    "rgba(255,255,255,0.08)",
  fyllning: "rgba(255,255,255,0.10)", // sekundär knapp
  text:     "#ffffff",
  text2:    "#8e8e93",
  text3:    "#636366",
  /** Bara "navigerar eller avbryter": Avbryt, Klar, Se alla, tillbaka-pil. */
  bla:      "#0a84ff",
  gron:     "#30d158",
  orange:   "#ff9f0a",
  rod:      "#ff453a",
  /** Maskinfärger ur Uppföljning v6. */
  skordare: "#a8d582",
  skotare:  "#f0b24c",
} as const;

// ---------------------------------------------------------------------------
// Rörelse — tre tider, en kurva
// ---------------------------------------------------------------------------

export const RORELSE = {
  /** Tryckfeedback: opacity/scale på en knapp. */
  tryck: 150,
  /** Tillståndsbyte: nytt innehåll tonar in (opacity + 8 px). */
  byte: 250,
  /** Sheet upp och ner. */
  sheet: 350,
  /** Ett tal som ändras räknar upp. */
  tal: 400,
  kurva: "cubic-bezier(0.2, 0, 0, 1)",
  /** Hur långt ett tillstånd rör sig när det tonar in. */
  lyft: 8,
} as const;

/** `transition: overgang("opacity", "transform")` — alltid samma tid och kurva. */
export function overgang(...egenskaper: string[]): string {
  const tid = RORELSE.byte;
  return (egenskaper.length ? egenskaper : ["all"])
    .map((e) => `${e} ${tid}ms ${RORELSE.kurva}`)
    .join(", ");
}

/**
 * Global CSS för rörelse. Renderas EN gång per vy-rot (`<style>{designCss}</style>`)
 * i stället för att varje fil definierar egna @keyframes.
 *
 * - `.tona-in`: tillstånd som tonar in på plats (opacity + lyft).
 * - `.puls`: bara för "pågår just nu".
 * - Reduced motion: allt utom opacity stängs av.
 */
export const designCss = `
  @keyframes tonaIn {
    from { opacity: 0; transform: translateY(${RORELSE.lyft}px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes tonaOpacity {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes puls {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }
  .tona-in { animation: tonaIn ${RORELSE.byte}ms ${RORELSE.kurva} both; }
  .puls    { animation: puls 2s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .tona-in { animation-name: tonaOpacity; }
    .puls    { animation: none; }
    * { transition-property: opacity !important; }
  }
`;

// ---------------------------------------------------------------------------
// Hierarki — fem nivåer, högst en primär per skärm
// ---------------------------------------------------------------------------

const knappBas: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: AVSTAND.s,
  border: "none",
  borderRadius: RADIE.knapp,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: `opacity ${RORELSE.tryck}ms ${RORELSE.kurva}, transform ${RORELSE.tryck}ms ${RORELSE.kurva}`,
  WebkitTapHighlightColor: "transparent",
};

export const KNAPP = {
  /** Skärmens EN handling: fylld vit på svart, full bredd, 48 px. */
  primar: {
    ...knappBas,
    width: "100%",
    minHeight: TRAFFYTA.primar,
    padding: `0 ${AVSTAND.l}px`,
    background: FARG.text,
    color: FARG.bg,
    ...TYP.listtitel,
  },
  /** Fylld white/0.10, 44 px. */
  sekundar: {
    ...knappBas,
    width: "100%",
    minHeight: TRAFFYTA.min,
    padding: `0 ${AVSTAND.l}px`,
    background: FARG.fyllning,
    color: FARG.text,
    ...TYP.listtitel,
  },
  /** Grå text, 44 px träffyta, ingen ram. Undantagen. */
  tertiar: {
    ...knappBas,
    display: "inline-flex",
    minHeight: TRAFFYTA.min,
    padding: 0,
    background: "none",
    color: FARG.text2,
    ...TYP.meta,
  },
  /** Blå text. Bara "navigerar eller avbryter". */
  lank: {
    ...knappBas,
    display: "inline-flex",
    minHeight: TRAFFYTA.min,
    padding: 0,
    background: "none",
    color: FARG.bla,
    ...TYP.text,
  },
  /** Röd text. Kräver alltid bekräftelse. */
  destruktiv: {
    ...knappBas,
    display: "inline-flex",
    minHeight: TRAFFYTA.min,
    padding: 0,
    background: "none",
    color: FARG.rod,
    ...TYP.text,
  },
} satisfies Record<string, CSSProperties>;

/** Inaktiv knapp: samma form, halva synligheten. Inga egna grå varianter. */
export const INAKTIV: CSSProperties = { opacity: 0.4, cursor: "default", pointerEvents: "none" };

// ---------------------------------------------------------------------------
// Ytor
// ---------------------------------------------------------------------------

/** Kort: bakgrund, radie, inre avstånd. Ingen ram — linjer bara mellan rader. */
export const KORT: CSSProperties = {
  background: FARG.kort,
  borderRadius: RADIE.kort,
  padding: `${AVSTAND.l}px`,
};

/** En rad i en lista/grupp: 44 px, linje under. */
export const RAD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: AVSTAND.inuti,
  minHeight: TRAFFYTA.min,
  padding: `${AVSTAND.m}px 0`,
  borderBottom: `1px solid ${FARG.linje}`,
};

/** Vyns rot: svart, en typsnittsstack, sidmarginal. */
export const VY_ROT: CSSProperties = {
  minHeight: "100vh",
  background: FARG.bg,
  color: FARG.text,
  fontFamily: FONT,
  padding: `0 ${AVSTAND.sidmarginal}px`,
  boxSizing: "border-box",
};
