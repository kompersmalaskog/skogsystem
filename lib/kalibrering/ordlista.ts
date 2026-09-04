/**
 * ETT SPRÅK I KALIBRERINGSVYN — den enda källan för ord och namn.
 *
 * Alla vyer, modaler, hjälpen och rapporten läser härifrån. Ingen vy får ha
 * egna varianter ("Drar den åt ett håll?", "Dia (M−O)", "syst./std", råa
 * maskin-id:n) — de var exakt det designgenomgången 2026-09-04 hittade.
 *
 * Vardagsfrågan står stor i UI:t, facktermen dämpad under — så föraren lär
 * sig Vidas/Biometrias språk utan att behöva kunna det först.
 */

/** De tre diametermåtten: vardagsfråga + fackterm. Nycklarna = kravprofil.metrik. */
export const MATT = {
  traffprocent: { fraga: 'Träffar den rätt?', term: 'träffprocent' },
  systematisk: { fraga: 'Går den rakt?', term: 'systematisk avvikelse' },
  standardavv: { fraga: 'Flaxar den?', term: 'standardavvikelse' },
} as const;
export type MattKey = keyof typeof MATT;

/**
 * Skillnaden maskin − operatör på EN stock eller EN kontroll. Hette tidigare
 * "Längd (M−O)" / "Dia (M−O)" — en formel, inte ett ord. Samma mönster som
 * kontroll-modalens "Längd · träffprocent": mått · metrik.
 */
export const AVVIKELSE = {
  langd: 'Längd · avvikelse',
  dia: 'Diameter · avvikelse',
  topp: 'Topp · avvikelse',
} as const;

/**
 * MASKINNAMN — ett id som "PONS20SDJAA270231" får aldrig nå användaren.
 *
 * maskinNamn:     "PONSSE Scorpion Giant 8W", "Rottne Industri AB R64428"
 *                 (tillverkare + modell, dubbelt prefix strippat). Saknas
 *                 dim_maskin-rad: ett kort id (≤ 8 tecken, t.ex. R64428) är
 *                 ett namn i sig — ett långt serienummer blir "Okänd maskin".
 * maskinKortNamn: för trånga kolumner. Kort id → id:t ("R64428"), annars
 *                 namnets första ord ("PONSSE").
 */
export type MaskinNamnRad = { maskin_id: string; tillverkare?: string | null; modell?: string | null };

const KORT_ID_MAX = 8;

export const maskinNamn = (m: MaskinNamnRad): string => {
  const t = (m.tillverkare ?? '').trim();
  const mod = (m.modell ?? '').trim();
  if (!t && !mod) return m.maskin_id.length <= KORT_ID_MAX ? m.maskin_id : 'Okänd maskin';
  if (!mod) return t;
  if (!t) return mod;
  // Om modell börjar med tillverkare (case-insensitivt), släpp prefixet
  if (mod.toLowerCase().startsWith(t.toLowerCase())) return mod;
  return `${t} ${mod}`;
};

export const maskinKortNamn = (m: MaskinNamnRad): string => {
  if (m.maskin_id.length <= KORT_ID_MAX) return m.maskin_id;
  const namn = maskinNamn(m);
  return namn.split(' ')[0] || namn;
};
