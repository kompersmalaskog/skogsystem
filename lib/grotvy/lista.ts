// GROT-arket i /oversikt-v2 — vilka trakter som väntar på GROT, i vilken ordning, och vad raden säger.
//
// REN LOGIK: tar redan hämtade rader, returnerar listan. Ingen databas, ingen klocka (idag
// skickas in) — så samma funktion körs i vyn, i v2:s kö och i förvärmningsskriptet, och
// testas utan nätverk. Hämtningen ligger i hamta.ts.
//
// MEDLEMSKAP ("rislistan" + skördningen avslutad). En trakt är med när ALLA stämmer:
//   • dim_objekt.grot_anpassad = true (samma flagga som gamla GROT-fliken och hamtaRisKandidater)
//   • inte exkluderad, och inte själv ett risjobb (risskotning / huvudtyp 'Grot')
//   • grot_hamtad är tom (GROT inte hämtad)
//   • skordning_avslutad är satt — flaggan är bara GRIND, ingen datumkälla
//   • det finns skördad volym (vy_uppf_prod_per_objekt) — utan volym finns ingen grund
//   • KÖRD-REGEL: inget länkat risjobb (grot_koppling) har skotning_avslutad
// Avverkat-datumet är sista skördardagen (vy_uppf_prod_per_objekt.sista_datum), inte flaggans datum.
//
// TVÅ GRUPPER. Överst "Markägaren vill ha det bort" = trakter med grot_senast, soonest först.
// Under "När det passar" = resten, äldst avverkat först. Tom grupp visas inte.

import { arRisjobb, harledTyp } from '@/lib/objekt/typ';
import { haversine } from '@/utils/geo';
import { dagAv, dagarSedan } from './format';

// ── Råa rader (det hamta.ts läser) ───────────────────────────────────────────

export type GrotSkal = 'markberedning' | 'plantering' | 'annat';
export const GROT_SKAL: GrotSkal[] = ['markberedning', 'plantering', 'annat'];
export function arGrotSkal(v: unknown): v is GrotSkal {
  return v === 'markberedning' || v === 'plantering' || v === 'annat';
}

export interface GrotDim {
  objekt_id: string;
  object_name: string | null;
  vo_nummer: string | null;
  areal_ha: number | null;
  latitude: number | null;
  longitude: number | null;
  huvudtyp: string | null;
  atgard: string | null;
  grot_anpassad: boolean | null;
  grot_hamtad: string | null;
  grot_senast: string | null;
  grot_skal: string | null;
  exkludera: boolean | null;
  risskotning: boolean | null;
  skordning_avslutad: string | null;
  skotning_avslutad: string | null;
}

export interface GrotProd { objekt_id: string; volym_m3sub: number | string | null; sista_datum: string | null }

export interface GrotKoppling { risjobb_objekt_id: string; avverknings_objekt_id: string; auto_avbockad_datum?: string | null }

/** Operativa objekt-raden (planeringen). maskin_ko.objekt_id och kartan pekar på id. */
export interface GrotObjektRad {
  id: string;
  vo_nummer: string | null;
  namn: string | null;
  typ: string | null;
  status: string | null;
  atgard: string | null;
  areal: number | null;
  lat: number | null;
  lng: number | null;
  dim_objekt_id: string | null;
}

export interface GrotRaw {
  /** dim_objekt med grot_anpassad = true */
  dim: GrotDim[];
  /** dim_objekt för de risjobb som är länkade via grot_koppling */
  risjobb: GrotDim[];
  kopplingar: GrotKoppling[];
  prod: GrotProd[];
  /** objekt-rader som hör till trakterna och risjobben (se objektFor) */
  objekt: GrotObjektRad[];
}

/** Det listan behöver veta om en maskins senaste plats (delmängd av PlatsForslag). */
export interface GrotPlats { objektId: string | null; tidpunkt: string | null }

// ── Resultat ──────────────────────────────────────────────────────────────────

export type GrotTyp = 'slutavverkning' | 'gallring';
export interface Koord { lat: number; lng: number }

export interface GrotRad {
  /** dim_objekt.objekt_id — nyckeln i listan */
  id: string;
  namn: string;
  voNummer: string | null;
  /** Sista skördardagen, 'YYYY-MM-DD'. Null = okänt (raden säger det). */
  avverkat: string | null;
  dagar: number | null;
  /** Skördad volym, m³fub (= volym_m3sub) */
  skordatM3: number;
  /** Markägarens datum + skäl (grot_senast / grot_skal) */
  senast: string | null;
  skal: GrotSkal | null;
  koordinat: Koord | null;
  /** Planeringens objekt-rad. Null = trakten saknar objekt i planeringen → ingen kö, ingen karta. */
  objekt: GrotObjektRad | null;
  atgard: string | null;
  arealHa: number | null;
  typ: GrotTyp | null;
  /** Maskinen som står på ett länkat risjobb just nu (≤ STAAR_HAR_DAGAR gammal position) */
  staarHar: { maskinId: string; risjobb: string } | null;
}

export interface GrotLista {
  /** "Markägaren vill ha det bort" — tom = gruppen visas inte */
  markagaren: GrotRad[];
  /** "När det passar · äldst först" */
  passar: GrotRad[];
  /** Båda grupperna i visad ordning */
  alla: GrotRad[];
}

/** En maskins position räknas som "står här" bara om den är så här färsk. */
export const STAAR_HAR_DAGAR = 7;

// ── Koordinater ───────────────────────────────────────────────────────────────

// Samma spärr som maskinflytt/senastePlats (dim_objekt innehåller punkter som pekar helt fel,
// t.ex. 52 mil bort). Kopieras hit — senastePlats drar in webbläsarens supabase-klient, som
// en ren modul (och dess test) inte får ha. Ändra båda om gränsen ändras.
const VERKSAMHET = { lat: 56.5, lng: 14.72 };
const MAX_AVSTAND_KM = 150;

export function rimligKoordinat(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return haversine(VERKSAMHET.lat, VERKSAMHET.lng, lat, lng) <= MAX_AVSTAND_KM;
}

/** Objektets egen punkt först, annars dim_objekt. Orimlig punkt räknas som saknad. */
export function koordinatFor(objekt: GrotObjektRad | null, dim: GrotDim): Koord | null {
  if (objekt && rimligKoordinat(objekt.lat, objekt.lng)) return { lat: objekt.lat as number, lng: objekt.lng as number };
  if (rimligKoordinat(dim.latitude, dim.longitude)) return { lat: dim.latitude as number, lng: dim.longitude as number };
  return null;
}

// ── dim ↔ objekt ──────────────────────────────────────────────────────────────

/** Alla objekt-rader som hör till en dim_objekt-rad, i prioritetsordning: FK (dim_objekt_id) först,
 *  sedan vo_nummer = dimmens vo_nummer, sist vo_nummer = dimmens objekt_id (numeriska nycklar). */
export function objektRaderFor(dim: GrotDim, objekt: GrotObjektRad[]): GrotObjektRad[] {
  const ut: GrotObjektRad[] = [];
  const lagg = (o: GrotObjektRad) => { if (ut.indexOf(o) < 0) ut.push(o); };
  objekt.forEach((o) => { if (o.dim_objekt_id && o.dim_objekt_id === dim.objekt_id) lagg(o); });
  const vo = (dim.vo_nummer ?? '').trim();
  if (vo) objekt.forEach((o) => { if (o.vo_nummer && o.vo_nummer === vo) lagg(o); });
  objekt.forEach((o) => { if (o.vo_nummer && o.vo_nummer === dim.objekt_id) lagg(o); });
  return ut;
}

/** Typ för kö-matchning (skotar_roll): objektets egen, annars härledd ur huvudtyp. */
export function typFor(objekt: GrotObjektRad | null, dim: GrotDim): GrotTyp | null {
  const t = (objekt?.typ ?? '').toLowerCase();
  if (t === 'slutavverkning' || t === 'gallring') return t;
  const h = harledTyp(false, dim.huvudtyp);
  return h === 'slutavverkning' || h === 'gallring' ? h : null;
}

/** Skotarens roll mot objekttyp. Speglar rollMatchar i oversikt-v2/nasta-v2: 'allt' tar allt,
 *  annars måste typen vara exakt rollen. Okänd typ → bara 'allt'. */
export function rollMatcharTyp(roll: string | null | undefined, typ: string | null | undefined): boolean {
  if (roll === 'allt') return true;
  return (roll === 'slutavverkning' || roll === 'gallring') && roll === typ;
}

// ── Listan ────────────────────────────────────────────────────────────────────

export interface ByggOpt {
  /** Dagens datum 'YYYY-MM-DD' */
  idag: string;
  /** maskin_id → senaste kända plats (hamtaSenastePlatser). Saknas den visas aldrig "står här". */
  platser?: Map<string, GrotPlats>;
  /** Skotare som får räknas som "står här" (aktiva skotare). */
  skotare?: { id: string; namn: string }[];
}

function volymAv(p: GrotProd | undefined): number {
  const v = Number(p?.volym_m3sub ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** Risjobb som är KLART (skotning_avslutad satt) bland trakten länkade risjobb. */
function harKlartRisjobb(traktId: string, kopplingar: GrotKoppling[], risjobbPer: Map<string, GrotDim>): boolean {
  return kopplingar.some((k) => k.avverknings_objekt_id === traktId && !!risjobbPer.get(k.risjobb_objekt_id)?.skotning_avslutad);
}

/** KÖRD-REGELN — EN definition för listan och för kö-rensningen: GROT är hämtad (grot_hamtad satt) ELLER ett länkat
 *  risjobb är klart (skotning_avslutad). */
function arKord(dim: GrotDim, kopplingar: GrotKoppling[], risjobbPer: Map<string, GrotDim>): boolean {
  return !!dim.grot_hamtad || harKlartRisjobb(dim.objekt_id, kopplingar, risjobbPer);
}

/** objekt.id för GROT-trakter där körd-regeln har slagit. Kö-rader på sådana (avslutade) trakter är kvarlevor
 *  efter GROT och tas bort (lib/grotvy/ko). Bara trakter med grot_anpassad räknas — en avslutad trakt som aldrig
 *  var GROT lämnas ifred, hur gammal dess kö-rad än är. */
export function grotKordaObjektIds(raw: GrotRaw): Set<string> {
  const risjobbPer = new Map<string, GrotDim>();
  raw.risjobb.forEach((r) => risjobbPer.set(r.objekt_id, r));
  const ids = new Set<string>();
  raw.dim.forEach((dim) => {
    if (dim.grot_anpassad !== true || arRisjobb(dim)) return;
    if (!arKord(dim, raw.kopplingar, risjobbPer)) return;
    objektRaderFor(dim, raw.objekt).forEach((o) => ids.add(o.id));
  });
  return ids;
}

export function byggGrotLista(raw: GrotRaw, opt: ByggOpt): GrotLista {
  const { idag } = opt;
  const prodPer = new Map<string, GrotProd>();
  raw.prod.forEach((p) => prodPer.set(p.objekt_id, p));
  const risjobbPer = new Map<string, GrotDim>();
  raw.risjobb.forEach((r) => risjobbPer.set(r.objekt_id, r));

  const rader: GrotRad[] = [];
  raw.dim.forEach((dim) => {
    if (dim.grot_anpassad !== true) return;
    if (dim.exkludera === true) return;
    if (arRisjobb(dim)) return;              // ett risjobb är inte en trakt som väntar på GROT
    if (arKord(dim, raw.kopplingar, risjobbPer)) return; // körd-regeln: GROT hämtad, eller länkat risjobb klart
    if (!dim.skordning_avslutad) return;     // grind: skördningen är inte avslutad
    const prod = prodPer.get(dim.objekt_id);
    const skordat = volymAv(prod);
    if (!(skordat > 0)) return;              // utan skördad volym finns ingen grund

    const objekt = objektRaderFor(dim, raw.objekt)[0] ?? null;
    const avverkat = dagAv(prod?.sista_datum);
    const senast = dagAv(dim.grot_senast);
    rader.push({
      id: dim.objekt_id,
      namn: (dim.object_name ?? '').trim() || objekt?.namn || dim.objekt_id,
      voNummer: dim.vo_nummer,
      avverkat,
      dagar: dagarSedan(avverkat, idag),
      skordatM3: skordat,
      senast,
      skal: senast && arGrotSkal(dim.grot_skal) ? dim.grot_skal : null,
      koordinat: koordinatFor(objekt, dim),
      objekt,
      atgard: (objekt?.atgard ?? '').trim() || (dim.atgard ?? '').trim() || null,
      arealHa: objekt?.areal != null && objekt.areal > 0 ? objekt.areal : dim.areal_ha != null && dim.areal_ha > 0 ? dim.areal_ha : null,
      typ: typFor(objekt, dim),
      staarHar: staarHarFor(dim, raw, risjobbPer, opt),
    });
  });

  const jamfor = (a: GrotRad, b: GrotRad): number => {
    // Äldst avverkat först; okänt datum sist; namn avgör vid lika (stabil ordning).
    if (a.avverkat !== b.avverkat) {
      if (!a.avverkat) return 1;
      if (!b.avverkat) return -1;
      return a.avverkat < b.avverkat ? -1 : 1;
    }
    return a.namn.localeCompare(b.namn, 'sv') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  const markagaren = rader.filter((r) => !!r.senast).sort((a, b) => {
    // Närmast i tid först (ett försenat datum ligger före ett kommande), sedan äldst avverkat.
    if (a.senast !== b.senast) return (a.senast as string) < (b.senast as string) ? -1 : 1;
    return jamfor(a, b);
  });
  const passar = rader.filter((r) => !r.senast).sort(jamfor);
  return { markagaren, passar, alla: markagaren.concat(passar) };
}

/** "X står här": bara via ett länkat risjobb som inte är klart, och bara om maskinens senaste
 *  plats är det risjobbets objekt och högst STAAR_HAR_DAGAR gammal. */
function staarHarFor(dim: GrotDim, raw: GrotRaw, risjobbPer: Map<string, GrotDim>, opt: ByggOpt): GrotRad['staarHar'] {
  if (!opt.platser || !opt.skotare || opt.skotare.length === 0) return null;
  const lankade = raw.kopplingar.filter((k) => k.avverknings_objekt_id === dim.objekt_id);
  for (const k of lankade) {
    const risjobb = risjobbPer.get(k.risjobb_objekt_id);
    if (!risjobb || risjobb.skotning_avslutad) continue;
    const risjobbObjektIds = objektRaderFor(risjobb, raw.objekt).map((o) => o.id);
    if (risjobbObjektIds.length === 0) continue;
    for (const m of opt.skotare) {
      const plats = opt.platser.get(m.id);
      if (!plats || !plats.objektId || risjobbObjektIds.indexOf(plats.objektId) < 0) continue;
      const alder = dagarSedan(plats.tidpunkt, opt.idag);
      if (alder == null || alder > STAAR_HAR_DAGAR) continue;
      return { maskinId: m.id, risjobb: (risjobb.object_name ?? '').trim() || risjobb.objekt_id };
    }
  }
  return null;
}

/** objekt.id för de GROT-väntande trakterna som har en objekt-rad — v2:s kö släpper in dem
 *  trots att de är avslutade. */
export function grotVantandeObjektIds(lista: GrotLista): Set<string> {
  const ids = new Set<string>();
  lista.alla.forEach((r) => { if (r.objekt) ids.add(r.objekt.id); });
  return ids;
}
