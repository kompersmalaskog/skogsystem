// Översättning mellan appens Lass och databasens skotar_lass* (rena funktioner, testade). Lasset skickas som EN jsonb till
// skotar_lass_spara (atomiskt); det läses tillbaka med inbäddade delar och sortiment.
import type { Lass, LassDel, LassStatus, SortimentRad } from './typer';

export function lassTillPayload(l: Lass): Record<string, unknown> {
  return {
    lass: {
      id: l.id, objekt_id: l.objektId, vo_nummer: l.voNummer, maskin_id: l.maskinId, medarbetare_id: l.medarbetareId,
      lass_nummer: l.lassNummer, datum: l.datum, status: l.status, bekraftad_av: l.bekraftadAv, bekraftad_tid: l.bekraftadTid,
      spar: l.sparPunkter, vagar: l.vagar, skapad: l.skapad, andrad: l.andrad,
    },
    delar: l.delar.map((d) => ({
      del_nr: d.delNr, avlagg_id: d.avlaggId, avlagg_nummer: d.avlaggNummer, lossad_tid: d.lossadTid, lat: d.lat, lng: d.lng,
      rader: d.rader.map((r) => ({ nyckel: r.nyckel, namn: r.namn, m3: r.m3 })),
    })),
  };
}

/** Kolumnerna lasset läses med (inbäddade delar och sortiment). */
export const LASS_SELECT =
  'id, objekt_id, vo_nummer, maskin_id, medarbetare_id, lass_nummer, datum, status, bekraftad_av, bekraftad_tid, spar, vagar, skapad, andrad, ' +
  'skotar_lass_del(del_nr, avlagg_id, avlagg_nummer, lossad_tid, lat, lng, skotar_lass_sortiment(sortiment_nyckel, sortiment_namn, m3_forare))';

const STATUS: readonly LassStatus[] = ['foreslaget', 'vantar_forare', 'bekraftat', 'struket'];

export function lassFranServer(r: any): Lass | null {
  if (!r || typeof r.id !== 'string' || typeof r.objekt_id !== 'string') return null;
  const delar: LassDel[] = (Array.isArray(r.skotar_lass_del) ? r.skotar_lass_del : [])
    .map((d: any): LassDel => ({
      delNr: Number(d.del_nr), avlaggId: d.avlagg_id ?? null, avlaggNummer: d.avlagg_nummer ?? null,
      lossadTid: new Date(d.lossad_tid).toISOString(), lat: Number(d.lat), lng: Number(d.lng),
      rader: (Array.isArray(d.skotar_lass_sortiment) ? d.skotar_lass_sortiment : []).map((s: any): SortimentRad => ({
        nyckel: String(s.sortiment_nyckel), namn: String(s.sortiment_namn), m3: Number(s.m3_forare),
      })),
    }))
    .sort((a: LassDel, b: LassDel) => a.delNr - b.delNr);
  return {
    id: r.id, objektId: r.objekt_id, voNummer: r.vo_nummer ?? null, maskinId: String(r.maskin_id), medarbetareId: r.medarbetare_id ?? null,
    lassNummer: Number(r.lass_nummer), datum: String(r.datum).slice(0, 10), delar,
    status: STATUS.includes(r.status) ? r.status : 'bekraftat',
    bekraftadAv: r.bekraftad_av === 'auto' || r.bekraftad_av === 'forare' || r.bekraftad_av === 'planerare' ? r.bekraftad_av : null,
    bekraftadTid: r.bekraftad_tid ? new Date(r.bekraftad_tid).toISOString() : null,
    sparPunkter: Array.isArray(r.spar) ? r.spar : [], vagar: Array.isArray(r.vagar) ? r.vagar : [],
    skapad: new Date(r.skapad).toISOString(), andrad: new Date(r.andrad).toISOString(),
  };
}

/** Avslutets skalfaktorer ur skotar_trakt_avslut (null = trakten inte avslutad). */
export interface Avslut { faktorer: Record<string, number>; tillagg: Record<string, number>; skillnadM3: number; avslutadTid: string }

export function avslutFranServer(r: any): Avslut | null {
  if (!r) return null;
  const tal = (o: any): Record<string, number> => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number)));
  return { faktorer: tal(r.faktorer), tillagg: tal(r.tillagg), skillnadM3: Number(r.skillnad_m3) || 0, avslutadTid: new Date(r.avslutad_tid).toISOString() };
}
