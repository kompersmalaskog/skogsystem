// TRAKTER — alla trakter som inte är avslutade, som i Planeringen (Martin 2026-11-06): Pågår · Planerade · Oplanerade.
// Ren logik; TrakterPanel ritar. Min plan är EN maskins kö (förarens); det här är ALLA trakter (för den som planerar).
//
//   Pågår      en maskin står där (positionen, samma som kartan) — eller status pågående. "Giant står här".
//   Planerade  status planerad. "Giant · nästa" / "Elefant 26 · som nr 2" (samma nummer som maskinens plan och kartans prickar);
//              ligger trakten i ingen kö: "Ingen maskin" — orange, det är dem som behöver planeras.
//   Oplanerade status oplanerad (planeraren har inte tryckt "Klar för maskin").
// GROT-trakter (avslutade, ris kvar) har sin egen lista och finns inte här. Namnen är de korta (./kortNamn), hela när trakten öppnas.

import { kortaNamn } from './kortNamn';
import { fasSteg, fasOrdning, type Steg } from '@/lib/objektVal';
import type { OversiktObjekt } from './oversikt-types';
import type { MaskinForslag } from './nasta-v2';

/** En rad — samma innehåll som Planeringens objektlista: namnet, stegen (fasSteg), traktanalysens rad (listRad) + vem som står där/vems kö. */
export interface TraktRad { id: string; namn: string; under: string | null; underOrange: boolean; steg: Steg[] | null; fynd: { text: string; kategori: string | null } | null }
export interface TrakterGrupper { pagar: TraktRad[]; planerade: TraktRad[]; oplanerade: TraktRad[]; antal: number; utanMaskin: number }

const sv = (a: string, b: string) => a.localeCompare(b, 'sv');
const lista = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} och ${n[n.length - 1]}`);

export function trakterGrupper(
  objekt: readonly OversiktObjekt[],
  forslag: ReadonlyMap<string, MaskinForslag>,
  maskinNamn: (maskinId: string) => string,
  fynd: (o: OversiktObjekt) => { text: string; kategori: string | null } | null,
): TrakterGrupper {
  const oppna = objekt.filter((o) => o.status !== 'avslutat');
  const kortLista = kortaNamn(oppna.map((x) => x.namn));
  const korta = new Map(oppna.map((o, i) => [o.id, kortLista[i]]));
  const harNu = new Map<string, string[]>();                         // objekt → maskiner som står där
  const iKo = new Map<string, { maskin: string; nr: number }[]>();    // objekt → (maskin, plats i dess kö)
  forslag.forEach((f, mid) => {
    if (f.nuObjekt) harNu.set(f.nuObjekt.id, [...(harNu.get(f.nuObjekt.id) ?? []), maskinNamn(mid)]);
    f.ko.filter((p) => p.kalla === 'ko').forEach((p, i) => iKo.set(p.objekt.id, [...(iKo.get(p.objekt.id) ?? []), { maskin: maskinNamn(mid), nr: i + 1 }]));
  });
  const rad = (o: OversiktObjekt, under: string | null, underOrange = false): TraktRad => ({ id: o.id, namn: korta.get(o.id) ?? o.namn, under, underOrange, steg: fasSteg(o as never), fynd: fynd(o) });

  const pagar: TraktRad[] = []; const planerade: (TraktRad & { sort: string })[] = []; const oplanerade: TraktRad[] = [];
  for (const o of oppna) {
    const nu = harNu.get(o.id);
    if (nu?.length || o.status === 'pagaende') {
      // Stegen säger hur långt den kommit ("✓ Skördat · Väntar på skotare"); raden under säger bara vem som står där.
      pagar.push({ ...rad(o, nu?.length ? `${lista([...nu].sort(sv))} står här` : null), ordning: fasOrdning(o as never) } as TraktRad & { ordning: number });
    } else if (o.status === 'planerad') {
      const ko = (iKo.get(o.id) ?? []).sort((a, b) => sv(a.maskin, b.maskin));
      planerade.push(ko.length
        ? { ...rad(o, ko.map((k) => `${k.maskin} · ${k.nr === 1 ? 'nästa' : `som nr ${k.nr}`}`).join(' · ')), sort: `0${ko[0].maskin}${String(ko[0].nr).padStart(3, '0')}` }
        : { ...rad(o, 'Ingen maskin', true), sort: `1${korta.get(o.id) ?? o.namn}` });
    } else if (o.status === 'oplanerad') {
      oplanerade.push(rad(o, null));
    }
  }
  pagar.sort((a, b) => ((a as TraktRad & { ordning?: number }).ordning ?? 9) - ((b as TraktRad & { ordning?: number }).ordning ?? 9) || sv(a.namn, b.namn));
  for (const r of pagar) delete (r as TraktRad & { ordning?: number }).ordning; oplanerade.sort((a, b) => sv(a.namn, b.namn));
  planerade.sort((a, b) => sv(a.sort, b.sort));
  const pl = planerade.map(({ sort: _s, ...r }) => r);
  return { pagar, planerade: pl, oplanerade, antal: pagar.length + pl.length + oplanerade.length, utanMaskin: pl.filter((r) => r.underOrange).length };
}
