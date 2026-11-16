// "Massa idag" lättare (Martin 2026-11-16, fart_logg): hela 30-dagarsläsningen tog 2–6 s och gjordes var 5:e minut hela dagen i gallringsskördaren.
// Gamla dagar ändras nästan aldrig. Nu: det sparade visas direkt, de senaste dagarna läses om ofta (50 ms), hela fönstret sällan.
//
//   • KORT läsning (var 5:e minut): från dagen före den senast lästa dagen till idag. Dagarna i svaret ERSÄTTER samma dagar i det sparade —
//     en dag som inte längre har några rader blir tom, aldrig kvar med gamla tal.
//   • HEL läsning: första gången, när det sparade är äldre än HEL_MS (sent inkomna filer för äldre dagar), när maskinlistan ändrats,
//     eller när det sparade inte längre når in i fönstret.
//   • Det sparade är en spegel av servern på enheten (localStorage). Ett läsfel skriver aldrig över det.

import { laggTillDagar, type MassaRad } from './massaLangd';

export const MASSA_MINNE_NYCKEL = 'massa_langd_v1';
/** Så ofta läses hela fönstret om. */
export const HEL_MS = 6 * 3600_000;

export interface MassaMinne { nyckel: string; fran: string; till: string; helTid: number; rader: MassaRad[] }

/** Vad ska läsas nu? `fran` = fönstrets början (äldsta dagen vyn behöver), `idag` = svensk dag. */
export function planeraLasning(minne: MassaMinne | null, nyckel: string, fran: string, idag: string, nu: number): { hel: boolean; fran: string } {
  const hel = { hel: true, fran };
  if (!minne || minne.nyckel !== nyckel) return hel;
  if (nu - minne.helTid >= HEL_MS || nu < minne.helTid) return hel;      // för gammalt, eller klockan har gått bakåt
  if (minne.fran > fran || minne.till > idag) return hel;                // når inte in i fönstret, eller sparat "i framtiden"
  const kortFran = laggTillDagar(minne.till, -1);
  return kortFran <= fran ? hel : { hel: false, fran: kortFran };
}

/** Lägg en kort läsning (alla rader från `nyaFran` och framåt) ovanpå det sparade, och släpp det som fallit ur fönstret. */
export function slaIhopMassa(gamla: readonly MassaRad[], nya: readonly MassaRad[], nyaFran: string, fonsterFran: string): MassaRad[] {
  return [...gamla.filter((r) => r.dag < nyaFran && r.dag >= fonsterFran), ...nya.filter((r) => r.dag >= fonsterFran)];
}

export function lasMassaMinne(nyckel: string): MassaMinne | null {
  try {
    const m = JSON.parse(localStorage.getItem(MASSA_MINNE_NYCKEL) || 'null');
    if (!m || m.nyckel !== nyckel || !Array.isArray(m.rader) || typeof m.fran !== 'string' || typeof m.till !== 'string' || typeof m.helTid !== 'number') return null;
    return m as MassaMinne;
  } catch { return null; }
}

export function sparaMassaMinne(m: MassaMinne): void {
  try { localStorage.setItem(MASSA_MINNE_NYCKEL, JSON.stringify(m)); } catch { /* fullt eller avstängt: nästa start läser hela fönstret */ }
}
