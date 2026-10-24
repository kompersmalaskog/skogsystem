// Läsningen bakom faktureringsvyns lista. EN gång per sidladdning, i layouten —
// både listan (sidokolumn från 1100 px) och den öppna trakten delar den.
//
// Serverläsning i stället för ett klientanrop mot /api/faktura/oversikt: RPC:n tar
// ~120 ms för alla trakter, och då slipper vyn blinka "Läser trakterna…".
// Rutten finns kvar — den används inte av den här vyn längre.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { ArbeteUtanTrakt, OversiktsRad } from './listaVy';

export type Lasning =
  | { ok: true; rader: OversiktsRad[]; utanTrakt: ArbeteUtanTrakt | null; arAdmin: true }
  | { ok: false; fel: string };

export async function serverKlient() {
  const kakor = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return kakor.getAll(); },
        setAll(attSatta) {
          attSatta.forEach(({ name, value, options }) => kakor.set(name, value, options));
        },
      },
    },
  );
}

/** admin eller inte — vyn är inte skyddet (routen är det), men en förare ska inte mötas av en tom sida. */
export async function arAdmin(sb: Awaited<ReturnType<typeof serverKlient>>): Promise<boolean> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return false;
  const { data } = await sb.from('medarbetare').select('roll').eq('epost', user.email).single();
  return data?.roll === 'admin';
}

export async function lasOversikt(sb: Awaited<ReturnType<typeof serverKlient>>): Promise<Lasning> {
  const { data, error } = await sb.rpc('faktura_oversikt');
  if (error) return { ok: false, fel: error.message };

  // Debiterbart arbete UTAN trakt: det kan inte hamna på någon faktura förrän
  // det får en. Två poster i prod 2026-10-24 (Oskar, markägare och flytt i
  // september). Ett läsfel här får inte fälla listan — då utelämnas raden.
  let utanTrakt: ArbeteUtanTrakt | null = null;
  const { data: lost } = await sb
    .from('extra_tid')
    .select('minuter')
    .eq('debiterbar', true)
    .is('objekt_id', null);
  if (lost && lost.length > 0) {
    const minuter = lost.reduce((s, r) => s + (Number(r.minuter) || 0), 0);
    utanTrakt = { poster: lost.length, timmar: Math.round((minuter / 60) * 100) / 100 };
  }

  return { ok: true, rader: (data ?? []) as OversiktsRad[], utanTrakt, arAdmin: true };
}
