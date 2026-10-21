// MÅLBILDERNA — EN fil för allt innehåll: bilden (SVG), 2–3 korta rader, felbilden "Inte så här" med text och "Alla regler"-sidorna.
// Ändras något efter mötet med Vida är det HÄR det ändras — ingen komponent, ingen test och inget kort har en egen kopia av en text eller en bild.
//
//   • Texten står under raden "INNEHÅLL" nedan, en post per sort. Bilderna (SVG) står först i filen under "BILDERNA", en konstant per bild.
//   • Skiljer sig något mellan skördare och skotare står det under `roll` (bild, rader och/eller felbild byts bara för den rollen).
//   • En sort med flera varianter (Kulturlämning: stenröse/tjärdal … och Kolbotten) har dem under `varianter`.
//   • `regler` = sidan "Alla regler ›" (Avlägg, Blött).
//   • Typer utan post här (Fara, Info …) får ingen målbild — kortet visar ingen sektion.
//   • Bilderna är rena vektorer (inga externa filer, inga typsnitt som laddas): de fungerar utan täckning och är skarpa på alla skärmar.
//
// Underlag: skissen "Skotarvyn – skiss", tavla 18–34 (Malbild*.dc.html), AvlaggRegler (21) och BlottRegler (25). Bilderna är skissens SVG, utskrivna statiska.
// Avläggets andra rad i skissen nämnde en bestämd väg ("väg 27, 70 km/h"); appen vet inte vid vilken väg ett avlägg ligger, så raden är allmän och hastigheterna står under Alla regler.

import type { FargGrupp } from './larm/grupper';

export type Maskinroll = 'skordare' | 'skotare';

/** Felbilden: bilden och EN mening om vad som gått fel. */
export interface Felbild { bild: string; text: string }

/** Det som visas i sektionen "Så ska det se ut". */
export interface MalbildInnehall {
  /** Den ritade bilden (SVG, 720 × 560). */
  bild: string;
  /** 2–3 korta rader. */
  rader: readonly string[];
  fel: Felbild;
}

export interface Regelrad { text: string; varde?: string }
export type RegelBlock =
  | { slag: 'grupp'; rubrik: string; rader: readonly Regelrad[] }
  | { slag: 'rutor'; rubrik: string; rutor: readonly { varde: string; text: string }[] }
  | { slag: 'varning'; rubrik: string; text: string };

/** Sidan "Alla regler ›": en bild överst och därefter block i ordning. */
export interface Regelsida {
  titel: string;
  underrubrik: string;
  bild: string;
  block: readonly RegelBlock[];
  /** Var reglerna kommer ifrån. */
  kalla: string;
}

export interface Malbild extends MalbildInnehall {
  nyckel: string;
  /** Namnet i listan "Alla målbilder" och på tillbaka-knappen. */
  namn: string;
  grupp: FargGrupp;
  /** Skiljer något per maskintyp: det som står här ersätter standarden för den rollen. */
  roll?: Partial<Record<Maskinroll, Partial<MalbildInnehall>>>;
  /** Namnet på standardutseendet när sorten har varianter ("Stenröse, tjärdal"). */
  standardNamn?: string;
  /** Andra utseenden av samma sort (väljs med en liten växel i sektionen). */
  varianter?: readonly { nyckel: string; namn: string; innehall: MalbildInnehall }[];
  regler?: Regelsida;
}

// =================================================================================================================================
// BILDERNA (SVG). Hitta bilden via namnet; texten som hör till står i INNEHÅLL längre ner.
// =================================================================================================================================

const BILD = {
  STENMUR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Stenmur sedd uppifrån: maskinen kör över vid planerad överfart, träden är fällda bort från muren och inget virke ligger på den"><rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#stenmur-mark)"/>
<defs><pattern id="stenmur-mark" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="stenmur-pil" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect x="338" y="0" width="64" height="560" fill="rgba(255, 255, 255, 0.1)"/>
<path d="M350 0V560 M390 0V560" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<ellipse cx="6" cy="256" rx="8.5" ry="7.7" fill="rgb(162, 162, 154)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="23" cy="258" rx="11.5" ry="8.8" fill="rgb(143, 143, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="40" cy="259" rx="10.6" ry="7.2" fill="rgb(171, 171, 163)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="47" cy="248" rx="8.0" ry="5.5" fill="rgb(151, 151, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="57" cy="263" rx="8.7" ry="7.2" fill="rgb(159, 159, 151)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="64" cy="274" rx="6.4" ry="6.3" fill="rgb(139, 139, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="74" cy="267" rx="9.7" ry="8.7" fill="rgb(148, 148, 140)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="81" cy="256" rx="6.5" ry="8.0" fill="rgb(128, 128, 122)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="91" cy="264" rx="10.2" ry="8.0" fill="rgb(149, 149, 141)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="108" cy="267" rx="9.4" ry="7.2" fill="rgb(154, 154, 146)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="115" cy="256" rx="8.7" ry="6.4" fill="rgb(134, 134, 128)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="125" cy="263" rx="9.6" ry="9.3" fill="rgb(164, 164, 156)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="132" cy="252" rx="6.7" ry="6.4" fill="rgb(144, 144, 138)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="142" cy="261" rx="9.6" ry="9.0" fill="rgb(142, 142, 134)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="149" cy="272" rx="7.0" ry="6.3" fill="rgb(122, 122, 116)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="159" cy="263" rx="11.4" ry="8.4" fill="rgb(158, 158, 150)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="176" cy="259" rx="11.0" ry="7.4" fill="rgb(149, 149, 141)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="193" cy="261" rx="11.9" ry="9.8" fill="rgb(174, 174, 166)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="200" cy="272" rx="7.9" ry="6.7" fill="rgb(154, 154, 148)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="210" cy="253" rx="9.4" ry="7.6" fill="rgb(153, 153, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="227" cy="255" rx="9.1" ry="9.9" fill="rgb(169, 169, 161)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="244" cy="251" rx="9.8" ry="7.3" fill="rgb(163, 163, 155)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="251" cy="240" rx="8.6" ry="6.8" fill="rgb(143, 143, 137)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="261" cy="249" rx="11.2" ry="9.7" fill="rgb(145, 145, 137)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="278" cy="244" rx="10.8" ry="9.1" fill="rgb(146, 146, 138)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="285" cy="255" rx="6.7" ry="7.5" fill="rgb(126, 126, 120)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="295" cy="244" rx="8.3" ry="7.1" fill="rgb(141, 141, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="302" cy="255" rx="8.5" ry="5.4" fill="rgb(121, 121, 115)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="312" cy="245" rx="9.1" ry="8.5" fill="rgb(142, 142, 134)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="414" cy="250" rx="9.2" ry="9.4" fill="rgb(149, 149, 141)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="431" cy="251" rx="10.5" ry="7.3" fill="rgb(140, 140, 132)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="448" cy="253" rx="9.7" ry="7.0" fill="rgb(159, 159, 151)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="455" cy="242" rx="8.2" ry="6.0" fill="rgb(139, 139, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="465" cy="262" rx="10.6" ry="7.8" fill="rgb(169, 169, 161)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="482" cy="257" rx="8.3" ry="7.2" fill="rgb(175, 175, 167)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="499" cy="261" rx="10.4" ry="8.3" fill="rgb(141, 141, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="516" cy="264" rx="10.1" ry="8.3" fill="rgb(176, 176, 168)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="533" cy="268" rx="10.0" ry="9.7" fill="rgb(166, 166, 158)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="540" cy="257" rx="8.9" ry="7.7" fill="rgb(146, 146, 140)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="550" cy="264" rx="10.8" ry="9.4" fill="rgb(160, 160, 152)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="557" cy="275" rx="9.0" ry="6.9" fill="rgb(140, 140, 134)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="567" cy="267" rx="8.3" ry="9.9" fill="rgb(158, 158, 150)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="574" cy="278" rx="7.2" ry="7.3" fill="rgb(138, 138, 132)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="584" cy="266" rx="9.8" ry="9.6" fill="rgb(160, 160, 152)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="591" cy="255" rx="7.1" ry="6.4" fill="rgb(140, 140, 134)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="601" cy="266" rx="8.6" ry="9.0" fill="rgb(166, 166, 158)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="618" cy="258" rx="9.3" ry="7.1" fill="rgb(161, 161, 153)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="625" cy="269" rx="6.1" ry="6.2" fill="rgb(141, 141, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="635" cy="256" rx="8.9" ry="9.2" fill="rgb(166, 166, 158)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="652" cy="259" rx="9.6" ry="9.5" fill="rgb(164, 164, 156)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="669" cy="252" rx="11.6" ry="8.7" fill="rgb(157, 157, 149)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="686" cy="249" rx="9.0" ry="8.2" fill="rgb(159, 159, 151)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="693" cy="238" rx="6.1" ry="5.2" fill="rgb(139, 139, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="703" cy="251" rx="10.2" ry="9.7" fill="rgb(158, 158, 150)" stroke="#1A1A18" stroke-width="2"/>
<circle cx="90" cy="200" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="90" y1="200" x2="70" y2="120" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="190" cy="215" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="190" y1="215" x2="205" y2="135" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="270" cy="195" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="270" y1="195" x2="300" y2="120" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="120" cy="320" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="120" y1="320" x2="100" y2="400" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="240" cy="315" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="240" y1="315" x2="250" y2="395" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="470" cy="205" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="470" y1="205" x2="490" y2="125" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="600" cy="210" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="600" y1="210" x2="620" y2="130" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="520" cy="315" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="520" y1="315" x2="540" y2="395" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="650" cy="320" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="650" y1="320" x2="640" y2="400" stroke="#FFFFFF" stroke-width="3" marker-end="url(#stenmur-pil)" opacity="0.9"/>
<circle cx="60" cy="470" r="26" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="180" cy="500" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="600" cy="500" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="80" cy="70" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="640" cy="60" r="26" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="250" cy="90" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<rect x="250" y="12" width="76" height="36" rx="10" fill="#1C1C1E"/>
<text x="288" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<circle cx="370" cy="282" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M361 282l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="410" y="300" width="184" height="40" rx="12" fill="#1C1C1E"/>
<text x="502" y="326" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Planerad överfart</text>
<path d="M410 320 L392 296" stroke="#FFFFFF" stroke-width="2"/>
<rect x="34" y="300" width="240" height="40" rx="12" fill="#1C1C1E"/>
<text x="154" y="326" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Inget virke på stenmuren</text>
<path d="M154 300 L154 290" stroke="#FFFFFF" stroke-width="2"/>
<rect x="470" y="420" width="196" height="40" rx="12" fill="#1C1C1E"/>
<text x="568" y="446" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fällt bort från muren</text>
</svg>`,
  STENMUR_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: virke och ris ligger på stenmuren"><rect width="376" height="170" fill="#2A3324"/>
<ellipse cx="10" cy="89.5" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="27" cy="91.7" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="44" cy="93.3" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="61" cy="94" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="78" cy="93.6" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="95" cy="92.2" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="112" cy="90" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="129" cy="87.5" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="146" cy="85.1" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="163" cy="83.2" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="180" cy="82.1" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="197" cy="82.1" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="214" cy="83.2" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="231" cy="85.1" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="248" cy="87.5" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="265" cy="90" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="282" cy="92.2" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="299" cy="93.6" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="316" cy="94" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="333" cy="93.3" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="350" cy="91.7" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="367" cy="89.5" rx="9" ry="7.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<rect x="40" y="70" width="150" height="13" rx="6.5" fill="#C9A77A" stroke="#1A1A18" stroke-width="2" transform="rotate(-4 40 70)"/>
<rect x="120" y="82" width="150" height="13" rx="6.5" fill="#C9A77A" stroke="#1A1A18" stroke-width="2" transform="rotate(3 120 82)"/>
<rect x="150" y="64" width="150" height="13" rx="6.5" fill="#C9A77A" stroke="#1A1A18" stroke-width="2" transform="rotate(-2 150 64)"/>
<rect x="230" y="86" width="150" height="13" rx="6.5" fill="#C9A77A" stroke="#1A1A18" stroke-width="2" transform="rotate(5 230 86)"/>
<rect x="90" y="98" width="150" height="13" rx="6.5" fill="#C9A77A" stroke="#1A1A18" stroke-width="2" transform="rotate(1 90 98)"/>
<path d="M60 70l16 10 M70 64l6 18 M250 96l18-8 M262 100l10 12 M200 70l14 6" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<rect x="150" y="20" width="16" height="140" rx="8" fill="#B08A5A" stroke="#1A1A18" stroke-width="2" transform="rotate(28 158 90)"/>
<circle cx="196" cy="150" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="0.9"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  AVLAGG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Avlägg sett från vägen: travarna ligger på underliggare, högst 4,5 m höga, minst 2 m från vägkanten, ett sortiment per trave, vägen är fri"><rect width="720" height="560" fill="#1F2A2E"/>
<rect y="0" width="720" height="300" fill="#24323A"/>
<path d="M0 300 C120 290 240 305 360 296 S600 292 720 300 V560 H0Z" fill="#2E3A27"/>
<rect x="0" y="500" width="720" height="60" fill="#5A5444"/>
<path d="M0 500 H720" stroke="#3E3A2E" stroke-width="4"/>
<path d="M40 540 H140 M200 540 H300 M360 540 H460 M520 540 H620" stroke="rgba(255, 255, 255, 0.3)" stroke-width="4"/>
<defs><marker id="avlagg-matt" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<line x1="24" y1="438" x2="24" y2="242" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#avlagg-matt)" marker-end="url(#avlagg-matt)"/>
<rect x="8" y="196" width="118" height="36" rx="10" fill="#1C1C1E"/>
<text x="67" y="220" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">max 4,5 m</text>
<line x1="690" y1="446" x2="690" y2="496" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#avlagg-matt)" marker-end="url(#avlagg-matt)"/>
<rect x="470" y="452" width="206" height="36" rx="10" fill="#1C1C1E"/>
<text x="573" y="476" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">minst 3 m till vägkant</text>
<rect x="40" y="420" width="220" height="22" rx="11" fill="#D9B98A" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="400" y="420" width="230" height="22" rx="11" fill="#D9B98A" stroke="#1A1A18" stroke-width="2.5"/>
<circle cx="63" cy="398" r="15.2" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="63" cy="398" r="6.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="98" cy="398" r="18.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="98" cy="398" r="8.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="133" cy="398" r="15.9" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="133" cy="398" r="7.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="168" cy="398" r="17.0" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="168" cy="398" r="7.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="202" cy="398" r="15.3" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="202" cy="398" r="6.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="80" cy="369" r="18.6" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="80" cy="369" r="8.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="115" cy="369" r="18.4" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="115" cy="369" r="8.3" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="150" cy="369" r="18.8" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="150" cy="369" r="8.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="185" cy="369" r="20.6" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="185" cy="369" r="9.3" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="219" cy="369" r="19.7" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="219" cy="369" r="8.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="63" cy="340" r="17.0" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="63" cy="340" r="7.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="98" cy="340" r="17.2" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="98" cy="340" r="7.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="133" cy="340" r="14.5" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="133" cy="340" r="6.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="168" cy="340" r="18.0" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="168" cy="340" r="8.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="202" cy="340" r="17.4" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="202" cy="340" r="7.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="80" cy="311" r="17.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="80" cy="311" r="7.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="115" cy="311" r="17.4" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="115" cy="311" r="7.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="150" cy="311" r="17.7" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="150" cy="311" r="8.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="185" cy="311" r="19.8" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="185" cy="311" r="8.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="219" cy="311" r="19.0" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="219" cy="311" r="8.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="63" cy="282" r="17.6" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="63" cy="282" r="7.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="98" cy="282" r="17.5" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="98" cy="282" r="7.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="133" cy="282" r="19.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="133" cy="282" r="8.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="168" cy="282" r="16.6" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="168" cy="282" r="7.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="202" cy="282" r="19.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="202" cy="282" r="8.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="80" cy="254" r="17.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="80" cy="254" r="7.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="115" cy="254" r="16.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="115" cy="254" r="7.3" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="150" cy="254" r="17.3" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="150" cy="254" r="7.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="185" cy="254" r="15.1" fill="#E3C08E" stroke="#1A1A18" stroke-width="2"/>
<circle cx="185" cy="254" r="6.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="419" cy="398" r="11.8" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="419" cy="398" r="5.3" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="446" cy="398" r="10.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="446" cy="398" r="4.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="472" cy="398" r="12.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="472" cy="398" r="5.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="499" cy="398" r="11.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="499" cy="398" r="5.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="526" cy="398" r="14.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="526" cy="398" r="6.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="552" cy="398" r="14.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="552" cy="398" r="6.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="579" cy="398" r="12.7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="579" cy="398" r="5.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="606" cy="398" r="11.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="606" cy="398" r="5.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="432" cy="376" r="13.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="432" cy="376" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="459" cy="376" r="10.4" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="459" cy="376" r="4.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="485" cy="376" r="12.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="485" cy="376" r="5.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="512" cy="376" r="12.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="512" cy="376" r="5.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="539" cy="376" r="11.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="539" cy="376" r="5.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="565" cy="376" r="12.8" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="565" cy="376" r="5.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="592" cy="376" r="9.8" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="592" cy="376" r="4.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="619" cy="376" r="10.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="619" cy="376" r="4.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="419" cy="354" r="15.5" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="419" cy="354" r="7.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="446" cy="354" r="16.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="446" cy="354" r="7.2" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="472" cy="354" r="15.1" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="472" cy="354" r="6.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="499" cy="354" r="16.5" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="499" cy="354" r="7.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="526" cy="354" r="16.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="526" cy="354" r="7.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="552" cy="354" r="13.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="552" cy="354" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="579" cy="354" r="13.7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="579" cy="354" r="6.2" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="606" cy="354" r="16.5" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="606" cy="354" r="7.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="432" cy="332" r="16.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="432" cy="332" r="7.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="459" cy="332" r="13.4" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="459" cy="332" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="485" cy="332" r="14.8" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="485" cy="332" r="6.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="512" cy="332" r="15.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="512" cy="332" r="6.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="539" cy="332" r="13.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="539" cy="332" r="5.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="565" cy="332" r="13.5" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="565" cy="332" r="6.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="592" cy="332" r="14.4" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="592" cy="332" r="6.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="619" cy="332" r="12.9" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="619" cy="332" r="5.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="419" cy="310" r="14.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="419" cy="310" r="6.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="446" cy="310" r="12.7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="446" cy="310" r="5.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="472" cy="310" r="13.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="472" cy="310" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="499" cy="310" r="13.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="499" cy="310" r="5.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="526" cy="310" r="14.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="526" cy="310" r="6.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="552" cy="310" r="11.7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="552" cy="310" r="5.2" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="579" cy="310" r="14.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="579" cy="310" r="6.3" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="606" cy="310" r="13.1" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="606" cy="310" r="5.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="432" cy="288" r="15.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="432" cy="288" r="6.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="459" cy="288" r="11.8" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="459" cy="288" r="5.3" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="485" cy="288" r="12.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="485" cy="288" r="5.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="512" cy="288" r="13.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="512" cy="288" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="539" cy="288" r="14.3" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="539" cy="288" r="6.4" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="565" cy="288" r="13.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="565" cy="288" r="6.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="592" cy="288" r="14.4" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="592" cy="288" r="6.5" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="619" cy="288" r="15.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="619" cy="288" r="6.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="419" cy="265" r="13.0" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="419" cy="265" r="5.8" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="446" cy="265" r="12.7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="446" cy="265" r="5.7" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="472" cy="265" r="14.7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="472" cy="265" r="6.6" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="499" cy="265" r="13.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="499" cy="265" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="526" cy="265" r="15.2" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="526" cy="265" r="6.9" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="552" cy="265" r="13.4" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="552" cy="265" r="6.0" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<circle cx="579" cy="265" r="13.6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="579" cy="265" r="6.1" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1.5"/>
<rect x="70" y="150" width="150" height="36" rx="10" fill="#1C1C1E"/>
<text x="145" y="174" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Talltimmer</text>
<rect x="420" y="168" width="150" height="36" rx="10" fill="#1C1C1E"/>
<text x="495" y="192" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Barrmassa</text>
<circle cx="356" cy="431" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M347 431l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="250" y="360" width="212" height="40" rx="12" fill="#1C1C1E"/>
<text x="356" y="386" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Underliggare under</text>
<rect x="230" y="64" width="260" height="40" rx="12" fill="#1C1C1E"/>
<text x="360" y="90" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Ett sortiment per trave</text>
<rect x="250" y="510" width="220" height="40" rx="12" fill="#1C1C1E"/>
<text x="360" y="536" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Vägen fri från ris</text>
</svg>`,
  AVLAGG_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: traven ligger direkt på marken utan underliggare"><rect width="376" height="170" fill="#24323A"/>
<path d="M0 128 C90 122 200 134 376 126 V170 H0Z" fill="#3A3324"/>
<path d="M20 140 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#5A4A30" stroke-width="3" fill="none"/>
<circle cx="40" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="66" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="92" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="118" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="144" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="170" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="196" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="222" cy="128" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="53" cy="106" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="79" cy="106" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="105" cy="106" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="131" cy="106" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="157" cy="106" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="183" cy="106" r="13" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  AVLAGG_REGLER: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 360" role="img" aria-label="Avlägg från sidan: vägen, diket, säkerhetsavstånd till stockändarna, traven högst 4,5 meter, ändarna jämna upp till 1,5 meter"><defs><marker id="avlagg_regler-m2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="560" height="360" fill="#24323A"/>
<path d="M0 300 H170 L186 300 Q200 326 214 300 H560 V360 H0Z" fill="#2E3A27"/>
<rect x="0" y="292" width="170" height="14" fill="#5A5444"/>
<text x="85" y="336" text-anchor="middle" font-size="15" font-weight="700" fill="#8E8E93">Väg</text>
<text x="200" y="350" text-anchor="middle" font-size="13" font-weight="700" fill="#8E8E93">Dike</text>
<rect x="254" y="270" width="236" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="254" y="255" width="230" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="254" y="239" width="236" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="254" y="224" width="230" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="261" y="208" width="229" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="264" y="193" width="220" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="258" y="177" width="232" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="261" y="162" width="223" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="264" y="146" width="226" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="258" y="131" width="226" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="261" y="115" width="229" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="264" y="100" width="220" height="14" rx="7" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="290" cy="292" r="8" fill="#B08A5A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="450" cy="292" r="8" fill="#B08A5A" stroke="#1A1A18" stroke-width="2"/>
<line x1="170" y1="268" x2="254" y2="268" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#avlagg_regler-m2)" marker-end="url(#avlagg_regler-m2)"/>
<path d="M170 278V300 M254 254V284" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="4 4"/>
<rect x="130" y="226" width="164" height="32" rx="9" fill="#1C1C1E"/>
<text x="212" y="248" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFFFF">säkerhetsavstånd</text>
<line x1="520" y1="284" x2="520" y2="84" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#avlagg_regler-m2)" marker-end="url(#avlagg_regler-m2)"/>
<rect x="440" y="40" width="112" height="32" rx="9" fill="#1C1C1E"/>
<text x="496" y="62" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFFFF">max 4,5 m</text>
<path d="M240 224 H500" stroke="#30D158" stroke-width="2" stroke-dasharray="6 5"/>
<rect x="20" y="180" width="214" height="32" rx="9" fill="#1C1C1E"/>
<text x="127" y="202" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFFFF">Ändar jämna till 1,5 m</text>
<circle cx="240" cy="224" r="13" fill="#30D158" stroke="#FFFFFF" stroke-width="2.5"/>
<path d="M234 224l4 4 8-9" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  KULTURLAMNING: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Kulturlämning sedd uppifrån: kulturstubbar 2–5 m utanför kanten, stickvägen går runt, träden är fällda bort från röset och inget ris ligger på det"><defs><pattern id="kulturlamning-markK" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="kulturlamning-pilK" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#kulturlamning-markK)"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<ellipse cx="320" cy="280" rx="100" ry="90" fill="rgba(181, 101, 29, 0.1)"/>
<ellipse cx="386" cy="277" rx="6.7" ry="8.0" fill="rgb(158, 158, 150)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="382" cy="269" rx="11.6" ry="6.8" fill="rgb(153, 153, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="259" cy="294" rx="8.8" ry="8.3" fill="rgb(143, 143, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="263" cy="257" rx="12.3" ry="8.1" fill="rgb(147, 147, 139)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="265" cy="307" rx="10.4" ry="5.6" fill="rgb(121, 121, 113)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="373" cy="310" rx="8.3" ry="5.4" fill="rgb(122, 122, 114)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="262" cy="293" rx="6.8" ry="5.5" fill="rgb(141, 141, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="378" cy="282" rx="9.7" ry="7.8" fill="rgb(155, 155, 147)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="370" cy="309" rx="10.3" ry="5.5" fill="rgb(150, 150, 142)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="356" cy="324" rx="6.9" ry="7.5" fill="rgb(120, 120, 112)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="283" cy="237" rx="7.1" ry="6.0" fill="rgb(126, 126, 118)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="296" cy="331" rx="10.5" ry="7.8" fill="rgb(135, 135, 127)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="276" cy="245" rx="9.7" ry="6.4" fill="rgb(159, 159, 151)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="366" cy="312" rx="10.9" ry="6.0" fill="rgb(138, 138, 130)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="370" cy="305" rx="11.8" ry="6.7" fill="rgb(144, 144, 136)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="336" cy="333" rx="10.8" ry="6.5" fill="rgb(149, 149, 141)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="314" cy="225" rx="8.2" ry="6.3" fill="rgb(139, 139, 131)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="364" cy="248" rx="10.5" ry="7.2" fill="rgb(153, 153, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="363" cy="313" rx="8.6" ry="7.0" fill="rgb(114, 114, 106)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="293" cy="233" rx="10.3" ry="8.9" fill="rgb(114, 114, 106)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="322" cy="334" rx="10.9" ry="6.3" fill="rgb(153, 153, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="277" cy="310" rx="7.0" ry="5.7" fill="rgb(126, 126, 118)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="306" cy="330" rx="12.0" ry="7.7" fill="rgb(158, 158, 150)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="276" cy="255" rx="12.3" ry="6.5" fill="rgb(115, 115, 107)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="326" cy="230" rx="10.7" ry="6.5" fill="rgb(143, 143, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="271" cy="269" rx="11.4" ry="7.0" fill="rgb(147, 147, 139)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="362" cy="307" rx="9.1" ry="7.4" fill="rgb(120, 120, 112)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="274" cy="299" rx="7.2" ry="6.3" fill="rgb(143, 143, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="284" cy="314" rx="8.6" ry="6.5" fill="rgb(141, 141, 133)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="297" cy="237" rx="7.0" ry="8.2" fill="rgb(160, 160, 152)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="346" cy="239" rx="10.0" ry="6.2" fill="rgb(154, 154, 146)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="360" cy="253" rx="12.6" ry="8.0" fill="rgb(145, 145, 137)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="315" cy="233" rx="7.3" ry="8.4" fill="rgb(130, 130, 122)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="336" cy="236" rx="9.2" ry="7.0" fill="rgb(153, 153, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="351" cy="245" rx="10.9" ry="7.2" fill="rgb(143, 143, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="306" cy="238" rx="12.6" ry="5.8" fill="rgb(143, 143, 135)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="286" cy="308" rx="9.6" ry="6.3" fill="rgb(160, 160, 152)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="286" cy="252" rx="7.5" ry="6.6" fill="rgb(150, 150, 142)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="278" cy="291" rx="8.8" ry="8.9" fill="rgb(146, 146, 138)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="277" cy="278" rx="11.1" ry="8.6" fill="rgb(132, 132, 124)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="344" cy="245" rx="9.4" ry="9.1" fill="rgb(125, 125, 117)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="337" cy="318" rx="9.5" ry="6.6" fill="rgb(154, 154, 146)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="361" cy="274" rx="7.9" ry="5.9" fill="rgb(118, 118, 110)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="361" cy="283" rx="12.9" ry="8.7" fill="rgb(149, 149, 141)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="360" cy="287" rx="13.1" ry="6.6" fill="rgb(120, 120, 112)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="350" cy="254" rx="8.9" ry="9.6" fill="rgb(133, 133, 125)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="353" cy="259" rx="9.4" ry="6.5" fill="rgb(150, 150, 142)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="318" cy="241" rx="10.1" ry="6.8" fill="rgb(136, 136, 128)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="332" cy="317" rx="8.8" ry="7.6" fill="rgb(137, 137, 129)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="357" cy="272" rx="12.0" ry="9.1" fill="rgb(133, 133, 125)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="333" cy="315" rx="11.9" ry="5.8" fill="rgb(129, 129, 121)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="283" cy="280" rx="8.0" ry="6.0" fill="rgb(146, 146, 138)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="309" cy="247" rx="11.1" ry="6.3" fill="rgb(122, 122, 114)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="337" cy="310" rx="9.5" ry="6.1" fill="rgb(159, 159, 151)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="297" cy="304" rx="7.9" ry="9.0" fill="rgb(168, 168, 160)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="287" cy="282" rx="8.1" ry="8.7" fill="rgb(126, 126, 118)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="351" cy="275" rx="8.4" ry="8.4" fill="rgb(158, 158, 150)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="297" cy="301" rx="11.6" ry="6.0" fill="rgb(144, 144, 136)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="319" cy="250" rx="10.6" ry="6.8" fill="rgb(130, 130, 122)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="345" cy="270" rx="11.5" ry="9.8" fill="rgb(155, 155, 147)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="322" cy="255" rx="12.6" ry="7.5" fill="rgb(138, 138, 130)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="330" cy="302" rx="9.3" ry="6.5" fill="rgb(124, 124, 116)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="310" cy="302" rx="11.8" ry="9.2" fill="rgb(155, 155, 147)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="301" cy="268" rx="9.9" ry="9.8" fill="rgb(128, 128, 120)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="307" cy="298" rx="9.7" ry="6.6" fill="rgb(148, 148, 140)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="306" cy="297" rx="13.6" ry="7.6" fill="rgb(162, 162, 154)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="299" cy="283" rx="10.9" ry="10.3" fill="rgb(153, 153, 145)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="327" cy="271" rx="10.9" ry="10.1" fill="rgb(129, 129, 121)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="330" cy="281" rx="10.8" ry="8.4" fill="rgb(144, 144, 136)" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="313" cy="275" rx="12.0" ry="6.8" fill="rgb(151, 151, 143)" stroke="#1A1A18" stroke-width="2"/>
<circle cx="214" cy="185" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="214" y1="185" x2="172" y2="143" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturlamning-pilK)" opacity="0.9"/>
<circle cx="426" cy="185" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="426" y1="185" x2="468" y2="143" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturlamning-pilK)" opacity="0.9"/>
<circle cx="214" cy="375" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="214" y1="375" x2="172" y2="417" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturlamning-pilK)" opacity="0.9"/>
<circle cx="426" cy="375" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="426" y1="375" x2="468" y2="417" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturlamning-pilK)" opacity="0.9"/>
<circle cx="416" cy="307" r="9" fill="#1A1A18"/>
<circle cx="416" cy="307" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="416" cy="307" r="5" fill="#C9A77A"/>
<circle cx="380" cy="352" r="9" fill="#1A1A18"/>
<circle cx="380" cy="352" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="380" cy="352" r="5" fill="#C9A77A"/>
<circle cx="321" cy="370" r="9" fill="#1A1A18"/>
<circle cx="321" cy="370" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="321" cy="370" r="5" fill="#C9A77A"/>
<circle cx="262" cy="354" r="9" fill="#1A1A18"/>
<circle cx="262" cy="354" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="262" cy="354" r="5" fill="#C9A77A"/>
<circle cx="225" cy="309" r="9" fill="#1A1A18"/>
<circle cx="225" cy="309" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="225" cy="309" r="5" fill="#C9A77A"/>
<circle cx="224" cy="253" r="9" fill="#1A1A18"/>
<circle cx="224" cy="253" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="224" cy="253" r="5" fill="#C9A77A"/>
<circle cx="260" cy="208" r="9" fill="#1A1A18"/>
<circle cx="260" cy="208" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="260" cy="208" r="5" fill="#C9A77A"/>
<circle cx="319" cy="190" r="9" fill="#1A1A18"/>
<circle cx="319" cy="190" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="319" cy="190" r="5" fill="#C9A77A"/>
<circle cx="378" cy="206" r="9" fill="#1A1A18"/>
<circle cx="378" cy="206" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="378" cy="206" r="5" fill="#C9A77A"/>
<circle cx="415" cy="251" r="9" fill="#1A1A18"/>
<circle cx="415" cy="251" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="415" cy="251" r="5" fill="#C9A77A"/>
<circle cx="60" cy="80" r="26" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="130" cy="200" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="70" cy="400" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="460" cy="500" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="470" cy="60" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="680" cy="470" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<rect x="612" y="12" width="96" height="36" rx="10" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="200" height="40" rx="12" fill="#1C1C1E"/>
<text x="570" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kör runt – inte över</text>
<rect x="220" y="122" width="200" height="40" rx="12" fill="#1C1C1E"/>
<text x="320" y="148" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kulturlämning</text>
<rect x="196" y="432" width="248" height="40" rx="12" fill="#1C1C1E"/>
<text x="320" y="458" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Inget ris eller virke på</text>
<rect x="8" y="262" width="196" height="40" rx="12" fill="#1C1C1E"/>
<text x="106" y="288" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Kulturstubbar 2–5 m</text>
<path d="M204 282 H212" stroke="#FFFFFF" stroke-width="2"/>
<rect x="24" y="498" width="240" height="40" rx="12" fill="#1C1C1E"/>
<text x="144" y="524" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fällt bort från lämningen</text>
</svg>`,
  KULTURLAMNING_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: ett träd är fällt över röset och ris ligger kvar på det"><rect width="376" height="170" fill="#2A3324"/>
<ellipse cx="166" cy="82" rx="8.3" ry="6.9" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="153" cy="88" rx="8.3" ry="6.0" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="211" cy="134" rx="9.8" ry="5.7" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="246" cy="57" rx="8.4" ry="5.1" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="172" cy="132" rx="9.3" ry="7.4" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="245" cy="114" rx="9.3" ry="5.2" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="190" cy="49" rx="6.2" ry="7.3" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="242" cy="70" rx="6.1" ry="7.4" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="190" cy="43" rx="9.4" ry="5.9" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="250" cy="78" rx="8.2" ry="6.3" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="280" cy="100" rx="9.4" ry="8.0" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="213" cy="54" rx="9.0" ry="6.9" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="260" cy="112" rx="9.3" ry="7.2" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="135" cy="124" rx="9.9" ry="5.1" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="229" cy="80" rx="6.7" ry="7.1" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="217" cy="74" rx="7.9" ry="6.0" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="107" cy="83" rx="6.3" ry="6.7" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="205" cy="58" rx="9.1" ry="5.5" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="253" cy="77" rx="6.8" ry="7.7" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="199" cy="119" rx="9.2" ry="6.0" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="198" cy="92" rx="6.9" ry="7.1" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="244" cy="86" rx="8.7" ry="5.3" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="242" cy="109" rx="9.3" ry="7.7" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="128" cy="109" rx="6.8" ry="7.9" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="152" cy="67" rx="8.3" ry="6.8" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="223" cy="56" rx="9.2" ry="5.0" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="108" cy="91" rx="7.4" ry="7.0" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="152" cy="76" rx="8.1" ry="5.2" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="250" cy="105" rx="7.6" ry="5.9" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<ellipse cx="219" cy="89" rx="7.4" ry="6.3" fill="#A3A39B" stroke="#1A1A18" stroke-width="2"/>
<rect x="40" y="84" width="300" height="16" rx="8" fill="#B08A5A" stroke="#1A1A18" stroke-width="2" transform="rotate(-12 190 92)"/>
<circle cx="330" cy="58" r="9" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<path d="M60 104l-14 18 M80 100l-6 22 M100 96l-18 10 M70 90l-20 -8" stroke="#24A148" stroke-width="5" stroke-linecap="round"/>
<path d="M120 70l20 12 M132 62l8 22 M200 96l22-8 M212 100l12 14 M160 120l18 6 M240 72l14 10 M248 66l-6 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  KOLBOTTEN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Kolbotten sedd uppifrån: en plan svart rund botten med en låg vall och gropar runt om, träden på bottnen står kvar, kulturstubbar utanför groparna och stickvägen går runt"><defs><pattern id="kolbotten-markB" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<pattern id="kolbotten-kol" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1.4" fill="#3A332B"/>
<circle cx="10" cy="10" r="1.1" fill="#3A332B"/>
</pattern>
<marker id="kolbotten-pilB" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#kolbotten-markB)"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<ellipse cx="448" cy="302" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(99 448 302)"/>
<ellipse cx="407" cy="385" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(135 407 385)"/>
<ellipse cx="325" cy="428" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(171 325 428)"/>
<ellipse cx="233" cy="414" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(207 233 414)"/>
<ellipse cx="167" cy="349" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(243 167 349)"/>
<ellipse cx="152" cy="258" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(279 152 258)"/>
<ellipse cx="193" cy="175" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(315 193 175)"/>
<ellipse cx="275" cy="132" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(351 275 132)"/>
<ellipse cx="367" cy="146" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(387 367 146)"/>
<ellipse cx="433" cy="211" rx="18" ry="12" fill="#1B1F17" stroke="#4A4436" stroke-width="2" transform="rotate(423 433 211)"/>
<circle cx="300" cy="280" r="118" fill="none" stroke="#6E6450" stroke-width="18"/>
<circle cx="300" cy="280" r="118" fill="none" stroke="#857A60" stroke-width="4"/>
<circle cx="300" cy="280" r="108" fill="#24201B"/>
<circle cx="300" cy="280" r="108" fill="url(#kolbotten-kol)"/>
<circle cx="250" cy="190" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="360" cy="360" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="230" cy="380" r="14" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="490" cy="280" r="9" fill="#1A1A18"/>
<circle cx="490" cy="280" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="490" cy="280" r="5" fill="#C9A77A"/>
<circle cx="465" cy="375" r="9" fill="#1A1A18"/>
<circle cx="465" cy="375" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="465" cy="375" r="5" fill="#C9A77A"/>
<circle cx="395" cy="445" r="9" fill="#1A1A18"/>
<circle cx="395" cy="445" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="395" cy="445" r="5" fill="#C9A77A"/>
<circle cx="300" cy="470" r="9" fill="#1A1A18"/>
<circle cx="300" cy="470" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="300" cy="470" r="5" fill="#C9A77A"/>
<circle cx="205" cy="445" r="9" fill="#1A1A18"/>
<circle cx="205" cy="445" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="205" cy="445" r="5" fill="#C9A77A"/>
<circle cx="135" cy="375" r="9" fill="#1A1A18"/>
<circle cx="135" cy="375" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="135" cy="375" r="5" fill="#C9A77A"/>
<circle cx="110" cy="280" r="9" fill="#1A1A18"/>
<circle cx="110" cy="280" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="110" cy="280" r="5" fill="#C9A77A"/>
<circle cx="135" cy="185" r="9" fill="#1A1A18"/>
<circle cx="135" cy="185" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="135" cy="185" r="5" fill="#C9A77A"/>
<circle cx="205" cy="115" r="9" fill="#1A1A18"/>
<circle cx="205" cy="115" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="205" cy="115" r="5" fill="#C9A77A"/>
<circle cx="300" cy="90" r="9" fill="#1A1A18"/>
<circle cx="300" cy="90" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="300" cy="90" r="5" fill="#C9A77A"/>
<circle cx="395" cy="115" r="9" fill="#1A1A18"/>
<circle cx="395" cy="115" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="395" cy="115" r="5" fill="#C9A77A"/>
<circle cx="465" cy="185" r="9" fill="#1A1A18"/>
<circle cx="465" cy="185" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="465" cy="185" r="5" fill="#C9A77A"/>
<circle cx="140" cy="110" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="140" y1="110" x2="90" y2="60" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kolbotten-pilB)" opacity="0.9"/>
<circle cx="460" cy="110" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="460" y1="110" x2="510" y2="60" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kolbotten-pilB)" opacity="0.9"/>
<circle cx="140" cy="450" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="140" y1="450" x2="90" y2="500" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kolbotten-pilB)" opacity="0.9"/>
<circle cx="460" cy="450" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="460" y1="450" x2="500" y2="500" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kolbotten-pilB)" opacity="0.9"/>
<circle cx="40" cy="280" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="680" cy="140" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="660" cy="460" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="420" cy="30" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="320" cy="530" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<rect x="612" y="12" width="96" height="36" rx="10" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="200" height="40" rx="12" fill="#1C1C1E"/>
<text x="570" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kör runt – inte på</text>
<rect x="196" y="300" width="208" height="40" rx="12" fill="#1C1C1E"/>
<text x="300" y="326" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Svart, plan botten</text>
<rect x="214" y="222" width="172" height="40" rx="12" fill="#1C1C1E"/>
<text x="300" y="248" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Träden får stå</text>
<rect x="16" y="20" width="230" height="40" rx="12" fill="#1C1C1E"/>
<text x="131" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Vall och gropar runt</text>
<path d="M200 60 L222 168" stroke="#FFFFFF" stroke-width="2"/>
<rect x="16" y="500" width="250" height="40" rx="12" fill="#1C1C1E"/>
<text x="141" y="526" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Inget ris i vall och gropar</text>
</svg>`,
  KOLBOTTEN_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: maskinen har vänt på kolbottnen och spåren går genom vallen"><rect width="376" height="170" fill="#2A3324"/>
<circle cx="170" cy="92" r="70" fill="none" stroke="#6E6450" stroke-width="12"/>
<circle cx="170" cy="92" r="64" fill="#24201B"/>
<path d="M-10 60 C80 60 150 50 190 80 C220 104 200 140 150 140 C110 140 90 120 -10 124" fill="none" stroke="#5A4A30" stroke-width="16" opacity="0.9"/>
<path d="M-10 60 C80 60 150 50 190 80 C220 104 200 140 150 140 C110 140 90 120 -10 124" fill="none" stroke="#3E3324" stroke-width="3" stroke-dasharray="6 6"/>
<path d="M120 40l-12 -12 M132 36l-4 -16 M210 150l14 10" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  HANSYN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Hänsynsyta sedd uppifrån: stickvägen går utanför kanten, träden runt ytan är fällda bort från den och inget ris ligger i ytan"><defs><pattern id="hansyn-markH" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<pattern id="hansyn-streckH" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="rgba(48, 209, 88, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="18" stroke="#30D158" stroke-width="3" opacity="0.6"/>
</pattern>
<marker id="hansyn-pilH" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#hansyn-markH)"/>
<path d="M70 90 C150 40 330 50 400 110 C460 160 450 250 420 320 C390 400 300 470 190 460 C90 450 40 380 40 280 C40 190 30 130 70 90Z" fill="url(#hansyn-streckH)" stroke="#30D158" stroke-width="4"/>
<circle cx="110" cy="130" r="22" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="190" cy="100" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="290" cy="110" r="24" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="370" cy="170" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="90" cy="230" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="150" cy="380" r="24" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="250" cy="410" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="340" cy="360" r="22" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="390" cy="260" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="80" cy="330" r="16" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="210" r="16" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="140" cy="170" r="14" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<rect x="170" y="236" width="140" height="44" rx="12" fill="rgba(28, 28, 30, 0.9)"/>
<text x="240" y="265" text-anchor="middle" font-size="22" font-weight="700" fill="#30D158">Hänsyn</text>
<path d="M560 0 C540 120 510 220 515 300 C520 390 560 470 580 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C520 120 490 220 495 300 C500 390 540 470 560 560 M580 0 C560 120 530 220 535 300 C540 390 580 470 600 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<circle cx="450" cy="120" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="450" y1="120" x2="500" y2="80" stroke="#FFFFFF" stroke-width="3" marker-end="url(#hansyn-pilH)" opacity="0.9"/>
<circle cx="470" cy="220" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="470" y1="220" x2="530" y2="200" stroke="#FFFFFF" stroke-width="3" marker-end="url(#hansyn-pilH)" opacity="0.9"/>
<circle cx="455" cy="380" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="455" y1="380" x2="520" y2="410" stroke="#FFFFFF" stroke-width="3" marker-end="url(#hansyn-pilH)" opacity="0.9"/>
<circle cx="360" cy="470" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="360" y1="470" x2="380" y2="530" stroke="#FFFFFF" stroke-width="3" marker-end="url(#hansyn-pilH)" opacity="0.9"/>
<circle cx="120" cy="480" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="120" y1="480" x2="90" y2="540" stroke="#FFFFFF" stroke-width="3" marker-end="url(#hansyn-pilH)" opacity="0.9"/>
<circle cx="660" cy="120" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="640" cy="440" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="40" cy="520" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="680" cy="230" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="450" cy="30" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<rect x="612" y="12" width="96" height="36" rx="10" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<circle cx="515" cy="300" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M506 300l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="546" y="282" width="164" height="40" rx="12" fill="#1C1C1E"/>
<text x="628" y="308" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Utanför kanten</text>
<rect x="110" y="300" width="250" height="40" rx="12" fill="#1C1C1E"/>
<text x="235" y="326" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Inget ris eller virke i ytan</text>
<rect x="260" y="500" width="220" height="40" rx="12" fill="#1C1C1E"/>
<text x="370" y="526" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fällt bort från ytan</text>
</svg>`,
  HANSYN_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: stickvägen skär in i kanten på hänsynsytan, spår och skadade träd innanför"><defs><pattern id="hansyn-felH" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="rgba(48, 209, 88, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="14" stroke="#30D158" stroke-width="2.5" opacity="0.6"/>
</pattern>
</defs>
<rect width="376" height="170" fill="#2A3324"/>
<path d="M-10 -10 H220 C250 50 240 120 200 180 H-10Z" fill="url(#hansyn-felH)" stroke="#30D158" stroke-width="3"/>
<circle cx="60" cy="50" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2"/>
<circle cx="110" cy="120" r="16" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2"/>
<path d="M300 -10 C250 40 170 70 180 110 C190 140 250 160 270 180" fill="none" stroke="#5A4A30" stroke-width="16" opacity="0.9"/>
<path d="M340 -10 C290 40 210 70 220 110 C230 140 290 160 310 180" fill="none" stroke="#5A4A30" stroke-width="16" opacity="0.9"/>
<path d="M168 60l-22 -10 M150 92l-24 4 M176 132l-20 14" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  BLOTT_SKORDARE: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Blött parti sett uppifrån: basvägen går på fastmarken, stickvägarna in i det blöta har en jämn tjock risbädd och körs ut samma väg, ingen körning längs diket"><defs><pattern id="blott_skordare-markV" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
</defs>
<rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#blott_skordare-markV)"/>
<path d="M120 250 C140 170 250 150 340 160 C420 150 470 120 470 0 H520 C520 140 500 190 520 240 C540 320 480 410 360 420 C250 430 120 400 110 330 Z" fill="rgba(10, 132, 255, 0.2)" stroke="#0A84FF" stroke-width="3"/>
<ellipse cx="180" cy="330" rx="34" ry="16" fill="rgba(10, 132, 255, 0.5)"/>
<ellipse cx="330" cy="210" rx="26" ry="12" fill="rgba(10, 132, 255, 0.5)"/>
<ellipse cx="300" cy="370" rx="30" ry="12" fill="rgba(10, 132, 255, 0.5)"/>
<ellipse cx="480" cy="360" rx="22" ry="10" fill="rgba(10, 132, 255, 0.5)"/>
<path d="M260 560 C420 540 620 470 640 340 C660 230 640 120 560 80 C480 50 300 60 0 100" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="56"/>
<path d="M260 540 C410 520 600 455 620 338 C640 232 622 136 550 100 C474 70 300 80 0 120 M260 580 C430 560 640 485 660 342 C680 228 658 104 570 60 C486 30 300 40 0 80" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<path d="M50 300 C70 380 80 460 90 570" fill="none" stroke="#0A84FF" stroke-width="14" opacity="0.6"/>
<path d="M50 300 C70 380 80 460 90 570" fill="none" stroke="#063E7A" stroke-width="3"/>
<path d="M612 300 L470 300" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M470 278 V322" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M590 140 L460 220" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M448 202 L472 238" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M420 510 L390 380" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M368 384 L412 376" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M200 110 L230 220" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M208 226 L252 214" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M614 293 l-10 13" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M604 303 l15 7" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M596 297 l3 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M608 295 l-18 6" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M598 310 l-16 5" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M583 298 l-11 0" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M596 313 l9 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M573 312 l-12 12" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M583 292 l15 8" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M568 313 l-0 11" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M574 302 l6 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M563 297 l-4 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M568 311 l10 10" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M565 296 l6 11" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M564 304 l19 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M561 301 l11 7" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M538 287 l3 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M553 304 l19 6" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M539 297 l-11 1" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M536 291 l13 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M520 289 l3 19" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M519 293 l12 13" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M524 301 l3 14" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M510 301 l-10 9" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M518 306 l-13 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M520 306 l-8 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M513 307 l-12 15" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M502 300 l18 6" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M489 298 l-12 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M496 298 l-14 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M487 293 l-17 2" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M500 296 l12 8" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M474 290 l13 7" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M492 302 l20 0" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M467 290 l-6 9" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M465 302 l-16 0" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M602 133 l-12 4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M580 139 l-14 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M583 142 l15 6" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M569 156 l7 11" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M563 157 l-7 19" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M577 147 l10 8" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M581 142 l-17 5" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M555 146 l7 14" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M559 144 l-19 4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M552 163 l6 12" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M546 174 l-15 9" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M546 153 l-15 2" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M550 157 l8 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M553 180 l-8 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M554 163 l-16 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M542 166 l1 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M542 183 l-9 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M524 166 l-3 19" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M519 184 l0 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M530 174 l7 16" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M525 180 l1 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M523 175 l16 1" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M508 195 l1 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M523 196 l9 15" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M495 182 l-10 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M494 186 l-7 13" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M507 206 l-14 8" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M504 197 l9 12" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 191 l-3 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M497 200 l-5 12" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M488 210 l5 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M480 200 l-17 5" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M482 195 l5 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M465 215 l-5 12" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M463 206 l12 16" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M481 211 l-15 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M479 226 l-11 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M471 225 l3 18" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M419 500 l1 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M432 495 l5 14" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M408 501 l-20 1" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M427 510 l19 7" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M423 504 l15 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M422 477 l-4 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M422 486 l7 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M424 495 l-12 5" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M409 467 l-19 1" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M421 474 l-17 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M402 459 l14 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M412 461 l-14 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M417 463 l0 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M398 465 l2 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M397 452 l-6 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M401 445 l-8 14" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M406 453 l-9 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M406 456 l13 9" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M415 439 l18 8" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M415 440 l2 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M407 439 l13 8" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M400 434 l-3 18" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M391 418 l8 17" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M388 418 l10 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M398 422 l-7 18" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M404 403 l16 8" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M395 410 l19 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M400 395 l-18 2" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M393 387 l2 13" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M393 407 l11 13" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M399 395 l8 10" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M401 387 l-13 3" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M398 375 l-3 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M196 120 l15 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M206 107 l10 11" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M189 127 l-6 19" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M193 121 l2 14" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M207 138 l12 5" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M216 136 l17 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M212 125 l-7 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M200 132 l13 8" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M198 141 l-2 13" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M218 148 l-0 16" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M205 161 l18 4" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M205 160 l-13 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M204 156 l-6 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M211 162 l1 19" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M202 157 l2 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M212 165 l-7 9" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M211 180 l13 4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M207 176 l15 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M207 168 l3 19" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M221 180 l-2 19" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M211 183 l-5 9" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M233 181 l2 15" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M233 204 l-0 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M231 195 l-3 15" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M229 197 l3 16" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M238 193 l-9 17" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M234 203 l-1 20" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M238 205 l18 4" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M228 216 l-8 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 45 l8 6" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M496 45 l-10 1" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M489 58 l10 7" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M495 45 l8 12" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 66 l-15 8" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M499 71 l-10 3" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M493 68 l0 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M502 55 l7 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M493 65 l1 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M516 78 l5 17" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M503 80 l11 5" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M515 84 l-3 18" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M503 93 l-7 7" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M500 81 l-14 5" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M505 93 l-16 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M498 104 l11 5" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M511 102 l12 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 110 l-11 3" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<g><ellipse cx="210" cy="120" rx="26" ry="14" fill="#4A3C26"/>
<path d="M190 117 l12 7 M204 111 l9 12 M214 115 l14 4 M198 125 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
</g>
<g><ellipse cx="690" cy="380" rx="26" ry="14" fill="#4A3C26"/>
<path d="M670 377 l12 7 M684 371 l9 12 M694 375 l14 4 M678 385 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
</g>
<g><ellipse cx="380" cy="540" rx="26" ry="14" fill="#4A3C26"/>
<path d="M360 537 l12 7 M374 531 l9 12 M384 535 l14 4 M368 545 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
</g>
<circle cx="60" cy="470" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="140" cy="520" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="680" cy="520" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="60" cy="30" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="700" cy="120" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<rect x="196" y="250" width="100" height="44" rx="12" fill="rgba(28, 28, 30, 0.9)"/>
<text x="246" y="279" text-anchor="middle" font-size="22" font-weight="700" fill="#0A84FF">Blött</text>
<circle cx="636" cy="250" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M627 250l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="520" y="184" width="190" height="40" rx="12" fill="#1C1C1E"/>
<text x="615" y="210" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Basväg på fastmark</text>
<rect x="100" y="500" width="210" height="40" rx="12" fill="#1C1C1E"/>
<text x="205" y="526" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Dike – kör inte längs</text>
<rect x="300" y="440" width="300" height="40" rx="12" fill="#1C1C1E"/>
<text x="450" y="466" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Jämn risbädd – samma väg ut</text>
<rect x="16" y="150" width="190" height="40" rx="12" fill="#1C1C1E"/>
<text x="111" y="176" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Rishögar i förväg</text>
<path d="M150 150 L190 132" stroke="#FFFFFF" stroke-width="2"/>
</svg>`,
  BLOTT_SKORDARE_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: glest ris i stickvägen, spåren har gått igenom och är fulla med vatten"><rect width="376" height="170" fill="#2A3324"/>
<path d="M-10 30 C100 10 260 20 386 40 V140 C260 160 100 150 -10 136Z" fill="rgba(10, 132, 255, 0.2)" stroke="#0A84FF" stroke-width="2.5"/>
<path d="M150 -10 C160 50 140 110 156 180 M206 -10 C216 50 196 110 212 180" fill="none" stroke="#3A2E1E" stroke-width="22"/>
<path d="M150 -10 C160 50 140 110 156 180 M206 -10 C216 50 196 110 212 180" fill="none" stroke="#0A84FF" stroke-width="8" opacity="0.8"/>
<path d="M168 20l18 6 M176 74l14 -8 M164 128l20 4 M190 150l10 10" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  BLOTT_SKOTARE: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Blött parti sett uppifrån: basvägen går på fastmarken, stickvägarna in i det blöta har en jämn tjock risbädd och körs ut samma väg, ingen körning längs diket"><defs><pattern id="blott_skotare-markV" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
</defs>
<rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#blott_skotare-markV)"/>
<path d="M120 250 C140 170 250 150 340 160 C420 150 470 120 470 0 H520 C520 140 500 190 520 240 C540 320 480 410 360 420 C250 430 120 400 110 330 Z" fill="rgba(10, 132, 255, 0.2)" stroke="#0A84FF" stroke-width="3"/>
<ellipse cx="180" cy="330" rx="34" ry="16" fill="rgba(10, 132, 255, 0.5)"/>
<ellipse cx="330" cy="210" rx="26" ry="12" fill="rgba(10, 132, 255, 0.5)"/>
<ellipse cx="300" cy="370" rx="30" ry="12" fill="rgba(10, 132, 255, 0.5)"/>
<ellipse cx="480" cy="360" rx="22" ry="10" fill="rgba(10, 132, 255, 0.5)"/>
<path d="M260 560 C420 540 620 470 640 340 C660 230 640 120 560 80 C480 50 300 60 0 100" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="56"/>
<path d="M260 540 C410 520 600 455 620 338 C640 232 622 136 550 100 C474 70 300 80 0 120 M260 580 C430 560 640 485 660 342 C680 228 658 104 570 60 C486 30 300 40 0 80" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<path d="M50 300 C70 380 80 460 90 570" fill="none" stroke="#0A84FF" stroke-width="14" opacity="0.6"/>
<path d="M50 300 C70 380 80 460 90 570" fill="none" stroke="#063E7A" stroke-width="3"/>
<path d="M612 300 L470 300" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M470 278 V322" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M590 140 L460 220" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M448 202 L472 238" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M420 510 L390 380" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M368 384 L412 376" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M200 110 L230 220" fill="none" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M208 226 L252 214" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<path d="M614 293 l-10 13" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M604 303 l15 7" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M596 297 l3 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M608 295 l-18 6" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M598 310 l-16 5" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M583 298 l-11 0" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M596 313 l9 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M573 312 l-12 12" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M583 292 l15 8" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M568 313 l-0 11" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M574 302 l6 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M563 297 l-4 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M568 311 l10 10" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M565 296 l6 11" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M564 304 l19 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M561 301 l11 7" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M538 287 l3 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M553 304 l19 6" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M539 297 l-11 1" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M536 291 l13 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M520 289 l3 19" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M519 293 l12 13" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M524 301 l3 14" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M510 301 l-10 9" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M518 306 l-13 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M520 306 l-8 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M513 307 l-12 15" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M502 300 l18 6" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M489 298 l-12 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M496 298 l-14 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M487 293 l-17 2" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M500 296 l12 8" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M474 290 l13 7" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M492 302 l20 0" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M467 290 l-6 9" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M465 302 l-16 0" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M602 133 l-12 4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M580 139 l-14 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M583 142 l15 6" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M569 156 l7 11" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M563 157 l-7 19" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M577 147 l10 8" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M581 142 l-17 5" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M555 146 l7 14" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M559 144 l-19 4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M552 163 l6 12" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M546 174 l-15 9" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M546 153 l-15 2" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M550 157 l8 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M553 180 l-8 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M554 163 l-16 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M542 166 l1 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M542 183 l-9 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M524 166 l-3 19" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M519 184 l0 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M530 174 l7 16" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M525 180 l1 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M523 175 l16 1" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M508 195 l1 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M523 196 l9 15" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M495 182 l-10 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M494 186 l-7 13" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M507 206 l-14 8" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M504 197 l9 12" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 191 l-3 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M497 200 l-5 12" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M488 210 l5 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M480 200 l-17 5" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M482 195 l5 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M465 215 l-5 12" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M463 206 l12 16" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M481 211 l-15 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M479 226 l-11 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M471 225 l3 18" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M419 500 l1 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M432 495 l5 14" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M408 501 l-20 1" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M427 510 l19 7" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M423 504 l15 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M422 477 l-4 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M422 486 l7 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M424 495 l-12 5" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M409 467 l-19 1" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M421 474 l-17 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M402 459 l14 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M412 461 l-14 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M417 463 l0 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M398 465 l2 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M397 452 l-6 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M401 445 l-8 14" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M406 453 l-9 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M406 456 l13 9" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M415 439 l18 8" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M415 440 l2 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M407 439 l13 8" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M400 434 l-3 18" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M391 418 l8 17" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M388 418 l10 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M398 422 l-7 18" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M404 403 l16 8" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M395 410 l19 3" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M400 395 l-18 2" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M393 387 l2 13" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M393 407 l11 13" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M399 395 l8 10" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M401 387 l-13 3" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M398 375 l-3 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M196 120 l15 12" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M206 107 l10 11" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M189 127 l-6 19" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M193 121 l2 14" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M207 138 l12 5" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M216 136 l17 2" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M212 125 l-7 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M200 132 l13 8" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M198 141 l-2 13" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M218 148 l-0 16" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M205 161 l18 4" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M205 160 l-13 10" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M204 156 l-6 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M211 162 l1 19" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M202 157 l2 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M212 165 l-7 9" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M211 180 l13 4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M207 176 l15 10" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M207 168 l3 19" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M221 180 l-2 19" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M211 183 l-5 9" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M233 181 l2 15" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M233 204 l-0 12" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M231 195 l-3 15" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M229 197 l3 16" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M238 193 l-9 17" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M234 203 l-1 20" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M238 205 l18 4" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M228 216 l-8 14" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 45 l8 6" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M496 45 l-10 1" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M489 58 l10 7" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M495 45 l8 12" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 66 l-15 8" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M499 71 l-10 3" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M493 68 l0 18" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M502 55 l7 13" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M493 65 l1 11" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M516 78 l5 17" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M503 80 l11 5" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M515 84 l-3 18" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M503 93 l-7 7" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M500 81 l-14 5" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<path d="M505 93 l-16 11" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<path d="M498 104 l11 5" stroke="#6B8A4A" stroke-width="3" stroke-linecap="round"/>
<path d="M511 102 l12 15" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<path d="M505 110 l-11 3" stroke="#5E7E40" stroke-width="3" stroke-linecap="round"/>
<g><ellipse cx="210" cy="120" rx="26" ry="14" fill="#4A3C26"/>
<path d="M190 117 l12 7 M204 111 l9 12 M214 115 l14 4 M198 125 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
</g>
<g><ellipse cx="690" cy="380" rx="26" ry="14" fill="#4A3C26"/>
<path d="M670 377 l12 7 M684 371 l9 12 M694 375 l14 4 M678 385 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
</g>
<g><ellipse cx="380" cy="540" rx="26" ry="14" fill="#4A3C26"/>
<path d="M360 537 l12 7 M374 531 l9 12 M384 535 l14 4 M368 545 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
</g>
<circle cx="60" cy="470" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="140" cy="520" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="680" cy="520" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="60" cy="30" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<circle cx="700" cy="120" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5" opacity="1"/>
<rect x="196" y="250" width="100" height="44" rx="12" fill="rgba(28, 28, 30, 0.9)"/>
<text x="246" y="279" text-anchor="middle" font-size="22" font-weight="700" fill="#0A84FF">Blött</text>
<circle cx="636" cy="250" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M627 250l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="520" y="184" width="190" height="40" rx="12" fill="#1C1C1E"/>
<text x="615" y="210" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Basväg på fastmark</text>
<rect x="100" y="500" width="210" height="40" rx="12" fill="#1C1C1E"/>
<text x="205" y="526" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Dike – kör inte längs</text>
<rect x="300" y="440" width="300" height="40" rx="12" fill="#1C1C1E"/>
<text x="450" y="466" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Jämn risbädd – samma väg ut</text>
<rect x="16" y="150" width="190" height="40" rx="12" fill="#1C1C1E"/>
<text x="111" y="176" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Rishögar i förväg</text>
<path d="M150 150 L190 132" stroke="#FFFFFF" stroke-width="2"/>
</svg>`,
  BLOTT_SKOTARE_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: spåren slog igenom svålen men skotaren körde vidare utan att risa, rishögen ligger oanvänd bredvid"><rect width="376" height="170" fill="#2A3324"/>
<path d="M-10 30 C100 10 260 20 386 40 V140 C260 160 100 150 -10 136Z" fill="rgba(10, 132, 255, 0.2)" stroke="#0A84FF" stroke-width="2.5"/>
<path d="M150 180 C160 120 150 80 164 30 M206 180 C216 120 206 80 220 30" fill="none" stroke="#4A3C26" stroke-width="22"/>
<path d="M150 180 C156 150 152 128 156 110 M206 180 C212 150 208 128 212 110" fill="none" stroke="#7FA05A" stroke-width="3" stroke-dasharray="3 5"/>
<path d="M156 110 C160 80 150 60 164 30 M212 110 C216 80 206 60 220 30" fill="none" stroke="#3A2E1E" stroke-width="26"/>
<path d="M156 110 C160 80 150 60 164 30 M212 110 C216 80 206 60 220 30" fill="none" stroke="#0A84FF" stroke-width="10" opacity="0.8"/>
<ellipse cx="290" cy="120" rx="30" ry="14" fill="#4A3C26"/>
<path d="M270 117 l12 7 M284 111 l9 12 M294 115 l14 4 M278 125 l18 -4" stroke="#7FA05A" stroke-width="3" stroke-linecap="round"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  BLOTT_REGLER: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 330" role="img" aria-label="Uppifrån: stickvägen slutar ca 10 meter från bäcken, kranen lägger virket bort från vattnet, diket korsas rakt över på en bro"><defs><marker id="blott_regler-mb" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="560" height="330" fill="#2A3324"/>
<path d="M0 40 C120 30 200 60 300 46 S480 30 560 44" fill="none" stroke="#0A84FF" stroke-width="18" opacity="0.7"/>
<path d="M0 98 C120 88 200 118 300 104 S480 88 560 102" fill="none" stroke="#0A84FF" stroke-width="2" stroke-dasharray="8 6" opacity="0.8"/>
<text x="16" y="28" font-size="14" font-weight="700" fill="#64B5FF">Bäck</text>
<path d="M200 330 V140" stroke="#4A3C26" stroke-width="34" stroke-linecap="round"/>
<path d="M200 330 V140" stroke="rgba(255, 255, 255, 0.4)" stroke-width="4" stroke-dasharray="10 8"/>
<path d="M176 134 H224" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<line x1="244" y1="132" x2="244" y2="56" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#blott_regler-mb)" marker-end="url(#blott_regler-mb)"/>
<rect x="254" y="74" width="92" height="32" rx="9" fill="#1C1C1E"/>
<text x="300" y="96" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFFFF">ca 10 m</text>
<path d="M200 150 Q150 150 110 200" fill="none" stroke="#FFD60A" stroke-width="3" stroke-dasharray="6 5"/>
<rect x="66" y="200" width="70" height="12" rx="6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="70" y="214" width="70" height="12" rx="6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2"/>
<rect x="20" y="236" width="150" height="32" rx="9" fill="#1C1C1E"/>
<text x="95" y="258" text-anchor="middle" font-size="14" font-weight="700" fill="#FFFFFF">Virket bort från vattnet</text>
<path d="M420 120 V330" stroke="#0A84FF" stroke-width="10" opacity="0.6"/>
<path d="M300 240 H540" stroke="rgba(255, 255, 255, 0.1)" stroke-width="40"/>
<path d="M300 226 H540 M300 254 H540" stroke="rgba(255, 255, 255, 0.4)" stroke-width="4" stroke-dasharray="12 8"/>
<rect x="398" y="216" width="44" height="48" rx="4" fill="#8E8E93" stroke="#1A1A18" stroke-width="2"/>
<path d="M404 216V264 M436 216V264" stroke="#1A1A18" stroke-width="2"/>
<circle cx="420" cy="190" r="14" fill="#30D158" stroke="#FFFFFF" stroke-width="2.5"/>
<path d="M414 190l4 4 8-9" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="356" y="280" width="160" height="32" rx="9" fill="#1C1C1E"/>
<text x="436" y="302" text-anchor="middle" font-size="14" font-weight="700" fill="#FFFFFF">Dike: rakt över, på bro</text>
</svg>`,
  EVIGHETSTRAD: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Evighetsträd sedda uppifrån: en grupp grova träd står kvar, stickvägen går utanför kronorna, omkringliggande träd är fällda bort från gruppen"><defs><pattern id="evighetstrad-markE" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="evighetstrad-pilE" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect x="0" y="0" width="720" height="560" fill="#2A3324"/>
<rect x="0" y="0" width="720" height="560" fill="url(#evighetstrad-markE)"/>
<ellipse cx="300" cy="280" rx="190" ry="165" fill="rgba(48, 209, 88, 0.1)" stroke="#30D158" stroke-width="2.5" stroke-dasharray="10 8"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<circle cx="250" cy="200" r="46" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="250" cy="200" r="21" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="350" cy="230" r="52" fill="#FF9F0A" stroke="#7A4A00" stroke-width="2.5"/>
<circle cx="350" cy="230" r="23" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="230" cy="310" r="40" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="230" cy="310" r="18" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="330" cy="340" r="44" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="340" r="20" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="410" cy="300" r="34" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="410" cy="300" r="15" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="180" cy="240" r="30" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="180" cy="240" r="14" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="290" cy="400" r="32" fill="#FF9F0A" stroke="#7A4A00" stroke-width="2.5"/>
<circle cx="290" cy="400" r="14" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="2"/>
<circle cx="100" cy="130" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="100" y1="130" x2="60" y2="90" stroke="#FFFFFF" stroke-width="3" marker-end="url(#evighetstrad-pilE)" opacity="0.9"/>
<circle cx="470" cy="120" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="470" y1="120" x2="510" y2="80" stroke="#FFFFFF" stroke-width="3" marker-end="url(#evighetstrad-pilE)" opacity="0.9"/>
<circle cx="110" cy="420" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="110" y1="420" x2="70" y2="460" stroke="#FFFFFF" stroke-width="3" marker-end="url(#evighetstrad-pilE)" opacity="0.9"/>
<circle cx="480" cy="420" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="480" y1="420" x2="520" y2="470" stroke="#FFFFFF" stroke-width="3" marker-end="url(#evighetstrad-pilE)" opacity="0.9"/>
<circle cx="60" cy="290" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="60" y1="290" x2="20" y2="290" stroke="#FFFFFF" stroke-width="3" marker-end="url(#evighetstrad-pilE)" opacity="0.9"/>
<circle cx="300" cy="470" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="300" y1="470" x2="300" y2="520" stroke="#FFFFFF" stroke-width="3" marker-end="url(#evighetstrad-pilE)" opacity="0.9"/>
<rect x="612" y="12" width="96" height="36" rx="10" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="214" height="40" rx="12" fill="#1C1C1E"/>
<text x="577" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Utanför kronorna</text>
<rect x="180" y="58" width="240" height="40" rx="12" fill="#1C1C1E"/>
<text x="300" y="84" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Grupp om 5–7 grova träd</text>
<rect x="340" y="496" width="168" height="40" rx="12" fill="#1C1C1E"/>
<text x="424" y="522" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Ingen barkskada</text>
<rect x="16" y="500" width="250" height="40" rx="12" fill="#1C1C1E"/>
<text x="141" y="526" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fällt bort från gruppen</text>
<rect x="20" y="20" width="96" height="30" rx="9" fill="#1C1C1E"/>
<circle cx="38" cy="35" r="8" fill="#FF9F0A"/>
<text x="74" y="41" text-anchor="middle" font-size="14" font-weight="700" fill="#FFFFFF">Tall</text>
</svg>`,
  EVIGHETSTRAD_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: ett träd är fällt rakt in i gruppen med evighetsträd och har brutit grenar"><rect width="376" height="170" fill="#2A3324"/>
<circle cx="120" cy="80" r="30" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="176" cy="104" r="34" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="226" cy="70" r="26" fill="#FF9F0A" stroke="#7A4A00" stroke-width="2.5"/>
<circle cx="300" cy="150" r="7" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<rect x="120" y="92" width="190" height="14" rx="7" fill="#B08A5A" stroke="#1A1A18" stroke-width="2" transform="rotate(22 300 150)"/>
<path d="M150 70l-18 -14 M140 84l-22 -4 M166 60l-6 -20 M130 98l-16 10" stroke="#5E7E40" stroke-width="5" stroke-linecap="round"/>
<path d="M160 116l-14 22 M196 92l18 -12" stroke="#F2E6CF" stroke-width="5" stroke-linecap="round"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  HOGSTUBBE: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Högstubbar från sidan: tre lövstubbar minst 3 meter höga, rent kapade, i grupp intill evighetsträden, toppen ligger i hänsynen i solen"><defs><marker id="hogstubbe-mH" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="720" height="560" fill="#24323A"/>
<path d="M0 470 C160 460 360 478 720 466 V560 H0Z" fill="#2E3A27"/>
<rect x="560" y="200" width="18" height="272" fill="#6E5A3E"/>
<circle cx="569" cy="170" r="70" fill="#24A148" stroke="#0E3B1C" stroke-width="3"/>
<rect x="650" y="230" width="16" height="240" fill="#6E5A3E"/>
<circle cx="658" cy="190" r="56" fill="#FF9F0A" stroke="#7A4A00" stroke-width="3"/>
<g><rect x="470" y="446" width="200" height="20" rx="10" fill="#EDEDE6" stroke="#1A1A18" stroke-width="2.5" transform="rotate(-3 570 456)"/>
<path d="M486 452h10 M520 458h12 M560 452h10 M600 456h8" stroke="#1A1A18" stroke-width="3" stroke-linecap="round"/>
<path d="M640 446 l22 -22 M650 448 l26 -8 M630 446 l8 -26 M656 456 l24 8" stroke="#5E7E40" stroke-width="4" stroke-linecap="round"/>
<circle cx="440" cy="60" r="26" fill="#FFD60A"/>
</g>
<rect x="200" y="262" width="34" height="210" fill="#EDEDE6" stroke="#1A1A18" stroke-width="2.5"/>
<path d="M204 300h12 M220 330h10 M206 368h16 M214 410h12 M204 440h8" stroke="#1A1A18" stroke-width="4" stroke-linecap="round"/>
<ellipse cx="217" cy="262" rx="17" ry="6" fill="#F2E6CF" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="300" y="250" width="38" height="222" fill="#8E978A" stroke="#1A1A18" stroke-width="2.5"/>
<path d="M306 290v14 M326 340v10 M310 400v12" stroke="#5C6458" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="319" cy="250" rx="19" ry="6.5" fill="#F2E6CF" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="410" y="270" width="32" height="202" fill="#EDEDE6" stroke="#1A1A18" stroke-width="2.5"/>
<path d="M414 310h10 M428 350h10 M416 392h14 M412 432h10" stroke="#1A1A18" stroke-width="4" stroke-linecap="round"/>
<ellipse cx="426" cy="270" rx="16" ry="5.5" fill="#F2E6CF" stroke="#1A1A18" stroke-width="2.5"/>
<line x1="150" y1="470" x2="150" y2="282" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#hogstubbe-mH)" marker-end="url(#hogstubbe-mH)"/>
<path d="M150 282 H196" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="4 4"/>
<rect x="30" y="360" width="110" height="36" rx="10" fill="#1C1C1E"/>
<text x="85" y="384" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">minst 3 m</text>
<circle cx="319" cy="214" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M310 214l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="250" y="150" width="140" height="40" rx="12" fill="#1C1C1E"/>
<text x="320" y="176" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kapat rent</text>
<rect x="196" y="494" width="248" height="40" rx="12" fill="#1C1C1E"/>
<text x="320" y="520" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Björk och asp först</text>
<rect x="480" y="494" width="226" height="40" rx="12" fill="#1C1C1E"/>
<text x="593" y="520" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Toppen i hänsynen, i sol</text>
</svg>`,
  HOGSTUBBE_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: högstubben är bara cirka 1,5 meter hög"><defs><marker id="hogstubbe-mH2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="376" height="170" fill="#24323A"/>
<path d="M0 140 C120 136 250 144 376 138 V170 H0Z" fill="#2E3A27"/>
<rect x="170" y="94" width="30" height="48" fill="#EDEDE6" stroke="#1A1A18" stroke-width="2"/>
<path d="M174 112h10 M186 128h8" stroke="#1A1A18" stroke-width="3" stroke-linecap="round"/>
<path d="M170 94 l8 -10 l6 8 l8 -12 l8 14" fill="#F2E6CF" stroke="#1A1A18" stroke-width="2"/>
<line x1="140" y1="140" x2="140" y2="88" stroke="#FFFFFF" stroke-width="2" marker-start="url(#hogstubbe-mH2)" marker-end="url(#hogstubbe-mH2)"/>
<text x="96" y="120" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFFFF">1,5 m</text>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  NATURHORNA: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Naturhörna sedd uppifrån: block, lågor, buskar och träd lämnade orörda, stickvägen går runt och träden runt om är fällda bort"><defs><pattern id="naturhorna-mkN" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="naturhorna-plN" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="720" height="560" fill="#2A3324"/>
<rect width="720" height="560" fill="url(#naturhorna-mkN)"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<rect x="612" y="12" width="96" height="36" rx="12" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<ellipse cx="300" cy="280" rx="150" ry="130" fill="rgba(48, 209, 88, 0.1)" stroke="#30D158" stroke-width="2.5" stroke-dasharray="10 8"/>
<path d="M250 300 C270 260 330 250 350 290 C360 320 310 340 280 330 Z" fill="#8E8E86" stroke="#1A1A18" stroke-width="3"/>
<rect x="200" y="210" width="130" height="14" rx="7" fill="#7A6A50" stroke="#1A1A18" stroke-width="2" transform="rotate(-20 265 217)"/>
<rect x="300" y="350" width="110" height="13" rx="6.5" fill="#7A6A50" stroke="#1A1A18" stroke-width="2" transform="rotate(14 355 356)"/>
<circle cx="220" cy="190" r="26" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="360" cy="200" r="30" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="390" cy="300" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="230" cy="360" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="390" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="200" cy="300" r="16" fill="#5E7E40" stroke="#0E3B1C" stroke-width="2"/>
<circle cx="410" cy="360" r="14" fill="#5E7E40" stroke="#0E3B1C" stroke-width="2"/>
<circle cx="120" cy="140" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="120" y1="140" x2="80" y2="100" stroke="#FFFFFF" stroke-width="3" marker-end="url(#naturhorna-plN)" opacity="0.9"/>
<circle cx="470" cy="150" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="470" y1="150" x2="510" y2="110" stroke="#FFFFFF" stroke-width="3" marker-end="url(#naturhorna-plN)" opacity="0.9"/>
<circle cx="110" cy="420" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="110" y1="420" x2="70" y2="460" stroke="#FFFFFF" stroke-width="3" marker-end="url(#naturhorna-plN)" opacity="0.9"/>
<circle cx="470" cy="420" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="470" y1="420" x2="510" y2="460" stroke="#FFFFFF" stroke-width="3" marker-end="url(#naturhorna-plN)" opacity="0.9"/>
<circle cx="300" cy="110" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="300" y1="110" x2="300" y2="60" stroke="#FFFFFF" stroke-width="3" marker-end="url(#naturhorna-plN)" opacity="0.9"/>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="200" height="40" rx="12" fill="#1C1C1E"/>
<text x="570" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kör runt – inte genom</text>
<rect x="190" y="440" width="220" height="40" rx="12" fill="#1C1C1E"/>
<text x="300" y="466" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Allt orört i hörnan</text>
<rect x="20" y="20" width="170" height="40" rx="12" fill="#1C1C1E"/>
<text x="105" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Block och lågor</text>
<path d="M150 60 L230 210" stroke="#FFFFFF" stroke-width="2"/>
<rect x="16" y="500" width="250" height="40" rx="12" fill="#1C1C1E"/>
<text x="141" y="526" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fällt bort från hörnan</text>
</svg>`,
  NATURHORNA_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: maskinen har kört genom naturhörnan och kört sönder lågorna"><rect width="376" height="170" fill="#2A3324"/>
<ellipse cx="170" cy="86" rx="110" ry="70" fill="rgba(48, 209, 88, 0.1)" stroke="#30D158" stroke-width="2" stroke-dasharray="8 6"/>
<path d="M-10 60 C120 70 250 70 386 56 M-10 110 C120 120 250 120 386 104" fill="none" stroke="#5A4A30" stroke-width="16" opacity="0.9"/>
<path d="M-10 60 C120 70 250 70 386 56 M-10 110 C120 120 250 120 386 104" fill="none" stroke="#3E3324" stroke-width="3" stroke-dasharray="6 6"/>
<rect x="110" y="40" width="80" height="11" rx="5" fill="#7A6A50" stroke="#1A1A18" stroke-width="2" transform="rotate(30 150 45)"/>
<rect x="150" y="88" width="60" height="11" rx="5" fill="#7A6A50" stroke="#1A1A18" stroke-width="2" transform="rotate(-40 180 93)"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  NYCKELBIOTOP: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Nyckelbiotop sedd uppifrån: den snedstreckade biotopen omges av en kantzon på 5 till 10 meter där träden står kvar, stickvägen går utanför kantzonen"><defs><pattern id="nyckelbiotop-mkNy" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="nyckelbiotop-plNy" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
<pattern id="nyckelbiotop-stNy" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="rgba(48, 209, 88, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="18" stroke="#30D158" stroke-width="3" opacity="0.6"/>
</pattern>
</defs>
<rect width="720" height="560" fill="#2A3324"/>
<rect width="720" height="560" fill="url(#nyckelbiotop-mkNy)"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<rect x="612" y="12" width="96" height="36" rx="12" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<path d="M30 70 C150 20 330 30 420 90 C490 150 490 270 450 350 C410 440 300 500 180 490 C70 480 10 400 10 280 C10 180 0 110 30 70Z" fill="rgba(48, 209, 88, 0.1)" stroke="#30D158" stroke-width="2" stroke-dasharray="6 6"/>
<path d="M80 120 C160 80 300 90 370 140 C420 190 420 270 390 330 C360 400 280 440 190 430 C110 420 60 360 60 280 C60 200 50 150 80 120Z" fill="url(#nyckelbiotop-stNy)" stroke="#30D158" stroke-width="4"/>
<circle cx="140" cy="170" r="22" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="250" cy="140" r="24" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="180" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="130" cy="300" r="22" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="230" cy="380" r="24" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="320" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="240" cy="260" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="170" cy="220" r="16" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="40" cy="250" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="70" cy="440" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="470" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="440" cy="190" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="460" cy="320" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="200" cy="50" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="380" cy="60" r="16" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<rect x="160" y="246" width="170" height="44" rx="12" fill="rgba(28, 28, 30, 0.9)"/>
<text x="245" y="275" text-anchor="middle" font-size="22" font-weight="700" fill="#30D158">Nyckelbiotop</text>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="214" height="40" rx="12" fill="#1C1C1E"/>
<text x="577" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Utanför kantzonen</text>
<rect x="470" y="420" width="236" height="40" rx="12" fill="#1C1C1E"/>
<text x="588" y="446" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kantzon 5–10 m står kvar</text>
<path d="M470 440 L452 400" stroke="#FFFFFF" stroke-width="2"/>
</svg>`,
  NYCKELBIOTOP_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: kantzonen är avverkad ända in till biotopens kant"><rect width="376" height="170" fill="#2A3324"/>
<defs><pattern id="nyckelbiotop-stF" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="rgba(48, 209, 88, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="14" stroke="#30D158" stroke-width="2.5" opacity="0.6"/>
</pattern>
</defs>
<path d="M-10 -10 H200 C230 50 220 120 190 180 H-10Z" fill="url(#nyckelbiotop-stF)" stroke="#30D158" stroke-width="3"/>
<circle cx="220" cy="30" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="235" cy="80" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="225" cy="130" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="250" cy="50" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="260" cy="110" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="245" cy="160" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="280" cy="80" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="80" cy="60" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2"/>
<circle cx="120" cy="130" r="16" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  KULTURMILJO: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Kulturmiljö sedd uppifrån: torplämning med husgrund, jordkällare, fruktträd, vårdträd och syren, kulturstubbar runt om och stickvägen utanför"><defs><pattern id="kulturmiljo-mkK" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="kulturmiljo-plK" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="720" height="560" fill="#2A3324"/>
<rect width="720" height="560" fill="url(#kulturmiljo-mkK)"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<rect x="612" y="12" width="96" height="36" rx="12" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<ellipse cx="290" cy="280" rx="200" ry="175" fill="rgba(181, 101, 29, 0.1)"/>
<circle cx="486" cy="315" r="9" fill="#1A1A18"/>
<circle cx="486" cy="315" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="486" cy="315" r="5" fill="#C9A77A"/>
<circle cx="449" cy="386" r="9" fill="#1A1A18"/>
<circle cx="449" cy="386" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="449" cy="386" r="5" fill="#C9A77A"/>
<circle cx="381" cy="436" r="9" fill="#1A1A18"/>
<circle cx="381" cy="436" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="381" cy="436" r="5" fill="#C9A77A"/>
<circle cx="295" cy="455" r="9" fill="#1A1A18"/>
<circle cx="295" cy="455" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="295" cy="455" r="5" fill="#C9A77A"/>
<circle cx="208" cy="439" r="9" fill="#1A1A18"/>
<circle cx="208" cy="439" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="208" cy="439" r="5" fill="#C9A77A"/>
<circle cx="137" cy="392" r="9" fill="#1A1A18"/>
<circle cx="137" cy="392" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="137" cy="392" r="5" fill="#C9A77A"/>
<circle cx="96" cy="323" r="9" fill="#1A1A18"/>
<circle cx="96" cy="323" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="96" cy="323" r="5" fill="#C9A77A"/>
<circle cx="94" cy="245" r="9" fill="#1A1A18"/>
<circle cx="94" cy="245" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="94" cy="245" r="5" fill="#C9A77A"/>
<circle cx="131" cy="174" r="9" fill="#1A1A18"/>
<circle cx="131" cy="174" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="131" cy="174" r="5" fill="#C9A77A"/>
<circle cx="199" cy="124" r="9" fill="#1A1A18"/>
<circle cx="199" cy="124" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="199" cy="124" r="5" fill="#C9A77A"/>
<circle cx="285" cy="105" r="9" fill="#1A1A18"/>
<circle cx="285" cy="105" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="285" cy="105" r="5" fill="#C9A77A"/>
<circle cx="372" cy="121" r="9" fill="#1A1A18"/>
<circle cx="372" cy="121" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="372" cy="121" r="5" fill="#C9A77A"/>
<circle cx="443" cy="168" r="9" fill="#1A1A18"/>
<circle cx="443" cy="168" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="443" cy="168" r="5" fill="#C9A77A"/>
<circle cx="484" cy="237" r="9" fill="#1A1A18"/>
<circle cx="484" cy="237" r="9" fill="none" stroke="#FFD60A" stroke-width="4" stroke-dasharray="5 4"/>
<circle cx="484" cy="237" r="5" fill="#C9A77A"/>
<rect x="210" y="230" width="140" height="100" fill="none" stroke="#A3A39B" stroke-width="14" stroke-dasharray="14 4"/>
<path d="M380 190 a26 26 0 1 1 0.1 0" fill="#4A4436" stroke="#A3A39B" stroke-width="6"/>
<circle cx="180" cy="180" r="34" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="170" cy="172" r="4" fill="#FF6961"/>
<circle cx="190" cy="186" r="4" fill="#FF6961"/>
<circle cx="178" cy="192" r="4" fill="#FF6961"/>
<circle cx="390" cy="370" r="22" fill="#AF52DE" opacity="0.8"/>
<circle cx="408" cy="356" r="16" fill="#BF5AF2" opacity="0.8"/>
<circle cx="200" cy="380" r="46" fill="#24A148" stroke="#0E3B1C" stroke-width="3"/>
<circle cx="80" cy="110" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="80" y1="110" x2="40" y2="70" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturmiljo-plK)" opacity="0.9"/>
<circle cx="500" cy="110" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="500" y1="110" x2="530" y2="70" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturmiljo-plK)" opacity="0.9"/>
<circle cx="80" cy="460" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="80" y1="460" x2="40" y2="500" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturmiljo-plK)" opacity="0.9"/>
<circle cx="500" cy="460" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="500" y1="460" x2="530" y2="500" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kulturmiljo-plK)" opacity="0.9"/>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="236" height="40" rx="12" fill="#1C1C1E"/>
<text x="588" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Utanför kulturstubbarna</text>
<rect x="200" y="186" width="180" height="40" rx="12" fill="#1C1C1E"/>
<text x="290" y="212" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Husgrund fri</text>
<rect x="20" y="20" width="240" height="40" rx="12" fill="#1C1C1E"/>
<text x="140" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Vårdträd och fruktträd</text>
<path d="M140 60 L170 140" stroke="#FFFFFF" stroke-width="2"/>
<rect x="300" y="450" width="110" height="40" rx="12" fill="#1C1C1E"/>
<text x="355" y="476" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Syren</text>
<path d="M360 450 L388 394" stroke="#FFFFFF" stroke-width="2"/>
</svg>`,
  KULTURMILJO_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: fruktträdet är fällt och riset ligger på husgrunden"><rect width="376" height="170" fill="#2A3324"/>
<rect x="40" y="60" width="110" height="80" fill="none" stroke="#A3A39B" stroke-width="10" stroke-dasharray="10 4"/>
<path d="M50 80l20 12 M70 70l8 22 M100 100l22 -8 M120 110l12 14 M60 120l20 6 M130 80l14 10" stroke="#8B6A44" stroke-width="3" stroke-linecap="round"/>
<circle cx="230" cy="110" r="10" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<rect x="140" y="100" width="90" height="16" rx="8" fill="#B08A5A" stroke="#1A1A18" stroke-width="2" transform="rotate(10 230 110)"/>
<circle cx="140" cy="100" r="5" fill="#FF6961"/>
<circle cx="150" cy="110" r="5" fill="#FF6961"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  FORNLAMNING: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Fornlämning sedd uppifrån: det snedstreckade villkorsområdet med fångstgropar är snitslat i ytterkanten, stickvägen går utanför och ingenting är fällt in i området"><defs><pattern id="fornlamning-mkF" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="fornlamning-plF" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
<pattern id="fornlamning-stFo" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="rgba(181, 101, 29, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="18" stroke="#B5651D" stroke-width="3" opacity="0.6"/>
</pattern>
</defs>
<rect width="720" height="560" fill="#2A3324"/>
<rect width="720" height="560" fill="url(#fornlamning-mkF)"/>
<path d="M560 0 C560 120 590 200 590 280 C590 360 560 440 560 560" fill="none" stroke="rgba(255, 255, 255, 0.1)" stroke-width="64"/>
<path d="M540 0 C540 120 570 200 570 280 C570 360 540 440 540 560 M580 0 C580 120 610 200 610 280 C610 360 580 440 580 560" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="5" stroke-dasharray="14 10"/>
<rect x="612" y="12" width="96" height="36" rx="12" fill="#1C1C1E"/>
<text x="660" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">Stickväg</text>
<path d="M60 90 C170 40 350 50 430 110 C490 170 480 300 440 370 C390 450 280 490 170 470 C70 450 30 370 30 270 C30 180 30 120 60 90Z" fill="url(#fornlamning-stFo)" stroke="#B5651D" stroke-width="4"/>
<path d="M60 90 C170 40 350 50 430 110 C490 170 480 300 440 370 C390 450 280 490 170 470 C70 450 30 370 30 270 C30 180 30 120 60 90Z" fill="none" stroke="#FFD60A" stroke-width="3" stroke-dasharray="4 18" transform="translate(0 0)"/>
<circle cx="250" cy="270" r="50" fill="#1F241B" stroke="#6E6450" stroke-width="10"/>
<circle cx="350" cy="210" r="30" fill="#1F241B" stroke="#6E6450" stroke-width="8"/>
<rect x="160" y="320" width="180" height="44" rx="12" fill="rgba(28, 28, 30, 0.9)"/>
<text x="250" y="349" text-anchor="middle" font-size="22" font-weight="700" fill="#E0A060">Fornlämning</text>
<circle cx="500" cy="80" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="500" y1="80" x2="540" y2="40" stroke="#FFFFFF" stroke-width="3" marker-end="url(#fornlamning-plF)" opacity="0.9"/>
<circle cx="500" cy="480" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="500" y1="480" x2="540" y2="520" stroke="#FFFFFF" stroke-width="3" marker-end="url(#fornlamning-plF)" opacity="0.9"/>
<circle cx="20" cy="500" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="20" y1="500" x2="0" y2="540" stroke="#FFFFFF" stroke-width="3" marker-end="url(#fornlamning-plF)" opacity="0.9"/>
<circle cx="590" cy="280" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M581 280l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="470" y="312" width="214" height="40" rx="12" fill="#1C1C1E"/>
<text x="577" y="338" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Utanför snitslingen</text>
<rect x="20" y="20" width="232" height="40" rx="12" fill="#1C1C1E"/>
<text x="136" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Länsstyrelsens gräns</text>
<path d="M140 60 L150 74" stroke="#FFFFFF" stroke-width="2"/>
<rect x="160" y="140" width="170" height="40" rx="12" fill="#1C1C1E"/>
<text x="245" y="166" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fångstgropar</text>
<path d="M300 180 L330 196" stroke="#FFFFFF" stroke-width="2"/>
</svg>`,
  FORNLAMNING_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: hjulspår går rakt över villkorsområdet och fångstgropen"><rect width="376" height="170" fill="#2A3324"/>
<defs><pattern id="fornlamning-stFF" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="rgba(181, 101, 29, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="14" stroke="#B5651D" stroke-width="2.5" opacity="0.6"/>
</pattern>
</defs>
<path d="M-10 -10 H260 C290 60 270 130 250 180 H-10Z" fill="url(#fornlamning-stFF)" stroke="#B5651D" stroke-width="3"/>
<circle cx="120" cy="86" r="30" fill="#1F241B" stroke="#6E6450" stroke-width="7"/>
<path d="M-10 60 C120 70 250 70 386 56 M-10 110 C120 120 250 120 386 104" fill="none" stroke="#5A4A30" stroke-width="16" opacity="0.9"/>
<path d="M-10 60 C120 70 250 70 386 56 M-10 110 C120 120 250 120 386 104" fill="none" stroke="#3E3324" stroke-width="3" stroke-dasharray="6 6"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  KANTZON: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Kantzon mot sjö sedd uppifrån: en snedstreckad zon på 10 meter längs stranden där träd och buskar står kvar, stickvägen slutar vid zonens kant och träden utanför är fällda bort från vattnet"><defs><pattern id="kantzon-mkKz" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="kantzon-plKz" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
<pattern id="kantzon-stKz" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="rgba(10, 132, 255, 0.1)"/>
<line x1="0" y1="0" x2="0" y2="18" stroke="#0A84FF" stroke-width="3" opacity="0.6"/>
</pattern>
<marker id="kantzon-mz" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="720" height="560" fill="#2A3324"/>
<rect width="720" height="560" fill="url(#kantzon-mkKz)"/>
<path d="M0 0 H180 C220 120 160 220 200 330 C230 420 190 500 210 560 H0Z" fill="#0A3D73"/>
<path d="M180 0 C220 120 160 220 200 330 C230 420 190 500 210 560 H330 C310 500 350 420 320 330 C280 220 340 120 300 0Z" fill="url(#kantzon-stKz)" stroke="#0A84FF" stroke-width="3"/>
<text x="70" y="290" text-anchor="middle" font-size="22" font-weight="700" fill="#64B5FF">Sjö</text>
<circle cx="240" cy="70" r="22" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="270" cy="170" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="235" cy="250" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="270" cy="350" r="24" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="250" cy="440" r="18" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="275" cy="520" r="20" fill="#1E7A3A" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="245" cy="120" r="14" fill="#5E7E40"/>
<circle cx="255" cy="300" r="12" fill="#5E7E40"/>
<circle cx="240" cy="480" r="13" fill="#5E7E40"/>
<path d="M720 280 H380" stroke="#4A3C26" stroke-width="34"/>
<path d="M720 280 H380" stroke="rgba(255, 255, 255, 0.4)" stroke-width="4" stroke-dasharray="10 8"/>
<path d="M380 256 V304" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
<circle cx="400" cy="120" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="400" y1="120" x2="450" y2="90" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kantzon-plKz)" opacity="0.9"/>
<circle cx="420" cy="200" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="420" y1="200" x2="470" y2="180" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kantzon-plKz)" opacity="0.9"/>
<circle cx="400" cy="380" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="400" y1="380" x2="450" y2="400" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kantzon-plKz)" opacity="0.9"/>
<circle cx="420" cy="460" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="420" y1="460" x2="470" y2="490" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kantzon-plKz)" opacity="0.9"/>
<circle cx="500" cy="60" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<line x1="500" y1="60" x2="540" y2="40" stroke="#FFFFFF" stroke-width="3" marker-end="url(#kantzon-plKz)" opacity="0.9"/>
<line x1="210" y1="200" x2="320" y2="200" stroke="#FFFFFF" stroke-width="2.5" marker-start="url(#kantzon-mz)" marker-end="url(#kantzon-mz)"/>
<rect x="226" y="208" width="80" height="30" rx="9" fill="#1C1C1E"/>
<text x="266" y="229" text-anchor="middle" font-size="15" font-weight="700" fill="#FFFFFF">10 m</text>
<circle cx="380" cy="230" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M371 240l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="420" y="300" width="280" height="40" rx="12" fill="#1C1C1E"/>
<text x="560" y="326" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Stickvägen slutar vid kantzonen</text>
<rect x="350" y="520" width="250" height="40" rx="12" fill="#1C1C1E"/>
<text x="475" y="546" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Fällt bort från vattnet</text>
<rect x="330" y="20" width="230" height="40" rx="12" fill="#1C1C1E"/>
<text x="445" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Kantzon – träden står kvar</text>
<path d="M330 40 L300 60" stroke="#FFFFFF" stroke-width="2"/>
</svg>`,
  KANTZON_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: avverkat ända ner till strandkanten och hjulspår leder slam ut i sjön"><rect width="376" height="170" fill="#2A3324"/>
<path d="M0 0 H90 C110 60 80 120 100 170 H0Z" fill="#0A3D73"/>
<circle cx="120" cy="30" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="130" cy="90" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="115" cy="140" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="160" cy="60" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<circle cx="170" cy="120" r="6" fill="#C9A77A" stroke="#1A1A18" stroke-width="2"/>
<path d="M300 60 C220 70 150 80 104 92 M300 110 C220 118 160 124 110 136" fill="none" stroke="#5A4A30" stroke-width="16" opacity="0.9"/>
<path d="M100 92 C80 96 60 100 40 96 M108 136 C88 140 60 146 40 150" fill="none" stroke="#8B7A55" stroke-width="10" opacity="0.7"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
  VATTENSKYDD: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 560" role="img" aria-label="Vattenskyddsområde sett uppifrån: skotaren arbetar inne i området med saneringsutrustning framme, tankning och uppställning sker utanför områdets gräns vid vägen"><defs><pattern id="vattenskydd-mkVs" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="10" r="1.6" fill="#3A4531"/>
<circle cx="28" cy="30" r="1.4" fill="#3A4531"/>
<circle cx="30" cy="8" r="1" fill="#46523A"/>
</pattern>
<marker id="vattenskydd-plVs" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#FFFFFF"/>
</marker>
</defs>
<rect width="720" height="560" fill="#2A3324"/>
<rect width="720" height="560" fill="url(#vattenskydd-mkVs)"/>
<path d="M0 0 H470 C500 140 450 300 480 400 C500 470 470 520 480 560 H0Z" fill="rgba(10, 132, 255, 0.1)" stroke="#0A84FF" stroke-width="4" stroke-dasharray="16 10"/>
<rect x="20" y="20" width="300" height="40" rx="12" fill="#1C1C1E"/>
<text x="170" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="#64B5FF">Vattenskyddsområde · primär zon</text>
<circle cx="80" cy="140" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="200" cy="110" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="380" cy="150" r="22" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="60" cy="420" r="20" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="330" cy="470" r="24" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<circle cx="420" cy="300" r="18" fill="#24A148" stroke="#0E3B1C" stroke-width="2.5"/>
<path d="M260 560 V200" stroke="rgba(255, 255, 255, 0.1)" stroke-width="56"/>
<path d="M246 560 V200 M274 560 V200" stroke="rgba(255, 255, 255, 0.4)" stroke-width="4" stroke-dasharray="12 8"/>
<g transform="translate(260 300) rotate(90)"><rect x="-60" y="-22" width="58" height="44" rx="8" fill="#F2C94C" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="2" y="-24" width="70" height="48" rx="6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="-52" y="-14" width="22" height="28" rx="4" fill="#1C1C1E"/>
<path d="M8 -16h58 M8 -6h58 M8 4h58 M8 14h58" stroke="#8B6A44" stroke-width="3"/>
</g>
<g transform="translate(300 250)"><rect x="0" y="0" width="34" height="30" rx="6" fill="#FFD60A" stroke="#1A1A18" stroke-width="2"/>
<path d="M8 15h18 M17 6v18" stroke="#1A1A18" stroke-width="3"/>
</g>
<rect x="340" y="246" width="200" height="40" rx="12" fill="#1C1C1E"/>
<text x="440" y="272" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Saneringskit framme</text>
<path d="M560 560 C560 420 600 300 600 0" fill="none" stroke="#5A5444" stroke-width="44"/>
<rect x="610" y="120" width="70" height="40" rx="6" fill="#8E8E93" stroke="#1A1A18" stroke-width="2"/>
<text x="645" y="146" text-anchor="middle" font-size="14" font-weight="700" fill="#1A1A18">Diesel</text>
<g transform="translate(620 330) rotate(-90)"><rect x="-60" y="-22" width="58" height="44" rx="8" fill="#C9A227" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="2" y="-24" width="70" height="48" rx="6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="-52" y="-14" width="22" height="28" rx="4" fill="#1C1C1E"/>
<path d="M8 -16h58 M8 -6h58 M8 4h58 M8 14h58" stroke="#8B6A44" stroke-width="3"/>
</g>
<circle cx="600" cy="230" r="20" fill="#30D158" stroke="#FFFFFF" stroke-width="3"/>
<path d="M591 230l6 6 12-13" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="490" y="420" width="220" height="40" rx="12" fill="#1C1C1E"/>
<text x="600" y="446" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">Tanka och ställ upp här</text>
<rect x="500" y="470" width="200" height="40" rx="12" fill="#1C1C1E"/>
<text x="600" y="496" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">– utanför området</text>
</svg>`,
  VATTENSKYDD_FEL: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 376 170" role="img" aria-label="Fel: maskinen läcker olja inne i vattenskyddsområdet och oljan rinner ut på marken"><rect width="376" height="170" fill="#2A3324"/>
<rect width="376" height="170" fill="rgba(10, 132, 255, 0.1)"/>
<g transform="translate(150 80) rotate(10)"><rect x="-60" y="-22" width="58" height="44" rx="8" fill="#F2C94C" stroke="#1A1A18" stroke-width="2.5"/>
<rect x="2" y="-24" width="70" height="48" rx="6" fill="#D9B98A" stroke="#1A1A18" stroke-width="2.5"/>
</g>
<path d="M110 110 C100 130 130 150 90 160 C60 168 40 150 60 136 C80 124 70 112 110 110Z" fill="#1A1A18" opacity="0.9"/>
<path d="M95 120 C88 132 104 142 82 150" fill="none" stroke="#5E5CE6" stroke-width="3" opacity="0.7"/>
<circle cx="336" cy="36" r="22" fill="#E5342B" stroke="#FFFFFF" stroke-width="3"/>
<path d="M327 27l18 18 M345 27l-18 18" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
</svg>`,
} as const;

// =================================================================================================================================
// INNEHÅLL
// =================================================================================================================================

const AVLAGG_REGLER: Regelsida = {
  titel: 'Avlägg – alla regler',
  underrubrik: 'Från sidan, vägen till vänster',
  bild: BILD.AVLAGG_REGLER,
  block: [
    { slag: 'grupp', rubrik: 'Traven', rader: [
      { text: 'Höjd över vägbanan', varde: 'max 4,5 m' },
      { text: 'Bredd', varde: 'max 6 m' },
      { text: 'Kortaste bit', varde: '2,7 m' },
      { text: 'Underliggare, ett sortiment per trave' },
      { text: 'Inga stenar eller ris i traven' },
    ] },
    { slag: 'grupp', rubrik: 'Till vägkanten', rader: [
      { text: 'Enskild väg', varde: '1,5–3 m' },
      { text: 'Allmän väg 30–50 km/h', varde: '2 m' },
      { text: 'Allmän väg 60–80 km/h', varde: '3 m' },
      { text: 'Allmän väg 90–110 km/h', varde: '7–9 m' },
      { text: 'Ändarna jämna mot vägen', varde: 'upp till 1,5 m' },
      { text: 'Till vägräcke', varde: 'minst 1 m' },
    ] },
    { slag: 'grupp', rubrik: 'Inte här', rader: [
      { text: 'Kurva, krön, korsning – bilister ska se' },
      { text: 'Busshållplats', varde: 'aldrig' },
      { text: 'Under kraftledning, på lös snö' },
      { text: 'Över trumma eller i dike – vattnet ska rinna' },
    ] },
    { slag: 'rutor', rubrik: 'Kraftledning – kranen aldrig närmare', rutor: [
      { varde: '2 m', text: 'Lågspänning' },
      { varde: '4 m', text: 'Under 40 kV' },
      { varde: '6 m', text: 'Över 40 kV' },
    ] },
    { slag: 'grupp', rubrik: 'Efteråt', rader: [
      { text: 'Ris och spill bort från väg och dike', varde: 'direkt' },
      { text: 'Rundvirke får ligga', varde: 'max 60 dagar' },
      { text: 'Städa platsen efter sista lasset' },
    ] },
  ],
  kalla: 'Trafikverket, Skogforsk · underliggare och sortiment: åkarnas krav',
};

const BLOTT_REGLER: Regelsida = {
  titel: 'Blött – alla regler',
  underrubrik: 'Diken och vatten, sett uppifrån',
  bild: BILD.BLOTT_REGLER,
  block: [
    { slag: 'varning', rubrik: 'Laga inte spår nära vatten själv', text: 'Det kan öka slam och kvicksilver i vattnet. Ring arbetsledaren – Skogsstyrelsen avgör.' },
    { slag: 'grupp', rubrik: 'Risa och kör', rader: [
      { text: 'Skördaren: jämn, tjock risbädd hela vägen' },
      { text: 'Skördaren märker ut där det kan sjunka' },
      { text: 'Slår det igenom svålen – risa direkt' },
      { text: 'Utgå från fastmarken, ut samma väg' },
      { text: 'Färre turer genom det blöta', varde: 'spåren växer per tur' },
    ] },
    { slag: 'grupp', rubrik: 'Diken', rader: [
      { text: 'Kör aldrig längs diket' },
      { text: 'Korsa så lite som möjligt – rakt över' },
      { text: 'Bärbar bro eller stockmattor' },
      { text: 'Virke i diket tas bort efteråt' },
    ] },
    { slag: 'grupp', rubrik: 'Vatten', rader: [
      { text: 'Från sjö och bäck', varde: 'ca 10 m' },
      { text: 'Inte genom källor och utflöden' },
      { text: 'Kranen lägger virket bort från vattnet' },
    ] },
    { slag: 'grupp', rubrik: 'Allvarlig körskada', rader: [
      { text: 'Spår som för slam till vatten' },
      { text: 'Ändrat vattenlopp eller dämning' },
      { text: 'Skadad torv nära vatten' },
    ] },
  ],
  kalla: 'Skogsstyrelsen, Skogforsk, branschens miljöpolicy · basväg på fastmark: vår drivningsplanering',
};

export const MALBILDER: Readonly<Record<string, Malbild>> = {
  stenmur: {
    nyckel: 'stenmur', namn: 'Stenmur', grupp: 'kultur',
    bild: BILD.STENMUR,
    rader: [
      "Fäll träden bort från muren",
      "Upparbeta aldrig över muren – inget virke eller ris på den",
      "Kör bara över där stickvägen är planerad – inte i gamla öppningar",
    ],
    fel: { bild: BILD.STENMUR_FEL, text: "Träd fällt över muren och upparbetat där – virke och ris hamnar på den" },
  },
  avlagg: {
    nyckel: 'avlagg', namn: 'Avlägg', grupp: 'info',
    bild: BILD.AVLAGG,
    rader: [
      "Underliggare under – max 4,5 m hög",
      "Minst 3 m från vägkanten – mer vid högre hastighet",
      "Ett sortiment per trave – vägen fri",
    ],
    fel: { bild: BILD.AVLAGG_FEL, text: "Traven direkt på marken – bilen får inte under gripen" },
    regler: AVLAGG_REGLER,
  },
  kulturlamning: {
    nyckel: 'kulturlamning', namn: 'Kulturlämning', grupp: 'kultur', standardNamn: 'Stenröse, tjärdal',
    bild: BILD.KULTURLAMNING,
    rader: [
      "Fäll träden på lämningen utifrån – aldrig över den",
      "Kulturstubbar 2–5 m utanför kanten",
      "Inget ris eller virke på lämningen",
    ],
    fel: { bild: BILD.KULTURLAMNING_FEL, text: "Träd fällt över röset och riset kvar på det" },
    varianter: [
      {
        nyckel: 'kolbotten', namn: 'Kolbotten',
        innehall: {
            bild: BILD.KOLBOTTEN,
            rader: [
              "Kör inte på – måste du: risat, rakt in, backa ut",
              "Träden får stå – ta bara det kranen når utifrån",
              "Inget ris i vallen och groparna",
            ],
            fel: { bild: BILD.KOLBOTTEN_FEL, text: "Vänt på bottnen – spåren går genom vallen" },
          },
      },
    ],
  },
  hansyn: {
    nyckel: 'hansyn', namn: 'Hänsyn', grupp: 'natur',
    bild: BILD.HANSYN,
    rader: [
      "Kör aldrig in i ytan – inte ens kanten",
      "Fäll inga träd in i ytan",
      "Inget ris eller virke i ytan",
    ],
    fel: { bild: BILD.HANSYN_FEL, text: "Kört in i kanten – spår och skadade träd i ytan" },
  },
  blott: {
    nyckel: 'blott', namn: 'Blött', grupp: 'blott',
    bild: BILD.BLOTT_SKORDARE,
    rader: [
      "Jämn, tjock risbädd hela vägen in",
      "Tror du det sjunker – märk ut det på kartan",
      "Utgå från fastmarken – aldrig längs diken",
    ],
    fel: { bild: BILD.BLOTT_SKORDARE_FEL, text: "Glest ris – spåren går rakt igenom" },
    roll: {
      skotare: {
        bild: BILD.BLOTT_SKOTARE,
        rader: [
      "Slår det igenom svålen – risa direkt",
      "In i det blöta och ut samma väg",
      "Aldrig längs diken – måste du över: rakt, på bro",
    ],
        fel: { bild: BILD.BLOTT_SKOTARE_FEL, text: "Körde vidare när det slog igenom – riset låg bredvid" },
      },
    },
    regler: BLOTT_REGLER,
  },
  evighetstrad: {
    nyckel: 'evighetstrad', namn: 'Evighetsträd', grupp: 'natur',
    bild: BILD.EVIGHETSTRAD,
    rader: [
      "Välj grova och gamla – gärna asp, ek, sälg, tall",
      "Spara i grupp – 5–7 träd står stadigt",
      "Fäll aldrig mot dem – kör inte under kronan",
    ],
    fel: { bild: BILD.EVIGHETSTRAD_FEL, text: "Trädet fällt rakt in i evighetsträden – grenar brutna, barken skadad" },
  },
  hogstubbe: {
    nyckel: 'hogstubbe', namn: 'Högstubbe', grupp: 'natur',
    bild: BILD.HOGSTUBBE,
    rader: [
      "Minst 3 m hög – kapa rent",
      "Helst löv, i grupp vid hänsynen – inte vid stig",
      "Toppen i hänsynen i solen – inte i riset",
    ],
    fel: { bild: BILD.HOGSTUBBE_FEL, text: "För låg – under 3 m räknas inte" },
  },
  naturhorna: {
    nyckel: 'naturhorna', namn: 'Naturhörna', grupp: 'natur',
    bild: BILD.NATURHORNA,
    rader: [
      "Lämna allt i hörnan – träd, lågor, buskar",
      "Kör runt – inte genom",
      "Fäll bort – inget ris eller virke i hörnan",
    ],
    fel: { bild: BILD.NATURHORNA_FEL, text: "Kört genom hörnan – lågorna sönderkörda" },
  },
  nyckelbiotop: {
    nyckel: 'nyckelbiotop', namn: 'Nyckelbiotop', grupp: 'natur',
    bild: BILD.NYCKELBIOTOP,
    rader: [
      "Kör aldrig in – inte heller i kantzonen",
      "Kantzonen 5–10 m runt om står kvar",
      "Hamnar virke innanför: krana ut det, kör inte in",
    ],
    fel: { bild: BILD.NYCKELBIOTOP_FEL, text: "Kantzonen borta – avverkat ända in till kanten" },
  },
  kulturmiljo: {
    nyckel: 'kulturmiljo', namn: 'Kulturmiljö', grupp: 'kultur',
    bild: BILD.KULTURMILJO,
    rader: [
      "Kör inte innanför kulturstubbarna – ca 10 m",
      "Spara vårdträd, fruktträd och syrener",
      "Husgrund och rösen fria från träd och ris",
    ],
    fel: { bild: BILD.KULTURMILJO_FEL, text: "Fruktträdet fällt och riset på husgrunden" },
  },
  fornlamning: {
    nyckel: 'fornlamning', namn: 'Fornlämning', grupp: 'kultur',
    bild: BILD.FORNLAMNING,
    rader: [
      "Lagskyddad – kör aldrig innanför snitslingen",
      "Inget ris, inga träd fällda eller dragna över",
      "Skada eller okänd lämning: stoppa och ring",
    ],
    fel: { bild: BILD.FORNLAMNING_FEL, text: "Kört över villkorsområdet – kan vara brott mot kulturmiljölagen" },
  },
  kantzon: {
    nyckel: 'kantzon', namn: 'Kantzon mot vatten', grupp: 'blott',
    bild: BILD.KANTZON,
    rader: [
      "Kör aldrig inom 10 m från vattnet",
      "Kantzonen står kvar – särskilt löv och buskar",
      "Fäll bort från vattnet – inget ris i kantzonen",
    ],
    fel: { bild: BILD.KANTZON_FEL, text: "Avverkat till stranden – spåren leder slam ut i sjön" },
  },
  vattenskydd: {
    nyckel: 'vattenskydd', namn: 'Vattenskyddsområde', grupp: 'blott',
    bild: BILD.VATTENSKYDD,
    rader: [
      "Tanka inte här – ställ inte upp maskinen över natten",
      "Saneringskit framme – spill samlas upp direkt",
      "Läcker det: stoppa, samla upp, ring",
    ],
    fel: { bild: BILD.VATTENSKYDD_FEL, text: "Läckage utan saneringskit – oljan går ner i grundvattnet" },
  },
};

/** Ordningen i listan "Alla målbilder". */
export const MALBILD_ORDNING: readonly string[] = [
  'avlagg', 'stenmur', 'kulturlamning', 'kulturmiljo', 'fornlamning', 'hansyn', 'nyckelbiotop', 'evighetstrad', 'hogstubbe', 'naturhorna', 'blott', 'kantzon', 'vattenskydd',
];

// =================================================================================================================================
// KÄLLA PER SORT — bara en LÄNK, aldrig en kopierad bild. Bladet visar "Källa: <utgivare> · <ämne> ›" längst ner och öppnar länken i en ny flik.
// En sort som inte står här har ingen källrad. URL:erna är inga gissningar: en sida utan egen adress pekar på utgivarens samlingssida.
// =================================================================================================================================

/** En källa: utgivare och ämne står i raden, adressen öppnas i en ny flik. */
export interface KallLank { utgivare: string; amne: string; url: string }

/** Skogsstyrelsens samlingssida för målbilder — dit pekar de ämnen som saknar en egen adress. */
const SKS_MALBILDER = 'https://www.skogsstyrelsen.se/aga-skog/hansyn-till-miljo-och-skyddade-arter/malbilder-for-god-miljohansyn/';
const SKS_KULTURMILJOER: KallLank = {
  utgivare: 'Skogsstyrelsen', amne: 'Kulturmiljöer',
  url: 'https://www.skogsstyrelsen.se/globalassets/mer-om-skog/malbilder-for-god-miljohansyn/malbilder-kulturmiljoer/handledning-for-god-kulturmiljohansyn.pdf',
};

/** Källa per målbildsnyckel. Kolbotten är en variant av Kulturlämning och har samma källa. Vattenskyddsområde har ingen källrad än. */
export const MALBILD_KALLA: Readonly<Record<string, KallLank>> = {
  kulturlamning: SKS_KULTURMILJOER,
  kulturmiljo: SKS_KULTURMILJOER,
  fornlamning: SKS_KULTURMILJOER,
  stenmur: {
    utgivare: 'Skogsstyrelsen', amne: 'Odlingsspår',
    url: 'https://www.skogsstyrelsen.se/globalassets/mer-om-skog/malbilder-for-god-miljohansyn/malbilder-kulturmiljoer/kulturmiljoer---malbild-odlingsspar.pdf',
  },
  evighetstrad: { utgivare: 'Skogsstyrelsen', amne: 'Träd och buskar med naturvärden samt död ved', url: SKS_MALBILDER },
  hogstubbe: { utgivare: 'Skogsstyrelsen', amne: 'Träd och buskar med naturvärden samt död ved', url: SKS_MALBILDER },
  naturhorna: { utgivare: 'Skogsstyrelsen', amne: 'Träd och buskar med naturvärden samt död ved', url: SKS_MALBILDER },
  nyckelbiotop: { utgivare: 'Skogsstyrelsen', amne: 'Hänsynskrävande biotoper', url: SKS_MALBILDER },
  hansyn: { utgivare: 'Skogsstyrelsen', amne: 'Hänsynskrävande biotoper', url: SKS_MALBILDER },
  blott: { utgivare: 'Skogsstyrelsen', amne: 'Körning i skogsmark', url: SKS_MALBILDER },
  kantzon: {
    utgivare: 'Skogsstyrelsen', amne: 'Kantzoner mot sjöar och vattendrag',
    url: 'https://www.skogsstyrelsen.se/globalassets/mer-om-skog/malbilder-for-god-miljohansyn/malbilder-kantzoner-mot-sjoar-och-vattendrag/hansyn-till-vatten-alla-faktablad-samlade-i-en-pdf.pdf',
  },
  avlagg: { utgivare: 'Trafikverket', amne: 'Upplag av virke vid väg', url: 'https://www.trafikverket.se/upplag-virke' },
};
/** Källan för en målbild, eller null (ingen källrad). */
export function malbildKalla(nyckel: string | null | undefined): KallLank | null {
  return (nyckel && MALBILD_KALLA[nyckel]) || null;
}

// =================================================================================================================================
// VILKEN MÅLBILD HÖR TILL VAD (kortets typ → nyckeln ovan). En sort som inte står här har ingen målbild.
// =================================================================================================================================

/** Symboltyper (lib/symboler) → målbild. Gamla Kulturstubbar och Vidas RAÄ-punkter är Kulturlämning. */
export const MALBILD_SYMBOL: Readonly<Record<string, string>> = {
  landing: 'avlagg', culturemonument: 'kulturlamning', culturestump: 'kulturlamning', raa_punkt: 'kulturlamning', wet: 'blott', eternitytree: 'evighetstrad', highstump: 'hogstubbe', naturecorner: 'naturhorna',
};
/** Ytor (zoneType, och Vidas lager som `vida:<slag>`) → målbild. Brant, Ej framkomlig och Gallringszon har ingen. */
export const MALBILD_YTA: Readonly<Record<string, string>> = {
  wet: 'blott', protected: 'hansyn', culture: 'kulturmiljo', fornlamning: 'fornlamning',
  'vida:hansynsyta': 'hansyn', 'vida:nyckelbiotop': 'nyckelbiotop', 'vida:raa_yta': 'fornlamning',
};
/** Linjer (lineType) → målbild. */
export const MALBILD_LINJE: Readonly<Record<string, string>> = { stonewall: 'stenmur' };

export type MalbildKalla = 'symbol' | 'yta' | 'linje';
/** Målbildens nyckel för det man tryckt på, eller null (Fara, Info och allt annat utan målbild). */
export function malbildNyckel(kalla: MalbildKalla, typ: string | null | undefined): string | null {
  if (!typ) return null;
  const tabell = kalla === 'symbol' ? MALBILD_SYMBOL : kalla === 'yta' ? MALBILD_YTA : MALBILD_LINJE;
  // Vidas ytor kommer från larmet som 'hansynsyta' (utan prefix) och från teckenförklaringen som 'vida:hansynsyta'.
  const n = tabell[typ] ?? (kalla === 'yta' ? tabell[`vida:${typ}`] : undefined);
  return n && n in MALBILDER ? n : null;
}

/** Innehållet för en maskintyp: standarden, med rollens egna delar ovanpå. Okänd roll (planeringsvyn) ger standarden, dvs. skördarens. */
export function malbildInnehall(nyckel: string, roll: Maskinroll | null | undefined, variant?: string | null): MalbildInnehall | null {
  const m = MALBILDER[nyckel];
  if (!m) return null;
  if (variant) {
    const v = m.varianter?.find((x) => x.nyckel === variant);
    if (v) return v.innehall;
  }
  const r = roll ? m.roll?.[roll] : undefined;
  return { bild: r?.bild ?? m.bild, rader: r?.rader ?? m.rader, fel: r?.fel ?? m.fel };
}
