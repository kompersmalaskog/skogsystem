// Grot-volymuppskattning — Skogforsk-schablon, ALDRIG mätning.
//
//   uppskattad_grot_m3fub = avverkad_stamvolym_m3fub × uttagsfaktor
//
// HÄRLEDNING (Skogforsk): vid normal granavverkning sitter ~30 % av trädets
// biomassa i grot och ~50 % i stammen → grot ≈ 0,6 × stamvedsvolym rent
// teoretiskt. I praktiskt uttag lämnas barr, spill och näring kvar i skogen
// (Skogforsk: man får med ~70 % av grotvolymen, ~50 % av barren stannar) →
// praktiskt uttag hamnar på 30–40 % av stamvolymen. 0,35 = mittvärdet.
// Källa: skogforsk.se/kunskapsbanken — "Uttag av skogsbränslen" och
// "Hur mycket grot lämnas kvar i skogen?" (2023).
//
// ENHET: allt hålls i m³fub, samma enhet som avverkningsvolymen. Ingen
// omräkning till stjälpt mått (m³s) — det är enhetsfällan där en faktor ~3
// annars smyger sig in obemärkt (samma sorts fel som G15-buggen var).
//
// v1: ETT globalt värde (justerbart i vyn). Trädslagsjustering kan komma
// senare — grot-andelen är lägre för tall/löv än för gran.
export const GROT_UTTAGSFAKTOR_DEFAULT = 0.35;
export const GROT_UTTAGSFAKTOR_MIN = 0.30;
export const GROT_UTTAGSFAKTOR_MAX = 0.40;

// Returnerar null när avverkad volym saknas — då finns ingen grund att
// uppskatta ur, och vyn ska säga "avverkningsdata saknas", inte visa 0.
export function uppskattaGrotM3fub(
  stamvolymM3fub: number,
  faktor: number = GROT_UTTAGSFAKTOR_DEFAULT,
): number | null {
  if (!(stamvolymM3fub > 0)) return null;
  return stamvolymM3fub * faktor;
}

// Klampar en (ev. sparad) faktor till det källbelagda intervallet.
export function klampaGrotFaktor(v: number): number {
  if (!Number.isFinite(v)) return GROT_UTTAGSFAKTOR_DEFAULT;
  return Math.min(GROT_UTTAGSFAKTOR_MAX, Math.max(GROT_UTTAGSFAKTOR_MIN, Math.round(v * 100) / 100));
}
