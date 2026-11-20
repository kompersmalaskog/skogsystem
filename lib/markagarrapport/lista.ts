// Listan över avverkningar med markägarrapport — läsningen och de rena reglerna.
//
// En rad = ett slutavverkat objekt (dim_objekt.cutting_method = 'ClearCutting', satt av importen) som har
// avverkad volym. Volymen kommer ur fakt_sortiment i EN läsning (förut en räknefråga per objekt mot detalj_stam).
// Ett läsfel är ett fel, aldrig en tom lista.

import { hamtaAlla } from '@/lib/supabaseAlla';
import { optiLokalDag } from '@/lib/optiTid';

export type ListRad = {
  objekt_id: string;
  namn: string;
  skogsagare: string | null;
  /** Första avverkningsdag (svensk dag, YYYY-MM-DD) ur HPR-filerna. */
  datum: string | null;
  pagar: boolean;
  volym_m3: number;
};

export type ListGrupp = { nyckel: string; rubrik: string; rader: ListRad[] };

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];
const KORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "13 okt" ur YYYY-MM-DD. */
export function kortDatum(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  return `${Number(m[3])} ${KORT[Number(m[2]) - 1]}`;
}

/** Raden under namnet: "13 okt · J-Hus", "Pågår · J-Hus", eller bara det som finns. */
export function underText(r: ListRad): string {
  const forst = r.pagar ? 'Pågår' : kortDatum(r.datum);
  return [forst, r.skogsagare?.trim() || null].filter(Boolean).join(' · ');
}

/**
 * Grupperar per månad för första avverkningsdag, nyast först (månadsnamnet får året när det inte är i år).
 * Rader utan datum hamnar sist under "Utan datum". Inom en månad: senast först, sedan namnet.
 */
export function grupperaPerManad(rader: ListRad[], idag = new Date()): ListGrupp[] {
  const iAr = idag.getFullYear();
  const map = new Map<string, ListRad[]>();
  for (const r of rader) {
    const nyckel = r.datum?.slice(0, 7) ?? 'utan';
    const lista = map.get(nyckel) ?? [];
    lista.push(r);
    map.set(nyckel, lista);
  }
  const nycklar = [...map.keys()].sort((a, b) => (a === 'utan' ? 1 : b === 'utan' ? -1 : b.localeCompare(a)));
  return nycklar.map(nyckel => {
    const rad = map.get(nyckel)!.sort((a, b) =>
      (b.datum ?? '').localeCompare(a.datum ?? '') || a.namn.localeCompare(b.namn, 'sv'));
    if (nyckel === 'utan') return { nyckel, rubrik: 'Utan datum', rader: rad };
    const [ar, man] = nyckel.split('-').map(Number);
    return { nyckel, rubrik: ar === iAr ? MANADER[man - 1] : `${MANADER[man - 1]} ${ar}`, rader: rad };
  });
}

/** Sökning i namn och skogsägare, alla ord måste träffa. */
export function sok(rader: ListRad[], fraga: string): ListRad[] {
  const ord = fraga.toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
  if (ord.length === 0) return rader;
  return rader.filter(r => {
    const text = `${r.namn} ${r.skogsagare ?? ''}`.toLocaleLowerCase('sv');
    return ord.every(o => text.includes(o));
  });
}

type DimRad = { objekt_id: string; object_name: string | null; skogsagare: string | null };
type ObjektRad = { vo_nummer: string | null; dim_objekt_id: string | null; typ: string | null; status: string | null };

/** Ren sammanställning — testad utan databas. */
export function byggListRader(
  dim: DimRad[],
  objekt: ObjektRad[],
  volymer: { objekt_id: string; volym_m3sub: number | null }[],
  datumByObjekt: Map<string, string>,
): ListRad[] {
  const objektFor = new Map<string, ObjektRad>();
  for (const o of objekt) {
    if (o.dim_objekt_id) objektFor.set(o.dim_objekt_id, o);
    if (o.vo_nummer && !objektFor.has(o.vo_nummer)) objektFor.set(o.vo_nummer, o);
  }
  const volym = new Map<string, number>();
  for (const v of volymer) volym.set(v.objekt_id, (volym.get(v.objekt_id) ?? 0) + (Number(v.volym_m3sub) || 0));

  return dim
    .filter(d => objektFor.get(d.objekt_id)?.typ !== 'gallring') // Filen kan säga ClearCutting på en gallring (Gallring Vällust).
    .map(d => ({
      objekt_id: d.objekt_id,
      namn: d.object_name ?? d.objekt_id,
      skogsagare: d.skogsagare ?? null,
      datum: datumByObjekt.get(d.objekt_id) ?? null,
      pagar: objektFor.get(d.objekt_id)?.status === 'pagaende',
      volym_m3: volym.get(d.objekt_id) ?? 0,
    }))
    .filter(r => Math.round(r.volym_m3) > 0);
}

type Klient = { from: (t: string) => any };

export async function hamtaListRader(supabase: Klient): Promise<{ rader: ListRad[]; fel: string | null }> {
  const { data: dimRows, error: dimFel } = await supabase
    .from('dim_objekt')
    .select('objekt_id, object_name, skogsagare')
    .eq('cutting_method', 'ClearCutting');
  if (dimFel) return { rader: [], fel: 'objekten' };
  const dim = (dimRows ?? []) as DimRad[];
  if (dim.length === 0) return { rader: [], fel: null };
  const ids = dim.map(d => d.objekt_id);

  const [viaVo, viaDim, vol, hpr] = await Promise.all([
    supabase.from('objekt').select('vo_nummer, dim_objekt_id, typ, status').in('vo_nummer', ids),
    supabase.from('objekt').select('vo_nummer, dim_objekt_id, typ, status').in('dim_objekt_id', ids),
    hamtaAlla<{ objekt_id: string; volym_m3sub: number | null }>(
      () => supabase.from('fakt_sortiment').select('id, objekt_id, volym_m3sub').in('objekt_id', ids), 'id'),
    // fil_datum = äldsta stammens tid i den kumulativa filen = objektets första avverkningsdag (se tidigare listan).
    hamtaAlla<{ objekt_nyckel: string | null; fil_datum: string | null; tid_ar_utc: boolean | null }>(
      () => supabase.from('hpr_filer').select('filnamn, objekt_nyckel, fil_datum, tid_ar_utc'), 'filnamn'),
  ]);
  if (viaVo.error || viaDim.error) return { rader: [], fel: 'objekten' };
  if (vol.error) return { rader: [], fel: 'volymerna' };
  if (hpr.error) return { rader: [], fel: 'datumen' };

  const datum = new Map<string, string>();
  for (const h of hpr.data) {
    const [maskin, ident] = String(h.objekt_nyckel ?? '').split(':');
    if (!ident || !h.fil_datum) continue;
    // numeriskt ident = vo (= dim_objekt.objekt_id); 'k<KEY>' → dim-fallback-id 'MASKIN_KEY'
    const id = /^\d+$/.test(ident) ? ident : `${maskin}_${ident.slice(1)}`;
    const d = optiLokalDag(String(h.fil_datum), h.tid_ar_utc) ?? String(h.fil_datum).slice(0, 10);
    const cur = datum.get(id);
    if (!cur || d < cur) datum.set(id, d);
  }

  const objekt = [...(viaVo.data ?? []), ...(viaDim.data ?? [])] as ObjektRad[];
  return { rader: byggListRader(dim, objekt, vol.data, datum), fel: null };
}
