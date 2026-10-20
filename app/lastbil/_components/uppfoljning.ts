// Uppföljningen (året): EN härledning för toppen, diagrammet och månadslistan, så de tre aldrig kan läsa olika underlag.
// Allt ligger på rundorna (`summera`): samma regler som Körningar — hela km per runda, summa av avrundade delar, l/mil bara över
// rundor med BÅDE mätare och diesel, och saknad diesel är null (aldrig 0).

import { manaderIAr, manadForStart, type Manad } from './period';
import { fmtLPerMil, summera, type Runda, type Summa } from './rundor';

export type Lage = 'forbrukning' | 'korstracka';

export const LAGEN: readonly (readonly [Lage, string])[] = [['forbrukning', 'Förbrukning'], ['korstracka', 'Körsträcka']];

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

export const ENHET: Record<Lage, string> = { forbrukning: 'l/mil', korstracka: 'km' };
