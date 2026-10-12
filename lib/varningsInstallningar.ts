// Varningsavstånd per kategori — sparas PER ENHET i localStorage.
//
// Ett avstånd per kategori: hur nära en markering körvyns proximitetskort växer ("big" = inom kategorins radie). Det är den
// ENDA inställning som finns kvar efter att det gamla körläget (avståndsdämpning, "Visa alla symboler", på/av per kategori,
// pip/vibrationskort) togs bort — körvyn läste bara `warnDist`.
//
// Före: koden försökte spara dem per objekt i tabellen `warning_settings`. Tabellen har aldrig funnits (PostgREST 404 PGRST205),
// så inget sparades någonsin. Nu: en nyckel per enhet (`varningar_v1`) — det är en personlig känslighet, inte en objektegenskap.
// Samma mönster som övriga enhetsval (`mapLayers_v4`, `korvy_kompass`, `skogLager_v1_<id>`).
//
// BAKÅTKOMPATIBELT: strängar som sparades av den äldre versionen (med fadeDist / minOpacity / enabled / visaAlla) läses
// fortfarande — bara `warnDist` används, resten ignoreras. Nästa ändring skriver den nya, kortare formen.
//
// Rena funktioner (strängen som parameter) → enhetstestbara utan webbläsare.

export const VARNING_NYCKEL = 'varningar_v1';

/** Reservvärde när en kategori saknar inställning (t.ex. gallringszonen): samma som standardvärdet för en vanlig kategori. */
export const VARNING_RESERV_WARN_M = 30;

export interface VarningKategori { warnDist: number }
export type VarningInstallningar = Record<string, VarningKategori>;

const K = (warnDist: number): VarningKategori => ({ warnDist });

/** Standardvärden per kategori (symboler + zoner). Övrigt, kulturmiljö och fornlämning varnar tidigare (50 m). */
export const VARNING_STANDARD: Readonly<VarningInstallningar> = Object.freeze({
  // Symbolkategorier
  naturvard:     K(30),
  kultur:        K(30),
  avverkning:    K(30),
  infrastruktur: K(30),
  terrang:       K(30),
  ovrigt:        K(50),
  // Zonkategorier
  zone_wet:         K(30),
  zone_steep:       K(30),
  zone_protected:   K(30),
  zone_culture:     K(50),
  zone_noentry:     K(30),
  zone_fornlamning: K(50),
});

/** En ny, föränderlig kopia av standardvärdena (React-state får inte dela objekt med den frysta konstanten). */
export function standardInstallningar(): VarningInstallningar {
  const ut: VarningInstallningar = {};
  for (const [id, k] of Object.entries(VARNING_STANDARD)) ut[id] = { ...k };
  return ut;
}

export interface LastaVarningar {
  installningar: VarningInstallningar;
  /** 'tom' = inget sparat · 'ok' = inläst · 'trasig' = sparat men oläsligt (standardvärden används, inget skrivs över förrän något ändras) */
  status: 'tom' | 'ok' | 'trasig';
}

const arTal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Läser den sparade strängen. Varje kategori läggs över standardvärdena och valideras — ett trasigt eller okänt värde ger
 *  standardvärdet för just den kategorin, aldrig ett krasch eller en kategori som saknas. Äldre fält ignoreras. */
export function lasVarningar(raw: string | null | undefined): LastaVarningar {
  const std = standardInstallningar();
  if (raw == null || raw === '') return { installningar: std, status: 'tom' };
  let data: any;
  try { data = JSON.parse(raw); } catch { return { installningar: std, status: 'trasig' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.v !== 1 || !data.kategorier || typeof data.kategorier !== 'object') {
    return { installningar: std, status: 'trasig' };
  }
  for (const id of Object.keys(std)) {
    const s = (data.kategorier as Record<string, any>)[id];
    if (!s || typeof s !== 'object') continue;
    std[id] = { warnDist: arTal(s.warnDist) && s.warnDist >= 5 && s.warnDist <= 1000 ? s.warnDist : std[id].warnDist };
  }
  return { installningar: std, status: 'ok' };
}

/** Strängen som sparas i localStorage. Nyckelordningen är fast → samma inställningar ger alltid samma sträng (jämförbart). */
export function skrivVarningar(installningar: VarningInstallningar): string {
  const kategorier: VarningInstallningar = {};
  for (const id of Object.keys(VARNING_STANDARD)) {
    const k = installningar[id] ?? VARNING_STANDARD[id];
    kategorier[id] = { warnDist: k.warnDist };
  }
  return JSON.stringify({ v: 1, kategorier });
}

/** Varningsavstånd för en kategori — med reservvärde (30 m) när kategorin saknar inställning eller värdet är 0. */
export function varningsAvstand(installningar: VarningInstallningar, katId: string): { warnDist: number } {
  return { warnDist: installningar[katId]?.warnDist || VARNING_RESERV_WARN_M };
}
