// Om trakten › "Visa ›": vad som framhävs på kartan och hur kameran går dit. Rena funktioner (sidan går inte att montera i test).
//   Symbol  → symbolen 1,5× större + en tjock ring i systemblå (med vit kant, syns på ljus satellit-/terrängkarta) + en mjuk puls utanför.
//   Linje   → HELA linjen får en blå glöd med vit kant under sig.
//   Yta     → hela ytans kontur i blått + ett blått fält.
// Alla andra markeringar och linjer tonas ner till ca 30 % (traktgränsen undantagen). Etikett med kommentaren intill den valda.
// Släpps av: ett tryck på kartan, samma rad igen ("Visa hela"), stängd Om trakten-panel, nytt val.

import { FARG } from './design/tokens';
import { arBasvag, type KartMarkering } from './objektKort';
import { basvagText } from './basvag';
import { listText, omNamn } from './omTrakten';

export interface FramhavdMarkering {
  /** alltid TEXT — kartans features bär markeringens id som det är (ofta ett tal, Date.now()), se `lika` */
  id: string;
  slag: KartMarkering['slag'];
  lat: number | null;
  lng: number | null;
  geometri?: { lat: number; lng: number }[];
  /** texten på kartetiketten: kommentaren, annars symbolens namn (basväg: "Basväg röd · 640 m") */
  etikett: string;
  /** texten i listen nertill (telefon): "Basväg röd · 329 m", "Kulturminne · Stenrös" — typ först, kommentaren efter */
  lista?: string;
}

export const FRAMHAV_KALLA = 'omtrakten-framhav-kalla';
export const FRAMHAV_ETIKETT_KALLA = 'omtrakten-framhav-etikett-kalla';
export const FRAMHAV_LAGER = {
  fyll: 'omtrakten-framhav-fyll',
  halo: 'omtrakten-framhav-halo',
  glod: 'omtrakten-framhav-glod',
  linje: 'omtrakten-framhav-linje',
  puls: 'omtrakten-framhav-puls',
  ringHalo: 'omtrakten-framhav-ring-halo',
  ring: 'omtrakten-framhav-ring',
  symbol: 'omtrakten-framhav-symbol',
  etikett: 'omtrakten-framhav-etikett',
} as const;

/** Systemblå (FARG.bla) — ringen, glöden och konturen. Aldrig vit: en vit ring försvinner på ljus karta. */
export const FRAMHAV_FARG = FARG.bla;
/** Vit kant runt det blå, så ringen syns både mot mörk skog och ljus satellitbild. */
export const FRAMHAV_KANT = FARG.text;

/** Andra markeringar tonas ner till så här mycket (ytor lägre, de är stora). Tydlig skillnad mot den valda som behåller sitt fulla värde. */
export const DIMMA_OPACITET = 0.3;
export const DIMMA_FYLL_OPACITET = 0.08;

/** Den valda symbolen ritas så mycket större än på kartan i övrigt. */
export const SYMBOL_FORSTORING = 1.5;
/** Ringens tjocklek i px (blå) och den vita kantens extra tjocklek. */
export const RING_BREDD_PX = 5;
export const RING_KANT_PX = 3;
/** Markörbilderna är 64 px (lib/marker-icons ICON_SIZE) och ritas med `icon-size` ur dessa stopp (page.tsx, markers-layer; de fulla stoppen finns också i körvyns icon-size). */
const MARKOR_BILD_PX = 64;
export const IKON_STOPP: ReadonlyArray<readonly [number, number]> = [[10, 0.15], [12, 0.2], [13, 0.3], [14, 0.4], [15, 0.5], [16, 0.6], [17, 0.75], [19, 1.0]];

/** `icon-size` för den förstorade symbolen: kartans stopp × förstoringen. (zoom måste ligga överst i uttrycket — därför ett stopp per zoomnivå.) */
export const forstoradIkonStorlek = (): any[] =>
  ['interpolate', ['linear'], ['zoom'], ...IKON_STOPP.flatMap(([z, s]) => [z, s * SYMBOL_FORSTORING])];

/** Ringens radie vid varje zoom: runt den förstorade symbolen + luft. `extra` läggs på (pulsen växer utåt). */
export const ringRadieStopp = (extra = 0): any[] =>
  ['interpolate', ['linear'], ['zoom'], ...IKON_STOPP.flatMap(([z, s]) => [z, (MARKOR_BILD_PX * s * SYMBOL_FORSTORING) / 2 + RING_BREDD_PX + extra])];

/** Samma id på kartan och i listan. Kartans features bär `id` som det skapades (symboler: ett TAL, Date.now()), listan har det som TEXT — en strikt
 *  jämförelse `['==', ['get','id'], '1710…']` är falsk för ALLA, så den valda tonades ner med resten ("båda ser lika bleka ut"). Därför `to-string`. */
export const lika = (id: string): any[] => ['==', ['to-string', ['get', 'id']], String(id)];
/** Någon av flera (typraden markerar ALLA av typen): samma jämförelse som `lika`, men mot en lista. En enda id ger exakt `lika`. */
export const likaNagon = (ids: readonly string[]): any[] => (ids.length === 1 ? lika(ids[0]) : ['in', ['to-string', ['get', 'id']], ['literal', ids.map(String)]]);

export function framhavdFran(m: Pick<KartMarkering, 'id' | 'slag' | 'typ' | 'namn' | 'comment' | 'farg' | 'langdM' | 'lat' | 'lng' | 'geometri'>): FramhavdMarkering {
  const komm = String(m.comment ?? '').trim();
  const etikett = komm || (arBasvag(m) ? basvagText(m.farg, m.langdM) : omNamn(m).trim());
  return { id: String(m.id), slag: m.slag, lat: m.lat, lng: m.lng, geometri: m.geometri, etikett, lista: listText(m) };
}

/** Det som framhävs: en markering (tryck på ett objekt) eller flera (tryck på en typrad: alla av typen). */
export type Framhavning = FramhavdMarkering | readonly FramhavdMarkering[];
export const framhavLista = (f: Framhavning | null | undefined): FramhavdMarkering[] => (!f ? [] : Array.isArray(f) ? [...(f as readonly FramhavdMarkering[])] : [f as FramhavdMarkering]);

const giltig = (p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** Geometrin som ritas: linje → LineString av ALLA punkter, yta → sluten Polygon, annars (eller utan geometri) en Point. */
export function framhavGeoJson(f: Framhavning | null): { type: 'FeatureCollection'; features: any[] } {
  const lista = framhavLista(f);
  if (lista.length !== 1) return { type: 'FeatureCollection', features: lista.flatMap((x) => framhavGeoJson(x).features) };
  return framhavGeoJsonEn(lista[0]);
}

function framhavGeoJsonEn(f: FramhavdMarkering | null): { type: 'FeatureCollection'; features: any[] } {
  const tom = { type: 'FeatureCollection' as const, features: [] as any[] };
  if (!f) return tom;
  const pts = (f.geometri ?? []).filter(giltig);
  if (f.slag === 'linje' && pts.length >= 2) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: f.id }, geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) } }] };
  }
  if (f.slag === 'zon' && pts.length >= 3) {
    const ring = pts.map((p) => [p.lng, p.lat]);
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] !== b[0] || a[1] !== b[1]) ring.push(ring[0]);
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: f.id }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
  }
  if (f.lat != null && f.lng != null && Number.isFinite(f.lat) && Number.isFinite(f.lng)) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: f.id }, geometry: { type: 'Point', coordinates: [f.lng, f.lat] } }] };
  }
  return tom;
}

/** Ramen kameran ska rymma (bara linje/yta med minst två punkter) — annars null och kameran flyger till punkten. */
export function framhavBounds(f: Framhavning | null): [[number, number], [number, number]] | null {
  const lista = framhavLista(f);
  if (lista.length > 1) {
    // Typraden: kameran rymmer ALLA — symbolernas punkter och linjernas/ytornas hörn.
    const pts: { lat: number; lng: number }[] = [];
    for (const x of lista) {
      if (x.slag !== 'symbol' && x.geometri?.length) pts.push(...x.geometri.filter(giltig));
      else if (x.lat != null && x.lng != null && giltig({ lat: x.lat, lng: x.lng })) pts.push({ lat: x.lat, lng: x.lng });
    }
    if (pts.length === 0) return null;
    return [[Math.min(...pts.map((p) => p.lng)), Math.min(...pts.map((p) => p.lat))], [Math.max(...pts.map((p) => p.lng)), Math.max(...pts.map((p) => p.lat))]];
  }
  const f1 = lista[0] ?? null;
  if (!f1 || f1.slag === 'symbol') return null;
  const pts = (f1.geometri ?? []).filter(giltig);
  if (pts.length < 2) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of pts) { w = Math.min(w, p.lng); e = Math.max(e, p.lng); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return [[w, s], [e, n]];
}

/** Var etiketten sitter: symbol → punkten (etiketten läggs bredvid ringen); linje → MITTEN längs linjen (halva längden, inte mitten av ramen);
 *  yta → medelpunkten av hörnen. Saknas geometri faller allt tillbaka till markeringens punkt. */
export function etikettPunkt(f: FramhavdMarkering | null): { lat: number; lng: number } | null {
  if (!f) return null;
  const pts = (f.geometri ?? []).filter(giltig);
  if (f.slag === 'linje' && pts.length >= 2) {
    // Längd i meter-lika enheter (lat/lng skalas med cos(lat)) — bara för att hitta halva vägen.
    const kos = Math.cos((pts[0].lat * Math.PI) / 180);
    const d = (a: typeof pts[0], b: typeof pts[0]) => Math.hypot((b.lat - a.lat), (b.lng - a.lng) * kos);
    let tot = 0;
    for (let i = 1; i < pts.length; i++) tot += d(pts[i - 1], pts[i]);
    let kvar = tot / 2;
    for (let i = 1; i < pts.length; i++) {
      const l = d(pts[i - 1], pts[i]);
      if (kvar <= l || i === pts.length - 1) {
        const t = l > 0 ? Math.min(1, kvar / l) : 0;
        return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t };
      }
      kvar -= l;
    }
  }
  if (f.slag === 'zon' && pts.length >= 3) {
    // sista punkten == första när ringen är sluten → räkna den inte två gånger
    const slutna = pts.length > 3 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng;
    const h = slutna ? pts.slice(0, -1) : pts;
    return { lat: h.reduce((a, p) => a + p.lat, 0) / h.length, lng: h.reduce((a, p) => a + p.lng, 0) / h.length };
  }
  if (f.lat != null && f.lng != null && Number.isFinite(f.lat) && Number.isFinite(f.lng)) return { lat: f.lat, lng: f.lng };
  return null;
}

export interface DimmaMal { id: string; prop: 'icon-opacity' | 'circle-opacity' | 'line-opacity' | 'fill-opacity'; dim: number }
export interface LagerRad { id: string; type?: string }

/** Vilka lager som tonas ner och hur: markeringarnas symboler, prickar, pilar, linjer och ytor. Traktgränsen behålls (alltid synlig), liksom
 *  träffytorna (osynliga), textlagren och allt som inte är en markering. Lagrets typ avgör egenskapen, så ett textlager aldrig får `line-opacity`. */
export function dimmaMal(lager: ReadonlyArray<LagerRad | string>): DimmaMal[] {
  const ut: DimmaMal[] = [];
  for (const l of lager) {
    const id = typeof l === 'string' ? l : l.id;
    const typ = typeof l === 'string' ? undefined : l.type;
    if (id.startsWith('omtrakten-') || id.endsWith('-hit') || id === 'line-hitbox') continue;
    if (id === 'markers-layer' || id === 'arrows-layer') { if (!typ || typ === 'symbol') ut.push({ id, prop: 'icon-opacity', dim: DIMMA_OPACITET }); }
    else if (id === 'markers-prick') ut.push({ id, prop: 'circle-opacity', dim: DIMMA_OPACITET });
    else if (id.startsWith('line-boundary')) continue;
    else if (id.startsWith('line-')) { if (!typ || typ === 'line') ut.push({ id, prop: 'line-opacity', dim: DIMMA_OPACITET }); }
    else if (id === 'zone-fill') ut.push({ id, prop: 'fill-opacity', dim: DIMMA_FYLL_OPACITET });
    else if (id.startsWith('zone-outline')) { if (!typ || typ === 'line') ut.push({ id, prop: 'line-opacity', dim: DIMMA_OPACITET }); }
  }
  return ut;
}

/** Pulsen 0 → 1 → 0 över `periodMs` (mjuk, cosinus). Minskad rörelse: stilla på mitten. */
export function pulsFas(nowMs: number, periodMs = 1400, minskadRorelse = false): number {
  if (minskadRorelse) return 0.5;
  const ph = (((nowMs % periodMs) + periodMs) % periodMs) / periodMs;
  return 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI);
}

// ── Att lämna framhävningen ──────────────────────────────────────────────────────────────────────────────────────────

/** Varför framhävningen släpps. rad = samma rad igen ("Visa hela"), karta = tryck på tom yta, stang = Om trakten-panelen stängd, tillbaka = telefonens
 *  "‹ Om trakten" (öppnar listan igen, kameran lämnas), nytt = en annan markering vald (kameran styrs av det nya valet). */
export type SlappOrsak = 'rad' | 'karta' | 'stang' | 'tillbaka' | 'nytt';

/** Rad ("Visa hela", telefonens ×) och stängd panel zoomar ut till hela trakten. Ett tryck på tom yta släpper BARA framhävningen — kameran står kvar, som i Apple Kartor
 *  (Martin 2026-10-15). "‹ Om trakten" och ett nytt val flyttar inte heller kameran. */
export const slappAtgard = (orsak: SlappOrsak): { zoomaUt: boolean } => ({ zoomaUt: orsak === 'rad' || orsak === 'stang' });

/** Ett tryck på kartan (och inte en panorering/nyp): rörelsen under fingret < gränsen, kort tid, ett enda finger. */
export const TRYCK_MAX_FLYTT_PX = 10;
export const TRYCK_MAX_MS = 700;
export function arKartTryck(o: { dx: number; dy: number; ms: number; flerFingrar: boolean }): boolean {
  return !o.flerFingrar && Math.hypot(o.dx, o.dy) <= TRYCK_MAX_FLYTT_PX && o.ms <= TRYCK_MAX_MS;
}
