'use client';

// VÄDRET I HYTTEN: läser /api/kalibrering/vader för maskinen (samma läsning som Läget-raden och pushen) och säger om kortet ska visas (regeln i lib/kalibrering/vaderHytt).
// Bara när `aktiv` (maskinläget på en skördare) — annars ingen läsning alls. Läser när sidan blir synlig och var 10:e minut; en klocka varje minut räcker för att
// kortet ska försvinna när morgonfönstret tar slut. Ett läsfel ger inget kort (tyst; Läget visar felet). "Sett" sparas per enhet, i testläget bara i minnet.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VaderSvar } from '@/lib/kalibrering/vaderServer';
import { lasVaderSett, sparaVaderSett, vaderKort, type VaderKort } from '@/lib/kalibrering/vaderHytt';

export const VADER_HYTT_LAS_MS = 10 * 60_000;

export function useVaderHytt(a: { aktiv: boolean; maskinId: string | null; torr: boolean }): { kort: VaderKort | null; sett: () => void } {
  const [svar, setSvar] = useState<VaderSvar | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  const [settDag, setSettDag] = useState<string | null>(null);
  const maskin = a.aktiv ? a.maskinId : null;
  const torrRef = useRef(a.torr);
  torrRef.current = a.torr;

  useEffect(() => {
    setSvar(null);
    setSettDag(maskin && !torrRef.current ? lasVaderSett(maskin) : null);
    if (!maskin) return;
    let aktiv = true;
    const las = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/kalibrering/vader?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store', credentials: 'same-origin' });
        const j = (await r.json().catch(() => null)) as VaderSvar | null;
        if (aktiv) setSvar(r.ok && j ? j : null);
      } catch (e) {
        console.warn('[Vädret i hytten]', e instanceof Error ? e.message : e);
      }
      if (aktiv) setNu(Date.now());
    };
    void las();
    const id = setInterval(() => { void las(); }, VADER_HYTT_LAS_MS);
    const klocka = setInterval(() => setNu(Date.now()), 60_000);
    const synlig = () => { if (document.visibilityState === 'visible') void las(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { aktiv = false; clearInterval(id); clearInterval(klocka); document.removeEventListener('visibilitychange', synlig); };
  }, [maskin]);

  const kort = maskin ? vaderKort(svar, nu, settDag) : null;
  const sett = useCallback(() => {
    if (!maskin || !kort) return;
    setSettDag(kort.dag);
    if (!torrRef.current) sparaVaderSett(maskin, kort.dag);
  }, [maskin, kort]);
  return { kort, sett };
}
