// Maskinkollen mot databasen. Varje läsning svarar ärligt: ett fel är ett fel (`{ fel }`), aldrig en tom lista eller 0.
// Tabellerna (am_*) och reglerna i databasen: supabase/migrations/20261031162152_arbetsmiljo_maskinkoll.sql.

import type { SupabaseClient } from '@supabase/supabase-js';
import { arDags, deadlineFor, fragorFor, GODKANNANDE_VERSION, type Fraga, type Svar } from './regler';

export type Maskin = { id: string; namn: string; typ: string | null };

export type MaskinkollLage = {
  medarbetareId: string;
  maskin: Maskin;
  fragor: Fraga[];
  godkand: boolean;
  /** Påbörjad koll (klar saknas) — fortsätts. */
  pagaende: { id: string; svar: Svar[] } | null;
  /** Senaste klara koll på maskinen som föraren ser (RLS: bara hans egna). */
  senasteKlar: string | null;
  dags: boolean;
};

export type Las<T> = { ok: true; data: T } | { ok: false; fel: string };

const LASFEL = 'Kunde inte läsa maskinkollen just nu.';

/** Förarens maskin och allt maskinkollen behöver. `data: null` = föraren har ingen maskin (då finns ingen koll att göra). */
export async function hamtaLage(sb: SupabaseClient, nu: Date = new Date()): Promise<Las<MaskinkollLage | null>> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { ok: false, fel: 'Du är inte inloggad.' };

  const med = await sb.from('medarbetare').select('id, maskin_id').eq('user_id', uid).maybeSingle();
  if (med.error) return { ok: false, fel: LASFEL };
  if (!med.data?.maskin_id) return { ok: true, data: null };
  const medarbetareId = med.data.id as string;
  const maskinId = med.data.maskin_id as string;

  const [maskinRes, fragaRes, godkRes, pagRes, klarRes] = await Promise.all([
    sb.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ').eq('maskin_id', maskinId).maybeSingle(),
    sb.from('am_fraga').select('id, kod, text, hjalptext, maskin_typ, foto_url, ordning, stopp, foto_vid_ja').eq('aktiv', true),
    sb.from('am_uppgift_godkannande').select('id').eq('medarbetare_id', medarbetareId).eq('maskin_id', maskinId).eq('text_version', GODKANNANDE_VERSION).limit(1),
    sb.from('am_maskinkoll').select('id, am_svar(fraga_id, ok, foto_url, kommentar)').eq('maskin_id', maskinId).eq('medarbetare_id', medarbetareId).is('klar', null).order('startad', { ascending: false }).limit(1),
    sb.from('am_maskinkoll').select('klar').eq('maskin_id', maskinId).not('klar', 'is', null).order('klar', { ascending: false }).limit(1),
  ]);
  if (maskinRes.error || fragaRes.error || godkRes.error || pagRes.error || klarRes.error) return { ok: false, fel: LASFEL };

  const m = maskinRes.data as { maskin_id: string; visningsnamn: string | null; modell: string | null; maskin_typ: string | null } | null;
  const maskin: Maskin = { id: maskinId, namn: m?.visningsnamn || m?.modell || 'Din maskin', typ: m?.maskin_typ ?? null };
  const pag = (pagRes.data ?? [])[0] as { id: string; am_svar: Svar[] | null } | undefined;
  const senasteKlar = ((klarRes.data ?? [])[0] as { klar: string } | undefined)?.klar ?? null;

  return {
    ok: true,
    data: {
      medarbetareId,
      maskin,
      fragor: fragorFor((fragaRes.data ?? []) as Fraga[], maskin.typ),
      godkand: (godkRes.data ?? []).length > 0,
      pagaende: pag ? { id: pag.id, svar: pag.am_svar ?? [] } : null,
      senasteKlar,
      dags: arDags(senasteKlar, nu),
    },
  };
}

/** Startsidans märke: 1 när det är dags (eller en koll är påbörjad), annars 0. null = kunde inte läsas → inget märke. */
export async function hamtaMaskinkollVantar(sb: SupabaseClient): Promise<number | null> {
  const r = await hamtaLage(sb);
  if (!r.ok) return null;
  if (!r.data) return 0;
  return r.data.dags || r.data.pagaende ? 1 : 0;
}

export async function godkann(sb: SupabaseClient, medarbetareId: string, maskinId: string): Promise<string | null> {
  const { error } = await sb.from('am_uppgift_godkannande')
    .upsert({ medarbetare_id: medarbetareId, maskin_id: maskinId, text_version: GODKANNANDE_VERSION }, { onConflict: 'medarbetare_id,maskin_id,text_version', ignoreDuplicates: true });
  return error ? 'Kunde inte spara. Försök igen.' : null;
}

/** Skapar kollen vid FÖRSTA svaret (aldrig när vyn öppnas — inga tomma kollar). */
export async function startaKoll(sb: SupabaseClient, medarbetareId: string, maskinId: string): Promise<Las<string>> {
  const { data, error } = await sb.from('am_maskinkoll').insert({ medarbetare_id: medarbetareId, maskin_id: maskinId }).select('id').single();
  if (error || !data) return { ok: false, fel: 'Kunde inte starta maskinkollen. Försök igen.' };
  return { ok: true, data: data.id as string };
}

/** Ett svar. `fraga_text` = frågan som den löd NU (gamla kollar ändras aldrig när en fråga skrivs om). Läser tillbaka det skrivna. */
export async function sparaSvar(sb: SupabaseClient, kollId: string, fraga: Fraga, svar: { ok: boolean; foto_url: string | null; kommentar: string | null }): Promise<string | null> {
  const rad = { maskinkoll_id: kollId, fraga_id: fraga.id, fraga_text: fraga.text, ok: svar.ok, foto_url: svar.foto_url, kommentar: svar.kommentar?.trim() || null };
  const { data, error } = await sb.from('am_svar').upsert(rad, { onConflict: 'maskinkoll_id,fraga_id' }).select('ok, foto_url').single();
  if (error) return error.message?.includes('redan klar') ? 'Maskinkollen är redan klar.' : 'Svaret kunde inte sparas. Försök igen.';
  if (!data || data.ok !== svar.ok) return 'Svaret kunde inte sparas. Försök igen.';
  return null;
}

/** Avslutar: sätter klar. Databasen vägrar om något svar eller foto saknas; dess svenska meddelande visas som det är. */
export async function avsluta(sb: SupabaseClient, kollId: string): Promise<Las<string>> {
  const klar = new Date().toISOString();
  const { data, error } = await sb.from('am_maskinkoll').update({ klar }).eq('id', kollId).select('klar').single();
  if (error) {
    const m = error.message ?? '';
    return { ok: false, fel: /Svara på alla|Ta bilderna|redan klar/.test(m) ? m : 'Kunde inte avsluta maskinkollen. Försök igen.' };
  }
  if (!data?.klar) return { ok: false, fel: 'Kunde inte avsluta maskinkollen. Försök igen.' };
  return { ok: true, data: data.klar as string };
}

/** "Något är fel": föraren rapporterar ett fel utan en koll runt omkring. Blir en öppen åtgärd direkt. */
export async function rapporteraFel(
  sb: SupabaseClient,
  rad: { medarbetareId: string; maskinId: string; beskrivning: string; fotoUrl: string; stopp: boolean; id: string },
  nu: Date = new Date(),
): Promise<string | null> {
  const beskrivning = rad.beskrivning.trim() || 'Fel rapporterat av föraren';
  const { data, error } = await sb.from('am_atgard').insert({
    id: rad.id,
    kalla: 'forare',
    rapporterad_av: rad.medarbetareId,
    maskin_id: rad.maskinId,
    beskrivning,
    foto_url: rad.fotoUrl,
    stopp: rad.stopp,
    deadline: deadlineFor(rad.stopp, nu),
  }).select('id').single();
  // Ett omförsök efter ett svar som försvann: raden finns redan = sparat.
  if (error && error.code === '23505') return null;
  if (error || !data) return 'Kunde inte skicka. Försök igen.';
  return null;
}
