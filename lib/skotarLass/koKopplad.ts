// Lasskön kopplad till appen: IndexedDB (reserv: minne) + Supabase. Logiken bor i ./ko (ren, testad).
// Körs oberoende av planeringsvyn (global startare i layouten): när nätet kommer tillbaka, när appen öppnas/blir synlig och jämnt.
import { supabase } from '@/lib/supabase';
import { serverNu } from '@/lib/serverKlocka';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { skapaIndexedDbKoLager, skapaLassKo, skapaMinnesKoLager, type SkotarLassKo } from './ko';
import { avslutFranServer, lassFranServer, lassTillPayload, LASS_SELECT, type Avslut } from './server';
import { skordatPerSortiment, type SkordatSortiment } from './sortiment';
import type { Lass } from './typer';

const lyssnare = new Set<() => void>();
/** Något i kön ändrades. Ger en funktion som avprenumererar. */
export function prenumereraLassKo(fn: () => void): () => void {
  lyssnare.add(fn);
  return () => { lyssnare.delete(fn); };
}
const meddela = () => lyssnare.forEach((fn) => { try { fn(); } catch { /* */ } });

let ko: Promise<SkotarLassKo> | null = null;
// TORRKÖRNING (admin: /maskin?som=<maskin_id>, testläget): egen kö i MINNET som aldrig skickar något och aldrig delar lager med den riktiga —
// lass, Ändra och Färdigskotad fungerar som i maskinen men ingenting når skotar_lass* eller dim_objekt. Läsningar (skördat, andras lass) är vanliga.
let torrKo: Promise<SkotarLassKo> | null = null;
export function hamtaLassKo(torr: boolean = false): Promise<SkotarLassKo> {
  if (torr) {
    torrKo ??= Promise.resolve(skapaLassKo({ lager: skapaMinnesKoLager(), paForandring: meddela, skickaLass: async () => true, skickaAvslut: async () => true }));
    return torrKo;
  }
  if (!ko) {
    ko = (async () => {
      const lager = (await skapaIndexedDbKoLager()) ?? skapaMinnesKoLager();
      return skapaLassKo({
        lager,
        paForandring: meddela,
        skickaLass: async (l) => {
          const { data, error } = await supabase.rpc('skotar_lass_spara', { p: lassTillPayload(l) });
          if (error) { try { console.warn('[Skotarlass] spara:', error.message); } catch { /* */ } return false; }
          // sparad:false/nyare_finns = servern har en nyare version; vår behöver inte skickas.
          return !!data;
        },
        skickaAvslut: async (objektId) => {
          const { error } = await supabase.rpc('skotar_farduskotat', { p_objekt: objektId });
          if (error) { try { console.warn('[Skotarlass] färdigskotad:', error.message); } catch { /* */ } return false; }
          return true;
        },
      });
    })();
  }
  return ko;
}

/** Ett varv över kön — bara ett i taget även mellan flikar (Web Locks). Kastar aldrig; nästa trigger försöker igen. */
export async function korLassKo(): Promise<void> {
  try {
    const k = await hamtaLassKo();
    const nav: any = typeof navigator === 'undefined' ? null : navigator;
    if (nav?.locks?.request) await nav.locks.request('skotar-lass-ko', { ifAvailable: true }, async (lock: unknown) => { if (lock) await k.kor(); });
    else await k.kor();
  } catch { /* */ }
}

export async function sparaLass(lass: Lass, torr: boolean = false): Promise<void> {
  const k = await hamtaLassKo(torr);
  await k.spara(lass);
  if (!torr) void korLassKo();
}

export async function begarFardigskotad(objektId: string, torr: boolean = false): Promise<void> {
  const k = await hamtaLassKo(torr);
  await k.begarAvslut(objektId, new Date(serverNu()).toISOString());
  if (!torr) void korLassKo();
}

export async function antalVantandeLass(): Promise<number> {
  return (await hamtaLassKo()).antalVantande();
}

/** Trakten alla lass: det som ligger lokalt + det servern har (alla skotare). Utan täckning ges bara det lokala, utan fel. */
export async function lasLassForObjekt(objektId: string, torr: boolean = false): Promise<{ lass: Lass[]; fran: 'server' | 'lokalt' }> {
  const k = await hamtaLassKo(torr);
  let fran: 'server' | 'lokalt' = 'lokalt';
  try {
    const { data, error } = await hamtaAlla<any>(() => supabase.from('skotar_lass').select(LASS_SELECT).eq('objekt_id', objektId) as any, 'id');
    if (!error) {
      await k.tagEmotServer(data.map(lassFranServer).filter((l): l is Lass => !!l));
      fran = 'server';
    }
  } catch { /* offline */ }
  return { lass: await k.lassForObjekt(objektId), fran };
}

/** Skalfaktorerna om trakten är färdigskotad. null = inte avslutad (eller kunde inte läsas — då räknas som inte avslutad). */
export async function lasAvslut(objektId: string): Promise<Avslut | null> {
  try {
    const { data, error } = await supabase.from('skotar_trakt_avslut').select('faktorer, tillagg, skillnad_m3, avslutad_tid').eq('objekt_id', objektId).maybeSingle();
    return error ? null : avslutFranServer(data);
  } catch { return null; }
}

/** Skördat per sortiment (skördarens mätning). null = kunde inte läsas — "kvar" visas då inte, aldrig som 0. */
export async function lasSkordat(voNummer: string, altIds: readonly string[]): Promise<SkordatSortiment[] | null> {
  try {
    const ids = Array.from(new Set([voNummer, ...altIds]));
    const rader = await hamtaAlla<any>(() => supabase.from('fakt_sortiment').select('id, sortiment_id, volym_m3sub').in('objekt_id', ids) as any, 'id');
    if (rader.error) return null;
    const sid = Array.from(new Set(rader.data.map((r: any) => r.sortiment_id).filter(Boolean)));
    const namn = new Map<string, string>();
    for (let i = 0; i < sid.length; i += 100) {
      const { data, error } = await supabase.from('dim_sortiment').select('sortiment_id, namn').in('sortiment_id', sid.slice(i, i + 100));
      if (error) return null;
      for (const r of (data ?? []) as any[]) if (r.namn) namn.set(r.sortiment_id, r.namn);
    }
    return skordatPerSortiment(rader.data, namn);
  } catch { return null; }
}

/** Triggers: nu, när nätet kommer tillbaka, när appen blir synlig och var 20:e sekund. Anropas EN gång (global startare). */
export function startaLassKoTriggers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void korLassKo(); };
  const synlig = () => { if (document.visibilityState === 'visible') void korLassKo(); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void korLassKo(); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', synlig);
  const iv = window.setInterval(tick, 20_000);
  void korLassKo();
  return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', synlig); window.clearInterval(iv); };
}
