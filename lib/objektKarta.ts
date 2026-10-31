// Objekten som prickar på kartan medan objektlistan är öppen (planeringsvyn, telefon och dator). Rena funktioner, ingen karta, ingen DB:
// vad som ritas, var kameran ska stå, vad ett tryck träffar. Sidan (app/planering/page.tsx) äger MapLibre; listan (ObjektLista) äger datat.
//
//   Prickar:  grön = Pågår (även "Skotning kvar"), grå = Planerade, ihålig grå ring = Oplanerade (saknad/okänd status). Objektet man står på (Här)
//             får en blå ring. Avslutade ritas BARA när Avslutade-vyn är öppen (det listan visar: vald typ, eller allt vid sökning).
//             Allt som syns i listan har en prick — utom objekt utan koordinat, som bara finns i listan.
//   Namn:     bredvid pricken, men bara där de inte krockar (MapLibres egen kollisionshantering; Här först, sedan Pågår, sedan Planerade).
//   Kamera:   zoomar ut så att alla prickar ryms i DEN SYNLIGA delen av kartan — arket (telefon, nedre halvan) och panelen (bred skärm,
//             höger) täcker resten, så de räknas bort som padding.

import type { Kartlager } from '@/lib/kartlager';
import { kartBasPaint } from './kartBas';
import { grundKallor, grundLager } from './ritadKarta/lager';
import { harKoordinat } from './navigera';
import { PANEL_BREDD_PX, plusLage, type PlusLage } from './plusArk';
import { AVSTAND, FARG } from './design/tokens';
import { effektivGrupp, type ListObjekt, type ObjektGrupper } from './objektVal';

/** gron = Pågår, gra = Planerade (och avslutade i Avslutade-vyn), ihalig = Oplanerade (saknad/okänd status): en ihålig grå ring */
export type PrickFarg = 'gron' | 'gra' | 'ihalig';

export interface KartPrick {
  id: string;
  namn: string;
  lat: number;
  lng: number;
  farg: PrickFarg;
  /** GPS:en står innanför objektets traktgräns → blå ring */
  har: boolean;
  /** namnens kollisionsordning: lägre = vinner platsen (Här, sedan Pågår, sedan Planerade) */
  prio: number;
}

/** Vad listan skickar upp till sidan. `nyckel` byter när MÄNGDEN prickar byter (Avslutade öppnas/typ byts) → kameran passas om. */
export interface KartPrickar {
  prickar: KartPrick[];
  nyckel: string;
  /** Tryck på en prick = samma som att trycka på raden i listan: objektet öppnas och listan stängs */
  valj: (id: string) => void;
}

/** Ark på telefon: så stor del av höjden det täcker (nedre halvan). Samma som plus-arkets halva läge. */
export const ARK_HOJD_ANDEL = 0.5;
export const ARK_HOJD_PROCENT = `${ARK_HOJD_ANDEL * 100}%`;

/** Prickarnas lager/källa på kartan. */
export const PRICK_KALLA = 'objlista-source';
export const PRICK_LAGER = { ring: 'objlista-ring', prick: 'objlista-prick', namn: 'objlista-namn' } as const;
export const PRICK_LAGER_ID: readonly string[] = [PRICK_LAGER.ring, PRICK_LAGER.prick, PRICK_LAGER.namn];

/** Tryckradie (px) runt fingret när en prick söks — en prick är ~14 px, ett finger träffar inte exakt. */
export const PRICK_TRYCK_RADIE_PX = 24;

const FARG_PRICK: Record<PrickFarg, string> = { gron: FARG.gron, gra: FARG.text3, ihalig: FARG.text3 };

const prickFarg = (g: ReturnType<typeof effektivGrupp>): PrickFarg => (g === 'pagar' ? 'gron' : g === 'oplanerade' ? 'ihalig' : 'gra');

/** Prick-listan ur listans grupper. `avslutadeVald` = bara i Avslutade-vyn: de avslutade objekten listan visar (vald typ, eller alla typer vid sökning). */
export function byggPrickar<T extends ListObjekt>(
  grupper: Pick<ObjektGrupper<T>, 'har' | 'pagar' | 'planerade' | 'oplanerade'>,
  avslutadeVald: readonly T[],
  skotningKvar: ReadonlySet<string> | null | undefined,
  visaAvslutade: boolean,
): KartPrick[] {
  const ut: KartPrick[] = [];
  const lagg = (o: T, har: boolean, prio: number) => {
    if (!harKoordinat(o)) return;   // ingen koordinat = bara listan
    ut.push({ id: o.id, namn: (o.namn ?? '').trim() || 'Namnlöst objekt', lat: o.lat, lng: o.lng,
      farg: prickFarg(effektivGrupp(o, skotningKvar)), har, prio });
  };
  if (visaAvslutade) {
    // Avslutade-vyn visar bara de avslutade av vald typ — grå (de är inte aktiva), aldrig Här-ring (Här gäller aktiva).
    for (const o of avslutadeVald) {
      if (!harKoordinat(o)) continue;
      ut.push({ id: o.id, namn: (o.namn ?? '').trim() || 'Namnlöst objekt', lat: o.lat, lng: o.lng, farg: 'gra', har: false, prio: 4 });
    }
    return ut;
  }
  for (const o of grupper.har) lagg(o, true, 0);
  for (const o of grupper.pagar) lagg(o, false, 1);
  for (const o of grupper.planerade) lagg(o, false, 2);
  for (const o of grupper.oplanerade) lagg(o, false, 3);
  return ut;
}

/** GeoJSON till källan. Tom lista = tom FeatureCollection (kartan visar inga prickar). */
export function prickarGeoJson(prickar: readonly KartPrick[]) {
  return {
    type: 'FeatureCollection' as const,
    features: prickar.map((p) => ({
      type: 'Feature' as const,
      properties: { id: p.id, namn: p.namn, farg: FARG_PRICK[p.farg], ihalig: p.farg === 'ihalig' ? 1 : 0, har: p.har ? 1 : 0, prio: p.prio },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

/** Sydväst–nordost runt alla prickar, eller null om det inte finns några. */
export function prickGrans(prickar: readonly KartPrick[]): [[number, number], [number, number]] | null {
  if (prickar.length === 0) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of prickar) {
    if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

export interface KartPadding { top: number; bottom: number; left: number; right: number }

/** Luft kring prickarna i den synliga delen. */
const LUFT_PX = 40;
/** Toppen: namnpillen och knapparna ligger överst på kartan. */
const TOPP_PX = 96;

/**
 * Padding för fitBounds så att alla prickar hamnar i den SYNLIGA delen av kartan: arket (telefon) täcker nedre halvan, panelen (bred skärm)
 * täcker höger sida inklusive sin marginal. `lage` avgörs av fönstrets bredd (lib/plusArk.plusLage), samma regel som listan själv.
 */
export function kartPadding(fonster: { bredd: number; hojd: number }, lage: PlusLage = plusLage(fonster.bredd)): KartPadding {
  if (lage === 'panel') {
    return { top: TOPP_PX, bottom: LUFT_PX, left: LUFT_PX, right: PANEL_BREDD_PX + 2 * AVSTAND.s + LUFT_PX };
  }
  return { top: TOPP_PX, bottom: Math.round(fonster.hojd * ARK_HOJD_ANDEL) + LUFT_PX, left: LUFT_PX, right: LUFT_PX };
}

/** Närmaste prick till tryckpunkten (px) bland de träffade; null om ingen. Lika avstånd: lägst prio (Här före Pågår före Planerade). */
export function narmastePrick(
  traffar: readonly { id: string; x: number; y: number; prio?: number }[],
  tryck: { x: number; y: number },
): string | null {
  let basta: { id: string; d: number; prio: number } | null = null;
  for (const t of traffar) {
    const d = Math.hypot(t.x - tryck.x, t.y - tryck.y);
    const prio = t.prio ?? 9;
    if (!basta || d < basta.d || (d === basta.d && prio < basta.prio)) basta = { id: t.id, d, prio };
  }
  return basta ? basta.id : null;
}

/** Ett tryck som flyttat sig mer än så här är en panorering, inte ett tryck (MapLibres egen tolerans är ~3 px; ett finger darrar mer). */
export const TRYCK_TOLERANS_PX = 10;
export const arTryck = (ner: { x: number; y: number } | null, upp: { x: number; y: number }): boolean =>
  !ner || Math.hypot(upp.x - ner.x, upp.y - ner.y) <= TRYCK_TOLERANS_PX;

// ── MapLibre-lagren (stilen). Färger ur designtokens; ringen blå, pricken vit kant så den syns på både ljus och mörk karta. ──
export const PRICK_LAGER_SPEC = {
  ring: {
    id: PRICK_LAGER.ring, type: 'circle' as const, source: PRICK_KALLA, filter: ['==', ['get', 'har'], 1] as any,
    paint: { 'circle-radius': 13, 'circle-color': FARG.bla, 'circle-opacity': 0, 'circle-stroke-color': FARG.bla, 'circle-stroke-width': 3, 'circle-stroke-opacity': 1 },
  },
  prick: {
    id: PRICK_LAGER.prick, type: 'circle' as const, source: PRICK_KALLA,
    // Ihålig (Oplanerade): ingen fyllning, grå kant, lite tjockare så den syns som en ring. Träffytan för tryck är fortfarande hela pricken.
    paint: {
      'circle-radius': 7, 'circle-color': ['get', 'farg'] as any,
      'circle-opacity': ['case', ['==', ['get', 'ihalig'], 1], 0, 1] as any,
      'circle-stroke-color': ['case', ['==', ['get', 'ihalig'], 1], ['get', 'farg'], FARG.text] as any,
      'circle-stroke-width': ['case', ['==', ['get', 'ihalig'], 1], 3, 2] as any,
      'circle-stroke-opacity': 1,
    },
  },
  namn: {
    id: PRICK_LAGER.namn, type: 'symbol' as const, source: PRICK_KALLA,
    layout: {
      'text-field': ['get', 'namn'] as any,
      'text-size': 13,
      'text-font': ['Open Sans Regular'],
      'text-variable-anchor': ['right', 'left'] as any,   // namnet står bredvid pricken (höger, annars vänster) — aldrig runt om, så det är tydligt vems det är
      'text-radial-offset': 1.2,
      'text-justify': 'auto' as const,
      'text-max-width': 12,
      'text-allow-overlap': false,        // krockar namnen försvinner namnet — pricken (eget lager) ligger kvar
      'text-ignore-placement': false,
      'text-optional': true,
      'symbol-sort-key': ['get', 'prio'] as any,   // lägre först: Här, Pågår, Planerade vinner platsen
    },
    paint: { 'text-color': FARG.bg, 'text-halo-color': FARG.text, 'text-halo-width': 1.6 },
  },
};

/** Lägger till källan och lagren om de saknas (idempotent). Lagren hamnar överst. Returnerar källan, eller null om kartan inte tar emot lager ännu. */
export function sakerstallPrickLager(map: any): { setData: (d: unknown) => void } | null {
  try {
    if (!map.getSource(PRICK_KALLA)) map.addSource(PRICK_KALLA, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    for (const spec of [PRICK_LAGER_SPEC.ring, PRICK_LAGER_SPEC.prick, PRICK_LAGER_SPEC.namn]) {
      if (!map.getLayer(spec.id)) map.addLayer(spec);
    }
    return map.getSource(PRICK_KALLA) ?? null;
  } catch {
    return null;   // stilen laddas om / kartan är borta: nästa ändring försöker igen
  }
}

// ── Kartan när inget objekt är valt (första gången, objektet borttaget): baskartan + prickarna, aldrig en svart yta ──
// Samma Lantmäteriet-bas och samma nedtoning som planeringsvyns karta (page.tsx mapStyleConfig: källan 'lantmateriet' + lagret 'lm-layer').
export const TOM_KARTA_START = { center: [14.70, 56.40] as [number, number], zoom: 8 };   // verksamhetens mitt (som listans reserv för avstånd)
/** Baskartan för kartan utan valt objekt: samma källor och nedtoning som planeringsvyns mapStyleConfig, för det kartlager användaren valt (lib/kartlager). */
export function tomKartaStil(lager: Kartlager, styrka?: number) {
  // Ritad utan objekt: den ritade kartans grund (bakgrund, terrängskuggning, vatten, vägar, hus). Skogen ritas först när ett objekt är öppet.
  if (lager === 'ritad') return { version: 8 as const, sources: grundKallor() as any, layers: grundLager() as any[] };
  const kallor = {
    lantmateriet: { type: 'raster' as const, tiles: ['/api/forarkarta?z={z}&x={x}&y={y}'], tileSize: 256, maxzoom: 17, attribution: '&copy; Lantmäteriet' },
    satellite: { type: 'raster' as const, tiles: ['/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'], tileSize: 256, maxzoom: 18, attribution: '&copy; Lantmäteriet' },
    topographic: { type: 'raster' as const, tiles: ['/api/forarkarta?layer=farg&z={z}&x={x}&y={y}'], tileSize: 256, maxzoom: 17, attribution: '&copy; Lantmäteriet' },
    osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '&copy; OpenStreetMap' },
  };
  const bas =
    lager === 'satellite' ? { id: 'satellite-layer', type: 'raster' as const, source: 'satellite', paint: kartBasPaint('satellite', styrka) }
    : lager === 'terrain' ? { id: 'terrain-layer', type: 'raster' as const, source: 'topographic', paint: kartBasPaint('terrain', styrka) }
    : lager === 'osm' ? { id: 'osm-layer', type: 'raster' as const, source: 'osm', paint: kartBasPaint('osm', styrka) }
    : { id: 'lm-layer', type: 'raster' as const, source: 'lantmateriet', paint: kartBasPaint('lantmateriet', styrka) };
  return {
    version: 8 as const,
    sources: { [bas.source]: kallor[bas.source as keyof typeof kallor] },
    layers: [
      { id: 'bg', type: 'background' as const, paint: { 'background-color': 'rgb(232, 232, 232)' } },
      bas,
    ],
  };
}
/** Karta (Lantmäteriet, dämpad) — den gamla fasta baskartan; kvar för tester och som fallback. */
export const TOM_KARTA_STIL = tomKartaStil('lantmateriet') as unknown as {
  version: 8; sources: { lantmateriet: { type: 'raster'; tiles: string[]; tileSize: number; maxzoom: number; attribution: string } };
  layers: Array<{ id: string; type: 'background' | 'raster'; paint: Record<string, any>; source?: string }>;
};
