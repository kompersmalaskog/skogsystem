// Besök till MASKINEN som push. Den lokala notisen (lib/hytt/notiser, skapad av sidan) kommer bara när sidan lever och dess timers inte är strypta; Chrome stryper ett dolt fönster
// till ~1 gång i minuten efter 5 minuter. En push från servern väcker service workern oavsett — så en anmälan når hytten även när Opti ligger framme.
//
// Mottagare = prenumerationer med push_subscriptions.maskin_id = en maskin som hör till objektet (samma regel som besökssidan och "ej sett"-pushen: lib/besok/maskinerPaBesok).
// Aldrig personen: förarens telefon har maskin_id = null och får inget härifrån, och det spelar ingen roll vem som är inloggad i maskinen.
// Allt är best effort: en anmälan sparas även om pushen faller, och ett fel här får aldrig fälla markägarens anmälan.

import type { SupabaseClient } from '@supabase/supabase-js';
import { besokNotis, type HyttNotis } from './notiser';
import { maskinerPaObjekt } from '@/lib/besok/maskinerPaBesok';

export type PushSkick = (subscription: unknown, payload: string) => Promise<void>;

/** Det service workern får. `hyttNotis` är samma form som sidan skapar lokalt, så en server-push och en lokal notis ser likadana ut och delar tag (den senare ersätter den förra). */
export type MaskinPushPayload = { hyttNotis: HyttNotis };

export type MaskinPushRapport = { ok: boolean; maskiner: number; prenumerationer: number; skickade: number; fel?: string };

type BesokRad = { id: string; namn: string; besokstid: string };

/** Notisen en maskin ska få för ett besök. Maskin-id:t är PRENUMERATIONENS maskin – det är det Uppfattat kvitterar för. */
export function besokPush(b: BesokRad, a: { trakt: string; maskinId: string; nu: Date }): MaskinPushPayload {
  return { hyttNotis: besokNotis({ id: b.id, namn: b.namn, besokstid: b.besokstid }, { trakt: a.trakt, maskinId: a.maskinId, test: false, url: '/planering', nu: a.nu, paminnelse: false }) };
}

export async function skickaBesokTillMaskiner(sb: SupabaseClient, skicka: PushSkick, b: BesokRad & { objekt_id: string }, nu: Date = new Date()): Promise<MaskinPushRapport> {
  const tom = (fel?: string): MaskinPushRapport => ({ ok: !fel, maskiner: 0, prenumerationer: 0, skickade: 0, ...(fel ? { fel } : {}) });
  let maskiner;
  try { maskiner = (await maskinerPaObjekt(sb, [b.objekt_id], nu)).get(b.objekt_id) ?? []; }
  catch (e) { return tom(e instanceof Error ? e.message : String(e)); }
  if (maskiner.length === 0) return tom();

  const o = await sb.from('objekt').select('namn').eq('id', b.objekt_id).maybeSingle();
  const trakt = ((o.data as { namn?: string | null } | null)?.namn ?? '').trim();

  const s = await sb.from('push_subscriptions').select('id, subscription, maskin_id').in('maskin_id', maskiner.map((m) => m.maskinId));
  if (s.error) return { ...tom(`push_subscriptions: ${s.error.message}`), maskiner: maskiner.length };   // saknas kolumnen (migrationen ej körd) är det ett fel som sägs, inte en tyst tomhet
  const subs = (s.data ?? []) as { id: string; subscription: unknown; maskin_id: string }[];

  let skickade = 0;
  const doda: string[] = [];
  for (const sub of subs) {
    try {
      await skicka(sub.subscription, JSON.stringify(besokPush(b, { trakt, maskinId: sub.maskin_id, nu })));
      skickade++;
    } catch (e) {
      const kod = (e as { statusCode?: number } | null)?.statusCode;
      if (kod === 410 || kod === 404) doda.push(sub.id);
    }
  }
  if (doda.length) await sb.from('push_subscriptions').delete().in('id', doda);
  return { ok: true, maskiner: maskiner.length, prenumerationer: subs.length, skickade };
}
