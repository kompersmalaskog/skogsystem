// Läser replay-fixturerna (testunderlag, inte produktionskod): lastbilens logg 31 jul–15 okt 2026, förarens registrerade flyttar
// samma period och historiklistan från steg 1 ("facit"). Loggen är 1 081 rader med vikt ur prod (epoch,lat,lng,fart,odometer_m,vikt_kg).

import fs from 'node:fs';
import path from 'node:path';
import type { LoggPunkt } from './detektera';
import type { ManuellFlytt } from './matcha';

const dir = path.resolve(process.cwd(), 'lib/lastbil/lass/__fixtures__');

export function lasLogg(): LoggPunkt[] {
  return fs.readFileSync(path.join(dir, 'logg_2026-07-31_2026-10-15.csv'), 'utf8').trim().split('\n').map(rad => {
    const [t, lat, lng, fart, od, vikt] = rad.split(',');
    return {
      tidpunkt: new Date(Number(t) * 1000).toISOString(),
      lat: Number(lat), lng: Number(lng),
      hastighet: fart === '' ? null : Number(fart),
      odometer_m: od === '' ? null : Number(od),
      vikt_kg: Number(vikt),
    };
  });
}

export function lasManuellaFlyttar(): ManuellFlytt[] {
  return JSON.parse(fs.readFileSync(path.join(dir, 'maskin_flytt_2026-07-31_2026-10-15.json'), 'utf8'));
}

export interface FacitRad {
  n: string;
  dag: string;
  lassningFran: string;
  lassningTid: string;
  lossningFran: string;
  lossningTill: string;
  status: 'saknas' | 'reg' | 'avbruten';
  maskin: string;
  sakerhet: 'hog' | 'medel' | 'lag' | 'okand';
  km: [number, number];
  bruttoKg: number;
  tomFore: number;
  tomEfter: number;
  reg: string | null;
}

export function lasFacit(): FacitRad[] {
  return JSON.parse(fs.readFileSync(path.join(dir, 'facit_historik_steg1.json'), 'utf8'));
}

/** Svensk klocktid → UTC-ms. Alla datum i facit ligger före 25 okt, alltså sommartid (+02:00). */
export const sommarMs = (dag: string, hhmm: string): number => Date.parse(`${dag}T${hhmm}:00+02:00`);
