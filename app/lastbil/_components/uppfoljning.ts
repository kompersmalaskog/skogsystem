// Uppföljningen (året): EN härledning för toppen, diagrammet och månadslistan, så de tre aldrig kan läsa olika underlag.
// Allt ligger på rundorna (`summera`): samma regler som Körningar — hela km per runda, summa av avrundade delar, l/mil bara över
// rundor med BÅDE mätare och diesel, och saknad diesel är null (aldrig 0).

import { manaderIAr, manadForStart, type Manad } from './period';
import { arGodkand, summeraFakturerbart, type UnderlagRad } from './fakturerbart';
import { fmtLPerMil, summera, type Runda, type Summa } from './rundor';

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
export interface StapelRad { etikett: string; staplar: Stapel[]; total: string | null; delar: string | null }

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const manadKort = (m: Manad): string => MAN[m.man - 1];

const tusental = (n: number) => n.toLocaleString('sv-SE');

/** Förbrukning: l/mil per månad, Flyttar och Övrig körning var för sig. Ingen runda av typen = "inga flyttar"/"ingen övrig körning", ingen diesel = "diesel saknas". */
export function forbrukningRader(rader: readonly ManadRad[]): StapelRad[] {
  const stapel = (namn: string, antal: number, lPerMil: number | null): Stapel => {
    if (antal === 0) return { namn, varde: null, text: '', saknas: namn === 'Flyttar' ? 'inga flyttar' : 'ingen övrig körning' };
    if (lPerMil == null) return { namn, varde: null, text: '', saknas: 'diesel saknas' };
    return { namn, varde: lPerMil, text: fmtLPerMil(lPerMil) as string, saknas: null };
  };
  return rader.map(({ m, s }) => ({
    etikett: manadKort(m),
    staplar: [stapel('Flyttar', s.flytt, s.lPerMilFlytt), stapel('Övrig körning', s.ovrig, s.lPerMilOvrig)],
    total: null, delar: null,
  }));
}

/** Körsträcka: km per månad, Flyttar + Övrig körning staplade. Summan är summan av de avrundade delarna. */
export function korstrackaRader(rader: readonly ManadRad[]): StapelRad[] {
  return rader.map(({ m, s }) => ({
    etikett: manadKort(m),
    staplar: [
      { namn: 'Flyttar', varde: s.kmFlytt, text: tusental(s.kmFlytt), saknas: null },
      { namn: 'Övrig körning', varde: s.kmOvrig, text: tusental(s.kmOvrig), saknas: null },
    ],
    total: s.antal === 0 ? null : tusental(s.km),
    delar: s.antal === 0 ? null : `${tusental(s.kmFlytt)} + ${tusental(s.kmOvrig)}`,
  }));
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
