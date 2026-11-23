'use client';

// Kommentarerna på kartan för ett objekt (tabellen kartkommentar): serverns rader med den lokala kön (lib/kartkommentarKo) lagd OVANPÅ, så en kommentar syns
// direkt och märks "väntar" tills den nått servern. En hook så att sidan och testerna kör exakt samma kod.

import { kompletteraNamn } from '@/lib/medarbetarNamn';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  arViktigtKolumnSaknas, harInnehall, kanRaderaKommentar, laggKoOvanpa, rensaViktigt, senasteLarmKommentarer, sorteraKommentarer,
  type KommentarRad, type KommentarVy,
} from '@/lib/kartkommentar';
import { laggIKo, prenumereraKartkommentarKo, vantandePosterFor, type KoDb } from '@/lib/kartkommentarKo';

export interface KartkommentarerIn {
  /** Objektet som skrivs till (kommentarer läggs alltid här). */
  objektId: string | undefined;
  /** Objekt vars kommentarer visas (ett GROT-jobb visar även virkesobjektets). Default [objektId]. */
  lasObjektIds?: readonly string[];
  /** Inloggad medarbetares id och namn (författaren). Null = ingen kan skriva. */
  minId: string | null;
  minNamn: string | null;
  /** Admin får radera andras kommentarer (aldrig ändra deras text). */
  arAdmin?: boolean;
  db?: KoDb;
}

export interface KartkommentarerUt {
  /** Alla kommentarer för objektet (server + väntande), äldst först. */
  rader: KommentarVy[];
  /** false tills första läsningen är klar; `lasFel` = läsningen gick inte att göra (då visas bara det som väntar). */
  laddad: boolean;
  lasFel: boolean;
  /** Kolumnen `viktigt` finns och gick att läsa: först då visas Viktigt-fältet (före migrationen går en Viktigt-rad inte att spara). */
  viktigtStod: boolean;
  /** `text` = Övrigt, `viktigt` = Viktigt-raden. Minst ett av dem krävs. */
  lagg: (nyckel: string, text: string, viktigt?: string | null) => void;
  andra: (id: string, text: string, viktigt?: string | null) => void;
  radera: (id: string) => void;
  /** Larmkortets rad per nyckel: den senaste kommentaren med namn ("Daniel: Stolpe lutar"). */
  larmKommentarer: Record<string, string>;
}

export function useKartkommentarer(i: KartkommentarerIn): KartkommentarerUt {
  const db = (i.db ?? (supabase as unknown as KoDb));
  const dbRef = useRef(db); dbRef.current = db;
  const [server, setServer] = useState<KommentarRad[]>([]);
  const [laddad, setLaddad] = useState(false);
  const [lasFel, setLasFel] = useState(false);
  const [viktigtStod, setViktigtStod] = useState(false);
  const [koVersion, setKoVersion] = useState(0);
  const idn = (i.lasObjektIds && i.lasObjektIds.length ? [...i.lasObjektIds] : i.objektId ? [i.objektId] : []);
  const idNyckel = idn.join(',');

  const las = useCallback(async () => {
    if (!idNyckel) { setServer([]); setLaddad(true); setLasFel(false); return; }
    try {
      const fraga = (kolumner: string) => dbRef.current.from('kartkommentar')
        .select(kolumner)
        .in('objekt_id', idNyckel.split(','))
        .order('skapad_at', { ascending: true });
      let { data, error } = await fraga('id, objekt_id, yta_nyckel, text, viktigt, skapad_av, skapad_at, andrad_at, medarbetare:skapad_av(namn)');
      let stod = !error;
      // Migrationen (kolumnen viktigt) ej körd: läs som förut och dölj Viktigt-fältet — kommentarerna får aldrig försvinna för att en kolumn saknas.
      if (error && arViktigtKolumnSaknas(error)) { ({ data, error } = await fraga('id, objekt_id, yta_nyckel, text, skapad_av, skapad_at, andrad_at, medarbetare:skapad_av(namn)')); stod = false; }
      if (error || !Array.isArray(data)) { setLasFel(true); setLaddad(true); return; }
      setViktigtStod(stod);
      const rader = data.map((r: any) => ({
        id: r.id, objekt_id: r.objekt_id, yta_nyckel: r.yta_nyckel, text: r.text, viktigt: rensaViktigt(r.viktigt), skapad_av: r.skapad_av ?? null,
        namn: r.medarbetare?.namn ?? null, skapad_at: r.skapad_at, andrad_at: r.andrad_at,
      }));
      // En förare och maskinen ser bara sin egen medarbetarrad: namnet på andras kommentarer hämtas som namn och inget mer (medarbetare_visning).
      setServer(await kompletteraNamn(rader, (r) => r.skapad_av, (r) => r.namn, (r, n) => ({ ...r, namn: n }), dbRef.current as any));
      setLasFel(false); setLaddad(true);
    } catch { setLasFel(true); setLaddad(true); }
  }, [idNyckel]);

  // Läs när objektet byts, och igen när kön skickat något (då finns raden på servern med serverns tid) och när appen blir synlig.
  useEffect(() => {
    setLaddad(false); setServer([]);
    void las();
    const av = prenumereraKartkommentarKo(() => { setKoVersion((v) => v + 1); void las(); });
    const synlig = () => { if (document.visibilityState === 'visible') void las(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { av(); document.removeEventListener('visibilitychange', synlig); };
  }, [las]);

  const rader = useMemo(() => {
    void koVersion;
    const ko = idn.flatMap((id) => vantandePosterFor(id));
    const vy = idn.flatMap((id) => laggKoOvanpa(server.filter((r) => r.objekt_id === id), ko, id));
    return sorteraKommentarer(vy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, koVersion, idNyckel]);

  const larmKommentarer = useMemo(() => senasteLarmKommentarer(rader), [rader]);

  const lagg = useCallback((nyckel: string, text: string, viktigt?: string | null) => {
    const t = text.trim();
    const v = rensaViktigt(viktigt);
    if (!i.objektId || !i.minId || !harInnehall(t, v)) return;
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    laggIKo({ id, objekt_id: i.objektId, yta_nyckel: nyckel, op: 'ny', text: t, ...(v ? { viktigt: v } : {}), skapad_av: i.minId, namn: i.minNamn, skapad_lokalt: new Date().toISOString() });
    setKoVersion((v) => v + 1);
  }, [i.objektId, i.minId, i.minNamn]);

  const andra = useCallback((id: string, text: string, viktigt?: string | null) => {
    const rad = rader.find((r) => r.id === id);
    const t = text.trim();
    const v = rensaViktigt(viktigt);
    if (!rad || !i.minId || rad.skapad_av !== i.minId || !harInnehall(t, v)) return;
    // `viktigt` skickas bara när kolumnen finns (viktigtStod) eller när det faktiskt ändras: en vanlig ändring av Övrigt rör aldrig kolumnen.
    const ändrasViktigt = viktigt !== undefined && (v ?? null) !== (rad.viktigt ?? null);
    laggIKo({ id, objekt_id: rad.objekt_id, yta_nyckel: rad.yta_nyckel, op: 'andra', text: t, ...(ändrasViktigt ? { viktigt: v } : {}), skapad_av: rad.skapad_av, namn: rad.namn, skapad_lokalt: rad.skapad_at || new Date().toISOString() });
    setKoVersion((v) => v + 1);
  }, [rader, i.minId]);

  const radera = useCallback((id: string) => {
    const rad = rader.find((r) => r.id === id);
    if (!rad || !kanRaderaKommentar(rad, i.minId, !!i.arAdmin)) return;
    laggIKo({ id, objekt_id: rad.objekt_id, yta_nyckel: rad.yta_nyckel, op: 'radera', text: rad.text, skapad_av: rad.skapad_av, namn: rad.namn, skapad_lokalt: rad.skapad_at || new Date().toISOString() });
    setKoVersion((v) => v + 1);
  }, [rader, i.minId, i.arAdmin]);

  return { rader, laddad, lasFel, viktigtStod, lagg, andra, radera, larmKommentarer };
}
