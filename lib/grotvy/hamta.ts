// Hämtning för GROT-arket. Klienten injiceras: /oversikt-v2 skickar webbläsarens inloggade klient,
// förvärmningsskriptet skickar en service-klient — samma frågor, samma lista.
//
// Alla frågor sorteras på en unik nyckel (PostgREST ger annars rader i godtycklig ordning över
// sidgränsen) och sidas, så en lista som växer förbi 1 000 rader inte tyst kapas.

import type { GrotDim, GrotKoppling, GrotObjektRad, GrotProd, GrotRaw } from './lista';

const DIM_KOL = 'objekt_id, object_name, vo_nummer, areal_ha, latitude, longitude, huvudtyp, atgard, grot_anpassad, grot_hamtad, grot_senast, grot_markkrav, exkludera, risskotning, skordning_avslutad, skotning_avslutad';
const OBJEKT_KOL = 'id, vo_nummer, namn, typ, status, atgard, areal, lat, lng, dim_objekt_id';
const SIDA = 1000;
const IN_BIT = 60; // ids per .in() — håller URL:en kort

async function allaRader<T>(namn: string, fraga: () => any): Promise<T[]> {
  const ut: T[] = [];
  let fran = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await fraga().range(fran, fran + SIDA - 1);
    if (error) throw new Error(`Kunde inte läsa ${namn}: ${error.message}`);
    const sida = (data ?? []) as T[];
    ut.push(...sida);
    if (sida.length < SIDA) return ut;
    fran += SIDA;
  }
}

function bitar<T>(lista: T[], storlek: number): T[][] {
  const ut: T[][] = [];
  for (let i = 0; i < lista.length; i += storlek) ut.push(lista.slice(i, i + storlek));
  return ut;
}

function unika(lista: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  lista.forEach((v) => { if (v) set.add(v); });
  return Array.from(set);
}

/** Rådata för listan: GROT-anpassade trakter, länkade risjobb, skördad volym och planeringens objekt-rader. */
export async function hamtaGrotRaw(sb: any): Promise<GrotRaw> {
  const [dim, kopplingar] = await Promise.all([
    allaRader<GrotDim>('trakterna', () => sb.from('dim_objekt').select(DIM_KOL).eq('grot_anpassad', true).order('objekt_id')),
    allaRader<GrotKoppling>('kopplingarna till risjobben', () => sb.from('grot_koppling').select('risjobb_objekt_id, avverknings_objekt_id, auto_avbockad_datum').order('risjobb_objekt_id').order('avverknings_objekt_id')),
  ]);

  const traktIds = dim.map((d) => d.objekt_id);
  const risjobbIds = unika(kopplingar.map((k) => k.risjobb_objekt_id));

  const [risjobb, prod] = await Promise.all([
    risjobbIds.length
      ? allaRader<GrotDim>('risjobben', () => sb.from('dim_objekt').select(DIM_KOL).in('objekt_id', risjobbIds).order('objekt_id'))
      : Promise.resolve([] as GrotDim[]),
    Promise.all(bitar(traktIds, IN_BIT).map((ids) =>
      allaRader<GrotProd>('skördad volym', () => sb.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub, sista_datum').in('objekt_id', ids).order('objekt_id')),
    )).then((delar) => delar.reduce((a, b) => a.concat(b), [] as GrotProd[])),
  ]);

  // Planeringens objekt-rader för trakterna OCH risjobben: via FK (dim_objekt_id) och via vo_nummer
  // (dimmens vo_nummer eller dess objekt_id, som för numeriska nycklar är samma sak).
  const dimAlla = dim.concat(risjobb);
  const dimIds = unika(dimAlla.map((d) => d.objekt_id));
  const voNycklar = unika(dimAlla.map((d) => d.vo_nummer).concat(dimAlla.map((d) => d.objekt_id)));
  const objektDelar = await Promise.all([
    ...bitar(dimIds, IN_BIT).map((ids) => allaRader<GrotObjektRad>('objekten (FK)', () => sb.from('objekt').select(OBJEKT_KOL).in('dim_objekt_id', ids).order('id'))),
    ...bitar(voNycklar, IN_BIT).map((ids) => allaRader<GrotObjektRad>('objekten (VO)', () => sb.from('objekt').select(OBJEKT_KOL).in('vo_nummer', ids).order('id'))),
  ]);
  const objektPerId = new Map<string, GrotObjektRad>();
  objektDelar.forEach((del) => del.forEach((o) => objektPerId.set(o.id, o)));

  return { dim, risjobb, kopplingar, prod, objekt: Array.from(objektPerId.values()) };
}
