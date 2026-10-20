// LARMLJUDET. Ljudet måste räcka ensamt (maskindatorn vibrerar inte) och får inte vara ett upprepat pipande.
//   nara          ETT ljud när något kommer inom 40 m: ett mjukt tvåtonsmärke (ding-dong), ca 0,5 s.
//   mycket_nara   Röd inom 15 m: ett tydligare, lägre och längre ljud (stigande svepton), ca 0,9 s. Aldrig en pip-serie.
// Schemat är ren data (testbar); `spelaLarmLjud` skickar det till en AudioContext.

import type { LarmLjud } from './larm';

export interface Ton { freq: number; start: number; varaktighet: number; typ: OscillatorType; volym: number; tillFreq?: number }

export const LJUDSCHEMA: Readonly<Record<LarmLjud, readonly Ton[]>> = {
  nara: [
    { freq: 660, start: 0, varaktighet: 0.22, typ: 'sine', volym: 0.4 },
    { freq: 880, start: 0.24, varaktighet: 0.3, typ: 'sine', volym: 0.4 },
  ],
  mycket_nara: [
    { freq: 520, tillFreq: 1040, start: 0, varaktighet: 0.9, typ: 'sawtooth', volym: 0.45 },
  ],
};

/** Total längd i sekunder. */
export const ljudLangd = (l: LarmLjud): number => Math.max(...LJUDSCHEMA[l].map((t) => t.start + t.varaktighet));

export function spelaLarmLjud(ctx: AudioContext | null | undefined, ljud: LarmLjud): boolean {
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* kräver ett tryck först */ });
    const t0 = ctx.currentTime;
    for (const t of LJUDSCHEMA[ljud]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.typ;
      osc.frequency.setValueAtTime(t.freq, t0 + t.start);
      if (t.tillFreq) osc.frequency.exponentialRampToValueAtTime(t.tillFreq, t0 + t.start + t.varaktighet);
      gain.gain.setValueAtTime(0.0001, t0 + t.start);
      gain.gain.exponentialRampToValueAtTime(t.volym, t0 + t.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t.start + t.varaktighet);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0 + t.start); osc.stop(t0 + t.start + t.varaktighet + 0.02);
    }
    return true;
  } catch { return false; }
}
