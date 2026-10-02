// GPS-KÄLLA: ett lager som ger position oavsett källa — Web Serial (NMEA från maskindatorns 4G-GNSS,
// t.ex. Quectel USB NMEA-port delad till en COM-port via ELTIMA) ELLER navigator.geolocation (telefon).
//
// NMEA-parsern (nedan) är REN och testad (ringar aldrig hårdvara) — se ringEdit-mönstret. Drivern
// (startaGpsKalla/valjSerialPort) rör webbläsar-API:er och gejtar allt bakom typeof-vakter.
//
// VIKTIGT om portar: öppna ALDRIG en port användaren inte valt. Web Serial ger bara portar som
// användaren uttryckligen beviljat vår origin via requestPort() → getPorts() innehåller bara dem.
// COM6/COM7 (FL/Opti4G) beviljas aldrig till oss och rörs därför aldrig.

export interface GpsFix {
  lat: number | null;
  lng: number | null;
  kurs: number | null;        // grader (0–360), hålls kvar när farten är låg
  fart: number | null;        // km/h
  satelliter: number | null;
  hdop: number | null;
  noggrannhetM: number | null;   // meter, från geolocation (coords.accuracy); null för serial (använd hdop)
  giltig: boolean;            // färsk, giltig fix (RMC status A inom maxålder)
  tid: number;                // ms epoch för senaste uppdatering
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
  rmcTid: number | null;      // ms för senaste GILTIGA RMC (för 5 s fix-tappad)
  tid: number;                // ms för senaste rad
}

export const KURS_MIN_FART_KMH = 1.5;   // under denna → kursen hålls kvar (stillastående GPS ger skräpkurs)
export const FIX_MAX_ALDER_MS = 5000;   // ingen giltig RMC på 5 s → fix tappad
const KNOP_TILL_KMH = 1.852;

export function nyNmeaState(): NmeaState {
  return { lat: null, lng: null, alt: null, satelliter: null, hdop: null, rmcGiltig: false, fart: null, kurs: null, rmcTid: null, tid: 0 };
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

function uppdateraKurs(nuvarande: number | null, ny: number | null, fart: number | null): number | null {
  if (ny == null || !Number.isFinite(ny)) return nuvarande;
  if (nuvarande == null) return ny;                       // bootstrap: första kursen tas alltid
  if (fart != null && fart > KURS_MIN_FART_KMH) return ny;
  return nuvarande;                                       // för långsam → behåll (ingen jitter i stillastående)
}

// Mata in en NMEA-rad → ny state. Ogiltig checksumma / okänd typ → oförändrad (utom tid). Immutabelt.
export function matNmeaRad(state: NmeaState, rad: string, nu: number = Date.now()): NmeaState {
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
  } else if (typ === 'RMC') {
    const status = f[2];
    ny.rmcGiltig = status === 'A';
    if (status === 'A') ny.rmcTid = nu;
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

// State → GpsFix. giltig = RMC var A OCH senaste giltiga RMC inte äldre än maxAlder (fix-tappad-regeln).
export function nmeaStateTillFix(state: NmeaState, nu: number = Date.now(), maxAlder: number = FIX_MAX_ALDER_MS): GpsFix {
  const farsk = state.rmcGiltig && state.rmcTid != null && (nu - state.rmcTid) <= maxAlder;
  return {
    lat: state.lat, lng: state.lng, kurs: state.kurs, fart: state.fart,
    satelliter: state.satelliter, hdop: state.hdop, noggrannhetM: null,
    giltig: !!(farsk && state.lat != null && state.lng != null),
    tid: state.tid,
  };
}

// === DRIVER (webbläsar-API:er — gejtade) ===

export function harWebSerial(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

const SERIAL_FLAGG = 'gps-serial-vald';   // localStorage: användaren har valt serial-GPS
export function serialGpsVald(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(SERIAL_FLAGG) === '1'; } catch { return false; }
}
export function glomSerialGps(): void { try { localStorage.removeItem(SERIAL_FLAGG); } catch { /* */ } }

// Läs NMEA-rader ur en öppen port i (maxMs) och mata parsern. Returnerar antal giltiga rader.
// avbrytRef.current=true stoppar. onFix anropas för varje ny fix (om onFix satt).
async function lasPort(port: any, maxMs: number, onFix: ((fix: GpsFix) => void) | null, avbrytRef: { current: boolean }): Promise<number> {
  let state = nyNmeaState();
  let giltiga = 0;
  let buffert = '';
  const t0 = Date.now();
  const reader = port.readable.getReader();
  const dec = new TextDecoder();
  try {
    while (!avbrytRef.current && (maxMs <= 0 || Date.now() - t0 < maxMs)) {
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
        state = matNmeaRad(state, rad);
        if (onFix) onFix(nmeaStateTillFix(state));
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* */ }
  }
  return giltiga;
}

// Portval från en knapp (kräver användargest). Öppnar, läser 5 s, kräver minst en giltig rad.
export async function valjSerialPort(): Promise<{ ok: boolean; fel?: string }> {
  if (!harWebSerial()) return { ok: false, fel: 'Web Serial stöds inte i denna webbläsare.' };
  let port: any;
  try { port = await (navigator as any).serial.requestPort(); }
  catch { return { ok: false, fel: 'Ingen port vald.' }; }
  try {
    await port.open({ baudRate: 4800 });
  } catch (e: any) {
    return { ok: false, fel: 'Kunde inte öppna porten (kanske upptagen av annat program).' };
  }
  try {
    const avbryt = { current: false };
    const giltiga = await lasPort(port, 5000, null, avbryt);
    if (giltiga > 0) { try { localStorage.setItem(SERIAL_FLAGG, '1'); } catch { /* */ } return { ok: true }; }
    return { ok: false, fel: 'Ingen GPS på denna port.' };
  } finally {
    try { await port.close(); } catch { /* */ }
  }
}

export type GpsKallaTyp = 'serial' | 'geolocation' | 'ingen';
export interface GpsKallaHandle { stop(): void; typ: GpsKallaTyp; }

// EN DELAD KÄLLA (hub). Web Serial kan bara ha EN läsare per port → alla konsumenter (passiv watcher,
// körspår-inspelning, centrera/försök-igen) MÅSTE dela samma ström. `navigator.geolocation` anropas
// ALDRIG utanför denna fil (annars ger Windows IP-position som klobbar serial-pricken).
const abonnenter = new Set<(fix: GpsFix) => void>();
let senasteFix: GpsFix | null = null;
let underliggande: { stop(): void } | null = null;
let hubTyp: GpsKallaTyp = 'ingen';

// FAST LÄGE (testfliken /maskin?som=<maskin_id>): hubben öppnar ALDRIG serieporten eller navigator.geolocation —
// datorns egen position hör inte hemma i "visa som maskin". Positionen sätts uttryckligen av anroparen (maskinens
// senast kända position) och sprids till samma abonnenter som en riktig fix, så hela GPS-kedjan (prick, körvy,
// kamera) ser EN källa. Aktiveras av /maskin-sidan innan något hunnit prenumerera.
let fastLage = false;
let fastPos: { lat: number; lng: number } | null = null;

function fastFix(p: { lat: number; lng: number }): GpsFix {
  return { lat: p.lat, lng: p.lng, kurs: null, fart: null, satelliter: null, hdop: null, noggrannhetM: null, giltig: true, tid: Date.now() };
}

export function startaFastGpsLage(): void {
  fastLage = true;
  if (underliggande) { underliggande.stop(); underliggande = { stop() { /* fast läge öppnar ingen källa */ } }; hubTyp = 'geolocation'; senasteFix = null; }
}
export function sattFastGpsPosition(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  fastPos = { lat, lng };
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
function startaUnderliggande(highAccuracy: boolean): { stop(): void } {
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
    let retryTimer: any = null;
    let state = nyNmeaState();
    const kor = async () => {
      if (avbryt.current) return;
      let portar: any[] = [];
      try { portar = await (navigator as any).serial.getPorts(); } catch { portar = []; }
      for (const port of portar) {   // bara BEVILJADE portar (aldrig COM6/COM7 som aldrig beviljats oss)
        if (avbryt.current) return;
        try { await port.open({ baudRate: 4800 }); } catch { continue; }   // upptagen/öppen → nästa
        aktivPort = port;
        let buffert = '';
        const dec = new TextDecoder();
        try {
          const reader = port.readable.getReader();
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
                state = matNmeaRad(state, rad);
                notifiera(nmeaStateTillFix(state));
              }
            }
          } finally { try { reader.releaseLock(); } catch { /* */ } }
        } catch { /* läsfel → porten tappades */ }
        try { await port.close(); } catch { /* */ }
        aktivPort = null;
        break;
      }
      if (!avbryt.current) retryTimer = setTimeout(kor, 10000);   // tappad → försök igen var 10 s
    };
    kor();
    return { stop() { avbryt.current = true; if (retryTimer) clearTimeout(retryTimer); if (aktivPort) { try { aktivPort.close(); } catch { /* */ } } } };
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
  if (!underliggande) { hubTyp = aktuellTyp(); underliggande = startaUnderliggande(opts?.highAccuracy !== false); }
  if (senasteFix) { try { onFix(senasteFix); } catch { /* */ } }
  return {
    typ: hubTyp,
    stop() {
      abonnenter.delete(onFix);
      if (abonnenter.size === 0 && underliggande) { underliggande.stop(); underliggande = null; hubTyp = 'ingen'; senasteFix = null; }
    },
  };
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
