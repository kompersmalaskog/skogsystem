// KÖRORDNING PÅ KARTAN (2026-10-25). Ren kartstil + punkterna som ritas; page.tsx kopplar bara in dem. Logiken (status, riktning, täckning) bor i korordning.ts.
//
// Vägen själv ritas av de vanliga väglagren. Körordningen lägger bara till det som följer av statusen (property `kor` på vägens feature):
//   klar               → vägen ritas grå (kartKlart.ts: samma grå och samma styrka som en klar trakt), basvägens gula streck tonas bort
//   nästa              → bara siffran (linjen ritas som vanligt — inga tunna linjer)
//   nu                 → tjockare linje + ett vitt sken under vägen (lyser) + vita pilar PÅ vägen + "85 m kvar"
// Pilarna, siffran och "m kvar" är punkter i EN källa (kor-source) med property `slag`. Allt är 'line-'-lager, så de följer med in i körvyn (KEEP_PREFIX).
import { FARG, TYP } from './design/tokens';
import { KLART_FARG, KLART_LINJE_OPACITET } from './kartKlart';
import { kvarEtikett, nyTackning, pilPunkter, siffraPunkt, statusPerVag, type KorStatus, type KorVag, type LngLat, type Tackning } from './korordning';

export const KOR_KALLA = 'kor-source';
export const KOR_PIL_BILD = 'kor-pil';
export const KOR_SKEN_LAGER = 'line-kor-sken';
export const KOR_PIL_LAGER = 'line-kor-pil';
export const KOR_SIFFRA_LAGER = 'line-kor-siffra';
export const KOR_KVAR_LAGER = 'line-kor-kvar';
/** Alla symbollager (de ska stå i SYMBOL_UNDANTAG: de är en del av vägen och klipps inte på zoom). */
export const KOR_SYMBOLLAGER: readonly string[] = [KOR_PIL_LAGER, KOR_SIFFRA_LAGER, KOR_KVAR_LAGER];

/** Bara nu-vägen ritas tjockare (så här mycket); alla andra vägar — nästa, kommande, utan siffra — ritas som vanligt. */
export const KOR_TJOCK = 1.5;
export const KOR_SKEN_FARG = '#ffffff';
export const KOR_SKEN_OPACITET = 0.3;

const arKor = (...s: KorStatus[]) => ['in', ['get', 'kor'], ['literal', s]] as any;

/** Linjebredden (ett zoom-uttryck): tjockare för nu, oförändrad för alla andra. Uttryck utan zoom-interpolering får faktorn rakt på. */
export function korBredd(uttryck: any): any {
  const faktor = ['case', arKor('nu'), KOR_TJOCK, 1];
  if (Array.isArray(uttryck) && uttryck[0] === 'interpolate') {
    const ut = [...uttryck];
    for (let i = 4; i < ut.length; i += 2) ut[i] = ['*', ut[i], faktor];
    return ut;
  }
  return ['*', uttryck, faktor];
}

/** Färgen, men grå (kartKlart) när vägen är körd. */
export const korFarg = (uttryck: any): any => ['case', ['==', ['get', 'kor'], 'klar'], KLART_FARG, uttryck];
/** Styrkan: samma svagare styrka som en klar trakt när vägen är körd. */
export const KOR_OPACITET: any = ['case', ['==', ['get', 'kor'], 'klar'], KLART_LINJE_OPACITET, 1];
/** Filtret för basvägens gula streck: inte på en körd väg. */
export const KOR_INTE_KLAR: any = ['!=', ['get', 'kor'], 'klar'];

/** Vägens status som property på dess feature. Utan siffra: ingen property (vägen ritas som förut). */
export function korEgenskap(status: KorStatus | undefined): { kor?: KorStatus } { return status ? { kor: status } : {}; }

// ── Lagren ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Skenet: en bredare vit linje UNDER vägarna, bara för "nu". Läggs under lägsta väglager av anroparen (beforeId). */
export function korSkenLager(kalla: string): any {
  return {
    id: KOR_SKEN_LAGER, type: 'line', source: kalla, filter: ['==', ['get', 'kor'], 'nu'],
    paint: { 'line-color': KOR_SKEN_FARG, 'line-opacity': KOR_SKEN_OPACITET, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 8, 11, 11, 15, 16, 17, 20], 'line-blur': 3 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  };
}

export function korPunktLager(): any[] {
  return [
    {
      id: KOR_PIL_LAGER, type: 'symbol', source: KOR_KALLA, filter: ['==', ['get', 'slag'], 'pil'],
      layout: { 'icon-image': KOR_PIL_BILD, 'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.3, 17, 0.5], 'icon-rotate': ['get', 'riktning'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    },
    {
      id: KOR_SIFFRA_LAGER, type: 'symbol', source: KOR_KALLA, filter: ['==', ['get', 'slag'], 'siffra'],
      layout: { 'text-field': ['to-string', ['get', 'text']], 'text-size': 18, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': FARG.text, 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 2 },
    },
    {
      id: KOR_KVAR_LAGER, type: 'symbol', source: KOR_KALLA, filter: ['==', ['get', 'slag'], 'kvar'],
      layout: { 'text-field': ['get', 'text'], 'text-size': TYP.meta.fontSize, 'text-font': ['Open Sans Semibold', 'Open Sans Regular'], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, -1.2] },
      paint: { 'text-color': FARG.text, 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 2 },
    },
  ];
}

// ── Punkterna ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface KorKartaIn {
  vagar: readonly KorVag[];
  /** 'planering': siffra och fast pil på varje väg i körordningen. 'korvy': bara nu (pilar som glider + "m kvar") och nästa (siffra). */
  lage: 'planering' | 'korvy';
  tMs: number;
  /** Minskad rörelse: fasta pilar. */
  statisk?: boolean;
  /** Vad maskinen kört på nu-vägen (körvyn). */
  tackning?: Tackning | null;
}

type Pf = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Point'; coordinates: LngLat } };
const punkt = (p: { lng: number; lat: number }, props: Record<string, unknown>): Pf => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });

export function korPunkter({ vagar, lage, tMs, statisk = false, tackning = null }: KorKartaIn): { type: 'FeatureCollection'; features: Pf[] } {
  const status = statusPerVag(vagar);
  const features: Pf[] = [];
  for (const v of vagar) {
    const s = status.get(v.id);
    if (!s || s === 'klar') continue;                       // en körd väg är grå och har varken pil eller siffra
    if (lage === 'korvy' && s === 'kommande') continue;     // föraren ser nu och nästa, inget mer
    const visaPilar = lage === 'planering' || s === 'nu';
    const visaSiffra = lage === 'planering' || s === 'nasta';
    if (visaPilar) for (const p of pilPunkter(v.coords, v.bak, tMs, statisk || lage === 'planering')) features.push(punkt(p, { slag: 'pil', riktning: p.riktning, id: v.id }));
    if (visaSiffra && v.ordning != null) {
      const p = siffraPunkt(v.coords, v.bak);
      if (p) features.push(punkt(p, { slag: 'siffra', text: v.ordning, id: v.id }));
    }
    if (lage === 'korvy' && s === 'nu') {
      const e = kvarEtikett(v.coords, v.bak, tackning ?? nyTackning(v.coords));
      if (e) features.push(punkt(e, { slag: 'kvar', text: e.text, id: v.id }));
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Pilikonen: vit, pekar uppåt (norr) vid rotation 0 — samma form som kartans andra pilar (ritaPilIkon). */
export const KOR_PIL_FARG = '#ffffff';
