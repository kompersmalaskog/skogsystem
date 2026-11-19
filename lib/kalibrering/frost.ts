/**
 * FROST — "Flyttar frosten hela kurvan?" (Martin 2026-11-19: "samla in data för att se om det fryser kan man ändra hela kurvan i skördaren med 2 mm så stämmer det
 * igen"). Appen visar maskinens fel mot klaven per grovlek och per väderläge, och säger i ord om frosten flyttar alla grovlekar LIKA mycket (då räcker det att
 * flytta hela kurvan) eller olika mycket (då gör det inte det). Appen föreslår ingen justering — det gör föraren/Martin i skördaren.
 *
 * VÄDERLÄGET ÄR VIRKETS, INTE TIMMENS: om virket är fruset avgörs av natten och dygnet före, inte av temperaturen den timme kontrollen gjordes. En kontroll kl 13
 * vid +1 °C efter en natt på −8 °C är fruset virke. Därför: snittet av de 24 timmarna FÖRE operatörens mätning (ERA5 via Open-Meteo, samma källa som
 * kontrollernas väder) → varmt (över 0) / fruset (0 till −7) / kallt (−7 och under), samma gränser som allt annat väder i Kalibrering (vaderKlass).
 *
 * Samma underlag och räkneregler som Var sitter felet? (felet.ts): samma diameterpunkter, samma stamidentitet, dubbletterna bort, en stock med mer än 10 cm
 * längdfel räknas inte, och EN STAM RÄKNAS EN GÅNG per grovlek och läge — rutans värde är medelvärdet av stammarnas egna medelfel. Allt här är rent.
 */
import type { FeletDia, FeletGrupp } from './felet';
import { FELET_GRUPPER } from './felet';
import { GROVLEK_MIN_STAMMAR } from './grovlek';
import { medelTemp, vaderKlass, type VaderKlass } from './vaderOmslag';
import type { TempObs } from '@/lib/smhi-obs';

export const FROST_TIMMAR = 24;
/** Minst så många timvärden av 24 för att dygnet ska räknas (luckor i arkivet ger annars ett snitt av några få timmar). */
export const FROST_MIN_TIMMAR = 18;
export const FROST_LAGEN: readonly VaderKlass[] = ['varmt', 'fruset', 'kallt'];
/** Skillnaderna mot varmt får skilja högst så här mycket mellan grovlekarna för att det ska räknas som en flytt av hela kurvan. */
export const LIKA_FLYTT_MM = 1.5;
/** Under så här mycket i snitt är det ingen skillnad att tala om. */
export const INGEN_SKILLNAD_MM = 1;

/** Virkets läge vid en mätning: snittet av dygnet före. null = för få timvärden (arkivet ligger ca 5 dygn efter). */
export function virketsLage(obs: readonly TempObs[], mattMs: number): VaderKlass | null {
  const t = medelTemp(obs, mattMs - FROST_TIMMAR * 3_600_000, mattMs, FROST_MIN_TIMMAR);
  return t == null ? null : vaderKlass(t);
}

/** En stam och grovlek med virkets läge, som servern skickar den. */
export type FrostRad = Pick<FeletDia, 'stam' | 'grupp' | 'n' | 'summa'> & { lage: VaderKlass };
export type FrostResp = { ok: true; maskin_id: string; rader: FrostRad[]; utanVader: number };

export type FrostCell = { stammar: number; snittMm: number | null };
export type FrostVy = {
  /** En rad per grovlek: cell per läge (snittMm null under GROVLEK_MIN_STAMMAR stammar). */
  tabell: { grupp: FeletGrupp; celler: Record<VaderKlass, FrostCell> }[];
  /** Svaret i ord för fruset och för sträng kyla. null = inget att säga om läget (ingen frusen data alls). */
  fruset: string;
  kallt: string | null;
  /** Antal stammar per läge (alla grovlekar), till noten. */
  stammar: Record<VaderKlass, number>;
};

export function frostVy(rader: readonly FrostRad[]): FrostVy {
  const cell = (grupp: FeletGrupp, lage: VaderKlass): FrostCell => {
    const lista = rader.filter(r => r.grupp === grupp && r.lage === lage && r.n > 0);
    if (lista.length < GROVLEK_MIN_STAMMAR) return { stammar: lista.length, snittMm: null };
    return { stammar: lista.length, snittMm: lista.reduce((a, r) => a + r.summa / r.n, 0) / lista.length };
  };
  const tabell = FELET_GRUPPER.map(grupp => ({
    grupp, celler: { varmt: cell(grupp, 'varmt'), fruset: cell(grupp, 'fruset'), kallt: cell(grupp, 'kallt') },
  }));
  const stammar = { varmt: 0, fruset: 0, kallt: 0 } as Record<VaderKlass, number>;
  for (const l of FROST_LAGEN) stammar[l] = new Set(rader.filter(r => r.lage === l).map(r => r.stam)).size;
  const kallt = stammar.kallt > 0 ? frostSvar(tabell, 'kallt') : null;
  return { tabell, fruset: frostSvar(tabell, 'fruset'), kallt, stammar };
}

const fmtMm = (mm: number): string => {
  const r = Math.round(mm * 10) / 10;
  return `${r.toFixed(1).replace('.', ',').replace('-', '−')} mm`;
};

/**
 * Svaret i ord för ett läge mot varmt. Skillnaden per grovlek = läget − varmt (positivt = maskinen mäter grövre när det är kallt).
 * Kräver minst två grovlekar med underlag i båda lägena; annars är det för tidigt att säga något.
 */
export function frostSvar(tabell: FrostVy['tabell'], lage: 'fruset' | 'kallt'): string {
  const ord = lage === 'fruset' ? 'fruset virke' : 'sträng kyla';
  const diff = tabell
    .map(r => (r.celler.varmt.snittMm != null && r.celler[lage].snittMm != null ? (r.celler[lage].snittMm as number) - (r.celler.varmt.snittMm as number) : null))
    .filter((d): d is number => d != null);
  if (diff.length < 2) return `För lite ${ord} än för att säga något – svaret kommer under vintern.`;
  const snitt = diff.reduce((a, b) => a + b, 0) / diff.length;
  const spann = Math.max(...diff) - Math.min(...diff);
  if (spann > LIKA_FLYTT_MM) return `Med ${ord} ändras felet olika mycket för olika grovlekar – det går inte att flytta hela kurvan lika mycket.`;
  if (Math.abs(snitt) < INGEN_SKILLNAD_MM) return `Med ${ord} mäter maskinen som annars – ingen skillnad att se.`;
  return `Med ${ord} mäter maskinen ca ${fmtMm(Math.abs(snitt))} ${snitt > 0 ? 'grövre' : 'klenare'} i alla grovlekar – hela kurvan har flyttat sig lika mycket.`;
}

/** Cellens text: "+1,9 mm" eller "–". */
export const frostCellText = (c: FrostCell): string => (c.snittMm == null ? '–' : `${c.snittMm > 0 ? '+' : ''}${fmtMm(c.snittMm)}`);
