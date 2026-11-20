// Redigeringens objektlista (Martin 2026-10-23: "lägg filerna efter månader och gallring slutavverkning"). Ren logik.
//
// Ett objekt står på EN plats: Pågår (skördningen inte klar) · Skotning kvar (skördat klart, skotningen inte) · den månad
// det blev klart (sista avslutsdatumet) · Utan datum (klart enligt reglerna men inget datum satt). Typväljaren (Alla /
// Slutavverkning / Gallring / GROT) och sökningen gäller alla platser. Talet till höger är skördad volym (skotad när
// objektet inte har någon skördare).

import { kortDatum } from './objektVy';

export type TypFilter = 'alla' | 'Slutavverkning' | 'Gallring' | 'Grot';

export interface ListGrupp {
  nyckel: string;
  namn: string | null;
  vo: string | null;
  typ: string | null;
  bolag: string | null;
  skogsagare?: string | null;
  special?: boolean;
  /** arPagaende: något av VÅRA maskinslag är inte klart. */
  pagaende: boolean;
  /** Skördningen är klar (datum) eller inte vår (extern skördning, risjobb …). */
  skordningKlar: boolean;
  skordningAvslutad?: string | null;
  skotningAvslutad?: string | null;
  skordat: number;
  skotat: number;
  senasteData?: string | null;
  /** Maskinen föreslår att något är klart. */
  avslutForslag?: boolean;
}

export interface ListRad {
  nyckel: string;
  namn: string;
  under: string;
  hoger: string | null;
  special: boolean;
  forslag: boolean;
}

export interface Manad {
  nyckel: string; // "2026-10"
  rubrik: string; // "Oktober 2026"
  rader: ListRad[];
}

export interface Lista {
  pagar: ListRad[];
  skotningKvar: ListRad[];
  manader: Manad[];
  utanDatum: ListRad[];
  /** Antal per typ (efter sökning) — till typväljaren. */
  antal: Record<TypFilter, number>;
  /** Antal träffar totalt efter typ och sökning. */
  traffar: number;
}

const MANAD = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];
const m3 = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} m³`;
const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFC');

/** Alla ord i sökningen måste finnas i namn, VO, bolag eller markägare ("vida mölleryd"). */
export function matcharSok(g: ListGrupp, sok: string): boolean {
  const ord = norm(sok).split(/\s+/).filter(Boolean);
  if (ord.length === 0) return true;
  const hos = [g.namn, g.vo, g.bolag, g.skogsagare].map(norm).join(' ');
  return ord.every(o => hos.includes(o));
}

export function typAv(g: ListGrupp): Exclude<TypFilter, 'alla'> | null {
  const t = norm(g.typ);
  if (t === 'slutavverkning') return 'Slutavverkning';
  if (t === 'gallring') return 'Gallring';
  if (t === 'grot') return 'Grot';
  return null;
}

function klartDatum(g: ListGrupp): string | null {
  const d = [g.skordningAvslutad, g.skotningAvslutad].filter(Boolean).map(x => String(x).slice(0, 10)).sort();
  return d.length ? d[d.length - 1] : null;
}

function volym(g: ListGrupp): string | null {
  if (g.skordat > 0) return m3(g.skordat);
  if (g.skotat > 0) return m3(g.skotat);
  return null;
}

const namnAv = (g: ListGrupp) => (g.namn ?? '').trim() || (g.vo ? `VO ${g.vo}` : 'Namnlöst objekt');
const med = (...delar: (string | null | undefined)[]) => delar.filter(d => d && String(d).trim()).join(' · ');

export function byggLista(grupper: ListGrupp[], val: { typ: TypFilter; sok: string }): Lista {
  const efterSok = grupper.filter(g => matcharSok(g, val.sok));
  const antal: Record<TypFilter, number> = { alla: efterSok.length, Slutavverkning: 0, Gallring: 0, Grot: 0 };
  for (const g of efterSok) { const t = typAv(g); if (t) antal[t]++; }
  const synliga = val.typ === 'alla' ? efterSok : efterSok.filter(g => typAv(g) === val.typ);

  const pagar: (ListRad & { sort: string })[] = [];
  const skotningKvar: (ListRad & { sort: string })[] = [];
  const perManad = new Map<string, (ListRad & { sort: string })[]>();
  const utanDatum: ListRad[] = [];

  for (const g of synliga) {
    const bas = { nyckel: g.nyckel, namn: namnAv(g), special: g.special === true, forslag: g.avslutForslag === true };
    if (g.pagaende && !g.skordningKlar) {
      const senast = g.senasteData ? `senast ${kortDatum(g.senasteData)}` : 'ingen fil än';
      pagar.push({ ...bas, under: med(g.avslutForslag ? 'Klar?' : null, g.bolag, senast), hoger: volym(g), sort: g.senasteData ?? '' });
    } else if (g.pagaende) {
      const kvar = Math.max(0, g.skordat - g.skotat);
      skotningKvar.push({ ...bas, under: med(g.avslutForslag ? 'Klar?' : null, kvar > 0 ? `${m3(kvar)} kvar på backen` : 'allt skotat, inte markerad klar'), hoger: volym(g), sort: g.senasteData ?? '' });
    } else {
      const d = klartDatum(g);
      if (!d) { utanDatum.push({ ...bas, under: med(g.bolag, 'klart utan datum'), hoger: volym(g) }); continue; }
      const nyckel = d.slice(0, 7);
      const lista = perManad.get(nyckel) ?? [];
      lista.push({ ...bas, under: med(`Klar ${kortDatum(d)}`, g.bolag), hoger: volym(g), sort: d });
      perManad.set(nyckel, lista);
    }
  }

  const nyastForst = <T extends { sort: string }>(a: T, b: T) => b.sort.localeCompare(a.sort);
  const utanSort = ({ sort, ...r }: ListRad & { sort: string }): ListRad => { void sort; return r; };
  const manader: Manad[] = [...perManad.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([nyckel, rader]) => ({
      nyckel,
      rubrik: `${MANAD[Number(nyckel.slice(5, 7)) - 1]} ${nyckel.slice(0, 4)}`,
      rader: rader.sort(nyastForst).map(utanSort),
    }));

  return {
    pagar: pagar.sort(nyastForst).map(utanSort),
    skotningKvar: skotningKvar.sort(nyastForst).map(utanSort),
    manader,
    utanDatum: utanDatum.sort((a, b) => a.namn.localeCompare(b.namn, 'sv')),
    antal,
    traffar: synliga.length,
  };
}
