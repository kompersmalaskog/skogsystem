// Texterna om vadret och maskinerna som rundvyn (Forutsattningar.tsx) OCH A4-rapporten
// (lib/egenkontrollRapport.ts) skriver. EN KALLA, sa att de aldrig kan saga olika saker om
// samma runda. Ren text - ingen React, ingen databas.

import { DAGAR_FORE, type VaderSnapshot } from '@/lib/egenkontrollvader';

const MANADER = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "8–26 maj", "24 apr–7 maj", "26 dec 2025–3 jan 2026". */
export function period(fran: string | null, till: string | null): string | null {
  if (!fran || !till) return null;
  const [aY, aM, aD] = fran.split('-').map(Number);
  const [bY, bM, bD] = till.split('-').map(Number);
  if (!aY || !bY) return null;
  const m = (i: number) => MANADER[i - 1] ?? '';
  if (aY !== bY) return `${aD} ${m(aM)} ${aY}–${bD} ${m(bM)} ${bY}`;
  if (aM !== bM) return `${aD} ${m(aM)}–${bD} ${m(bM)}`;
  return `${aD}–${bD} ${m(aM)}`;
}

export function mm(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)} mm`;
}

export function grader(v: number | null): string {
  if (v == null) return '—';
  const t = Math.round(v * 10) / 10;
  return `${t > 0 ? '+' : ''}${String(t).replace('.', ',')} °C`;
}

/**
 * Bandtexten.
 *
 * null betyder OKANT, inte "utan band" - snapshotten skriver null sa fort
 * band-faltet ar falskt, eftersom vi inte kan skilja "korde utan band" fran
 * "ingen rorde faltet" (se byggMaskinSnapshot). "Utan band" och "uppgift
 * saknas" far aldrig se likadana ut, sa de har var sin text.
 */
export function bandText(band: boolean | null | undefined, par: string | null | undefined): string {
  if (band == null) return 'Band uppgift saknas';
  if (band === false) return 'Utan band';
  return par ? `Band ${par} par` : 'Band, antal par okänt';
}

/** Kort skal till att vadret saknas — samma ordning som statusarna. */
export function saknasKort(vader: VaderSnapshot | null): string {
  if (!vader) return 'Vädret sparades inte';
  if (vader.status === 'saknar_koordinat') return 'Objektet saknar koordinat';
  if (vader.status === 'saknar_skotdatum') return 'Skotdatum saknas';
  return 'Vädret kunde inte hämtas';
}

/** Hela skalet, med vad man gor at det. De tre atgardas OLIKA. */
export function saknasLangt(vader: VaderSnapshot | null): string {
  if (!vader) {
    return 'Vädret sparades inte när rundan startades. Det hämtas en gång vid start och fylls inte i i efterhand — dokumentet ska säga samma sak om två år som i dag.';
  }
  if (vader.status === 'saknar_koordinat') {
    return 'Objektet saknar koordinat, så det går inte att säga vilket väder som rådde. Sätt en koordinat på objektet, så följer vädret med nästa runda.';
  }
  if (vader.status === 'saknar_skotdatum') {
    return 'Vi vet inte när trakten skotades. Objektet är inte kopplat till maskindatan, och utan den finns ingen ärlig källa till skotningsdatumen — objektets egna datum är skördens.';
  }
  return `Vädret kunde inte hämtas när rundan startades${vader.fel ? ` (${vader.fel})` : ''}. Det hämtas bara en gång, så raden fylls inte i i efterhand.`;
}

/**
 * Forutsattningarna som textrader, for A4-rapporten. Samma ord som rundvyns rad
 * (Skotat ..., mm fore/under, band) - bara utskrivna i sin helhet: rapporten har plats for
 * bada maskinerna och for frostnatterna, rundvyns tva-radsrad har inte det.
 *
 * Saknas vadret star skalet kort (saknasKort), aldrig en tom rad: "Vadret sparades inte" ar
 * en uppgift, en luckan ar det inte.
 */
export function forutsattningsRader(
  vader: VaderSnapshot | null,
  maskiner: {
    skordare_maskin: string | null; skordare_band: boolean | null; skordare_band_par: string | null;
    skotare_maskin: string | null; skotare_band: boolean | null; skotare_band_par: string | null;
    skotare_lastreder_breddat: boolean | null; skotare_extra_vagn: boolean | null;
    barighet: string | null; terrang: string | null;
  } | null,
): string[] {
  const rader: string[] = [];
  if (vader?.status === 'ok') {
    const nar = period(vader.skot_start, vader.skot_slut);
    const delar = [
      nar ? `Skotat ${nar}` : null,
      `${mm(vader.mm_fore)} före, ${mm(vader.mm_under)} under`,
      vader.frostnatter == null
        ? 'temperatur saknas'
        : `${vader.frostnatter} frostnätter, lägsta ${grader(vader.min_temp)}`,
    ].filter(Boolean);
    rader.push(`Väder: ${delar.join(' · ')}`);
  } else {
    rader.push(`Väder: ${saknasKort(vader)}`);
  }
  if (maskiner) {
    rader.push(`Skördare ${maskiner.skordare_maskin ?? 'uppgift saknas'} · ${bandText(maskiner.skordare_band, maskiner.skordare_band_par)}`);
    rader.push(
      `Skotare ${maskiner.skotare_maskin ?? 'uppgift saknas'} · ${bandText(maskiner.skotare_band, maskiner.skotare_band_par)}`
      + (maskiner.skotare_lastreder_breddat === true ? ' · breddat lastreder' : '')
      + (maskiner.skotare_extra_vagn === true ? ' · extra vagn' : ''),
    );
    if (maskiner.barighet || maskiner.terrang) {
      rader.push([
        maskiner.barighet ? `Bärighet ${maskiner.barighet}` : null,
        maskiner.terrang ? `terräng ${maskiner.terrang}` : null,
      ].filter(Boolean).join(' · '));
    }
  }
  return rader;
}
