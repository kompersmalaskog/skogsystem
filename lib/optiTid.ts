/**
 * Opti-tider i databasen (fakt_skift, detalj_stam, detalj_gps_spar, detalj_kontroll_stock, hpr_filer).
 *
 * Maskinens klocka är svensk väggklocka. Importen lagrade den förut som om den vore UTC ("2026-10-12 09:04" lokal tid
 * blev 09:04Z, verkligt 07:04Z). Importen skriver nu det verkliga ögonblicket, och kolumnen `tid_ar_utc` säger vilken
 * konvention en rad har: true = verkligt UTC, false = äldre rad där väggklockan ligger som UTC.
 *
 * Läs ALDRIG en av de här tiderna rakt av. Gå genom funktionerna här, med radens `tid_ar_utc`, så får du rätt svar
 * oavsett vilken konvention raden har — också under övergången då en äldre importversion fortfarande skriver rader
 * i den gamla. (SQL har samma funktioner: opti_tid_utc / opti_tid_lokal.)
 */

const HELTIMME_MS = 3_600_000;

const STHLM = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Stockholms förskjutning mot UTC i minuter (60 vinter, 120 sommar) vid ett verkligt ögonblick. */
export function sthlmOffsetMin(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const x of STHLM.formatToParts(new Date(utcMs))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const vagg = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60_000;
  return vagg - Math.floor(utcMs / 60_000);
}

/**
 * Svensk väggklocka (uttryckt som "UTC-millisekunder", dvs. fälten är klockan) → verkligt ögonblick. Den dubbla timmen i
 * oktober tolkas som sommartid (första förekomsten) och den obefintliga i mars som vintertid — samma som importen
 * (stockholm_lokal_till_utc i skogsmaskin_import_version_6.py) och zoneinfo med fold=0.
 */
export function sthlmLokalTillUtcMs(vaggMs: number): number {
  const somm = vaggMs - 2 * HELTIMME_MS;
  if (sthlmOffsetMin(somm) === 120) return somm;
  return vaggMs - HELTIMME_MS;
}

type Delar = { datum: string; klockslag: string; broek: string; tz: string };

const TID_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;

function delar(tid: string): Delar | null {
  const m = TID_RE.exec(tid.trim());
  if (!m) return null;
  let tz = m[4] ?? "Z";
  if (/^[+-]\d{2}$/.test(tz)) tz += ":00";
  if (/^[+-]\d{4}$/.test(tz)) tz = tz.slice(0, 3) + ":" + tz.slice(3);
  return { datum: m[1], klockslag: m[2], broek: m[3] ?? "", tz };
}

/** Det värde databasen lagrat, som millisekunder (sekundprecision). null om det inte går att tolka. */
function lagratMs(tid: string | null | undefined): number | null {
  if (!tid) return null;
  const d = delar(tid);
  if (!d) return null;
  const ms = Date.parse(`${d.datum}T${d.klockslag}${d.tz}`);
  return Number.isFinite(ms) ? ms : null;
}

/** Verkligt UTC-ögonblick (millisekunder) för en lagrad Opti-tid. null om tiden saknas eller är otolkbar. */
export function optiTidUtcMs(tid: string | null | undefined, arUtc: boolean | null | undefined): number | null {
  const ms = lagratMs(tid);
  if (ms == null) return null;
  return arUtc ? ms : sthlmLokalTillUtcMs(ms);
}

/** Svensk väggklocka för en lagrad Opti-tid, som "UTC-millisekunder" (fälten är klockan). */
export function optiLokalMs(tid: string | null | undefined, arUtc: boolean | null | undefined): number | null {
  const ms = lagratMs(tid);
  if (ms == null) return null;
  return arUtc ? ms + sthlmOffsetMin(ms) * 60_000 : ms;
}

/**
 * Väggklockan i det GAMLA lagringsformatet ("2026-10-12T09:04:00+00:00" = klockan 09:04 svensk tid). Läsare som
 * jämför, sorterar och klipper klockslag ur strängen (HH:MM, lexikalisk ordning) fortsätter därmed ge exakt samma svar
 * som före övergången, för båda konventionerna. Mikrosekunderna följer med. Otolkbart eller tomt → null.
 */
export function optiTidSomVaggklocka(tid: string | null | undefined, arUtc: boolean | null | undefined): string | null {
  if (!tid) return null;
  const d = delar(tid);
  const vagg = optiLokalMs(tid, arUtc);
  if (!d || vagg == null) return null;
  return `${new Date(vagg).toISOString().slice(0, 19)}${d.broek}+00:00`;
}

/** Svenskt datum "YYYY-MM-DD" för en lagrad Opti-tid. */
export function optiLokalDag(tid: string | null | undefined, arUtc: boolean | null | undefined): string | null {
  const vagg = optiLokalMs(tid, arUtc);
  return vagg == null ? null : new Date(vagg).toISOString().slice(0, 10);
}

/** Svenskt klockslag "HH:MM" för en lagrad Opti-tid. */
export function optiLokalKlockslag(tid: string | null | undefined, arUtc: boolean | null | undefined): string | null {
  const vagg = optiLokalMs(tid, arUtc);
  return vagg == null ? null : new Date(vagg).toISOString().slice(11, 16);
}

/** Svensk timme 0–23 för en lagrad Opti-tid (webbläsarens egen tidszon spelar ingen roll). */
export function optiLokalTimme(tid: string | null | undefined, arUtc: boolean | null | undefined): number | null {
  const vagg = optiLokalMs(tid, arUtc);
  return vagg == null ? null : new Date(vagg).getUTCHours();
}

/**
 * Svenska dagens gränser som verkliga UTC-ögonblick: [från, till) för "YYYY-MM-DD". Används för att snäva in en
 * databasfråga; filtrera sedan exakt med optiLokalDag, eftersom en rad i den gamla konventionen ligger upp till
 * två timmar fel i ett rått tidsfilter.
 */
export function sthlmDagGranserUtc(datum: string): { fran: string; till: string } {
  const [a, m, d] = datum.split("-").map(Number);
  const fran = sthlmLokalTillUtcMs(Date.UTC(a, m - 1, d));
  const till = sthlmLokalTillUtcMs(Date.UTC(a, m - 1, d + 1));
  return { fran: new Date(fran).toISOString(), till: new Date(till).toISOString() };
}

/**
 * Ett fakt_skift-rad med de tre tiderna omräknade till svensk väggklocka i det gamla lagringsformatet (se optiTidSomVaggklocka).
 * Raden måste ha hämtats MED `tid_ar_utc`. En tid som saknas förblir null; en som inte går att tolka lämnas som den är, så ett
 * konstigt värde syns i stället för att försvinna.
 */
export function normaliseraSkiftTider<T extends { inloggning_tid?: any; maskin_inloggning_tid?: any; utloggning_tid?: any; tid_ar_utc?: boolean | null }>(r: T): T {
  const flagga = r.tid_ar_utc === true;
  const till = (v: any) => (v == null ? v : (optiTidSomVaggklocka(String(v), flagga) ?? v));
  return {
    ...r,
    inloggning_tid: till(r.inloggning_tid),
    maskin_inloggning_tid: till(r.maskin_inloggning_tid),
    utloggning_tid: till(r.utloggning_tid),
  };
}
