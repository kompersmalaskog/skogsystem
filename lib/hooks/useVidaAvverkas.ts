// Hänsynsytor som planeraren markerat "Avverkas – larma inte" för valt objekt (lib/vidaAvverkas). Läses när objektet byts; en ändring syns direkt och tas tillbaka
// om databasen inte bekräftar den. Bara admin kan ändra (RLS); `fel` är texten som visas i kortet när en ändring inte gick att spara.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { lasAvverkas, sattAvverkas } from '../vidaAvverkas';

type Db = { from: (t: string) => any };

export interface VidaAvverkas {
  /** Markerade nycklar (`hansyn:<LOPNR>`). Tom mängd när inget är markerat ELLER tabellen inte gick att läsa. */
  avverkas: ReadonlySet<string>;
  /** Tabellen gick att läsa — annars visas ingen brytare (en brytare som inte sparar vore värre än ingen). */
  tillganglig: boolean;
  sparar: string | null;
  fel: string | null;
  satt: (nyckel: string, pa: boolean) => Promise<void>;
}

const TOM: ReadonlySet<string> = new Set();

export function useVidaAvverkas(db: Db, objektId: string | null | undefined, arAdmin: boolean): VidaAvverkas {
  const [avverkas, setAvverkas] = useState<ReadonlySet<string>>(TOM);
  const [tillganglig, setTillganglig] = useState(false);
  const [sparar, setSparar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const aktuellt = useRef(objektId);
  aktuellt.current = objektId;

  useEffect(() => {
    setAvverkas(TOM); setTillganglig(false); setFel(null);
    if (!objektId) return;
    let avbruten = false;
    lasAvverkas(db, objektId).then((s) => {
      if (avbruten) return;
      if (s) { setAvverkas(s); setTillganglig(true); } else setTillganglig(false);
    });
    return () => { avbruten = true; };
    // db är samma klient hela sessionen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektId]);

  const satt = useCallback(async (nyckel: string, pa: boolean) => {
    const id = objektId;
    if (!id || !arAdmin) return;
    setSparar(nyckel); setFel(null);
    const fore = avverkas;
    const nytt = new Set(fore); if (pa) nytt.add(nyckel); else nytt.delete(nyckel);
    setAvverkas(nytt);
    const ok = await sattAvverkas(db, id, nyckel, pa);
    if (aktuellt.current !== id) return;
    setSparar(null);
    if (!ok) { setAvverkas(fore); setFel('Kunde inte spara – försök igen'); }
  }, [db, objektId, arAdmin, avverkas]);

  return { avverkas, tillganglig, sparar, fel, satt };
}
