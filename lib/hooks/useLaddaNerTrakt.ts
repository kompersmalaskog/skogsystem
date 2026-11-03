'use client';

// "Ladda ner trakten" i bakgrunden (lib/kartNedladdning): när en trakt öppnas på bra nät sparas kartrutorna runt den i enheten.
// Service workern (public/sw.js) svarar sedan ur det sparade — kartan kommer direkt, också utan täckning.
import { useEffect, useState } from 'react';
import {
  KART_CACHE, braNat, lasMeta, medTrakt, planeraRutor, sparaMeta, type Bbox, type NedladdningLage,
} from '@/lib/kartNedladdning';

const SAMTIDIGA = 4;
const START_EFTER_MS = 2500;          // kartan som syns nu får nätet först
const GILTIG_DAGAR = 60;              // äldre än så laddas trakten ner igen (ett flygfoto byts vartannat år)
const FEL_ANDEL = 0.1;                // fler än 10 % rutor som inte gick att hämta = fel (nästa öppning försöker igen)

function lagring(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
const abs = (u: string) => new URL(u, window.location.origin).href;

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
      const cache = await caches.open(KART_CACHE);
      const rutor = planeraRutor(bbox);
      const meta = lasMeta(lagring());
      const forut = meta.find((m) => m.id === id);
      const farsk = forut && Date.now() - forut.ts < GILTIG_DAGAR * 86_400_000 && JSON.stringify(forut.bbox) === JSON.stringify(bbox);
      // Redan sparad: stickprov i cachen (webbläsaren kan ha rensat). Finns de → klar, utan nät.
      if (farsk) {
        const prov = [rutor[0], rutor[Math.floor(rutor.length / 2)], rutor[rutor.length - 1]];
        const finns = await Promise.all(prov.map((u) => cache.match(abs(u)).then(Boolean).catch(() => false)));
        if (avbruten) return;
        if (finns.every(Boolean)) {
          sparaMeta(lagring(), medTrakt(meta, { ...forut!, ts: forut!.ts }).meta);   // senast öppnad först (rensas sist)
          setLage({ lage: 'klar' });
          return;
        }
      }
      if (!braNat(navigator as any)) return;            // dåligt nät: ingen rad, försök nästa gång trakten öppnas
      try { if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js'); } catch { /* utan worker sparas rutorna ändå, men visas inte utan nät */ }
      if (avbruten) return;

      let klara = 0, fel = 0, i = 0;
      setLage({ lage: 'laddar', klara: 0, totalt: rutor.length });
      const arbetare = async () => {
        while (!avbruten && i < rutor.length) {
          const u = abs(rutor[i++]);
          try {
            if (!(await cache.match(u))) {
              const extern = !u.startsWith(window.location.origin);
              const r = await fetch(u, extern ? { mode: 'cors', credentials: 'omit' } : { credentials: 'same-origin' });
              if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) await cache.put(u, r); else fel++;   // utgången session ger inloggningssidan — aldrig en "ruta"
            }
          } catch { fel++; }
          klara++;
          if (klara % 25 === 0 && !avbruten) setLage({ lage: 'laddar', klara, totalt: rutor.length });
        }
      };
      await Promise.all(Array.from({ length: SAMTIDIGA }, arbetare));
      if (avbruten) return;
      if (fel > rutor.length * FEL_ANDEL) { setLage({ lage: 'fel' }); return; }

      const { meta: nyMeta, rensa } = medTrakt(lasMeta(lagring()), { id, bbox, ts: Date.now(), antal: rutor.length });
      sparaMeta(lagring(), nyMeta);
      setLage({ lage: 'klar' });
      // Äldre trakter: deras rutor tas bort, utom de som de kvarvarande trakterna också använder.
      if (rensa.length) {
        const behall = new Set(nyMeta.flatMap((m) => planeraRutor(m.bbox)));
        for (const m of rensa) for (const u of planeraRutor(m.bbox)) if (!behall.has(u)) { try { await cache.delete(abs(u)); } catch { /* */ } }
      }
    };

    const t = setTimeout(() => { kor().catch((e) => { console.error('[kartnedladdning]', e); if (!avbruten) setLage({ lage: 'fel' }); }); }, START_EFTER_MS);
    return () => { avbruten = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, aktiv]);

  return lage;
}
