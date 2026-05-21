/**
 * Analys av vilotidsbrott enligt arbetstidslagen:
 * - Dygnsvila (§13): minst N sammanhängande timmar per 24h-period
 * - Veckovila (§14): minst M sammanhängande timmar under VARJE PERIOD om P dagar
 *   (rullande P-dagarsfönster — inte kalendervecka)
 *
 * Tröskelvärdena (N, M, P) läses från gs_avtal-tabellen och skickas in som
 * parameter. Inga hårdkodade siffror i denna fil — kallare som inte kan/vill
 * läsa avtalet kan skicka in default-värden (11, 36, 7) manuellt.
 *
 * Filen är fri från Supabase-imports — ren logik som är testbar utan DB.
 * Storage-lagret (hämta trösklar, spara brott) ligger i lib/vilobrott-storage.ts.
 *
 * OBS: dygnsvila_varning_h (orange "kort vila"-tröskel, default 12h) påverkar
 * INTE brott-detektering — det är ingen lagöverträdelse, bara en varningszon.
 * UI läser den direkt från gs_avtal för att färga viloperioder mellan
 * krav_h och varning_h.
 */

export type Arbetsdag = {
  datum: string;       // YYYY-MM-DD
  start_tid?: string | null;  // HH:MM eller HH:MM:SS
  slut_tid?: string | null;
};

export type VilaTrosklar = {
  dygnsvila_krav_h: number;            // Default 11 enligt §13
  dygnsvila_varning_h: number;         // Default 12 — orange UI-zon mellan krav_h och varning_h.
                                       // Används INTE av analyseraVilobrott — bara passare för UI.
  veckovila_krav_h: number;            // Default 36 enligt §14
  veckovila_fonster_dagar: number;     // Default 7 enligt §14 (rullande fönster)
  kompensation_deadline_dagar: number; // Default 14 — för deadline-beräkning vid orsak-svar.
                                       // Används INTE av analyseraVilobrott — bara passare.
};

export type Vilobrott = {
  typ: "dygnsvila" | "veckovila";
  datum: string;        // datum då brottet börjar (YYYY-MM-DD)
  vecka: number;        // ISO veckonummer (för visning)
  år: number;
  vila_h: number;       // antal timmar vila som faktiskt togs
  krav_h: number;       // kravet som överträddes (från trosklar)
  beskrivning: string;
};

function tidTillTimmar(t: string): { h: number; m: number } | null {
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function isoVecka(d: Date): { år: number; vecka: number } {
  // ISO 8601: torsdagen i samma vecka avgör året
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const veckonr = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  return { år: new Date(firstThursday).getUTCFullYear(), vecka: veckonr };
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function datumStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "19 maj" — svenska datum för läsbara brott-beskrivningar.
 *  YYYY-MM-DD finns ändå i beskrivningen via klockslag-kontext om man behöver
 *  exakt år; vid revision matchar man mot brott.datum-fältet i DB. */
function formatDatumKort(datum: string): string {
  const d = new Date(datum);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
}

/**
 * Konvertera arbetsdagar till tidsintervaller (start/end Date-objekt).
 * Hanterar arbete som korsar midnatt (om slut_tid <= start_tid antas slut nästa dag).
 */
type Intervall = { start: Date; end: Date };

function arbetsIntervaller(dagar: Arbetsdag[]): Intervall[] {
  const ut: Intervall[] = [];
  for (const d of dagar) {
    if (!d.start_tid || !d.slut_tid) continue;
    const s = tidTillTimmar(d.start_tid);
    const e = tidTillTimmar(d.slut_tid);
    if (!s || !e) continue;
    const start = new Date(`${d.datum}T${pad(s.h)}:${pad(s.m)}:00`);
    let end = new Date(`${d.datum}T${pad(e.h)}:${pad(e.m)}:00`);
    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 86400000); // korsar midnatt
    }
    ut.push({ start, end });
  }
  return ut.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Längsta sammanhängande gap utan arbete inom [windowStart, windowEnd].
 * Returneras i timmar.
 */
function maxGap(windowStart: Date, windowEnd: Date, intervaller: Intervall[]): number {
  const wsT = windowStart.getTime();
  const weT = windowEnd.getTime();
  if (weT <= wsT) return 0;

  // Klipp intervaller mot fönstret
  const klippta = intervaller
    .filter(i => i.end.getTime() > wsT && i.start.getTime() < weT)
    .map(i => ({
      start: Math.max(i.start.getTime(), wsT),
      end: Math.min(i.end.getTime(), weT),
    }))
    .sort((a, b) => a.start - b.start);

  let max = 0;
  let cursor = wsT;
  for (const i of klippta) {
    if (i.start > cursor) max = Math.max(max, i.start - cursor);
    if (i.end > cursor) cursor = i.end;
  }
  if (weT > cursor) max = Math.max(max, weT - cursor);
  return max / 3600000;
}

export function analyseraVilobrott(
  arbetsdagar: Arbetsdag[],
  trosklar: VilaTrosklar,
): Vilobrott[] {
  const brott: Vilobrott[] = [];
  const sorterad = [...arbetsdagar]
    .filter(r => r.start_tid && r.slut_tid)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  if (sorterad.length === 0) return brott;

  /* ─── DYGNSVILA (§13): tid mellan slut_tid på dag N och start_tid på dag N+x ───
     Hoppar över par som ligger mer än veckovila_fonster_dagar dagar isär —
     då finns inget meningsfullt direkt-gap att kalla "dygnsvila". */
  for (let i = 0; i < sorterad.length - 1; i++) {
    const dag1 = sorterad[i], dag2 = sorterad[i + 1];
    const dagarMellan = Math.round(
      (new Date(dag2.datum).getTime() - new Date(dag1.datum).getTime()) / 86400000
    );
    if (dagarMellan > trosklar.veckovila_fonster_dagar) continue;

    const slut1 = tidTillTimmar(dag1.slut_tid!);
    const start2 = tidTillTimmar(dag2.start_tid!);
    if (!slut1 || !start2) continue;

    const d1 = new Date(`${dag1.datum}T${pad(slut1.h)}:${pad(slut1.m)}:00`);
    const d2 = new Date(`${dag2.datum}T${pad(start2.h)}:${pad(start2.m)}:00`);
    const vila = (d2.getTime() - d1.getTime()) / 3600000;
    if (vila > 0 && vila < trosklar.dygnsvila_krav_h) {
      const v = isoVecka(new Date(dag1.datum));
      brott.push({
        typ: "dygnsvila",
        datum: dag1.datum,
        vecka: v.vecka,
        år: v.år,
        vila_h: Math.round(vila * 10) / 10,
        krav_h: trosklar.dygnsvila_krav_h,
        beskrivning: `Du slutade ${dag1.slut_tid?.slice(0, 5)} den ${formatDatumKort(dag1.datum)} och började ${dag2.start_tid?.slice(0, 5)} den ${formatDatumKort(dag2.datum)} — ${(Math.round(vila * 10) / 10)} h vila, kravet är ${trosklar.dygnsvila_krav_h} h.`,
      });
    }
  }

  /* ─── VECKOVILA (§14): rullande fönster ───
     För varje datum N i analyserad period: kolla om fönstret
     [N-(P-1) dagar 00:00, N 23:59:59] innehåller ett sammanhängande
     gap på minst veckovila_krav_h. Om inte → brott på det datumet.

     För att inte rapportera samma "stretch" av brott flera dagar i rad
     slås konsekutiva brott-dagar ihop till ETT brott som visar startdatum
     och den lägsta vila-tid som uppmättes under stretchen.
  */
  const intervaller = arbetsIntervaller(sorterad);
  if (intervaller.length === 0) return brott;

  const första = new Date(sorterad[0].datum + "T00:00:00");
  const sista = new Date(sorterad[sorterad.length - 1].datum + "T00:00:00");
  const fönsterDagarBakåt = trosklar.veckovila_fonster_dagar - 1;

  type DagligResultat = { datum: string; max_h: number };
  const dagliga: DagligResultat[] = [];

  for (let dt = new Date(första); dt.getTime() <= sista.getTime(); dt.setDate(dt.getDate() + 1)) {
    const windowStart = new Date(dt);
    windowStart.setDate(dt.getDate() - fönsterDagarBakåt);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(dt);
    windowEnd.setHours(23, 59, 59, 999);
    const max_h = maxGap(windowStart, windowEnd, intervaller);
    dagliga.push({ datum: datumStr(dt), max_h });
  }

  // Slå ihop konsekutiva brott-dagar till en stretch
  let runStart: DagligResultat | null = null;
  let runMin = Infinity;
  let runEnd: string | null = null;

  const emit = () => {
    if (!runStart) return;
    const v = isoVecka(new Date(runStart.datum));
    const vilaH = Math.round(runMin * 10) / 10;
    const startTxt = formatDatumKort(runStart.datum);
    const slutTxt = runEnd && runEnd !== runStart.datum
      ? formatDatumKort(runEnd)
      : startTxt;
    brott.push({
      typ: "veckovila",
      datum: runStart.datum,
      vecka: v.vecka,
      år: v.år,
      vila_h: vilaH,
      krav_h: trosklar.veckovila_krav_h,
      beskrivning: `Mellan ${startTxt} och ${slutTxt} hade du som mest ${vilaH} h sammanhängande vila — kravet är ${trosklar.veckovila_krav_h} h i rullande ${trosklar.veckovila_fonster_dagar}-dagarsfönster.`,
    });
  };

  for (const r of dagliga) {
    if (r.max_h < trosklar.veckovila_krav_h) {
      if (!runStart) { runStart = r; runMin = r.max_h; runEnd = r.datum; }
      else { runMin = Math.min(runMin, r.max_h); runEnd = r.datum; }
    } else if (runStart) {
      emit();
      runStart = null; runMin = Infinity; runEnd = null;
    }
  }
  if (runStart) emit();

  return brott;
}
