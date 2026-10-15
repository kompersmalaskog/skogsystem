// Mutationskontroll för Arbetsrapport i Kolumnen (granskning 2026-10-14): varje spärr i
// components/arbetsrapport/Arbetsrapport.kolumn.render.test.tsx ska bli röd när EN sak i källan ändras tillbaka.
// Motorn: scripts/mutationsmotor.mjs (ändrar EN sak i taget, kör testerna, kräver rött; återställer filerna).
//
// Kör:  node scripts/mutationskontroll-arbetsrapport-kolumn.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const AR = "components/arbetsrapport/Arbetsrapport.tsx";
const TOK = "lib/design/tokens.ts";
const TEST = "components/arbetsrapport/Arbetsrapport.kolumn.render.test.tsx";

const M = [
  // ── tokens ──
  ["tokens: kolumnen saknar sidmarginalerna (640 i stället för 672)", "maxWidth: KOLUMN[bredd] + 2 * AVSTAND.sidmarginal,", "maxWidth: KOLUMN[bredd],", TOK],
  ["tokens: rotens höjd är 100vh rakt av", "export const ROT_MIN_HOJD = `calc(100vh - ${LAYOUT.topbar})`;", "export const ROT_MIN_HOJD = `100vh`;", TOK],
  ["tokens: kolumnen är inte centrerad", "    marginLeft: \"auto\",\n    marginRight: \"auto\",\n    boxSizing: \"border-box\",\n  };\n}\n\n/** Rotens minsta höjd", "    boxSizing: \"border-box\",\n  };\n}\n\n/** Rotens minsta höjd", TOK],
  ["tokens: svart body är inte svart", "export const KOLUMN_CSS = `body{background:${FARG.bg}}`;", "export const KOLUMN_CSS = `body{background:#111}`;", TOK],

  // ── rötter ──
  ["shell (Inställningar, Mitt avtal, Redigera …) är inte kolumnen", "const shell: CSSProperties  = { minHeight:ROT_MIN_HOJD,...kolumnRot(), background:", "const shell: CSSProperties  = { minHeight:ROT_MIN_HOJD, background:", AR],
  ["Dag-roten är full bredd", "minHeight:ROT_MIN_HOJD,...kolumnRot(), background:FARG.bg, color:FARG.text, fontFamily:FONT, WebkitFontSmoothing:\"antialiased\", display:\"flex\", flexDirection:\"column\" }}>\n      <style>{css}{designCss}</style>{timerBanner}\n\n      {/* Ingen egen rubrikrad", "minHeight:ROT_MIN_HOJD, background:FARG.bg, color:FARG.text, fontFamily:FONT, WebkitFontSmoothing:\"antialiased\", display:\"flex\", flexDirection:\"column\" }}>\n      <style>{css}{designCss}</style>{timerBanner}\n\n      {/* Ingen egen rubrikrad", AR],
  ["Min tid-roten är full bredd", "minHeight:ROT_MIN_HOJD,...kolumnRot(),background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:\"antialiased\",paddingBottom:AVSTAND.xxl }}>", "minHeight:ROT_MIN_HOJD,background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:\"antialiased\",paddingBottom:AVSTAND.xxl }}>", AR],
  ["Lön-översiktens rot är full bredd", "minHeight:ROT_MIN_HOJD,...kolumnRot(),background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:\"antialiased\",display:\"flex\",flexDirection:\"column\" }}>\n        {/* designCss", "minHeight:ROT_MIN_HOJD,background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:\"antialiased\",display:\"flex\",flexDirection:\"column\" }}>\n        {/* designCss", AR],
  ["Kalendern är smal (ska vara bred)", "...kolumnRot(\"bred\")", "...kolumnRot()", AR],
  ["en rot har 100vh igen (Lön-detaljer)", "minHeight:ROT_MIN_HOJD,...kolumnRot(),background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:\"antialiased\" }}>", "minHeight:\"100vh\",background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:\"antialiased\" }}>", AR],
  ["svart body-regeln är borta ur css-konstanten", "\n  ${KOLUMN_CSS}\n  .valj-rad", "\n  .valj-rad", AR],
  ["svart body-regeln är borta ur 'kontot inte kopplat'-vyn", "<style>{designCss}{KOLUMN_CSS}</style>", "<style>{designCss}</style>", AR],

  // ── bottennavet och ark ──
  ["bottennavet: flikarna går över hela bredden igen", "padding:`${AVSTAND.m}px max(${AVSTAND.l}px, calc((100% - ${KOLUMN.smal}px) / 2)) ${medSafeBotten(AVSTAND.xl)}`", "padding:`${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}`", AR],
  ["ett ark har en egen bredd igen (560)", "style={{ width:\"100%\", maxWidth:KOLUMN.ark, background:FARG.kort, borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding:`${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, maxHeight:\"85vh\"", "style={{ width:\"100%\", maxWidth:560, background:FARG.kort, borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding:`${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, maxHeight:\"85vh\"", AR],
  ["Lön-översikten har sin gamla innerbredd igen (448)", "padding:`${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.xxl}px` }}>\n\n          {/* TIDSSPECIFIKATION", "padding:`${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.xxl}px`,maxWidth:448,margin:\"0 auto\" }}>\n\n          {/* TIDSSPECIFIKATION", AR],

  // ── tryckytor ──
  ["Vila: segmenten är 33 px igen", "style={{ flex:1,minHeight:TRAFFYTA.min,padding:0,borderRadius:RADIE.rad,border:\"none\",...TYP.meta", "style={{ flex:1,padding:`${AVSTAND.s}px 0`,borderRadius:RADIE.rad,border:\"none\",...TYP.meta", AR],
  ["Vila: månadspilen bakåt är 30 px igen", "onClick={()=>setVilaMånad(m=>(m-1+12)%12)} style={{ background:\"none\",border:\"none\",cursor:\"pointer\",padding:0,width:TRAFFYTA.min,height:TRAFFYTA.min,display:\"flex\",alignItems:\"center\",justifyContent:\"center\" }}>", "onClick={()=>setVilaMånad(m=>(m-1+12)%12)} style={{ background:\"none\",border:\"none\",cursor:\"pointer\",padding:AVSTAND.xs }}>", AR],
  ["Vila: månadspilen framåt är 30 px igen", "onClick={()=>setVilaMånad(m=>(m+1)%12)} style={{ background:\"none\",border:\"none\",cursor:\"pointer\",padding:0,width:TRAFFYTA.min,height:TRAFFYTA.min,display:\"flex\",alignItems:\"center\",justifyContent:\"center\" }}>", "onClick={()=>setVilaMånad(m=>(m+1)%12)} style={{ background:\"none\",border:\"none\",cursor:\"pointer\",padding:AVSTAND.xs }}>", AR],
  ["Vila: 'Se alla nätter →' är 17 px igen", "fontFamily:\"inherit\",padding:0,minHeight:TRAFFYTA.min,display:\"inline-flex\",alignItems:\"center\" }}>Se alla nätter →</button>", "fontFamily:\"inherit\",padding:0 }}>Se alla nätter →</button>", AR],
  ["Redigera: 'Åkte hem …' ligger i löptext igen (22 px, centrerad)", "style={{ ...KNAPP.lank, ...TYP.meta, display:\"flex\", justifyContent:\"flex-start\", textAlign:\"left\", padding:0 }}>Åkte hem sjuk, VAB eller föräldraledig?</button>", "style={{ ...KNAPP.lank, display:\"inline-flex\", padding:0, minHeight:0, height:\"auto\" }}>Åkte hem sjuk, VAB eller föräldraledig?</button>", AR],
  ["Redigera: 'Byt mot ledig dag' har minHeight 0", "style={{ ...KNAPP.lank, ...TYP.meta, display:\"flex\", justifyContent:\"flex-start\", textAlign:\"left\", padding:0 }}>Byt mot ledig dag</button>", "style={{ ...KNAPP.lank, display:\"inline-flex\", padding:0, minHeight:0, height:\"auto\" }}>Byt mot ledig dag</button>", AR],
  ["Inställningars valrader: klassen valj-rad är borta (37 px igen)", "<button key={o.l} className=\"valj-rad\" onClick={()=>onPick(o.v)}", "<button key={o.l} onClick={()=>onPick(o.v)}", AR],
  ["Inställningars valrader: css-regeln är borta", "\n  .valj-rad { min-height: ${TRAFFYTA.min}px; }\n`;", "\n`;", AR],
  ["Objektväljaren: bara texten är träffyta (23 px)", "style={{ flex:1,minHeight:TRAFFYTA.min,background:\"none\",border:\"none\",outline:\"none\",color:FARG.text,...TYP.text", "style={{ flex:1,background:\"none\",border:\"none\",outline:\"none\",color:FARG.text,...TYP.text", AR],

  // ── decimalkomma ──
  ["ATK: '4.8 dagar' med punkt", "{svDecimal(atkTimmar)}h ({svDecimal(atkDagar!)} dagar)</span>", "{atkTimmar}h ({atkDagar} dagar)</span>", AR],
  ["Kort dygnsvila: '10.5h' med punkt", "text:`Kort dygnsvila: ${svDecimal(Math.round(vilaTim*10)/10)}h sedan igår`", "text:`Kort dygnsvila: ${Math.round(vilaTim*10)/10}h sedan igår`", AR],
].map(([namn, fran, till, fil]) => [namn, fran, till, fil]);

kor({
  filer: [AR, TOK],
  tester: [TEST],
  standardFil: AR,
  mutationer: M,
});
