// Tillbud och olyckor mot databasen (tabellen am_tillbud, migration *_arbetsmiljo_tillbud.sql), och nödsidans data.
// Databasen gör resten: varje rapport blir en åtgärd (kalla 'tillbud') och en push till admin och skyddsombud.
// Ärligt: ett läsfel är ett fel, aldrig en tom lista.

import type { SupabaseClient } from '@supabase/supabase-js';
import { giltigAndring, type KortAndring, type Kontakt, type Larmplats, type NodData } from './nod';
import { hamta as hamtaInstruktioner } from './saGorVi';

export type TillbudTyp = 'tillbud' | 'olycka';

/** Föraren svarar på EN fråga: skadades någon? */
export const TYP_VAL: { typ: TillbudTyp; titel: string; under: string }[] = [
  { typ: 'tillbud', titel: 'Det var nära att hända något', under: 'Ingen skadades' },
  { typ: 'olycka', titel: 'Någon skadades', under: 'En olycka' },
];

export function typText(typ: TillbudTyp): string {
  return typ === 'olycka' ? 'Olycka' : 'Tillbud';
}

/** Vem rapporterar, och från vilken maskin. `null` maskin = föraren har ingen (rapporten går ändå). */
export async function hamtaRapportor(sb: SupabaseClient): Promise<{ ok: true; medarbetareId: string; maskinId: string | null } | { ok: false; fel: string }> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { ok: false, fel: 'Du är inte inloggad.' };
  const { data, error } = await sb.from('medarbetare').select('id, maskin_id').eq('user_id', uid).maybeSingle();
  if (error || !data) return { ok: false, fel: 'Kunde inte läsa vem du är. Försök igen.' };
  return { ok: true, medarbetareId: data.id as string, maskinId: (data.maskin_id as string | null) ?? null };
}

export type TillbudRad = {
  id: string;
  typ: TillbudTyp;
  situation: string | null;
  beskrivning: string;
  fotoUrl: string | null;
  maskinId: string | null;
  lat: number | null;
  lng: number | null;
  medarbetareId: string;
};

/** Skickar rapporten. Ett omförsök efter ett svar som försvann (samma id finns redan) räknas som skickat. */
export async function rapporteraTillbud(sb: SupabaseClient, r: TillbudRad): Promise<string | null> {
  const beskrivning = r.beskrivning.trim();
  if (!beskrivning) return 'Skriv vad som hände.';
  const { data, error } = await sb.from('am_tillbud').insert({
    id: r.id,
    typ: r.typ,
    situation: r.situation,
    beskrivning,
    foto_url: r.fotoUrl,
    maskin_id: r.maskinId,
    lat: r.lat,
    lng: r.lng,
    rapporterad_av: r.medarbetareId,
  }).select('id').single();
  if (error && error.code === '23505') return null;
  if (error || !data) return 'Kunde inte skicka. Försök igen.';
  return null;
}

/** Det åtgärdsarket visar om ett tillbud. */
export type TillbudInfo = { tillbudId: string; typ: TillbudTyp; anmaldTid: string | null; anmaldAvNamn: string | null };

/** En olycka som inte markerats anmäld till Arbetsmiljöverket — raden i åtgärdslistan säger det (och admin får en påminnelse, lib/arbetsmiljo/anmalNotis). */
export function ejAnmald(t: TillbudInfo | null | undefined): boolean {
  return !!t && t.typ === 'olycka' && !t.anmaldTid;
}

/** Tillbuden bakom åtgärderna, nycklade på åtgärdens id. Läsfel → null (arket visar då inget om anmälan). */
export async function hamtaTillbudInfo(sb: SupabaseClient): Promise<Map<string, TillbudInfo> | null> {
  let res: { data: unknown; error: unknown };
  try { res = await sb.from('am_atgard').select('id, tillbud:tillbud_id(id, typ, anmald_tid, anmald_av)').eq('kalla', 'tillbud'); }
  catch { return null; }
  const { data, error } = res;
  if (error || !Array.isArray(data)) return null;
  const ut = new Map<string, TillbudInfo>();
  for (const rad of data as any[]) {
    const t = Array.isArray(rad.tillbud) ? rad.tillbud[0] : rad.tillbud;
    if (!t) continue;
    ut.set(rad.id, { tillbudId: t.id, typ: t.typ === 'olycka' ? 'olycka' : 'tillbud', anmaldTid: t.anmald_tid ?? null, anmaldAvNamn: null });
  }
  return ut;
}

/** Admin markerar att tillbudet är anmält till Arbetsmiljöverket. Databasen sätter när och vem. Läser tillbaka. */
export async function markeraAnmald(sb: SupabaseClient, tillbudId: string): Promise<{ ok: true; tid: string } | { ok: false; fel: string }> {
  const { data, error } = await sb.from('am_tillbud').update({ anmald_tid: new Date().toISOString() }).eq('id', tillbudId).select('anmald_tid');
  if (error) return { ok: false, fel: 'Kunde inte spara. Försök igen.' };
  const tid = (data?.[0] as { anmald_tid: string | null } | undefined)?.anmald_tid;
  if (!tid) return { ok: false, fel: 'Kunde inte spara. Bara arbetsledningen kan markera det.' };
  return { ok: true, tid };
}

export const ANMAL_LANK = 'https://anmalarbetsskada.se';

/** Nödsidans data: vem man ringer och traktenas larmplatser. Läsfel → null (sidan använder det som finns sparat). */
export async function hamtaNodData(sb: SupabaseClient, nu: number = Date.now()): Promise<NodData | null> {
  const [k, o, r, instruktioner] = await Promise.all([
    sb.rpc('am_nodkontakter'),
    sb.from('am_rutinkort').select('id, titel, steg1, steg2, steg3, andrad_tid'),
    sb.from('objekt').select('id, namn, larmkoordinat_lat, larmkoordinat_lng, larmkoordinat_beskrivning, status')
      .not('larmkoordinat_lat', 'is', null).not('larmkoordinat_lng', 'is', null).neq('status', 'avslutat'),
    // Så gör vi: ett tillägg. Kunde de inte läsas saknas fältet (slaIhopNod behåller det som var sparat).
    hamtaInstruktioner(sb).catch(() => null),
  ]);
  if (k.error || o.error || !Array.isArray(k.data) || !Array.isArray(o.data)) return null;
  const kontakter: Kontakt[] = (k.data as { namn: string | null; telefon: string | null }[])
    .filter(r => r.namn && r.telefon)
    .map(r => ({ namn: r.namn as string, telefon: r.telefon as string }));
  const larmplatser: Larmplats[] = (o.data as any[])
    .map(r => ({ objektId: r.id as string, namn: (r.namn as string) || 'Trakten', lat: Number(r.larmkoordinat_lat), lng: Number(r.larmkoordinat_lng), beskrivning: r.larmkoordinat_beskrivning?.trim() || null }))
    .filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lng));
  // Korten är ett tillägg: kunde de inte läsas saknas `andringar` (slaIhopNod behåller då det som var sparat).
  const andringar: KortAndring[] | undefined = r.error || !Array.isArray(r.data) ? undefined
    : (r.data as any[]).map(x => ({ id: x.id, titel: x.titel, steg: [x.steg1, x.steg2, x.steg3] as [string, string, string], andradTid: x.andrad_tid ?? null })).filter(giltigAndring);
  return { kontakter, larmplatser, hamtad: nu, ...(andringar ? { andringar } : {}), ...(instruktioner ? { instruktioner } : {}) };
}

/** Admin sparar ett korts rubrik och steg. Läser tillbaka raden. null = sparat; annars felet i ord. */
export async function sparaKort(sb: SupabaseClient, a: { id: string; titel: string; steg: [string, string, string] }): Promise<string | null> {
  const titel = a.titel.trim(); const steg = a.steg.map(s => s.trim());
  if (!titel || steg.some(s => !s)) return 'Fyll i rubriken och alla tre stegen.';
  const { data, error } = await sb.from('am_rutinkort').upsert({ id: a.id, titel, steg1: steg[0], steg2: steg[1], steg3: steg[2] }).select('titel, steg1, steg2, steg3').maybeSingle();
  if (error || !data) return 'Kunde inte spara. Försök igen.';
  const d = data as { titel: string; steg1: string; steg2: string; steg3: string };
  if (d.titel !== titel || d.steg1 !== steg[0] || d.steg2 !== steg[1] || d.steg3 !== steg[2]) return 'Kunde inte spara. Försök igen.';
  return null;
}

/** Tillbaka till appens text: ändringen tas bort. */
export async function aterstallKort(sb: SupabaseClient, id: string): Promise<string | null> {
  const { error } = await sb.from('am_rutinkort').delete().eq('id', id);
  return error ? 'Kunde inte spara. Försök igen.' : null;
}
