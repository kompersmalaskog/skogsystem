// UTTAGET MÄTS PÅ TRAKTEN (Martin 2026-11-17: prognosen ska bygga på laserskanningen och det skördaren redan gjort).
//
// På elva avslutade gallringar tog skördaren ut mellan 10 och 74 % av den volym lasern såg — ett uttag går inte att anta i förväg.
// Men när skördaren gått en bit går det att MÄTA: stammarna har position, och lasern säger hur mycket som stod just där.
//
//   gått      = rutor (10 m) vars mitt ligger inom RACK_M från en avverkad stam
//   uttag     = skördad volym / laserns volym i de rutor skördaren gått
//   hela trakten ≈ skördat hittills + laserns volym i resten × uttaget
//
// Uttaget är m³fub skördat per m³sk i laserdatan (från skanningsåret) — det är alltså inte en andel av dagens skog, utan en omräkningsfaktor
// som bär tillväxten sedan skanningen, bark och topp, och hur hårt det gallras. Den gäller för RESTEN av samma trakt, och bara där.
//
// Ren funktion. Under MIN_GATT_HA eller MIN_STAMMAR sägs ingenting (null) — då gäller Vidas volym som förut.

import { RUTA_M } from '@/lib/laserGrundytaRutnat';
import { SAKNAS16, type Rutnat } from './rutnat';

/** Kranens räckvidd plus GPS-fel: en ruta räknas som gått när dess mitt ligger så här nära en stam. */
export const RACK_M = 12;
export const MIN_GATT_HA = 0.3;
export const MIN_STAMMAR = 100;
/** Saknar fler än så här stor andel av stammarna position går uttaget inte att mäta (de har avverkats någonstans vi inte ser). */
export const MAX_UTAN_POSITION = 0.2;
/** Ett uttag utanför det här är inget uttag utan ett fel i underlaget (fel gräns, laserdata från före en avverkning). */
export const UTTAG_RIMLIGT = { lag: 0.05, hog: 1.5 } as const;

/** En avverkad stam i SWEREF99 TM. t = sekunder (ordning), null = okänd tid. */
export type Stam = { x: number; y: number; vol: number; t: number | null };

export type Matt = {
  /** stammar med position */
  stammar: number;
  /** m³fub skördat (alla stammar, också de utan position) */
  skordat: number;
  /** m³fub per stam */
  medelstam: number;
  gattHa: number;
  kvarHa: number;
  /** m³sk enligt lasern i rutorna skördaren gått / inte gått */
  laserGatt: number;
  laserKvar: number;
  /** m³fub skördat per m³sk laser */
  uttag: number;
  /** m³fub för hela trakten: skördat + resten × uttaget */
  total: number;
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const RUTA_HA = (RUTA_M * RUTA_M) / 10_000;

/**
 * Mäter uttaget. `utanPosition` = stammar utan koordinat (antal och volym) — de räknas i skördat men kan inte placeras.
 * null = för lite att mäta på.
 */
export function matUttag(nat: Rutnat[], stammar: Stam[], utanPosition: { antal: number; vol: number } = { antal: 0, vol: 0 }): Matt | null {
  if (stammar.length < MIN_STAMMAR) return null;
  if (utanPosition.antal > (stammar.length + utanPosition.antal) * MAX_UTAN_POSITION) return null;
  const gatt = nat.map((r) => new Uint8Array(r.bredd * r.hojd));
  let skordatInne = 0, skordatAlla = utanPosition.vol;
  const steg = Math.ceil(RACK_M / RUTA_M);
  for (const s of stammar) {
    skordatAlla += s.vol;
    let traff = false;
    for (let k = 0; k < nat.length; k++) {
      const r = nat[k];
      const kol0 = Math.floor((s.x - r.minX) / RUTA_M), rad0 = Math.floor((r.maxY - s.y) / RUTA_M);
      if (kol0 < -steg || rad0 < -steg || kol0 >= r.bredd + steg || rad0 >= r.hojd + steg) continue;
      for (let rad = Math.max(0, rad0 - steg); rad <= Math.min(r.hojd - 1, rad0 + steg); rad++) {
        const cy = r.maxY - (rad + 0.5) * RUTA_M;
        for (let kol = Math.max(0, kol0 - steg); kol <= Math.min(r.bredd - 1, kol0 + steg); kol++) {
          const cx = r.minX + (kol + 0.5) * RUTA_M;
          if ((cx - s.x) ** 2 + (cy - s.y) ** 2 > RACK_M * RACK_M) continue;
          const i = rad * r.bredd + kol;
          if (!r.inne[i] || r.volym[i] === SAKNAS16) continue;
          gatt[k][i] = 1; traff = true;
        }
      }
    }
    if (traff) skordatInne += s.vol;
  }
  let nGatt = 0, nKvar = 0, laserGatt = 0, laserKvar = 0;
  for (let k = 0; k < nat.length; k++) {
    const r = nat[k];
    for (let i = 0; i < r.bredd * r.hojd; i++) {
      if (!r.inne[i] || r.volym[i] === SAKNAS16) continue;
      const v = r.volym[i] * RUTA_HA;
      if (gatt[k][i]) { nGatt++; laserGatt += v; } else { nKvar++; laserKvar += v; }
    }
  }
  const gattHa = nGatt * RUTA_HA;
  if (gattHa < MIN_GATT_HA || !(laserGatt > 0) || !(skordatInne > 0)) return null;
  const uttag = skordatInne / laserGatt;
  if (uttag < UTTAG_RIMLIGT.lag || uttag > UTTAG_RIMLIGT.hog) return null;
  return {
    stammar: stammar.length,
    skordat: r1(skordatAlla),
    medelstam: Math.round((skordatAlla / (stammar.length + utanPosition.antal)) * 1000) / 1000,
    gattHa: Math.round(gattHa * 100) / 100,
    kvarHa: Math.round(nKvar * RUTA_HA * 100) / 100,
    laserGatt: Math.round(laserGatt),
    laserKvar: Math.round(laserKvar),
    uttag: Math.round(uttag * 1000) / 1000,
    total: Math.round(skordatAlla + laserKvar * uttag),
  };
}

export type Prov = { andel: number; total: number; uttag: number };

/**
 * FACIT PÅ EN FÄRDIG TRAKT: vad hade metoden sagt när en fjärdedel resp. hälften av stammarna var avverkade (i tidsordning)?
 * Jämförs mot det som faktiskt skördades. Stammar utan tid kan inte ordnas — då görs inget prov.
 */
export function provaUttag(nat: Rutnat[], stammar: Stam[], andelar: number[] = [0.25, 0.5]): Prov[] {
  if (stammar.some((s) => s.t == null)) return [];
  const ordnade = [...stammar].sort((a, b) => (a.t as number) - (b.t as number));
  const ut: Prov[] = [];
  for (const a of andelar) {
    const m = matUttag(nat, ordnade.slice(0, Math.round(ordnade.length * a)));
    if (m) ut.push({ andel: a, total: m.total, uttag: m.uttag });
  }
  return ut;
}

/** Det som sparas per trakt (objekt_skogsdata.uttag). */
export type SparatUttag = {
  /** antal stammar räkningen bygger på — ändras det räknas trakten om */
  antal: number;
  raknad: string;
  /** m³fub skördat enligt stammarna (alla, också utan position). */
  skordat: number;
  /** Skördningen är klar (objekt.fas / avslutat): hela trakten = det som skördats. */
  klar: boolean;
  matt: Matt | null;
  /** Bara färdiga trakter: vad metoden hade sagt vid 25 % och 50 %. */
  prov?: Prov[];
};
