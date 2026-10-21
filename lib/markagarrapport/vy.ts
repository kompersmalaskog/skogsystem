// Markägarrapportens vymodell — ALL text, alla tal och alla avrundningar. Sidan ritar bara.
//
// Rapporten ska gå att förstå för ett barn (Martin 2026-10-21): varje del är en fråga i vanliga ord,
// svaret står först, och facktermerna (sortimentsnamn, diameterklasser, avkap) ligger bakom "Mer".
// Skissen: canvasen "Markägarrapport – förslag". Facit: Husjönäs (objekt 11124938) i vy.test.ts.

import { SORTIMENTFARG } from '@/lib/design/tokens';
import { tradslagStil } from '@/lib/tradslag';
import type { MarkagarRapport } from './types';

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** Heltal med svenska tusentalsavgränsare (vanligt mellanslag, så det går att söka och testa på). */
export function heltal(n: number): string {
  const r = Math.round(n);
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (r < 0 ? '−' : '') + s;
}

/** "avverkad i februari 2026" ur ett ISO-datum (YYYY-MM-DD…). Ogiltigt eller saknat → null. */
export function avverkadText(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const manad = Number(m[2]);
  if (manad < 1 || manad > 12) return null;
  return `avverkad i ${MANADER[manad - 1]} ${m[1]}`;
}

/** Heltalsprocent som alltid summerar till 100 (största-rest-metoden). Tom eller nollsumma → nollor. */
export function procentSomSummerar(varden: number[]): number[] {
  const summa = varden.reduce((s, v) => s + Math.max(0, v), 0);
  if (summa <= 0) return varden.map(() => 0);
  const exakta = varden.map(v => (Math.max(0, v) / summa) * 100);
  const golv = exakta.map(Math.floor);
  let kvar = 100 - golv.reduce((s, v) => s + v, 0);
  const ordning = exakta
    .map((v, i) => ({ i, rest: v - golv[i] }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of ordning) {
    if (kvar <= 0) break;
    golv[i] += 1;
    kvar -= 1;
  }
  return golv;
}

/**
 * Andelen friska som ett enkelt bråk: minsta nämnare av 2, 3, 4, 5 och 10 där bråket ligger inom 3 procentenheter
 * (bara bråk man ser framför sig — "9 av 10", aldrig "7 av 8").
 * Både friska och rötade måste få minst ett träd (annars säger bilden "alla friska" fast några var rötade).
 * null = inget enkelt bråk passar; sidan skriver då procent i stället.
 */
export function enkeltBrak(andelFriska: number): { friska: number; av: number } | null {
  if (!(andelFriska > 0 && andelFriska < 1)) return null;
  for (const av of [2, 3, 4, 5, 10]) {
    const friska = Math.round(andelFriska * av);
    if (friska <= 0 || friska >= av) continue;
    if (Math.abs(friska / av - andelFriska) <= 0.03) return { friska, av };
  }
  return null;
}

export type Stapeldel = { nyckel: string; andel: number; farg: string };
export type VyRad = {
  nyckel: string;
  namn: string;
  under?: string;
  hoger: string;
  hogerUnder?: string;
  /** Prickens färg; kontur bara där fyllningen inte syns mot kortet. */
  farg?: string;
  kontur?: string | null;
};

export type RapportVy = {
  /** Avverkningens namn och skogsägaren — PDF:ens huvud ("Till <skogsägare>"). */
  namn: string;
  skogsagare: string | null;
  /** Filnamn utan ändelse för PDF:en ("markagarrapport-husjonas-1-18-je-g-lrk-25"). */
  filnamn: string;
  huvud: string;
  /** "Virket från skogen är värt" — eller null när inget pris fanns (då är volymen svaret). */
  vardeFraga: string | null;
  svar: string;
  underSvar: string;
  virket: { stapel: Stapeldel[]; rader: VyRad[]; not: string } | null;
  trad: { stapel: Stapeldel[]; rader: VyRad[] } | null;
  granar: GranVy | null;
  mer: {
    sortiment: VyRad[];
    dimensioner: { namn: string; rader: VyRad[] }[];
  };
};

export type GranVy = {
  /** null = inget enkelt bråk; då ritas inga små granar. */
  bild: { friska: number; rotade: number } | null;
  rubrik: string;
  text: string | null;
  rader: VyRad[];
  not: string | null;
};

// Sortimentgrupperna i ordning mörkast (mest värt) först. aggregate.ts ger Timmer/Klentimmer/Kubb/Massa/Energi/Övrigt.
const VIRKE: { nyckel: keyof typeof SORTIMENTFARG; namn: string; forklaring: string; grupper: string[] }[] = [
  { nyckel: 'timmer', namn: 'Timmer', forklaring: 'blir plankor och brädor', grupper: ['Timmer', 'Klentimmer'] },
  { nyckel: 'kubb', namn: 'Kubb', forklaring: 'blir korta brädor', grupper: ['Kubb'] },
  { nyckel: 'massa', namn: 'Massaved', forklaring: 'blir papper', grupper: ['Massa'] },
  { nyckel: 'ovrigt', namn: 'Övrigt', forklaring: 'blir ved och flis', grupper: ['Energi', 'Övrigt'] },
];

function byggVirket(d: MarkagarRapport): RapportVy['virket'] {
  const delar = VIRKE
    .map(v => ({
      ...v,
      volym: d.fordelning.filter(f => v.grupper.includes(f.grupp)).reduce((s, f) => s + f.volym_m3sub, 0),
    }))
    .filter(v => Math.round(v.volym) > 0);
  if (delar.length === 0) return null;
  const pct = procentSomSummerar(delar.map(v => v.volym));
  return {
    stapel: delar.map(v => ({ nyckel: v.nyckel, andel: v.volym, farg: SORTIMENTFARG[v.nyckel] })),
    rader: delar.map((v, i) => ({
      nyckel: v.nyckel,
      namn: v.namn,
      under: v.forklaring,
      hoger: `${heltal(v.volym)} m³`,
      hogerUnder: `${pct[i]} %`,
      farg: SORTIMENTFARG[v.nyckel],
    })),
    not: 'Ju mörkare färg, desto mer värt. Timmer är mest värt.',
  };
}

/** Rapportens trädslagsnamn ("Övr löv") till appens ("Övrigt löv"), så att färgen kommer ur TRADSLAG_STIL. */
function appensTradslag(namn: string): string {
  return namn === 'Övr löv' ? 'Övrigt löv' : namn;
}

function byggTrad(d: MarkagarRapport): RapportVy['trad'] {
  type Grupp = { namn: string; stilNamn: string; stammar: number; dbhSumma: number; dbhVikt: number };
  const grupper = new Map<string, Grupp>();
  const harBjork = d.tradslag.some(t => t.namn === 'Björk');
  const harLov = d.tradslag.some(t => appensTradslag(t.namn) === 'Övrigt löv');
  for (const t of d.tradslag) {
    const app = appensTradslag(t.namn);
    const lov = app === 'Björk' || app === 'Övrigt löv';
    const nyckel = lov ? 'löv' : app;
    const namn = lov
      ? (harBjork && harLov ? 'Björk och annat löv' : harBjork ? 'Björk' : 'Annat löv')
      : app;
    const stilNamn = lov ? (harBjork ? 'Björk' : 'Övrigt löv') : app;
    const g = grupper.get(nyckel) ?? { namn, stilNamn, stammar: 0, dbhSumma: 0, dbhVikt: 0 };
    g.stammar += t.stammar;
    if (t.medeldiameter_cm != null) {
      g.dbhSumma += t.medeldiameter_cm * t.stammar;
      g.dbhVikt += t.stammar;
    }
    grupper.set(nyckel, g);
  }
  const lista = [...grupper.values()].filter(g => g.stammar > 0).sort((a, b) => b.stammar - a.stammar);
  if (lista.length === 0) return null;
  return {
    stapel: lista.map((g, i) => ({ nyckel: g.namn, andel: g.stammar, farg: tradslagStil(g.stilNamn, i).fyll })),
    rader: lista.map((g, i) => {
      const stil = tradslagStil(g.stilNamn, i);
      return {
        nyckel: g.namn,
        namn: g.namn,
        under: g.dbhVikt > 0 ? `${heltal(g.dbhSumma / g.dbhVikt)} cm tjock i snitt` : undefined,
        hoger: `${heltal(g.stammar)} träd`,
        farg: stil.fyll,
        // Mot det mörka kortet syns vit björk, men en tunn grå kant skiljer den från bakgrundens vita text.
        kontur: stil.kontur,
      };
    }),
  };
}

/** Jämförelsen görs på den AVRUNDADE procenten — den som läsaren ser. */
export function jamforRota(rotProcent: number): string {
  const p = Math.round(rotProcent);
  if (p < 15) return 'Det är mindre än vanligt i Sverige.';
  if (p > 25) return 'Det är mer än vanligt i Sverige.';
  return 'Det är vanligt i Sverige.';
}

function byggGranar(d: MarkagarRapport): GranVy | null {
  const r = d.rotrota;
  if (!(r.gran_stammar > 0)) return null;
  const a = d.avkap_skicklighet;
  const rader: VyRad[] = [];
  if (Math.round(r.vardeforlust_kr) !== 0) {
    rader.push({ nyckel: 'kostade', namn: 'Rötan kostade', under: 'ruttet trä blir billigare virke', hoger: `${heltal(r.vardeforlust_kr)} kr` });
  }
  if (a.totalt > 0 && Math.round(a.raddat_kr) > 0) {
    rader.push({ nyckel: 'sparade', namn: 'Föraren sparade', under: 'sågade bort den ruttna biten', hoger: `+${heltal(a.raddat_kr)} kr` });
  }

  if (r.gran_med_rot <= 0) {
    return { bild: null, rubrik: 'Alla granar var friska', text: null, rader: [], not: null };
  }
  const rotProcent = (r.gran_med_rot / r.gran_stammar) * 100;
  const brak = enkeltBrak(1 - r.gran_med_rot / r.gran_stammar);
  const jamfor = jamforRota(rotProcent);
  const not = 'Fråga en skogsrådgivare vilka träd som passar att plantera nu.';
  if (brak) {
    const rotade = brak.av - brak.friska;
    return {
      bild: { friska: brak.friska, rotade },
      rubrik: `${brak.friska} av ${brak.av} granar var friska`,
      text: `${rotade} av ${brak.av} var rutten i roten. ${jamfor}`,
      rader,
      not,
    };
  }
  const friskaPct = 100 - Math.round(rotProcent);
  return {
    bild: null,
    rubrik: `${friskaPct} % av granarna var friska`,
    text: `${Math.round(rotProcent)} % var rutten i roten. ${jamfor}`,
    rader,
    not,
  };
}

function byggMer(d: MarkagarRapport): RapportVy['mer'] {
  return {
    sortiment: d.sortiment.map(s => ({
      nyckel: s.sortiment_id,
      namn: s.namn || s.sortiment_id,
      under: s.tradslag ? s.tradslag.charAt(0) + s.tradslag.slice(1).toLowerCase() : undefined,
      hoger: `${heltal(s.volym_m3sub)} m³`,
      hogerUnder: `${heltal(s.varde_kr)} kr`,
    })),
    dimensioner: d.timmer_top2.map(t => ({
      namn: t.sortiment_namn,
      rader: t.dimensioner.map(dim => ({
        nyckel: dim.dia_klass,
        namn: `Från ${heltal(dim.dia_min_mm / 10)} cm`,
        hoger: `${heltal(dim.volym_m3sub)} m³`,
        hogerUnder: dim.pris_per_m3 != null ? `${heltal(dim.pris_per_m3)} kr/m³` : 'pris saknas',
      })),
    })),
  };
}

/** "Husjönäs 1:18 JE-G" → "husjonas-1-18-je-g" (filnamn utan å, ä, ö och skiljetecken). */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function byggRapportVy(d: MarkagarRapport): RapportVy {
  const namn = d.objekt.namn ?? d.objekt.objekt_id;
  const avverkad = avverkadText(d.objekt.forsta_datum);
  const o = d.oversikt;
  const harVarde = Math.round(o.virkesvarde_kr) > 0;
  const trad = `${heltal(o.stammar)} träd`;
  return {
    namn,
    skogsagare: d.objekt.skogsagare?.trim() || null,
    filnamn: `markagarrapport-${slug(namn) || d.objekt.objekt_id}`,
    huvud: avverkad ? `${namn} · ${avverkad}` : namn,
    vardeFraga: harVarde ? 'Virket från skogen är värt' : null,
    svar: harVarde ? `${heltal(o.virkesvarde_kr)} kr` : `${heltal(o.volym_m3sub)} kubikmeter virke`,
    underSvar: harVarde
      ? `${heltal(o.volym_m3sub)} kubikmeter virke från ${trad}`
      : `från ${trad} · värdet saknas, det finns ingen prislista för virket`,
    virket: byggVirket(d),
    trad: byggTrad(d),
    granar: byggGranar(d),
    mer: byggMer(d),
  };
}
