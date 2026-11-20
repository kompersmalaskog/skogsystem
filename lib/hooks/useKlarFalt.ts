'use client';

// Läser och sparar de nya "Klar med trakten?"-fälten för det valda objektet (lib/klarFalt). Ett svar sparas direkt vid trycket — ingen debounce,
// inget autospar: ett "Ja" på en säkerhetsfråga får inte försvinna för att fliken stängdes inom 800 ms.
//
// Ärligt vid fel: läsfel eller en databas utan migrationen är ett LÄGE (`lage`), aldrig tomma svar. Kortet säger det och sparar inte i blindo.
// Mönstret är detsamma som Objektinfo-laddaren (infoLoaded/infoLaddFel): det som inte laddats ur DET HÄR objektets rad skrivs aldrig.

import { useCallback, useEffect, useRef, useState } from 'react';
import { arKolumnSaknasFel, klarFaltTillKolumner, KLAR_KOLUMNER, KLAR_TOM, radTillKlarFalt, type KlarFalt } from '../klarFalt';
import { uppdateraVerifierat } from '../supabase-save';

export type KlarFaltLage = 'laddar' | 'ok' | 'migrering-saknas' | 'lasfel';

export interface KlarFaltHook {
  falt: KlarFalt;
  lage: KlarFaltLage;
  /** sparfelet senast (visas i kortet); null = ok */
  sparFel: string | null;
  /** sparar ändrade fält direkt (tyst = ingen felrad i kortet, för bakgrundsskrivningen av "N kvar"); true = landade i databasen. I testläget skrivs inget (true, så flödet går att prova). */
  spara: (patch: Partial<KlarFalt>, tyst?: boolean) => Promise<boolean>;
  /** som `spara` men väntar tills det blivit tyst (skrivfält: medelstam) — fältet följer med direkt, databasen får bara det sista */
  sparaSenare: (patch: Partial<KlarFalt>, ms?: number) => void;
  laddaOm: () => void;
}

export function useKlarFalt(supabase: any, objektId: string | null, testlage: boolean): KlarFaltHook {
  const [falt, setFalt] = useState<KlarFalt>(KLAR_TOM);
  const [lage, setLage] = useState<KlarFaltLage>('laddar');
  const [sparFel, setSparFel] = useState<string | null>(null);
  const [omN, setOmN] = useState(0);
  const idRef = useRef<string | null>(objektId);
  idRef.current = objektId;
  const faltRef = useRef(falt);
  faltRef.current = falt;
  const lageRef = useRef(lage);
  lageRef.current = lage;

  useEffect(() => {
    setFalt(KLAR_TOM);
    setSparFel(null);
    if (!objektId) { setLage('laddar'); return; }
    setLage('laddar');
    let avbruten = false;
    (async () => {
      try {
        const { data, error } = await supabase.from('objekt').select(KLAR_KOLUMNER).eq('id', objektId).single();
        if (avbruten) return;
        if (error) { setLage(arKolumnSaknasFel(error) ? 'migrering-saknas' : 'lasfel'); return; }
        setFalt(radTillKlarFalt(data));
        setLage('ok');
      } catch {
        if (!avbruten) setLage('lasfel');
      }
    })();
    return () => { avbruten = true; };
  }, [supabase, objektId, omN]);

  const spara = useCallback(async (patch: Partial<KlarFalt>, tyst = false): Promise<boolean> => {
    const id = idRef.current;
    if (!id || lageRef.current !== 'ok') { if (!tyst) setSparFel('Kan inte spara — fälten har inte kunnat läsas för trakten.'); return false; }
    // Direkt synligt; faller tillbaka (bara DE här fälten) om skrivningen misslyckas. Funktionell uppdatering + ref: två tryck i rad ska inte skriva över varandra.
    const fore = faltRef.current;
    faltRef.current = { ...fore, ...patch };
    setFalt((cur) => ({ ...cur, ...patch }));
    if (testlage) return true;
    const kolumner = klarFaltTillKolumner(patch, fore);
    const res = await uppdateraVerifierat(supabase, 'objekt', kolumner, { id }, Object.keys(kolumner).join(','));
    if (idRef.current !== id) return res.ok;   // objektet byttes under tiden — släng bara utfallet
    if (!res.ok) {
      const tillbaka = Object.fromEntries(Object.keys(patch).map((k) => [k, (fore as any)[k]])) as Partial<KlarFalt>;
      faltRef.current = { ...faltRef.current, ...tillbaka };
      setFalt((cur) => ({ ...cur, ...tillbaka }));
      if (!tyst) setSparFel('Kunde inte spara — försök igen.');
      return false;
    }
    setSparFel(null);
    return true;
  }, [supabase, testlage]);

  // Skrivfält: synligt direkt, ett enda anrop när man slutat skriva. Väntande ändringar skrivs också om objektet byts eller kortet lämnas.
  // Väntande ändring minns SIN trakt: byts objekt skrivs den till den gamla, aldrig till den nya.
  const vantande = useRef<{ id: string; patch: Partial<KlarFalt>; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const sparaVantande = useCallback(() => {
    const v = vantande.current;
    vantande.current = null;
    if (!v) return;
    if (v.timer) clearTimeout(v.timer);
    if (testlage) return;
    if (v.id === idRef.current) { void spara(v.patch); return; }
    const kolumner = klarFaltTillKolumner(v.patch);
    void uppdateraVerifierat(supabase, 'objekt', kolumner, { id: v.id }, Object.keys(kolumner).join(','));
  }, [spara, supabase, testlage]);
  const sparaSenare = useCallback((patch: Partial<KlarFalt>, ms = 700) => {
    if (!idRef.current) return;
    if (vantande.current && vantande.current.id !== idRef.current) sparaVantande();
    const v = vantande.current ?? { id: idRef.current, patch: {}, timer: null };
    if (v.timer) clearTimeout(v.timer);
    v.patch = { ...v.patch, ...patch };
    faltRef.current = { ...faltRef.current, ...patch };
    setFalt((cur) => ({ ...cur, ...patch }));
    v.timer = setTimeout(sparaVantande, ms);
    vantande.current = v;
  }, [sparaVantande]);
  useEffect(() => () => { sparaVantande(); }, [objektId, sparaVantande]);

  const laddaOm = useCallback(() => setOmN((n) => n + 1), []);
  return { falt, lage, sparFel, spara, sparaSenare, laddaOm };
}
