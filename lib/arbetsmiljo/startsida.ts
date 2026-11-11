// Arbetsmiljöns rader i startsidans "Behöver dig" (riskbedömning per maskintyp; skyddsronden läggs till här).
// Ett läsfel ger inga rader — aldrig en gissning.
import type { SupabaseClient } from '@supabase/supabase-js';
import { behoverDigText as rondText, hamtaRonder, lage as rondLage } from './skyddsrond';
import { arbetsmiljoIgang } from './start';
import { adminRad, forarRad, hamtaBedomningar, hamtaKvitton, typForMaskin } from './maskinRisk';

export type ArbetsmiljoRad = { id: string; text: string; href: string };

export type Jag = { id: string; roll: string | null; maskin_id: string | null; skyddsombud?: boolean | null };

export async function hamtaArbetsmiljoRader(sb: SupabaseClient, jag: Jag, nu = new Date()): Promise<ArbetsmiljoRad[]> {
  const rader: ArbetsmiljoRad[] = [];
  if (!arbetsmiljoIgang(nu)) return rader;
  try {
    const bedomningar = await hamtaBedomningar(sb);
    if (bedomningar) {
      if (jag.roll === 'admin') {
        const t = adminRad(bedomningar, nu);
        if (t) rader.push({ id: 'riskbedomning', text: t, href: '/riskbedomning' });
      } else if (jag.maskin_id) {
        const [kvitton, maskin] = await Promise.all([
          hamtaKvitton(sb),
          sb.from('dim_maskin').select('maskin_typ').eq('maskin_id', jag.maskin_id).maybeSingle(),
        ]);
        if (kvitton && !maskin.error) {
          const t = forarRad(typForMaskin((maskin.data as { maskin_typ?: string } | null)?.maskin_typ), bedomningar, kvitton, jag.id, nu);
          if (t) rader.push({ id: 'riskbedomning', text: t, href: '/riskbedomning' });
        }
      }
    }
  } catch { /* inga rader */ }
  // Skyddsronden: bara de som går den (admin och skyddsombud).
  if (jag.roll === 'admin' || jag.skyddsombud === true) {
    try {
      const ronder = await hamtaRonder(sb);
      const t = ronder ? rondText(rondLage(ronder, nu)) : null;
      if (t) rader.push({ id: 'skyddsrond', text: t, href: '/skyddsrond' });
    } catch { /* ingen rad */ }
  }
  return rader;
}
