/**
 * Kör radbyggaren mot två riktiga VO och skriver raderna som text.
 *
 * Indata är AVLÄST UR PROD 2026-09-26, inte påhittat. Hämtningslagret
 * (hamtaVoUnderlag) är inte byggt än — poängen är att se vad som skulle hamna
 * på fakturan innan någon bygger en vy eller en route.
 *
 *   npx tsx scripts/visa-fakturarader.ts
 */
import {
  byggRader, garAttSkicka, type VoUnderlag, type FakturaRad,
} from '../lib/faktura/radbyggare';
import {
  lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
  type AcordPris,
} from '../lib/ekonomi/acord';

/* ── Prislistorna, som de står i prod (giltig_fran 2025-06-03) ── */
const ACORD: AcordPris[] = [
  { medelstam: 0.20, pris_total: 130, pris_skordare: 81, pris_skotare: 49, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.25, pris_total: 123, pris_skordare: 75, pris_skotare: 48, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.30, pris_total: 117, pris_skordare: 70, pris_skotare: 47, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.35, pris_total: 113, pris_skordare: 67, pris_skotare: 46, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.40, pris_total: 107, pris_skordare: 62, pris_skotare: 45, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.45, pris_total: 104, pris_skordare: 60, pris_skotare: 44, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.50, pris_total: 103, pris_skordare: 59, pris_skotare: 44, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.55, pris_total: 101, pris_skordare: 57, pris_skotare: 44, giltig_fran: '2025-06-03', giltig_till: null },
  { medelstam: 0.60, pris_total: 100, pris_skordare: 56, pris_skotare: 44, giltig_fran: '2025-06-03', giltig_till: null },
];
const TRAKT = [
  { fran_m3fub: 0, till_m3fub: 200, tillagg_kr_per_m3fub: 5, giltig_fran: '2025-06-03', giltig_till: null },
  { fran_m3fub: 200, till_m3fub: 400, tillagg_kr_per_m3fub: 4, giltig_fran: '2025-06-03', giltig_till: null },
  { fran_m3fub: 400, till_m3fub: 800, tillagg_kr_per_m3fub: 2, giltig_fran: '2025-06-03', giltig_till: null },
  { fran_m3fub: 800, till_m3fub: 1500, tillagg_kr_per_m3fub: 0, giltig_fran: '2025-06-03', giltig_till: null },
  { fran_m3fub: 1500, till_m3fub: 2500, tillagg_kr_per_m3fub: -1, giltig_fran: '2025-06-03', giltig_till: null },
  { fran_m3fub: 2500, till_m3fub: null, tillagg_kr_per_m3fub: -2, giltig_fran: '2025-06-03', giltig_till: null },
];
const SORTCONF = { grundantal: 6, kr_per_extra_sortiment: 2, giltig_fran: '2025-06-03', giltig_till: null };
const AVSTAND = [{ grundavstand_m: 200, kr_per_100m: 4, giltig_fran: '2025-06-03', giltig_till: null }];
const KVALITET = 1.5;

/* ── dim_maskin.visningsnamn, avläst ur prod 2026-09-26 ────────────────
 * INGEN ny kolumn behövs — fältet finns. Men det stämmer INTE med vad Vida
 * ser på fakturan för två maskiner, och det är Martins val vilket som gäller:
 *   PONS20SDJAA270231  visningsnamn "Ponsse Scorpion"  fakturan "Gigant"
 *   A110148            visningsnamn "Elefant"          fakturan "King"
 *   A130743            visningsnamn "Elephant King 2026"  fakturan "King"
 *   A030353            visningsnamn "Wisent"           fakturan "Wisent"  ✓
 * Radbyggaren FÖRESLÅR texten ur visningsnamn; faktura_rad.benamning är en
 * vanlig text-kolumn och redigeras på raden i granskningen. */
const VISNINGSNAMN = {
  PONS20SDJAA270231: 'Ponsse Scorpion',
  A030353: 'Wisent',
  A110148: 'Elefant',
  A130743: 'Elephant King 2026',
} as const;

/* ── VO 11226833 Brokamåla — ACKORD ──────────────────────────────────── */
const BROK_VOL = 2186.79;
const BROK_STAM = 3153;
const brokamala: VoUnderlag = {
  vo_nummer: '11226833',
  objektnamn: 'Brokamåla 15 V-H avd 20 -25',
  kontraktsnummer: '972114',
  bolag: 'Vida',
  fortnox_kundnr: 1,
  timpeng: false,
  avrakningsdatum: '2026-07-31',
  volymM3fub: BROK_VOL,
  medelstam: BROK_VOL / BROK_STAM,
  sortimentgrupper: 6,               // dim_objekt.sortiment_grupper_manuell
  terrangKr: 2,                      // dim_objekt.terrang_kr_manuell
  // skotavstand_manuell = 450 m (redan enkelriktat)
  skotAvstandKr: skotAvstandKr('2026-07-31', 450, BROK_VOL, AVSTAND as any),
  andelSkordareManuell: null,
  acordList: ACORD,
  sortKr: sortimentTillagg(6, SORTCONF as any),
  traktKr: traktTillagg(BROK_VOL, TRAKT as any).krPerM3,
  kvalitetKr: KVALITET,
  maskiner: [
    { maskin_id: 'PONS20SDJAA270231', namn: VISNINGSNAMN.PONS20SDJAA270231, roll: 'skordare', kostnadsstalle: 'SCO', g15h: 50.99, timpris: 1920 },
    { maskin_id: 'A030353', namn: VISNINGSNAMN.A030353, roll: 'skotare', kostnadsstalle: 'M14', g15h: 111.56, timpris: 1015 },
  ],
  flyttar: [
    { id: '3b7aece4-9429-4ee9-bddb-2002462d25be', datum: '2026-09-25', maskin: 'A030353', km: 44 },
  ],
  manuellaPoster: [],
};

/* ── VO 11217392 Jätsbygd — TIMPENG, tre maskiner ────────────────────── */
const jatsbygd: VoUnderlag = {
  vo_nummer: '11217392',
  objektnamn: 'Jätsbygd au 2026',
  kontraktsnummer: '973431',
  bolag: 'Vida',
  fortnox_kundnr: 1,
  timpeng: true,
  avrakningsdatum: '2026-08-21',
  volymM3fub: 1400.82,
  medelstam: 1400.82 / 4659,
  sortimentgrupper: 0,
  terrangKr: 0,
  skotAvstandKr: 0,
  andelSkordareManuell: null,
  acordList: ACORD,
  sortKr: 0, traktKr: 0, kvalitetKr: 0,
  maskiner: [
    { maskin_id: 'PONS20SDJAA270231', namn: VISNINGSNAMN.PONS20SDJAA270231, roll: 'skordare', kostnadsstalle: 'SCO', g15h: 49.46, timpris: 1920 },
    { maskin_id: 'A030353', namn: VISNINGSNAMN.A030353, roll: 'skotare', kostnadsstalle: 'M14', g15h: 61.58, timpris: 1015 },
    { maskin_id: 'A130743', namn: VISNINGSNAMN.A130743, roll: 'skotare', kostnadsstalle: 'EP', g15h: 45.71, timpris: 1285 },
  ],
  flyttar: [],
  manuellaPoster: [],
};

/* ── Utskrift ─────────────────────────────────────────────────────────── */
const kr = (n: number | null) =>
  n == null ? '—' : n.toFixed(2).replace('.', ',');
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const hoger = (s: string, n: number) => s.padStart(n);

function skriv(titel: string, u: VoUnderlag) {
  const rader = byggRader(u);
  const kan = garAttSkicka(u, rader);
  console.log(`\n${'═'.repeat(128)}`);
  console.log(`${titel}   VO ${u.vo_nummer}   kund ${u.fortnox_kundnr ?? 'SAKNAS'} (${u.bolag})   ` +
    `${u.timpeng ? 'TIMPENG' : 'ACKORD'}   avräknad ${u.avrakningsdatum ?? 'NEJ'}`);
  console.log('═'.repeat(128));
  console.log(
    pad('#', 3) + pad('art', 5) + pad('benämning', 34) + hoger('antal', 10) + ' ' +
    pad('enhet', 7) + pad('prisägare', 12) + hoger('à-pris', 9) + '  ' +
    pad('källa', 19) + 'status');
  console.log('─'.repeat(128));

  let summa = 0;
  for (const r of rader) {
    const belopp = r.a_pris ?? r.a_pris_beraknat;
    if (belopp != null && r.antal != null) summa += belopp * r.antal;
    console.log(
      pad(String(r.radnr), 3) +
      pad(r.artikelnr ?? '—', 5) +
      pad(r.benamning, 34) +
      hoger(r.antal == null ? '—' : kr(r.antal), 10) + ' ' +
      pad(r.enhet ?? '—', 7) +
      pad(r.prisagare, 12) +
      hoger(belopp == null ? 'hämtas' : kr(belopp), 9) + '  ' +
      pad(r.kalla, 19) +
      (r.status === 'klar' ? 'klar' : `${r.status}${r.fel_kod ? ' · ' + r.fel_kod : ''}`) +
      (r.kostnadsstalle ? `   [${r.kostnadsstalle}]` : ''));
    for (const d of r.harledning ?? []) {
      const v = d.belopp === 0 ? '' : ` ${d.belopp > 0 ? '+' : ''}${kr(d.belopp)}`;
      console.log('       └─ ' + d.etikett + v + (d.ungefarlig ? '  (viktat snitt)' : ''));
    }
  }
  console.log('─'.repeat(128));
  console.log(`Summa på de rader som har ett pris: ${kr(summa)} kr` +
    (rader.some(r => r.a_pris_beraknat == null && r.a_pris == null)
      ? '   (exkl. rader vars pris hämtas ur Fortnox)' : ''));
  console.log(kan.ok ? 'GÅR ATT SKICKA' : 'BLOCKERAT: ' + kan.hinder.join(' · '));

  if (!u.timpeng) {
    const rad = lookupAcordPris(u.medelstam, u.acordList);
    console.log(`\nAckordets grund:  medelstam ${u.medelstam.toFixed(3)} → klass ${rad?.medelstam}  ` +
      `pris_total ${rad?.pris_total}  (${rad?.pris_skordare}/${rad?.pris_skotare})`);
    const ovrigt = u.sortKr + u.traktKr + u.kvalitetKr + u.terrangKr;
    console.log(`Tillägg som delas: ${kr(ovrigt)} kr/m³  ` +
      `(krönt ${kr(u.kvalitetKr)} · storlek ${kr(u.traktKr)} · terräng ${kr(u.terrangKr)} · sortiment ${kr(u.sortKr)})`);
    console.log(`Avstånd (helt till skotaren): ${kr(u.skotAvstandKr)} kr = ${kr(u.skotAvstandKr / u.volymM3fub)} kr/m³`);
  }
}

skriv('BROKAMÅLA', brokamala);
skriv('JÄTSBYGD', jatsbygd);

// Samma objekt med fördelningen överskriven — visar att fältet biter.
console.log('\n\n### Brokamåla med fördelningen överskriven till 2,00 på skördaren ###');
skriv('BROKAMÅLA (överskriven)', { ...brokamala, andelSkordareManuell: 2 });
