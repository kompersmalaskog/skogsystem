// Lasskön kopplad till appen: IndexedDB (reserv: minne) + Supabase. Logiken bor i ./ko (ren, testad).
// Körs oberoende av planeringsvyn (global startare i layouten): när nätet kommer tillbaka, när appen öppnas/blir synlig och jämnt.
import { supabase } from '@/lib/supabase';
import { serverNu } from '@/lib/serverKlocka';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { skapaIndexedDbKoLager, skapaLassKo, skapaMinnesKoLager, type SkotarLassKo } from './ko';
import { avslutFranServer, lassFranServer, lassTillPayload, LASS_SELECT, type Avslut } from './server';
import { skordatPerSortiment, type SkordatSortiment } from './sortiment';
import { optiTidUtcMs } from '@/lib/optiTid';
import type { OptiLass } from './opti';
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
        skickaAvslut: async (objektId, opti) => {
          const { error } = await supabase.rpc('skotar_farduskotat', { p_objekt: objektId, p_opti: opti });
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

/** `opti` = Opti-lassens volym före appens start per skördarens sortiment (`optiForAvslut`): servern drar av den innan appens lass skalas. */
export async function begarFardigskotad(objektId: string, torr: boolean = false, opti: Record<string, number> = {}): Promise<void> {
  const k = await hamtaLassKo(torr);
  await k.begarAvslut(objektId, new Date(serverNu()).toISOString(), opti);
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

/** Namn och köparkod för sortiment-id:n (dim_sortiment), i omgångar. null = kunde inte läsas. */
async function lasSortimentInfo(ids: readonly string[]): Promise<{ namn: Map<string, string>; kod: Map<string, string | null> } | null> {
  const namn = new Map<string, string>();
  const kod = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('dim_sortiment').select('sortiment_id, namn, kundkod').in('sortiment_id', ids.slice(i, i + 100));
    if (error) return null;
    for (const r of (data ?? []) as any[]) { if (r.namn) namn.set(r.sortiment_id, r.namn); kod.set(r.sortiment_id, r.kundkod ?? null); }
  }
  return { namn, kod };
}

/** Skördat per sortiment ur fakt_sortiment (volym_m3sub) + dim_sortiment.namn/kundkod. null = kunde inte läsas — "kvar" visas då inte, aldrig som 0. */
export async function lasSkordat(voNummer: string, altIds: readonly string[]): Promise<SkordatSortiment[] | null> {
  try {
    const ids = Array.from(new Set([voNummer, ...altIds]));
    const rader = await hamtaAlla<any>(() => supabase.from('fakt_sortiment').select('id, sortiment_id, volym_m3sub').in('objekt_id', ids) as any, 'id');
    if (rader.error) return null;
    const sid = Array.from(new Set(rader.data.map((r: any) => r.sortiment_id).filter(Boolean))) as string[];
    const info = await lasSortimentInfo(sid);
    if (!info) return null;
    return skordatPerSortiment(rader.data, info.namn, info.kod);
  } catch { return null; }
}

/**
 * Trakten Opti-lass (fakt_lass + fakt_lass_sortiment) från ALLA skotare. null = kunde inte läsas — kvar visas då inte (aldrig en gissning
 * på halva underlaget). Tomt svar = inga Opti-lass på trakten. Tiderna görs till verkliga UTC-ögonblick med radens tid_ar_utc (lib/optiTid).
 */
export async function lasOptiLass(voNummer: string, altIds: readonly string[]): Promise<OptiLass[] | null> {
  try {
    const ids = Array.from(new Set([voNummer, ...altIds]));
    const lass = await hamtaAlla<any>(() => supabase.from('fakt_lass').select('id, maskin_id, datum, lass_nummer, lossnings_tid, lastnings_tid, tid_ar_utc, volym_m3sub').in('objekt_id', ids) as any, 'id');
    if (lass.error) return null;
    if (!lass.data.length) return [];
    const rader = await hamtaAlla<any>(() => supabase.from('fakt_lass_sortiment').select('id, maskin_id, datum, lass_nummer, sortiment_id, volym_m3sub').in('objekt_id', ids) as any, 'id');
    if (rader.error) return null;
    const sid = Array.from(new Set(rader.data.map((r: any) => r.sortiment_id).filter(Boolean))) as string[];
    const info = await lasSortimentInfo(sid);
    if (!info) return null;
    // Raderna hör till ett lass via (maskin, datum, lass_nummer) — aldrig via lass_id (importen fyller det inte).
    const nyckel = (m: string, d: string, n: number) => `${m}|${d}|${n}`;
    const perLass = new Map<string, OptiLass['rader']>();
    for (const r of rader.data) {
      const volym = Number(r.volym_m3sub ?? 0);
      const namn = info.namn.get(r.sortiment_id);
      if (!namn || !(volym > 0)) continue;
      const k = nyckel(r.maskin_id, String(r.datum), Number(r.lass_nummer));
      const l = perLass.get(k) ?? [];
      l.push({ namn, kundkod: info.kod.get(r.sortiment_id) ?? null, m3: volym });
      perLass.set(k, l);
    }
    return lass.data.map((l: any): OptiLass => ({
      maskinId: String(l.maskin_id),
      datum: String(l.datum),
      lassNummer: Number(l.lass_nummer),
      tidMs: optiTidUtcMs(l.lossnings_tid ?? l.lastnings_tid, l.tid_ar_utc),
      volymM3: l.volym_m3sub != null && Number.isFinite(Number(l.volym_m3sub)) ? Number(l.volym_m3sub) : null,
      rader: perLass.get(nyckel(String(l.maskin_id), String(l.datum), Number(l.lass_nummer))) ?? [],
    }));
  } catch { return null; }
}

/** Är skotningen redan avslutad på trakten (dim_objekt.skotning_avslutad satt, hur den än sattes)? null = kunde inte läsas. */
export async function lasSkotningAvslutad(voNummer: string, altIds: readonly string[]): Promise<boolean | null> {
  try {
    const ids = Array.from(new Set([voNummer, ...altIds]));
    const { data, error } = await supabase.from('dim_objekt').select('objekt_id, skotning_avslutad').in('vo_nummer', ids);
    if (error) return null;
    return ((data ?? []) as any[]).some((r) => r.skotning_avslutad != null);
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
