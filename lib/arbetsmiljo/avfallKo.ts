// Lämningarna sparas FÖRST i telefonen och skickas sedan (2026-11-03). Verkstaden kan ligga utan täckning, och mottagaren har redan
// skrivit under — då får ingenting gå förlorat. En lämning är "sparad" när den ligger i kön; den skickas direkt, när nätet kommer och
// när appen öppnas. Lämningens id skapas i telefonen, så ett omförsök är ofarligt: finns raden redan (23505) är den skickad.
//
// Bilderna (underskriften, följesedeln) ligger i kön som data-URL:er — underskriften är några kB, följesedeln komprimerad ~200 kB.
// Ordningen vid skick: bilderna först (under förarens egen mapp i am-foton), sedan raden. En bild som redan finns räknas som uppladdad.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET, type Lamning, type Post } from './avfall';

export const KO_NYCKEL = 'avfall_ko_v1';

export type KoPost = {
  id: string;
  medarbetareId: string;
  mottagareId: string | null;
  mottagareNamn: string;
  poster: Post[];
  kg: number;
  kvitteradNamn: string;
  /** data:image/png;base64,… */
  underskrift: string;
  /** data:image/jpeg;base64,… eller null */
  foljesedel: string | null;
  skapad: string;
  lamnadAvNamn: string | null;
};

type Lager = Pick<Storage, 'getItem' | 'setItem'>;

function lager(): Lager | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function lasKo(l: Lager | null = lager()): KoPost[] {
  try {
    const v = l?.getItem(KO_NYCKEL);
    const ko = v ? JSON.parse(v) : [];
    return Array.isArray(ko) ? ko.filter(p => p && typeof p.id === 'string') : [];
  } catch { return []; }
}

function skrivKo(ko: KoPost[], l: Lager | null = lager()): boolean {
  try { l?.setItem(KO_NYCKEL, JSON.stringify(ko)); return !!l; } catch { return false; }
}

/** Lägg i kön. false = telefonen kunde inte spara (fullt minne, privat läge) — då måste den skickas direkt. */
export function laggIKo(p: KoPost, l: Lager | null = lager()): boolean {
  const ko = lasKo(l).filter(x => x.id !== p.id);
  ko.push(p);
  return skrivKo(ko, l);
}

function taBortUrKo(id: string, l: Lager | null = lager()) {
  skrivKo(lasKo(l).filter(x => x.id !== id), l);
}

/** Det som väntar, som lämningar (visas överst i listan med "väntar"). */
export function vantande(l: Lager | null = lager()): Lamning[] {
  return lasKo(l).map(p => ({
    id: p.id, mottagareNamn: p.mottagareNamn, poster: p.poster, kg: p.kg, kvitteradNamn: p.kvitteradNamn,
    underskriftSokvag: '', foljesedelSokvag: null, lamnadTid: p.skapad, lamnadAvNamn: p.lamnadAvNamn, vantar: true,
  }));
}

export function dataUrlTillBlob(url: string): Blob {
  const [huvud, data] = url.split(',');
  const typ = /data:([^;]+)/.exec(huvud)?.[1] ?? 'application/octet-stream';
  const bin = atob(data ?? '');
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new Blob([b], { type: typ });
}

async function ladda(sb: SupabaseClient, sokvag: string, dataUrl: string, typ: string): Promise<boolean> {
  const { error } = await sb.storage.from(BUCKET).upload(sokvag, dataUrlTillBlob(dataUrl), { contentType: typ, upsert: false });
  if (!error) return true;
  // Redan uppladdad vid ett tidigare försök.
  const m = `${(error as { message?: string }).message ?? ''} ${(error as { statusCode?: string | number }).statusCode ?? ''}`;
  return /exist|duplicate|409/i.test(m);
}

/** Skicka EN post. true = den finns nu på servern. */
export async function skickaPost(sb: SupabaseClient, p: KoPost): Promise<boolean> {
  const underskrift = `${p.medarbetareId}/avfall/${p.id}-underskrift.png`;
  const foljesedel = p.foljesedel ? `${p.medarbetareId}/avfall/${p.id}-foljesedel.jpg` : null;
  if (!(await ladda(sb, underskrift, p.underskrift, 'image/png'))) return false;
  if (foljesedel && !(await ladda(sb, foljesedel, p.foljesedel!, 'image/jpeg'))) return false;
  const { error } = await sb.from('am_avfall_lamning').insert({
    id: p.id, mottagare_id: p.mottagareId, mottagare_namn: p.mottagareNamn, poster: p.poster, kg: p.kg,
    kvitterad_namn: p.kvitteradNamn, underskrift_sokvag: underskrift, foljesedel_sokvag: foljesedel,
  });
  return !error || (error as { code?: string }).code === '23505';
}

let pagar: Promise<number> | null = null;

/** Skicka allt som väntar, en i taget, i ordning. Returnerar hur många som är kvar. Kastar aldrig. */
export function skickaKo(sb: SupabaseClient, l: Lager | null = lager()): Promise<number> {
  if (pagar) return pagar;
  pagar = (async () => {
    try {
      for (const p of lasKo(l)) {
        let ok = false;
        try { ok = await skickaPost(sb, p); } catch { ok = false; }
        if (!ok) break;
        taBortUrKo(p.id, l);
      }
    } finally { pagar = null; }
    return lasKo(l).length;
  })();
  return pagar;
}
