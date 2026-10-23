// ROTPOSTERNA — uppföljning av de trakter vi köpt på rot (dim_objekt.avtalsform = 'Rp'). Inga pengar (Martin 2026-10-23):
// frågan är om trakten gav det en trakt med samma medelstam brukar ge, och hur mycket röta den hade.
//
// "Vanligt" = de ANDRA slutavverkningarnas utfall inom ±15 % av traktens medelstam, med samma utfall() som Räknas tabell och
// medelstamssidan (volymvägt, lövdominerade utanför). Trakten själv räknas aldrig in i sitt eget jämförelsetal. Ingen
// rötajustering: rötan står som ett eget tal bredvid, så en rötig trakt syns som rötig och inte som "dåligt apterad".

import { SORTIMENT, andelarAv, delaUrval, heltalTill100, utfall, MIN_OBJEKT, type Andelar, type Objekt, type Sortiment } from '@/lib/medelstam/berakna';

export type Rotpost = {
  id: string;
  namn: string;
  forsta: string | null;
  volym: number;
  /** Skördade stammar. */
  stammar: number;
  medelstam: number;
  /** Traktens egen fördelning, hela procent som summerar till 100. */
  andel: Andelar;
  /** Traktens m³ per sortiment, hela m³. */
  m3: Record<Sortiment, number>;
  /** Vanligt vid samma medelstam (andra trakter); null när för få trakter ligger i närheten. */
  vanligt: Andelar | null;
  /** Antal trakter som "vanligt" bygger på. */
  jamfordaTrakter: number;
  /** Andel stammar över 20 cm med röta i rotändan; null när det inte är mätt. */
  rota: number | null;
};

export function rotposter(alla: Objekt[], rpIds: Set<string>): Rotpost[] {
  const slut = delaUrval(alla).med.filter(o => o.typ === 'Slutavverkning');
  return alla
    .filter(o => rpIds.has(o.id) && o.typ === 'Slutavverkning')
    .map(o => {
      const andra = slut.filter(x => x.id !== o.id);
      const u = utfall(andra, o.medelstam);
      const egen = andelarAv(o);
      return {
        id: o.id,
        namn: o.namn ?? o.id,
        forsta: o.forsta,
        volym: o.volym,
        stammar: o.stammar,
        medelstam: o.medelstam,
        andel: heltalTill100(egen),
        m3: { timmer: Math.round(o.timmer), kubb: Math.round(o.kubb), massa: Math.round(o.massa),
              ovrigt: Math.max(0, Math.round(o.volym) - Math.round(o.timmer) - Math.round(o.kubb) - Math.round(o.massa)) },
        vanligt: !u.forFa && u.andel ? heltalTill100(u.andel) : null,
        jamfordaTrakter: u.n,
        rota: o.rot20,
      };
    })
    // Nyast först (första avverkningsdag), saknat datum sist.
    .sort((a, b) => (b.forsta ?? '').localeCompare(a.forsta ?? ''));
}

/** Skillnad i procentenheter mellan trakten och det vanliga, för ett sortiment. null när jämförelse saknas. */
export function skillnad(r: Rotpost, s: Sortiment): number | null {
  return r.vanligt ? r.andel[s] - r.vanligt[s] : null;
}

export { SORTIMENT, MIN_OBJEKT };
