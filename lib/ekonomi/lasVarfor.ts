// Läsningen bakom "Varför" i Ekonomi › Ackord. Tillägg till jämförelsen:
// ingenting här får fälla vyn eller ändra ett tal — går en del inte att läsa
// är den null och raden visas inte (aldrig 0).
//
//  - lasCykler: det körda skotningsavståndet per skog, EN fråga för hela
//    listan. Samma SQL-funktion och samma sammanställning som fakturans
//    granskning (lib/faktura/lasAppLass + lassCykel) — samma 739 m.
//  - lasSkogMatt: när en skog öppnas — lassen (snittlass, breddat), tiden per
//    lass ur hyttspåret och flyttarna hit.

import { supabase } from '@/lib/supabase';
import { lasLassCykel } from '@/lib/faktura/lasAppLass';
import { sammanstallCykel, type CykelSammanstallning, type LassCykel } from '@/lib/faktura/lassCykel';
import { lassSnitt, tidPerLass, tidSnitt, type LassSnitt, type TidLass, type TidPunkt, type TidSnitt } from './lassTider';
import type { ObjektRad } from './objektJamforelse';

/** Skogens nummer: maskinobjektets id och VO-numret (lassen bär VO-numret). */
export function skogNummer(o: Pick<ObjektRad, 'objekt_id' | 'detalj'>): string[] {
  return Array.from(new Set([o.objekt_id, o.detalj?.voNummer].filter((x): x is string => !!x)));
}

/** Cykeln per skog (objekt_id). En skog utan app-lass finns inte i svaret. */
export async function lasCykler(skogar: ObjektRad[]): Promise<Map<string, CykelSammanstallning>> {
  const tillSkog = new Map<string, string>();
  for (const o of skogar) for (const n of skogNummer(o)) tillSkog.set(n, o.objekt_id);
  const svar = await lasLassCykel(supabase, [...tillSkog.keys()]);
  const perSkog = new Map<string, LassCykel[]>();
  for (const r of svar.rader) {
    const skog = r.voNummer ? tillSkog.get(r.voNummer) : undefined;
    if (!skog) continue;
    const arr = perSkog.get(skog) ?? [];
    arr.push(r);
    perSkog.set(skog, arr);
  }
  const ut = new Map<string, CykelSammanstallning>();
  for (const [skog, rader] of perSkog) ut.set(skog, sammanstallCykel(rader));
  return ut;
}

export type SkogMatt = { tider: TidSnitt | null; lass: LassSnitt | null; flyttar: number | null };

const bitar = <T,>(arr: T[], n: number): T[][] => {
  const ut: T[][] = [];
  for (let i = 0; i < arr.length; i += n) ut.push(arr.slice(i, i + n));
  return ut;
};

async function lasLassOchTider(nummer: string[]): Promise<{ tider: TidSnitt | null; lass: LassSnitt | null }> {
  const { data: lassRader, error } = await supabase.from('skotar_lass').select('*').in('vo_nummer', nummer);
  if (error) throw new Error(error.message);
  // Bara Klar räknas — samma regel som raknasSomSkotat och skotar_lass_cykel.
  const raknas = (lassRader || []).filter((l: any) => l.status === 'bekraftat' && l.bekraftad_av !== 'auto');
  if (!raknas.length) return { tider: null, lass: null };

  const ids = raknas.map((l: any) => String(l.id));
  const delar: any[] = [];
  const sortiment: any[] = [];
  for (const bit of bitar(ids, 100)) {
    const [d, s] = await Promise.all([
      supabase.from('skotar_lass_del').select('lass_id, lossad_tid, lat, lng').in('lass_id', bit),
      supabase.from('skotar_lass_sortiment').select('lass_id, m3_forare').in('lass_id', bit),
    ]);
    if (d.error) throw new Error(d.error.message);
    if (s.error) throw new Error(s.error.message);
    delar.push(...(d.data || []));
    sortiment.push(...(s.data || []));
  }

  const lass: TidLass[] = raknas.map((l: any) => {
    const mina = delar.filter(d => d.lass_id === l.id);
    const tider = mina.map(d => Date.parse(d.lossad_tid)).filter(Number.isFinite);
    const pos = mina.filter(d => d.lat != null && d.lng != null);
    const snitt = (f: (d: any) => number) => pos.reduce((s, d) => s + f(d), 0) / pos.length;
    return {
      id: String(l.id),
      maskinId: String(l.maskin_id ?? ''),
      losstidMs: tider.length ? Math.max(...tider) : null,
      lat: pos.length ? snitt(d => Number(d.lat)) : null,
      lng: pos.length ? snitt(d => Number(d.lng)) : null,
      volym: sortiment.filter(s => s.lass_id === l.id).reduce((s, r) => s + (Number(r.m3_forare) || 0), 0),
      breddat: l.breddat === true,
    };
  });

  // Tiden per lass kräver hyttspåret. Går det inte att läsa finns snittlasset
  // ändå — tiderna uteblir, de blir aldrig noll.
  let tider: TidSnitt | null = null;
  try {
    const objektIds = Array.from(new Set(raknas.map((l: any) => l.objekt_id).filter(Boolean)));
    if (objektIds.length) {
      const { data: spar, error: sparFel } = await supabase.from('hyttspar')
        .select('maskin_id, points').eq('roll', 'skotare').in('objekt_id', objektIds);
      if (sparFel) throw new Error(sparFel.message);
      const punkter: TidPunkt[] = [];
      for (const rad of (spar || [])) {
        for (const p of (Array.isArray(rad.points) ? rad.points : [])) {
          punkter.push({ maskinId: String(rad.maskin_id ?? ''), tidMs: Date.parse(p?.tid), lat: Number(p?.lat), lng: Number(p?.lng) });
        }
      }
      tider = tidSnitt(tidPerLass(lass, punkter));
    }
  } catch (e) {
    console.error('Ackord · varför: körspåret kunde inte läsas', e);
  }
  return { tider, lass: lassSnitt(lass) };
}

async function lasFlyttar(nummer: string[]): Promise<number> {
  const { data: objekt, error } = await supabase.from('objekt').select('id').in('vo_nummer', nummer);
  if (error) throw new Error(error.message);
  const ids = (objekt || []).map((o: any) => o.id);
  // Skogen finns inte som planeringsobjekt: då kan ingen flytt peka hit, och
  // det är inte samma sak som "ingen flytt" — kasta så raden säger "kunde inte läsas".
  if (!ids.length) throw new Error('skogen saknar planeringsobjekt');
  const { data, error: fel } = await supabase.from('maskin_flytt')
    .select('id, avbruten, sluttid').in('till_objekt_id', ids);
  if (fel) throw new Error(fel.message);
  return (data || []).filter((f: any) => f.avbruten !== true && f.sluttid != null).length;
}

/** Mätningarna för EN skog. Delarna faller var för sig. */
export async function lasSkogMatt(o: ObjektRad): Promise<SkogMatt> {
  const nummer = skogNummer(o);
  const [lt, flyttar] = await Promise.all([
    o.egenSkotning ? Promise.resolve({ tider: null, lass: null }) : lasLassOchTider(nummer).catch(e => {
      console.error('Ackord · varför: lassen kunde inte läsas', e);
      return { tider: null, lass: null };
    }),
    lasFlyttar(nummer).catch(e => {
      console.error('Ackord · varför: flyttarna kunde inte läsas', e);
      return null;
    }),
  ]);
  return { ...lt, flyttar };
}
