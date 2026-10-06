// Egenkontrollens karta: fran punkter och kontextmarkeringar till features.
//
// RENA FUNKTIONER, ingen DOM och ingen MapLibre - sa att allt har gar att
// testa i vitest. RundKarta.tsx limmar bara ihop resultatet med kartan.
//
// KONTROLLPUNKTERNA lases ur geometri_snapshot + punkt_typ, aldrig ur
// planering_markeringar. Snapshotten ar dokumentets sanning och overlever att
// markeringen raderas.
//
// KONTEXTLAGRET lases ur planering_markeringar och ar orientering, inte
// innehall: nedtonat och aldrig tryckbart.

import { pathTillGeoJson, svgTillGeoJson, type Origo } from './kartkoordinater';
import {
  IKON_STORLEK, LINJE_KANT_BREDD, LINJE_STIL, PIL_STIL,
  ikonRadie, linjeLager, nummerLager, pilLager, statusLinjeLager, statusRingLager,
  symbolLager, zonFyllLager, zonKantLager, zoomKurva,
} from './kartstil';
import { markerIconDefs } from './marker-icons';
import { ZONE_COLORS } from './zone-colors';
import { avstandM, provytaStatus, type ProvytaStatus } from './provytor';
import { provytaBildNamn } from './provytaIkon';

export type Kind = 'symbol' | 'linje' | 'zon' | 'pil';

export type Klass = {
  kind: 'symbol' | 'linje' | 'zon';
  /** Symbol-, linje- eller zontyp: det som valjer utseende. */
  typ: string;
  /** Finns typen i stilen? Annars ritas en neutral fallback i stallet for att forsvinna. */
  kand: boolean;
};

type Koord = [number, number];
type SvgPunkt = { x?: number | null; y?: number | null };

const SYMBOL_IDN = new Set(markerIconDefs.map((d) => d.id));
const LINJE_IDN = new Set(LINJE_STIL.map((l) => l.id));
const ZON_IDN = new Set(Object.keys(ZONE_COLORS));
const PIL_IDN = new Set(PIL_STIL.map((p) => p.id));

function ar(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function giltigPath(path: unknown): SvgPunkt[] {
  if (!Array.isArray(path)) return [];
  return path.filter((p): p is SvgPunkt => ar(p) && typeof p.x === 'number' && typeof p.y === 'number');
}

/**
 * Vilken sorts utseende en kontrollpunkt ska ha.
 *
 * TYPEN RACKER INTE, FORMEN MASTE MED. `wet` finns bade som symbol ("Blot
 * flack", x/y) och som zon ("Blot zon", path) - verifierat pa Ulfsnas. Formen
 * avgor: x/y ar en symbol, path ar en linje eller zon.
 *
 * Mellan linje och zon avgor typen. Linjetyperna och zontyperna har inga
 * gemensamma id (testas), sa det ar entydigt.
 *
 * null = ingen plats alls (kalla='fast', eller geometri saknas). Okand typ
 * ger en neutral fallback med kand=false, aldrig en tyst forsvunnen punkt.
 */
export function klassaPunkt(punktTyp: string | null | undefined, geometri: unknown): Klass | null {
  if (!ar(geometri)) return null;
  const typ = typeof punktTyp === 'string' ? punktTyp : '';

  if (Array.isArray(geometri.path)) {
    if (giltigPath(geometri.path).length < 2) return null;
    if (LINJE_IDN.has(typ)) return { kind: 'linje', typ, kand: true };
    if (ZON_IDN.has(typ)) return { kind: 'zon', typ, kand: true };
    return { kind: 'linje', typ, kand: false };
  }
  if (typeof geometri.x === 'number' && typeof geometri.y === 'number') {
    return { kind: 'symbol', typ, kand: SYMBOL_IDN.has(typ) };
  }
  return null;
}

/**
 * Basvagens nummer ur rubriken ("Basvag 4" -> 4). KASTAR ALDRIG: matchar den
 * inte blir det en linje utan siffra, aldrig en krasch.
 *
 * Numret finns inte som falt i snapshotten, bara inbakat i rubriken. Pa
 * Ulfsnas stammer det: Basvag 1-4 ar markorernas nummer 1-4. Rubrikens nummer
 * ar planeringens bara nar markoren hade ett - annars ar det ett lopnummer
 * fran egenkontrollen. Det ar OKEJ, och det ar det ratta: siffran pa kartan
 * ska vara samma som rubriken pa kortet man trycker pa.
 */
export function basvagsNummer(rubrik: unknown): number | null {
  if (typeof rubrik !== 'string') return null;
  const m = /^\s*Basväg\s+(\d{1,3})(?=\s*(?:,|$))/i.exec(rubrik.normalize('NFC'));
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Punkten halvvags langs linjen, raknat pa LANGD - inte pa antal brytpunkter. */
export function mittpunktPaLinje(koord: Koord[]): Koord | null {
  if (koord.length < 2) return null;
  const langder: number[] = [];
  let total = 0;
  for (let i = 1; i < koord.length; i++) {
    const l = avstandM(
      { lat: koord[i - 1][1], lng: koord[i - 1][0] },
      { lat: koord[i][1], lng: koord[i][0] },
    );
    langder.push(l);
    total += l;
  }
  if (!(total > 0)) return koord[0];
  let kvar = total / 2;
  for (let i = 0; i < langder.length; i++) {
    if (kvar <= langder[i] || i === langder.length - 1) {
      const t = langder[i] > 0 ? Math.min(1, kvar / langder[i]) : 0;
      return [
        koord[i][0] + (koord[i + 1][0] - koord[i][0]) * t,
        koord[i][1] + (koord[i + 1][1] - koord[i][1]) * t,
      ];
    }
    kvar -= langder[i];
  }
  return koord[0];
}

/** Alla koordinater i en geometri, platt - for fitBounds. */
export function geometriKoordinater(g: { type: string; coordinates: any } | null | undefined): Koord[] {
  if (!g) return [];
  if (g.type === 'Point') return [g.coordinates as Koord];
  if (g.type === 'LineString') return g.coordinates as Koord[];
  if (g.type === 'Polygon') return (g.coordinates as Koord[][]).flat();
  return [];
}

/** Zoner ar ytor: stang ringen. Mindre an tre punkter ar ingen yta - da en linje. */
function zonGeometri(koord: Koord[]) {
  if (koord.length < 3) return { type: 'LineString', coordinates: koord };
  const f = koord[0], s = koord[koord.length - 1];
  const stangd = f[0] === s[0] && f[1] === s[1] ? koord : [...koord, f];
  return { type: 'Polygon', coordinates: [stangd] };
}

export type KartPunkt = {
  id: string;
  punkt_typ: string | null;
  rubrik: string | null;
  status: string | null;
  geometri_snapshot: unknown;
};

export type Feature = { type: 'Feature'; properties: Record<string, unknown>; geometry: any };

/**
 * En kontrollpunkt -> en feature, och for en numrerad basvag ocksa en
 * nummerfeature mitt pa vagen.
 */
export function kontrollFeatures(
  p: KartPunkt,
  origo: Origo,
): { feature: Feature | null; nummer: Feature | null } {
  const klass = klassaPunkt(p.punkt_typ, p.geometri_snapshot);
  if (!klass) return { feature: null, nummer: null };
  const g = p.geometri_snapshot as { x?: number; y?: number; path?: SvgPunkt[] };
  const props: Record<string, unknown> = {
    id: p.id, kind: klass.kind, typ: klass.typ, status: p.status ?? 'obesvarad',
  };

  if (klass.kind === 'symbol') {
    props.ikon = klass.kand ? klass.typ : 'default';
    return {
      feature: {
        type: 'Feature', properties: props,
        geometry: { type: 'Point', coordinates: svgTillGeoJson(g.x as number, g.y as number, origo) },
      },
      nummer: null,
    };
  }

  const koord = pathTillGeoJson(giltigPath(g.path), origo) as Koord[];
  if (koord.length < 2) return { feature: null, nummer: null };
  const feature: Feature = {
    type: 'Feature', properties: props,
    geometry: klass.kind === 'zon' ? zonGeometri(koord) : { type: 'LineString', coordinates: koord },
  };

  let nummer: Feature | null = null;
  if (klass.kind === 'linje' && klass.typ === 'mainRoad') {
    const nr = basvagsNummer(p.rubrik);
    const mitt = nr !== null ? mittpunktPaLinje(koord) : null;
    if (nr !== null && mitt) {
      nummer = { type: 'Feature', properties: { id: p.id, nr }, geometry: { type: 'Point', coordinates: mitt } };
    }
  }
  return { feature, nummer };
}

/** Pilens riktning. angle vinner over rotation - aven nar angle ar 0 (nya pilar har angle:0). */
export function pilVinkel(d: Record<string, unknown>): number {
  const v = d.angle ?? d.rotation ?? 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * En kontextmarkering (raden ur planering_markeringar) -> en feature.
 * null for det som inte gar att placera, eller en pil av okand typ - hellre
 * ingenting an en gissad pil.
 */
export function kontextFeature(data: unknown, origo: Origo): Feature | null {
  if (!ar(data)) return null;

  if (typeof data.arrowType === 'string') {
    if (!PIL_IDN.has(data.arrowType)) return null;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return null;
    return {
      type: 'Feature',
      properties: { kind: 'pil', typ: data.arrowType, rotation: pilVinkel(data) },
      geometry: { type: 'Point', coordinates: svgTillGeoJson(data.x, data.y, origo) },
    };
  }

  if (Array.isArray(data.path)) {
    const koord = pathTillGeoJson(giltigPath(data.path), origo) as Koord[];
    if (koord.length < 2) return null;
    if (typeof data.zoneType === 'string') {
      return {
        type: 'Feature', properties: { kind: 'zon', typ: data.zoneType },
        geometry: zonGeometri(koord),
      };
    }
    return {
      type: 'Feature',
      properties: { kind: 'linje', typ: typeof data.lineType === 'string' ? data.lineType : '' },
      geometry: { type: 'LineString', coordinates: koord },
    };
  }

  if (typeof data.x === 'number' && typeof data.y === 'number') {
    const typ = typeof data.type === 'string' ? data.type : '';
    return {
      type: 'Feature',
      properties: { kind: 'symbol', typ, ikon: SYMBOL_IDN.has(typ) ? typ : 'default' },
      geometry: { type: 'Point', coordinates: svgTillGeoJson(data.x, data.y, origo) },
    };
  }
  return null;
}

/**
 * Kontextmarkeringarna UTAN dem som redan ar kontrollpunkter.
 *
 * hamtaKontextmarkeringar returnerar ALLA markeringar, aven de som blivit
 * kontrollpunkter - som kontext ritades de darfor under sig sjalva, som en
 * vit kontur under den fargade punkten. Med riktiga symboler hade varje
 * evighetstrad blivit tva. En markering som raderats efter genereringen har
 * ingen kontextrad, sa inget dubblerades dar.
 */
export function kontextUtanKontrollpunkter<T extends { marker_id?: string | null }>(
  kontext: T[],
  punkter: { markering_marker_id: string | null }[],
): T[] {
  const kontroll = new Set(
    punkter.map((p) => p.markering_marker_id).filter((m): m is string => m != null).map(String),
  );
  return kontext.filter((m) => m.marker_id == null || !kontroll.has(String(m.marker_id)));
}

// ---------------------------------------------------------------------------
// Lagren - EN definition som bade RundKarta och testet anvander
// ---------------------------------------------------------------------------

export const KONTEXT_KALLA = 'ek-kontext';
export const KONTROLL_KALLA = 'ek-punkter';
export const NUMMER_KALLA = 'ek-nummer';
export const VALD_LINJE_ID = 'ek-vald-linje';
export const VALD_SYMBOL_ID = 'ek-vald-symbol';

/** Filter for den valda punktens gloria. id '' = ingen vald. */
export function valdLinjeFilter(id: string): any[] {
  return ['all', ['!=', ['get', 'kind'], 'symbol'], ['==', ['get', 'id'], id]];
}
export function valdSymbolFilter(id: string): any[] {
  return ['all', ['==', ['get', 'kind'], 'symbol'], ['==', ['get', 'id'], id]];
}

/**
 * KONTEXTLAGRET: nedtonat, tunnare, utan nummer och utan tryckytor. Det ar
 * orientering - traktgrans, diken, fallriktningar - inte innehall i dokumentet.
 *
 * Typens farg och form behalls (ett dike ser ut som ett dike) men i lag
 * opacitet, sa att man ser VAD det ar utan att det konkurrerar med
 * kontrollpunkterna.
 */
export function kontextLager(): any[] {
  const linje = { opacitet: 0.4, breddFaktor: 0.6, utanKant: true };
  const ikon = { opacitet: 0.45, breddFaktor: 0.7 };
  return [
    ...zonFyllLager(KONTEXT_KALLA, 'ek-k', null, linje),
    ...zonKantLager(KONTEXT_KALLA, 'ek-k', null, linje),
    ...linjeLager(KONTEXT_KALLA, 'ek-k', null, linje),
    pilLager(KONTEXT_KALLA, 'ek-k', ikon),
    symbolLager(KONTEXT_KALLA, 'ek-k', null, ikon),
  ];
}

/**
 * KONTROLLPUNKTERNA, nerifran och upp:
 *   zonfyllning
 *   den valda punktens gloria            (under allt annat - syns som en vit kant)
 *   statusband for linjer och zoner      (UNDER typens egen linje)
 *   zonkant, linjetyper
 *   basvagsnummer
 *   statusring for symboler
 *   symbolerna
 */
export function kontrollLager(): any[] {
  return [
    ...zonFyllLager(KONTROLL_KALLA, 'ek-p', null),
    {
      id: VALD_LINJE_ID, type: 'line', source: KONTROLL_KALLA,
      filter: valdLinjeFilter(''),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#fff', 'line-width': zoomKurva(LINJE_KANT_BREDD, 1, 14), 'line-opacity': 0.9 },
    },
    ...statusLinjeLager(KONTROLL_KALLA, 'ek-p'),
    ...zonKantLager(KONTROLL_KALLA, 'ek-p', null),
    ...linjeLager(KONTROLL_KALLA, 'ek-p', null),
    nummerLager(NUMMER_KALLA, 'ek-p'),
    ...statusRingLager(KONTROLL_KALLA, 'ek-p'),
    {
      id: VALD_SYMBOL_ID, type: 'circle', source: KONTROLL_KALLA,
      filter: valdSymbolFilter(''),
      paint: {
        // Utanfor den tjockaste statusringen (ikonradie + 6), sa gloria syns runt allt.
        'circle-radius': zoomKurva(IKON_STORLEK.map(([z, st]) => [z, ikonRadie(st) + 10] as const)),
        'circle-color': '#fff', 'circle-opacity': 0.9,
        'circle-pitch-alignment': 'viewport',
      },
    },
    symbolLager(KONTROLL_KALLA, 'ek-p', null),
  ];
}

/**
 * Lager som slacks och tands med "Kontrollpunkter" i lagermenyn. Som GRUPP:
 * en punkt far aldrig kunna vara tand i ett lager och slackt i ett annat.
 */
export function kontrollLagerIdn(): string[] {
  return kontrollLager().map((l) => l.id as string);
}

// ---------------------------------------------------------------------------
// Provytorna
// ---------------------------------------------------------------------------

export const PROVYTA_KALLA = 'ek-provytor';
/** Lagrens id:n ar kontrakt mot tryckhanteraren i RundKarta och lagermenyn - byt dem aldrig utan att soka efter dem. */
export const PROVYTA_MATT_ID = 'ek-provyta-matt';
export const PROVYTA_OMATT_ID = 'ek-provyta-omatt';

/** Tands och slacks som en grupp med "Provytor" i lagermenyn. */
export function provytaLagerIdn(): string[] {
  return [PROVYTA_MATT_ID, PROVYTA_OMATT_ID];
}

type YtaPlats = {
  nummer: number;
  lat: number | null;
  lng: number | null;
  matt: string | null;
  overhoppad: boolean;
};

/**
 * Provytorna som features. Status ligger som EGENSKAP och styr bade ikon och lager.
 * Ytor utan plats ritas inte - de gissas aldrig in.
 *
 * Egenskapen heter status och inte matt: matt ar tidsstampeln for "avklarad" och
 * sattes ocksa nar en yta hoppades over. Se provytaStatus.
 */
export function provytaFeatures(ytor: YtaPlats[]): Feature[] {
  return ytor
    .filter((y) => y.lat != null && y.lng != null)
    .map((y) => ({
      type: 'Feature' as const,
      properties: { nummer: y.nummer, status: provytaStatus(y) },
      geometry: { type: 'Point', coordinates: [y.lng as number, y.lat as number] },
    }));
}

/**
 * Provytornas lager: symboler, en ikon per tillstand (lib/provytaIkon.ts).
 *
 * TVA LAGER MED OFORANDRADE ID:N. Matt ar ett eget lager, och omatt + overhoppad
 * delar det andra (ikonen vaxlar pa status). Tryckhanteraren i RundKarta fragar
 * bada lagren efter id - med samma id:n fortsatter en overhoppad yta att ga att
 * trycka pa. icon-allow-overlap ar kravet for att en yta alltid ritas och alltid
 * traffas, aven bredvid en kontrollpunkt.
 */
export function provytaLager(): any[] {
  const gemensamt = {
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  };
  const MATT: ProvytaStatus = 'matt';
  const OVERHOPPAD: ProvytaStatus = 'overhoppad';
  const OMATT: ProvytaStatus = 'omatt';
  return [
    {
      id: PROVYTA_MATT_ID, type: 'symbol', source: PROVYTA_KALLA,
      filter: ['==', ['get', 'status'], MATT],
      layout: { ...gemensamt, 'icon-image': provytaBildNamn(MATT) },
    },
    {
      id: PROVYTA_OMATT_ID, type: 'symbol', source: PROVYTA_KALLA,
      filter: ['!=', ['get', 'status'], MATT],
      layout: {
        ...gemensamt,
        'icon-image': [
          'match', ['get', 'status'],
          OVERHOPPAD, provytaBildNamn(OVERHOPPAD),
          provytaBildNamn(OMATT),
        ],
      },
    },
  ];
}
