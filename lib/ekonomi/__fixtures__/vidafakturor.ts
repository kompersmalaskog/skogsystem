// FACIT: 31 riktiga Vida-fakturor med härledning, lästa ur fortnox_invoice_rows
// 2026-09-25. Detta är inte handmatade testvärden — det är vad som faktiskt
// skickades till kund, och det enda facit ackordsformeln kan prövas mot.
//
// `skordare`/`skotare` är à-priset på artikel 1 respektive artikel 2.
// `harledning` är nollraderna ordagrant, med Martins stavning och slarv intakt
// ("Krönt +1,5" utan kr, "Storlek 2kr" utan plus, "Medel 0,57=101").
// Rör dem inte — testets parser ska klara verkligheten, inte en städad kopia.
//
// Uteslutna rader: artikel 1/2 med pris 0 och antal 1 är anteckningar
// ("Skotning 810E kört blött"), och 2026069 har en andra artikel-2-rad på
// 1 050 kr som är TIMPRIS för 810E, inte ackord.

export type Vidafaktura = {
  dn: number;
  datum: string;
  skordare: number;
  skotare: number;
  harledning: string[];
};

export const VIDAFAKTUROR: Vidafaktura[] = [
  { dn: 2026011, datum: '2026-01-09', skordare: 56, skotare: 44, harledning: ['Medel 0,86'] },
  { dn: 2026013, datum: '2026-01-12', skordare: 56, skotare: 49, harledning: ['Medel 0,9'] },
  { dn: 2026014, datum: '2026-01-12', skordare: 58.5, skotare: 47, harledning: ['Krönt +1,5kr', 'Sort +4kr', 'Medel 0,7'] },
  { dn: 2026015, datum: '2026-01-13', skordare: 67.5, skotare: 50, harledning: ['Medel 0,46', 'Sort +4kr', 'Krönt +1,5kr', 'Terräng +8kr'] },
  { dn: 2026016, datum: '2026-01-13', skordare: 61.5, skotare: 49, harledning: ['Medel 0,53', 'Krönt +1,5kr', 'Terräng +2kr', 'Avstånd +2kr', 'Sort +2kr'] },
  { dn: 2026017, datum: '2026-01-13', skordare: 65.5, skotare: 58, harledning: ['Medel 0,44', 'Sort +4kr', 'Krönt +1,5kr', 'Avstånd +8kr', 'Blött +3kr'] },
  { dn: 2026018, datum: '2026-01-19', skordare: 66, skotare: 47.5, harledning: ['Medel 0,42', 'Storlek +5kr', 'Krönt +1,5kr'] },
  { dn: 2026026, datum: '2026-01-20', skordare: 59.5, skotare: 49, harledning: ['Medel 0,57', 'Krönt +1,5kr', 'Storlek+2kr', 'Sort +4kr'] },
  { dn: 2026034, datum: '2026-02-09', skordare: 58.5, skotare: 48, harledning: ['Medel 0,57=101', 'Storlek +2kr', 'Krönt +1,5kr', 'Sort +2kr'] },
  { dn: 2026036, datum: '2026-02-09', skordare: 57.5, skotare: 46, harledning: ['Medel 0,76', 'Krönt +1,5kr', 'Storlek +2kr'] },
  { dn: 2026037, datum: '2026-02-09', skordare: 58.5, skotare: 51, harledning: ['Medel 0,63', 'Krönt +1,5kr', 'Avstånd +4kr', 'Storlek +2kr', 'Avlägg +2kr'] },
  { dn: 2026038, datum: '2026-02-09', skordare: 57.5, skotare: 48, harledning: ['Medel 0,75', 'Krönt +1,5', 'Avstånd +4kr'] },
  { dn: 2026047, datum: '2026-02-16', skordare: 62.5, skotare: 67, harledning: ['Medel 0,6', 'Gallring och dåliga avlägg +2kr', 'Krönt +1,5kr', 'Avstånd +20kr', 'Sort +6kr'] },
  { dn: 2026051, datum: '2026-02-16', skordare: 59.5, skotare: 53, harledning: ['Medel 0,56', 'Krönt +1,5', 'Avstånd +8kr', 'Storlek +2kr', 'Löv 41m3f'] },
  { dn: 2026052, datum: '2026-02-17', skordare: 69.5, skotare: 53, harledning: ['Medel 0,38', 'Krönt +1,5', 'Sort +4kr', 'Storlek +2kr', 'Terräng +2kr'] },
  { dn: 2026053, datum: '2026-02-17', skordare: 62.5, skotare: 59, harledning: ['Medel 0,49', 'Krönt +1,5', 'Avstånd +12kr', 'Storlek +2kr', 'Terräng +2kr'] },
  { dn: 2026058, datum: '2026-03-09', skordare: 61.5, skotare: 49, harledning: ['Medel 0,5', 'Sort +4kr', 'Krönt +1,5kr', 'Storlek +2kr'] },
  { dn: 2026059, datum: '2026-03-09', skordare: 58.5, skotare: 47, harledning: ['Medel 0,61', 'Krönt +1,5', 'Storlek +2kr', 'Avstånd +2kr'] },
  { dn: 2026066, datum: '2026-03-23', skordare: 76.5, skotare: 81, harledning: ['Medel 0,28', 'Sort +6kr', 'Krönt +1,5', 'Avstånd +12kr', 'Blött 5kr', 'Liten skotare band 10kr'] },
  { dn: 2026067, datum: '2026-03-23', skordare: 57.5, skotare: 48, harledning: ['Medel 0,8', 'Sort +4kr', 'Krönt +1,5'] },
  { dn: 2026069, datum: '2026-03-23', skordare: 59.5, skotare: 68, harledning: ['Medel 0,66', 'Krönt +1,5', 'Sort +2kr', 'Avstånd +24kr'] },
  { dn: 2026076, datum: '2026-04-17', skordare: 63.5, skotare: 60, harledning: ['Medel 0,46', 'Krönt +1,5kr', 'Avstånd +12kr', 'Storlek +2kr', 'Sort +4kr'] },
  { dn: 2026082, datum: '2026-04-17', skordare: 61.5, skotare: 59, harledning: ['Sort +2kr', 'Krönt +1,5kr', 'Avstånd +12kr', 'Storlek 2kr', 'Medel 0,5'] },
  { dn: 2026140, datum: '2026-08-07', skordare: 58, skotare: 56.5, harledning: ['Medel 0,69', 'Krönt +1,5kr', 'Avstånd +12kr', 'Storlek +2kr'] },
  { dn: 2026141, datum: '2026-08-14', skordare: 58.5, skotare: 47, harledning: ['Medel 0,72', 'Krönt +1,5kr', 'Storlek +2kr', 'Terräng +2kr'] },
  { dn: 2026142, datum: '2026-08-14', skordare: 61.5, skotare: 60, harledning: ['Medel 0,8', 'Krönt +1,5kr', 'Storlek +2kr', 'Blött +2kr', 'Avstånd +16kr'] },
  { dn: 2026143, datum: '2026-08-14', skordare: 65.5, skotare: 53, harledning: ['Medel 0,42', 'Krönt +1,5', 'Storlek +4kr', 'Avstånd +4kr', 'Blött +2kr'] },
  { dn: 2026145, datum: '2026-08-31', skordare: 71.5, skotare: 74, harledning: ['Medel 0,3', 'Krönt +1,5kr', 'Avstånd +20kr', 'Blött +5kr', 'Sort +2kr'] },
  { dn: 2026146, datum: '2026-09-01', skordare: 57.5, skotare: 50, harledning: ['Medel 0,68', 'Krönt +1,5kr', 'Avstånd +4kr', 'Blött +2kr'] },
  { dn: 2026151, datum: '2026-09-04', skordare: 66.5, skotare: 70, harledning: ['Medel 0,49', 'Krönt +1,5kr', 'Avstånd +20kr', 'Sort +4kr', 'Blött +7kr'] },
  { dn: 2026159, datum: '2026-09-21', skordare: 60.5, skotare: 46, harledning: ['Krönt +1,5kr', 'Sort +2kr', 'Storlek -1kr', 'Medel 0,47'] },
];

/** acord_priser som den står i prod 2026-09-25 (giltig_fran 2025-06-03). */
export const ACORD_PRISER = [
  { medelstam: 0.20, pris_skordare: 81, pris_skotare: 49, pris_total: 130 },
  { medelstam: 0.25, pris_skordare: 75, pris_skotare: 48, pris_total: 123 },
  { medelstam: 0.30, pris_skordare: 70, pris_skotare: 47, pris_total: 117 },
  { medelstam: 0.35, pris_skordare: 67, pris_skotare: 46, pris_total: 113 },
  { medelstam: 0.40, pris_skordare: 62, pris_skotare: 45, pris_total: 107 },
  { medelstam: 0.45, pris_skordare: 60, pris_skotare: 44, pris_total: 104 },
  { medelstam: 0.50, pris_skordare: 59, pris_skotare: 44, pris_total: 103 },
  { medelstam: 0.55, pris_skordare: 57, pris_skotare: 44, pris_total: 101 },
  { medelstam: 0.60, pris_skordare: 56, pris_skotare: 44, pris_total: 100 },
];

/** Plockar ut medelstammen ur "Medel 0,57" / "Medel 0,57=101". */
export function medelstamUr(harledning: string[]): number | null {
  for (const r of harledning) {
    const m = r.match(/medel\s*([0-9]+[.,][0-9]+)/i);
    if (m) return Number(m[1].replace(',', '.'));
  }
  return null;
}

/**
 * Plockar ut tilläggen. Talet måste stå SIST eller följas av "kr" — annars
 * fastnar "Löv 41m3f" som 41 kronor. "Krönt +1,5" utan kr måste däremot med.
 * Medel-raden är grundpriset, inte ett tillägg.
 */
export function tillaggUr(harledning: string[]): { etikett: string; kr: number }[] {
  const ut: { etikett: string; kr: number }[] = [];
  for (const r of harledning) {
    if (/medel/i.test(r)) continue;
    const m = r.match(/([+-]?[0-9]+(?:[.,][0-9]+)?)\s*(?:kr\b|$)/i);
    if (!m) continue;
    ut.push({ etikett: r, kr: Number(m[1].replace(',', '.')) });
  }
  return ut;
}

export const arAvstand = (etikett: string) => /avst.nd/i.test(etikett);
