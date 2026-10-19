'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { DIM_MASKIN_NAMN_KOLUMNER, maskinSlag, maskinVisningsnamn } from '@/lib/maskinNamn';
import { optiTidUtcMs } from '@/lib/optiTid';
import { senastePunkt, valjSenasteSpar, type HyttsparIndexRad, type ObjektTilldelning } from '@/lib/maskinPosition';
import { hamtaSenastePlatser, rimligGpsPunkt, type PlatsForslag } from '@/app/maskinflytt/senastePlats';
import { DEST_OBJEKT_FALT, type DestObjekt, type DestPlats } from './destinationer';
import { valjMaskinPos, type KandidatPos, type MaskinMedPos, type Punkt } from './maskinPos';
import { getGps } from './gps';
import type { Forare } from './dagSkriv';

/** Bilens position äldre än en timme säger inget om var den står nu — då sorteras listan på telefonens GPS i stället (utan att det skrivs ut). */
export const BIL_MAX_ALDER_MS = 3600 * 1000;

export interface Utgangspunkt { pos: Punkt; kalla: 'bil' | 'telefon'; tidMs: number | null; gammal: boolean }

export interface HamtaData {
  forare: Forare | null;
  vin: string | null;
  /** Hemmabasen (LBC) — målet för "Vägen hem". null = saknas, då går det inte att navigera dit. */
  bas: Punkt | null;
  maskiner: MaskinMedPos[];
  fran: Utgangspunkt | null;
  objekt: DestObjekt[];
  platser: DestPlats[];
  /** Någon positionsläsning föll — maskiner utan plats kan bero på det, och listan säger det. */
  posFel: boolean;
}

export type HamtaLage = { lage: 'laddar' } | { lage: 'fel' } | { lage: 'klar'; data: HamtaData };

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Maskinens senaste GPS-punkt ur detalj_gps_spar (index på maskin_id, tidpunkt). Tiden räknas om till ett verkligt ögonblick. */
async function senastGpsSpar(maskinId: string): Promise<KandidatPos | null> {
  const { data, error } = await supabase.from('detalj_gps_spar')
    .select('latitude, longitude, tidpunkt, tid_ar_utc')
    .eq('maskin_id', maskinId).order('tidpunkt', { ascending: false }).limit(1);
  if (error) throw error;
  const r = data?.[0];
  const lat = num(r?.latitude), lng = num(r?.longitude);
  if (!r || lat == null || lng == null) return null;
  return { lat, lng, tidMs: optiTidUtcMs(r.tidpunkt, r.tid_ar_utc), kalla: 'gps' };
}

/** Maskinens senaste punkt ur hyttspåret (appen på maskindatorn). Spårraderna saknar ofta maskin_id — objektets tilldelning avgör. */
async function senastHyttspar(maskinId: string, objekt: readonly ObjektTilldelning[]): Promise<KandidatPos | null> {
  if (!/^[A-Za-z0-9_.-]+$/.test(maskinId)) return null;
  const mina = objekt.filter(o => o.skordare_maskin_id === maskinId || o.skotare_maskin_id === maskinId).map(o => o.id);
  const filter = mina.length ? `maskin_id.eq.${maskinId},objekt_id.in.(${mina.join(',')})` : `maskin_id.eq.${maskinId}`;
  const idx = await supabase.from('hyttspar').select('id,objekt_id,roll,datum,maskin_id,antal_punkter,uppdaterad_at')
    .or(filter).gt('antal_punkter', 0).order('datum', { ascending: false }).order('uppdaterad_at', { ascending: false }).limit(30);
  if (idx.error) throw idx.error;
  const rad = valjSenasteSpar({ maskinId, index: (idx.data ?? []) as HyttsparIndexRad[], objekt: [...objekt] });
  if (!rad) return null;
  const pts = await supabase.from('hyttspar').select('points').eq('id', rad.id).maybeSingle();
  if (pts.error) throw pts.error;
  const p = senastePunkt(pts.data?.points);
  if (!p) return null;
  const tid = Date.parse(p.tid ?? '') || Date.parse(rad.uppdaterad_at ?? '');
  return { lat: p.lat, lng: p.lng, tidMs: Number.isFinite(tid) ? tid : null, kalla: 'gps' };
}

function platsKandidat(f: PlatsForslag | undefined): KandidatPos | null {
  if (!f?.koordinat) return null;
  const tid = f.tidpunkt ? (f.tidpunkt.length <= 10 ? Date.parse(`${f.tidpunkt}T12:00:00`) : Date.parse(f.tidpunkt)) : NaN;
  return { lat: f.koordinat.lat, lng: f.koordinat.lng, tidMs: Number.isFinite(tid) ? tid : null, kalla: 'plats', namn: f.kalla === 'position' ? null : f.namn, objektId: f.objektId, platsId: f.platsId, osaker: !!f.osaker };
}

/** Bilens senaste loggade position (Scania). Bilen är utgångspunkt för avstånden; telefonen är reserv. */
async function bilensPosition(vin: string | null): Promise<{ pos: Punkt; tidMs: number | null } | null> {
  if (!vin) return null;
  const { data, error } = await supabase.from('lastbil_logg').select('lat, lng, tidpunkt').eq('vin', vin).order('tidpunkt', { ascending: false }).limit(1);
  if (error) throw error;
  const p = data?.[0];
  const lat = num(p?.lat), lng = num(p?.lng);
  if (!p || lat == null || lng == null || !rimligGpsPunkt(lat, lng)) return null;
  const t = Date.parse(p.tidpunkt);
  return { pos: { lat, lng }, tidMs: Number.isFinite(t) ? t : null };
}

/**
 * Allt Hämta-flödet behöver, läst en gång när flödet öppnas: förare, aktiv bil, aktiva maskiner med sin position, trakter och
 * platser. En positionsläsning som faller gör inte listan tom — maskinen får "Plats saknas" och `posFel` säger varför.
 */
export function useHamtaData(aktiv: boolean) {
  const [lage, setLage] = useState<HamtaLage>({ lage: 'laddar' });
  const [omforsok, setOmforsok] = useState(0);

  useEffect(() => {
    if (!aktiv) return;
    let avbruten = false;
    setLage({ lage: 'laddar' });
    (async () => {
      try {
        const idag = new Date().toISOString().slice(0, 10);
        const [{ data: { user } }, mRes, oRes, pRes, bilRes] = await Promise.all([
          supabase.auth.getUser(),
          medAbortRetry(() => supabase.from('dim_maskin').select(`${DIM_MASKIN_NAMN_KOLUMNER}, aktiv_till`).order('maskin_typ').order('maskin_id') as any),
          medAbortRetry(() => supabase.from('objekt').select(DEST_OBJEKT_FALT).order('namn') as any),
          medAbortRetry(() => supabase.from('flyttplats').select('id, namn, typ, lat, lng').eq('aktiv', true).order('namn') as any),
          medAbortRetry(() => supabase.from('lastbil').select('vin, hemmabas_lat, hemmabas_lng').eq('aktiv', true).limit(1).maybeSingle() as any),
        ]);
        if (mRes.error || oRes.error) throw (mRes.error ?? oRes.error);
        let forare: Forare | null = null;
        if (user?.id) {
          const f = await supabase.from('medarbetare').select('id, namn, hem_lat, hem_lng').eq('user_id', user.id).maybeSingle();
          forare = (f.data as Forare | null) ?? null;
        }
        const vin: string | null = (bilRes.data as any)?.vin ?? null;
        const bLat = num((bilRes.data as any)?.hemmabas_lat), bLng = num((bilRes.data as any)?.hemmabas_lng);
        const bas: Punkt | null = bLat != null && bLng != null ? { lat: bLat, lng: bLng } : null;
        const objekt = (oRes.data ?? []) as DestObjekt[];
        const platser = ((pRes.data ?? []) as DestPlats[]);
        const aktiva = ((mRes.data ?? []) as any[]).filter(m => !m.aktiv_till || m.aktiv_till >= idag);
        const ids = aktiva.map(m => m.maskin_id as string);

        let posFel = false;
        const markera = <T,>(p: Promise<T>): Promise<T | null> => p.catch(e => { console.error('[lastbil] hämta: positionsläsning', e); posFel = true; return null; });
        const [sistaPlatser, bil, telefon, ...perMaskin] = await Promise.all([
          markera(hamtaSenastePlatser(ids).then(r => { if (r.fel) { posFel = true; console.error('[lastbil] hämta:', r.fel); } return r.platser; })),
          markera(bilensPosition(vin)),
          getGps(false).catch(() => null),
          ...aktiva.map(m => Promise.all([
            markera(senastGpsSpar(m.maskin_id)),
            markera(senastHyttspar(m.maskin_id, objekt)),
          ])),
        ]);
        if (avbruten) return;

        const nuMs = Date.now();
        const maskiner: MaskinMedPos[] = aktiva.map((m, i) => ({
          maskin_id: m.maskin_id,
          namn: maskinVisningsnamn(m),
          maskin_typ: m.maskin_typ ?? null,
          slag: maskinSlag(m.maskin_typ),
          pos: valjMaskinPos([perMaskin[i][0], perMaskin[i][1], platsKandidat(sistaPlatser?.get(m.maskin_id))], nuMs),
        }));

        const bilFarsk = bil && bil.tidMs != null && nuMs - bil.tidMs <= BIL_MAX_ALDER_MS;
        const fran: Utgangspunkt | null = bilFarsk
          ? { pos: bil.pos, kalla: 'bil', tidMs: bil.tidMs, gammal: false }
          : telefon && rimligGpsPunkt(telefon.lat, telefon.lng)
            ? { pos: { lat: telefon.lat, lng: telefon.lng }, kalla: 'telefon', tidMs: telefon.tid, gammal: false }
            : bil ? { pos: bil.pos, kalla: 'bil', tidMs: bil.tidMs, gammal: true } : null;

        setLage({ lage: 'klar', data: { forare, vin, bas, maskiner, fran, objekt, platser, posFel } });
      } catch (e) {
        console.error('[lastbil] hämta: läsfel', e);
        if (!avbruten) setLage({ lage: 'fel' });
      }
    })();
    return () => { avbruten = true; };
  }, [aktiv, omforsok]);

  const forsokIgen = useCallback(() => setOmforsok(n => n + 1), []);
  return { lage, forsokIgen };
}
