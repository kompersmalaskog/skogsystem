// Själva nedladdningen av en traktkarta (lib/kartNedladdning): EN väg för trakten som är öppen (useLaddaNerTrakt) och för trakterna
// som hämtas i bakgrunden (useBakgrundsNedladdning). Bara i webbläsaren (Cache Storage + fetch).
import { KART_CACHE, lasMeta, medTrakt, planeraRutor, sparaMeta, type Bbox } from '@/lib/kartNedladdning';

export const GILTIG_DAGAR = 60;       // äldre än så laddas trakten ner igen (ett flygfoto byts vartannat år)
const FEL_ANDEL = 0.1;                // fler än 10 % rutor som inte gick att hämta = fel (nästa gång försöks igen)

export function lagring(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
const abs = (u: string) => new URL(u, window.location.origin).href;

/** Finns trakten redan sparad (färsk, samma yta, och stickprov i cachen finns kvar — webbläsaren kan ha rensat)? */
export async function arSparad(id: string, bbox: Bbox): Promise<boolean> {
  const forut = lasMeta(lagring()).find((m) => m.id === id);
  if (!forut || Date.now() - forut.ts >= GILTIG_DAGAR * 86_400_000 || JSON.stringify(forut.bbox) !== JSON.stringify(bbox)) return false;
  const rutor = planeraRutor(bbox);
  const cache = await caches.open(KART_CACHE);
  const prov = [rutor[0], rutor[Math.floor(rutor.length / 2)], rutor[rutor.length - 1]];
  const finns = await Promise.all(prov.map((u) => cache.match(abs(u)).then(Boolean).catch(() => false)));
  return finns.every(Boolean);
}

/** Lägger trakten först i minnet (den rensas sist). */
export function rordTrakt(id: string): void {
  const meta = lasMeta(lagring());
  const m = meta.find((x) => x.id === id);
  if (m) sparaMeta(lagring(), medTrakt(meta, { ...m, oppnad: Date.now() }).meta);
}

/**
 * Hämtar traktens rutor som inte redan finns. `ok` = högst 10 % fel. Trakten skrivs i minnet först när den är klar.
 * Äldre trakter som trillar ur minnet (fler än MAX_TRAKTER) får sina rutor borttagna, utom de som de kvarvarande delar.
 */
export async function laddaNerRutor(
  id: string, bbox: Bbox,
  o: { avbruten: () => boolean; onFramsteg?: (klara: number, totalt: number) => void; samtidiga?: number },
): Promise<{ ok: boolean; avbruten: boolean }> {
  const cache = await caches.open(KART_CACHE);
  const rutor = planeraRutor(bbox);
  let klara = 0, fel = 0, i = 0;
  o.onFramsteg?.(0, rutor.length);
  const arbetare = async () => {
    while (!o.avbruten() && i < rutor.length) {
      const u = abs(rutor[i++]);
      try {
        if (!(await cache.match(u))) {
          const extern = !u.startsWith(window.location.origin);
          const r = await fetch(u, extern ? { mode: 'cors', credentials: 'omit' } : { credentials: 'same-origin' });
          // Utgången session ger inloggningssidan — den sparas aldrig som en "ruta".
          if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) await cache.put(u, r); else fel++;
        }
      } catch { fel++; }
      klara++;
      if (klara % 25 === 0 && !o.avbruten()) o.onFramsteg?.(klara, rutor.length);
    }
  };
  await Promise.all(Array.from({ length: o.samtidiga ?? 4 }, arbetare));
  if (o.avbruten()) return { ok: false, avbruten: true };
  if (fel > rutor.length * FEL_ANDEL) return { ok: false, avbruten: false };
  const { meta, rensa } = medTrakt(lasMeta(lagring()), { id, bbox, ts: Date.now(), antal: rutor.length });
  sparaMeta(lagring(), meta);
  if (rensa.length) await taBortTrakter(rensa.map((m) => m.id));
  return { ok: true, avbruten: false };
}

/** Tar bort trakternas rutor ur enheten — utom rutor som en kvarvarande trakt också använder. */
export async function taBortTrakter(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const alla = lasMeta(lagring());
  const bort = alla.filter((m) => ids.includes(m.id));
  const kvar = alla.filter((m) => !ids.includes(m.id));
  sparaMeta(lagring(), kvar);
  const behall = new Set(kvar.flatMap((m) => planeraRutor(m.bbox)));
  const cache = await caches.open(KART_CACHE);
  for (const m of bort) for (const u of planeraRutor(m.bbox)) if (!behall.has(u)) { try { await cache.delete(abs(u)); } catch { /* */ } }
}
