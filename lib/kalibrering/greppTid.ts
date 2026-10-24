/**
 * GREPPET ÖVER TID — hur ofta maskinens egen diameter står still över GREPP_MIN_CM, per trädslag och månad, räknat på ALLA stammar maskinen har kapat.
 *
 * Underlaget är maskinens avsmalningskurva (detalj_stam_diameter, en punkt var 10:e cm) — ingen klave, inga kontrollstammar. Definitionen av "står still" är
 * stamvyns (lib/kalibrering/grepp.ts): diametern är lika eller större än föregående punkt, över en sträcka på minst GREPP_MIN_CM. Räkningen görs i databasen
 * (migration 20261024093226, kalibrering_grepp_rakna) — tio miljoner punkter går inte att hämta till en skärm — och landar här som en rad per månad, trädslag
 * och grovlek (stammens brösthöjdsdiameter).
 *
 * EN STAM RÄKNAS EN GÅNG PER RUTA: varje stam ger sin egen andel (still / steg) och rutans värde är medelvärdet över stammarna. Det är alltså inte andelen av
 * alla steg — en lång stam med 250 steg väger lika mycket som en kort med 60. (Hela steg-summorna följer med, för den som vill se den andra läsningen.)
 *
 * FÄRGEN ÄR FÖRÄNDRING, INTE NIVÅ. Trädslagen har olika form från början (björk ligger alltid högre än gran), så en ruta jämförs mot FÖRSTA rutan i sin egen rad,
 * inte mot en gräns. Läs raderna i sidled: vad som ändras över tiden, inte vilken rad som ligger högst. Grova och krokiga stammar står still oftare även när
 * allt är rätt — nivån säger därför lite, förändringen mer.
 */
import { GREPP_MIN_CM, findGreppSlapp } from './grepp';
import { periodKey, rundaMedTecken, type LagetSteg, type RutaTon } from './rutnat';
import { tradslagLabel } from '@/lib/tradslag';

export { GREPP_MIN_CM };

/** Följer v_version i kalibrering_grepp_rakna (migrationen). Höjs båda när räknesättet ändras. */
export const GREPP_VERSION = 1;

/** Färre stammar än så i en ruta → grå med "–". Greppandelen per stam varierar mycket (0–100 %), så ett medelvärde över få stammar säger inget. */
export const GREPP_MIN_STAMMAR = 20;

/** Förändring mot radens första ruta, i procentenheter: från orange till röd, och från neutral till orange (grönt åt andra hållet). */
export const GREPP_FORANDRING_ORANGE = 3;
export const GREPP_FORANDRING_ROD = 6;

/** Grovleksklassen som får en egen rad under trädslagen. */
export const GREPP_GROV_KLASS = '300+';

/**
 * Så räknas EN stam — samma regel som kalibrering_grepp_rakna i databasen (migrationen) och som stamvyn ritar. Databasen gör jobbet för alla stammar; den här
 * funktionen är regeln i läsbar form, och testerna håller de två ihop (stamvyns `findGreppSlapp` ska ge samma steg). `diametrar` är maskinens diameter var
 * `stegCm` cm, rot → topp. steg = alla steg på stammen; still = de som ligger inom ett ställe där diametern inte sjunker över minst `minCm`.
 */
export function greppAndelStam(diametrar: number[], stegCm = 10, minCm = GREPP_MIN_CM): { steg: number; still: number; andel: number } {
  const steg = Math.max(diametrar.length - 1, 0);
  let still = 0, kor = 0;
  for (let i = 1; i < diametrar.length; i++) {
    if (diametrar[i] >= diametrar[i - 1]) kor++;
    else { if (kor * stegCm >= minCm) still += kor; kor = 0; }
  }
  if (kor * stegCm >= minCm) still += kor;
  return { steg, still, andel: steg > 0 ? still / steg : 0 };
}
export { findGreppSlapp };

/** En rad ur databasen (kalibrering_grepp_sammanstall): månad, trädslag och grovlek, summerat över objekten. */
export type GreppRad = { manad: string; tradslag: string; klass: string; stammar: number; steg: number; still: number; summaAndel: number };

export type GreppRuta = {
  period: string;
  stammar: number;
  /** Medelvärde över stammarna av stammens greppandel, 0–100. */
  pct: number;
  /** Andelen av ALLA steg (alla steg lika), 0–100 — den andra läsningen. */
  pctSteg: number;
  tunn: boolean;
  /** Förändring mot radens första ruta i procentenheter. null för den första rutan själv och för rutor utan underlag. */
  forandring: number | null;
  ton: RutaTon;
};
export type GreppRadVy = { id: string; etikett: string; sub: string | null; celler: (GreppRuta | null)[] };
export type GreppRutnat = { perioder: string[]; rader: GreppRadVy[] };

/** Tonen för en förändring i procentenheter: mer greppfel är orange/röd, mindre är grönt, runt noll är neutralt. Avrundat som det visas. */
export const forandringTon = (forandring: number): RutaTon => {
  const d = rundaMedTecken(forandring);
  return d >= GREPP_FORANDRING_ROD ? 'rod' : d >= GREPP_FORANDRING_ORANGE ? 'orange' : d <= -GREPP_FORANDRING_ORANGE ? 'gron' : 'neutral';
};

type Summa = { stammar: number; steg: number; still: number; summaAndel: number };
const tom = (): Summa => ({ stammar: 0, steg: 0, still: 0, summaAndel: 0 });
const lagg = (a: Summa, r: GreppRad) => { a.stammar += r.stammar; a.steg += r.steg; a.still += r.still; a.summaAndel += r.summaAndel; };

/** Trädslagen i underlaget i fast ordning: Gran, Tall, Björk, Övrigt löv, sedan resten efter antal stammar. */
const ORDNING = ['Gran', 'Tall', 'Björk', 'Övrigt löv'];
export const greppTradslag = (rader: GreppRad[]): string[] => {
  const antal = new Map<string, number>();
  for (const r of rader) { const t = tradslagLabel(r.tradslag); antal.set(t, (antal.get(t) ?? 0) + r.stammar); }
  const rang = (t: string) => { const i = ORDNING.indexOf(t); return i < 0 ? ORDNING.length : i; };
  return Array.from(antal).sort((a, b) => rang(a[0]) - rang(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
};

/**
 * Rutnätet: en rad per trädslag (alla grovlekar ihop) och sist en rad för de grova stammarna (300+, alla trädslag). Perioderna är de som har något underlag
 * i någon rad. Varje rads första ruta med tillräckligt underlag är referensen; resten färgas efter förändringen mot den.
 */
export function greppRutnat(rader: GreppRad[], steg: LagetSteg): GreppRutnat {
  const normerade = rader.map(r => ({ ...r, tradslag: tradslagLabel(r.tradslag), period: periodKey(r.manad, steg) }));
  const perioder = Array.from(new Set(normerade.map(r => r.period))).sort();
  const definitioner: { id: string; etikett: string; sub: string | null; med: (r: typeof normerade[number]) => boolean }[] = [
    ...greppTradslag(rader).map(t => ({ id: t, etikett: t, sub: null, med: (r: { tradslag: string }) => r.tradslag === t })),
    { id: GREPP_GROV_KLASS, etikett: `${GREPP_GROV_KLASS} mm`, sub: 'alla trädslag', med: (r: { klass: string }) => r.klass === GREPP_GROV_KLASS },
  ];
  return {
    perioder,
    rader: definitioner.map(def => {
      const perPeriod = new Map<string, Summa>();
      for (const r of normerade) if (def.med(r)) { const s = perPeriod.get(r.period) ?? tom(); lagg(s, r); perPeriod.set(r.period, s); }
      let referens: number | null = null;
      const celler = perioder.map((period): GreppRuta | null => {
        const s = perPeriod.get(period);
        if (!s || s.stammar === 0) return null;
        const pct = (100 * s.summaAndel) / s.stammar;
        const pctSteg = s.steg > 0 ? (100 * s.still) / s.steg : 0;
        const tunn = s.stammar < GREPP_MIN_STAMMAR;
        if (tunn) return { period, stammar: s.stammar, pct, pctSteg, tunn, forandring: null, ton: 'tunn' };
        if (referens == null) { referens = pct; return { period, stammar: s.stammar, pct, pctSteg, tunn, forandring: null, ton: 'neutral' }; }
        const forandring = pct - referens;
        return { period, stammar: s.stammar, pct, pctSteg, tunn, forandring, ton: forandringTon(forandring) };
      });
      return { id: def.id, etikett: def.etikett, sub: def.sub, celler };
    }).filter(rad => rad.celler.some(c => c != null)),
  };
}
