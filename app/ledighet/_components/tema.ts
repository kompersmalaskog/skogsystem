// Ledighetens typer och etiketter. FÄRG, TYPOGRAFI och AVSTÅND bor i lib/design/tokens.ts
// (en källa för hela appen) — ledighet har inget eget tema längre. Förr fanns här en egen
// palett (bakgrund #111110, andra nyanser av grönt/rött/blått, en rosa "Nekad") som gjorde
// vyn till en annan app än Arbetsrapport.
import { FRANVARO_TYP_RUBRIK, type FranvaroStatus, type FranvaroTyp } from '@/lib/franvaro';

// Typen är den samlade frånvaromodellens (lib/franvaro) — tabellen bär nio
// typer sedan steg 1, och morgonkortets sjuk/vab/föräldraledig hamnar här
// sedan steg 2. Listan måste tåla alla nio, annars kraschar den på en rad
// den inte känner igen. Vad som går att ANSÖKA om här är en mindre lista.
export type LedighetTyp = FranvaroTyp;
export type LedighetStatus = FranvaroStatus;

/** Det föraren kan ansöka om i den här vyn. Inarbetad = bytesdag (skoftning
 *  §5 mom 4), kräver ersatter_datum. Komp/tjänstledigt/permission väntar på
 *  beslut (komp-saldots hemvist). */
export const ANSOKBARA_TYPER: readonly LedighetTyp[] = ['semester', 'atk', 'inarbetad'];

export const TYPINFO: Record<LedighetTyp, { label: string }> = {
  semester:      { label: FRANVARO_TYP_RUBRIK.semester },
  atk:           { label: FRANVARO_TYP_RUBRIK.atk },
  komp:          { label: FRANVARO_TYP_RUBRIK.komp },
  sjuk:          { label: FRANVARO_TYP_RUBRIK.sjuk },
  vab:           { label: FRANVARO_TYP_RUBRIK.vab },
  foraldraledig: { label: FRANVARO_TYP_RUBRIK.foraldraledig },
  inarbetad:     { label: FRANVARO_TYP_RUBRIK.inarbetad },
  tjanstledig:   { label: FRANVARO_TYP_RUBRIK.tjanstledig },
  permission:    { label: FRANVARO_TYP_RUBRIK.permission },
};
