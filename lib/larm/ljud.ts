// LARMLJUDET. Ljudet måste räcka ensamt (maskindatorn vibrerar inte) och får inte vara ett upprepat pipande.
//   nara          ETT ljud när något kommer inom 40 m: ett tvåtonsmärke (ding-dong), ca 0,6 s.
//   mycket_nara   Röd inom 15 m: ett tydligare, starkare och längre ljud (stigande svepton), ca 1 s. Aldrig en pip-serie.
// Schemat är ren data (testbar); `spelaLarmLjud` skickar det till en AudioContext.

import type { LarmLjud } from './larm';

export interface Ton { freq: number; start: number; varaktighet: number; typ: OscillatorType; volym: number; tillFreq?: number }

export const LJUDSCHEMA: Readonly<Record<LarmLjud, readonly Ton[]>> = {
  nara: [
    { freq: 660, start: 0, varaktighet: 0.22, typ: 'sine', volym: 0.6 },
    { freq: 880, start: 0.24, varaktighet: 0.36, typ: 'sine', volym: 0.6 },
  ],
  mycket_nara: [
    { freq: 520, tillFreq: 1040, start: 0, varaktighet: 1.0, typ: 'sawtooth', volym: 0.85 },
  ],
};

/** Flera nya larm inom det här fönstret ger bara EN ljudsignal (ett ljud per ny sak, men inget pipande kluster). */
export const LJUD_FONSTER_MS = 2000;
export interface SenastLjud { tid: number; ljud: LarmLjud }
const STYRKA: Record<LarmLjud, number> = { nara: 1, mycket_nara: 2 };

/**
 * Ska ljudet spelas nu? Inom fönstret efter förra ljudet tystas lika starka eller svagare ljud; ett STARKARE (Röd inom 15 m efter ett vanligt ljud)
 * får ersätta, så att det farligaste aldrig försvinner bakom ett vanligt larm. Ren funktion — hooken håller senast spelade.
 */
export function skaSpelaLjud(ljud: LarmLjud | null, nu: number, senast: SenastLjud | null): boolean {
  if (!ljud) return false;
  if (!senast || nu - senast.tid >= LJUD_FONSTER_MS) return true;
  return STYRKA[ljud] > STYRKA[senast.ljud];
}

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
      // Snabbt in, håll nivån under tre fjärdedelar av tonen, klinga ut sist: en jämn ton hörs i hyttens buller, en direkt avtagande ton gör inte det.
      gain.gain.setValueAtTime(0.0001, t0 + t.start);
      gain.gain.exponentialRampToValueAtTime(t.volym, t0 + t.start + 0.03);
      gain.gain.setValueAtTime(t.volym, t0 + t.start + t.varaktighet * 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t.start + t.varaktighet);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0 + t.start); osc.stop(t0 + t.start + t.varaktighet + 0.02);
    }
    return true;
  } catch { return false; }
}
