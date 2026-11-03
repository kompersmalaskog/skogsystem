'use client';

// Trakterna man SKA till laddas ner i bakgrunden, utan att någon trycker på något (Martin 2026-11-03: "som Tesla").
//   • Maskinen: trakten den står på + de två nästa i sin kö (maskin_ko). Planeraren: alla pågående och planerade.
//   • Bara på wifi/kabel (en telefon på okänt nät räknas som mobildata) och bara med gott om plats — annars ingenting.
//   • En trakt i taget, två rutor åt gången (den som är öppen går före: useLaddaNerTrakt hämtar med fyra).
//   • Körs när sidan öppnas, när nätet kommer tillbaka och var 30:e minut. Ingen rad och ingen knapp — det märks bara på att kartan finns.
// Ytan = Vidas traktgräns (objekt_geometri), annars en ruta runt objektets punkt — samma regler som för den öppna trakten.
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  attRensa, bakgrundNat, lasMeta, nogPlats, onskadeTrakter, punktBbox, traktBbox, type Bbox, type KoRad,
} from '@/lib/kartNedladdning';
import { arSparad, laddaNerRutor, lagring, taBortTrakter } from '@/lib/kartNedladdningKor';

const INTERVALL_MS = 30 * 60_000;
const START_EFTER_MS = 20_000;        // sidan och den öppna trakten först

async function lasOnskade(roll: 'maskin' | 'planerare', maskinId: string | null, oppen: string | null): Promise<string[] | null> {
  if (roll === 'maskin') {
    if (!maskinId) return oppen ? [oppen] : [];
    const { data, error } = await supabase.from('maskin_ko').select('objekt_id, ordning').eq('maskin_id', maskinId);
    if (error) return null;
    // Bara trakter som inte är avslutade (kön kan bära en gammal rad).
    const ids = (data ?? []).map((r: any) => r.objekt_id);
    let aktiva = new Set<string>();
    if (ids.length) {
      const { data: o, error: e2 } = await supabase.from('objekt').select('id, status').in('id', ids);
      if (e2) return null;
      aktiva = new Set((o ?? []).filter((r: any) => r.status !== 'avslutat' && r.status !== 'klar').map((r: any) => String(r.id)));
    }
    return onskadeTrakter({ roll, oppen, ko: (data ?? []).filter((r: any) => aktiva.has(String(r.objekt_id))) as KoRad[], aktiva: [] });
  }
  const { data, error } = await supabase.from('objekt').select('id').in('status', ['pagaende', 'skotning', 'planerad']);
  if (error) return null;
  return onskadeTrakter({ roll, oppen, ko: [], aktiva: (data ?? []).map((r: any) => String(r.id)) });
}

async function ytaFor(id: string): Promise<Bbox | null> {
  const { data: g, error } = await supabase.from('objekt_geometri').select('geometri').eq('objekt_id', id).maybeSingle();
  if (error) return null;
  const b = traktBbox((g as any)?.geometri);
  if (b) return b;
  const { data: o } = await supabase.from('objekt').select('lat, lng').eq('id', id).maybeSingle();
  const lat = Number((o as any)?.lat), lng = Number((o as any)?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? punktBbox(lat, lng) : null;
}

export function useBakgrundsNedladdning({ roll, maskinId, oppenId }: { roll: 'maskin' | 'planerare' | null; maskinId: string | null; oppenId: string | null }): void {
  const igang = useRef(false);
  const oppenRef = useRef(oppenId);
  oppenRef.current = oppenId;

  useEffect(() => {
    if (!roll || typeof window === 'undefined' || !('caches' in window) || !('serviceWorker' in navigator)) return;
    let avbruten = false;

    const kor = async () => {
      if (igang.current || avbruten) return;
      if (!bakgrundNat(navigator as any, roll === 'maskin')) return;
      igang.current = true;
      try {
        try { if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js'); } catch { /* */ }
        const onskade = await lasOnskade(roll, maskinId, oppenRef.current);
        if (!onskade || avbruten) return;                         // läsfel: rör ingenting, nästa varv försöker igen
        for (const id of onskade) {
          if (avbruten || !bakgrundNat(navigator as any, roll === 'maskin')) return;
          let plats: StorageEstimate | null = null;
          try { plats = await navigator.storage?.estimate?.() ?? null; } catch { /* okänt = ok */ }
          if (!nogPlats(plats)) return;                            // ont om plats: sluta, aldrig tränga undan något
          const bbox = await ytaFor(id);
          if (!bbox || avbruten) continue;
          if (await arSparad(id, bbox)) continue;
          await laddaNerRutor(id, bbox, { avbruten: () => avbruten, samtidiga: 2 });
        }
        // Trakter som inte behövs längre (avslutade, flyttade ur kön) och inte öppnats på länge tas bort.
        const bort = attRensa(lasMeta(lagring()), [...onskade, ...(oppenRef.current ? [oppenRef.current] : [])], Date.now());
        if (bort.length && !avbruten) await taBortTrakter(bort);
      } catch (e) {
        console.error('[kartnedladdning bakgrund]', e);
      } finally {
        igang.current = false;
      }
    };

    const t = setTimeout(() => { void kor(); }, START_EFTER_MS);
    const iv = setInterval(() => { void kor(); }, INTERVALL_MS);
    const online = () => { void kor(); };
    window.addEventListener('online', online);
    return () => { avbruten = true; clearTimeout(t); clearInterval(iv); window.removeEventListener('online', online); };
  }, [roll, maskinId]);
}
