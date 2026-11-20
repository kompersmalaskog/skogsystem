'use client';

// "Ladda ner trakten" för trakten som är ÖPPEN (lib/kartNedladdning): när den öppnas på bra nät sparas kartrutorna runt den i enheten.
// Service workern (public/sw.js) svarar sedan ur det sparade — kartan kommer direkt, också utan täckning.
// Trakterna man SKA till hämtas i bakgrunden av useBakgrundsNedladdning; båda går genom lib/kartNedladdningKor.
import { useEffect, useState } from 'react';
import { braNat, type Bbox, type NedladdningLage } from '@/lib/kartNedladdning';
import { arSparad, laddaNerRutor, rordTrakt } from '@/lib/kartNedladdningKor';

const START_EFTER_MS = 2500;          // kartan som syns nu får nätet först

export function useLaddaNerTrakt({ objektId, bbox, aktiv }: { objektId: string | null; bbox: Bbox | null; aktiv: boolean }): NedladdningLage {
  const [lage, setLage] = useState<NedladdningLage>({ lage: 'av' });
  const nyckel = objektId && bbox ? `${objektId}|${bbox.vast.toFixed(5)},${bbox.syd.toFixed(5)},${bbox.ost.toFixed(5)},${bbox.nord.toFixed(5)}` : null;

  useEffect(() => {
    setLage({ lage: 'av' });
    if (!aktiv || !objektId || !bbox || typeof window === 'undefined') return;
    if (!('caches' in window) || !('serviceWorker' in navigator)) return;
    let avbruten = false;
    const id = objektId;

    const kor = async () => {
      // Redan sparad (stickprov i cachen) → klar, också utan nät.
      if (await arSparad(id, bbox)) { if (!avbruten) { rordTrakt(id); setLage({ lage: 'klar' }); } return; }
      if (avbruten || !braNat(navigator as any)) return;            // dåligt nät: ingen rad, försök nästa gång trakten öppnas
      try { if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js'); } catch { /* utan worker sparas rutorna ändå, men visas inte utan nät */ }
      if (avbruten) return;
      const r = await laddaNerRutor(id, bbox, {
        avbruten: () => avbruten,
        onFramsteg: (klara, totalt) => { if (!avbruten) setLage({ lage: 'laddar', klara, totalt }); },
      });
      if (r.avbruten || avbruten) return;
      setLage(r.ok ? { lage: 'klar' } : { lage: 'fel' });
    };

    const t = setTimeout(() => { kor().catch((e) => { console.error('[kartnedladdning]', e); if (!avbruten) setLage({ lage: 'fel' }); }); }, START_EFTER_MS);
    return () => { avbruten = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv]);

  return lage;
}
