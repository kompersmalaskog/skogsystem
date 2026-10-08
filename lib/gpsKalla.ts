// GPS-KÄLLA: ett lager som ger position oavsett källa — Web Serial (NMEA från maskindatorns 4G-GNSS,
// t.ex. Quectel USB NMEA-port delad till en COM-port via ELTIMA) ELLER navigator.geolocation (telefon).
//
// NMEA-parsern (nedan) är REN och testad (ringar aldrig hårdvara) — se ringEdit-mönstret. Drivern
// (startaGpsKalla/valjSerialPort) rör webbläsar-API:er och gejtar allt bakom typeof-vakter.
//
// VIKTIGT om portar: öppna ALDRIG en port användaren inte valt. Web Serial ger bara portar som
// användaren uttryckligen beviljat vår origin via requestPort() → getPorts() innehåller bara dem.
// COM6/COM7 (FL/Opti4G) beviljas aldrig till oss och rörs därför aldrig.

import { SERIAL_FLAGG, harWebSerial, serialGpsVald, glomSerialGps, antalBeviljadeSerialPortar } from './gpsSerialFlagga';
import { BAUD_PROVORDNING, effektivBaud, hamtaBaudVal, sattBaudVal, sattHittadBaud, type BaudVal } from './gpsBaud';
import { OKORRIGERAD, klockaKorr, startaKlockSynk, type KlockaKorr } from './serverKlocka';

export interface GpsFix {
  lat: number | null;
  lng: number | null;
  kurs: number | null;        // grader (0–360), hålls kvar när farten är låg
  fart: number | null;        // km/h
  satelliter: number | null;
  hdop: number | null;
  noggrannhetM: number | null;   // meter, från geolocation (coords.accuracy); null för serial (använd hdop)
  giltig: boolean;            // färsk, giltig fix (RMC status A inom maxålder OCH NMEA-tiden inte släpar efter verklig tid = datorns klocka + uppmätt avvikelse mot servern)
  tid: number;                // ms epoch för senaste uppdatering
  /** Serial: NMEA-tiden (GGA/RMC, UTC + datum) ligger mer än FORDROJD_MAX_MS efter VERKLIG tid (se lib/serverKlocka — datorns klocka kan gå
   *  fel) → datat är en gammal kö, inte en färsk position. `giltig` är då false. Saknas (undefined) för geolocation/fast läge. */
  fordrojd?: boolean;
  /** Serial: hur många ms NMEA-tiden ligger EFTER verklig tid (negativt = före). null/undefined = okänt. */
  nmeaAlderMs?: number | null;
}

export interface NmeaState {
  lat: number | null;
  lng: number | null;
  alt: number | null;
  satelliter: number | null;
  hdop: number | null;
  rmcGiltig: boolean;         // senaste RMC-status var A
  fart: number | null;        // km/h (ur RMC/VTG)
  kurs: number | null;        // hålls kvar när farten < KURS_MIN_FART_KMH
  rmcTid: number | null;      // ms för senaste GILTIGA RMC (för 5 s fix-tappad) — ANKOMSTtid på datorns klocka
  rmcUtc: number | null;      // ms epoch ur NMEA-tiden i senaste GILTIGA RMC (UTC + datum) — när mätningen GJORDES
  ggaUtc: number | null;      // ms epoch ur NMEA-tiden i senaste GGA med fix (bara klockslag → dygnet tolkas mot datorns klocka)
  tid: number;                // ms för senaste rad
}

export const KURS_MIN_FART_KMH = 1.5;   // under denna → kursen hålls kvar (stillastående GPS ger skräpkurs)
export const FIX_MAX_ALDER_MS = 5000;   // ingen giltig RMC på 5 s → fix tappad
/** NMEA-tiden får ligga högst så här långt EFTER verklig tid (datorns klocka korrigerad mot servern). Mer → räkna som ingen fix ("GPS-data är fördröjd"). */
export const FORDROJD_MAX_MS = 30000;
const KNOP_TILL_KMH = 1.852;

export function nyNmeaState(): NmeaState {
  return { lat: null, lng: null, alt: null, satelliter: null, hdop: null, rmcGiltig: false, fart: null, kurs: null, rmcTid: null, rmcUtc: null, ggaUtc: null, tid: 0 };
}

// XOR-checksumma mellan '$' och '*' ska matcha de två hex-tecknen efter '*'.
export function nmeaChecksumOk(rad: string): boolean {
  const s = rad.trim();
  const stjarna = s.lastIndexOf('*');
  if (!s.startsWith('$') || stjarna < 0 || stjarna + 3 > s.length) return false;
  const kropp = s.slice(1, stjarna);
  const given = s.slice(stjarna + 1, stjarna + 3).toUpperCase();
  let cs = 0;
  for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i);
  return cs.toString(16).toUpperCase().padStart(2, '0') === given;
}

// ddmm.mmmm(+hemisfär) → decimalgrader. Fungerar för både lat (dd) och lng (ddd) via /100-floor.
function nmeaKoord(varde: string, hemi: string): number | null {
  if (!varde) return null;
  const n = parseFloat(varde);
  if (!Number.isFinite(n)) return null;
  const grader = Math.floor(n / 100);
  const minuter = n - grader * 100;
  let dec = grader + minuter / 60;
  if (hemi === 'S' || hemi === 'W') dec = -dec;
  return dec;
}

// NMEA-klockslag "hhmmss.ss" → sekunder sedan midnatt UTC. Ogiltigt → null.
function nmeaTidSek(s: string | undefined): number | null {
  if (!s || !/^\d{6}(\.\d+)?$/.test(s)) return null;
  const hh = parseInt(s.slice(0, 2), 10), mm = parseInt(s.slice(2, 4), 10), ss = parseFloat(s.slice(4));
  if (hh > 23 || mm > 59 || ss >= 61) return null;
  return hh * 3600 + mm * 60 + ss;
}

/** NMEA-tid (+ datum "ddmmyy" ur RMC) → ms epoch (UTC). Utan datum (GGA) tolkas klockslaget på datorns UTC-dygn, med närmaste dygn
 *  vid midnatt (>12 h ifrån → ±1 dygn). Ogiltig tid/datum → null. Årtalet tolkas som 20yy. */
export function nmeaTillEpoch(tid: string | undefined, datum: string | undefined, nu: number): number | null {
  const sek = nmeaTidSek(tid);
  if (sek == null) return null;
  if (datum && /^\d{6}$/.test(datum)) {
    const dd = parseInt(datum.slice(0, 2), 10), mo = parseInt(datum.slice(2, 4), 10), yy = parseInt(datum.slice(4, 6), 10);
    if (dd < 1 || dd > 31 || mo < 1 || mo > 12) return null;
    return Date.UTC(2000 + yy, mo - 1, dd) + Math.round(sek * 1000);
  }
  const d = new Date(nu);
  const dagStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let e = dagStart + Math.round(sek * 1000);
  const DYGN = 86400000;
  if (e - nu > DYGN / 2) e -= DYGN; else if (nu - e > DYGN / 2) e += DYGN;
  return e;
}

function uppdateraKurs(nuvarande: number | null, ny: number | null, fart: number | null): number | null {
  if (ny == null || !Number.isFinite(ny)) return nuvarande;
  if (nuvarande == null) return ny;                       // bootstrap: första kursen tas alltid
  if (fart != null && fart > KURS_MIN_FART_KMH) return ny;
  return nuvarande;                                       // för långsam → behåll (ingen jitter i stillastående)
}

// Mata in en NMEA-rad → ny state. Ogiltig checksumma / okänd typ → oförändrad (utom tid). Immutabelt.
// `nu` = datorns klocka (ANKOMSTtid, bokföring som rmcTid/tid). `klocka.offsetMs` läggs bara på där NMEA-tiden ska tolkas mot verklig tid.
export function matNmeaRad(state: NmeaState, rad: string, nu: number = Date.now(), klocka: KlockaKorr = OKORRIGERAD): NmeaState {
  if (!nmeaChecksumOk(rad)) return state;   // kasta rader som inte stämmer
  const s = rad.trim();
  const kropp = s.slice(1, s.lastIndexOf('*'));
  const f = kropp.split(',');
  const typ = f[0].slice(-3);   // strippa GP/GN/GL-prefix → GGA/RMC/VTG/GSA…
  const ny: NmeaState = { ...state, tid: nu };
  if (typ === 'GGA') {
    const lat = nmeaKoord(f[2], f[3]); if (lat != null) ny.lat = lat;
    const lng = nmeaKoord(f[4], f[5]); if (lng != null) ny.lng = lng;
    const sats = parseInt(f[7], 10); if (Number.isFinite(sats)) ny.satelliter = sats;
    const hdop = parseFloat(f[8]); if (Number.isFinite(hdop)) ny.hdop = hdop;
    const alt = parseFloat(f[9]); if (Number.isFinite(alt)) ny.alt = alt;
    // Mätningens tid (UTC): bara för meningar MED fix (kvalitet 0 = ingen fix → tiden kan vara en klocka utan satellitlås)
    if (f[6] && f[6] !== '0') ny.ggaUtc = nmeaTillEpoch(f[1], undefined, nu + klocka.offsetMs);
  } else if (typ === 'RMC') {
    const status = f[2];
    ny.rmcGiltig = status === 'A';
    if (status === 'A') { ny.rmcTid = nu; ny.rmcUtc = nmeaTillEpoch(f[1], f[9], nu + klocka.offsetMs); }
    const knop = parseFloat(f[7]); if (Number.isFinite(knop)) ny.fart = knop * KNOP_TILL_KMH;
    const rlat = nmeaKoord(f[3], f[4]); if (ny.lat == null && rlat != null) ny.lat = rlat;
    const rlng = nmeaKoord(f[5], f[6]); if (ny.lng == null && rlng != null) ny.lng = rlng;
    const rkurs = parseFloat(f[8]); ny.kurs = uppdateraKurs(ny.kurs, Number.isFinite(rkurs) ? rkurs : null, ny.fart);
  } else if (typ === 'VTG') {
    const vkurs = parseFloat(f[1]);
    const vkmh = parseFloat(f[7]); if (Number.isFinite(vkmh)) ny.fart = vkmh;   // VTG km/h (fält 7, 'K')
    ny.kurs = uppdateraKurs(ny.kurs, Number.isFinite(vkurs) ? vkurs : null, ny.fart);
  }
  return ny;
}

/** "2 h 30 min" / "12 min" / "45 s" — hur länge NMEA-tiden släpar efter datorns klocka (för "GPS-data är fördröjd"). */
export function formateraFordrojning(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return m === 60 ? `${h + 1} h` : (m > 0 ? `${h} h ${m} min` : `${h} h`); }
  if (s >= 60) { const m = Math.round(s / 60); return m >= 60 ? '1 h' : `${m} min`; }
  return `${s} s`;
}

// State → GpsFix. giltig = RMC var A OCH senaste giltiga RMC inte äldre än maxAlder (fix-tappad-regeln) OCH NMEA-tiden inte
// ligger mer än maxFordrojd EFTER verklig tid.
//
// ÅLDERSVAKTEN: `farsk` ovan mäter när meningen ANLÄNDE till datorn, inte när mätningen gjordes. Släpar överföringen (för låg
// baudrate → kön byggs upp) kommer gamla meningar i färsk takt och såg giltiga ut — appen fick positioner 2,5 h gamla (NMEA-tid
// 11:07 UTC vid 13:37 UTC). NMEA-tiden (RMC: UTC + datum, annars GGA: klockslag) jämförs därför mot VERKLIG tid; ligger den
// mer än 30 s efter är det en gammal kö → giltig=false, fordrojd=true (inget visas som position, inga punkter loggas).
// Ligger NMEA-tiden FÖRE verklig tid räknas det inte som fördröjt.
//
// VERKLIG TID = datorns klocka + klocka.offsetMs (lib/serverKlocka: avvikelsen mot servern, mätt vid start och var 10:e minut). Utan det
// såg färsk GPS 4 min gammal ut när datorns klocka gick 4 min före (Giant 2026-10-08) och ALL GPS blev fördröjd. Innan det första
// klocksynkförsöket är klart (klocka.klar=false, någon sekund vid start) vet vi inte om klockan går rätt → giltig=false utan att
// flagga fördröjd (ingen varning för något vi inte vet). Datorns klocka visas aldrig för föraren.
export function nmeaStateTillFix(
  state: NmeaState, nu: number = Date.now(), maxAlder: number = FIX_MAX_ALDER_MS, maxFordrojd: number = FORDROJD_MAX_MS,
  klocka: KlockaKorr = OKORRIGERAD,
): GpsFix {
  const farsk = state.rmcGiltig && state.rmcTid != null && (nu - state.rmcTid) <= maxAlder;   // ankomst mot ankomst: samma klocka, ingen korrigering
  const utc = state.rmcUtc ?? state.ggaUtc;       // RMC har datum → den är facit när den finns
  const nmeaAlderMs = utc != null ? (nu + klocka.offsetMs) - utc : null;
  if (!klocka.klar) {
    return {
      lat: state.lat, lng: state.lng, kurs: state.kurs, fart: state.fart,
      satelliter: state.satelliter, hdop: state.hdop, noggrannhetM: null,
      giltig: false, tid: state.tid, fordrojd: false, nmeaAlderMs: null,
    };
  }
  const fordrojd = nmeaAlderMs != null && nmeaAlderMs > maxFordrojd;
  return {
    lat: state.lat, lng: state.lng, kurs: state.kurs, fart: state.fart,
    satelliter: state.satelliter, hdop: state.hdop, noggrannhetM: null,
    giltig: !!(farsk && state.lat != null && state.lng != null && !fordrojd),
    tid: state.tid,
    fordrojd, nmeaAlderMs,
  };
}

// === DRIVER (webbläsar-API:er — gejtade) ===

// Flaggan + beviljade portar bor i lib/gpsSerialFlagga (liten modul: startvakten i rotlayouten behöver dem utan att dra in hela
// den här filen). Återexporteras så alla befintliga importer fungerar oförändrat.
export { harWebSerial, serialGpsVald, glomSerialGps, antalBeviljadeSerialPortar };

// Läs NMEA-rader ur en öppen port i högst (maxMs) och mata parsern. Returnerar antal giltiga rader (giltig checksumma).
// avbrytRef.current=true stoppar. onFix anropas för varje ny fix (om onFix satt). stoppaEfter>0 → sluta så fort så många giltiga
// rader kommit (portval/provning behöver inte vänta ut hela tiden). maxMs TVINGAS med en timer som avbryter läsningen —
// reader.read() blockerar annars för alltid på en tyst port (och en baudrate-provning över fyra hastigheter skulle hänga).
async function lasPort(
  port: any, maxMs: number, onFix: ((fix: GpsFix) => void) | null, avbrytRef: { current: boolean }, stoppaEfter = 0,
): Promise<number> {
  let state = nyNmeaState();
  let giltiga = 0;
  let buffert = '';
  const reader = port.readable.getReader();
  const timer = maxMs > 0 ? setTimeout(() => { try { void reader.cancel(); } catch { /* */ } }, maxMs) : null;
  const dec = new TextDecoder();
  try {
    while (!avbrytRef.current && (stoppaEfter <= 0 || giltiga < stoppaEfter)) {
      const { value, done } = await reader.read();
      if (done) break;
      buffert += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffert.indexOf('\n')) >= 0) {
        const rad = buffert.slice(0, nl).trim();
        buffert = buffert.slice(nl + 1);
        if (!rad.startsWith('$')) continue;
        if (!nmeaChecksumOk(rad)) continue;
        giltiga++;
        const kk = klockaKorr();
        state = matNmeaRad(state, rad, Date.now(), kk);
        if (onFix) onFix(nmeaStateTillFix(state, Date.now(), FIX_MAX_ALDER_MS, FORDROJD_MAX_MS, kk));
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
    try { reader.releaseLock(); } catch { /* */ }
  }
  return giltiga;
}

/** Hur länge varje baudrate provas vid Auto, och hur många giltiga rader som krävs (ett par — en tillfällig bit skräp som råkar ha
 *  rätt checksumma är försumbart, men en enda rad är för lite för att lita på). */
export const PROV_MS = 2500;
export const PROV_MIN_RADER = 2;

// Portval från en knapp (kräver användargest). Fast baudrate (valt i GPS-källa-kortet): öppnar med den, läser högst 5 s, kräver
// minst en giltig rad — som förut. Auto: provar BAUD_PROVORDNING (högst först) tills giltiga meningar kommer, sparar den som
// "hittad" (se lib/gpsBaud för varför högst först). onProvar anropas före varje försök (UI: "Testar 38400 baud…").
export async function valjSerialPort(onProvar?: (baud: number) => void): Promise<{ ok: boolean; fel?: string; baud?: number }> {
  if (!harWebSerial()) return { ok: false, fel: 'Web Serial stöds inte i denna webbläsare.' };
  let port: any;
  try { port = await (navigator as any).serial.requestPort(); }
  catch { return { ok: false, fel: 'Ingen port vald.' }; }
  const val = hamtaBaudVal();
  const ordning: readonly number[] = val === 'auto' ? BAUD_PROVORDNING : [val];
  // Körande serial-källa håller porten öppen → pausa den medan vi provar, starta den igen efteråt (med den nya baudraten)
  const pausad = await pausaSerialKalla();
  try {
    for (const baud of ordning) {
      if (onProvar) { try { onProvar(baud); } catch { /* */ } }
      try {
        await port.open({ baudRate: baud });
      } catch (e: any) {
        return { ok: false, fel: 'Kunde inte öppna porten (kanske upptagen av annat program).' };
      }
      let giltiga = 0;
      try {
        giltiga = await lasPort(port, val === 'auto' ? PROV_MS : 5000, null, { current: false }, val === 'auto' ? PROV_MIN_RADER : 1);
      } catch {
        giltiga = 0;   // fel baudrate på en riktig UART ger ramfel/skräp → räknas som "inga giltiga rader", prova nästa
      } finally {
        try { await port.close(); } catch { /* */ }
      }
      if (giltiga >= (val === 'auto' ? PROV_MIN_RADER : 1)) {
        try { localStorage.setItem(SERIAL_FLAGG, '1'); } catch { /* */ }
        if (val === 'auto') sattHittadBaud(baud);
        return { ok: true, baud };
      }
    }
    return {
      ok: false,
      fel: val === 'auto'
        ? `Ingen GPS-data på denna port vid ${BAUD_PROVORDNING.join(' / ')} baud.`
        : `Ingen GPS-data på denna port vid ${val} baud — prova en annan baudrate eller Auto.`,
    };
  } finally {
    if (pausad) aterupptaSerialKalla();
  }
}

/** Byt baudrate och starta om serial-källan med den (porten stängs och öppnas på nytt). Utan körande serial-källa sparas bara valet. */
export async function sattBaudValOchStartaOm(val: BaudVal): Promise<void> {
  sattBaudVal(val);
  await startaOmSerialKalla();
}

export type GpsKallaTyp = 'serial' | 'geolocation' | 'ingen';
export interface GpsKallaHandle { stop(): void; typ: GpsKallaTyp; }

// EN DELAD KÄLLA (hub). Web Serial kan bara ha EN läsare per port → alla konsumenter (passiv watcher,
// körspår-inspelning, centrera/försök-igen) MÅSTE dela samma ström. `navigator.geolocation` anropas
// ALDRIG utanför denna fil (annars ger Windows IP-position som klobbar serial-pricken).
const abonnenter = new Set<(fix: GpsFix) => void>();
let senasteFix: GpsFix | null = null;
// stoppaOchVanta (bara serial): stänger läsningen och väntar tills porten verkligen stängts — behövs när baudraten byts och
// porten ska öppnas på nytt direkt (annars hinner den gamla läsaren fortfarande hålla den öppen).
let underliggande: { stop(): void; stoppaOchVanta?(): Promise<void> } | null = null;
let hubTyp: GpsKallaTyp = 'ingen';
let stoppaKlockSynk: (() => void) | null = null;   // datorns klockavvikelse mot servern (lib/serverKlocka) mäts så länge hubben har prenumeranter

// FAST LÄGE (testfliken /maskin?som=<maskin_id>): hubben öppnar ALDRIG serieporten eller navigator.geolocation —
// datorns egen position hör inte hemma i "visa som maskin". Positionen sätts uttryckligen av anroparen (maskinens
// senast kända position) och sprids till samma abonnenter som en riktig fix, så hela GPS-kedjan (prick, körvy,
// kamera) ser EN källa. Aktiveras av /maskin-sidan innan något hunnit prenumerera.
let fastLage = false;
let fastPos: { lat: number; lng: number; kurs: number | null } | null = null;

function fastFix(p: { lat: number; lng: number; kurs: number | null }): GpsFix {
  return { lat: p.lat, lng: p.lng, kurs: p.kurs, fart: null, satelliter: null, hdop: null, noggrannhetM: null, giltig: true, tid: Date.now() };
}

export function startaFastGpsLage(): void {
  fastLage = true;
  if (underliggande) { underliggande.stop(); underliggande = { stop() { /* fast läge öppnar ingen källa */ } }; hubTyp = 'geolocation'; senasteFix = null; }
}
/** Lägg ut maskinens position (och, om känd, senaste körriktning i grader) i det fasta läget. */
export function sattFastGpsPosition(lat: number, lng: number, kurs: number | null = null): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  fastPos = { lat, lng, kurs: kurs != null && Number.isFinite(kurs) ? ((kurs % 360) + 360) % 360 : null };
  if (fastLage) notifiera(fastFix(fastPos));
}
export function stoppaFastGpsLage(): void { fastLage = false; fastPos = null; }
export function fastGpsLageAktivt(): boolean { return fastLage; }

/** Senaste kända giltiga fix i hubben (null = ingen än). Ren läsning — startar ingen källa. */
export function senasteGiltigaGpsFix(): GpsFix | null {
  return senasteFix && senasteFix.giltig && senasteFix.lat != null && senasteFix.lng != null ? senasteFix : null;
}

function aktuellTyp(): GpsKallaTyp {
  if (fastLage) return 'geolocation';
  if (harWebSerial() && serialGpsVald()) return 'serial';
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) return 'geolocation';
  return 'ingen';
}

function notifiera(fix: GpsFix) { senasteFix = fix; for (const a of Array.from(abonnenter)) { try { a(fix); } catch { /* */ } } }

// Öppna den underliggande källan EN gång (serial eller geolocation). notifiera() sprider till abonnenter.
function startaUnderliggande(highAccuracy: boolean): { stop(): void; stoppaOchVanta?(): Promise<void> } {
  // --- Fast läge (testflik): ingen riktig källa — bara den utlagda positionen (om den redan satts) ---
  // Sätts som senaste fix utan notifiera(): startaGpsKalla levererar senasteFix till den nya abonnenten direkt
  // (notifiera här gav den samma fix två gånger).
  if (fastLage) {
    if (fastPos) senasteFix = fastFix(fastPos);
    return { stop() { /* ingen källa att stänga */ } };
  }
  // --- Serial ---
  if (harWebSerial() && serialGpsVald()) {
    const avbryt = { current: false };
    let aktivPort: any = null;
    let aktivReader: any = null;
    let retryTimer: any = null;
    let state = nyNmeaState();
    let pagaende: Promise<void> = Promise.resolve();
    let loggadFordrojd = false;
    const kor = async () => {
      if (avbryt.current) return;
      let portar: any[] = [];
      try { portar = await (navigator as any).serial.getPorts(); } catch { portar = []; }
      for (const port of portar) {   // bara BEVILJADE portar (aldrig COM6/COM7 som aldrig beviljats oss)
        if (avbryt.current) return;
        // Baudraten ur enhetens val (GPS-källa-kortet): fast val, eller den Auto hittade vid portvalet, annars 4800 som förut.
        try { await port.open({ baudRate: effektivBaud() }); } catch { continue; }   // upptagen/öppen → nästa
        aktivPort = port;
        let buffert = '';
        const dec = new TextDecoder();
        try {
          const reader = port.readable.getReader();
          aktivReader = reader;
          try {
            while (!avbryt.current) {
              const { value, done } = await reader.read();
              if (done) break;
              buffert += dec.decode(value, { stream: true });
              let nl: number;
              while ((nl = buffert.indexOf('\n')) >= 0) {
                const rad = buffert.slice(0, nl).trim();
                buffert = buffert.slice(nl + 1);
                if (!rad.startsWith('$') || !nmeaChecksumOk(rad)) continue;
                const kk = klockaKorr();   // per mening: avvikelsen uppdateras var 10:e minut
                const nuMs = Date.now();
                state = matNmeaRad(state, rad, nuMs, kk);
                const fix = nmeaStateTillFix(state, nuMs, FIX_MAX_ALDER_MS, FORDROJD_MAX_MS, kk);
                // Loggas EN gång per fördröjd period (inte per mening, det är hundratals i sekunden på en uppbyggd kö)
                if (fix.fordrojd && !loggadFordrojd) { loggadFordrojd = true; console.warn(`[GPS] data fördröjd: NMEA-tiden ligger ${Math.round((fix.nmeaAlderMs ?? 0) / 1000)} s efter verklig tid (klockavvikelse ${Math.round(kk.offsetMs / 1000)} s, ${effektivBaud()} baud) — räknas som ingen fix`); }
                else if (!fix.fordrojd) loggadFordrojd = false;
                notifiera(fix);
              }
            }
          } finally { aktivReader = null; try { reader.releaseLock(); } catch { /* */ } }
        } catch { /* läsfel → porten tappades */ }
        try { await port.close(); } catch { /* */ }
        aktivPort = null;
        break;
      }
      if (!avbryt.current) retryTimer = setTimeout(() => { pagaende = kor(); }, 10000);   // tappad → försök igen var 10 s
    };
    pagaende = kor();
    const stop = () => {
      avbryt.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      // reader.cancel() väcker en blockerad read() → loopen avslutas och stänger porten själv (port.close() går inte medan läsaren håller den)
      if (aktivReader) { try { void aktivReader.cancel(); } catch { /* */ } }
    };
    return {
      stop,
      async stoppaOchVanta() {
        stop();
        await Promise.race([pagaende, new Promise<void>((res) => setTimeout(res, 3000))]);
      },
    };
  }
  // --- Geolocation (fallback, dagens beteende) ---
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return { stop() { /* */ } };
  const emit = (pos: GeolocationPosition) => notifiera({
    lat: pos.coords.latitude, lng: pos.coords.longitude,
    kurs: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : null,
    fart: pos.coords.speed != null && !Number.isNaN(pos.coords.speed) ? pos.coords.speed * 3.6 : null,
    satelliter: null, hdop: null, noggrannhetM: pos.coords.accuracy ?? null,
    giltig: true, tid: Date.now(),
  });
  try { navigator.geolocation.getCurrentPosition(emit, () => { /* watchen tar över */ }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }); } catch { /* */ }
  let watchId: number | null = null;
  try { watchId = navigator.geolocation.watchPosition(emit, (err) => console.warn('[GPS geolocation]', err.code, err.message), { enableHighAccuracy: highAccuracy, maximumAge: 0, timeout: 15000 }); } catch { /* */ }
  return { stop() { if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch { /* */ } } } };
}

// Prenumerera på GPS-strömmen. Första abonnenten startar den delade källan; sista som slutar stänger den.
// Ny abonnent får senaste kända fix direkt. Alla får SAMMA källa (serial ELLER geolocation).
export function startaGpsKalla(onFix: (fix: GpsFix) => void, opts?: { highAccuracy?: boolean }): GpsKallaHandle {
  abonnenter.add(onFix);
  if (!underliggande) {
    hubTyp = aktuellTyp(); underliggande = startaUnderliggande(opts?.highAccuracy !== false);
    if (!fastLage && !stoppaKlockSynk) stoppaKlockSynk = startaKlockSynk();
  }
  if (senasteFix) { try { onFix(senasteFix); } catch { /* */ } }
  return {
    typ: hubTyp,
    stop() {
      abonnenter.delete(onFix);
      if (abonnenter.size === 0 && underliggande) {
        underliggande.stop(); underliggande = null; hubTyp = 'ingen'; senasteFix = null;
        if (stoppaKlockSynk) { stoppaKlockSynk(); stoppaKlockSynk = null; }
      }
    },
  };
}

// Starta om den delade serial-källan (t.ex. när baudraten bytts): stäng läsningen, vänta tills porten stängts, öppna på nytt med
// enhetens aktuella baudrate. Abonnenterna behåller sina prenumerationer; senaste fix nollas (den hör till den gamla öppningen).
// Ingen körande serial-källa (geolocation / ingen prenumerant / fast läge) → ingenting att starta om.
export async function startaOmSerialKalla(): Promise<void> {
  if (await pausaSerialKalla()) aterupptaSerialKalla();
}

// Paus/återupptag: portval (valjSerialPort) måste kunna öppna porten, men hubben håller den öppen medan serial-källan körs
// (en port kan bara öppnas en gång) → stäng källan, behåll abonnenterna, och starta den igen efter portvalet.
// true = en körande serial-källa pausades (och aterupptaSerialKalla() ska anropas).
async function pausaSerialKalla(): Promise<boolean> {
  if (!underliggande || hubTyp !== 'serial' || fastLage) return false;
  const gammal = underliggande;
  underliggande = { stop() { /* platshållare under pausen: ingen annan hinner starta en andra källa */ } };
  senasteFix = null;
  try { await (gammal.stoppaOchVanta ? gammal.stoppaOchVanta() : Promise.resolve(gammal.stop())); } catch { /* */ }
  return true;
}
function aterupptaSerialKalla(): void {
  if (abonnenter.size === 0) { underliggande = null; hubTyp = 'ingen'; return; }   // alla slutade under pausen
  underliggande = startaUnderliggande(true);
}

// Hämta EN fix (centrera / försök igen / engångskoll). Har hubben en färsk fix → returnera den direkt
// (öppnar aldrig porten en andra gång). Annars: prenumerera tillfälligt tills första giltiga fix / timeout.
export function hamtaEnGpsFix(timeoutMs = 8000): Promise<GpsFix | null> {
  if (senasteFix && senasteFix.giltig) return Promise.resolve(senasteFix);
  return new Promise((resolve) => {
    let klar = false;
    const handle = startaGpsKalla((fix) => {
      if (klar) return;
      if (fix.giltig && fix.lat != null && fix.lng != null) { klar = true; clearTimeout(t); handle.stop(); resolve(fix); }
    });
    const t = setTimeout(() => { if (!klar) { klar = true; handle.stop(); resolve(senasteFix ?? null); } }, timeoutMs);
  });
}
