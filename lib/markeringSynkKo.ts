// Markeringssynken kopplad till appen: IndexedDB (reserv: minne) + Supabase (`planering_markeringar`). Logiken bor i ./markeringSynk (ren, testad).
//
// Kön körs oberoende av planeringsvyn (global startare i layouten), så väntande markeringar skickas även om appen öppnas på startsidan:
// när nätet kommer tillbaka, när appen öppnas/blir synlig, med jämna mellanrum — och av planeringsvyn FÖRE varje hämtning från servern.

import { supabase } from '@/lib/supabase';
import { serverNu } from '@/lib/serverKlocka';
import {
  markeringNyckel, sammanfoga, skapaIndexedDbSynkLager, skapaMarkeringSynk, skapaMinnesSynkLager,
  type Krock, type MarkeringSynk, type ServerBild, type ServerInfo, type ServerRad, type SynkLager, type VantandeMarkering,
} from './markeringSynk';
import { korFotoKo } from './markeringFotoKo';

const lyssnare = new Set<() => void>();
/** Något i kön ändrades (ny ändring, skickad, släppt). Ger en funktion som avprenumererar. */
export function prenumereraMarkeringSynk(fn: () => void): () => void {
  lyssnare.add(fn);
  return () => { lyssnare.delete(fn); };
}
const meddela = () => lyssnare.forEach((fn) => { try { fn(); } catch { /* */ } });

const LOGG_NYCKEL = 'markering_synk_logg_v1';
const LOGG_MAX = 50;
/** Krockar mellan enheter (senaste ändring vinner) loggas: konsolen + de 50 senaste i localStorage. */
export function loggaKrock(k: Krock): void {
  try { console.warn('[Markeringssynk] krock', k); } catch { /* */ }
  try {
    const gamla = JSON.parse(localStorage.getItem(LOGG_NYCKEL) || '[]');
    localStorage.setItem(LOGG_NYCKEL, JSON.stringify([...(Array.isArray(gamla) ? gamla : []), k].slice(-LOGG_MAX)));
  } catch { /* */ }
}

async function lasInfo(objektId: string, ids: string[]): Promise<Map<string, ServerInfo> | null> {
  const ut = new Map<string, ServerInfo>();
  // En fråga per 100 id (URL-längd).
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('planering_markeringar')
      .select('marker_id, andradTs:data->>andradTs, photoPath:data->>photoPath, photoTs:data->>photoTs')
      .eq('objekt_id', objektId)
      .in('marker_id', ids.slice(i, i + 100));
    if (error) return null;
    for (const r of (data ?? []) as any[]) {
      const ts = Number(r.andradTs);
      const pts = Number(r.photoTs);
      ut.set(String(r.marker_id), { andradTs: Number.isFinite(ts) ? ts : 0, photoPath: r.photoPath ?? null, photoTs: Number.isFinite(pts) && r.photoTs != null ? pts : null });
    }
  }
  return ut;
}

let synk: Promise<{ ko: MarkeringSynk; lager: SynkLager; varaktig: boolean }> | null = null;
function hamtaSynk() {
  if (!synk) {
    synk = (async () => {
      const idb = await skapaIndexedDbSynkLager();
      const lager = idb ?? skapaMinnesSynkLager();
      const ko = skapaMarkeringSynk({
        lager,
        nu: () => serverNu(),
        lasInfo,
        skrivUpsert: async (rader) => {
          const { error } = await supabase.from('planering_markeringar').upsert(rader, { onConflict: 'objekt_id,marker_id' });
          if (error) { try { console.error('[Markeringssynk] upsert fel:', error); } catch { /* */ } }
          return !error;
        },
        skrivDelete: async (objektId, markerId) => {
          const { error } = await supabase.from('planering_markeringar').delete().eq('objekt_id', objektId).eq('marker_id', markerId);
          if (error) { try { console.error('[Markeringssynk] delete fel:', error); } catch { /* */ } }
          return !error;
        },
        paForandring: meddela,
        // Markeringarna ligger nu på servern → fotokön kan koppla sina foton direkt (annars väntar de på sin egen väntetid).
        paSynkad: () => { void korFotoKo(true); },
        paKrock: loggaKrock,
      });
      return { ko, lager, varaktig: !!idb };
    })();
  }
  return synk;
}

/** Sparar en ny/ändrad markering lokalt, beständigt, direkt — och sätter igång kön. Resolvar när den ligger i lagret (inte när servern svarat). */
export async function laggMarkeringUpsert(objektId: string, marker: Record<string, any>, typ: string): Promise<void> {
  const { ko } = await hamtaSynk();
  await ko.laggUpsert(objektId, marker, typ);
  void korMarkeringSynk(true);
}

/** Markerar en markering som borttagen lokalt (grav tills servern bekräftat) — och sätter igång kön. */
export async function laggMarkeringDelete(objektId: string, markerId: string): Promise<void> {
  const { ko } = await hamtaSynk();
  await ko.laggDelete(objektId, markerId);
  void korMarkeringSynk(true);
}

export async function vantandeMarkeringar(objektId?: string): Promise<VantandeMarkering[]> {
  const { ko } = await hamtaSynk();
  return ko.vantande(objektId);
}

/** Antal väntande ändringar (alla objekt) — "3 väntar". */
export async function antalVantandeMarkeringar(): Promise<number> {
  return (await vantandeMarkeringar()).length;
}

/** Ett varv över kön — bara ett i taget, även mellan flikar (Web Locks där det finns). Kastar aldrig. Är låset taget (en annan flik — eller en nyss stängd — kör kön)
 *  försöker vi igen strax i stället för att vänta på nästa jämna trigger: ett tvingat varv (nätet kom tillbaka) ska inte tyst falla bort. */
export async function korMarkeringSynk(tvinga = false, omforsok = 3): Promise<void> {
  try {
    const { ko } = await hamtaSynk();
    const nav: any = typeof navigator === 'undefined' ? null : navigator;
    if (nav?.locks?.request) {
      let fick = false;
      await nav.locks.request('markering-synk-ko', { ifAvailable: true }, async (lock: unknown) => { if (lock) { fick = true; await ko.kor(tvinga); } });
      if (!fick && omforsok > 0 && typeof setTimeout !== 'undefined') setTimeout(() => { void korMarkeringSynk(tvinga, omforsok - 1); }, 2000);
    } else await ko.kor(tvinga);
  } catch { /* nästa trigger försöker igen */ }
}

/** Som korMarkeringSynk men väntar högst `ms` — planeringsvyn skickar det som väntar FÖRE en hämtning, utan att hänga utan täckning. */
export async function skickaVantandeForst(ms = 8000): Promise<void> {
  await Promise.race([korMarkeringSynk(true), new Promise<void>((klar) => setTimeout(klar, ms))]);
}

/**
 * Det som finns LOKALT för ett objekt, utan att vänta på nätet: serverns senast sparade bild + de väntande ändringarna ovanpå. Visas direkt när
 * trakten öppnas (innan servern svarat, eller utan täckning). null = inget lokalt alls.
 */
export async function lasLokaltForst(objektId: string): Promise<{ markers: any[] } | null> {
  const { ko, lager } = await hamtaSynk();
  const bild = await lager.lasBild(objektId).catch(() => null);
  const vantande = await ko.vantande(objektId);
  if (!bild && vantande.length === 0) return null;
  return { markers: sammanfoga(bild?.rader ?? [], vantande, serverNu()).markers };
}

export type HamtatMarkeringar = {
  markers: any[];
  /** true = serverns rader lästes just nu; false = serverns senast sparade bild (eller inget) — visa inte "Uppdaterad nu" */
  farsk: boolean;
  /** serverns rader (som lästes eller låg i bilden) — sidan seedar sin "kända"-karta ur dem */
  serverRader: ServerRad[];
  /** ids som är lokala väntande ändringar (visas, men ligger inte på servern än) */
  lokala: Set<string>;
  krockar: Krock[];
};

/**
 * Hämtar ett objekts markeringar: skickar det som väntar FÖRST, läser servern, och lägger de lokala väntande ändringarna ovanpå. Misslyckas hämtningen
 * används serverns senast sparade bild (om den finns) — de lokala ändringarna syns alltid. Aldrig en hämtning som tar bort eller skriver över en
 * lokal ändring som inte kommit fram.
 */
export async function hamtaMarkeringarSammanfogade(objektId: string, hamtaServer: () => Promise<ServerRad[] | null>): Promise<HamtatMarkeringar> {
  await skickaVantandeForst();
  const { ko, lager } = await hamtaSynk();
  let rader = await hamtaServer();
  const farsk = rader != null;
  if (rader) { try { await lager.sparaBild({ objektId, rader, hamtad: serverNu() } as ServerBild); } catch { /* */ } }
  else rader = (await lager.lasBild(objektId).catch(() => null))?.rader ?? [];
  // Läs de väntande EFTER hämtningen: en ändring som gjordes under den ska också med.
  const vantande = await ko.vantande(objektId);
  const s = sammanfoga(rader, vantande, serverNu());
  for (const k of s.krockar) loggaKrock(k);
  if (s.ersatta.length) await ko.slapp(s.ersatta);
  const kvar = vantande.filter((v) => !s.ersatta.includes(v.nyckel));
  return { markers: s.markers, farsk, serverRader: rader, lokala: new Set(kvar.filter((v) => v.op === 'upsert').map((v) => v.markerId)), krockar: s.krockar };
}

/** Startar triggers: nu, när nätet kommer tillbaka, när appen blir synlig och var 20:e sekund. Anropas EN gång (global startare). */
export function startaMarkeringSynkTriggers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void korMarkeringSynk(true); };
  const synlig = () => { if (document.visibilityState === 'visible') void korMarkeringSynk(true); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void korMarkeringSynk(false); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', synlig);
  const iv = window.setInterval(tick, 20_000);
  void korMarkeringSynk(true);
  try { void (navigator as any).storage?.persist?.(); } catch { /* */ }
  return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', synlig); window.clearInterval(iv); };
}

export { markeringNyckel };
