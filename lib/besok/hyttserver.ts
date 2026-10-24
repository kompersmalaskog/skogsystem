// Hyttens sida av besöken, på SERVERN. Förut läste och skrev hytten tabellerna direkt som inloggad användare, och RLS kunde bara fråga "är du inloggad?" — alltså kunde varje förare
// läsa alla besökares namn och telefonnummer och skriva en kvittens för vilken maskin och vilket besök som helst. Nu går allt hit:
//
//   • Läsa: bara admin, eller en maskin som är KOPPLAD till objektet (se maskinKopplad). Svaret har exakt de fält kortet visar, för det här objektet och den här maskinen.
//   • Kvittera ("Uppfattat"): servern avgör maskin (finns i dim_maskin och är kopplad), roll (ur dim_maskin.maskin_typ), förare (den inloggades egen medarbetare-rad) och testläge.
//     Klienten skickar bara VILKET besök och VILKEN maskin; allt annat den skickar ignoreras. Testläge: bara en admin som uttryckligen är inne via "Visar som maskin".
//   • Tiden sätts av databasen (trigger besok_tid_fran_servern).
//
// Rena från Next (ingen NextResponse): rutterna är tunna. Anroparen har redan autentiserat (lib/auth/server.kravInloggad) och ger sessionen hit.

import type { SupabaseClient } from '@supabase/supabase-js';
import { rollAvMaskintyp } from '@/lib/maskindatorStart';
import type { MaskinRoll } from './sakerhet';
import { BESOK_EFTERTID_MIN } from './konstanter';
import { arBesokAktivt } from './tid';
import type { Svar } from './server';

type Sb = SupabaseClient;

export type HyttSession = { medarbetareId: string | null; roll: string | null };

const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const arUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
export const arMaskinId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(s);

const arAdmin = (s: HyttSession) => s.roll === 'admin';

/** Hur långt tillbaka en hyttspårsrad räknas som "maskinen arbetar på objektet". */
const SPAR_DAGAR = 30;

/** Maskinens roll ur registret (dim_maskin.maskin_typ) – aldrig ur klienten. null = maskinen finns inte eller har okänd typ; 'fel' = registret gick inte att läsa. */
async function maskinRoll(sb: Sb, maskinId: string): Promise<MaskinRoll | null | 'fel'> {
  const r = await sb.from('dim_maskin').select('maskin_id, maskin_typ').eq('maskin_id', maskinId).maybeSingle();
  if (r.error) return 'fel';
  if (!r.data) return null;
  return rollAvMaskintyp((r.data as { maskin_typ: string | null }).maskin_typ);
}

/**
 * Är maskinen kopplad till objektet? Tre sätt, i den ordningen:
 *   1. den är tilldelad objektet (objekt.skordare_maskin_id / skotare_maskin_id),
 *   2. den står i objektets maskinkö (maskin_ko),
 *   3. den har loggat hyttspår på objektet de senaste SPAR_DAGAR dagarna (den arbetar där).
 * `'fel'` när något inte gick att läsa – ett läsfel är aldrig ett "ja".
 */
export async function maskinKopplad(sb: Sb, objektId: string, maskinId: string, nu: Date = new Date()): Promise<boolean | 'fel'> {
  const o = await sb.from('objekt').select('id, skordare_maskin_id, skotare_maskin_id').eq('id', objektId).maybeSingle();
  if (o.error) return 'fel';
  if (!o.data) return false;
  const rad = o.data as { skordare_maskin_id: string | null; skotare_maskin_id: string | null };
  if (rad.skordare_maskin_id === maskinId || rad.skotare_maskin_id === maskinId) return true;

  const k = await sb.from('maskin_ko').select('maskin_id').eq('objekt_id', objektId).eq('maskin_id', maskinId).limit(1);
  if (k.error) return 'fel';
  if (Array.isArray(k.data) && k.data.length > 0) return true;

  const fran = new Date(nu.getTime() - SPAR_DAGAR * 86400000).toISOString().slice(0, 10);
  const s = await sb.from('hyttspar').select('id').eq('objekt_id', objektId).eq('maskin_id', maskinId).gte('datum', fran).limit(1);
  if (s.error) return 'fel';
  return Array.isArray(s.data) && s.data.length > 0;
}

type Behorighet = { ok: true; roll: MaskinRoll; testlage: boolean } | { ok: false; svar: Svar };

/**
 * Får den här sessionen agera som maskinen på objektet?
 *   • maskinen måste finnas i registret med en känd roll,
 *   • admin som ber om testläge: maskinen behöver inte vara kopplad (det är ett test, och kvittensen märks `testlage`),
 *   • alla andra (förare, och admin utan testläge): maskinen måste vara kopplad till objektet.
 */
async function prova(sb: Sb, s: HyttSession, objektId: string, maskinId: string, begartTest: boolean, nu: Date): Promise<Behorighet> {
  const roll = await maskinRoll(sb, maskinId);
  if (roll === 'fel') return { ok: false, svar: FEL(503, 'Kunde inte läsa just nu') };
  if (!roll) return { ok: false, svar: FEL(403, 'Maskinen är inte kopplad till objektet') };   // samma text som "inte kopplad": ingen ledtråd om vilka maskiner som finns
  const test = arAdmin(s) && begartTest;
  if (!test) {
    const k = await maskinKopplad(sb, objektId, maskinId, nu);
    if (k === 'fel') return { ok: false, svar: FEL(503, 'Kunde inte läsa just nu') };
    if (!k) return { ok: false, svar: FEL(403, 'Maskinen är inte kopplad till objektet') };
  }
  return { ok: true, roll, testlage: test };
}

// ---- GET /api/besok/hytt?objekt=…&maskin=…[&test=1] ---------------------------------------------------------------------------------------

export type HyttSvarBesok = { id: string; namn: string; telefon: string; besokstid: string };

export async function hyttBesok(sb: Sb, s: HyttSession, q: { objekt: unknown; maskin: unknown; test?: unknown }, nu: Date = new Date()): Promise<Svar> {
  if (!s.medarbetareId) return FEL(403, 'Ingen medarbetare kopplad till inloggningen');
  if (!arUuid(q.objekt) || !arMaskinId(q.maskin)) return FEL(400, 'Ogiltig begäran');
  const p = await prova(sb, s, q.objekt, q.maskin, q.test === '1' || q.test === true, nu);
  if (!p.ok) return p.svar;

  const fran = new Date(nu.getTime() - BESOK_EFTERTID_MIN * 60000).toISOString();
  const b = await sb.from('objekt_besok').select('id, namn, telefon, besokstid').eq('objekt_id', q.objekt).gte('besokstid', fran).order('besokstid', { ascending: true });
  if (b.error) return FEL(503, 'Kunde inte läsa just nu');
  const besok = ((b.data ?? []) as HyttSvarBesok[]).filter((x) => arBesokAktivt(x.besokstid, nu));
  let kvitterade: string[] = [];
  if (besok.length) {
    const k = await sb.from('objekt_besok_kvittens').select('besok_id').eq('maskin_id', q.maskin).in('besok_id', besok.map((x) => x.id));
    if (k.error) return FEL(503, 'Kunde inte läsa just nu');
    kvitterade = ((k.data ?? []) as { besok_id: string }[]).map((x) => x.besok_id);
  }
  // Exakt de fält kortet visar. Ingen skapad_at, inga andra maskiners kvittenser, inga förare.
  return { status: 200, body: { ok: true, besok: besok.map((x) => ({ id: x.id, namn: x.namn, telefon: x.telefon, besokstid: x.besokstid })), kvitterade, testlage: p.testlage } };
}

// ---- POST /api/besok/hytt/kvittera ---------------------------------------------------------------------------------------------------------

/**
 * Kvittensen. Av klienten används BARA `besok_id`, `maskin_id` och (för admin) `testlage`. `roll`, `forare_id`, `kvitterad_at` och `testlage` för alla andra
 * avgörs här – en förare som skickar med `testlage: true`, en annan `forare_id` eller en annan `roll` får det ignorerat.
 */
export async function kvitteraBesok(sb: Sb, s: HyttSession, body: unknown, nu: Date = new Date()): Promise<Svar> {
  if (!s.medarbetareId) return FEL(403, 'Ingen medarbetare kopplad till inloggningen');
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!arUuid(b.besok_id) || !arMaskinId(b.maskin_id)) return FEL(400, 'Ogiltig begäran');

  const bs = await sb.from('objekt_besok').select('id, objekt_id, besokstid').eq('id', b.besok_id).maybeSingle();
  if (bs.error) return FEL(503, 'Kunde inte spara just nu');
  if (!bs.data) return FEL(404, 'Besöket finns inte');
  const besok = bs.data as { id: string; objekt_id: string; besokstid: string };
  if (!arBesokAktivt(besok.besokstid, nu)) return FEL(410, 'Besöket är över');

  const p = await prova(sb, s, besok.objekt_id, b.maskin_id, b.testlage === true, nu);
  if (!p.ok) return p.svar;

  // Redan kvitterat av den här maskinen: lyckat och orört (den första kvittensen är beviset – tiden skrivs aldrig över).
  const ins = await sb.from('objekt_besok_kvittens').upsert(
    { besok_id: besok.id, maskin_id: b.maskin_id, roll: p.roll, forare_id: s.medarbetareId, testlage: p.testlage },
    { onConflict: 'besok_id,maskin_id', ignoreDuplicates: true },
  );
  if (ins.error) return FEL(503, 'Kunde inte spara just nu');
  return { status: 200, body: { ok: true } };
}
