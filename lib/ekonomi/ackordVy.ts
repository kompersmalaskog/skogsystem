// Ackord-fliken i vanliga ord (barnregeln, Martin 2026-10-24): "Tjänade vi
// mer på att få betalt per kubik?" → Ja / Nej → ett tal i kronor.
//
// EN räkning för alla tre växlarna (Skog / Klass / Maskin): den minsta delen
// är en maskins arbete på ett objekt (MaskinDel), dess kronor = ackord −
// timpeng avrundat till hela kronor. En skog är summan av sina delar, en
// klass summan av sina skogar och en maskin summan av sina delar — så alla
// tre växlarna summerar till EXAKT samma tal överst, och talet överst är
// alltid summan av raderna som visas (skillen: summan är summan av det som
// visas). Ingen beräkning av ackord eller timpeng sker här — den bor i
// lib/ekonomi/objektJamforelse.
//
// Förut var raden "Totalt kr" = (avrundad kr/m³-skillnad) × (avrundad
// volym). Det gick att räkna efter med miniräknare men var inte de verkliga
// kronorna: Jeppshoka kunde stå några kronor fel. Nu är radens kronor de
// verkliga, och kr/m³ i "Visa alla siffror" är bara en upplysning.

import type { MaskinDel, ObjektRad } from './objektJamforelse';

/** En maskins del av ett objekt i hela kronor. Den minsta byggstenen — allt annat summerar den. */
export function delKr(d: Pick<MaskinDel, 'ackord' | 'timpeng'>): number {
  return Math.round(d.ackord - d.timpeng);
}

/** En skogs kronor = summan av dess maskiners avrundade delar. */
export function objektKr(o: Pick<ObjektRad, 'maskiner'>): number {
  return o.maskiner.reduce((s, d) => s + delKr(d), 0);
}

export type VyRad = {
  nyckel: string;
  namn: string;
  kr: number;
  /** 0–1: hur lång stapeln är jämfört med den största raden (tecknet bär riktningen). */
  andel: number;
};

function medAndel<T extends { kr: number }>(rader: T[]): (T & { andel: number })[] {
  const max = rader.reduce((m, r) => Math.max(m, Math.abs(r.kr)), 0);
  return rader
    .map(r => ({ ...r, andel: max > 0 ? Math.abs(r.kr) / max : 0 }))
    .sort((a, b) => b.kr - a.kr);
}

export type SkogRad = VyRad & { objekt: ObjektRad; volym: number };

export function skogRader(rader: ObjektRad[]): SkogRad[] {
  return medAndel(rader.map(o => ({
    nyckel: o.objekt_id, namn: o.namn, kr: objektKr(o), objekt: o, volym: Math.round(o.volym),
  })));
}

export type KlassRad = VyRad & {
  klass: number | null;
  skogar: SkogRad[];
  skordare: number;
  skotare: number;
  volym: number;
};

/** "0,25" — klassens medelstam som den står i prislistan. */
export function klassText(k: number | null): string {
  return k == null ? 'Ingen klass' : `Klass ${k.toFixed(2).replace('.', ',')}`;
}

export function klassRader(rader: ObjektRad[]): KlassRad[] {
  const grupper = new Map<string, ObjektRad[]>();
  for (const o of rader) {
    const nyckel = o.klass == null ? 'ingen' : String(o.klass);
    const g = grupper.get(nyckel) ?? [];
    g.push(o);
    grupper.set(nyckel, g);
  }
  return medAndel([...grupper.entries()].map(([nyckel, objekt]) => {
    const skogar = skogRader(objekt);
    const delar = objekt.flatMap(o => o.maskiner);
    const roll = (r: MaskinDel['roll']) => delar.filter(d => d.roll === r).reduce((s, d) => s + delKr(d), 0);
    return {
      nyckel,
      klass: objekt[0].klass,
      namn: klassText(objekt[0].klass),
      kr: skogar.reduce((s, r) => s + r.kr, 0),
      skogar,
      skordare: roll('skördare'),
      skotare: roll('skotare'),
      volym: skogar.reduce((s, r) => s + r.volym, 0),
    };
  }));
}

export type MaskinRad = VyRad & {
  maskin_id: string;
  roll: MaskinDel['roll'];
  timmar: number;
  ackord: number;
  timpeng: number;
  skogar: { objekt: ObjektRad; kr: number }[];
};

export function maskinRader(rader: ObjektRad[], namn: (maskin_id: string) => string): MaskinRad[] {
  const per = new Map<string, MaskinRad>();
  for (const o of rader) {
    for (const d of o.maskiner) {
      const m = per.get(d.maskin_id) ?? {
        nyckel: d.maskin_id, maskin_id: d.maskin_id, namn: namn(d.maskin_id), roll: d.roll,
        kr: 0, andel: 0, timmar: 0, ackord: 0, timpeng: 0, skogar: [],
      };
      const kr = delKr(d);
      m.kr += kr;
      m.timmar += d.timmar;
      m.ackord += d.ackord;
      m.timpeng += d.timpeng;
      m.skogar.push({ objekt: o, kr });
      per.set(d.maskin_id, m);
    }
  }
  return medAndel([...per.values()]).map(m => ({ ...m, skogar: [...m.skogar].sort((a, b) => b.kr - a.kr) }));
}

export function summa(rader: { kr: number }[]): number {
  return rader.reduce((s, r) => s + r.kr, 0);
}

/** "33 156 kr mer" / "6 160 kr mindre" / "Lika". Ordet står alltid, färgen förstärker bara. */
export function krText(kr: number): string {
  if (kr === 0) return 'Lika';
  return `${Math.abs(kr).toLocaleString('sv-SE')} kr ${kr < 0 ? 'mindre' : 'mer'}`;
}

/** Svaret överst: frågan "Tjänade vi mer på att få betalt per kubik?". */
export function ackordSvar(total: number): { svar: 'Ja' | 'Nej' | 'Lika'; under: string } {
  if (total === 0) return { svar: 'Lika', under: 'Lika mycket som om vi fått betalt per timme' };
  return {
    svar: total > 0 ? 'Ja' : 'Nej',
    under: `${krText(total)} än om vi fått betalt per timme`,
  };
}

/** "2 skogar är inte klara än och är inte med" — orange rad under svaret. */
export function vantarText(antal: number): string | null {
  if (antal <= 0) return null;
  return `${antal} ${antal === 1 ? 'skog är' : 'skogar är'} inte klar${antal === 1 ? '' : 'a'} än och är inte med`;
}

/** kr per m³ som upplysning i "Visa alla siffror" — null när volym saknas (streck, aldrig 0). */
export function perM3(kr: number, volym: number): number | null {
  return volym > 0 ? Math.round(kr / volym) : null;
}
