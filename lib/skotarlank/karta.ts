// Skotarlänkens karta: källor, lager och tryckkort ur serverns data. Ren — ingen karta, ingen databas.
//
// SAMMA bilder och färger som planeringsvyn och objektöversiktens karta: planerarens markeringar ritas med lib/kartstil + lib/egenkontrollkarta
// (symboler, pilar, linjer med basvägarnas snitselfärger, stickvägar, backväg, ytor med snedstreck), Vidas lager med samma filter, färger och
// etiketter som planeringen (hänsyn, nyckelbiotop, fornlämning, basväg, kraftledning som ledning, avlägg med Vidas nummer), skördarens körspår
// som stråk (sparLager) och produktionshögarna som prickar i trädslagets färg (som objektöversikten).

import { backvagFeatureUrData, backvagLager, BACKVAG_KALLA, kontextFeature, sparFeatures, sparLager, SPAR_KALLA, vidaGransFeatures, vidaGransLager, VIDA_GRANS_KALLA } from '@/lib/egenkontrollkarta';
import { kraftledningLager, linjeLager, pilLager, symbolLager, VIDA_BASVAG_FARG, zonFyllLager, zonKantLager, zonSnedstreckLager } from '@/lib/kartstil';
import { VAG_LINJETYPER } from '@/lib/backvag';
import { HANSYNSYTA_FILTER, OVRIGT_YTA_FILTER, OVRIGT_YTA_STIL, snedstreckId, VIDA_ETIKETT, YTA_ETIKETT_STIL, YTA_ETIKETT_STORLEK } from '@/lib/ytaStil';
import { FARG_KULTUR, FARG_NATUR } from '@/lib/larm/grupper';
import { linjeKort, SYMBOL_FORKLARING, vidaForklaring, vidaLinjeKort, ytaForklaring } from '@/lib/symboler';
import { markeringNamn } from '@/app/oversikt/markeringar';
import type { Origo } from '@/lib/kartkoordinater';
import type { SkotarHog } from './hogar';

export type LngLat = [number, number];

export const KALLA = { mark: 'sk-mark', avlaggNr: 'sk-avlagg-nr', vida: 'sk-vida', vidaEtikett: 'sk-vida-etikett', hogar: 'sk-hogar' } as const;
const HEL = { opacitet: 1, breddFaktor: 1 };
const FONT = ['Open Sans Bold'];

/** Lagervalen — samma som objektöversiktens karta, utan skotarens spår och maskinerna (de visas inte här). */
export type Lager = 'spar' | 'hogar' | 'vagar' | 'kraftledning' | 'symboler' | 'grans';
export const LAGER: readonly { id: Lager; namn: string }[] = [
  { id: 'spar', namn: 'Skördarens körspår' },
  { id: 'hogar', namn: 'Produktionshögar' },
  { id: 'vagar', namn: 'Basvägar och stickvägar' },
  { id: 'kraftledning', namn: 'Kraftledning' },
  { id: 'symboler', namn: 'Symboler och ytor' },
  { id: 'grans', namn: 'Traktgräns' },
];
export const ALLA_PA: Record<Lager, boolean> = { spar: true, hogar: true, vagar: true, kraftledning: true, symboler: true, grans: true };

export type Data = {
  origo: Origo | null;
  markeringar: Record<string, unknown>[];
  vida: { type: 'Feature'; geometry: any; properties: Record<string, unknown> }[];
  gran: LngLat[][];
  spar: LngLat[][];
  hogar: { hogar: SkotarHog[] } | null;
};

const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });

/** En punkt mitt i en yta (medel av yttre ringens hörn) — etiketten ska stå EN gång, inte en per kartruta. */
function mittpunkt(g: any): LngLat | null {
  const ring: number[][] | undefined = g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : undefined;
  if (!ring?.length) return null;
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

/** Källorna som kartan fyller. Varje markering bär sin plats i listan (`i`) så att ett tryck hittar den. */
export function kallor(d: Data) {
  const mark: any[] = [];
  const avlaggNr: any[] = [];
  const backvag: any[] = [];
  if (d.origo) {
    d.markeringar.forEach((m, i) => {
      const f = kontextFeature(m, d.origo!);
      if (!f) return;
      mark.push({ ...f, properties: { ...f.properties, i } });
      const nr = m.nummer ?? m.avlaggNummer;
      if (m.type === 'landing' && nr != null && String(nr).trim() && f.geometry.type === 'Point') {
        avlaggNr.push({ type: 'Feature', properties: { nr: String(nr).trim() }, geometry: f.geometry });
      }
      const b = backvagFeatureUrData(m, d.origo!, undefined, false);
      if (b) backvag.push(b);
    });
  }
  const vida = d.vida.map((f, i) => ({ ...f, properties: { ...f.properties, vi: i } as Record<string, unknown> }));
  const vidaEtikett = vida.flatMap((f) => {
    if (f.properties._typ !== 'hänsynsyta' && f.properties._lager !== 'SV_SKS_NYCKELBIOTOP_101' && f.properties._lager !== 'L_RAA_POLY_101') return [];
    const p = mittpunkt(f.geometry);
    return p ? [{ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: p } }] : [];
  });
  const hogar = (d.hogar?.hogar ?? []).map((h, i) => ({ type: 'Feature', properties: { hi: i, volym: h.m3, farg: h.farg }, geometry: { type: 'Point', coordinates: [h.lng, h.lat] } }));
  return {
    [KALLA.mark]: fc(mark),
    [KALLA.avlaggNr]: fc(avlaggNr),
    [BACKVAG_KALLA]: fc(backvag),
    [KALLA.vida]: fc(vida),
    [KALLA.vidaEtikett]: fc(vidaEtikett),
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
const etikett = (text: unknown) => ({
  layout: { 'text-field': text, 'text-size': YTA_ETIKETT_STORLEK, 'text-font': ['Open Sans Semibold', 'Open Sans Regular', 'Arial Unicode MS Regular'], 'text-allow-overlap': true },
  paint: { 'text-color': YTA_ETIKETT_STIL.text, 'text-halo-color': YTA_ETIKETT_STIL.kant, 'text-halo-width': YTA_ETIKETT_STIL.kantBredd },
});

/** Lagren per val, i ritordning (ytor underst, symboler och nummer överst). */
export function lagerSpec() {
  const M = KALLA.mark;
  const ytor = [
    ...zonFyllLager(M, 'sk-o', null), ...zonSnedstreckLager(M, 'sk-o', null), ...zonKantLager(M, 'sk-o', null),
    { id: 'sk-vida-hansyn-fyll', type: 'fill', source: KALLA.vida, filter: HANSYNSYTA_FILTER, paint: { 'fill-color': FARG_NATUR, 'fill-opacity': 0.18 } },
    { id: 'sk-vida-hansyn-snedstreck', type: 'fill', source: KALLA.vida, filter: HANSYNSYTA_FILTER, paint: { 'fill-pattern': snedstreckId('natur'), 'fill-opacity': 0.9 } },
    { id: 'sk-vida-hansyn-kant', type: 'line', source: KALLA.vida, filter: HANSYNSYTA_FILTER, paint: { 'line-color': FARG_NATUR, 'line-width': 1.5 } },
    { id: 'sk-vida-ovrigt-fyll', type: 'fill', source: KALLA.vida, filter: OVRIGT_YTA_FILTER, paint: { 'fill-color': OVRIGT_YTA_STIL.farg, 'fill-opacity': OVRIGT_YTA_STIL.traffFyllning } },
    { id: 'sk-vida-ovrigt-kant', type: 'line', source: KALLA.vida, filter: OVRIGT_YTA_FILTER, paint: { 'line-color': OVRIGT_YTA_STIL.farg, 'line-width': OVRIGT_YTA_STIL.kantBredd, 'line-dasharray': [...OVRIGT_YTA_STIL.streck] } },
    { id: 'sk-vida-nb-fyll', type: 'fill', source: KALLA.vida, filter: NB, paint: { 'fill-color': FARG_NATUR, 'fill-opacity': 0.10 } },
    { id: 'sk-vida-nb-snedstreck', type: 'fill', source: KALLA.vida, filter: NB, paint: { 'fill-pattern': snedstreckId('natur'), 'fill-opacity': 0.9 } },
    { id: 'sk-vida-nb-kant', type: 'line', source: KALLA.vida, filter: NB, paint: { 'line-color': FARG_NATUR, 'line-width': 2.5 } },
    { id: 'sk-vida-raa-fyll', type: 'fill', source: KALLA.vida, filter: RAA_YTA, paint: { 'fill-color': FARG_KULTUR, 'fill-opacity': 0.14 } },
    { id: 'sk-vida-raa-snedstreck', type: 'fill', source: KALLA.vida, filter: RAA_YTA, paint: { 'fill-pattern': snedstreckId('kultur'), 'fill-opacity': 0.9 } },
    { id: 'sk-vida-raa-kant', type: 'line', source: KALLA.vida, filter: ['in', ['get', '_lager'], ['literal', ['L_RAA_POLY_101', 'L_RAA_LINE_101']]], paint: { 'line-color': FARG_KULTUR, 'line-width': 2.5 } },
    { id: 'sk-vida-raa-punkt', type: 'circle', source: KALLA.vida, filter: ['==', ['get', '_lager'], 'L_RAA_POINT_101'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7], 'circle-color': FARG_KULTUR, 'circle-stroke-color': '#1a1a1a', 'circle-stroke-width': 1.5 } },
    ...linjeLager(M, 'sk-o', null, undefined, { utom: [...VAG_LINJETYPER, 'boundary'] }),
  ];
  const ytEtiketter = [
    { id: 'sk-vida-hansyn-etikett', type: 'symbol', source: KALLA.vidaEtikett, filter: HANSYNSYTA_FILTER, ...etikett(['concat', VIDA_ETIKETT.hansynsyta, ' ', ['to-string', ['coalesce', ['get', 'LOPNR'], '']]]) },
    { id: 'sk-vida-ovrigt-etikett', type: 'symbol', source: KALLA.vidaEtikett, filter: OVRIGT_YTA_FILTER, ...etikett(['concat', VIDA_ETIKETT.ovrigt, ' ', ['to-string', ['coalesce', ['get', 'LOPNR'], '']]]) },
    { id: 'sk-vida-nb-etikett', type: 'symbol', source: KALLA.vidaEtikett, filter: NB, ...etikett(VIDA_ETIKETT.nyckelbiotop) },
    { id: 'sk-vida-raa-etikett', type: 'symbol', source: KALLA.vidaEtikett, filter: RAA_YTA, ...etikett(VIDA_ETIKETT.raa_yta) },
  ];
  const grans = [...vidaGransLager(), ...linjeLager(M, 'sk-g', null, undefined, { endast: ['boundary'] })];
  const vagar = [
    { id: 'sk-vida-basvag', type: 'line', source: KALLA.vida, filter: VIDA_BASVAG, paint: { 'line-color': ['coalesce', ['get', '_farg'], VIDA_BASVAG_FARG], 'line-width': 4 }, layout: { 'line-cap': 'round' } },
    ...linjeLager(M, 'sk-v', null, undefined, { endast: VAG_LINJETYPER }),
    ...backvagLager(),
  ];
  const kraftledning = kraftledningLager(KALLA.vida, 'sk-kraft', VIDA_KRAFT);
  const spar = sparLager('skordare');
  const hogar = [{
    id: 'sk-hogar', type: 'circle', source: KALLA.hogar,
    paint: {
      'circle-color': ['get', 'farg'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        13, ['interpolate', ['linear'], ['sqrt', ['get', 'volym']], 0, 2, 5, 5],
        17, ['interpolate', ['linear'], ['sqrt', ['get', 'volym']], 0, 4, 5, 14]],
      'circle-stroke-color': 'rgba(0,0,0,0.6)', 'circle-stroke-width': 1, 'circle-opacity': 0.92,
    },
  }];
  const symboler = [
    pilLager(M, 'sk-o', HEL),
    symbolLager(M, 'sk-o', null),
    { id: 'sk-avlagg-nr', type: 'symbol', source: KALLA.avlaggNr, layout: { 'text-field': ['get', 'nr'], 'text-size': 13, 'text-font': FONT, 'text-offset': [0, 2.2], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.4 } },
    { id: 'sk-vida-avlagg', type: 'symbol', source: KALLA.vida, filter: VIDA_AVLAGG, layout: { 'icon-image': 'marker-landing', 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 13, 0.3, 15, 0.5, 17, 0.75], 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    { id: 'sk-vida-avlagg-nr', type: 'symbol', source: KALLA.vida, filter: VIDA_AVLAGG, layout: { 'text-field': ['to-string', ['coalesce', ['get', 'EXTRA_LABE'], ['get', 'LOPNR'], '']], 'text-size': 13, 'text-font': FONT, 'text-offset': [0, 2.4], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-optional': true }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.4 } },
  ];
  return { ytor, ytEtiketter, grans, vagar, kraftledning, spar, hogar, symboler };
}

/** Lagren i den ordning de läggs på kartan. */
export function lagerOrdning(): any[] {
  const s = lagerSpec();
  return [...s.ytor, ...s.grans, ...s.vagar, ...s.kraftledning, ...s.spar, ...s.hogar, ...s.ytEtiketter, ...s.symboler];
}

/** Vilka lager-id som hör till vilket val. */
export function lagerIdn(): Record<Lager, string[]> {
  const s = lagerSpec();
  const id = (l: any[]) => l.map((x) => x.id as string);
  return { spar: id(s.spar), hogar: id(s.hogar), vagar: id(s.vagar), kraftledning: id(s.kraftledning), symboler: [...id(s.ytor), ...id(s.ytEtiketter), ...id(s.symboler)], grans: id(s.grans) };
}

/** Finns det något att visa för valet? (Ett val utan innehåll går inte att slå på, och raden säger varför.) */
export function finns(d: Data, k: ReturnType<typeof kallor>): Record<Lager, boolean> {
  const mark = (k[KALLA.mark] as any).features as any[];
  const vida = d.vida;
  const arVidaKraft = (f: any) => f.properties._typ === 'linje' && /kraftled/i.test(String(f.properties.FLBESKR ?? ''));
  return {
    spar: d.spar.length > 0,
    hogar: (d.hogar?.hogar.length ?? 0) > 0,
    vagar: vida.some((f) => f.properties._typ === 'linje' && !arVidaKraft(f)) || mark.some((f) => f.properties.kind === 'linje' && VAG_LINJETYPER.includes(f.properties.typ)),
    kraftledning: vida.some(arVidaKraft),
    symboler: vida.some((f) => f.properties._typ !== 'linje') || mark.some((f) => f.properties.kind !== 'linje' || (!VAG_LINJETYPER.includes(f.properties.typ) && f.properties.typ !== 'boundary')),
    grans: d.gran.length > 0 || mark.some((f) => f.properties.typ === 'boundary'),
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
