// KARTANS LAGERORDNING — EN regel för planeringen, körvyn, skotarläget och maskinläget (samma karta, samma ordning).
//
// Nerifrån och upp (Martin 2026-10-26):
//   bakgrund → ytor → hyttspår → traktgräns/rågång → basvägar/stickvägar → linjer (stenmur, dike, ledning) → symboler (röd fara överst) → etiketter → egen position
//
// Regeln bakom: det man INTE får köra på eller fälla mot ligger alltid över det man kör på. Förut avgjorde ordningen i vilken ordning koden råkade lägga lagren — stenmuren
// hamnade under maskinernas spår (spåren läggs till när körvyn öppnas, långt efter linjerna). Nu avgör en tabell, och ordningen läggs om varje gång ett lager tillkommer.
//
// Hur: varje lagers id (och typ) ger en rang; lagren sorteras STABILT på rang (inom samma rang gäller den ordning de lades till) och flyttas med moveLayer bara när de
// ligger fel. `installeraLagerOrdning` lyssnar på styledata, så ett lager som läggs till senare hamnar rätt direkt. Ett lager utan egen regel får sin rang av typen
// (raster → bakgrund, fill → ytor, line → linjer, symbol med text → etiketter, annars symboler) — det hamnar alltså aldrig "överst av en slump".
//
// Ren logik (rang, sortering) + en tunn koppling till kartan. Vakt: lib/lagerOrdning.test.ts läser sidan och larmar om ett lager saknar regel.

export const RANG = {
  bakgrund: 0,
  ytor: 1,
  hyttspar: 2,
  traktgrans: 3,
  vagar: 4,
  linjer: 5,
  symboler: 6,
  etiketter: 7,
  position: 8,
} as const;

/** Finare steg inom en rang (decimaler): vem som ligger över vem inom samma ordning. Alla ligger inom [rang, rang + 1). */
const D = 0.01;

export interface LagerInfo {
  id: string;
  /** MapLibres lagertyp: 'raster' | 'fill' | 'line' | 'circle' | 'symbol' | 'background' | 'hillshade' … */
  type?: string | null;
  /** Symbollager: har det en textrad (text-field) och ingen ikon → etikett. */
  harText?: boolean;
  harIkon?: boolean;
}

type Regel = [test: RegExp, rang: number];

// Första träffen gäller. Specifikt före allmänt.
const REGLER: Regel[] = [
  // ── Egen position överst: maskinens prick, GPS-ring och osäkerhetscirkel ────────────────────────────────────────────────
  [/^(maskin-|gps-)/, RANG.position],

  // ── Framhävningens glöd, kontur och fält (Om trakten): ligger UNDER markeringarna den framhäver, så den aldrig döljer linjen — ringen, symbolen och etiketten ligger överst ──
  [/^omtrakten-framhav-(fyll|halo|glod|linje)$/, RANG.vagar - 30 * D],

  // ── Verktyg och markeringar som ritas ovanpå medan de pågår (rita, mäta, framhäva, redigera) ──────────────────────────
  // De är tillfälliga och ska aldrig döljas av det de handlar om; positionen ligger ändå över dem.
  [/^(drawing-|measure-|skotning-|figur-etikett|omtrakten-|line-linjered-|hornedit-(mid|vertex|nr)|checklist-|avlagg-granska-)/, RANG.etiketter + 40 * D],

  // ── Larm: ringar och pin ligger över symbolerna men under etiketterna ──────────────────────────────────────────────────
  [/^larm-pin$/, RANG.symboler + 90 * D],
  [/^larm-/, RANG.symboler + 80 * D],

  // ── Etiketter: text som hör till kartan ────────────────────────────────────────────────────────────────────────────────
  [/-label$|^markers-korvy-label$|^yta-nr-label$|^line-kor-(siffra|kvar)$|^line-korupp-ord$/, RANG.etiketter],

  // ── Symboler ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  // Röd fara överst bland symbolerna: markers-layer sorterar sina egna symboler (symbol-sort-key, se symbolSortKey); larm-pin ovan.
  [/^(markers-|arrows-|eternitytree)/, RANG.symboler + 10 * D],
  [/^(trakt-punkt-circle|trakt-raa-point|skotar-avlagg-|yta-nr-hit|skotar-hogar-|hogar-|grot-)/, RANG.symboler],
  [/^line-fall-trad$/, RANG.symboler + 5 * D],

  // ── Linjer: stenmur, dike, el-ledning, naturvård, stig — och Vidas ledning ────────────────────────────────────────────
  // (Backväg-strecken och körordningen hör till vägen de ligger på: se Vägar.)
  [/^(line-(stonewall|ditch|powerline|nature|trail)(-|$)|trail-footprints$|trakt-kraftledning-|trakt-raa-line$|trakt-linje-hit$|line-hitbox$)/, RANG.linjer],

  // ── Vägar: basvägar och stickvägar. Nu-vägen (körordningen) ligger överst bland dem: skenet UNDER, pilarna och siffran över ──
  [/^(lines-korvy-emphasis|lines-korvy-mainroad-glow)$/, RANG.vagar - 20 * D],
  [/^line-kor-sken$/, RANG.vagar - 10 * D],
  [/^(line-sideRoad(Red|Yellow|Blue)-|line-mainRoad-|line-mainroad-risa|trakt-basvag-line)/, RANG.vagar],
  [/^(line-backvag|line-tvatryck-|line-korupp-(kant|traff|linje|spets))/, RANG.vagar + 30 * D],
  [/^line-kor-pil$/, RANG.vagar + 40 * D],
  [/^tma-/, RANG.vagar + 50 * D],

  // ── Traktgräns och rågång ──────────────────────────────────────────────────────────────────────────────────────────────
  [/^(line-boundary-|trakt-gr-|grans-|hornedit-)/, RANG.traktgrans],

  // ── Hyttspår: skördarens under skotarens (skotarens spår är fokus), inom varje: tidigare dagar < den andres < eget ──────
  [/^hyttspar-hist-/, RANG.hyttspar],
  [/^hyttspar-andras-/, RANG.hyttspar + 5 * D],
  [/^planspar-skordare-/, RANG.hyttspar + 5 * D],
  [/^hyttspar-egen-/, RANG.hyttspar + 10 * D],
  [/^planspar-skotare-/, RANG.hyttspar + 10 * D],

  // ── Nedtoningen utanför trakten: precis över bakgrunden (och WMS-underlagen), under ALLT annat — trakten och dess 50 m kant är orörda ───────────────────────────────
  [/^trakt-utanfor-ton$/, RANG.bakgrund + 50 * D],

  // ── Ytor: zoner, hänsyn, nyckelbiotop, kultur, klart-grått, tillfälliga ytor ───────────────────────────────────────────
  [/^(zone-|zones-korvy-|klart-|trakt-(hansyn|ovrigt|nb|raa)-)/, RANG.ytor],

  // ── Bakgrund: baskartor, sedan den ritade kartan (lib/ritadKarta/lager), sedan hillshade, WMS-underlag och Vidas kartbild ovanpå ──────
  // Den ritade kartan läggs till först när någon väljer Ritad (långt efter WMS-lagren); utan egna steg hamnade dess täckande bakgrund OVANPÅ markfuktighet,
  // naturvärden och andra underlag. Underlagen ligger därför ett steg över den.
  [/^(bg$|bg-korvy$|osm-layer$|satellite-layer$|lm-layer$|terrain-layer$)/, RANG.bakgrund],
  [/^ritad-bakgrund$/, RANG.bakgrund + 1 * D],
  [/^ritad-skog$/, RANG.bakgrund + 2 * D],
  [/^ritad-relief$/, RANG.bakgrund + 3 * D],
  [/^ritad-(vatten|vattendrag)$/, RANG.bakgrund + 4 * D],
  [/^ritad-hus$/, RANG.bakgrund + 5 * D],
  [/^ritad-vag(-kant)?$/, RANG.bakgrund + 6 * D],
  [/^ritad-kronor$/, RANG.bakgrund + 8 * D],
  [/^ritad-trad$/, RANG.bakgrund + 9 * D],
  [/^(hillshade|lm-skuggning-layer$|sks-markfuktighet-layer$|vida-layer$|wms-layer-)/, RANG.bakgrund + 30 * D],
];

/** Rangen för ett lager. Lägre ligger under. */
export function lagerRang(l: LagerInfo): number {
  for (const [test, rang] of REGLER) if (test.test(l.id)) return rang;
  switch (l.type) {
    case 'background': case 'raster': case 'hillshade': case 'color-relief': return RANG.bakgrund;
    case 'fill': case 'fill-extrusion': case 'heatmap': return RANG.ytor;
    case 'line': return RANG.linjer;
    case 'symbol': return l.harText && !l.harIkon ? RANG.etiketter : RANG.symboler;
    case 'circle': return RANG.symboler;
    default: return RANG.symboler;
  }
}

/** Har lagret en regel i tabellen (inte bara typens reserv)? Används av vakten som larmar när ett nytt lager saknar regel. */
export const harEgenRegel = (id: string): boolean => REGLER.some(([t]) => t.test(id));

/** Önskad ordning: stabil sortering på rang (inom samma rang gäller nuvarande ordning). */
export function onskadOrdning(lager: readonly LagerInfo[]): string[] {
  return lager
    .map((l, i) => ({ id: l.id, i, r: lagerRang(l) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

/** De flyttar (id → lagret det ska ligga precis under, undefined = överst) som behövs för att nuvarande ordning ska bli den önskade. Tom lista = redan rätt. */
export function flyttarFor(nuvarande: readonly string[], onskad: readonly string[]): Array<{ id: string; fore: string | undefined }> {
  const nu = [...nuvarande];
  const ut: Array<{ id: string; fore: string | undefined }> = [];
  for (let i = onskad.length - 1; i >= 0; i--) {
    if (nu[i] === onskad[i]) continue;
    const j = nu.indexOf(onskad[i]);
    if (j < 0) continue;
    const fore = i + 1 < onskad.length ? onskad[i + 1] : undefined;
    ut.push({ id: onskad[i], fore });
    nu.splice(j, 1);
    nu.splice(i, 0, onskad[i]);
  }
  return ut;
}

// ── Kopplingen till kartan ────────────────────────────────────────────────────────────────────────────────────────────────

/** Det vi behöver av en MapLibre-karta. */
export interface LagerKarta {
  getLayersOrder(): string[];
  getLayer(id: string): any;
  moveLayer(id: string, before?: string): void;
  getLayoutProperty?(id: string, prop: string): any;
  on(typ: string, fn: () => void): unknown;
  off?(typ: string, fn: () => void): unknown;
}

const infoCache = new WeakMap<object, Map<string, LagerInfo>>();

function info(map: LagerKarta, id: string): LagerInfo {
  let c = infoCache.get(map);
  if (!c) { c = new Map(); infoCache.set(map, c); }
  const k = c.get(id);
  if (k) return k;
  let type: string | undefined; let harText = false; let harIkon = false;
  try {
    const l = map.getLayer(id);
    type = l?.type;
    if (type === 'symbol' && map.getLayoutProperty) {
      harText = !!map.getLayoutProperty(id, 'text-field');
      harIkon = !!map.getLayoutProperty(id, 'icon-image');
    }
  } catch { /* lagret försvann under tiden */ }
  const ny = { id, type, harText, harIkon };
  c.set(id, ny);
  return ny;
}

/** Lägger om lagren till den önskade ordningen. Ger antalet flyttar. Kastar aldrig. */
export function ordnaLager(map: LagerKarta): number {
  try {
    const nu = map.getLayersOrder();
    if (nu.length < 2) return 0;
    const onskad = onskadOrdning(nu.map((id) => info(map, id)));
    const flyttar = flyttarFor(nu, onskad);
    for (const f of flyttar) { try { map.moveLayer(f.id, f.fore); } catch { /* lagret borta */ } }
    return flyttar.length;
  } catch { return 0; }
}

/**
 * Håller ordningen: lägger om en gång nu och varje gång stilen ändras (lager läggs till eller tas bort). Samlar ihop flera ändringar till en omläggning per bildruta;
 * en omläggning som inte behöver flytta något ändrar ingenting och ger därmed ingen ny händelse. Anropa en gång per karta.
 */
export function installeraLagerOrdning(map: LagerKarta & { __lagerOrdning?: boolean }): () => void {
  if (map.__lagerOrdning) return () => { /* redan installerad */ };
  map.__lagerOrdning = true;
  let vantar = false;
  let senasteOk = '';
  const kor = () => {
    vantar = false;
    let nyckel = '';
    try { nyckel = map.getLayersOrder().join('|'); } catch { return; }
    if (nyckel === senasteOk) return;   // samma lager i samma ordning som förra gången vi fann den rätt: inget att göra
    ordnaLager(map);
    try { senasteOk = map.getLayersOrder().join('|'); } catch { /* */ }
  };
  const planera = () => {
    if (vantar) return;
    vantar = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(kor); else setTimeout(kor, 0);
  };
  map.on('styledata', planera);
  planera();
  return () => { map.off?.('styledata', planera); map.__lagerOrdning = false; };
}

// ── Sortering inom ett lager ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * symbol-sort-key för markers-layer: röda faror (SYMBOL_GRUPP = 'fara', lib/larm/grupper) ritas över alla andra symboler. Högre nyckel ligger överst, och lagret måste ha
 * symbol-z-order 'auto' för att nyckeln ska gälla. `faraTyper` är symbolernas id (egenskapen `type` på featuren).
 */
export function symbolSortKey(faraTyper: readonly string[]): any {
  return ['case', ['in', ['get', 'type'], ['literal', [...faraTyper]]], 2, 1];
}

/** line-sort-key för väglagren: nu-vägen (körordningen) överst, en körd väg underst. Gäller inom varje väglager. */
export const VAG_SORT_KEY: any = ['case', ['==', ['get', 'kor'], 'nu'], 2, ['==', ['get', 'kor'], 'klar'], 0, 1];
