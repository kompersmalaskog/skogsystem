// Vadret som radde nar trakten kordes.
//
// HAMTAS EN GANG, VID GENERERING. Aldrig live. Tva skal: planeraren star
// utan tackning i skogen, och dokumentet ska saga samma sak om tva ar som
// i dag. Ett varde som hamtas om vid varje oppning ar inget dokument.
//
// STATUS LIGGER I JSON:EN, ALDRIG I ATT FALTET AR NULL. Tre skilda skal kan
// gora att vader saknas - ingen koordinat, inget skotdatum, API:t svarade
// inte - och de atgardas OLIKA. Ett null kan bara bara ett skal, och da
// skulle "forsok igen senare" och "objektet saknar maskindata" se likadana
// ut. Nar den har filen ar inkopplad betyder vader IS NULL exakt en sak:
// rundan startades innan funktionen fanns.
//
// Kalla: Open-Meteos arkiv (ERA5). Fritt, ingen nyckel, CORS oppet. Samma
// tjanst som maskinflytt redan anvander for vadret vid lamning.

/** Fonstret fore skotningen. Regn som fallit innan sitter kvar i marken. */
export const DAGAR_FORE = 14;

const ARKIV_URL = 'https://archive-api.open-meteo.com/v1/archive';
const TIMEOUT_MS = 5000;

export type VaderStatus = 'ok' | 'saknar_koordinat' | 'saknar_skotdatum' | 'api_fel';

export type VaderDygn = {
  datum: string;
  nederbord_mm: number | null;
  min_temp: number | null;
};

export type VaderSnapshot = {
  status: VaderStatus;
  /** Kort skal nar status ar api_fel. Null annars. */
  fel: string | null;
  kalla: string;
  hamtad: string;

  skord_start: string | null;
  skord_slut: string | null;
  skot_start: string | null;
  skot_slut: string | null;

  dygn: VaderDygn[];
  /** Summa nederbord de DAGAR_FORE dygnen fore skot_start. */
  mm_fore: number | null;
  /** Summa nederbord under skotningsfonstret. */
  mm_under: number | null;

  // Temperaturen raknas BARA over skotningsfonstret. Hossjomala visar varfor:
  // enda minusgraden i hela intervallet (-0,1) lag tio dygn FORE skotningen.
  // Rakat over hela intervallet hade den sagt "tjale" om en trakt dar lagsta
  // temperatur under arbetet var +1,3 och antalet frostnatter noll.
  /** Lagsta dygnsminimum under skotningen. */
  min_temp: number | null;
  /** Antal dygn med minimum under noll under skotningen. */
  frostnatter: number | null;
  // TJALE ar ett MARKtillstand, inte en lufttemperatur, och visas darfor
  // aldrig i vyn - vyn skriver ut frostnatter och lagsta grad i stallet.
  // Faltet ligger kvar for framtiden, nar det finns nagot som faktiskt
  // beskriver markens tillstand att jamfora mot.
  tjale: boolean | null;
};

/** Dagar bakat fran ett YYYY-MM-DD, i UTC sa sommartid inte flyttar datumet. */
export function datumMinus(datum: string, dagar: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dagar);
  return d.toISOString().slice(0, 10);
}

function tomt(status: VaderStatus, fel: string | null = null): VaderSnapshot {
  return {
    status,
    fel,
    kalla: 'open-meteo/era5',
    hamtad: new Date().toISOString(),
    skord_start: null, skord_slut: null, skot_start: null, skot_slut: null,
    dygn: [],
    mm_fore: null, mm_under: null,
    min_temp: null, frostnatter: null, tjale: null,
  };
}

function summa(varden: (number | null)[]): number {
  return Math.round(varden.reduce<number>((a, v) => a + (v ?? 0), 0) * 10) / 10;
}

export type Arbetsfonster = {
  skord_start: string | null;
  skord_slut: string | null;
  skot_start: string | null;
  skot_slut: string | null;
};

/**
 * Hamtar dygnsvarden for fonstret och sammanfattar det.
 *
 * Returnerar ALLTID en snapshot - aldrig ett kastat fel. Vadret far inte
 * hindra att en runda startas i skogen, sa varje sant som kan ga fel slutar
 * i en status som vyn kan beratta om.
 */
export async function hamtaVader(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fonster: Arbetsfonster,
): Promise<VaderSnapshot> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return tomt('saknar_koordinat');
  }
  const { skot_start: skotStart, skot_slut: skotSlut } = fonster;
  if (!skotStart || !skotSlut) return tomt('saknar_skotdatum');

  const fran = datumMinus(skotStart, DAGAR_FORE);
  const url =
    `${ARKIV_URL}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&start_date=${fran}&end_date=${skotSlut}` +
    '&daily=precipitation_sum,temperature_2m_min&timezone=Europe%2FStockholm';

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const svar = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    const kropp = await svar.json().catch(() => null);
    // Arkivet svarar 400 MED en JSON-kropp {error:true, reason:"..."}. Bara
    // r.ok racker inte - och bara kroppen racker inte heller.
    if (!svar.ok || !kropp || kropp.error) {
      const skal = typeof kropp?.reason === 'string' ? kropp.reason : `HTTP ${svar.status}`;
      return tomt('api_fel', skal);
    }
    const d = kropp.daily;
    if (!d || !Array.isArray(d.time) || d.time.length === 0) {
      return tomt('api_fel', 'Svaret saknade dygnsvärden.');
    }

    const dygn: VaderDygn[] = d.time.map((datum: string, i: number) => ({
      datum,
      nederbord_mm: Number.isFinite(d.precipitation_sum?.[i]) ? d.precipitation_sum[i] : null,
      min_temp: Number.isFinite(d.temperature_2m_min?.[i]) ? d.temperature_2m_min[i] : null,
    }));

    const fore = dygn.filter((x) => x.datum < skotStart);
    const under = dygn.filter((x) => x.datum >= skotStart);
    const temperaturer = under.map((x) => x.min_temp).filter((x): x is number => x != null);

    return {
      status: 'ok',
      fel: null,
      kalla: 'open-meteo/era5',
      hamtad: new Date().toISOString(),
      skord_start: fonster.skord_start,
      skord_slut: fonster.skord_slut,
      skot_start: skotStart,
      skot_slut: skotSlut,
      dygn,
      mm_fore: summa(fore.map((x) => x.nederbord_mm)),
      mm_under: summa(under.map((x) => x.nederbord_mm)),
      min_temp: temperaturer.length ? Math.min(...temperaturer) : null,
      frostnatter: temperaturer.length ? temperaturer.filter((x) => x < 0).length : null,
      tjale: temperaturer.length ? temperaturer.some((x) => x < 0) : null,
    };
  } catch (e) {
    // AbortError hamnar har - 5 s ar taket. En runda ska ga att starta.
    const skal = e instanceof Error && e.name === 'AbortError'
      ? 'Väderhämtningen tog för lång tid.'
      : 'Vädertjänsten kunde inte nås.';
    return tomt('api_fel', skal);
  }
}
