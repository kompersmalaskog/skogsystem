// Lassmodellen: skapa, förifyll, ändra och räkna på lass. Rena funktioner — inget I/O.
//
// Principen: appen gör det den säkert vet, föraren bara det bara han vet. Normalfallet är noll tryck:
//   • samma sortiment som förra lasset (föraren ändrar bara det som skiljer),
//   • närmaste avlägg,
//   • bekräftar sig själv när lossningen tog slut (maskinen stod still ≥ 5 min och körde sedan ut ur zonen — lossning.ts, hooken). Ingen timer.
// Det som INTE får bekräfta sig självt: första lasset på trakten, två avlägg nära varandra, inget avlägg, tomt lass, en kort lossning.
import { lokaltDatumStockholm } from '../hyttspar';
import { avlaggRubrik } from './avlagg';
import { sortimentDelar } from './sortiment';
import type { Avlagg, Lass, LassDel, SortimentRad, SparPunkt, VagTid } from './typer';
import type { AvlaggTraff } from './avlagg';
import type { LossningsTyp } from './lossning';

const nyId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

export interface LassKontext {
  objektId: string;
  voNummer: string | null;
  maskinId: string;
  medarbetareId: string | null;
}

/** Hela m³ i en rad; negativa/trasiga tal blir 0. */
export const heltM3 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

export const totalM3 = (rader: readonly SortimentRad[]): number => rader.reduce((s, r) => s + heltM3(r.m3), 0);
export const lassTotalM3 = (l: Pick<Lass, 'delar'>): number => l.delar.reduce((s, d) => s + totalM3(d.rader), 0);

const kopieraRader = (rader: readonly SortimentRad[]): SortimentRad[] => rader.map((r) => ({ nyckel: r.nyckel, namn: r.namn, m3: heltM3(r.m3) }));

/** Lassens nummer: nästa efter maskinens högsta på trakten (struket räknas inte bort — numret återanvänds aldrig). */
export function nastaLassNummer(lass: readonly Lass[], maskinId: string, objektId: string): number {
  let max = 0;
  for (const l of lass) if (l.maskinId === maskinId && l.objektId === objektId) max = Math.max(max, l.lassNummer);
  return max + 1;
}

/** Maskinens senaste (icke-strukna) lass på trakten — "förra lasset" som nästa lass fylls i efter. */
export function forraLass(lass: readonly Lass[], maskinId: string, objektId: string, fore?: string): Lass | null {
  let b: Lass | null = null;
  for (const l of lass) {
    if (l.maskinId !== maskinId || l.objektId !== objektId || l.status === 'struket') continue;
    if (fore && l.id === fore) continue;
    if (l.status === 'vantar_forare' && lassTotalM3(l) === 0) continue;   // ett tomt, ofyllt lass säger inget om vad lastades
    if (!b || l.lassNummer > b.lassNummer) b = l;
  }
  return b;
}

/** Raderna ett nytt lass fylls i med: förra lassets totalsummor per sortiment (hela lasset, alla delar). */
export function foreslagnaRader(forra: Lass | null): SortimentRad[] {
  if (!forra) return [];
  const per = new Map<string, SortimentRad>();
  for (const d of forra.delar) for (const r of d.rader) {
    const g = per.get(r.nyckel) ?? { nyckel: r.nyckel, namn: r.namn, m3: 0 };
    g.m3 += heltM3(r.m3);
    per.set(r.nyckel, g);
  }
  return Array.from(per.values()).filter((r) => r.m3 > 0);
}

export interface NyttLassIn {
  ctx: LassKontext;
  lassNummer: number;
  /** Lossningens tid (ms, verklig tid). */
  ts: number;
  lat: number;
  lng: number;
  traff: AvlaggTraff;
  /** Förra lasset (för förifyllning). null = första lasset på trakten. */
  forra: Lass | null;
  sparPunkter: SparPunkt[];
  vagar: VagTid[];
  nu: number;
}

/** Måste föraren själv fylla i / välja? Då bekräftar kortet inte sig självt. */
export function behoverForare(l: Pick<Lass, 'delar'>, harForra: boolean): { behover: boolean; skal: 'forsta_lasset' | 'avlagg_tvetydigt' | 'inget_avlagg' | 'tomt' | null } {
  if (!harForra) return { behover: true, skal: 'forsta_lasset' };
  const d = l.delar[l.delar.length - 1];
  if (!d || !d.avlaggId) return { behover: true, skal: 'inget_avlagg' };
  if (totalM3(d.rader) === 0) return { behover: true, skal: 'tomt' };
  return { behover: false, skal: null };
}

const nyDel = (delNr: number, ts: number, lat: number, lng: number, avlagg: Avlagg | null, rader: SortimentRad[]): LassDel => ({
  delNr, avlaggId: avlagg?.id ?? null, avlaggNummer: avlagg?.nummer ?? null,
  lossadTid: new Date(ts).toISOString(), lat, lng, rader,
});

/** Ett nytt lass ur en upptäckt lossning. `tvetydigt` → inget avlägg valt förrän föraren valt. */
export function skapaLass(i: NyttLassIn): Lass {
  const iso = new Date(i.nu).toISOString();
  const avlagg = i.traff.tvetydigt ? null : i.traff.narmaste;
  const rader = foreslagnaRader(i.forra);
  const del = nyDel(1, i.ts, i.lat, i.lng, avlagg, kopieraRader(rader));
  const lass: Lass = {
    id: nyId(), objektId: i.ctx.objektId, voNummer: i.ctx.voNummer, maskinId: i.ctx.maskinId, medarbetareId: i.ctx.medarbetareId,
    lassNummer: i.lassNummer, datum: lokaltDatumStockholm(i.ts), delar: [del],
    status: 'foreslaget', bekraftadAv: null, bekraftadTid: null, sparPunkter: i.sparPunkter, vagar: i.vagar, skapad: iso, andrad: iso,
  };
  const krav = behoverForare(lass, !!i.forra);
  return krav.behover ? { ...lass, status: 'vantar_forare' } : lass;
}

/** Samma last på ett andra avlägg: "Lass 7 · del 2", med egna sortiment (tomma — föraren fyller i hur lasset delades). */
export function laggTillDel(l: Lass, i: { ts: number; lat: number; lng: number; traff: AvlaggTraff; nu: number }): Lass {
  const avlagg = i.traff.tvetydigt ? null : i.traff.narmaste;
  const delNr = l.delar.reduce((m, d) => Math.max(m, d.delNr), 0) + 1;
  return {
    ...l,
    delar: [...l.delar, nyDel(delNr, i.ts, i.lat, i.lng, avlagg, [])],
    // Det första lassets rader skulle nu delas mellan två avlägg — det kan bara föraren veta.
    status: 'vantar_forare', bekraftadAv: null, bekraftadTid: null, andrad: new Date(i.nu).toISOString(),
  };
}

/** Hur lossningen ska hanteras mot lasset som redan finns. */
export function hanteraLossning(typ: LossningsTyp): 'nytt' | 'del' | 'ignorera' {
  return typ === 'nytt_lass' ? 'nytt' : typ === 'ny_del' ? 'del' : 'ignorera';
}

// ── Ändra ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

const stampla = (l: Lass, nu: number): Lass => ({ ...l, andrad: new Date(nu).toISOString() });

/** Ändrar en sortimentsrad med `delta` m³ (1 per tryck). Hamnar raden på 0 försvinner den. Ny rad läggs till om den saknas. */
export function andraRad(l: Lass, delNr: number, rad: { nyckel: string; namn: string }, delta: number, nu: number): Lass {
  const delar = l.delar.map((d) => {
    if (d.delNr !== delNr) return d;
    const finns = d.rader.some((r) => r.nyckel === rad.nyckel);
    const rader = (finns ? d.rader : [...d.rader, { nyckel: rad.nyckel, namn: rad.namn, m3: 0 }])
      .map((r) => (r.nyckel === rad.nyckel ? { ...r, m3: heltM3(r.m3 + delta) } : r))
      .filter((r) => r.m3 > 0);
    return { ...d, rader };
  });
  return stampla({ ...l, delar }, nu);
}

/** Sätter en rads värde direkt (hålla-in-knapp, tangentbord). */
export function sattRad(l: Lass, delNr: number, rad: { nyckel: string; namn: string }, m3: number, nu: number): Lass {
  const nuVarde = l.delar.find((d) => d.delNr === delNr)?.rader.find((r) => r.nyckel === rad.nyckel)?.m3 ?? 0;
  return andraRad(l, delNr, rad, heltM3(m3) - nuVarde, nu);
}

export function bytAvlagg(l: Lass, delNr: number, avlagg: Avlagg, nu: number): Lass {
  return stampla({ ...l, delar: l.delar.map((d) => (d.delNr === delNr ? { ...d, avlaggId: avlagg.id, avlaggNummer: avlagg.nummer } : d)) }, nu);
}

/** Föraren har sagt sitt: Klar i Ändra, eller linjen fylldes. Ett lass utan avlägg eller utan sortiment kan inte bekräftas. */
export function kanBekrafta(l: Lass): boolean {
  return l.delar.length > 0 && l.delar.every((d) => !!d.avlaggId) && lassTotalM3(l) > 0;
}

export function bekrafta(l: Lass, av: 'auto' | 'forare', nu: number): Lass {
  if (!kanBekrafta(l)) return l;
  const iso = new Date(nu).toISOString();
  return { ...l, status: 'bekraftat', bekraftadAv: av, bekraftadTid: iso, andrad: iso };
}

export function stryk(l: Lass, nu: number): Lass {
  return stampla({ ...l, status: 'struket' }, nu);
}

/** Texten på kortet: "Lass 7 · del 2". */
export function lassTitel(l: Pick<Lass, 'lassNummer' | 'delar'>, delNr?: number): string {
  const del = delNr ?? l.delar[l.delar.length - 1]?.delNr ?? 1;
  return l.delar.length > 1 ? `Lass ${l.lassNummer} · del ${del}` : `Lass ${l.lassNummer}`;
}

/** "Avlägg 2 · Tallkubb 5 · Talltimmer 10 · 18 m³" (sortimenten störst först). */
export function lassRad(del: Pick<LassDel, 'avlaggNummer' | 'rader'>, visaNamn: (namn: string) => string): string {
  const delar = [...del.rader].sort((a, b) => b.m3 - a.m3).map((r) => `${visaNamn(r.namn)} ${heltM3(r.m3)}`);
  return [del.avlaggNummer ? avlaggRubrik({ nummer: del.avlaggNummer }) : 'Inget avlägg valt', ...delar, `${totalM3(del.rader)} m³`].join(' · ');
}

/** Sortimenten under lassets rubrikrad: "Timmer 195 1-2 10 · Kubb 5 · 18 m³" (störst först, utan mottagare — den står i Kvar-listan). */
export function lassSortimentText(rader: readonly SortimentRad[]): string {
  const delar = [...rader].sort((a, b) => b.m3 - a.m3).filter((r) => heltM3(r.m3) > 0).map((r) => `${sortimentDelar(r.namn).sortiment} ${heltM3(r.m3)}`);
  return [...delar, `${totalM3(rader)} m³`].join(' · ');
}

/** Lassets rubrikrad: "Lass 1 · 16:59 · Avlägg 01-2" (klockslaget ges av anroparen så modellen slipper tidszonen). */
export function lassRubrikRad(l: Pick<Lass, 'lassNummer' | 'delar'>, del: Pick<LassDel, 'delNr' | 'avlaggNummer'>, klockslag: string): string {
  return [lassTitel(l, del.delNr), klockslag, del.avlaggNummer ? avlaggRubrik({ nummer: del.avlaggNummer }) : 'Inget avlägg valt'].join(' · ');
}

// ── Ett lass som väntat sedan appen stängdes ──────────────────────────────────────────────────────────────────────────

/**
 * Ett förslag vars lossning aldrig tog slut (appen stängdes eller kraschade mitt i lossningen) bekräftar inte sig självt: vi vet inte hur länge maskinen stod och
 * om den lämnade avlägget. Det väntar på föraren ("N lass väntar på dig"). Ett lass som redan väntar eller är bekräftat rörs inte.
 */
export function forslagTillVantande(l: Lass, nu: number): Lass {
  return l.status === 'foreslaget' ? { ...l, status: 'vantar_forare', andrad: new Date(nu).toISOString() } : l;
}
