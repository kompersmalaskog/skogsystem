// STRYK DET SOM INTE GÄLLER I VIDAS TEXT (Martin 2026-11-05: "kan man ha att det stryks, bara blir ett sträck över det som inte gäller").
//
// Vidas traktdirektiv (objekt.anteckningar) ändras aldrig — det är uppdraget. Planeraren stryker en DEL av texten; den står kvar med ett streck över,
// med vem och när, så att föraren ser vad som gällde och vad som inte gäller längre. Ett tryck till tar tillbaka den.
//
// Delarna är finare än punkterna i `vidaMeningar` (som aldrig delar mitt i en mening): Vidas text "Säljaren behåller lövet.3 m. kolla hur många tallar
// vi ska lämna." är EN punkt, men markägaren ändrade bara tallarna. En del slutar vid en punkt som följs av mellanslag, eller av en siffra/versal direkt efter
// en bokstav ("lövet.3"), utom efter vanliga förkortningar ("ca.", "t.ex.") och mellan siffror ("1.2"). Webbadresser delas inte ("www.vida.se").
//
// Lagring: objekt.vida_struket (jsonb) = [{ del, av, at }] — `del` är delens text. Ändras Vidas text (den är skyddad vid omimport) matchar en gammal del inte
// längre och strecket försvinner: hellre det än ett streck över fel text.
// Ren logik, ingen React, ingen databas.

import { vidaMeningar } from './kommentarPunkter';

export interface Struken { del: string; av: string | null; at: string }

const FORKORTNINGAR = new Set(['ca', 'cirka', 't.ex', 'bl.a', 'm.m', 's.k', 'dvs', 'osv', 'ev', 'st', 'nr', 'inkl', 'exkl', 'resp', 'ung', 'enl', 'o.dyl', 'pga', 'p.g.a', 'mm', 'obs']);

/** En punkt (ur vidaMeningar) delad i delar som går att stryka var för sig. Sätter man ihop delarna med mellanslag blir det punkten igen (utom mellanslag). */
export function strykDelar(punkt: string): string[] {
  const ut: string[] = [];
  let start = 0;
  for (let i = 0; i < punkt.length; i++) {
    if (punkt[i] !== '.') continue;
    const fore = punkt.slice(start, i);
    const efter = punkt[i + 1];
    if (efter === undefined) break;
    const ordFore = (fore.match(/(\S+)$/)?.[1] ?? '').toLowerCase();
    const mellanslag = /\s/.test(efter);
    const tattSiffraVersal = /[0-9A-ZÅÄÖ]/.test(efter) && /[a-zåäö]$/i.test(fore) && !/[0-9]$/.test(fore);
    if (!mellanslag && !tattSiffraVersal) continue;                 // "1.2", "www.vida.se"
    if (FORKORTNINGAR.has(ordFore)) continue;                      // "ca. 50"
    const del = punkt.slice(start, i + 1).trim();
    if (del) ut.push(del);
    start = i + 1;
  }
  const sista = punkt.slice(start).trim();
  if (sista) ut.push(sista);
  return ut;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** objekt.vida_struket → listan. Tolerant: allt okänt ignoreras, aldrig ett kast. */
export function lasStruket(raw: unknown): Struken[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const r = x as Record<string, unknown> | null;
    return r && typeof r.del === 'string' && r.del.trim() && typeof r.at === 'string'
      ? [{ del: r.del, av: typeof r.av === 'string' ? r.av : null, at: r.at }] : [];
  });
}

export function strykningFor(del: string, struket: readonly Struken[]): Struken | null {
  const n = norm(del);
  return struket.find((s) => norm(s.del) === n) ?? null;
}

/** Stryk delen, eller ta tillbaka den om den redan är struken. */
export function vaxlaStruken(struket: readonly Struken[], del: string, av: string | null, nu: string): Struken[] {
  return strykningFor(del, struket) ? struket.filter((s) => norm(s.del) !== norm(del)) : [...struket, { del: del.trim(), av, at: nu }];
}

export interface VidaDel { text: string; struken: Struken | null }
/** Vidas text som punkter, varje punkt som delar med sitt streck. */
export function vidaMedStreck(text: string | null | undefined, struket: readonly Struken[]): VidaDel[][] {
  return vidaMeningar(text).map((p) => strykDelar(p).map((d) => ({ text: d, struken: strykningFor(d, struket) })));
}

/** Det som GÄLLER av Vidas text — det strukna borta. Till hytten (instruktion nr 1), "nytt sedan sist" och planeringens tal ur texten. */
export function giltigVidaText(text: string | null | undefined, struket: readonly Struken[]): string {
  if (!struket.length) return String(text ?? '').trim();
  return vidaMedStreck(text, struket)
    .map((p) => p.filter((d) => !d.struken).map((d) => d.text).join(' '))
    .filter((p) => p.trim())
    .join('\n');
}

/** "Struket 5 nov av Martin" */
export function struketText(s: Struken): string {
  const d = new Date(s.at);
  const dag = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }).replace('.', '');
  return ['Struket', dag, s.av ? `av ${s.av}` : null].filter(Boolean).join(' ');
}
