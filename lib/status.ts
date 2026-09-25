// Härlett, ALDRIG lagrat (#3). Räknar fram nästa förfall, status och ålder ur
// en kontrollrad. nasta_forfall / nasta_matarvarde FÅR cachas i DB men ska
// alltid kunna räknas om här. En kontroll UTAN intervall och utan mål räknas
// aldrig ned — den visar bara ålder.

import { matarenhet, varningDagar, type Resurstyp } from './kontrolltyper';

// ── Namngivna gränser ──────────────────────────────────────────────────────
// Varför: en förfallen kontroll (<= 0 kvar) är kritisk. "Snart"-fönstret för
// datum är per kontrolltyp (varningDagar). För mätarbaserade kontroller finns
// ingen typspecifik siffra ännu → globala defaults nedan.
export const UTGANGEN_GRANS = 0;        // dagar/enheter kvar <= 0 → 'utgangen'
export const SNART_TIMMAR_DEFAULT = 50; // h kvar → 'snart' (maskin-service)
export const SNART_KM_DEFAULT = 500;    // km kvar → 'snart' (bil/lastbil-service)

export type Statusniva = 'ok' | 'snart' | 'utgangen';

export type Kontrollrad = {
  typ: string;
  intervall_manader: number | null;
  intervall_timmar: number | null;
  intervall_km: number | null;
  senast_utford: string | null;
  senast_matarstallning: number | null;
  nasta_forfall: string | null;
  nasta_matarvarde: number | null;
};

export type Berakning =
  | { slag: 'datum'; forfall: string; dagar: number; status: Statusniva }
  | { slag: 'matare'; enhet: 'timmar' | 'km'; mal: number; kvar: number | null; status: Statusniva }
  | { slag: 'ingen'; alder: string | null };

// ── Datumhjälp ─────────────────────────────────────────────────────────────
export function dagarKvar(datum: string): number {
  const idag = new Date();
  idag.setHours(0, 0, 0, 0);
  const d = new Date(datum + 'T00:00:00');
  return Math.round((d.getTime() - idag.getTime()) / 86400000);
}

export function laggTillManader(datum: string, manader: number): string {
  const d = new Date(datum + 'T00:00:00');
  const dag = d.getDate();
  d.setMonth(d.getMonth() + manader);
  // Månadsspill (31 jan + 1 mån): kliv tillbaka till sista giltiga dagen.
  if (d.getDate() < dag) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

/** "2 år 4 mån", "3 mån", "12 dagar" — för händelser/kontroller utan nedräkning. */
export function alder(datum: string | null): string | null {
  if (!datum) return null;
  const nu = new Date();
  const d = new Date(datum + 'T00:00:00');
  let manader = (nu.getFullYear() - d.getFullYear()) * 12 + (nu.getMonth() - d.getMonth());
  if (nu.getDate() < d.getDate()) manader -= 1;
  if (manader < 1) {
    const dagar = Math.max(0, dagarKvar(datum) * -1);
    return `${dagar} dagar`;
  }
  const ar = Math.floor(manader / 12);
  const kvarMan = manader % 12;
  if (ar === 0) return `${kvarMan} mån`;
  if (kvarMan === 0) return `${ar} år`;
  return `${ar} år ${kvarMan} mån`;
}

// ── Härlett nästa förfall ──────────────────────────────────────────────────
/** Datummål: härlett ur senast_utford + intervall_manader, annars cache/explicit. */
export function harledForfallDatum(k: Kontrollrad): string | null {
  if (k.intervall_manader != null && k.senast_utford) {
    return laggTillManader(k.senast_utford, k.intervall_manader);
  }
  return k.nasta_forfall;
}

/** Mätarmål: härlett ur senast_matarstallning + intervall, annars cache/explicit. */
export function harledMatarvarde(k: Kontrollrad): number | null {
  const iv = k.intervall_timmar ?? k.intervall_km;
  if (iv != null && k.senast_matarstallning != null) {
    return k.senast_matarstallning + iv;
  }
  return k.nasta_matarvarde;
}

// ── Status ─────────────────────────────────────────────────────────────────
function statusFranDagar(dagar: number, snartDagar: number): Statusniva {
  if (dagar <= UTGANGEN_GRANS) return 'utgangen';
  if (dagar <= snartDagar) return 'snart';
  return 'ok';
}

function statusFranKvar(kvar: number, snartGrans: number): Statusniva {
  if (kvar <= UTGANGEN_GRANS) return 'utgangen';
  if (kvar <= snartGrans) return 'snart';
  return 'ok';
}

/**
 * Räknar fram vad kontrollen faktiskt visar. Prioritet: datummål → mätarmål →
 * ren ålder. Mätargrenen räknar ned mot nasta_matarvarde direkt efter migrering
 * (utan påhittad historik); när en service registreras sätts senast_matarstallning
 * och modellen självläker till härlett mål.
 */
export function berakna(k: Kontrollrad, resurstyp: Resurstyp, matarstallning: number | null): Berakning {
  const forfall = harledForfallDatum(k);
  if (forfall) {
    const dagar = dagarKvar(forfall);
    return { slag: 'datum', forfall, dagar, status: statusFranDagar(dagar, varningDagar(k.typ)) };
  }

  const mal = harledMatarvarde(k);
  if (mal != null) {
    const enhet = matarenhet(resurstyp) ?? 'timmar';
    const snartGrans = enhet === 'timmar' ? SNART_TIMMAR_DEFAULT : SNART_KM_DEFAULT;
    const kvar = matarstallning != null ? mal - matarstallning : null;
    return {
      slag: 'matare',
      enhet,
      mal,
      kvar,
      status: kvar != null ? statusFranKvar(kvar, snartGrans) : 'ok',
    };
  }

  return { slag: 'ingen', alder: alder(k.senast_utford) };
}
