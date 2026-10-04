// Delat mellan rapport-rutterna (server). Ingen auth här — varje rutt anropar kravInloggad() först.
import { createClient } from '@supabase/supabase-js';
import { kontrollera, type Kontroll } from './kontroll';
import { parsaLasning, type Lasning } from './rapport';

export const BUCKET = 'stamplingsrapporter';
export const MAX_LASNINGAR_PER_TIMME = 12;

export const adminKlient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type RapportRad = {
  id: string; skapad: string; uppdaterad: string; skapad_av: string | null; filnamn: string; storage_path: string;
  status: 'uppladdad' | 'lasning' | 'stammer' | 'avviker' | 'fel';
  modell: string | null; las: unknown; rattad: unknown; kontroll: unknown;
  namn: string | null; forrattare: string | null; datum: string | null; total_volym_m3sk: number | string | null; fel: string | null;
};

/** Raden som webbläsaren får. Kontrollen räknas OM här ur den gällande versionen — den lagrade kopian litar vi inte på. */
export function tillSvar(r: RapportRad, medInnehall = true) {
  let lasning: Lasning | null = null, kontroll: Kontroll | null = null;
  const gallande = r.rattad ?? r.las;
  if (medInnehall && gallande) {
    try { lasning = parsaLasning(gallande).lasning; kontroll = kontrollera(lasning); } catch { /* skadad rad: visa som utan innehåll */ }
  }
  return {
    id: r.id, skapad: r.skapad, skapad_av: r.skapad_av, filnamn: r.filnamn, status: r.status, modell: r.modell, rattad: r.rattad != null,
    namn: r.namn, forrattare: r.forrattare, datum: r.datum, total_volym_m3sk: r.total_volym_m3sk == null ? null : Number(r.total_volym_m3sk),
    fel: r.fel, lasning, kontroll,
  };
}

/** Kolumnerna som speglar den gällande versionens uppgifter överst, och statusen ur kontrollen. */
export function sammanfatta(lasning: Lasning, kontroll: Kontroll) {
  return {
    status: (kontroll.klart ? 'stammer' : 'avviker') as 'stammer' | 'avviker',
    kontroll: kontroll as unknown,
    namn: lasning.post.namn, forrattare: lasning.post.forrattare, datum: lasning.post.datum, total_volym_m3sk: lasning.post.total_volym_m3sk,
    uppdaterad: new Date().toISOString(),
  };
}

export const arUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
