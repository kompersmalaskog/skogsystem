'use client';
// Förarens markeringar på produktionshögarna (tabellen skotar_hog_markering). Läser objektets markeringar, lägger till (tryck "Tagen"/"Ligger kvar",
// eller ett streck) och tar bort (Ångra). En markering är sparad när den ligger på enheten: utan täckning skickas den när nätet kommer
// (localStorage, samma id → ett omförsök ger aldrig två rader). Saknas tabellen (migrationen ej körd) är `tillganglig` false och inget skrivs —
// kartan räknar då som förut. I testläget (`torr`) sparas allt bara i minnet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { lasMarkeringRad, type HogMarkering } from '@/lib/skotarHogarKvar';

const KO_NYCKEL = 'skotar_hog_markering_ko_v1';
type KoPost = { op: 'ny'; rad: HogMarkering & { objekt_id: string; maskin_id: string | null; skapad_av: string } } | { op: 'bort'; id: string; objekt_id: string };

const lasKo = (): KoPost[] => { try { return JSON.parse(localStorage.getItem(KO_NYCKEL) || '[]') || []; } catch { return []; } };
const sparaKo = (k: KoPost[]): void => { try { localStorage.setItem(KO_NYCKEL, JSON.stringify(k)); } catch { /* minnet räcker tills sidan laddas om */ } };
const saknasTabell = (e: { code?: string } | null): boolean => !!e && (e.code === 'PGRST205' || e.code === '42P01');

const nyttId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export interface HogMarkeringarIn {
  objektId: string | null | undefined;
  minId: string | null;
  maskinId: string | null;
  /** Testläget: allt i minnet, inget skickas. */
  torr: boolean;
}

export function useHogMarkeringar({ objektId, minId, maskinId, torr }: HogMarkeringarIn) {
  const [markeringar, setMarkeringar] = useState<HogMarkering[]>([]);
  const [tillganglig, setTillganglig] = useState(true);
  const [vantar, setVantar] = useState(0);
  const objRef = useRef(objektId);
  objRef.current = objektId;

  const tomKo = useCallback(async () => {
    if (torr) return;
    let ko = lasKo();
    while (ko.length) {
      const p = ko[0];
      const { error } = p.op === 'ny'
        ? await supabase.from('skotar_hog_markering').insert({
          id: p.rad.id, objekt_id: p.rad.objekt_id, typ: p.rad.typ, geometri: p.rad.geometri, bredd_m: p.rad.bredd_m,
          grupp: p.rad.grupp, maskin_id: p.rad.maskin_id, skapad_av: p.rad.skapad_av,
        })
        : await supabase.from('skotar_hog_markering').delete().eq('id', p.id);
      // 23505 = raden finns redan (ett tidigare försök kom fram). Rättighetsfel blir aldrig bättre: posten släpps.
      if (error && error.code !== '23505' && error.code !== '42501' && !saknasTabell(error)) break;
      if (saknasTabell(error)) { setTillganglig(false); break; }
      ko = lasKo().slice(1);
      sparaKo(ko);
    }
    setVantar(lasKo().length);
  }, [torr]);

  const las = useCallback(async () => {
    const id = objRef.current;
    if (!id) { setMarkeringar([]); return; }
    if (torr) return;
    await tomKo();
    const { data, error } = await supabase.from('skotar_hog_markering')
      .select('id, typ, geometri, bredd_m, grupp, skapad_at').eq('objekt_id', id).order('skapad_at');
    if (objRef.current !== id) return;
    if (saknasTabell(error)) { setTillganglig(false); setMarkeringar([]); return; }
    if (error) { console.warn('[hogmarkering] kunde inte läsa', error.message); return; }
    setTillganglig(true);
    const server = (data ?? []).map((r) => lasMarkeringRad(r as Record<string, unknown>)).filter((m): m is HogMarkering => !!m);
    // Det som väntar på enheten ligger ovanpå (nya läggs till, borttagna tas bort) så att inget hoppar tillbaka.
    const ko = lasKo().filter((p) => (p.op === 'ny' ? p.rad.objekt_id : p.objekt_id) === id);
    const borta = new Set(ko.filter((p) => p.op === 'bort').map((p) => (p as { id: string }).id));
    const nya = ko.filter((p) => p.op === 'ny').map((p) => (p as { rad: HogMarkering }).rad).filter((r) => !server.some((s) => s.id === r.id));
    setMarkeringar([...server, ...nya].filter((m) => !borta.has(m.id)));
  }, [torr, tomKo]);

  useEffect(() => {
    setMarkeringar([]);
    void las();
  }, [objektId, las]);

  useEffect(() => {
    if (torr) return;
    const pa = () => { void tomKo(); };
    window.addEventListener('online', pa);
    const t = setInterval(() => { if (lasKo().length) void tomKo(); }, 30_000);
    return () => { window.removeEventListener('online', pa); clearInterval(t); };
  }, [torr, tomKo]);

  /** Lägg till. Returnerar id:t (för Ångra) eller null när det inte går (tabellen saknas, ingen inloggning, inget objekt). */
  const lagg = useCallback((m: Omit<HogMarkering, 'id' | 'skapad_at'>): string | null => {
    const objekt = objRef.current;
    if (!objekt || !tillganglig || (!torr && !minId)) return null;
    const rad: HogMarkering = { ...m, id: nyttId(), skapad_at: new Date().toISOString() };
    setMarkeringar((f) => [...f, rad]);
    if (!torr && minId) {
      sparaKo([...lasKo(), { op: 'ny', rad: { ...rad, objekt_id: objekt, maskin_id: maskinId, skapad_av: minId } }]);
      void tomKo();
    }
    return rad.id;
  }, [tillganglig, torr, minId, maskinId, tomKo]);

  /** Ångra en egen markering. */
  const taBort = useCallback((id: string) => {
    const objekt = objRef.current;
    setMarkeringar((f) => f.filter((m) => m.id !== id));
    if (torr || !objekt) return;
    const ko = lasKo();
    const ovant = ko.findIndex((p) => p.op === 'ny' && p.rad.id === id);
    if (ovant >= 0) { ko.splice(ovant, 1); sparaKo(ko); setVantar(ko.length); return; } // aldrig skickad: bara bort ur kön
    sparaKo([...ko, { op: 'bort', id, objekt_id: objekt }]);
    void tomKo();
  }, [torr, tomKo]);

  return { markeringar, tillganglig, vantar, lagg, taBort, lasOm: las };
}
