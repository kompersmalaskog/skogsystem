// Skriver objektets justerade traktgräns till servern (objekt_traktgrans_justerad via RPC satt_justerad_traktgrans, bara admin) — se lib/justeradGrans.ts.
// Idempotent: enheten minns senast skickade signaturen per objekt (localStorage), så en öppning utan ändring inte skickar något. Ett fel lämnar minnet orört
// (nästa ändring/öppning/`online` försöker igen) och kastar aldrig — gränsen på kartan är redan rätt, det här gäller bara vad servern räknar på.

import { justeradSignatur, type JusteradDel } from './justeradGrans';

const NYCKEL = (objektId: string) => `justerad_grans_synk_v1:${objektId}`;

export type SynkSvar = 'skickad' | 'oforandrad' | 'fel';

interface RpcKlient { rpc: (namn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string; code?: string } | null }> }

const lasMinne = (objektId: string): string | null => { try { return window.localStorage.getItem(NYCKEL(objektId)); } catch { return null; } };
const skrivMinne = (objektId: string, sig: string) => { try { window.localStorage.setItem(NYCKEL(objektId), sig); } catch { /* utan minne skickas det igen nästa gång — ofarligt */ } };

export async function synkaJusteradGrans(sb: RpcKlient, objektId: string, delar: readonly JusteradDel[]): Promise<SynkSvar> {
  const sig = justeradSignatur(delar);
  const sparad = lasMinne(objektId);
  if (sparad === sig) return 'oforandrad';
  if (sparad == null && sig === '') return 'oforandrad';   // aldrig skickat något och inget att skicka: inget att ta bort heller
  try {
    const { error } = await sb.rpc('satt_justerad_traktgrans', { p_objekt: objektId, p_delar: delar });
    if (error) { console.warn('Justerad traktgräns kunde inte sparas på servern:', error.message ?? error); return 'fel'; }
  } catch (e) { console.warn('Justerad traktgräns kunde inte sparas på servern:', e); return 'fel'; }
  skrivMinne(objektId, sig);
  return 'skickad';
}

/** Efter en lyckad ändring: be servern räkna om traktanalysen och skogsdatan på den nya gränsen direkt i stället för vid nästa timkörning. Best effort, kastar aldrig. */
export function raknaOmEfterGransandring(hamta: (url: string, init?: RequestInit) => Promise<unknown> = (u, i) => fetch(u, i)): void {
  for (const url of ['/api/cron/traktanalys', '/api/cron/skogsdata']) {
    try { void Promise.resolve(hamta(url, { credentials: 'same-origin' })).catch(() => {}); } catch { /* ofarligt: timkörningen tar det */ }
  }
}
