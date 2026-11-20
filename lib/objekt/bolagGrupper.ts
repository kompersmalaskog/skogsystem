// Täckningen PER BOLAG: ett objekt med bolag X räknas mot bolag X:s beställning och aldrig mot någon annans.
//
//   • Sektionerna grupperas per bolag, typ inuti.
//   • Ett bolag UTAN beställning (för typen) visar sina trakter men ingen täckningsrad.
//   • Ett bolag MED beställning men utan objekt visar hela beställningen som kvar.
//   • Ett objekt utan bolag (eller utan månad, eller utan volym där volymen krävs) kan inte räknas någonstans — det hamnar i
//     "Behöver kompletteras", med vad som fattas utskrivet, och räknas inte in i något bolag.
//
// Objekten har bara bolagets NAMN (objekt.bolag är text, ingen bolag_id), så de matchas mot beställningens bolagsnamn med samma jämförelse
// som tabellens unika index (lower(namn)): bolagNyckel.
import { bolagNyckel } from './bolag';
import { arAvslutat } from './utfall';
import { bestalltSumma, inlagtSumma, lageText, TYPER, type Lage, type ObjektTyp } from './tackning';

export interface GruppObjekt { typ: string | null; bolag: string | null; volym: number | null }
export interface GruppPost { typ: ObjektTyp; bolag: string; volym: number }

export interface TypBlock<O> {
  typ: ObjektTyp;
  namn: string;
  objekt: O[];
  /** null = bolaget har ingen beställning på typen → ingen täckningsrad. */
  bestallt: number | null;
  inlagt: number;
  lage: Lage | null;
}

export interface BolagGrupp<O> {
  nyckel: string;
  bolag: string;
  typer: TypBlock<O>[];
  grot: O[];
  /** Har bolaget minst en beställning den här månaden? (Sorteringen lägger dem först.) */
  harBestallning: boolean;
}

const sv = (a: string, b: string) => a.localeCompare(b, 'sv');

export function grupperaPerBolag<O extends GruppObjekt>(objekt: readonly O[], poster: readonly GruppPost[]): BolagGrupp<O>[] {
  const namnPer = new Map<string, string>();
  for (const p of poster) if (bolagNyckel(p.bolag)) namnPer.set(bolagNyckel(p.bolag), p.bolag.trim());
  for (const o of objekt) if (bolagNyckel(o.bolag) && !namnPer.has(bolagNyckel(o.bolag))) namnPer.set(bolagNyckel(o.bolag), String(o.bolag).trim());

  const grupper: BolagGrupp<O>[] = [];
  for (const [nyckel, bolag] of namnPer) {
    const egnaPoster = poster.filter(p => bolagNyckel(p.bolag) === nyckel);
    const egna = objekt.filter(o => bolagNyckel(o.bolag) === nyckel);
    const typer: TypBlock<O>[] = [];
    for (const t of TYPER) {
      const pt = egnaPoster.filter(p => p.typ === t.id);
      const rader = egna.filter(o => o.typ === t.id);
      if (pt.length === 0 && rader.length === 0) continue;
      const bestallt = bestalltSumma(pt);
      const inlagt = inlagtSumma(rader);
      typer.push({ typ: t.id, namn: t.namn, objekt: rader, bestallt, inlagt, lage: bestallt == null ? null : lageText(inlagt, bestallt) });
    }
    const grot = egna.filter(o => o.typ === 'grot');
    if (typer.length === 0 && grot.length === 0) continue;
    grupper.push({ nyckel, bolag, typer, grot, harBestallning: egnaPoster.length > 0 });
  }
  return grupper.sort((a, b) => (a.harBestallning === b.harBestallning ? sv(a.bolag, b.bolag) : a.harBestallning ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Behöver kompletteras
// ---------------------------------------------------------------------------

export type Saknas = 'månad' | 'bolag' | 'volym';

export interface KompletterObjekt extends GruppObjekt { ar: number | null; manad: number | null; status: string | null }

/** Vad som hindrar ett objekt från att räknas. Volymen krävs bara där det finns en beställning att räkna mot (gallring, slutavverkning). */
export function saknasForRakning(o: KompletterObjekt): Saknas[] {
  const ut: Saknas[] = [];
  if (o.ar == null || o.manad == null) ut.push('månad');
  if (!bolagNyckel(o.bolag)) ut.push('bolag');
  if ((o.typ === 'gallring' || o.typ === 'slutavverkning') && !(typeof o.volym === 'number' && o.volym > 0)) ut.push('volym');
  return ut;
}

/**
 * Listan "Behöver kompletteras": objekt som inte går att placera under ett bolag och en månad — levande objekt utan månad eller bolag, plus
 * ALLA objekt i den visade månaden utan bolag (de skulle annars försvinna ur månaden). Avslutade objekt utan månad ligger inte här: de tjatar
 * inte. Ett objekt som HAR månad och bolag men saknar volym står kvar i sin grupp med "saknas" på raden (det går att placera) — men står det
 * i listan, för att något annat saknas, skrivs volymen ut bland det som fattas. Dubbletter slås ihop.
 */
export function attKomplettera<O extends KompletterObjekt & { id: string }>(levandeUtanDelar: readonly O[], manadensObjekt: readonly O[]): { objekt: O; saknas: Saknas[] }[] {
  const sett = new Set<string>();
  const ut: { objekt: O; saknas: Saknas[] }[] = [];
  const lagg = (o: O) => {
    if (sett.has(o.id)) return;
    const s = saknasForRakning(o);
    if (!s.includes('månad') && !s.includes('bolag')) return;
    sett.add(o.id);
    ut.push({ objekt: o, saknas: s });
  };
  for (const o of levandeUtanDelar) if (!arAvslutat(o.status)) lagg(o);
  for (const o of manadensObjekt) if (!bolagNyckel(o.bolag)) lagg(o);
  return ut;
}
