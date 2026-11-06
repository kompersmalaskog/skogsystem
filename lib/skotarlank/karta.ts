// Skotarlänkens karta: källor, lager och tryckkort ur serverns data. Ren — ingen karta, ingen databas.
//
// SAMMA bilder och färger som planeringsvyn och objektöversiktens karta: planerarens markeringar ritas med lib/kartstil + lib/egenkontrollkarta
// (symboler, pilar, linjer med basvägarnas snitselfärger, stickvägar, backväg, ytor med snedstreck), Vidas lager med samma filter, färger och
// som planeringen (hänsyn, nyckelbiotop, fornlämning, basväg, kraftledning som ledning, avlägg med Vidas nummer — inga ytnamn), skördarens körspår
// som stråk (kartSpar, som skotarläget) och produktionshögarna som skotarlägets ljusa prickar.

import { backvagFeatureUrData, backvagLager, BACKVAG_KALLA, kontextFeature, sparFeatures, SPAR_KALLA, vidaGransFeatures, vidaGransLager, VIDA_GRANS_KALLA } from '@/lib/egenkontrollkarta';
import { kraftledningLager, linjeLager, pilLager, symbolLager, VIDA_BASVAG_FARG, zonFyllLager, zonKantLager, zonSnedstreckLager } from '@/lib/kartstil';
import { VAG_LINJETYPER } from '@/lib/backvag';
import { HANSYNSYTA_FILTER, OVRIGT_YTA_FILTER, OVRIGT_YTA_STIL, snedstreckId } from '@/lib/ytaStil';
import { FARG_KULTUR, FARG_NATUR, LINJE_GRUPP, SYMBOL_GRUPP, YTA } from '@/lib/larm/grupper';
import { linjeKort, SYMBOL_FORKLARING, vidaForklaring, vidaLinjeKort, ytaForklaring } from '@/lib/symboler';
import { markeringNamn } from '@/app/oversikt/markeringar';
import type { Origo } from '@/lib/kartkoordinater';
import { kartSpar } from '@/lib/sparStil';
import { arOvrigYta } from '@/lib/vidaYtaTyp';
import type { SkotarHog } from './hogar';

export type LngLat = [number, number];

export const KALLA = { mark: 'sk-mark', avlaggNr: 'sk-avlagg-nr', vida: 'sk-vida', hogar: 'sk-hogar' } as const;
const HEL = { opacitet: 1, breddFaktor: 1 };
const FONT = ['Open Sans Bold'];

/**
 * Lagervalen. KARTAN SKA VARA REN (Martin 2026-11-06): på från start bara det skotaren kör efter — traktgräns, skördarens spår, högarna,
 * vägar och avlägg, fara och ytor man inte får köra in i. Allt annat (naturvård, kultur, diken, blött, brant …) är av tills han tänder det.
 * Ingen text på kartan utom avläggens nummer.
 */
export type Lager = 'grans' | 'spar' | 'hogar' | 'vagar' | 'fara' | 'skydd' | 'ovrigt';
export const LAGER: readonly { id: Lager; namn: string }[] = [
  { id: 'hogar', namn: 'Produktionshögar' },
  { id: 'spar', namn: 'Skördarens körspår' },
  { id: 'vagar', namn: 'Vägar och avlägg' },
  { id: 'fara', namn: 'Fara' },
  { id: 'skydd', namn: 'Ytor du inte får köra in i' },
  { id: 'grans', namn: 'Traktgräns' },
  { id: 'ovrigt', namn: 'Övriga symboler och ytor' },
];
export const STANDARD_LAGER: Record<Lager, boolean> = { grans: true, spar: true, hogar: true, vagar: true, fara: true, skydd: true, ovrigt: false };

/** Vilket val en av planerarens markeringar hör till. */
export type Del = 'vag' | 'fara' | 'skydd' | 'ovrigt';
export function markeringDel(f: { properties: { kind?: unknown; typ?: unknown } }): Del {
  const kind = String(f.properties.kind ?? ''), typ = String(f.properties.typ ?? '');
  if (kind === 'linje') return VAG_LINJETYPER.includes(typ) ? 'vag' : LINJE_GRUPP[typ] === 'fara' ? 'fara' : 'ovrigt';
  if (kind === 'zon') return YTA[typ]?.forbjuden ? 'skydd' : 'ovrigt';
  if (kind === 'symbol') return typ === 'landing' ? 'vag' : SYMBOL_GRUPP[typ] === 'fara' ? 'fara' : 'ovrigt';
  return 'ovrigt';
}

export type Data = {
  origo: Origo | null;
  markeringar: Record<string, unknown>[];
  vida: { type: 'Feature'; geometry: any; properties: Record<string, unknown> }[];
  gran: LngLat[][];
  spar: LngLat[][];
  hogar: { hogar: SkotarHog[] } | null;
};

const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });

/** Källorna som kartan fyller. Varje markering bär sin plats i listan (`i`) så att ett tryck hittar den. */
export function kallor(d: Data) {
  const mark: any[] = [];
  const avlaggNr: any[] = [];
  const backvag: any[] = [];
  if (d.origo) {
    d.markeringar.forEach((m, i) => {
      const f = kontextFeature(m, d.origo!);
      if (!f) return;
      mark.push({ ...f, properties: { ...f.properties, i, del: markeringDel(f as never) } });
      const nr = m.nummer ?? m.avlaggNummer;
      if (m.type === 'landing' && nr != null && String(nr).trim() && f.geometry.type === 'Point') {
        avlaggNr.push({ type: 'Feature', properties: { nr: String(nr).trim() }, geometry: f.geometry });
      }
      const b = backvagFeatureUrData(m, d.origo!, undefined, false);
      if (b) backvag.push(b);
    });
  }
  const vida = d.vida.map((f, i) => ({ ...f, properties: { ...f.properties, vi: i } as Record<string, unknown> }));
  const hogar = (d.hogar?.hogar ?? []).map((h, i) => ({ type: 'Feature', properties: { hi: i, v: h.m3, farg: h.farg, a: h.a }, geometry: { type: 'Point', coordinates: [h.lng, h.lat] } }));
  return {
    [KALLA.mark]: fc(mark),
    [KALLA.avlaggNr]: fc(avlaggNr),
    [BACKVAG_KALLA]: fc(backvag),
    [KALLA.vida]: fc(vida),
    [VIDA_GRANS_KALLA]: fc(vidaGransFeatures(d.gran)),
    [SPAR_KALLA.skordare]: fc(sparFeatures(d.spar.map((l) => l.map(([lng, lat]) => ({ lat, lng }))))),
    [KALLA.hogar]: fc(hogar),
  };
}

const FLB = ['downcase', ['to-string', ['coalesce', ['get', 'FLBESKR'], '']]];
const VIDA_LINJE = ['==', ['get', '_typ'], 'linje'];
const VIDA_KRAFT = ['all', VIDA_LINJE, ['in', 'kraftled', FLB]];
const VIDA_BASVAG = ['all', VIDA_LINJE, ['!', ['in', 'kraftled', FLB]]];
const VIDA_AVLAGG = ['==', ['get', '_typ'], 'punkt'];
const NB = ['==', ['get', '_lager'], 'SV_SKS_NYCKELBIOTOP_101'];
const RAA_YTA = ['==', ['get', '_lager'], 'L_RAA_POLY_101'];
const del = (d: Del) => ['==', ['get', 'del'], d];

/** Egna ytor för ett val (skydd eller övrigt). */
const egnaYtor = (d: Del, prefix: string) => [
  ...zonFyllLager(KALLA.mark, prefix, del(d)), ...zonSnedstreckLager(KALLA.mark, prefix, del(d)), ...zonKantLager(KALLA.mark, prefix, del(d)),
];

/** Lagren per val. Ritordningen bestäms av lagerOrdning (ytor underst, symboler och nummer överst). */
export function lagerSpec() {
  const M = KALLA.mark;
  const skydd = [
    ...egnaYtor('skydd', 'sk-s'),
    { id: 'sk-vida-hansyn-fyll', type: 'fill', source: KALLA.vida, filter: HANSYNSYTA_FILTER, paint: { 'fill-color': FARG_NATUR, 'fill-opacity': 0.18 } },
    { id: 'sk-vida-hansyn-snedstreck', type: 'fill', source: KALLA.vida, filter: HANSYNSYTA_FILTER, paint: { 'fill-pattern': snedstreckId('natur'), 'fill-opacity': 0.9 } },
    { id: 'sk-vida-hansyn-kant', type: 'line', source: KALLA.vida, filter: HANSYNSYTA_FILTER, paint: { 'line-color': FARG_NATUR, 'line-width': 1.5 } },
    { id: 'sk-vida-nb-fyll', type: 'fill', source: KALLA.vida, filter: NB, paint: { 'fill-color': FARG_NATUR, 'fill-opacity': 0.10 } },
    { id: 'sk-vida-nb-snedstreck', type: 'fill', source: KALLA.vida, filter: NB, paint: { 'fill-pattern': snedstreckId('natur'), 'fill-opacity': 0.9 } },
    { id: 'sk-vida-nb-kant', type: 'line', source: KALLA.vida, filter: NB, paint: { 'line-color': FARG_NATUR, 'line-width': 2.5 } },
    { id: 'sk-vida-raa-fyll', type: 'fill', source: KALLA.vida, filter: RAA_YTA, paint: { 'fill-color': FARG_KULTUR, 'fill-opacity': 0.14 } },
    { id: 'sk-vida-raa-snedstreck', type: 'fill', source: KALLA.vida, filter: RAA_YTA, paint: { 'fill-pattern': snedstreckId('kultur'), 'fill-opacity': 0.9 } },
    { id: 'sk-vida-raa-kant', type: 'line', source: KALLA.vida, filter: RAA_YTA, paint: { 'line-color': FARG_KULTUR, 'line-width': 2.5 } },
  ];
  const ovrigtYtor = [
    ...egnaYtor('ovrigt', 'sk-o'),
    { id: 'sk-vida-ovrigt-fyll', type: 'fill', source: KALLA.vida, filter: OVRIGT_YTA_FILTER, paint: { 'fill-color': OVRIGT_YTA_STIL.farg, 'fill-opacity': OVRIGT_YTA_STIL.traffFyllning } },
    { id: 'sk-vida-ovrigt-kant', type: 'line', source: KALLA.vida, filter: OVRIGT_YTA_FILTER, paint: { 'line-color': OVRIGT_YTA_STIL.farg, 'line-width': OVRIGT_YTA_STIL.kantBredd, 'line-dasharray': [...OVRIGT_YTA_STIL.streck] } },
    { id: 'sk-vida-raa-linje', type: 'line', source: KALLA.vida, filter: ['==', ['get', '_lager'], 'L_RAA_LINE_101'], paint: { 'line-color': FARG_KULTUR, 'line-width': 2.5 } },
    ...linjeLager(M, 'sk-o', del('ovrigt'), undefined, { utom: [...VAG_LINJETYPER, 'boundary'] }),
  ];
  const ovrigtSymboler = [
    pilLager(M, 'sk-o', HEL),
    symbolLager(M, 'sk-o', del('ovrigt')),
    { id: 'sk-vida-raa-punkt', type: 'circle', source: KALLA.vida, filter: ['==', ['get', '_lager'], 'L_RAA_POINT_101'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7], 'circle-color': FARG_KULTUR, 'circle-stroke-color': '#1a1a1a', 'circle-stroke-width': 1.5 } },
  ];
  const grans = [...vidaGransLager(), ...linjeLager(M, 'sk-g', null, undefined, { endast: ['boundary'] })];
  const vagar = [
    { id: 'sk-vida-basvag', type: 'line', source: KALLA.vida, filter: VIDA_BASVAG, paint: { 'line-color': ['coalesce', ['get', '_farg'], VIDA_BASVAG_FARG], 'line-width': 4 }, layout: { 'line-cap': 'round' } },
    ...linjeLager(M, 'sk-v', null, undefined, { endast: VAG_LINJETYPER }),
    ...backvagLager(),
  ];
  const vagSymboler = [
    symbolLager(M, 'sk-v', del('vag')),
    { id: 'sk-avlagg-nr', type: 'symbol', source: KALLA.avlaggNr, layout: { 'text-field': ['get', 'nr'], 'text-size': 13, 'text-font': FONT, 'text-offset': [0, 2.2], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.4 } },
    { id: 'sk-vida-avlagg', type: 'symbol', source: KALLA.vida, filter: VIDA_AVLAGG, layout: { 'icon-image': 'marker-landing', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 13, 0.3, 15, 0.5, 17, 0.75], 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    { id: 'sk-vida-avlagg-nr', type: 'symbol', source: KALLA.vida, filter: VIDA_AVLAGG, layout: { 'text-field': ['to-string', ['coalesce', ['get', 'EXTRA_LABE'], ['get', 'LOPNR'], '']], 'text-size': 13, 'text-font': FONT, 'text-offset': [0, 2.4], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-optional': true }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.4 } },
  ];
  const faraLinjer = [
    ...kraftledningLager(KALLA.vida, 'sk-kraft', VIDA_KRAFT),
    ...linjeLager(M, 'sk-f', null, undefined, { endast: Object.keys(LINJE_GRUPP).filter((t) => LINJE_GRUPP[t] === 'fara') }),
  ];
  const faraSymboler = [symbolLager(M, 'sk-f', del('fara'))];
  // Skördarens stråk som i maskinernas skotarläge (lib/sparStil kartSpar, skotarläget): lila, brett, mörk kant.
  const sp = kartSpar('plan', true);
  const spar = [
    { id: 'sk-spar-kant', type: 'line', source: SPAR_KALLA.skordare, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': sp.kantFarg, 'line-width': sp.kantBredd, 'line-opacity': sp.kantOpacitet } },
    { id: 'sk-spar', type: 'line', source: SPAR_KALLA.skordare, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': sp.farg, 'line-width': sp.bredd, 'line-opacity': sp.opacitet } },
  ];
  // Samma prickar som maskinernas skotarläge (app/planering/page.tsx laggTillHogPrickar): ljus prick med mörk kant, större = mer kvar, en rest nästan osynlig.
  const hogar = [{
    id: 'sk-hogar', type: 'circle', source: KALLA.hogar,
    paint: {
      'circle-color': ['get', 'farg'],
      'circle-stroke-color': 'rgba(0,0,0,0.75)',
      'circle-stroke-width': 1.5,
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        13, ['interpolate', ['linear'], ['get', 'v'], 0, 1, 2, 1.5, 10, 3, 30, 5],
        17, ['interpolate', ['linear'], ['get', 'v'], 0, 1.5, 1, 2.5, 5, 4.5, 15, 7.5, 40, 10]],
      'circle-opacity': ['coalesce', ['get', 'a'], 0.95],
      'circle-stroke-opacity': ['coalesce', ['get', 'a'], 0.95],
    },
  }];
  return { skydd, ovrigtYtor, ovrigtSymboler, grans, vagar, vagSymboler, faraLinjer, faraSymboler, spar, hogar };
}

/** Lagren i den ordning de läggs på kartan: ytor underst, sedan gräns, vägar, fara, spår, högar och överst symbolerna (faran överst av allt). */
export function lagerOrdning(): any[] {
  const s = lagerSpec();
  return [...s.ovrigtYtor, ...s.skydd, ...s.grans, ...s.vagar, ...s.faraLinjer, ...s.spar, ...s.hogar, ...s.ovrigtSymboler, ...s.vagSymboler, ...s.faraSymboler];
}

/** Vilka lager-id som hör till vilket val. */
export function lagerIdn(): Record<Lager, string[]> {
  const s = lagerSpec();
  const id = (l: any[]) => l.map((x) => x.id as string);
  return {
    grans: id(s.grans), spar: id(s.spar), hogar: id(s.hogar), vagar: [...id(s.vagar), ...id(s.vagSymboler)], fara: [...id(s.faraLinjer), ...id(s.faraSymboler)],
    skydd: id(s.skydd), ovrigt: [...id(s.ovrigtYtor), ...id(s.ovrigtSymboler)],
  };
}

/** Finns det något att visa för valet? (Ett val utan innehåll går inte att slå på, och raden säger varför.) */
export function finns(d: Data, k: ReturnType<typeof kallor>): Record<Lager, boolean> {
  const mark = (k[KALLA.mark] as any).features as any[];
  const vida = d.vida;
  const p = (f: any) => f.properties ?? {};
  const arVidaKraft = (f: any) => p(f)._typ === 'linje' && /kraftled/i.test(String(p(f).FLBESKR ?? ''));
  const harDel = (x: Del) => mark.some((f) => p(f).del === x && p(f).typ !== 'boundary');
  const vidaSkydd = vida.some((f) => p(f)._typ === 'hänsynsyta' && !arOvrigYta(p(f))) || vida.some((f) => p(f)._lager === 'SV_SKS_NYCKELBIOTOP_101' || p(f)._lager === 'L_RAA_POLY_101');
  return {
    grans: d.gran.length > 0 || mark.some((f) => p(f).typ === 'boundary'),
    spar: d.spar.length > 0,
    hogar: (d.hogar?.hogar.length ?? 0) > 0,
    vagar: harDel('vag') || vida.some((f) => (p(f)._typ === 'linje' && !arVidaKraft(f)) || p(f)._typ === 'punkt'),
    fara: harDel('fara') || vida.some(arVidaKraft),
    skydd: harDel('skydd') || vidaSkydd,
    ovrigt: harDel('ovrigt') || vida.some((f) => arOvrigYta(p(f)) || p(f)._lager === 'L_RAA_LINE_101' || p(f)._lager === 'L_RAA_POINT_101'),
  };
}

// --- Tryck ------------------------------------------------------------------------------------------------------------------------------------

export type TryckKort =
  | { typ: 'markering'; namn: string; forklaring: string; kommentarer: string[]; fotoId: string | null }
  | { typ: 'hog'; hog: SkotarHog };

/** Det som står på en av planerarens markeringar: namn, vad den betyder, kommentarerna (texten) och om den har ett foto. */
export function markeringKort(m: Record<string, unknown>, kommentarer: Record<string, string[]>): TryckKort {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  let forklaring = '';
  if (str(m.type)) forklaring = SYMBOL_FORKLARING[str(m.type)] ?? '';
  else if (str(m.zoneType)) forklaring = ytaForklaring(str(m.zoneType))?.forklaring ?? '';
  else if (str(m.lineType)) forklaring = linjeKort(str(m.lineType)).forklaring;
  const texter: string[] = [];
  const egen = str(m.comment).trim();
  if (egen) texter.push(egen);
  if (m.id != null) for (const t of kommentarer[String(m.id)] ?? []) if (!texter.includes(t)) texter.push(t);
  const nr = m.nummer ?? m.avlaggNummer;
  const namn = markeringNamn(m) + (m.type === 'landing' && nr != null && String(nr).trim() && !markeringNamn(m).includes(String(nr)) ? ` ${String(nr).trim()}` : '');
  return { typ: 'markering', namn, forklaring, kommentarer: texter, fotoId: m.foto && m.id != null ? String(m.id) : null };
}

/** Det som står på ett av Vidas objekt. */
export function vidaKort(p: Record<string, unknown>): TryckKort {
  const s = (v: unknown) => (v == null ? '' : String(v).trim());
  const typ = s(p._typ), lager = s(p._lager);
  const text = [s(p.FLBESKR), s(p.ATGARD)].filter((t, i, a) => t && a.indexOf(t) === i);
  if (typ === 'linje') { const k = vidaLinjeKort(s(p.FLBESKR)); return { typ: 'markering', namn: k.namn, forklaring: k.forklaring, kommentarer: [], fotoId: null }; }
  if (typ === 'punkt') return { typ: 'markering', namn: `Avlägg ${s(p.EXTRA_LABE) || s(p.LOPNR)}`.trim(), forklaring: SYMBOL_FORKLARING.landing ?? '', kommentarer: text.filter((t) => !/avl[äa]gg/i.test(t)), fotoId: null };
  if (lager === 'SV_SKS_NYCKELBIOTOP_101') { const v = vidaForklaring('nyckelbiotop'); return { typ: 'markering', namn: v.namn, forklaring: v.forklaring, kommentarer: [], fotoId: null }; }
  if (lager.startsWith('L_RAA_')) { const v = vidaForklaring(lager === 'L_RAA_POINT_101' ? 'raa_punkt' : 'raa_yta'); return { typ: 'markering', namn: v.namn, forklaring: v.forklaring, kommentarer: [], fotoId: null }; }
  const v = vidaForklaring('hansynsyta');
  return { typ: 'markering', namn: `${v.namn} ${s(p.LOPNR)}`.trim(), forklaring: v.forklaring, kommentarer: text, fotoId: null };
}
