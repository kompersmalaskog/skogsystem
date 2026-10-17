// Rundorna (flyttdag + dess flyttar) som Körningar och arket visar. Rena funktioner: all härledning
// och summering ligger här så den går att testa mot riktiga rader, och så vyn bara ritar.
//
// Reglerna är de som Martin och jag låste i mockupen (2026-10-14):
//  - En RUNDA har ben. Flytt = minst ett avslutat ben, annars Övrig körning — som cron:en och
//    Flyttloggen redan avgör. Övrig körning är en vanlig, tryckbar rad (60 % av milen).
//  - km = mätare (Scania) först, rutt som reserv; hela km per runda. Summor = summan av de avrundade
//    delarna (skillen: "summan är summan av det som visas").
//  - En runda räknas bara när den är AVSLUTAD och har sluttid ≥ starttid. En pågående runda visas men
//    räknas inte; en AVBRUTEN runda (föraren startade och avbröt, status 'avbruten') visas men räknas
//    inte — som Flyttloggen alltid gjort; en runda med sluttid före start visas och säger det, men räknas aldrig.
//  - Rundor på samma bil överlappar aldrig (kedjeregeln i lib/lastbilRunda.ts). Överlappar två ändå
//    säger vyn det, i stället för att tyst räkna båda.
//  - Saknas ett värde står det "saknas i datan" — aldrig 0.

import { sthlmDelar } from '@/lib/sthlmTid';

export interface Ben {
  id: string;
  maskin: string;
  fran: string | null;
  till: string | null;
  km: number | null;
  min: number | null;
  tomKm: number | null;
  fakturerbar: boolean;
  typ: string | null;
  kund: string | null;
}

/** En rad som den ligger i flyttdag, utan härledning. */
export interface RundaRad {
  id: string;
  forare: string | null;
  starttid: string;
  sluttid: string | null;
  status: string;
  auto_avslutad_av: string | null;
  tillkorning_km: number | null;
  hem_km: number | null;
  hemresa_matt: boolean | null;
  total_km: number | null;
  matare_km: number | null;
  bransle_l: number | null;
}

export interface Runda {
  id: string;
  start: string;
  slut: string | null;
  forare: string | null;
  autoAv: string | null;
  tillKm: number | null;
  hemKm: number | null;
  hemMatt: boolean | null;
  ruttKm: number | null;
  matareKm: number | null;
  literRa: number | null;
  ben: Ben[];
  // ── härlett ──
  pagar: boolean;
  avbruten: boolean;               // status 'avbruten': visas, räknas inte
  giltig: boolean;                 // avslutad, inte avbruten och slut ≥ start: bara dessa räknas
  ogiltigTid: boolean;             // avslutad men slut < start
  flytt: boolean;
  km: number | null;               // hela km, bara för giltiga rundor
  kmKalla: 'mätare' | 'rutt' | null;
  liter: number | null;            // hela liter, bara > 0
  minuter: number | null;
  tom: boolean;                    // rörde sig aldrig: 0 min och 0 km
  overlappar: boolean;
  /** Förra rundans sluttid när den här börjar exakt där (kedjeregeln: bilen var fortfarande ute). */
  fortsattningEfter: string | null;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export function harledRunda(rad: RundaRad, ben: Ben[]): Runda {
  const pagar = rad.sluttid == null;
  const avbruten = rad.status === 'avbruten';
  const minuterRa = !pagar ? (ms(rad.sluttid) - ms(rad.starttid)) / 60000 : null;
  const giltig = !pagar && !avbruten && minuterRa != null && minuterRa >= 0;
  const kmRa = rad.matare_km ?? rad.total_km;
  const km = giltig && kmRa != null ? Math.round(kmRa) : null;
  const kmKalla = km == null ? null : rad.matare_km != null ? 'mätare' : 'rutt';
  const liter = giltig && rad.bransle_l != null && rad.bransle_l > 0 ? Math.round(rad.bransle_l) : null;
  return {
    id: rad.id, start: rad.starttid, slut: rad.sluttid, forare: rad.forare, autoAv: rad.auto_avslutad_av,
    tillKm: rad.tillkorning_km, hemKm: rad.hem_km, hemMatt: rad.hemresa_matt,
    ruttKm: rad.total_km, matareKm: rad.matare_km, literRa: rad.bransle_l,
    ben,
    pagar, avbruten, giltig, ogiltigTid: !pagar && !avbruten && !giltig,
    flytt: ben.length > 0,
    km, kmKalla, liter,
    minuter: giltig ? minuterRa : null,
    tom: giltig && minuterRa === 0 && rad.matare_km === 0,
    overlappar: false,
    fortsattningEfter: null,
  };
}

/** Härleder alla rundor i en lista och märker överlapp och fortsättningar. Nyast först. */
export function byggRundor(rader: readonly RundaRad[], benPerRunda: ReadonlyMap<string, Ben[]>): Runda[] {
  const rundor = rader.map(r => harledRunda(r, benPerRunda.get(r.id) ?? []));
  const raknade = rundor.filter(r => r.giltig && !r.tom);
  for (let i = 0; i < raknade.length; i++) {
    for (let j = i + 1; j < raknade.length; j++) {
      const a = raknade[i], b = raknade[j];
      if (ms(a.start) < ms(b.slut) && ms(b.start) < ms(a.slut)) { a.overlappar = true; b.overlappar = true; }
    }
  }
  for (const r of rundor) {
    const fore = raknade.find(x => x !== r && x.slut != null && ms(x.slut) === ms(r.start));
    if (fore) r.fortsattningEfter = fore.slut;
  }
  return rundor.sort((a, b) => ms(b.start) - ms(a.start));
}

export interface Summa {
  antal: number;                   // räknade rundor
  flytt: number;
  ovrig: number;
  kmFlytt: number;
  kmOvrig: number;
  km: number;                      // = kmFlytt + kmOvrig (avrundade delar)
  liter: number | null;            // null = ingen runda har diesel i datan
  lPerMil: number | null;          // bara rundor med både mätare och diesel
  overlappande: number;
  ogiltiga: number;
  pagande: number;
}

export function summera(rundor: readonly Runda[]): Summa {
  const raknade = rundor.filter(r => r.giltig);
  const flytt = raknade.filter(r => r.flytt), ovrig = raknade.filter(r => !r.flytt);
  const sum = (a: readonly Runda[], f: (r: Runda) => number | null) => a.reduce((s, r) => s + (f(r) ?? 0), 0);
  const medLiter = raknade.filter(r => r.liter != null);
  const bada = raknade.filter(r => (r.matareKm ?? 0) > 0 && (r.literRa ?? 0) > 0);
  const kmFlytt = sum(flytt, r => r.km), kmOvrig = sum(ovrig, r => r.km);
  const matare = sum(bada, r => r.matareKm);
  return {
    antal: raknade.length, flytt: flytt.length, ovrig: ovrig.length,
    kmFlytt, kmOvrig, km: kmFlytt + kmOvrig,
    liter: medLiter.length ? sum(raknade, r => r.liter) : null,
    lPerMil: bada.length && matare > 0 ? sum(bada, r => r.literRa) / (matare / 10) : null,
    overlappande: raknade.filter(r => r.overlappar).length,
    ogiltiga: rundor.filter(r => r.ogiltigTid).length,
    pagande: rundor.filter(r => r.pagar).length,
  };
}

/** l/mil med en decimal, svensk komma. */
export function fmtLPerMil(v: number | null): string | null {
  return v == null ? null : (Math.round(v * 10) / 10).toLocaleString('sv-SE');
}

/** Liter per mil för EN runda, ur mätare och diesel (rå). */
export function rundaLPerMil(r: Runda): number | null {
  return (r.matareKm ?? 0) > 0 && (r.literRa ?? 0) > 0 ? (r.literRa as number) / ((r.matareKm as number) / 10) : null;
}

export interface Vecka { ar: number; vecka: number; rundor: Runda[] }

function isoVecka(ar: number, man: number, dag: number): { ar: number; vecka: number } {
  const t = new Date(Date.UTC(ar, man - 1, dag));
  const veckodag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - veckodag);
  const arsstart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { ar: t.getUTCFullYear(), vecka: Math.ceil(((t.getTime() - arsstart.getTime()) / 86400000 + 1) / 7) };
}

/** Grupperar nyast först på ISO-vecka, räknad på rundans START i svensk tid. */
export function perVecka(rundor: readonly Runda[]): Vecka[] {
  const grupper = new Map<string, Vecka>();
  for (const r of rundor) {
    const d = sthlmDelar(new Date(r.start));
    if (!d) continue;
    const v = isoVecka(d.ar, d.man, d.dag);
    const nyckel = `${v.ar}-${v.vecka}`;
    const g = grupper.get(nyckel) ?? { ...v, rundor: [] };
    g.rundor.push(r);
    grupper.set(nyckel, g);
  }
  return Array.from(grupper.values()).sort((a, b) => b.ar - a.ar || b.vecka - a.vecka);
}

/** Ben som räknas: fakturerbar flytt = fakturerbar-flaggan i maskin_flytt (≥ 3 mil eller kunduppdrag). */
export function fakturerbaraKm(r: Runda): number {
  return r.ben.filter(b => b.fakturerbar).reduce((s, b) => s + Math.round(b.km ?? 0), 0);
}

/** CSV för en period: en rad per runda. Svensk decimalkomma lämnas till Excel — vi skriver punkt-fria heltal och en decimal. */
export function rundorTillCsv(rundor: readonly Runda[]): (string | number)[][] {
  const tid = (iso: string | null) => {
    if (!iso) return '';
    const d = sthlmDelar(new Date(iso));
    return d ? `${String(d.h).padStart(2, '0')}:${String(d.mi).padStart(2, '0')}` : '';
  };
  const datum = (iso: string) => sthlmDelar(new Date(iso))?.datum ?? '';
  const rubrik = ['Datum', 'Start', 'Slut', 'Typ', 'Maskiner', 'Från', 'Till', 'Förare', 'Mätare km', 'Rutt km', 'Diesel l', 'l/mil', 'Fakturerbart km', 'Märkning'];
  const rader = rundor.map(r => {
    const markning = [
      r.pagar ? 'Pågår' : '', r.avbruten ? 'Avbruten, räknas inte' : '', r.ogiltigTid ? 'Sluttid före start' : '', r.overlappar ? 'Överlappar annan runda' : '',
      r.tom ? 'Tom runda' : '',
    ].filter(Boolean).join('; ');
    return [
      datum(r.start), tid(r.start), tid(r.slut),
      r.flytt ? 'Flytt' : 'Övrig körning',
      r.ben.map(b => b.maskin).join(' + '),
      r.ben.map(b => b.fran ?? '').join(' | '),
      r.ben.map(b => b.till ?? '').join(' | '),
      r.forare ?? '',
      r.matareKm ?? '', r.ruttKm ?? '', r.literRa ?? '',
      rundaLPerMil(r) != null ? Math.round((rundaLPerMil(r) as number) * 10) / 10 : '',
      r.flytt ? fakturerbaraKm(r) : '',
      markning,
    ];
  });
  return [rubrik, ...rader];
}
