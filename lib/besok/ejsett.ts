// Pushen till planeringen när en maskin inte sett ett besök: "<Maskin> har inte sett besöket på <trakt>".
//
//   • Ett besök är aktivt till besökstid + BESOK_EFTERTID_MIN (lib/besok/tid.arBesokAktivt).
//   • Klockan börjar gå när besöket anmäldes — dock tidigast BESOK_KLOCKA_FORE_MIN före besökstiden: en anmälan för i morgon eftermiddag ska inte larma i kväll.
//   • Efter BESOK_EJ_SETT_ADMIN_MIN utan Uppfattat från en maskin som hör till besöket (lib/besok/maskinerPaBesok) köas EN push per planerare, besök och maskin.
//   • Texten byggs FÄRSKT vid utskick: har maskinen hunnit trycka Uppfattat, är besöket över eller objektet avslutat skickas ingenting. Läsfel lämnar raden oskickad.
//
// Ren modul (ingen Supabase-import) — raderna hämtas av anroparen (ejsett-ko.ts / app/api/notis/flush).

import { BESOK_EJ_SETT_ADMIN_MIN, BESOK_KLOCKA_FORE_MIN } from './konstanter';
import { kommerText, arBesokAktivt } from './tid';

export const BESOK_EJ_SETT = 'besok_ej_sett';
export const arBesokEjSett = (typ: unknown): typ is typeof BESOK_EJ_SETT => typ === BESOK_EJ_SETT;

export const EJ_SETT_MAX_ALDER_MS = 24 * 60 * 60 * 1000;

export type EjSettBesok = { id: string; objekt_id: string; besokstid: string; skapad_at: string };
export type EjSettKvittens = { besok_id: string; maskin_id: string };
export type EjSettKandidat = { besokId: string; objektId: string; maskinId: string; nyckel: string };

/** När klockan för "inte sett" började: anmälan, men tidigast BESOK_KLOCKA_FORE_MIN före besökstiden. */
export function klockStart(b: Pick<EjSettBesok, 'besokstid' | 'skapad_at'>): number {
  const skapad = Date.parse(b.skapad_at), tid = Date.parse(b.besokstid);
  if (!Number.isFinite(skapad) || !Number.isFinite(tid)) return NaN;
  return Math.max(skapad, tid - BESOK_KLOCKA_FORE_MIN * 60000);
}

/** Vilka (besök, maskin) som ska få en push nu. `maskiner` = maskinerna per objekt som ska ha sett besöket. */
export function valjEjSett(
  besok: readonly EjSettBesok[],
  maskinerPerObjekt: ReadonlyMap<string, readonly { maskinId: string }[]>,
  kvitt: readonly EjSettKvittens[],
  nu: Date = new Date(),
): EjSettKandidat[] {
  const sett = new Set(kvitt.map((k) => `${k.besok_id}|${k.maskin_id}`));
  const ut: EjSettKandidat[] = [];
  for (const b of besok) {
    if (!arBesokAktivt(b.besokstid, nu)) continue;
    const start = klockStart(b);
    if (!Number.isFinite(start) || nu.getTime() - start < BESOK_EJ_SETT_ADMIN_MIN * 60000) continue;
    for (const m of maskinerPerObjekt.get(b.objekt_id) ?? []) {
      if (sett.has(`${b.id}|${m.maskinId}`)) continue;
      ut.push({ besokId: b.id, objektId: b.objekt_id, maskinId: m.maskinId, nyckel: `besok_ej_sett:${b.id}:${m.maskinId}` });
    }
  }
  return ut;
}

// ---- Utskicket ------------------------------------------------------------------------------------------------------------------------------

export type EjSettRad = {
  besok: { id: string; namn: string; besokstid: string; objekt_id: string } | null;
  objekt: { id: string; namn: string; status: string | null } | null;
  maskinNamn: string | null;
  /** Har maskinen redan tryckt Uppfattat (på riktigt eller i testläge)? */
  sett: boolean;
};
export type HamtaEjSett = (besokId: string, maskinId: string) => Promise<{ rad: EjSettRad | null; fel?: string }>;
export type EjSettUtfall =
  | { typ: 'skicka'; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: 'hoppa_over'; orsak: string }
  | { typ: 'uppskjut' };

export const ejSettUrl = (objektId: string) => `/planering?objekt=${encodeURIComponent(objektId)}`;

export async function byggEjSettNotis(
  n: { typ: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  hamta: HamtaEjSett,
  nu: number = Date.now(),
): Promise<EjSettUtfall> {
  const besokId = n.payload?.besok_id, maskinId = n.payload?.maskin_id;
  if (typeof besokId !== 'string' || typeof maskinId !== 'string') return { typ: 'hoppa_over', orsak: 'Ej skickad — notisen saknar besök eller maskin' };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > EJ_SETT_MAX_ALDER_MS) return { typ: 'hoppa_over', orsak: 'Ej skickad — för gammal (köad för mer än 24 timmar sedan)' };
  const { rad, fel } = await hamta(besokId, maskinId);
  if (fel) return { typ: 'uppskjut' };
  if (!rad || !rad.besok) return { typ: 'hoppa_over', orsak: 'Ej skickad — besöket finns inte längre' };
  if (!rad.objekt) return { typ: 'hoppa_over', orsak: 'Ej skickad — objektet finns inte längre' };
  if (rad.objekt.status === 'avslutat' || rad.objekt.status === 'klar') return { typ: 'hoppa_over', orsak: 'Ej skickad — objektet är avslutat' };
  if (!arBesokAktivt(rad.besok.besokstid, new Date(nu))) return { typ: 'hoppa_over', orsak: 'Ej skickad — besöket är över' };
  if (rad.sett) return { typ: 'hoppa_over', orsak: 'Ej skickad — maskinen har redan tryckt Uppfattat' };
  const maskin = rad.maskinNamn?.trim() || 'En maskin';
  return {
    typ: 'skicka',
    meddelande: {
      title: `${maskin} har inte sett besöket på ${rad.objekt.namn}`,
      body: `${rad.besok.namn} ${kommerText(rad.besok.besokstid, new Date(nu))}. Ring föraren.`,
      url: ejSettUrl(rad.objekt.id),
      tag: `besok-ej-sett-${rad.besok.id}-${maskinId}`,
    },
  };
}
