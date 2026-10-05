// Varningsinställningar för körläget (avståndsdämpning + varningsavstånd per kategori) — sparas PER ENHET i localStorage.
//
// Före: koden försökte spara dem per objekt i tabellen `warning_settings`. Tabellen har aldrig funnits (PostgREST 404 PGRST205),
// så inget sparades någonsin, "Sparade inställningar till Supabase" loggades ändå, och minnet nollades aldrig vid objektbyte.
// Nu: en nyckel per enhet (`varningar_v1`) — det är en personlig känslighet (hur långt i förväg symbolerna tänds), inte en
// objektegenskap. Samma mönster som övriga enhetsval (`mapLayers_v4`, `korvy_kompass`, `skogLager_v1_<id>`).
//
// Rena funktioner (strängen som parameter) → enhetstestbara utan webbläsare.

export const VARNING_NYCKEL = 'varningar_v1';

/** Reservvärden när en kategori saknar inställning (t.ex. gallringszonen): samma som standardvärdet för en vanlig kategori. */
export const VARNING_RESERV_WARN_M = 30;
export const VARNING_RESERV_FADE_M = 200;
export const VARNING_RESERV_MINOPACITY = 0.1;

export interface VarningKategori { warnDist: number; fadeDist: number; minOpacity: number; enabled: boolean }
export type VarningInstallningar = Record<string, VarningKategori>;

const K = (warnDist: number, fadeDist: number): VarningKategori => ({ warnDist, fadeDist, minOpacity: VARNING_RESERV_MINOPACITY, enabled: true });

/** Standardvärden per kategori (symboler + zoner). Övrigt, kulturmiljö och fornlämning varnar tidigare (50 m). */
export const VARNING_STANDARD: Readonly<VarningInstallningar> = Object.freeze({
  // Symbolkategorier
  naturvard:     K(30, 200),
  kultur:        K(30, 200),
  avverkning:    K(30, 200),
  infrastruktur: K(30, 200),
  terrang:       K(30, 200),
  ovrigt:        K(50, 300),
  // Zonkategorier
  zone_wet:         K(30, 200),
  zone_steep:       K(30, 200),
  zone_protected:   K(30, 200),
  zone_culture:     K(50, 300),
  zone_noentry:     K(30, 200),
  zone_fornlamning: K(50, 300),
});

/** En ny, föränderlig kopia av standardvärdena (React-state får inte dela objekt med den frysta konstanten). */
export function standardInstallningar(): VarningInstallningar {
  const ut: VarningInstallningar = {};
  for (const [id, k] of Object.entries(VARNING_STANDARD)) ut[id] = { ...k };
  return ut;
}

export interface LastaVarningar {
  installningar: VarningInstallningar;
  visaAlla: boolean;
  /** 'tom' = inget sparat · 'ok' = inläst · 'trasig' = sparat men oläsligt (standardvärden används, inget skrivs över förrän något ändras) */
  status: 'tom' | 'ok' | 'trasig';
}

const arTal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Läser den sparade strängen. Varje kategori läggs över standardvärdena FÄLT FÖR FÄLT och valideras — ett trasigt eller okänt
 *  värde ger standardvärdet för just det fältet, aldrig ett krasch eller en hel kategori som saknas. */
export function lasVarningar(raw: string | null | undefined): LastaVarningar {
  const std = standardInstallningar();
  if (raw == null || raw === '') return { installningar: std, visaAlla: false, status: 'tom' };
  let data: any;
  try { data = JSON.parse(raw); } catch { return { installningar: std, visaAlla: false, status: 'trasig' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.v !== 1 || !data.kategorier || typeof data.kategorier !== 'object') {
    return { installningar: std, visaAlla: false, status: 'trasig' };
  }
  for (const id of Object.keys(std)) {
    const s = (data.kategorier as Record<string, any>)[id];
    if (!s || typeof s !== 'object') continue;
    const warn = arTal(s.warnDist) && s.warnDist >= 5 && s.warnDist <= 1000 ? s.warnDist : std[id].warnDist;
    // fadeDist måste ligga OVANFÖR warnDist (tonas från fadeDist ned mot warnDist) — annars blir fade-intervallet noll/negativt
    const fade = arTal(s.fadeDist) && s.fadeDist > warn && s.fadeDist <= 5000 ? s.fadeDist : Math.max(std[id].fadeDist, warn + 50);
    std[id] = {
      warnDist: warn,
      fadeDist: fade,
      minOpacity: arTal(s.minOpacity) && s.minOpacity >= 0 && s.minOpacity <= 1 ? s.minOpacity : std[id].minOpacity,
      enabled: typeof s.enabled === 'boolean' ? s.enabled : std[id].enabled,
    };
  }
  return { installningar: std, visaAlla: data.visaAlla === true, status: 'ok' };
}

/** Strängen som sparas i localStorage. Nyckelordningen är fast → samma inställningar ger alltid samma sträng (jämförbart). */
export function skrivVarningar(installningar: VarningInstallningar, visaAlla: boolean): string {
  const kategorier: VarningInstallningar = {};
  for (const id of Object.keys(VARNING_STANDARD)) {
    const k = installningar[id] ?? VARNING_STANDARD[id];
    kategorier[id] = { warnDist: k.warnDist, fadeDist: k.fadeDist, minOpacity: k.minOpacity, enabled: k.enabled };
  }
  return JSON.stringify({ v: 1, kategorier, visaAlla: visaAlla === true });
}

/** Varnings-/tonings-avstånd för en kategori — med reservvärde (30 m) när kategorin saknar inställning eller värdet är 0. */
export function varningsAvstand(installningar: VarningInstallningar, katId: string): { warnDist: number; fadeDist: number; minOpacity: number } {
  const s = installningar[katId];
  return {
    warnDist: s?.warnDist || VARNING_RESERV_WARN_M,
    fadeDist: s?.fadeDist || VARNING_RESERV_FADE_M,
    minOpacity: s?.minOpacity ?? VARNING_RESERV_MINOPACITY,
  };
}
