// Objektöversikten — vad ett objekt tog i tid, och vad det blev. Rena funktioner, testade utan databas.
//
// Ett objekt (raden i `objekt`) har data under flera nummer: dess vo_nummer, dess extra nummer (objekt_alt_nummer,
// t.ex. Bågskyttebanans filnummer eller en maskins k-nummer), dim_objekt-rader med samma VO (Elefantens eget
// maskinobjekt A130743_7 på Jätsbygd) och objekt.dim_objekt_id. `objektIds` samlar dem; ALLA läsningar per objekt
// (maskintid, produktion, manuell skotning, extra tid) går genom den mängden — aldrig bara vo_nummer.
//
// Tid:
//  - Maskintid = G15 ur fakt_tid (lib/g15.ts), per maskin. Rollen ur dim_maskin.maskin_typ (Harvester = skördare).
//  - Saknar en maskin mätt tid på objektet men har en manuell rad (skotare_objekt_manuell.g15_timmar, 810E) räknas
//    den. Mätt tid vinner alltid för samma maskin — annars dubbelräknas den.
//  - Flytt = tid_flytt_min (lastad → lossad) för flyttarna HIT (maskin_flytt.till_objekt_id = objekt.id), inte avbrutna,
//    plus extra tid av typen flytt (en kollega som hjälper till att flytta en bil).
//  - Planering och manuellt arbete = extra_tid med aktivitet_typ planering/manuellt. Annan extra tid på objektet
//    (markägare, reparation …) står som "Annat arbete" när den finns.
//  - Minuterna avrundas per maskin och per del; totalen är summan av de avrundade delarna, så raderna går ihop.
//
// fakt_produktion och fakt_tid joinas aldrig: de läses var för sig och summeras här.

import { g15Sek } from '@/lib/g15';
import { stamObjektId, hogarObjektIds, type AltNummer } from '@/lib/objektNummer';
import { optiLokalDag } from '@/lib/optiTid';
import { tradslagLabel } from '@/lib/tradslag';

export type Roll = 'skordare' | 'skotare';

export interface ObjektRad {
  id: string;
  namn: string | null;
  vo_nummer: string | null;
  dim_objekt_id: string | null;
  status: string | null;
  typ: string | null;
  bolag: string | null;
  markagare?: string | null;
  volym: number | null;
  areal: number | null;
  manuell_prognos: unknown;
  /** Appens prognos, fryst innan maskinen började (lib/prognos/appPrognos). Saknas på objekt äldre än 2026-10-24. */
  app_prognos?: unknown;
  avslutad_timestamp: string | null;
  pagaende_startad_timestamp?: string | null;
  barighet?: string | null;
  terrang?: string | null;
  skotningsavstand?: string | null;
  skordare_band?: boolean | null;
  skotare_band?: boolean | null;
  skotare_extra_vagn?: boolean | null;
  skotare_lastreder_breddat?: boolean | null;
  transport_trailer_in?: boolean | null;
  skordare_manuell_fallning?: boolean | null;
  skordare_manuell_fallning_text?: string | null;
  cert?: string | null;
  anteckningar?: string | null;
  forardirektiv?: string | null;
  info_anteckningar?: string | null;
  markagare_ska_ha_ved?: boolean | null;
  markagare_ved_text?: string | null;
  grot?: boolean | null;
  grot_status?: string | null;
  skordare_maskin_id?: string | null;
  skotare_maskin_id?: string | null;
  medelstam?: number | null;
}

export interface DimRad {
  objekt_id: string;
  vo_nummer: string | null;
  skordning_avslutad: string | null;
  skotning_avslutad: string | null;
  egen_skotning: boolean | null;
  grot_hamtad: string | null;
}

export interface AltRad extends AltNummer { objekt_id: string }

export interface TidRad {
  datum: string;
  maskin_id: string;
  objekt_id: string | null;
  processing_sek: number | null;
  terrain_sek: number | null;
  other_work_sek: number | null;
  bransle_liter: number | null;
}

export interface ManuellRad { objekt_id: string; maskin_id: string; g15_timmar: number | null }

export interface ExtraRad {
  datum: string;
  minuter: number | null;
  aktivitet_typ: string | null;
  objekt_id: string | null;
  medarbetare_id: string | null;
}

export interface FlyttRad {
  id: string;
  maskin_id: string | null;
  extern_maskin: string | null;
  till_objekt_id: string | null;
  fran_objekt_id: string | null;
  fran_plats_id: string | null;
  starttid: string | null;
  sluttid: string | null;
  hamtad_tid: string | null;
  avbruten: boolean | null;
  tid_flytt_min: number | null;
  flytt_km: number | null;
}

export interface MaskinRad { maskin_id: string; visningsnamn: string | null; maskin_typ: string | null }
export interface NamnRad { id: string; namn: string | null }

export interface ProdRad { objekt_id: string | null; maskin_id: string | null; tradslag_id?: string | null; volym_m3sub: number | null; stammar: number | null }
export interface TradslagRad { tradslag_id: string; namn: string | null }

/** Allt som läses EN gång för hela listan (allt utom produktionen, som läses per objekt). */
export interface Underlag {
  objekt: ObjektRad[];
  dim: DimRad[];
  alt: AltRad[];
  tid: TidRad[];
  manuell: ManuellRad[];
  extra: ExtraRad[];
  flytt: FlyttRad[];
  maskiner: MaskinRad[];
  platser: NamnRad[];
  medarbetare: NamnRad[];
  /** dim_tradslag (id per maskin → namn) för trädslagen i produktionen. */
  tradslag?: TradslagRad[];
}

const SIFFROR = /^\d+$/;

/** Alla objekt_id objektets data kan ligga under. */
export function objektIds(o: Pick<ObjektRad, 'id' | 'vo_nummer' | 'dim_objekt_id'>, dim: readonly DimRad[], alt: readonly AltRad[]): Set<string> {
  const egna = alt.filter(a => a.objekt_id === o.id);
  const ut = new Set<string>();
  const vo = o.vo_nummer?.trim() || null;
  if (vo) for (const id of hogarObjektIds(vo, egna)) ut.add(id);
  else for (const a of egna) ut.add(stamObjektId(a));
  if (o.dim_objekt_id) ut.add(o.dim_objekt_id);
  // dim_objekt-rader med samma VO (skotarens eget maskinobjekt, P-VO-jobbens maskinobjekt).
  const voSet = new Set<string>([vo, ...egna.filter(a => SIFFROR.test(a.nummer)).map(a => a.nummer)].filter((v): v is string => !!v));
  for (const d of dim) if (d.vo_nummer && voSet.has(d.vo_nummer.trim())) ut.add(d.objekt_id);
  return ut;
}

export function rollFor(maskinTyp: string | null | undefined): Roll {
  return maskinTyp === 'Harvester' ? 'skordare' : 'skotare';
}

export interface MaskinTid {
  maskin_id: string;
  namn: string;
  roll: Roll;
  min: number;
  dagar: number;
  bransle: number;
  /** Tiden kommer ur en manuell rad (ingen fil från maskinen). */
  manuell: boolean;
}

export interface Flytt {
  id: string;
  maskin: string;
  /** Varifrån maskinen kom: ett objektnamn eller en flyttplats. null = okänt. */
  fran: string | null;
  datum: string | null;
  km: number | null;
  /** Lastad → lossad. null = tiden saknas. */
  min: number | null;
  /** Maskinens roll (för färgen); null för en extern maskin utan uppgift. */
  roll: Roll | null;
}

/** Vad en dags minuter gick till — samma delar som raderna i "Vart gick tiden?". */
export type TidDel = 'skordare' | 'skotare' | 'flytt' | 'planering' | 'manuellt' | 'annat';
export type DagDelar = Partial<Record<TidDel, number>>;
export const TID_DELAR: readonly TidDel[] = ['skordare', 'skotare', 'flytt', 'planering', 'manuellt', 'annat'];
export const dagSumma = (d: DagDelar) => TID_DELAR.reduce((t, k) => t + (d[k] ?? 0), 0);

export interface ExtraPost { datum: string; min: number; person: string | null }

export type UppgiftLage = 'klar' | 'pagar' | 'inte_borjat';
export interface Uppgift { id: 'skordning' | 'skotning' | 'grot'; lage: UppgiftLage; datum: string | null }

export interface Sammanstallning {
  objekt: ObjektRad;
  grupp: 'pagar' | 'planerad' | 'avslutad';
  /** "skotning kvar": skördningen är klar men skotningen inte (objektet står som avslutat). */
  skotningKvar: boolean;
  klart: string | null;
  maskiner: MaskinTid[];
  rollMin: Record<Roll, number>;
  flyttar: Flytt[];
  flyttMin: number;
  flytthjalpMin: number;
  planering: ExtraPost[];
  manuellt: ExtraPost[];
  annat: ExtraPost[];
  totalMin: number;
  /** Minuter per svensk dag (maskintid, extra tid och flytt som har en dag). */
  perDag: Map<string, DagDelar>;
  bransle: number;
  prognos: Partial<Record<Roll, number>>;
  /** Appens frysta prognos per roll (G15-tim); tom när ingen frysts. */
  appPrognos: Partial<Record<Roll, number>>;
  uppgifter: Uppgift[];
}

const summa = (l: readonly { min: number }[]) => l.reduce((s, x) => s + x.min, 0);

export function lasPrognos(raw: unknown): Partial<Record<Roll, number>> {
  const ut: Partial<Record<Roll, number>> = {};
  if (!raw || typeof raw !== 'object') return ut;
  for (const r of ['skordare', 'skotare'] as const) {
    const v = Number(String((raw as Record<string, unknown>)[r] ?? '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) ut[r] = v;
  }
  return ut;
}

/** Senaste avslutsdagen ur dim_objekt, annars dagen objektet avslutades i appen. */
function klartDatum(o: ObjektRad, dims: readonly DimRad[]): string | null {
  let max: string | null = null;
  for (const d of dims) for (const v of [d.skordning_avslutad, d.skotning_avslutad]) {
    const dag = v?.slice(0, 10) ?? null;
    if (dag && (!max || dag > max)) max = dag;
  }
  if (max) return max;
  return o.avslutad_timestamp ? optiLokalDag(o.avslutad_timestamp, true) : null;
}

function forsta(dims: readonly DimRad[], falt: 'skordning_avslutad' | 'skotning_avslutad' | 'grot_hamtad'): string | null {
  const v = dims.map(d => d[falt]?.slice(0, 10)).filter((x): x is string => !!x).sort();
  return v.length ? v[v.length - 1] : null;
}

export function sammanstall(o: ObjektRad, u: Underlag): Sammanstallning {
  const ids = objektIds(o, u.dim, u.alt);
  const dims = u.dim.filter(d => ids.has(d.objekt_id));
  const maskinInfo = new Map(u.maskiner.map(m => [m.maskin_id, m]));
  const namnFor = (id: string) => maskinInfo.get(id)?.visningsnamn?.trim() || id;
  const perDag = new Map<string, DagDelar>();
  const laggTill = (dag: string | null, del: TidDel, min: number) => {
    if (!dag || min <= 0) return;
    const d = perDag.get(dag) ?? {};
    d[del] = (d[del] ?? 0) + min;
    perDag.set(dag, d);
  };

  // ── Maskintid ───────────────────────────────────────────────────────────
  const perMaskin = new Map<string, { sek: number; dagar: Set<string>; bransle: number }>();
  const sekPerDag = new Map<string, number>();   // nyckel: dag|roll
  for (const t of u.tid) {
    if (!t.objekt_id || !ids.has(t.objekt_id)) continue;
    const sek = g15Sek(t.processing_sek, t.terrain_sek, t.other_work_sek);
    const m = perMaskin.get(t.maskin_id) ?? { sek: 0, dagar: new Set<string>(), bransle: 0 };
    m.sek += sek;
    if (sek > 0) m.dagar.add(t.datum);
    m.bransle += Number(t.bransle_liter) || 0;
    perMaskin.set(t.maskin_id, m);
    const nyckel = `${t.datum}|${rollFor(maskinInfo.get(t.maskin_id)?.maskin_typ)}`;
    sekPerDag.set(nyckel, (sekPerDag.get(nyckel) ?? 0) + sek);
  }
  for (const [nyckel, sek] of sekPerDag) {
    const [dag, roll] = nyckel.split('|');
    laggTill(dag, roll as Roll, Math.round(sek / 60));
  }

  const maskiner: MaskinTid[] = [];
  for (const [id, m] of perMaskin) {
    const min = Math.round(m.sek / 60);
    if (min <= 0 && m.bransle <= 0) continue;
    maskiner.push({ maskin_id: id, namn: namnFor(id), roll: rollFor(maskinInfo.get(id)?.maskin_typ), min, dagar: m.dagar.size, bransle: m.bransle, manuell: false });
  }
  const manuellPerMaskin = new Map<string, number>();
  for (const r of u.manuell) {
    if (!ids.has(r.objekt_id) || perMaskin.has(r.maskin_id)) continue;   // mätt tid vinner
    const h = Number(r.g15_timmar) || 0;
    if (h > 0) manuellPerMaskin.set(r.maskin_id, (manuellPerMaskin.get(r.maskin_id) ?? 0) + h);
  }
  for (const [id, h] of manuellPerMaskin) {
    maskiner.push({ maskin_id: id, namn: namnFor(id), roll: rollFor(maskinInfo.get(id)?.maskin_typ), min: Math.round(h * 60), dagar: 0, bransle: 0, manuell: true });
  }
  maskiner.sort((a, b) => (a.roll === b.roll ? b.min - a.min : a.roll === 'skordare' ? -1 : 1));
  const rollMin: Record<Roll, number> = {
    skordare: summa(maskiner.filter(m => m.roll === 'skordare')),
    skotare: summa(maskiner.filter(m => m.roll === 'skotare')),
  };

  // ── Flyttar hit ─────────────────────────────────────────────────────────
  const objektNamn = new Map(u.objekt.map(x => [x.id, x.namn]));
  const platsNamn = new Map(u.platser.map(p => [p.id, p.namn]));
  const flyttar: Flytt[] = u.flytt
    .filter(f => f.till_objekt_id === o.id && !f.avbruten && f.sluttid)
    .map(f => {
      const min = f.tid_flytt_min == null ? null : Math.round(Number(f.tid_flytt_min));
      const tid = f.hamtad_tid ?? f.starttid ?? f.sluttid;
      return {
        id: f.id,
        maskin: f.maskin_id ? namnFor(f.maskin_id) : (f.extern_maskin?.trim() || 'Okänd maskin'),
        fran: (f.fran_objekt_id && objektNamn.get(f.fran_objekt_id)?.trim()) || (f.fran_plats_id && platsNamn.get(f.fran_plats_id)?.trim()) || null,
        datum: tid ? optiLokalDag(tid, true) : null,
        km: f.flytt_km == null ? null : Number(f.flytt_km),
        min,
        roll: f.maskin_id && maskinInfo.has(f.maskin_id) ? rollFor(maskinInfo.get(f.maskin_id)?.maskin_typ) : null,
      };
    })
    .sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
  for (const f of flyttar) laggTill(f.datum, 'flytt', f.min ?? 0);

  // ── Extra tid (planering, manuellt, flytthjälp, annat) ──────────────────
  const person = new Map(u.medarbetare.map(m => [m.id, m.namn]));
  const planering: ExtraPost[] = [], manuellt: ExtraPost[] = [], annat: ExtraPost[] = [];
  let flytthjalpMin = 0;
  for (const e of u.extra) {
    if (!e.objekt_id || !ids.has(e.objekt_id)) continue;
    const min = Math.max(0, Math.round(Number(e.minuter) || 0));
    if (min <= 0) continue;
    const del: TidDel = e.aktivitet_typ === 'planering' ? 'planering' : e.aktivitet_typ === 'manuellt' ? 'manuellt' : e.aktivitet_typ === 'flytt' ? 'flytt' : 'annat';
    laggTill(e.datum, del, min);
    const post = { datum: e.datum, min, person: (e.medarbetare_id && person.get(e.medarbetare_id)?.trim()) || null };
    if (e.aktivitet_typ === 'planering') planering.push(post);
    else if (e.aktivitet_typ === 'manuellt') manuellt.push(post);
    else if (e.aktivitet_typ === 'flytt') flytthjalpMin += min;
    else annat.push(post);
  }
  const flyttMin = summa(flyttar.map(f => ({ min: f.min ?? 0 }))) + flytthjalpMin;

  const totalMin = rollMin.skordare + rollMin.skotare + flyttMin + summa(planering) + summa(manuellt) + summa(annat);

  // ── Status och vad som är kvar ──────────────────────────────────────────
  const skordat = forsta(dims, 'skordning_avslutad');
  const skotat = forsta(dims, 'skotning_avslutad');
  const egen = dims.some(d => d.egen_skotning);
  const uppgifter: Uppgift[] = [];
  const typ = o.typ ?? '';
  if (typ !== 'grot') uppgifter.push({ id: 'skordning', lage: skordat ? 'klar' : rollMin.skordare > 0 ? 'pagar' : 'inte_borjat', datum: skordat });
  if (!egen && typ !== 'grot') uppgifter.push({ id: 'skotning', lage: skotat ? 'klar' : rollMin.skotare > 0 ? 'pagar' : 'inte_borjat', datum: skotat });
  if (o.grot || typ === 'grot') {
    const hamtad = forsta(dims, 'grot_hamtad');
    const klar = o.grot_status === 'skotat' || !!hamtad || (typ === 'grot' && !!skotat);
    uppgifter.push({ id: 'grot', lage: klar ? 'klar' : (typ === 'grot' && rollMin.skotare > 0) ? 'pagar' : 'inte_borjat', datum: hamtad });
  }

  const status = o.status ?? '';
  const skotningKvar = (status === 'avslutat' || status === 'klar') && !!skordat && !skotat && !egen;
  const grupp: Sammanstallning['grupp'] =
    status === 'pagaende' || status === 'skotning' || status === 'skordning' || skotningKvar ? 'pagar'
    : status === 'planerad' ? 'planerad'
    : 'avslutad';

  return {
    objekt: o,
    grupp,
    skotningKvar,
    klart: grupp === 'avslutad' ? klartDatum(o, dims) : null,
    maskiner,
    rollMin,
    flyttar,
    flyttMin,
    flytthjalpMin,
    planering,
    manuellt,
    annat,
    totalMin,
    perDag,
    bransle: maskiner.reduce((s, m) => s + m.bransle, 0),
    prognos: lasPrognos(o.manuell_prognos),
    appPrognos: lasPrognos(o.app_prognos),
    uppgifter,
  };
}

export interface Produktion {
  volym: number;
  stammar: number;
  /** Volym per trädslag (namnet ur tradslagLabel: Gran, Tall, Björk, Övrigt löv …), störst först. */
  tradslag: { namn: string; volym: number }[];
}

/** Produktionen (skördarens) under objektets nummer: volym, stammar och volym per trädslag. */
export function summeraProduktion(
  o: ObjektRad,
  u: Pick<Underlag, 'dim' | 'alt' | 'maskiner'> & { tradslag?: readonly TradslagRad[] },
  prod: readonly ProdRad[],
): Produktion {
  const ids = objektIds(o, u.dim, u.alt);
  const typ = new Map(u.maskiner.map(m => [m.maskin_id, m.maskin_typ]));
  const tradNamn = new Map((u.tradslag ?? []).map(t => [t.tradslag_id, t.namn]));
  const perTrad = new Map<string, number>();
  let volym = 0, stammar = 0;
  for (const p of prod) {
    if (!p.objekt_id || !ids.has(p.objekt_id)) continue;
    if (p.maskin_id && typ.has(p.maskin_id) && rollFor(typ.get(p.maskin_id)) !== 'skordare') continue;
    const v = Number(p.volym_m3sub) || 0;
    volym += v;
    stammar += Number(p.stammar) || 0;
    if (v > 0) {
      const namn = tradslagLabel(p.tradslag_id ? tradNamn.get(p.tradslag_id) ?? null : null);
      perTrad.set(namn, (perTrad.get(namn) ?? 0) + v);
    }
  }
  const tradslag = [...perTrad.entries()].map(([namn, v]) => ({ namn, volym: v })).sort((a, b) => b.volym - a.volym);
  return { volym, stammar, tradslag };
}

/** Objekten som syns i översikten: allt utom de som ännu inte är planerade. */
export function visasIOversikten(o: Pick<ObjektRad, 'status'>): boolean {
  return (o.status ?? '') !== 'oplanerad';
}
