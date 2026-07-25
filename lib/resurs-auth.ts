// Delad autentisering + fältbehörighet för resurs/kontroll/handelse-API:t.
// EN källa för rollogiken (#5 i förra rundan, #3 i denna): ad hoc-koll i varje
// route ersätts av synligaFalt(roll), som styr BÅDA riktningarna — vilka
// kolumner select() läser OCH vilka fält en POST/PATCH får skriva.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export type Roll = string | null;

export async function autentisera(): Promise<{ user: any; roll: Roll }> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user?.email) return { user: null, roll: null };
  const { data: med } = await authClient
    .from('medarbetare')
    .select('roll')
    .eq('epost', user.email)
    .maybeSingle();
  return { user, roll: med?.roll || null };
}

export function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function kanRedigera(roll: Roll): boolean {
  return roll === 'admin' || roll === 'chef';
}

// ── Fältbehörighet — EN definition, båda riktningarna (#3) ─────────────────
// Ekonomifält får aldrig lämna servern för vanliga användare, och får aldrig
// skrivas av dem heller.
export const EKONOMIFALT = ['inkopsdatum', 'inkopspris'] as const;

const RESURS_ALLA = [
  'id', 'namn', 'typ', 'regnr', 'serienr', 'marke', 'modell', 'arsmodell',
  'avstalld', 'matarstallning', 'matare_avlast', 'anteckning', 'aktiv',
  'skapad', 'uppdaterad',
  'inkopsdatum', 'inkopspris', // ekonomi — sist
] as const;

export function harEkonomi(roll: Roll): boolean {
  return kanRedigera(roll); // admin/chef ser & skriver ekonomi
}

/** Kolumner denna roll får se — driver select() (läsriktning). */
export function synligaFalt(roll: Roll): string[] {
  return harEkonomi(roll)
    ? [...RESURS_ALLA]
    : RESURS_ALLA.filter((f) => !EKONOMIFALT.includes(f as any));
}

/** Kommaseparerad select-sträng för PostgREST. */
export function selectResurs(roll: Roll): string {
  return synligaFalt(roll).join(',');
}

/** Skrivriktning: true om payload rör ekonomifält utan behörighet → avvisa. */
export function ekonomiUtanRatt(roll: Roll, payload: Record<string, any>): boolean {
  if (harEkonomi(roll)) return false;
  return EKONOMIFALT.some((f) => f in payload);
}
