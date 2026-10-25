// TRAKTERNA — en rad per avverkad trakt (Vidas slutavverkningar och gallringar), med det en trakt brukar ge bredvid.
// Fliken Trakter och traktsidan läser härifrån; rotposterna är bara de trakter som är köpta på rot (lib/rotpost/kalla.ts).
//
// "Vanligt" = de ANDRA trakternas utfall av SAMMA typ inom ±15 % av traktens medelstam, med samma utfall() som Räknas tabell och
// medelstamssidan (volymvägt, lövdominerade utanför). Trakten själv räknas aldrig in i sitt eget jämförelsetal. Ingen
// rötajustering: rötan står som ett eget tal bredvid, så en rötig trakt syns som rötig och inte som "dåligt apterad".
// Inga pengar (Martin 2026-10-23).

import { SORTIMENT, andelarAv, delaUrval, heltalTill100, utfall, MIN_OBJEKT, type Andelar, type Objekt, type Sortiment, type Typ } from '@/lib/medelstam/berakna';

export type Trakt = {
  id: string;
  namn: string;
  typ: Typ;
  forsta: string | null;
  volym: number;
  /** Skördade stammar. */
  stammar: number;
  medelstam: number;
  /** Köpt på rot. */
  rotpost: boolean;
  /** Traktens egen fördelning, hela procent som summerar till 100. */
  andel: Andelar;
  /** Traktens m³ per sortiment, hela m³ som summerar till den avrundade volymen. */
  m3: Record<Sortiment, number>;
  /** Vanligt vid samma medelstam (andra trakter av samma typ); null när för få trakter ligger i närheten. */
  vanligt: Andelar | null;
  /** Antal trakter som "vanligt" bygger på. */
  jamfordaTrakter: number;
  /** Andel stammar över 20 cm med röta i rotändan; null när det inte är mätt. */
  rota: number | null;
};
/** En rotpost är en trakt med rotpost = true (namnet finns kvar för rotpostsidornas kod). */
export type Rotpost = Trakt;

export function trakter(alla: Objekt[], rpIds: Set<string>): Trakt[] {
  const med = delaUrval(alla).med;
  return alla
    .map(o => {
      const andra = med.filter(x => x.typ === o.typ && x.id !== o.id);
      const u = utfall(andra, o.medelstam);
      return {
        id: o.id,
        namn: o.namn ?? o.id,
        typ: o.typ,
        forsta: o.forsta,
        volym: o.volym,
        stammar: o.stammar,
        medelstam: o.medelstam,
        rotpost: rpIds.has(o.id),
        andel: heltalTill100(andelarAv(o)),
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

/** Rotposterna: slutavverkningar köpta på rot, nyast först. */
export function rotposter(alla: Objekt[], rpIds: Set<string>): Rotpost[] {
  return trakter(alla, rpIds).filter(t => t.rotpost && t.typ === 'Slutavverkning');
}

/** Skillnad i procentenheter mellan trakten och det vanliga, för ett sortiment. null när jämförelse saknas. */
export function skillnad(r: Trakt, s: Sortiment): number | null {
  return r.vanligt ? r.andel[s] - r.vanligt[s] : null;
}

/** Trakterna grupperade på månaden avverkningen började ("2026-09"), nyast först; utan datum sist under nyckeln ''. */
export function perManad(t: Trakt[]): { manad: string; trakter: Trakt[] }[] {
  const g = new Map<string, Trakt[]>();
  for (const x of t) {
    const m = x.forsta ? x.forsta.slice(0, 7) : '';
    if (!g.has(m)) g.set(m, []);
    g.get(m)!.push(x);
  }
  return [...g.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[0].localeCompare(a[0])))
    .map(([manad, trakter]) => ({ manad, trakter }));
}

export { SORTIMENT, MIN_OBJEKT };
