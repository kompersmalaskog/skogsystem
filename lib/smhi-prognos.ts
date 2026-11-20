// SMHI:s punktprognos SNOW1gv1 (ersätter PMP3gv2, som SMHI stängde 2026-03-31 — pmp3g/version/2 svarar 404). EN läsare för hela appen.
//
// Svarsformatet (SNOW1gv1) som skiljer sig från PMP3g:
//   • tidsstegen ligger i `timeSeries[]` med `time` (inte `validTime`) och en PLATT `data` med läsbara namn (inte `parameters[{name, values}]`)
//   • namnen: air_temperature (°C), symbol_code (1–27, samma skala som Wsymb2), wind_speed (m/s), wind_from_direction (°),
//     predominant_precipitation_type_at_surface (kategori som pcat), precipitation_amount_mean (mm)
//   • saknat värde = 9999 (aldrig 0)
//   • nederbörd är en MÄNGD i mm över intervallet som slutar vid `time` och börjar vid `intervalParametersStartTime`, inte en intensitet (mm/h) som pmean var.
//     Stegen är korta först och längre längre fram, så mängder måste fördelas på tid, aldrig summeras rått som pmean-raderna gjorde.
// Fältnamnen och 9999-regeln är hämtade ur SMHI:s migrationsbeskrivning (MagicMirror#4081) och integrationen swetoast/ha-smhi — den officiella parameterlistan
// (opendata.smhi.se/metfcst/snow1gv1/parameters) har inte kunnat läsas från bygget. Mängd-i-mm-tolkningen är därför det som ska kontrolleras mot ett riktigt svar.

export interface PrognosSteg {
  /** Tidpunkten (ms). */
  ms: number;
  /** Intervallets start (ms) för nederbörden: `intervalParametersStartTime`, annars förra stegets tid. null = okänd (första steget). */
  startMs: number | null;
  temp: number | null;
  /** SMHI:s vädersymbol 1–27 (Wsymb2-skalan). */
  symbol: number | null;
  vindMs: number | null;
  vindRiktning: number | null;
  /** Nederbördskategori (pcat): 0 ingen, 1 snö, 2 snöblandat regn, 3 regn, 4 duggregn, 5 underkylt regn, 6 underkylt duggregn. */
  nederbordKategori: number | null;
  /** Nederbörd i mm över [startMs, ms]. null = saknas. */
  nederbordMm: number | null;
}

const SAKNAS = 9999;

const tal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v !== SAKNAS ? v : null);

/** SNOW1gv1-svaret → tidssteg i tidsordning. Ogiltiga steg släpps; ett svar utan steg ger tom lista. */
export function snow1gTillSteg(json: unknown): PrognosSteg[] {
  const serie = (json as any)?.timeSeries;
  if (!Array.isArray(serie)) return [];
  const steg: PrognosSteg[] = [];
  for (const t of serie) {
    const ms = Date.parse(t?.time);
    if (!Number.isFinite(ms)) continue;
    const d = t?.data ?? {};
    const intervallStart = t?.intervalParametersStartTime ? Date.parse(t.intervalParametersStartTime) : NaN;
    steg.push({
      ms,
      startMs: Number.isFinite(intervallStart) ? intervallStart : null,
      temp: tal(d.air_temperature),
      symbol: tal(d.symbol_code),
      vindMs: tal(d.wind_speed),
      vindRiktning: tal(d.wind_from_direction),
      nederbordKategori: tal(d.predominant_precipitation_type_at_surface),
      nederbordMm: tal(d.precipitation_amount_mean) ?? tal(d.precipitation_amount_mean_deterministic),
    });
  }
  steg.sort((a, b) => a.ms - b.ms);
  // Intervall utan angiven start börjar där förra steget slutade.
  for (let i = 1; i < steg.length; i++) if (steg[i].startMs == null) steg[i].startMs = steg[i - 1].ms;
  return steg;
}

export const snow1gUrl = (lat: number, lon: number): string =>
  `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;

/**
 * Hämtar prognosen. I webbläsaren provas SMHI direkt och, går det inte (nätfel eller blockerad av CORS), appens egen proxy /api/smhi-prognos.
 * null = ingen prognos kunde hämtas (aldrig en gissning).
 */
export async function hamtaPrognos(lat: number, lon: number, medProxy: boolean = typeof window !== 'undefined'): Promise<PrognosSteg[] | null> {
  const forsok = async (url: string): Promise<PrognosSteg[] | null> => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const steg = snow1gTillSteg(await r.json());
      return steg.length ? steg : null;
    } catch { return null; }
  };
  const direkt = await forsok(snow1gUrl(lat, lon));
  if (direkt || !medProxy) return direkt;
  return forsok(`/api/smhi-prognos?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`);
}

const TIM = 3_600_000;

/**
 * Nederbörd (mm) per datum. Varje intervall delas lika över sina timmar och varje timme hamnar på datumet `datumAv` ger för timmens mitt —
 * det blir rätt även för 6- och 12-timmarssteg och över ett datumskifte. Datum utan nederbördsdata finns inte i svaret (okänt ≠ 0).
 */
export function nederbordPerDatum(steg: readonly PrognosSteg[], datumAv: (ms: number) => string, fran: number = -Infinity): Map<string, number> {
  const per = new Map<string, number>();
  for (const s of steg) {
    if (s.nederbordMm == null || s.startMs == null || s.ms <= s.startMs) continue;
    const langd = s.ms - s.startMs;
    const delar = Math.max(1, Math.round(langd / TIM));
    const stegMs = langd / delar;
    for (let i = 0; i < delar; i++) {
      const a = s.startMs + i * stegMs;
      const b = a + stegMs;
      if (b <= fran) continue;
      const del = a < fran ? (b - fran) / stegMs : 1;
      const datum = datumAv(a + stegMs / 2);
      per.set(datum, (per.get(datum) ?? 0) + (s.nederbordMm / delar) * del);
    }
  }
  return per;
}

/** Nederbörd (mm) mellan två tidpunkter, intervallen fördelade på tid. null = ingen nederbördsdata i fönstret (aldrig 0 för "vet inte"). */
export function nederbordMellan(steg: readonly PrognosSteg[], franMs: number, tillMs: number): number | null {
  let summa = 0;
  let sett = false;
  for (const s of steg) {
    if (s.nederbordMm == null || s.startMs == null || s.ms <= s.startMs) continue;
    const a = Math.max(s.startMs, franMs);
    const b = Math.min(s.ms, tillMs);
    if (b <= a) continue;
    summa += s.nederbordMm * ((b - a) / (s.ms - s.startMs));
    sett = true;
  }
  return sett ? summa : null;
}

/** Steget närmast `nuMs` som har en temperatur — "vädret just nu" (planeringsvyns TMA-panel). */
export function narmasteSteg(steg: readonly PrognosSteg[], nuMs: number): PrognosSteg | null {
  let bast: PrognosSteg | null = null;
  for (const s of steg) {
    if (s.temp == null) continue;
    if (!bast || Math.abs(s.ms - nuMs) < Math.abs(bast.ms - nuMs)) bast = s;
  }
  return bast;
}
