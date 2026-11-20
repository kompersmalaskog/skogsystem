// TELEFONENS GPS UNDER KRONTAK: filtrering, medelvärde vid placering och osäkerhetscirkeln. Gäller BARA `navigator.geolocation` (telefonen) —
// maskinernas seriella GPS-källa (NMEA i lib/gpsKalla) går aldrig genom något av det här.
//
// Problemet: telefon-GPS under träd ger 5–20 m, ibland hundratals meter. Appen gjorde det sämre än nödvändigt: första positionen är grov (låg
// noggrannhet, upp till 60 s gammal) och visades som exakt, varje fix släpptes igenom oavsett noggrannhet och hopp, och "Placera här" tog EN fix.
//
// Rena funktioner (inga webbläsar-API:er) så att allt går att testa på simulerade fixar.

export const TELEFON_GPS = {
  /** Telefonens egen noggrannhet ≤ så här = en BRA fix (under krontak är 5–20 m normalt). Sämre = grov: visas med osäkerhetscirkel och räknas inte vid placering. */
  BRA_M: 20,
  /** Sämre än så ignoreras så länge vi har en position som är bättre. */
  MAX_M: 50,
  /** …men har vi inte tagit emot någon godkänd fix på så här länge tas en sämre igen — pricken får inte frysa för gott i tät skog. */
  FRYST_MS: 20_000,
  /** Längsta rimliga gånghastighet (≈ 14 km/h). Ett steg snabbare än så (plus fixarnas osäkerhet) är ett hopp och ignoreras. */
  GANG_MPS: 4,
  /** Rapporterad fart över detta = bil (man kör till trakten): hoppspärren och utjämningen släpps. */
  FORDON_MPS: 5,
  /** Hur mycket positionen får driva mellan fixar (m² per sekund) i Kalman-utjämningen — gångtakt. */
  PROCESS_Q: 4,
  /** Så många avvikare i rad som hänger ihop med varandra = det är vi som flyttat oss (eller förra positionen var fel), inte GPS:en som hoppar. */
  OMFORANKRA_ANTAL: 3,
  /** Golv för rapporterad noggrannhet (m); telefoner rapporterar ibland 0 eller 1. */
  MIN_ACC_M: 3,
  /** Saknas noggrannhet räknas den som så här dålig. */
  OKAND_ACC_M: 100,
} as const;

export interface TelefonMat {
  lat: number;
  lng: number;
  /** telefonens egen noggrannhet (m), null = okänd */
  acc: number | null;
  /** telefonens egen fart (m/s), null = okänd */
  fart?: number | null;
  /** när mätningen gjordes (ms epoch) — telefonens egen tidsstämpel, inte när den kom fram */
  tid: number;
}

export interface FilterState {
  lat: number;
  lng: number;
  /** positionens varians (m²) */
  varM2: number;
  /** mätningens tid för senast godkända fix */
  tid: number;
  /** de senaste avvikarna (hopp) i rad */
  avvikare: TelefonMat[];
}

export type Avvisad = 'ogiltig' | 'gammal' | 'daligNoggrannhet' | 'hopp';

export interface FiltreradFix {
  lat: number;
  lng: number;
  /** telefonens EGEN noggrannhet för den här fixen — inte krympt av utjämningen (felen i skogen hänger ihop, så "5 m efter fem fixar" vore osant) */
  noggrannhetM: number;
  tid: number;
  /** grov = noggrannhet sämre än BRA_M */
  grov: boolean;
}

const RAD = Math.PI / 180;
/** Avstånd i meter (haversine). */
export function distMeter(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const accAv = (m: TelefonMat) => (m.acc != null && Number.isFinite(m.acc) ? Math.max(TELEFON_GPS.MIN_ACC_M, m.acc) : TELEFON_GPS.OKAND_ACC_M);

export const nyttFilter = (): FilterState | null => null;

function startaOm(m: TelefonMat): FilterState {
  const acc = accAv(m);
  return { lat: m.lat, lng: m.lng, varM2: acc * acc, tid: m.tid, avvikare: [] };
}
const ut = (state: FilterState, m: TelefonMat): FiltreradFix => ({ lat: state.lat, lng: state.lng, noggrannhetM: accAv(m), tid: m.tid, grov: accAv(m) > TELEFON_GPS.BRA_M });

/** Hänger avvikarna ihop? Varje par ligger inom sin gemensamma osäkerhet plus det man hinner gå mellan dem. */
function hangerIhop(a: TelefonMat[]): boolean {
  for (let i = 1; i < a.length; i++) {
    const dt = Math.max(0, (a[i].tid - a[i - 1].tid) / 1000);
    if (distMeter(a[i - 1], a[i]) > TELEFON_GPS.GANG_MPS * dt + 2 * (accAv(a[i - 1]) + accAv(a[i]))) return false;
  }
  return true;
}

/**
 * Tar emot en rå fix och ger tillbaka den utjämnade positionen — eller ingenting om fixen ska ignoreras.
 *  1. Dålig noggrannhet (> MAX_M) ignoreras om vi har något bättre och inte varit utan godkänd fix för länge.
 *  2. Orimligt hopp för gångfart (steget > GANG_MPS·dt + fixarnas osäkerhet) ignoreras — utom i bil (rapporterad fart > FORDON_MPS).
 *     Tre avvikare i rad som hänger ihop = vi har flyttat oss: förankra om vid dem.
 *  3. Resten Kalman-utjämnas med noggrannheten som vikt: en osäker fix flyttar knappt pricken, en bra fix flyttar den mer. I bil: ingen utjämning.
 */
export function filtreraFix(state: FilterState | null, m: TelefonMat): { state: FilterState | null; fix: FiltreradFix | null; avvisad?: Avvisad } {
  if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng) || !Number.isFinite(m.tid)) return { state, fix: null, avvisad: 'ogiltig' };
  if (!state) { const s = startaOm(m); return { state: s, fix: ut(s, m) }; }

  const dtRaw = (m.tid - state.tid) / 1000;
  if (dtRaw < 0) return { state, fix: null, avvisad: 'gammal' };   // en äldre mätning än den vi redan har
  const dt = Math.max(0.2, dtRaw);
  const acc = accAv(m);
  const sigma = Math.sqrt(state.varM2);
  const fordon = (m.fart ?? 0) > TELEFON_GPS.FORDON_MPS;

  // 1) dålig noggrannhet
  if (acc > TELEFON_GPS.MAX_M && acc >= sigma && m.tid - state.tid <= TELEFON_GPS.FRYST_MS) return { state, fix: null, avvisad: 'daligNoggrannhet' };

  // 2) orimligt hopp
  const d = distMeter(state, m);
  const gräns = fordon ? Infinity : TELEFON_GPS.GANG_MPS * dt + 2 * (acc + sigma);
  if (d > gräns) {
    const avvikare = [...state.avvikare, m].slice(-TELEFON_GPS.OMFORANKRA_ANTAL);
    if (avvikare.length >= TELEFON_GPS.OMFORANKRA_ANTAL && hangerIhop(avvikare)) { const s = startaOm(m); return { state: s, fix: ut(s, m) }; }
    return { state: { ...state, avvikare }, fix: null, avvisad: 'hopp' };
  }

  // 3) godkänd: utjämna
  if (fordon) { const s = startaOm(m); return { state: s, fix: ut(s, m) }; }
  const varP = state.varM2 + TELEFON_GPS.PROCESS_Q * dt;
  const K = varP / (varP + acc * acc);
  const ny: FilterState = { lat: state.lat + K * (m.lat - state.lat), lng: state.lng + K * (m.lng - state.lng), varM2: (1 - K) * varP, tid: m.tid, avvikare: [] };
  return { state: ny, fix: ut(ny, m) };
}

// ── Medelvärde vid placering ────────────────────────────────────────────────────────────────────────────────────────

export interface PlaceringsSample { lat: number; lng: number; noggrannhetM: number; tid: number }

/** Placering: så många BRA fixar, eller så här länge, innan symbolen sätts. */
export const PLACERING = { MIN_FIXAR: 3, MAX_MS: 6000, SOKER_EFTER_MS: 400, TILLBAKA_MS: 6000 } as const;

/** Medelposition viktad med 1/noggrannhet² (en bra fix väger mer än en osäker). Lat/lng räknas lokalt runt första punkten (några meter → exakt nog). */
export function medelPosition(s: readonly PlaceringsSample[]): { lat: number; lng: number; noggrannhetM: number; antal: number } | null {
  if (s.length === 0) return null;
  let sw = 0, sl = 0, sg = 0;
  for (const p of s) {
    const a = Math.max(TELEFON_GPS.MIN_ACC_M, p.noggrannhetM);
    const w = 1 / (a * a);
    sw += w; sl += w * p.lat; sg += w * p.lng;
  }
  const lat = sl / sw, lng = sg / sw;
  // Osäkerheten: fixarnas snittnoggrannhet. Felen hänger ihop i skogen, så ett medelvärde av flera fixar blir inte "bättre" än fixarna själva.
  const accs = s.map((p) => Math.max(TELEFON_GPS.MIN_ACC_M, p.noggrannhetM));
  return { lat, lng, noggrannhetM: Math.round(accs.reduce((x, y) => x + y, 0) / accs.length), antal: s.length };
}

export interface SamlaIn {
  /** prenumerera på filtrerade fixar; ger en funktion som slutar */
  prenumerera: (cb: (fix: { lat: number | null; lng: number | null; noggrannhetM: number | null; giltig: boolean; tid: number }) => void) => () => void;
  /** redan mottagna fixar (hubbens senaste) — så en placering inte väntar i onödan när positionen redan är stabil */
  forhand?: readonly PlaceringsSample[];
  nu?: () => number;
  /** "Söker position…" — anropas EN gång om det inte går direkt */
  onSoker?: () => void;
  minFixar?: number;
  maxMs?: number;
  sokerEfterMs?: number;
}

export interface SamlatResultat { lat: number; lng: number; noggrannhetM: number; antal: number; bra: boolean }

/**
 * Samlar BRA fixar (≤ BRA_M) i några sekunder och ger medelpositionen. Går direkt när minst MIN_FIXAR bra fixar redan finns (sista 6 s).
 * Hinner inga bra fixar komma före MAX_MS: medelpositionen av vad som kom (`bra: false` — anroparen säger det), och null om inget kom alls.
 */
export function samlaPosition(o: SamlaIn): Promise<SamlatResultat | null> {
  const nu = o.nu ?? (() => Date.now());
  const minFixar = o.minFixar ?? PLACERING.MIN_FIXAR;
  const maxMs = o.maxMs ?? PLACERING.MAX_MS;
  const start = nu();
  const alla = new Map<number, PlaceringsSample>();
  const lagg = (p: PlaceringsSample) => { if (nu() - p.tid <= PLACERING.TILLBAKA_MS && Number.isFinite(p.lat) && Number.isFinite(p.lng)) alla.set(p.tid, p); };
  for (const p of o.forhand ?? []) lagg(p);
  const bra = () => Array.from(alla.values()).filter((p) => p.noggrannhetM <= TELEFON_GPS.BRA_M);
  const klart = (): SamlatResultat | null => {
    const b = bra();
    const m = medelPosition(b.length > 0 ? b : Array.from(alla.values()));
    return m ? { ...m, bra: b.length > 0 } : null;
  };
  if (bra().length >= minFixar) return Promise.resolve(klart());

  return new Promise((resolve) => {
    let slut = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let avprenumerera: () => void = () => {};
    const avsluta = (r: SamlatResultat | null) => { if (slut) return; slut = true; timers.forEach(clearTimeout); try { avprenumerera(); } catch { /* */ } resolve(r); };
    avprenumerera = o.prenumerera((f) => {
      if (slut || !f.giltig || f.lat == null || f.lng == null) return;
      lagg({ lat: f.lat, lng: f.lng, noggrannhetM: f.noggrannhetM ?? TELEFON_GPS.OKAND_ACC_M, tid: f.tid });
      if (bra().length >= minFixar) avsluta(klart());
    });
    if (slut) { try { avprenumerera(); } catch { /* */ } return; }
    timers.push(setTimeout(() => { if (!slut) o.onSoker?.(); }, o.sokerEfterMs ?? PLACERING.SOKER_EFTER_MS));
    timers.push(setTimeout(() => avsluta(klart()), Math.max(0, maxMs - (nu() - start))));
  });
}

// ── Osäkerhetscirkeln ───────────────────────────────────────────────────────────────────────────────────────────────

/** En cirkel med radien `radieM` meter runt punkten som GeoJSON-polygon — så radien är verkliga meter på kartan på varje zoomnivå. */
export function cirkelPolygon(lat: number, lng: number, radieM: number, steg = 48): { type: 'Polygon'; coordinates: [number, number][][] } {
  const R = 6371008.8;
  const dLat = (radieM / R) / RAD;
  const dLng = dLat / Math.max(0.01, Math.cos(lat * RAD));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steg; i++) {
    const v = (i / steg) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(v), lat + dLat * Math.sin(v)]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/** Texten bredvid pricken: "±12 m" (bra) eller "osäker position ±85 m" (grov). */
export function osakerhetsText(noggrannhetM: number | null | undefined): string | null {
  if (noggrannhetM == null || !Number.isFinite(noggrannhetM)) return null;
  const m = Math.max(1, Math.round(noggrannhetM));
  return noggrannhetM > TELEFON_GPS.BRA_M ? `osäker position ±${m} m` : `±${m} m`;
}
