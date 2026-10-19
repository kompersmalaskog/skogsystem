'use client';

// Kartlagret som state: [lager, välj]. `välj` sparar valet lokalt (enheten) direkt och på kontot (medarbetare.kartlager via RPC satt_kartlager) så fort det går.
// Regler och avvägningar: lib/kartlager.ts. Ett fel mot kontot är aldrig synligt för föraren — valet gäller på enheten och skickas nästa gång nätet finns.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { arKartlager, avstam, lasLokal, skrivLokal, startLager, type Kartlager, type LokalKopia } from '@/lib/kartlager';

const lagring = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } };

async function inloggadId(): Promise<string | null> {
  try { return (await supabase.auth.getSession()).data.session?.user?.id ?? null; } catch { return null; }
}

/** undefined = kunde inte läsas (inget nät), null = kontot har inget val. */
async function lasKonto(id: string): Promise<Kartlager | null | undefined> {
  try {
    const { data, error } = await supabase.from('medarbetare').select('kartlager').eq('user_id', id).maybeSingle();
    if (error) return undefined;   // också när kolumnen ännu inte finns (migrationen ej körd): enhetens val gäller
    return arKartlager((data as any)?.kartlager) ? (data as any).kartlager : null;
  } catch { return undefined; }
}

export function useKartlager(): [Kartlager, (v: Kartlager) => void] {
  const [lager, setLager] = useState<Kartlager>(() => startLager(lasLokal(lagring())));
  const lagerRef = useRef(lager);
  lagerRef.current = lager;
  const skickarRef = useRef(false);

  // Skickar det osynkade valet till kontot. true = kontot har det (eller saknas så det inte finns något att skicka till).
  const skicka = useCallback(async (): Promise<void> => {
    if (skickarRef.current) return;
    skickarRef.current = true;
    try {
      for (let varv = 0; varv < 3; varv++) {
        const kopia = lasLokal(lagring());
        if (!kopia?.osynkad) return;
        const id = await inloggadId();
        if (!id || (kopia.anvandarId && kopia.anvandarId !== id)) return;   // någon annans val på en delad enhet skickas aldrig som mitt
        let klart = false;
        try {
          const { error } = await supabase.rpc('satt_kartlager', { p_lager: kopia.val });
          klart = !error;
        } catch { klart = false; }
        if (!klart) return;   // inget nät (eller migrationen ej körd): valet ligger kvar lokalt och försöks igen
        const nu = lasLokal(lagring());
        // Bytte användaren igen medan vi skickade ligger det nyare valet kvar som osynkat → nästa varv skickar det.
        if (nu && nu.val === kopia.val) skrivLokal(lagring(), { ...nu, osynkad: false });
        if (!nu || nu.val === kopia.val) return;
      }
    } finally { skickarRef.current = false; }
  }, []);

  // Vid start: vem är jag, vad säger kontot — och avgör vad som gäller.
  useEffect(() => {
    let avbruten = false;
    (async () => {
      const id = await inloggadId();
      if (!id || avbruten) return;
      const lokal = lasLokal(lagring());
      const server = await lasKonto(id);
      if (avbruten) return;
      const a = avstam(lokal, id, server);
      if (a.gallande !== lagerRef.current) setLager(a.gallande);
      // Den lokala kopian följer det som gäller (och märks med vem det gäller), osynkad bara om den ännu ska skickas.
      if (server !== undefined || a.skickaTillKontot) skrivLokal(lagring(), { val: a.gallande, osynkad: a.skickaTillKontot, anvandarId: id });
      if (a.skickaTillKontot) void skicka();
    })();
    return () => { avbruten = true; };
  }, [skicka]);

  // Nätet kommer tillbaka / appen blir synlig: skicka det som väntar.
  useEffect(() => {
    const forsok = () => { void skicka(); };
    const synlig = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') forsok(); };
    window.addEventListener('online', forsok);
    document.addEventListener('visibilitychange', synlig);
    return () => { window.removeEventListener('online', forsok); document.removeEventListener('visibilitychange', synlig); };
  }, [skicka]);

  const valj = useCallback((v: Kartlager) => {
    if (!arKartlager(v)) return;
    setLager(v);
    lagerRef.current = v;
    void (async () => {
      const id = await inloggadId();
      const kopia: LokalKopia = { val: v, osynkad: true, anvandarId: id };
      skrivLokal(lagring(), kopia);
      if (id) void skicka();
    })();
  }, [skicka]);

  return [lager, valj];
}
