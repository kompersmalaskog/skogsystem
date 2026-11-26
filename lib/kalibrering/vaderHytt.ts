/**
 * VÄDRET I HYTTEN (Martin 2026-11-19: "kan man få så han ser det i maskinhytten direkt?"). Ett kort högst upp i kartan i maskinläget på en SKÖRDARE när vädret
 * har slagit om sedan maskinen slutade förra arbetsdagen. Samma regel och samma text som pushen (lib/kalibrering/vaderOmslag, lib/kalibrering/vaderServer):
 *  - bara i morgonfönstret (START_FONSTER_MS efter dagens första hyttspårsrad) — mitt på dagen vore tjat;
 *  - inte när en kontroll redan är gjord sedan starten (`kontrollIdag`);
 *  - borta när föraren tryckt "Sett" (sparas per enhet och maskin för dagen; i testläget bara i minnet).
 * Inga råd — bara att vädret har slagit om (Martin 2026-11-19: samla in data först). Rena funktioner; hooken är lib/hooks/useVaderHytt.
 */
import { svenskDag } from './matdon';
import { omslagText } from './vaderOmslag';
import { START_FONSTER_MS, type VaderSvar } from './vaderServer';

export type VaderKort = { titel: string; text: string; dag: string };

export const VADER_KORT_TITEL = 'Vädret har slagit om';

/** Kortet som ska visas nu, eller null. `settDag` = dagen föraren tryckt Sett för den här maskinen (null = inte idag). */
export function vaderKort(svar: VaderSvar | null, nuMs: number, settDag: string | null): VaderKort | null {
  if (!svar || !svar.ok) return null;
  const dag = svenskDag(new Date(nuMs).toISOString());
  if (settDag === dag) return null;
  if (svar.kontrollIdag) return null;
  if (svar.startMs == null || nuMs < svar.startMs || nuMs - svar.startMs > START_FONSTER_MS) return null;
  const t = omslagText('', svar.lage, svar.slutMs, nuMs);
  if (!t) return null;
  return { titel: VADER_KORT_TITEL, text: t.body, dag };
}

// ── Sett, per enhet ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const VADER_SETT_NYCKEL = 'vader_hytt_sett_v1';

/** Dagen Sett trycktes för maskinen på den här enheten. Läsfel och trasig data = inte sett. */
export function lasVaderSett(maskin: string): string | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(VADER_SETT_NYCKEL);
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const v = o && typeof o === 'object' ? o[maskin] : null;
    return typeof v === 'string' ? v : null;
  } catch { return null; }
}

export function sparaVaderSett(maskin: string, dag: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(VADER_SETT_NYCKEL);
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(VADER_SETT_NYCKEL, JSON.stringify({ ...(o && typeof o === 'object' ? o : {}), [maskin]: dag }));
  } catch { /* privat läge: Sett gäller tills sidan laddas om */ }
}
