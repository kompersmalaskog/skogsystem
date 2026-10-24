// STARTA JOBB — listan över P-VO med läge (ledig / tagen / startad utan data / klar).
//
// byggJobbVyer är REN (testas i startaJobbLista.test.ts); lasJobbLista gör läsningarna och lämnar ALLA läsfel vidare — en lista som
// inte gick att läsa är aldrig "tom", och ett maskindata-läsfel får aldrig visa jobben som "Ledig" (då ser ett taget nummer ledigt ut).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AltNummer } from './objektNummer';
import { rollAvMaskintyp } from './maskindatorStart';
import { dimIdsForJobb, forvantat, lageText, voLage, type Forvantat, type MaskinSpar, type VoLage } from './startaJobbLage';

export interface ObjektRadIn {
  id: string;
  namn: string | null;
  vo_nummer: string | null;
  markagare?: string | null;
  bolag?: string | null;
  typ?: string | null;
  status?: string | null;
  ursprung?: string | null;
  lat?: unknown;
  lng?: unknown;
  created_at?: string | null;
  sla_ihop_avvisade?: string[] | null;
  dim_objekt_id?: string | null;
  hor_till_objekt_id?: string | null;
  egen_skotning?: boolean | null;
}

export interface DimRadIn {
  objekt_id: string;
  object_name?: string | null;
  vo_nummer?: string | null;
  skogsagare?: string | null;
  bolag?: string | null;
  maskin_id?: string | null;
  start_date?: string | null;
  egen_skotning?: boolean | null;
  huvudtyp?: string | null;
}

export interface MaskinIn { maskin_id: string; visningsnamn?: string | null; modell?: string | null; maskin_typ?: string | null }
export interface SparIn { objekt_id: string | null; maskin_id: string | null; roll?: string | null; datum?: string | null }
export interface AltIn extends AltNummer { objekt_id: string }

export interface JobbVy {
  nyckel: string;
  /** objekt.id; null = bara ett maskinobjekt med P-VO (ingen planeringsrad) */
  jobbId: string | null;
  namn: string;
  vo: string;
  typ: string | null;
  ursprung: string | null;
  status: string | null;
  markagare: string | null;
  bolag: string | null;
  egenSkotning: boolean;
  horTillId: string | null;
  lage: VoLage;
  lageText: string;
  maskiner: MaskinSpar[];
  forvantat: Forvantat;
  rad: ObjektRadIn | null;
}

export interface JobbIndataLista {
  objekt: readonly ObjektRadIn[];
  /** dim_objekt-rader med P-VO (vo_nummer like 'P-%') */
  dimMedVo: readonly DimRadIn[];
  /** dim_objekt-rader som jobben når via dim_objekt_id och extra nummer */
  dimKopplade: readonly DimRadIn[];
  alt: readonly AltIn[];
  spar: readonly SparIn[];
  maskiner: readonly MaskinIn[];
  idagAr: number;
}

const typAvHuvudtyp = (h: string | null | undefined): string | null => {
  const t = (h || '').toLowerCase();
  return t.includes('gallr') ? 'gallring' : t.includes('slut') ? 'slutavverkning' : null;
};

export function byggJobbVyer(i: JobbIndataLista): JobbVy[] {
  const maskinPer = new Map(i.maskiner.map((m) => [m.maskin_id, m]));
  const namnFor = (id: string) => { const m = maskinPer.get(id); return m?.visningsnamn || m?.modell || id; };
  const rollFor = (id: string, rollText?: string | null) => {
    const r = rollAvMaskintyp(maskinPer.get(id)?.maskin_typ);
    if (r) return r;
    return rollText === 'skordare' || rollText === 'skotare' ? rollText : null;
  };
  const franDim = (d: DimRadIn): MaskinSpar | null =>
    d.maskin_id ? { maskinId: d.maskin_id, namn: namnFor(d.maskin_id), roll: rollFor(d.maskin_id), forsta: d.start_date ?? null } : null;

  const dimPerId = new Map<string, DimRadIn>();
  for (const d of [...i.dimMedVo, ...i.dimKopplade]) if (d?.objekt_id) dimPerId.set(d.objekt_id, d);
  const dimPerVo = new Map<string, DimRadIn[]>();
  for (const d of i.dimMedVo) {
    const vo = (d.vo_nummer || '').trim();
    if (!vo) continue;
    dimPerVo.set(vo, [...(dimPerVo.get(vo) ?? []), d]);
  }
  const altPer = new Map<string, AltNummer[]>();
  for (const a of i.alt) altPer.set(a.objekt_id, [...(altPer.get(a.objekt_id) ?? []), { nummer: a.nummer, maskin_id: a.maskin_id }]);
  const sparPer = new Map<string, SparIn[]>();
  for (const s of i.spar) if (s.objekt_id) sparPer.set(s.objekt_id, [...(sparPer.get(s.objekt_id) ?? []), s]);

  const ut: JobbVy[] = [];
  const voMedJobb = new Set<string>();

  for (const o of i.objekt) {
    const vo = (o.vo_nummer || '').trim();
    if (!vo) continue;
    voMedJobb.add(vo);
    const dims = new Map<string, DimRadIn>();
    for (const d of dimPerVo.get(vo) ?? []) dims.set(d.objekt_id, d);
    for (const id of dimIdsForJobb({ vo, dimObjektId: o.dim_objekt_id, alt: altPer.get(o.id) ?? [] })) {
      const d = dimPerId.get(id);
      if (d) dims.set(d.objekt_id, d);
    }
    const maskiner: MaskinSpar[] = [];
    for (const d of dims.values()) { const m = franDim(d); if (m) maskiner.push(m); }
    for (const s of sparPer.get(o.id) ?? []) {
      if (s.maskin_id) maskiner.push({ maskinId: s.maskin_id, namn: namnFor(s.maskin_id), roll: rollFor(s.maskin_id, s.roll), forsta: s.datum ?? null });
    }
    const egen = o.egen_skotning === true || Array.from(dims.values()).some((d) => d.egen_skotning === true);
    const lage = voLage({ status: o.status, maskiner });
    ut.push({
      nyckel: 'obj-' + o.id, jobbId: o.id, namn: o.namn || 'Namnlöst objekt', vo,
      typ: o.typ ?? null, ursprung: o.ursprung ?? null, status: o.status ?? null,
      markagare: o.markagare ?? null, bolag: o.bolag ?? null, egenSkotning: egen, horTillId: o.hor_till_objekt_id ?? null,
      lage, lageText: lageText(lage, maskiner, i.idagAr), maskiner, forvantat: forvantat(o.typ, egen), rad: o,
    });
  }

  // Maskinobjekt med P-VO utan planeringsrad: numret är i bruk (det finns data), alltså taget.
  for (const [vo, dims] of dimPerVo) {
    if (voMedJobb.has(vo)) continue;
    const maskiner = dims.map(franDim).filter((m): m is MaskinSpar => !!m);
    const forst = dims[0];
    const typ = typAvHuvudtyp(forst.huvudtyp);
    const egen = dims.some((d) => d.egen_skotning === true);
    const lage = voLage({ status: null, maskiner });
    ut.push({
      nyckel: 'dim-' + forst.objekt_id, jobbId: null, namn: forst.object_name || 'Namnlöst objekt', vo,
      typ, ursprung: null, status: null, markagare: forst.skogsagare ?? null, bolag: forst.bolag ?? null, egenSkotning: egen, horTillId: null,
      lage, lageText: lageText(lage, maskiner, i.idagAr), maskiner, forvantat: forvantat(typ, egen), rad: null,
    });
  }
  return ut;
}

/** P-VO sorterade som de visas: numret fallande (nyast först). */
export function sorteraJobb(lista: readonly JobbVy[]): JobbVy[] {
  const nr = (vo: string) => { const m = /(\d+)\s*$/.exec(vo); return m ? Number(m[1]) : 0; };
  return [...lista].sort((a, b) => nr(b.vo) - nr(a.vo) || a.namn.localeCompare(b.namn, 'sv'));
}

export interface JobbGrupper { pagaende: JobbVy[]; lediga: JobbVy[]; klara: JobbVy[] }

/** Pågående = taget eller startat utan data. Lediga = inte inknappat. Klara = avslutade. */
export function grupperaJobb(lista: readonly JobbVy[]): JobbGrupper {
  const s = sorteraJobb(lista);
  return {
    pagaende: s.filter((j) => j.lage === 'tagen' || j.lage === 'ingen_data'),
    lediga: s.filter((j) => j.lage === 'ledig'),
    klara: s.filter((j) => j.lage === 'klar'),
  };
}

export function sokJobb(lista: readonly JobbVy[], q: string): JobbVy[] {
  const t = q.trim().toLowerCase();
  if (!t) return [...lista];
  return lista.filter((j) => [j.namn, j.vo, j.markagare, j.bolag, ...j.maskiner.map((m) => m.namn)].some((v) => (v || '').toLowerCase().includes(t)));
}

// ── Läsning ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const OBJ_KOL = 'id, namn, vo_nummer, markagare, bolag, typ, status, ursprung, lat, lng, created_at, sla_ihop_avvisade, dim_objekt_id, hor_till_objekt_id';

export type JobbListaSvar = { ok: true; jobb: JobbVy[]; varningar: string[] } | { ok: false; fel: string };

/** Läser allt listan behöver. Planeringsraderna måste gå att läsa (annars fel). Ett fel i maskindatan gör listan till ett fel —
 *  aldrig "Ledig" på ett nummer som kanske är taget. */
export async function lasJobbLista(supabase: SupabaseClient, idagAr: number): Promise<JobbListaSvar> {
  // egen_skotning finns först efter migrationen 20261024120000 — utan den läses listan ändå, utan kolumnen.
  let objR: { data: any[] | null; error: { message: string } | null } = await supabase.from('objekt').select(OBJ_KOL + ', egen_skotning').like('vo_nummer', 'P-%');
  if (objR.error && /egen_skotning/.test(objR.error.message || '')) objR = await supabase.from('objekt').select(OBJ_KOL).like('vo_nummer', 'P-%');
  if (objR.error) return { ok: false, fel: `Jobben kunde inte läsas: ${objR.error.message}` };
  const objekt = (objR.data || []) as ObjektRadIn[];
  const ids = objekt.map((o) => o.id);

  const [dimVoR, altR, sparR, maskR] = await Promise.all([
    supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, skogsagare, bolag, maskin_id, start_date, egen_skotning, huvudtyp').like('vo_nummer', 'P-%'),
    ids.length ? supabase.from('objekt_alt_nummer').select('objekt_id, nummer, maskin_id').in('objekt_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from('hyttspar').select('objekt_id, maskin_id, roll, datum').in('objekt_id', ids) : Promise.resolve({ data: [], error: null }),
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ'),
  ]);
  const fel = [dimVoR, altR, sparR].find((r: any) => r.error) as any;
  if (fel) return { ok: false, fel: `Kunde inte läsa om numren är inknappade: ${fel.error.message}` };

  const alt = (altR.data || []) as AltIn[];
  const altPer = new Map<string, AltNummer[]>();
  for (const a of alt) altPer.set(a.objekt_id, [...(altPer.get(a.objekt_id) ?? []), a]);
  const kopplade = new Set<string>();
  for (const o of objekt) for (const id of dimIdsForJobb({ vo: o.vo_nummer || '', dimObjektId: o.dim_objekt_id, alt: altPer.get(o.id) ?? [] })) kopplade.add(id);
  let dimKopplade: DimRadIn[] = [];
  if (kopplade.size) {
    const r = await supabase.from('dim_objekt').select('objekt_id, maskin_id, start_date, egen_skotning').in('objekt_id', Array.from(kopplade));
    if (r.error) return { ok: false, fel: `Kunde inte läsa om numren är inknappade: ${r.error.message}` };
    dimKopplade = (r.data || []) as DimRadIn[];
  }

  const varningar: string[] = [];
  if (maskR.error) varningar.push(`Maskinnamnen kunde inte läsas (${maskR.error.message}) — maskinerna visas med sitt id.`);

  const jobb = byggJobbVyer({
    objekt, dimMedVo: (dimVoR.data || []) as DimRadIn[], dimKopplade, alt, spar: (sparR.data || []) as SparIn[],
    maskiner: (maskR.data || []) as MaskinIn[], idagAr,
  });
  return { ok: true, jobb, varningar };
}
