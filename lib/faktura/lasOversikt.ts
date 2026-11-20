// Läsningen bakom faktureringsvyns lista. EN gång per sidladdning, i layouten —
// både listan (sidokolumn från 1100 px) och den öppna trakten delar den.
//
// Serverläsning i stället för ett klientanrop mot /api/faktura/oversikt: RPC:n tar
// ~120 ms för alla trakter, och då slipper vyn blinka "Läser trakterna…".
// Rutten finns kvar — den används inte av den här vyn längre.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { ArbeteUtanTrakt, OversiktsRad } from './listaVy';
import { byggFakturaLage, type FakturaLage } from './fakturaLage';

export type Lasning =
  | {
      ok: true;
      rader: OversiktsRad[];
      utanTrakt: ArbeteUtanTrakt | null;
      /** null = fakturorna gick inte att läsa; listan säger det i stället för att gissa. */
      faktura: FakturaLage | null;
      arAdmin: true;
    }
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

  // Var i faktureringen varje trakt ligger — läst ur VÅRA skickade fakturor och
  // kopplad på kontraktsnumret (lib/faktura/fakturaLage.ts). Två små läsningar:
  // 69 objektrader och de 143 fakturarader som bär kontraktsnummer eller
  // slutredovisning. Går någon av dem inte igenom blir läget null och listan
  // säger att den inte kan se vad som är skickat — den gissar aldrig.
  let faktura: FakturaLage | null = null;
  const [objektRes, fakturaRes] = await Promise.all([
    sb.from('objekt').select('vo_nummer, kontraktsnummer'),
    sb.from('fortnox_invoice_rows')
      .select('document_number, invoice_date, article_number, description')
      .in('article_number', ['7', '8']),
  ]);
  // PostgREST kapar tyst vid sidgränsen. En halv läsning gör trakter till
  // "går inte att se" utan att något säger varför — hellre ingen bedömning
  // alls. 69 objektrader och 143 fakturarader i dag; taket är långt borta.
  const SIDGRANS = 1000;
  const helt = (r: { error: unknown; data: unknown[] | null }) =>
    !r.error && !!r.data && r.data.length < SIDGRANS;
  if (helt(objektRes) && helt(fakturaRes)) {
    faktura = byggFakturaLage(objektRes.data!, fakturaRes.data!);
  }

  return { ok: true, rader: (data ?? []) as OversiktsRad[], utanTrakt, faktura, arAdmin: true };
}
