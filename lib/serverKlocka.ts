// SERVERKLOCKAN: datorns klocka kan gå fel, och på maskindatorn är det Ponsses system som troligen sätter den — "ställ in tid automatiskt" hjälper inte.
// Fältfel (Giant, Stefan, 2026-10-08): datorn gick ca 4 min FÖRE. GPS-åldersvakten (lib/gpsKalla) jämför NMEA-tiden (UTC från satelliten, alltid rätt)
// mot "nu" = datorns klocka → färsk GPS såg 4 min gammal ut → all GPS fördröjd → inget hyttspår loggades.
//
// Lösning: räkna ut datorns avvikelse mot SERVERTIDEN (Date-headern i svaret från /api/version, som är force-dynamic + no-store → alltid färsk)
// vid start och var 10:e minut, och jämför NMEA mot den korrigerade tiden. Klockavvikelsen visas inte för föraren — den är inget förarna ska åtgärda.
//
// offsetMs läggs till datorns klocka: dator + offset = verklig tid. Datorn 4 min före → offset ≈ −240 000.

export const KLOCKA_URL = '/api/version';
export const KLOCKA_SYNK_MS = 10 * 60 * 1000;                 // synka var 10:e minut
export const KLOCKA_TIMEOUT_MS = 4000;                        // ett försök som tar längre ger inget (offline / tät skog) → behåll förra värdet
export const KLOCKA_MAX_RTT_MS = 5000;                        // svarstid över detta: mittpunkten är för osäker
export const KLOCKA_MAX_AVVIKELSE_MS = 30 * 24 * 3600 * 1000; // en månads avvikelse är ett trasigt svar, inte en klocka som går fel

export interface KlockaKorr {
  /** Läggs till datorns klocka för att få verklig tid. */
  offsetMs: number;
  /** Minst ett synkförsök är avslutat (lyckat eller inte). Innan dess vet vi inte om klockan går rätt → åldersvakten avvaktar. */
  klar: boolean;
}

/** Ingen korrigering, klockan antas rätt (testernas och de gamla anropens standard). */
export const OKORRIGERAD: KlockaKorr = { offsetMs: 0, klar: true };

let offsetMs = 0;
let provad = false;

/** Aktuell korrigering (för drivern, som anropar den per NMEA-mening). */
export function klockaKorr(): KlockaKorr { return { offsetMs, klar: provad }; }

/** Verklig tid i ms epoch: datorns klocka + uppmätt avvikelse. Används för allt som ska bära en TID (hyttspårspunkter m.m.). */
export function serverNu(nu: number = Date.now()): number { return nu + offsetMs; }

/** Bara för test: nollställ. */
export function aterstallKlocka(): void { offsetMs = 0; provad = false; }

/** Bara för test: sätt avvikelsen direkt. */
export function sattKlockaForTest(off: number, klar = true): void { offsetMs = off; provad = klar; }

/**
 * Datorns avvikelse ur ett Date-huvud. `fore`/`efter` = datorns klocka före/efter anropet.
 * Servern stämplade svaret någonstans mellan dem — mittpunkten är bästa gissningen. Date-huvudet har hela sekunder (avkapade),
 * så sanningen ligger i [header, header + 1 s) → +500 ms. Felmarginalen blir ≈ ±(500 ms + svarstid/2), långt under de 30 s åldersvakten tål.
 * null = kan inte lita på svaret (inget/ogiltigt huvud, för lång svarstid, orimlig avvikelse).
 */
export function beraknaOffset(dateHuvud: string | null | undefined, fore: number, efter: number): number | null {
  if (!dateHuvud) return null;
  const server = Date.parse(dateHuvud);
  if (!Number.isFinite(server)) return null;
  const rtt = efter - fore;
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > KLOCKA_MAX_RTT_MS) return null;
  const offset = Math.round(server + 500 - (fore + efter) / 2);
  if (Math.abs(offset) > KLOCKA_MAX_AVVIKELSE_MS) return null;
  return offset;
}

type HamtaFn = (url: string, init?: { cache?: 'no-store'; signal?: AbortSignal }) => Promise<{ headers: { get(namn: string): string | null } }>;

/** Ett synkförsök. true = ny avvikelse sparad. Misslyckas det (offline, timeout, orimligt svar) behålls förra värdet. Rör aldrig datorns klocka. */
export async function synkaKlocka(hamta?: HamtaFn): Promise<boolean> {
  let ok = false;
  try {
    const fn: HamtaFn | null = hamta ?? (typeof window !== 'undefined' && typeof fetch === 'function' ? ((u, i) => fetch(u, i)) : null);
    if (fn) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), KLOCKA_TIMEOUT_MS) : null;
      try {
        const fore = Date.now();
        const svar = await fn(`${KLOCKA_URL}?k=${fore}`, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
        const efter = Date.now();
        const off = beraknaOffset(svar.headers.get('date'), fore, efter);
        if (off != null) { offsetMs = off; ok = true; }
      } finally { if (t) clearTimeout(t); }
    }
  } catch { /* offline / avbruten: behåll förra värdet */ }
  provad = true;
  return ok;
}

let synkAntal = 0;
let synkTimer: ReturnType<typeof setInterval> | null = null;
let onlineLyssnare: (() => void) | null = null;

/**
 * Starta synken: ett försök direkt och sedan var 10:e minut (+ när nätet kommer tillbaka). Räknar prenumeranter — flera anropare delar EN timer.
 * Returnerar stopp-funktionen. Avvikelsen behålls när synken stoppas (klockan går lika fel nästa gång).
 */
export function startaKlockSynk(hamta?: HamtaFn): () => void {
  synkAntal++;
  if (synkAntal === 1) {
    void synkaKlocka(hamta);
    synkTimer = setInterval(() => { void synkaKlocka(hamta); }, KLOCKA_SYNK_MS);
    if (synkTimer && typeof (synkTimer as { unref?: () => void }).unref === 'function') (synkTimer as { unref: () => void }).unref();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      onlineLyssnare = () => { void synkaKlocka(hamta); };   // tät skog → nät tillbaka: mät om direkt
      window.addEventListener('online', onlineLyssnare);
    }
  }
  let stoppad = false;
  return () => {
    if (stoppad) return;
    stoppad = true;
    synkAntal--;
    if (synkAntal > 0) return;
    if (synkTimer) { clearInterval(synkTimer); synkTimer = null; }
    if (onlineLyssnare && typeof window !== 'undefined') { window.removeEventListener('online', onlineLyssnare); onlineLyssnare = null; }
  };
}
