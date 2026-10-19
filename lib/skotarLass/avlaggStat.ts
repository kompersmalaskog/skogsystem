// Vad som skotats till ett avlägg — för avläggskortet ("skotat hit 412 m³", per sortiment, antal lass, senast).
// Räknas ur lassen på trakten; ett lass med flera delar bidrar med varje del till sitt avlägg. Efter Färdigskotad följer volymerna skalningen.
import { heltM3 } from './lassModell';
import { sortimentNyckel } from './sortiment';
import type { Lass } from './typer';

export interface AvlaggSkotat {
  m3: number;
  antalLass: number;
  /** Lossningstid för den senaste lossningen (ISO), null om inget skotats hit. */
  senast: string | null;
  perSortiment: Array<{ nyckel: string; namn: string; m3: number }>;
}

export function skotatTillAvlagg(lass: readonly Lass[], avlaggId: string, faktorer: Readonly<Record<string, number>> = {}): AvlaggSkotat {
  const per = new Map<string, { nyckel: string; namn: string; m3: number }>();
  const lassMedDel = new Set<string>();
  let senast: string | null = null;
  for (const l of lass) {
    if (l.status === 'struket') continue;
    for (const d of l.delar) {
      if (d.avlaggId !== avlaggId) continue;
      lassMedDel.add(l.id);
      if (!senast || d.lossadTid > senast) senast = d.lossadTid;
      for (const r of d.rader) {
        const n = sortimentNyckel(r.nyckel || r.namn);
        const f = faktorer[n];
        const g = per.get(n) ?? { nyckel: n, namn: r.namn, m3: 0 };
        g.m3 += f == null ? heltM3(r.m3) : heltM3(r.m3) * f;
        per.set(n, g);
      }
    }
  }
  const perSortiment = Array.from(per.values()).filter((g) => g.m3 > 0).sort((a, b) => b.m3 - a.m3);
  return { m3: perSortiment.reduce((s, g) => s + g.m3, 0), antalLass: lassMedDel.size, senast, perSortiment };
}

/** "14:12" i svensk tid. */
export function klockslag(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(new Date(iso));
}
