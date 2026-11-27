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

/** Talkolumner: monospace + tabulära siffror, så kolumner står rakt och
 *  siffror inte hoppar i sidled mellan rader. Systemstack — ingen ny
 *  webbfont. Används där tal staplas under varandra, inte i löptext. */
export const TAL_FONT: CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  fontVariantNumeric: "tabular-nums",
};

/** Tre vikter. 500 finns inte. */
export const VIKT = { normal: 400, halvfet: 600, fet: 700 } as const;

/**
 * Sju typsteg (`kommentar` 19 är tillagt för kartkortets kommentarer). `tal` är skärmens huvudsiffra (skillen: "ett tal per vy"),
 * `titel` är vyns rubrik eller tillstånd, `rubrik` sektioner, `text` brödtext
 * och listrader (`listtitel` för radens namn), `meta` sekundär rad, `micro`
 * versala sektionsetiketter.
 */
export const TYP = {
  tal:       { fontSize: 32, fontWeight: VIKT.fet,     letterSpacing: "-0.8px", lineHeight: 1,    ...TNUM },
  titel:     { fontSize: 30, fontWeight: VIKT.fet,     letterSpacing: "-0.8px", lineHeight: 1.05 },
  rubrik:    { fontSize: 20, fontWeight: VIKT.fet,     letterSpacing: "-0.3px", lineHeight: 1.2 },
  text:      { fontSize: 17, fontWeight: VIKT.normal,  letterSpacing: "-0.2px", lineHeight: 1.3 },
  /** Instruktioner som föraren ska läsa med blicken tillbaka i arbetet (kommentarer på kartkortet): ett steg över `text`. */
  kommentar: { fontSize: 19, fontWeight: VIKT.normal,  letterSpacing: "-0.2px", lineHeight: 1.3 },
  listtitel: { fontSize: 17, fontWeight: VIKT.halvfet, letterSpacing: "-0.2px", lineHeight: 1.3 },
  meta:      { fontSize: 13, fontWeight: VIKT.normal,  lineHeight: 1.3 },
  micro:     { fontSize: 11, fontWeight: VIKT.halvfet, letterSpacing: "0.06em", textTransform: "uppercase" as const, lineHeight: 1.2 },
} satisfies Record<string, CSSProperties>;

/** Tillåtna textstorlekar — används av design-lint. */
export const TYP_STORLEKAR = [32, 30, 20, 19, 17, 13, 11] as const;

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

// ---------------------------------------------------------------------------
// Layoutmått — INTE avstånd
// ---------------------------------------------------------------------------
// Ett LAYOUTMÅTT säger var ett fast element slutar: toppfältets höjd, bottenradens
// höjd, iPhones systemfält. Ett AVSTÅND (AVSTAND ovan) säger hur mycket luft det
// är mellan två saker. Det är olika sorters tal och de får aldrig bytas mot
// varandra. PR #540 (2026-09-12) bytte Min tids uppmätta rubrikhöjd 126 mot
// AVSTAND.xxl = 32 — "ett tal ur skalan" — och 92 px innehåll hamnade under
// flikraden, på dator och telefon. Samma byte i Lön (96 och 80 → 32).
//
// Reglerna (skillen, "Layoutmått är inte avstånd"):
//  1. Toppfältets och bottenradens mått finns BARA här, med safe-area inräknad.
//  2. En rubrik inne i en vy är `position: sticky` i flödet. Den reserverar sin
//     egen höjd, så det finns inget mått att räkna fel. Aldrig `fixed` + uppmätt
//     paddingTop. (Kalendern har alltid gjort så och har aldrig haft felet.)
//  3. En helskärmspanel under toppfältet sitter på underTopbar(), aldrig top: 56.
//     På iPhone är toppfältet 56 + 47–59 px (notch/Dynamic Island); paneler på 56
//     började under det i fem månader (maj–sep 2026) utan att någon märkte det
//     på datorn, där safe-area är 0.
//  4. En fast bottenrad eller ett sheet har safe-area i sin nedre padding
//     (medSafeBotten), annars ritas den in i hemindikatorn.
// design-lint larmar på nakna `top:` med tal och på `fixed` med `top`.

/** Appens globala TopBar (components/TopBar.tsx) är 56 px + iPhones systemfält. */
const TOPBAR_PX = 56;

export const LAYOUT = {
  /** Toppfältets höjd inkl. safe-area — var innehållet under det börjar. */
  topbar: `calc(${TOPBAR_PX}px + env(safe-area-inset-top))`,
  /** Bara systemfältet överst (TopBar lägger det som egen padding). */
  safeTopp: "env(safe-area-inset-top)",
  /** Bara hemindikatorns zon nederst. */
  safeBotten: "env(safe-area-inset-bottom)",
} as const;

/** `top` för något som ska börja under toppfältet, + `extraPx` för en egen fast
 *  rad i panelen (t.ex. maskinvyns flikrad på 52 px → underTopbar(52)). */
export function underTopbar(extraPx = 0): string {
  return extraPx ? `calc(${TOPBAR_PX}px + env(safe-area-inset-top) + ${extraPx}px)` : LAYOUT.topbar;
}

/** Nedre padding för en fast bottenrad/sheet: minst `px`, och aldrig in i
 *  hemindikatorn (8 px luft ovanför den). Dator: `px`. iPhone: 8 + 34. */
export function medSafeBotten(px: number): string {
  return `max(${px}px, calc(8px + env(safe-area-inset-bottom)))`;
}

/**
 * KOLUMNEN — EN regel för bredd (beslut 2026-10-13, ledighet först).
 *
 * Arbetsrapport har fyra bredder i samma app (Dag/Kalender/Min tid full bredd, Lön 448,
 * Lön-detaljer 640, ark 500/520/560) och är därför INTE förebild för bredd, bara för färg
 * och typografi. Regeln:
 *  - allt i vyn (flikrad, kort, listor) bor i EN centrerad kolumn — aldrig kant till kant;
 *  - `smal` för listor, kort och formulär, `bred` för rutnät och tidslinjer;
 *  - under `telefonMax` px händer ingenting: full bredd, sidmarginal 16, som förut;
 *  - ark är `ark` px breda, förankrade nederst och centrerade.
 * Ett layoutmått, inte ett avstånd (se LAYOUT ovan): det byts aldrig mot AVSTAND.
 */
export const KOLUMN = {
  smal: 640,
  bred: 1120,
  ark: 520,
  /** Fönsterbredd under vilken kolumnreglerna inte gäller (telefon). */
  telefonMax: 670,
} as const;

/**
 * Kolumnen för en vy vars ROT själv bär bakgrunden och sidmarginalen (Arbetsrapport: varje steg har sin egen
 * rot med `padding`/`main`-padding på 16). Roten får `maxWidth` = kolumn + de två sidmarginalerna, så innehållet
 * blir exakt `KOLUMN[bredd]` brett över `telefonMax` och fönsterbredden minus marginalerna under — telefonen är
 * oförändrad. Bakgrunden utanför kolumnen ritas av `KOLUMN_CSS` (svart body medan vyn är monterad).
 * Vyer som har en full bredd rot med `VyKolumn` inuti (ledighet) använder komponenten i stället.
 */
export function kolumnRot(bredd: "smal" | "bred" = "smal"): CSSProperties {
  return {
    width: "100%",
    maxWidth: KOLUMN[bredd] + 2 * AVSTAND.sidmarginal,
    marginLeft: "auto",
    marginRight: "auto",
    boxSizing: "border-box",
  };
}

/** Rotens minsta höjd: skärmen minus det som layouten redan reserverat för toppfältet (`paddingTop: LAYOUT.topbar`
 *  i app/layout.tsx). Med `100vh` rakt av blev varje vy 56 px högre än skärmen och scrollade utan anledning. */
export const ROT_MIN_HOJD = `calc(100vh - ${LAYOUT.topbar})`;

/** Radie: rad och fält 10, knapp och kort 12, sheet 16. Cirklar 50 %. */
export const RADIE = {
  rad: 10, knapp: 12, kort: 12, sheet: 16, cirkel: "50%",
  /** Stapeltopp i diagram — smala staplar (20–28 px) blir piller med 10. */
  stapel: 4,
} as const;

/** Träffyta. Skillen: minst 44 pt, maskinen skakar. Primärknappen 48. */
export const TRAFFYTA = { min: 44, primar: 48 } as const;

/**
 * Ekonomisektionens fasta bottenrad (`app/ekonomi/EkonomiBottomNav.tsx`): 12 px över,
 * 48 px knappar, `medSafeBotten(24)` under. Ett LAYOUTMÅTT — se LAYOUT ovan: det bor
 * här med safe-area inräknad, aldrig som ett tal i en vy. Faktureringsvyns sidokolumn
 * drar av det från sin höjd, annars hamnar listans sista rader under flikraden.
 */
export const EKONOMI_BOTTENRAD = `calc(${AVSTAND.m + TRAFFYTA.primar}px + ${medSafeBotten(AVSTAND.xl)})`;

/** Ikonstorlek (Material Symbols): i löptext 18, i en rad 22, helskärmsbekräftelse 96. */
export const IKON = { text: 18, rad: 22, stor: 96 } as const;

// ---------------------------------------------------------------------------
// Färg — ett tema
// ---------------------------------------------------------------------------

export const FARG = {
  bg:       "#000000",
  kort:     "#1c1c1e",
  upphojt:  "#2c2c2e",
  linje:    "rgba(255,255,255,0.08)",
  fyllning: "rgba(255,255,255,0.10)", // sekundär knapp
  tonad:    "rgba(255,255,255,0.04)", // svag yta bakom en kolumn/zon (kalenderns helg)
  text:     "#ffffff",
  text2:    "#8e8e93",
  text3:    "#636366",
  /** Bara "navigerar eller avbryter": Avbryt, Klar, Se alla, tillbaka-pil. */
  bla:      "#0a84ff",
  gron:     "#30d158",
  orange:   "#ff9f0a",
  /** Ett steg allvarligare än orange, för kategorier som måste kunna skiljas från orange bredvid (Avbrott: Störning → Reparation). */
  orangeMork: "#cc6600",
  rod:      "#ff453a",
  /** Kalenderns markeringar (synk-avvikelse, rättad dag) och VIKTIGT-raden i en kommentar (⚠ gul, en nivå under fara/rött: "var uppmärksam", inte "stanna"; Martin 2026-11-23). Aldrig en fjärde larmfärg. */
  gul:      "#ffd60a",
  /** Två extra diagram-/palettfärger (t.ex. staplar i arbetsrapporten). INTE rollfärger —
   *  skördare/skotare färgas av rollFarg() (lila/turkos), se skogsystem-design-skillen. */
  diagram1: "#a8d582",
  diagram2: "#f0b24c",
} as const;

// ---------------------------------------------------------------------------
// Glas — de flytande kartkontrollerna (pillen, hem, ⓘ, Centrera, +, nedre listerna).
// ---------------------------------------------------------------------------

/**
 * Glas: FROSTAT som iOS — kartan skimrar igenom, suddad och färgmättad, bakom en lätt mörk hinna (Martin 2026-11-27, efter att #1285:s tätare
 * variant inte syntes mot flygfoto: de hade redan blur och 0,72 → 0,78 ändrade inget man ser). Alla flytande KONTROLLER på kartan tar stilen
 * ur klassen `.glas` (GLAS_CSS) — aldrig egna `backdropFilter`/`rgba` i en vy.
 * `fast` är den solida varianten med SAMMA form, kant och skugga: används där suddig bakgrund inte stöds, när datorn är svag, vid
 * "minska genomskinlighet" och i maskinläget (lib/glasLage). Larm-, besöks- och varningskort är INTE glas (de bär färgad kant och ska vara täckta).
 * Tätheten (`fyll`) är det man skruvar på om kontrasten inte räcker (sekundärtext ≥ 4,5 mot flygfoto, hygge, åker och ljus karta, mätt utan textskuggan).
 */
export const GLAS = {
  /** Glasets fyllning. Önskat 0,42 (kartan skimrar), men sekundärtexten (vitt 75 %) når då bara 2,0–5,1 mot flygfoto/hygge/åker/ljus karta. Trappat 0,42 → 0,48 → 0,55 → 0,62 → 0,70 → 0,75 → 0,76: först 0,76 ger ≥ 4,5 överallt (min 4,66, ljus karta). */
  fyll: "rgba(40,40,44,0.76)",
  /** Ikonvariant: RENA ikonknappar (runda, utan text: hem, ⓘ, Centrera, +) tar klassen `glas-ikon` och får klarare glas — en vit ikon behöver bara 3:1, inte textens 4,5:1. Önskat 0,42 gav ikonen 2,7–2,8 mot ljus karta/hygge; 0,48 ger 3,18/3,23 (första steget ≥ 3). */
  fyllIkon: "rgba(40,40,44,0.48)",
  /** Solid variant: samma mörka ton, ingen genomskinlighet. */
  fast: FARG.kort,
  /** Tunn ljus kant (0,5 px, 18 % vitt). */
  kantBredd: "0.5px",
  kant: "rgba(255,255,255,0.18)",
  /** Ljus högdager i överkanten (iOS-glasets lyft) + mjuk skugga under. */
  hogdager: "inset 0 0.5px 0 rgba(255,255,255,0.35)",
  skugga: "0 4px 20px rgba(0,0,0,0.35)",
  /** Det som suddar kartan bakom. Saturate ger färgglöden som gör glaset levande. */
  sudd: "blur(28px) saturate(180%)",
  /** Svag skugga under text i glaset så den släpper från en ljus bakgrund. */
  textSkugga: "0 1px 2px rgba(0,0,0,0.35)",
  /** Sekundärtext i glaset: vitt, inte grått (grått tappar mot en genomskinlig yta). */
  text2: "rgba(255,255,255,0.75)",
} as const;

/** Inline-färgerna som räknas som sekundärtext i glas (FARG.text2 och det vita 65 %-värdet), i båda skrivsätten (serverns hex, webbläsarens rgb). */
const GLAS_SEKUNDAR = [
  '[style*="#8e8e93"]', '[style*="rgb(142, 142, 147)"]',
  '[style*="rgba(255,255,255,0.65)"]', '[style*="rgba(255, 255, 255, 0.65)"]',
].map((x) => `.glas ${x}`).join(', ');

/**
 * Klassen `.glas` — fast bakgrund som standard, glas där webbläsaren kan sudda. Läget styrs av `body[data-glas="solid"]` (lib/glasLage:
 * maskinläge, svag dator) och av "minska genomskinlighet". Ingen vy skriver bakgrund, kant, skugga eller blur själv på ett element med klassen.
 * Textskuggan och sekundärfärgen gäller också i den solida varianten (samma läsning oavsett läge).
 */
export const GLAS_CSS = `
  .glas {
    background: ${GLAS.fast};
    border: ${GLAS.kantBredd} solid ${GLAS.kant};
    box-shadow: ${GLAS.hogdager}, ${GLAS.skugga};
    text-shadow: ${GLAS.textSkugga};
  }
  ${GLAS_SEKUNDAR} {
    color: ${GLAS.text2} !important;
  }
  @supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
    body:not([data-glas="solid"]) .glas {
      background: ${GLAS.fyll};
      -webkit-backdrop-filter: ${GLAS.sudd};
      backdrop-filter: ${GLAS.sudd};
    }
    body:not([data-glas="solid"]) .glas.glas-ikon {
      background: ${GLAS.fyllIkon};
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    body .glas {
      background: ${GLAS.fast} !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
  }
`;


/** SORTIMENT — hur virket är fördelat (timmer, kubb, massaved, övrigt). En ljushetsskala:
 *  MÖRKAST = MEST VÄRT. Egen axel, skild från status (grönt/orange/rött säger om något är bra eller
 *  dåligt) och från rollfärgerna (skördare/skotare). Mörkgrön betyder alltså "mest värt", aldrig "ok".
 *  Ljushetsstegen är medvetet stora: färgen får aldrig vara ensam bärare — raden bredvid har alltid
 *  ordet och talet. Se skogsystem-design-skillen, "Sortimentfärger". */
export const SORTIMENTFARG = {
  timmer: "#2f4b14",
  kubb:   "#6e8f4a",
  massa:  "#b4c4a0",
  ovrigt: "#e3e8dc",
} as const;

/**
 * Färgstapeln över en dag i Planera: EN färg per del, i ordning; rast = FARG.text3 (grå). Medvetet inte röd/orange/gul
 * (larm och kalendermarkeringar) och inte blå (bara navigation). Färgen bär aldrig ensam — varje del har också text.
 */
export const DELFARG = ["#64d2ff", "#bf5af2", "#30d158", "#f0b24c", "#5e5ce6", "#ac8e68"] as const;

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
  @keyframes sheetUpp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  .tona-in      { animation: tonaIn ${RORELSE.byte}ms ${RORELSE.kurva} both; }
  .tona-opacity { animation: tonaOpacity ${RORELSE.byte}ms ${RORELSE.kurva} both; }
  .sheet-upp    { animation: sheetUpp ${RORELSE.sheet}ms ${RORELSE.kurva} both; }
  .puls    { animation: puls 2s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .tona-in  { animation-name: tonaOpacity; }
    .sheet-upp { animation-name: tonaOpacity; }
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
  /** Liten blå text, 44 px träffyta, ingen ram. Undantagen ("Hoppa över", "Ändra", "Försök igen").
   *  Blå som allt annat man kan trycka på (Apples regel: grå text går aldrig att trycka på, Martin 2026-11-25). */
  tertiar: {
    ...knappBas,
    display: "inline-flex",
    minHeight: TRAFFYTA.min,
    padding: 0,
    background: "none",
    color: FARG.bla,
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

/** Svart bakgrund utanför kolumnen medan en vy med `kolumnRot` är monterad (sidans body är inte svart). */
export const KOLUMN_CSS = `body{background:${FARG.bg}}`;
