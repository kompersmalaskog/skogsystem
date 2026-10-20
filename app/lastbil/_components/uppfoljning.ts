// Uppföljningen (året). Toppen och månadslistan ligger på rundorna (`summera`): samma regler som Körningar — hela km per runda,
// summa av avrundade delar, l/mil bara över rundor med BÅDE mätare och diesel, och saknad diesel är null (aldrig 0).
// Förbrukning och Körsträcka (staplarna) ligger på bilens VIKT (`vikt.ts`, SQL-funktionen lastbil_vikt_manad): mätt körning delad
// på med lass / utan lass / okänd. Betalt ligger på rundornas km och fakturaunderlaget. Mätarens och rundornas km är inte samma tal.

import { manaderIAr, manadForStart, type Manad } from './period';
import { arGodkand, summeraFakturerbart, type UnderlagRad } from './fakturerbart';
import { fmtLPerMil, summera, type Runda, type Summa } from './rundor';
import type { KlassSumma, ViktManad } from './vikt';

export type Lage = 'forbrukning' | 'korstracka' | 'betalt';

/** Växelns lägen. Betalt bygger på fakturaunderlaget (ekonomidata, RLS admin-only) och finns därför bara för admin. */
export function lagen(arAdmin: boolean): readonly (readonly [Lage, string])[] {
  const gemensamma = [['forbrukning', 'Förbrukning'], ['korstracka', 'Körsträcka']] as const;
  return arAdmin ? [...gemensamma, ['betalt', 'Betalt']] : gemensamma;
}

export interface ManadRad { m: Manad; s: Summa }

/** Årets månader (nyast först, som i Körningar), var och en med sin summa. En månad utan rundor finns med — en lucka vore ett falskt tomläge. */
export function perManad(ar: number, rundor: readonly Runda[], nu?: Date): ManadRad[] {
  return manaderIAr(ar, nu).map(m => ({
    m,
    s: summera(rundor.filter(r => { const x = manadForStart(r.start); return x?.ar === m.ar && x.man === m.man; })),
  }));
}

/** En stapel: värdet (null = saknas) och texten bredvid den. `saknas` är orden när värdet inte finns — aldrig en nolla. */
export interface Stapel { namn: string; varde: number | null; text: string; saknas: string | null }
/** `saknas` på raden: hela månaden saknar mätning ("vikt saknas") — då ritas inga staplar, bara orden. */
export interface StapelRad { etikett: string; staplar: Stapel[]; total: string | null; delar: string | null; saknas?: string | null }

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const manadKort = (m: Manad): string => MAN[m.man - 1];

const tusental = (n: number) => n.toLocaleString('sv-SE');

/** Seriernas namn, i samma ordning som staplarna. Vikt-lägena (Förbrukning, Körsträcka) delar på körning MED och UTAN lass. */
export const MED_LASS = 'Med lass';
export const UTAN_LASS = 'Utan lass';
export const OKAND = 'Okänd';
export const VIKT_SAKNAS = 'vikt saknas';

/**
 * Förbrukning: l/mil per månad, Med lass och Utan lass var för sig (ur bilens vikt, se vikt.ts). Ingen körning av klassen =
 * "ingen körning med lass", ingen bränsleuppgift = "diesel saknas", ingen vikt alls i månaden (juli) = "vikt saknas" — aldrig 0.
 */
export function forbrukningRader(manader: readonly ViktManad[]): StapelRad[] {
  const stapel = (namn: string, k: KlassSumma, ingen: string): Stapel => {
    if (k.kmRa === 0) return { namn, varde: null, text: '', saknas: ingen };
    if (k.lPerMil == null) return { namn, varde: null, text: '', saknas: 'diesel saknas' };
    return { namn, varde: k.lPerMil, text: fmtLPerMil(k.lPerMil) as string, saknas: null };
  };
  return manader.map(v => v.harVikt
    ? { etikett: manadKort(v.m), staplar: [stapel(MED_LASS, v.lastad, 'ingen körning med lass'), stapel(UTAN_LASS, v.tom, 'ingen körning utan lass')], total: null, delar: null }
    : { etikett: manadKort(v.m), staplar: [stapel(MED_LASS, v.lastad, ''), stapel(UTAN_LASS, v.tom, '')].map(s => ({ ...s, saknas: VIKT_SAKNAS })), total: null, delar: null, saknas: VIKT_SAKNAS });
}

/** Finns okänd körning i någon månad? Då får diagrammet en tredje (ljusare grå) serie och en rad som förklarar den. */
export const harOkand = (manader: readonly ViktManad[]): boolean => manader.some(v => v.harVikt && v.okand.km > 0);

export const korstrackaSerier = (manader: readonly ViktManad[]): string[] => [MED_LASS, UTAN_LASS, ...(harOkand(manader) ? [OKAND] : [])];

/** Körsträcka: km per månad, Med lass + Utan lass (+ Okänd när den finns) staplade. Summan är summan av de avrundade delarna. */
export function korstrackaRader(manader: readonly ViktManad[]): StapelRad[] {
  return manader.map(v => {
    const delar = [v.lastad.km, v.tom.km, ...(v.okand.km > 0 ? [v.okand.km] : [])];
    return {
      etikett: manadKort(v.m),
      staplar: [
        { namn: MED_LASS, varde: v.lastad.km, text: tusental(v.lastad.km), saknas: null },
        { namn: UTAN_LASS, varde: v.tom.km, text: tusental(v.tom.km), saknas: null },
        ...(v.okand.km > 0 ? [{ namn: OKAND, varde: v.okand.km, text: tusental(v.okand.km), saknas: null }] : []),
      ],
      total: v.harVikt ? tusental(v.km) : null,
      delar: v.harVikt ? delar.map(tusental).join(' + ') : null,
      saknas: v.harVikt ? null : VIKT_SAKNAS,
    };
  });
}

export const ENHET: Record<Lage, string> = { forbrukning: 'l/mil', korstracka: 'km', betalt: 'km' };

const manadsNyckel = (m: Manad) => `${m.ar}-${String(m.man).padStart(2, '0')}`;

/**
 * Betalt: samma stapel som Körsträcka (ALLA körda km i månaden), delad i Fakturerat och Ej betalt = körda minus fakturerade.
 * Fakturerat är pengatalets regel (`summeraFakturerbart`: godkända och fakturerade flyttar, strukna och ogodkända räknas inte,
 * varje flytts km avrundad före summering), grupperat på underlagets datum. Ej betalt blir därmed tomkörning, service, korta
 * och egna flyttar — och summan går alltid ihop med Körsträcka-läget. Ger underlaget MER km än rundorna (en rättad sträcka)
 * är Ej betalt 0, aldrig negativt.
 */
export function betaltRader(rader: readonly ManadRad[], underlag: readonly UnderlagRad[]): StapelRad[] {
  return rader.map(({ m, s }) => {
    const fakt = summeraFakturerbart(underlag.filter(u => (u.datum ?? '').slice(0, 7) === manadsNyckel(m))).km;
    const ejBetalt = Math.max(0, s.km - fakt);
    if (s.antal === 0 && fakt === 0) {
      return { etikett: manadKort(m), staplar: [{ namn: 'Fakturerat', varde: 0, text: '0', saknas: null }, { namn: 'Ej betalt', varde: 0, text: '0', saknas: null }], total: null, delar: null };
    }
    return {
      etikett: manadKort(m),
      staplar: [{ namn: 'Fakturerat', varde: fakt, text: tusental(fakt), saknas: null }, { namn: 'Ej betalt', varde: ejBetalt, text: tusental(ejBetalt), saknas: null }],
      total: `${tusental(fakt)} av ${tusental(s.km)} km`,
      delar: s.km > 0 ? `${Math.round((100 * fakt) / s.km)} %` : null,
    };
  });
}

/** Ogodkända aktiva flyttar i årets underlag: de ingår inte i Betalt (som pengatalet) och sägs i en dämpad rad. */
export function vantandeFlyttar(underlag: readonly UnderlagRad[]): { antal: number; km: number } {
  const v = underlag.filter(u => u.status !== 'struken' && !arGodkand(u));
  return { antal: v.length, km: v.reduce((s, u) => s + (u.km == null ? 0 : Math.round(u.km)), 0) };
}
