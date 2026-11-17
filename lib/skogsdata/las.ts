// Det lilla ur objekt_skogsdata som prognosen behöver i webbläsaren och på servern: laserns medeldiameter och det uppmätta uttaget per trakt.
// Rutnätet (stort) läses aldrig här. Ett läsfel är ett fel — anroparen avgör (prognosen faller tillbaka på det som gällde förut).

import type { UtfallRad } from '@/lib/g15Forslag';
import type { SparatUttag } from './uttag';

export type SkogKort = { diaCm: number | null; uttag: SparatUttag | null };

type Klient = { from(tabell: string): any };

export async function lasSkogKort(sb: Klient): Promise<{ data: Map<string, SkogKort> | null; error: string | null }> {
  const r = await sb.from('objekt_skogsdata').select('objekt_id, dia:sammanfattning->laser->diameterCm, uttag');
  if (r.error) return { data: null, error: r.error.message ?? String(r.error) };
  const ut = new Map<string, SkogKort>();
  for (const x of (r.data ?? []) as { objekt_id: string; dia: unknown; uttag: unknown }[]) {
    const d = Number(x.dia);
    ut.set(String(x.objekt_id), { diaCm: x.dia != null && Number.isFinite(d) && d > 0 ? d : null, uttag: (x.uttag as SparatUttag | null) ?? null });
  }
  return { data: ut, error: null };
}

/** Lägger laserdiametern på utfallsraderna (via objektId). Rader utan laserdata lämnas som de är. */
export function medLaser(rader: UtfallRad[], skog: Map<string, SkogKort> | null): UtfallRad[] {
  if (!skog) return rader;
  return rader.map((r) => (r.objektId && skog.get(r.objektId)?.diaCm != null ? { ...r, laserDiaCm: skog.get(r.objektId)!.diaCm } : r));
}
