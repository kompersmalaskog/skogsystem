/**
 * Beskedsvyn: vad en beslutsnotis (?besked=<id>) leder till, och vad den säger.
 * Rena funktioner — ingen Supabase, ingen React — så reglerna går att testa var för sig.
 *
 * REGEL (en rad): beskedsvyn visas EN gång, och bara om ansökan är min, har ett beslut (godkänd/nekad)
 * och beslutet är NYTT för mig, alltså står i serverns lista över beslut jag inte sett (`nya_beslut_ids`).
 * Allt annat (finns inte, någon annans, redan sett, väntar) → ingen beskedsvy; ledighetsvyn som förut.
 */
import { arbetsdagar, fmtPeriod } from './datum';
import type { Ansokan } from './typer';

/** Hur länge vyn väntar på serverns svar om vad som är nytt, innan den ger upp och visar ledighetsvyn som vanligt. */
export const BESKED_MAX_VANTAN_MS = 6000;

export type BeskedBeslut = Ansokan & { status: 'godkänd' | 'nekad' };

export function valjBesked(p: { besked: string | null; mina: Ansokan[]; nyaIds: string[] }): BeskedBeslut | null {
  if (!p.besked) return null;
  if (!p.nyaIds.includes(p.besked)) return null; // redan sett (eller aldrig ett beslut åt mig)
  const a = p.mina.find(x => x.id === p.besked); // `mina` = bara egna: någon annans ansökan finns inte här
  if (!a) return null;
  if (a.status !== 'godkänd' && a.status !== 'nekad') return null;
  return a as BeskedBeslut;
}

/** "Din semester", "Din ATK" — typen ur ansökan. Okänd/ovanlig typ → "Din ledighet" (aldrig en gissad grammatik). */
function dinTyp(typ: Ansokan['typ']): string {
  if (typ === 'semester') return 'semester';
  if (typ === 'atk') return 'ATK';
  if (typ === 'inarbetad') return 'inarbetade dag';
  return 'ledighet';
}

/** "5 arbetsdagar" (semester m.fl.) resp. "40 timmar" (ATK räknas i timmar, 8 per arbetsdag som i listan). Noll dagar → null. */
export function beskedLangd(a: Pick<Ansokan, 'typ' | 'startdatum' | 'slutdatum'>): string | null {
  const ad = arbetsdagar(a.startdatum, a.slutdatum);
  if (ad === 0) return null; // bara helg/röda dagar: hellre ingen rad än "0 arbetsdagar"
  if (a.typ === 'atk') {
    const h = ad * 8;
    return `${h} timm${h === 1 ? 'e' : 'ar'}`;
  }
  return `${ad} arbetsdag${ad === 1 ? '' : 'ar'}`;
}

export type BeskedText =
  | { slag: 'godkand'; rubrik: string; period: string; langd: string | null; hals: string }
  | { slag: 'nekad'; rubrik: string };

export function beskedText(a: BeskedBeslut): BeskedText {
  const period = fmtPeriod(a.startdatum, a.slutdatum);
  if (a.status === 'nekad') {
    // Sakligt, ingen "tyvärr": ordet bär beskedet, ingen färg och ingen uppmaning att prata med någon.
    return { slag: 'nekad', rubrik: `Din ansökan ${period} gick inte igenom.` };
  }
  return {
    slag: 'godkand',
    rubrik: `Din ${dinTyp(a.typ)} är godkänd`,
    period,
    langd: beskedLangd(a),
    // Semester får en vänlig rad; ATK och bytesdag är inget man önskar någon trevligt med — bara en sakuppgift.
    hals: a.typ === 'semester' ? 'Ha en skön ledighet!' : 'Inlagt i kalendern.',
  };
}

/** Vid "Ansök om andra datum" förväljs typen när den går att ansöka om här (bytesdag kräver en röd dag — väljs om). */
export function forvaldTyp(a: Pick<Ansokan, 'typ'>): 'semester' | 'atk' | null {
  return a.typ === 'semester' || a.typ === 'atk' ? a.typ : null;
}
