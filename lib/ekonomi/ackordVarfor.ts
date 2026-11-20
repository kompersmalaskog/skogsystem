// Ackord – VARFÖR. Vymodellen för en skog: resultatet, maskinerna var för
// sig, orsakerna och det som inte är räknat. Ren: ingen läsning, ingen egen
// kalkyl av ackord eller timpeng.
//
// GRUNDREGELN: talet överst på en skog är objektKr (lib/ekonomi/ackordVy) —
// exakt samma tal som raden i listan. Maskinens tal är delKr. Allt annat här
// plockar bara isär de talen (MaskinDel.pris) eller ställer mätningar bredvid
// dem. Avståndets "hade blivit" räknas med prisets egen stegregel
// (skotAvstandKrPerM3) — ingen kopia.
//
// ÄRLIGHET: saknas en mätning finns raden inte. Aldrig 0, aldrig en gissning.
// Det som påverkar resultatet men inte är räknat står under inteMed.

import type { MaskinDel, ObjektRad } from './objektJamforelse';
import { delKr, objektKr, type MaskinRad } from './ackordVy';
import { skotAvstandKrPerM3 } from './acord';
import { delaHalften, type Tillaggspost } from './prisPerM3';
import type { CykelSammanstallning } from '@/lib/faktura/lassCykel';
import type { LassSnitt, TidSnitt } from './lassTider';

/** Mätningarna bredvid räkningen. Varje del är null när den inte finns eller inte gick att läsa. */
export type Matt = {
  cykel: CykelSammanstallning | null;
  tider: TidSnitt | null;
  lass: LassSnitt | null;
  /** Antal registrerade flyttar till skogen. null = kunde inte läsas, 'laser' = inte läst än (ingen rad). */
  flyttar: number | null | 'laser';
};
export const INGET_MATT: Matt = { cykel: null, tider: null, lass: null, flyttar: null };

const heltal = (n: number) => Math.round(n).toLocaleString('sv-SE');
const dec = (n: number, d: number) => n.toFixed(d).replace('.', ',');
const kr = (n: number) => `${heltal(n)} kr`;
const medTecken = (n: number) => `${n < 0 ? '−' : '+'}${heltal(Math.abs(n))} kr`;
const Roll = (r: MaskinDel['roll']) => (r === 'skördare' ? 'Skördaren' : 'Skotaren');

export type KortRad = { titel: string; uttryck?: string; kr: number };
export type MaskinKort = {
  maskin_id: string;
  roll: MaskinDel['roll'];
  namn: string;
  /** +/- mot timpeng — delKr, samma tal som Maskin-fliken. */
  kr: number;
  /** "1 725 m³fub × 57,50 kr" — maskinens hela ackord per m³fub, avstånd och tillägg inräknade. */
  ackordUttryck: string;
  /** Ackordets delar. Summerar till `ackord`. */
  ackordRader: KortRad[];
  ackord: number;
  timpeng: KortRad;
  /** null när maskinen saknar timmar — då finns inget per timme att säga. */
  perTimme: { ackord: number; timpris: number; diff: number } | null;
  noter: string[];
};

export type VarforRad = {
  nyckel: string;
  titel: string;
  under?: string;
  /** Kronor av minuset som raden förklarar. 0 = en upplysning. */
  forklararKr: number;
  orange: boolean;
};
export type GemensamRad = { etikett: string; krPerM3: number; kr: number; till: string };
export type SkogVarfor = {
  kr: number;
  ackord: number;
  timpeng: number;
  maskiner: MaskinKort[];
  gemensamt: GemensamRad[];
  varfor: VarforRad[];
  inteMed: { titel: string; under?: string }[];
  /** Den största orsaken i kort form, för listan. null = skogen går inte minus. */
  orsak: string | null;
  /** Vad som mest förklarar varje maskins minus på den här skogen. */
  maskinOrsak: Record<string, 'takt' | 'avstand' | null>;
};

export const MAX_VARFOR = 6;

/** Två tal som heltal — eller med en decimal när de annars ser lika ut. */
function parTal(a: number, b: number): [string, string] {
  return Math.round(a) === Math.round(b) ? [dec(a, 1), dec(b, 1)] : [heltal(a), heltal(b)];
}

function maskinKort(d: MaskinDel, namn: string): MaskinKort {
  const diff = delKr(d);
  const timpeng = Math.round(d.timpeng);
  // Kortets kolumn ska gå att räkna ihop OCH sluta på delKr. Ackordet visas
  // därför som delKr + avrundad timpeng (högst en krona från det oavrundade),
  // och tilläggsraden bär avrundningsresten.
  const ackord = diff + timpeng;
  const rader: KortRad[] = [];
  const noter: string[] = [];
  const p = d.pris;
  if (p) {
    const grund = Math.round(p.volymAckord * p.grundKrPerM3);
    const avstand = Math.round(p.avstandKr);
    const undantag = Math.round(p.undantagKr);
    rader.push({ titel: 'Grundpris', uttryck: `${heltal(p.volymAckord)} m³fub × ${dec(p.grundKrPerM3, 2)} kr`, kr: grund });
    if (avstand !== 0) rader.push({ titel: 'Skotningsavstånd', kr: avstand });
    if (undantag !== 0) rader.push({ titel: 'Del på timpeng', kr: undantag });
    const tillagg = ackord - grund - avstand - undantag;
    if (tillagg !== 0) rader.push({ titel: 'Gemensamt', uttryck: `${dec(p.tillaggKrPerM3, 2)} kr/m³fub`, kr: tillagg });
  } else {
    rader.push({ titel: 'Ackord', uttryck: `${heltal(d.volym)} m³fub`, kr: ackord });
  }
  const timpris = d.timmar > 0 ? d.timpeng / d.timmar : d.timpris;
  if (d.manuellTid) noter.push('Tiden är satt för hand');
  return {
    maskin_id: d.maskin_id, roll: d.roll, namn, kr: diff,
    ackordUttryck: d.volym > 0 ? `${heltal(d.volym)} m³fub × ${dec(ackord / d.volym, 2)} kr` : `${heltal(d.volym)} m³fub`,
    ackordRader: rader, ackord,
    timpeng: { titel: 'Timpeng', uttryck: `${dec(d.timmar, 1)} tim × ${heltal(timpris)} kr`, kr: timpeng },
    perTimme: d.timmar > 0 ? { ackord: ackord / d.timmar, timpris, diff: ackord / d.timmar - timpris } : null,
    noter,
  };
}

function gemensamt(o: ObjektRad): GemensamRad[] {
  const poster: Tillaggspost[] = o.detalj?.tillagg ?? [];
  const vol = (roll: MaskinDel['roll']) =>
    o.maskiner.filter(d => d.roll === roll).reduce((s, d) => s + (d.pris?.volymAckord ?? d.volym), 0);
  const TILL: Record<Tillaggspost['mottagare'], string> = {
    skordare: 'hela till skördaren', skotare: 'hela till skotaren', delas: 'delas mellan maskinerna',
  };
  const NAMN: Record<string, string> = { 'Krönt': 'Kvalitetssäkring', Storlek: 'Traktstorlek', Sortiment: 'Sortiment', 'Terräng': 'Terräng' };
  return poster.map(post => {
    const andel = post.mottagare === 'skordare' ? { skordare: post.belopp, skotare: 0 }
      : post.mottagare === 'skotare' ? { skordare: 0, skotare: post.belopp }
      : delaHalften(post.belopp);
    return {
      etikett: NAMN[post.etikett] ?? post.etikett,
      krPerM3: post.belopp,
      kr: Math.round(andel.skordare * vol('skördare') + andel.skotare * vol('skotare')),
      till: TILL[post.mottagare],
    };
  });
}

/** Avståndet: det ackordet räknats på mot det som körts enligt hyttspåret. */
function avstand(o: ObjektRad, matt: Matt): { rad: VarforRad; diffKr: number; kort: string | null } | null {
  const a = o.detalj?.avstand;
  const skotare = o.maskiner.filter(d => d.roll === 'skotare');
  if (!a || o.egenSkotning || skotare.length === 0) return null;
  const raknatM = a.manuellM ?? a.lassM;
  const kordM = matt.cykel?.enkelVagM ?? null;
  if (raknatM == null && kordM == null) return null;

  const raknatText = raknatM != null ? `räknat ${heltal(raknatM)} m${a.manuellM != null ? ' (satt för hand)' : ''}` : 'inget avstånd räknat';
  if (kordM == null) {
    return { rad: { nyckel: 'avstand', titel: `Skotningsavstånd: ${raknatText}`, forklararKr: 0, orange: false }, diffKr: 0, kort: null };
  }
  const c = matt.cykel!;
  const tackning = c.medCykel < c.lass ? ` Mätt på ${c.medCykel} av ${c.lass} lass.` : '';
  const titel = `Skotningsavstånd: ${raknatText} · kört ${heltal(kordM)} m`;
  const raknatKr = skotare.reduce((s, d) => s + (d.pris?.avstandKr ?? 0), 0);
  const volym = skotare.reduce((s, d) => s + d.volym, 0);
  const hadeBlivit = a.regel ? skotAvstandKrPerM3(kordM, a.regel) * volym : null;
  const diffKr = hadeBlivit != null ? Math.round(hadeBlivit - raknatKr) : 0;
  if (hadeBlivit != null && diffKr > 0) {
    return {
      rad: {
        nyckel: 'avstand', titel,
        under: `Tillägget hade blivit ca ${kr(hadeBlivit)} i stället för ${kr(raknatKr)}. Det är ca ${kr(diffKr)} vi kanske borde fått – inte dålig körning.${tackning}`,
        forklararKr: diffKr, orange: false,
      },
      diffKr,
      kort: `Skotningsavståndet – kört ${heltal(kordM)} m, ${raknatM != null ? `räknat ${heltal(raknatM)} m` : 'inget räknat'}`,
    };
  }
  return { rad: { nyckel: 'avstand', titel, under: `Enkel väg enligt körspåret.${tackning}`, forklararKr: 0, orange: false }, diffKr: 0, kort: null };
}

export function skogVarfor(o: ObjektRad, namn: (maskin_id: string) => string, matt: Matt = INGET_MATT): SkogVarfor {
  const total = objektKr(o);
  const maskiner = o.maskiner.map(d => maskinKort(d, namn(d.maskin_id)));
  const avst = avstand(o, matt);
  const skotadVol = o.maskiner.filter(d => d.roll === 'skotare').reduce((s, d) => s + d.volym, 0);

  // ── Varför ──
  const rader: (VarforRad & { kort?: string | null; maskin?: string })[] = [];
  const maskinOrsak: SkogVarfor['maskinOrsak'] = {};
  for (const d of o.maskiner) {
    const diff = delKr(d);
    maskinOrsak[d.maskin_id] = null;
    if (!(d.timmar > 0) || !(d.volym > 0) || !(d.ackord > 0)) continue;
    const takt = d.volym / d.timmar;
    // Jämnt går det när m³/h × ackord per m³ = timpriset. Avstånd och maskinens
    // tillägg ingår i ackordet per m³ — det är maskinens verkliga pris.
    const behov = (d.timpeng / d.timmar) / (d.ackord / d.volym);
    const minus = Math.max(0, -diff);
    // Skotarens minus som beror på avståndet står på avståndsraden, inte här.
    const avstDel = d.roll === 'skotare' && avst && skotadVol > 0 ? avst.diffKr * (d.volym / skotadVol) : 0;
    const egen = Math.max(0, minus - avstDel);
    if (minus > 0) maskinOrsak[d.maskin_id] = avstDel > egen ? 'avstand' : 'takt';
    const [t, b] = parTal(takt, behov);
    const fler = o.maskiner.filter(x => x.roll === d.roll).length > 1;
    const vem = fler ? `${Roll(d.roll)} ${namn(d.maskin_id)}` : Roll(d.roll);
    rader.push({
      nyckel: `takt:${d.maskin_id}`, maskin: d.maskin_id,
      titel: `${vem} ${t} m³/h · behöver ${b}`,
      under: diff < 0 ? `${kr(-diff)} under timpeng` : diff > 0 ? `${kr(diff)} över timpeng` : 'Jämnt med timpeng',
      forklararKr: egen, orange: false,
      kort: `${vem} under – ${t} m³/h, behöver ${b}`,
    });
  }
  if (avst) rader.push({ ...avst.rad, kort: avst.kort });

  if (o.detalj) {
    const terr = o.detalj.terrangKr > 0 ? `terräng svår +${dec(o.detalj.terrangKr, 0)} kr/m³` : 'terräng normal';
    rader.push({ nyckel: 'medelstam', titel: `Medelstam ${dec(o.medelstam, 2)} m³ · ${terr}`, forklararKr: 0, orange: false });
  }
  if (matt.tider) {
    const t = matt.tider;
    rader.push({
      nyckel: 'tider',
      titel: `Per lass: lastar ca ${heltal(t.lastaMin)} min · kör ca ${heltal(t.koraMin)} min · avlägg ca ${heltal(t.avlaggMin)} min`,
      under: `Ur körspåret, ${t.lass} lass`, forklararKr: 0, orange: false,
    });
  }
  if (matt.lass) {
    const l = matt.lass;
    const bredd = l.breddade === 0 ? 'kördes smal' : l.breddade === l.lass ? 'kördes bred' : `${l.breddade} av ${l.lass} lass breddade`;
    rader.push({ nyckel: 'lass', titel: `Snittlass ${dec(l.snittM3, 1)} m³ · ${bredd}`, forklararKr: 0, orange: false });
  }

  // Orange = raden som förklarar mest av minuset. Bara på en skog som går minus.
  let storst: (typeof rader)[number] | null = null;
  if (total < 0) {
    for (const r of rader) if (r.forklararKr > 0 && (!storst || r.forklararKr > storst.forklararKr)) storst = r;
  }
  let varfor = rader.slice(0, MAX_VARFOR);
  if (storst && !varfor.includes(storst)) varfor = [...varfor.slice(0, MAX_VARFOR - 1), storst];

  // ── Inte med än ──
  const inteMed: SkogVarfor['inteMed'] = [];
  if (matt.flyttar === 'laser') { /* inte läst än — ingen rad, aldrig en gissning */ }
  else if (matt.flyttar === 0) inteMed.push({ titel: 'Ingen flytt är registrerad hit', under: 'Flyttersättningen saknas därför helt.' });
  else if (matt.flyttar == null) inteMed.push({ titel: 'Flyttersättningen är inte med', under: 'Flyttarna hit kunde inte läsas.' });
  else inteMed.push({ titel: 'Flyttersättningen är inte med', under: `${matt.flyttar} ${matt.flyttar === 1 ? 'flytt' : 'flyttar'} hit är registrerade och faktureras för sig.` });
  const det = o.detalj;
  inteMed.push({ titel: 'Dieselklausulen är inte räknad', under: det?.dieselBas != null ? `Prislistans bas är ${dec(det.dieselBas, 2)} kr/l.` : undefined });
  inteMed.push({ titel: 'Tillägg för 3 m massaved är inte räknat', under: det?.massa3mKr != null ? `${dec(det.massa3mKr, 0)} kr/m³ enligt prislistan – appen vet inte om skogen hade det.` : undefined });
  if (det && det.terrangKr === 0) inteMed.push({ titel: 'Terrängtillägg är inte satt', under: '0 kr kan vara rätt – men ingen har valt det.' });
  if (det?.skotadManuell) inteMed.push({ titel: 'Skotad volym är satt för hand' });
  if (o.maskiner.some(d => d.manuellTid)) inteMed.push({ titel: 'Tiden är satt för hand på minst en maskin' });

  return {
    kr: total,
    ackord: maskiner.reduce((s, m) => s + m.ackord, 0),
    timpeng: maskiner.reduce((s, m) => s + m.timpeng.kr, 0),
    maskiner,
    gemensamt: gemensamt(o),
    varfor: varfor.map(({ kort: _k, maskin: _m, ...r }) => ({ ...r, orange: r.nyckel === storst?.nyckel })),
    inteMed,
    orsak: total < 0 ? (storst?.kort ?? null) : null,
    maskinOrsak,
  };
}

/** "+8 491 kr" — tecknet bär riktningen i uträkningsrader där "mer/mindre" inte passar. */
export const krMedTecken = medTecken;

/**
 * Maskin-fliken: den vanligaste orsaken på skogarna där maskinen gick under
 * timpeng. null = maskinen gick inte under på någon skog.
 */
export function maskinVanligastOrsak(m: Pick<MaskinRad, 'maskin_id' | 'skogar'>, varfor: Map<string, SkogVarfor>): string | null {
  const under = m.skogar.filter(s => s.kr < 0);
  if (!under.length) return null;
  let avst = 0, takt = 0;
  for (const s of under) {
    const orsak = varfor.get(s.objekt.objekt_id)?.maskinOrsak[m.maskin_id];
    if (orsak === 'avstand') avst++; else takt++;
  }
  const antal = `${Math.max(avst, takt)} av ${under.length} ${under.length === 1 ? 'skog' : 'skogar'} under`;
  return avst > takt ? `Oftast längre skotningsavstånd än räknat · ${antal}` : `Oftast för få m³ per timme · ${antal}`;
}
