// Webbläsarens sida av rapportinläsningen: ladda upp PDF:en direkt till lagringen (signerad URL), be servern läsa den,
// hämta/rätta/lista. Inget här läser eller kontrollerar något — det görs på servern (läsning) och i kontroll.ts (kontroll).
import { supabase } from '@/lib/supabase';
import type { Kontroll } from './kontroll';
import type { Lasning } from './rapport';

export const BUCKET = 'stamplingsrapporter';
export type Status = 'uppladdad' | 'lasning' | 'stammer' | 'avviker' | 'fel';
export type Rapport = {
  id: string; skapad: string; skapad_av: string | null; filnamn: string; status: Status; modell: string | null; rattad: boolean;
  namn: string | null; forrattare: string | null; datum: string | null; total_volym_m3sk: number | null; fel: string | null;
  lasning: Lasning | null; kontroll: Kontroll | null;
};
export type Resultat = { ok: true; rapport: Rapport } | { ok: false; kod: string; fel: string };

async function anrop(url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({ ok: false, error: `Servern svarade ${r.status} utan innehåll.` }));
  if (r.status === 401) return { ok: false, kod: 'inloggning', error: 'Du är utloggad. Logga in igen.' };
  return j;
}

export async function listaRapporter(): Promise<Rapport[]> {
  const j = await anrop('/api/stampling/rapport');
  return j.ok ? j.rapporter : [];
}
export async function hamtaRapport(id: string): Promise<Resultat> {
  const j = await anrop(`/api/stampling/rapport/${id}`);
  return j.ok ? { ok: true, rapport: j.rapport } : { ok: false, kod: j.kod ?? 'hamta', fel: j.error ?? 'Rapporten kunde inte hämtas.' };
}

/** Ladda upp, läs, kontrollera. `steg` får veta var vi är så att skärmen kan säga det. */
export async function laddaUppOchLas(fil: File, steg: (s: 'laddar-upp' | 'laser') => void): Promise<Resultat> {
  steg('laddar-upp');
  const start = await anrop('/api/stampling/rapport', { method: 'POST', body: JSON.stringify({ filnamn: fil.name }) });
  if (!start.ok) return { ok: false, kod: start.kod ?? 'start', fel: start.error ?? 'Uppladdningen kunde inte startas.' };
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(start.path, start.token, fil, { contentType: 'application/pdf' });
  if (error) return { ok: false, kod: 'uppladdning', fel: `Filen gick inte att ladda upp: ${error.message}. Försök igen.` };
  steg('laser');
  const j = await anrop(`/api/stampling/rapport/${start.id}/las`, { method: 'POST' });
  return j.ok ? { ok: true, rapport: j.rapport } : { ok: false, kod: j.kod ?? 'las', fel: j.error ?? 'Läsningen misslyckades.' };
}

/** Spara en rättad version. Servern kontrollerar om den med samma kod och svarar med den gällande kontrollen. */
export async function rattaRapport(id: string, lasning: Lasning): Promise<Resultat> {
  const j = await anrop(`/api/stampling/rapport/${id}`, { method: 'PATCH', body: JSON.stringify({ lasning }) });
  return j.ok ? { ok: true, rapport: j.rapport } : { ok: false, kod: j.kod ?? 'ratta', fel: j.error ?? 'Rättningen kunde inte sparas.' };
}
