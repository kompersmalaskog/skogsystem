// Klientens läsning av laserdatan (app/api/laser-grundyta). Kastar vid fel — ett fel är aldrig "inga rutor".
import type { LaserRuta } from './laserKvar';

export async function hamtaLaserRutor(punkter: [number, number][]): Promise<LaserRuta[]> {
  const resp = await fetch('/api/laser-grundyta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ punkter }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data || !Array.isArray(data.rutor)) {
    throw new Error(data?.error ?? 'Laserdatan gick inte att hämta.');
  }
  return (data.rutor as (number | null)[][]).map(([g, d, dag, hm, p95]) => ({ g, d, dag, hm: hm ?? null, p95: p95 ?? null }));
}
