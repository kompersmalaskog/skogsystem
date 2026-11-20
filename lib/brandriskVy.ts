// Brandriskpanelens ord och färger (2026-11-16, Martin: "samma design som resten av appen"). Rena funktioner — panelen ritar bara.
//
// FÄRGEN FÖLJER APPENS REGLER, inte MSB:s egen skala (blå, grön, gul, lila krockar med navigation, "bra", tall och skördare):
// nivå 1–2 grå (inget att göra), 3 ljus, 4 orange, 5 och 5E röd. Färgen bär aldrig ensam — ordet står alltid bredvid.
// Samma regel som raden på ⓘ-kortet (`brandRadText` i lib/omTrakten: 3 neutral, 4 orange, 5+ röd).

import { FARG } from '@/lib/design/tokens';

export type NivaText = { namn: string; kort: string; text: string };

/** SMHI:s klasser 1–6, där 6 skrivs 5E. Texterna är MCF:s (Brandrisk Ute). */
export const NIVA: Readonly<Record<number, NivaText>> = {
  1: { namn: 'Mycket liten skogsbrandsrisk', kort: 'Mycket liten', text: 'I de flesta skogstyper kan inte brand starta eller sprida sig med öppna lågor.' },
  2: { namn: 'Liten skogsbrandsrisk', kort: 'Liten', text: 'I vissa skogstyper kan det vara svårt för en brand att sprida sig.' },
  3: { namn: 'Måttlig skogsbrandsrisk', kort: 'Måttlig', text: 'Vegetationen brinner med olika spridningshastighet beroende på typ och torka.' },
  4: { namn: 'Stor skogsbrandsrisk', kort: 'Stor', text: 'Påtaglig risk för brandspridning. Brand sprider sig normalt i de flesta vegetationstyper.' },
  5: { namn: 'Mycket stor skogsbrandsrisk', kort: 'Mycket stor', text: 'En brand utvecklas mycket snabbt och häftigt. Toppbränder kan förekomma.' },
  6: { namn: 'Extremt stor skogsbrandsrisk', kort: 'Extrem', text: 'Markens ytskikt är extremt torrt. Brand utvecklas explosivt, med stor risk för toppbrand. Ofta eldningsförbud.' },
};

export const NIVAER = [1, 2, 3, 4, 5, 6] as const;

export function nivaFarg(niva: number): string {
  if (niva >= 5) return FARG.rod;
  if (niva === 4) return FARG.orange;
  if (niva === 3) return FARG.text;
  return FARG.text3;
}

/** "Nivå 4", och 6 heter 5E (SMHI:s eget namn). */
export const nivaSiffra = (niva: number): string => (niva >= 6 ? '5E' : String(niva));
export const nivaKort = (niva: number): string => NIVA[niva]?.kort ?? '';
/** Låg nivå (1–2): raden dämpas — inget att göra. */
export const arLag = (niva: number): boolean => niva <= 2;

const tt = (h: number) => h.toString().padStart(2, '0');

/** Dagens rad först (SMHI:s lista kan börja på en annan dag). */
export function idagForst<T extends { date: string }>(dagar: readonly T[], idagIso: string): T[] {
  const i = dagar.findIndex((d) => d.date === idagIso);
  return i > 0 ? [...dagar.slice(i), ...dagar.slice(0, i)] : [...dagar];
}

export type BrandSvar = { rubrik: string; mening: string; /** EN kort mening för första skärmen */ kort: string; toppNiva: number; toppStart: number; toppSlut: number };

/**
 * Svaret i ord för en dag: när är det farligast, och vad händer sedan. Fem lägen — rubriken och meningen kan aldrig säga emot varandra.
 * `idag` = dagen är idag (då finns "just nu"); annars gäller bara dagens topp.
 */
export function brandSvar(timmar: readonly number[], a: { idag: boolean; nuTimme: number; nuNiva: number }): BrandSvar | null {
  const kanda = timmar.filter((i) => i > 0);
  if (!kanda.length) return null;
  const toppNiva = Math.max(...kanda);
  // Längsta sammanhängande blocket på toppnivån (toppen kan komma två gånger samma dag).
  const block: { start: number; slut: number; len: number }[] = [];
  let start = -1;
  for (let h = 0; h <= 24; h++) {
    const iTopp = h < 24 && timmar[h] === toppNiva;
    if (iTopp && start === -1) start = h;
    if (!iTopp && start !== -1) { block.push({ start, slut: h - 1, len: h - start }); start = -1; }
  }
  const langst = block.reduce((x, y) => (y.len > x.len ? y : x), block[0]);
  const toppStart = langst.start;
  const toppSlut = langst.slut;
  const dagsdel = toppStart >= 6 && toppStart <= 11 ? 'på förmiddagen'
    : toppStart >= 12 && toppStart <= 13 ? 'runt lunch'
    : toppStart >= 14 && toppStart <= 17 ? 'efter lunch'
    : toppStart >= 18 && toppStart <= 21 ? 'på kvällen'
    : '';
  const toppKl = `kl ${tt(toppStart)} till ${tt(toppSlut)}`;
  const slutKl = `kl ${tt(toppSlut)}`;
  const nu = nivaKort(a.nuNiva);
  const topp = nivaKort(toppNiva);
  const farligast = dagsdel ? `Farligast ${dagsdel} – ${toppKl}` : `Farligast ${toppKl}`;
  const toppKvar = a.idag && timmar.some((niva, h) => h >= a.nuTimme && niva === toppNiva);

  let rubrik: string;
  let mening: string;
  if (!a.idag) {
    rubrik = farligast;
    mening = `Väntad topp: ${topp.toLowerCase()} brandrisk ${dagsdel || toppKl}.`;
  } else if (a.nuNiva >= toppNiva) {
    if (toppSlut >= 21) { rubrik = 'Farligast just nu'; mening = `${nu} brandrisk – håller i sig kvällen ut.`; }
    else if (toppSlut > a.nuTimme) { rubrik = `Farligast just nu – till ${slutKl}`; mening = `${nu} brandrisk. Lättar efter ${slutKl}.`; }
    else { rubrik = `${nu} brandrisk just nu`; mening = `Som högst ${toppKl} idag.`; }
  } else if (!toppKvar) {
    rubrik = dagsdel ? `Lugnare nu – toppen var ${dagsdel}` : `Lugnare nu – toppen var ${toppKl}`;
    mening = `${nu} brandrisk just nu, avtagande.`;
  } else if (toppNiva - a.nuNiva >= 2) {
    rubrik = farligast;
    mening = `Lugnt nu (${nu.toLowerCase()}). Stiger till ${topp.toLowerCase()} ${dagsdel || toppKl}.`;
  } else {
    rubrik = farligast;
    mening = `Just nu ${nu.toLowerCase()} brandrisk – stiger snart till ${topp.toLowerCase()}.`;
  }
  // Första skärmens enda mening: när, utan dagsdel och utan nivåord (nivån står redan i rubriken).
  const tid = toppStart === toppSlut ? `kl ${tt(toppStart)}` : toppKl;
  const kort = !a.idag || (a.nuNiva < toppNiva && toppKvar) ? `Farligast ${tid}.`
    : a.nuNiva >= toppNiva ? (toppSlut >= 21 ? 'Farligast nu, hela kvällen.' : toppSlut > a.nuTimme ? `Farligast nu, till ${slutKl}.` : `Farligast var ${tid}.`)
    : `Lugnare nu. Farligast var ${tid}.`;
  return { rubrik, mening, kort, toppNiva, toppStart, toppSlut };
}

/**
 * "Gör så här" (Martin 2026-11-16: så lätt att ett barn förstår): bara det som gäller vid just den nivån, som korta rader. Inget vid liten risk.
 * Reglerna är de panelen alltid haft: utrustning från måttlig (3) eller vid eldningsförbud, samråd från stor (4), inga band vid 5E.
 */
export function gorSaHar(niva: number, eldningsforbud: boolean): string[] {
  const rader: string[] = [];
  if (niva >= 3 || eldningsforbud) rader.push('Släckare, kratta och spade med');
  if (niva >= 4) rader.push('Prata med uppdragsgivaren först');
  if (niva >= 6) rader.push('Inga band');
  return rader;
}

/** Raden under svaret: EN mening. Liten risk: inget att göra. Annars när det är farligast. */
export function svarRad(niva: number, svar: BrandSvar | null): string {
  if (arLag(niva)) return 'Inget särskilt att göra.';
  return svar ? svar.kort : '';
}

export const DAGNAMN: Readonly<Record<string, string>> = { 'Mån': 'Måndag', 'Tis': 'Tisdag', 'Ons': 'Onsdag', 'Tor': 'Torsdag', 'Fre': 'Fredag', 'Lör': 'Lördag', 'Sön': 'Söndag' };
