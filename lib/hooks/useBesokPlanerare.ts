'use client';

// Planerarens läsning och skrivning för besöksflödet (ⓘ-kortet i planeringsläget): länken (skapas första gången, kan stängas av), alla anmälningar med kvittenser, SMS-loggen och avsändarens namn/telefon.
// Allt via inloggad klient + RLS (migration 20261022170000_besok_pa_trakten): länken via funktionerna besok_lank_hamta / besok_lank_satt_aktiv (bara admin).
// Saknas migrationen (tabellerna finns inte) sätts `migrering: false` och kortet säger det i klartext — aldrig en tyst tom logg.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BesokRad, KvittensRad, SmsHandelse, SmsRad } from '@/lib/besok/planerare';

export type PlanerareState = {
  laddat: boolean;
  /** false = tabellerna finns inte (migrationen ej körd) */
  migrering: boolean;
  fel: string | null;
  lank: { token: string; aktiv: boolean } | null;
  besok: BesokRad[];
  kvittenser: KvittensRad[];
  sms: SmsRad[];
  maskinNamn: Record<string, string>;
  personNamn: Record<string, string>;
  avsandare: { id: string; namn: string | null; telefon: string | null } | null;
};

const TOM: PlanerareState = { laddat: false, migrering: true, fel: null, lank: null, besok: [], kvittenser: [], sms: [], maskinNamn: {}, personNamn: {}, avsandare: null };
const saknasTabell = (m?: string | null) => /does not exist|schema cache|PGRST205|42P01/i.test(m ?? '');

const SMS_KOLUMNER = 'id, oppnad_av, oppnad_at, mottagare_namn, mottagare_nummer';
const saknasHandelse = (m?: string | null) => /handelse/i.test(m ?? '');

/** SMS-loggen. Före migrationen 20261023190000 finns inte kolumnen `handelse`: då läses raderna utan den och räknas som 'oppnad' (alltså aldrig som skickade). */
async function lasSms(id: string): Promise<{ data: SmsRad[] | null; error: { message: string } | null }> {
  const fraga = (kol: string) => supabase.from('objekt_besok_sms').select(kol).eq('objekt_id', id).order('oppnad_at', { ascending: false }).limit(50);
  const a = await fraga(`${SMS_KOLUMNER}, handelse`);
  if (!a.error) return { data: (a.data ?? []) as unknown as SmsRad[], error: null };
  if (!saknasHandelse(a.error.message)) return { data: null, error: a.error };
  const b = await fraga(SMS_KOLUMNER);
  if (b.error) return { data: null, error: b.error };
  return { data: ((b.data ?? []) as unknown as Omit<SmsRad, 'handelse'>[]).map((r) => ({ ...r, handelse: 'oppnad' as SmsHandelse })), error: null };
}

export function useBesokPlanerare({ objektId, aktiv, skapaLank }: { objektId: string | null; aktiv: boolean; skapaLank: boolean }) {
  const [s, setS] = useState<PlanerareState>(TOM);
  const objektRef = useRef(objektId);
  objektRef.current = objektId;
  // Länken hämtas (och skapas) EN gång per objekt — inte vid varje omläsning.
  const lankRef = useRef<PlanerareState['lank']>(null);

  const las = useCallback(async () => {
    const id = objektRef.current;
    if (!id) return;
    try {
      const [b, sm, mask, med, me] = await Promise.all([
        supabase.from('objekt_besok').select('id, namn, telefon, besokstid, skapad_at').eq('objekt_id', id).order('skapad_at', { ascending: false }).limit(100),
        lasSms(id),
        supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell'),
        supabase.from('medarbetare').select('id, namn'),
        supabase.auth.getUser().then(async ({ data }) => data.user?.id
          ? supabase.from('medarbetare').select('id, namn, telefon').eq('user_id', data.user.id).maybeSingle()
          : { data: null, error: null }),
      ]);
      if (objektRef.current !== id) return;
      if (b.error || sm.error) {
        const m = b.error?.message ?? sm.error?.message ?? '';
        setS((p) => ({ ...p, laddat: true, migrering: !saknasTabell(m), fel: saknasTabell(m) ? null : m }));
        return;
      }
      const besok = (b.data ?? []) as BesokRad[];
      const k = besok.length
        ? await supabase.from('objekt_besok_kvittens').select('besok_id, maskin_id, roll, forare_id, kvitterad_at, testlage').in('besok_id', besok.map((x) => x.id))
        : { data: [] as KvittensRad[], error: null };
      let lank: PlanerareState['lank'] = lankRef.current;
      if (skapaLank && !lank) {
        const r = await supabase.rpc('besok_lank_hamta', { p_objekt: id });
        const rad = Array.isArray(r.data) ? r.data[0] : r.data;
        if (!r.error && rad?.token) { lank = { token: String(rad.token), aktiv: !!rad.aktiv }; lankRef.current = lank; }
      }
      if (objektRef.current !== id) return;
      const maskinNamn: Record<string, string> = {};
      for (const m of ((mask.data ?? []) as { maskin_id: string; visningsnamn: string | null; modell: string | null }[])) maskinNamn[m.maskin_id] = m.visningsnamn || m.modell || m.maskin_id;
      const personNamn: Record<string, string> = {};
      for (const m of ((med.data ?? []) as { id: string; namn: string }[])) personNamn[m.id] = m.namn;
      const jag = me.data as { id: string; namn: string | null; telefon: string | null } | null;
      setS((p) => ({
        laddat: true, migrering: true, fel: k.error ? k.error.message : null,
        lank: lank ?? p.lank, besok, kvittenser: (k.data ?? []) as KvittensRad[], sms: sm.data ?? [],
        maskinNamn, personNamn, avsandare: jag ? { id: jag.id, namn: jag.namn, telefon: jag.telefon } : null,
      }));
    } catch (e) {
      setS((p) => ({ ...p, laddat: true, fel: e instanceof Error ? e.message : 'Kunde inte läsa besöken' }));
    }
  }, [skapaLank]);

  useEffect(() => {
    if (!aktiv || !objektId) return;
    setS(TOM);
    lankRef.current = null;
    las();
    const t = setInterval(() => { if (document.visibilityState === 'visible') las(); }, 10000);
    return () => clearInterval(t);
  }, [aktiv, objektId, las]);

  /** Slå på/av länken. Returnerar felet (null = gick bra). */
  const sattAktiv = useCallback(async (pa: boolean): Promise<string | null> => {
    const id = objektRef.current;
    if (!id) return 'Inget objekt';
    const r = await supabase.rpc('besok_lank_satt_aktiv', { p_objekt: id, p_aktiv: pa });
    if (r.error) return r.error.message;
    if (lankRef.current) lankRef.current = { ...lankRef.current, aktiv: pa };
    setS((p) => (p.lank ? { ...p, lank: { ...p.lank, aktiv: pa } } : p));
    return null;
  }, []);

  /** Loggar en händelse i SMS-loggen (bara admin får skriva). 'oppnad'/'kopierad' = knappen trycktes; 'skickad'/'ej_skickad' = planeraren svarade på frågan. Ett fel stoppar aldrig SMS:et. */
  const loggaSms = useCallback(async (a: { avsandareId: string | null; mottagareNamn: string | null; mottagareNummer: string | null; handelse?: SmsHandelse }): Promise<string | null> => {
    const id = objektRef.current;
    if (!id) return 'Inget objekt';
    const handelse: SmsHandelse = a.handelse ?? 'oppnad';
    const rad = { objekt_id: id, oppnad_av: a.avsandareId, mottagare_namn: a.mottagareNamn, mottagare_nummer: a.mottagareNummer };
    let r = await supabase.from('objekt_besok_sms').insert({ ...rad, handelse }).select(`${SMS_KOLUMNER}, handelse`).single();
    // Före migrationen finns ingen `handelse`: 'oppnad'/'kopierad' loggas ändå (utan kolumnen), men ett svar på frågan sparas aldrig – det vore en rad som ser ut som en öppning.
    if (r.error && saknasHandelse(r.error.message) && (handelse === 'oppnad' || handelse === 'kopierad')) r = await supabase.from('objekt_besok_sms').insert(rad).select(SMS_KOLUMNER).single();
    if (r.error) return r.error.message;
    const ny = { handelse, ...(r.data as object) } as unknown as SmsRad;
    setS((p) => ({ ...p, sms: [ny, ...p.sms] }));
    return null;
  }, []);

  return { ...s, sattAktiv, loggaSms, laddaOm: las };
}
