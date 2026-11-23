// Lugnare körvy — texten på kartan visas bara NÄRA maskinen (Martin 2026-11-23, Brokamåla 1:5: runt 100 saker, Stefan i Giant tycker att texten gör kartan rörig).
//
// Etiketter som "Hänsyn 3", områdesnummer och avläggsnummer visas bara inom TEXT_RADIE_M (100 m) från maskinen. Längre bort syns form och färg, inte text.
// Faror, kultur och Viktigt-etiketter syns ALLTID (de är aldrig med i listan nedan eller har ett undantag):
//   • faror: markers-korvy-label (namnet under symbolen) — filtrerar inte på avstånd längre
//   • kultur: Vidas fornlämningsyta (trakt-raa-label) och egna kulturytor (zone-label, bara zoneType i KULTUR_ZONTYPER) — alltid
//   • Viktigt: viktigt-etikett — inte med här
// Bara etiketter. Symbolerna, linjer, ytor, traktgräns och bakgrund rörs inte. Körvyn bara (page.tsx kopplar in det när körvyn är igång; planeringsvyn orörd).
//
// Mekanik: lagrens ursprungliga filter (som kan vara ett fokus-filter) lindas in i ['all', original, ['any', undantag, ['within', cirkel]]] — cirkeln är 100 m
// runt maskinen. `within` kräver punktfeatures: alla lagren nedan läser punktkällor (en etikettpunkt per yta), polygonerna filtreras bort av originalet först.
import { cirkelPolygon } from './telefonGps';
import { YTA } from './larm/grupper';

export const TEXT_RADIE_M = 100;

/** Etikettlager som bara visar sin text nära maskinen. `undantag` = features som alltid visas (kultur). */
export const NARA_TEXTLAGER: ReadonlyArray<{ id: string; undantag?: any[] }> = [
  { id: 'zone-label', undantag: ['in', ['get', 'zoneType'], ['literal', Object.keys(YTA).filter((t) => YTA[t].grupp === 'kultur')]] },   // egna ytors namn: kultur alltid
  { id: 'trakt-hansyn-label' },    // Vidas "Hänsyn 3"
  { id: 'trakt-ovrigt-label' },    // Vidas "Övrigt 4"
  { id: 'trakt-nb-label' },        // nyckelbiotop
  { id: 'trakt-punkt-label' },     // avläggets nummer
  { id: 'yta-nr-label' },          // områdets nummer (1, 2, 3 …)
];
// trakt-raa-label (Vidas fornlämningsyta, kultur) och markers-korvy-label (faror) är MEDVETET inte med: de syns alltid.

/** Etikettlagrens ID — för tester och källvakter. */
export const NARA_TEXTLAGER_ID: readonly string[] = NARA_TEXTLAGER.map((l) => l.id);
/** Lager med text som aldrig begränsas (faror, kultur, Viktigt) — källvakten kräver att de inte står i NARA_TEXTLAGER. */
export const ALLTID_TEXTLAGER: readonly string[] = ['markers-korvy-label', 'trakt-raa-label', 'viktigt-etikett'];

/** Filtret för ett lager: originalet OCH (undantaget ELLER inom cirkeln). */
export function naraFilter(original: any[] | null | undefined, cirkel: any, undantag?: any[]): any[] {
  const inom: any[] = ['within', cirkel];
  const nara: any[] = undantag ? ['any', undantag, inom] : inom;
  return original ? ['all', original, nara] : nara;
}

/** Positionen avrundad till ett rutnät om ~10 m — textens cirkel flyttas först när maskinen rört sig så mycket (ingen filteromräkning varje GPS-tick). */
export function textCirkelNyckel(pos: { lat: number; lon: number } | null | undefined): string | null {
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return null;
  return `${Math.round(pos.lat * 1e4)}|${Math.round(pos.lon * 1e4)}`;
}

type Karta = {
  getLayer(id: string): unknown;
  getFilter(id: string): any;
  setFilter(id: string, filter: any): unknown;
};

// Ursprungsfiltren per karta (sparas första gången ett lager får cirkelfilter och används för att sätta tillbaka dem).
const ORIGINAL = new WeakMap<object, Map<string, any[] | null>>();

/** Sätt cirkelfiltret på etikettlagren — runt `pos`; utan position visas allt (ingen GPS = ingen gömd text). */
export function tillampaTextRadie(karta: Karta, pos: { lat: number; lon: number } | null | undefined, radieM = TEXT_RADIE_M): void {
  let orig = ORIGINAL.get(karta);
  if (!orig) { orig = new Map(); ORIGINAL.set(karta, orig); }
  const cirkel = pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon) ? cirkelPolygon(pos.lat, pos.lon, radieM) : null;
  for (const l of NARA_TEXTLAGER) {
    if (!karta.getLayer(l.id)) continue;
    if (!orig.has(l.id)) orig.set(l.id, karta.getFilter(l.id) ?? null);
    try { karta.setFilter(l.id, cirkel ? naraFilter(orig.get(l.id), cirkel, l.undantag) : (orig.get(l.id) ?? null)); } catch { /* lagret finns inte än */ }
  }
}

/** Sätt tillbaka lagrens ursprungliga filter (körvyn stängs) och glöm dem. */
export function aterstallTextRadie(karta: Karta): void {
  tillampaTextRadie(karta, null);
  ORIGINAL.delete(karta);
}
