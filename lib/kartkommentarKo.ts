// Kön för kommentarer på kartan, kopplad till appen: localStorage + Supabase (`kartkommentar`). Reglerna bor i ./kartkommentar (rena, testade).
//
// En kommentar är sparad när den ligger i den lokala kön — inte när servern svarat. Kön skickar när nätet kommer tillbaka, när appen öppnas/blir synlig och med
// jämna mellanrum, en post i taget i den ordning de skapades; ett fel som kan bli bättre (inget nät) lämnar posten kvar med växande väntetid, ett fel som aldrig
// blir bättre (behörighet, constraint) ger upp posten och loggar det. Aldrig ett felmeddelande för att täckningen saknas. Kommentarens id skapas i klienten, så ett
// omförsök aldrig ger en dubblett (finns den redan på servern, 23505, räknas det som skickat).

import { supabase } from '@/lib/supabase';
import { arVaranFel, koVantan, slaIhopOp, type KoPost } from './kartkommentar';

const NYCKEL = 'kartkommentar_ko_v1';

export interface KoDb {
  from: (tabell: string) => any;
}

/** Skriver till servern. Returnerar 'klar', 'igen' (försök senare) eller 'ge_upp'. */
export type SkickaUtfall = 'klar' | 'igen' | 'ge_upp';

const lyssnare = new Set<() => void>();
/** Något i kön ändrades (ny åtgärd, skickad, uppgiven). Ger en funktion som avprenumererar. */
export function prenumereraKartkommentarKo(fn: () => void): () => void {
  lyssnare.add(fn);
  return () => { lyssnare.delete(fn); };
}
const meddela = () => lyssnare.forEach((fn) => { try { fn(); } catch { /* */ } });

export function lasKo(): KoPost[] {
  try {
    const rad = JSON.parse(localStorage.getItem(NYCKEL) || '[]');
    return Array.isArray(rad) ? rad.filter((p) => p && typeof p.id === 'string' && typeof p.objekt_id === 'string') : [];
  } catch { return []; }
}
// Reserv när localStorage inte går att använda (privat läge): kön överlever då inte att appen stängs men fungerar medan den är öppen.
let minneKo: KoPost[] = [];
let lagringFel = false;
function skrivKo(ko: KoPost[]): void {
  minneKo = ko;
  try { localStorage.setItem(NYCKEL, JSON.stringify(ko)); lagringFel = false; } catch { lagringFel = true; }
}
function aktuellKo(): KoPost[] { return lagringFel ? minneKo : lasKo(); }

let autoKor = true;
/** Bara för tester: styr om en ny åtgärd skickas direkt. */
export function sattKartkommentarAuto(pa: boolean): void { autoKor = pa; }

/** Lägger en åtgärd i kön (slås ihop med en väntande på samma kommentar) och försöker skicka den direkt. */
export function laggIKo(post: Omit<KoPost, 'forsok' | 'nasta'>): void {
  const ko = aktuellKo();
  const ny: KoPost = { ...post, forsok: 0, nasta: 0 };
  const i = ko.findIndex((p) => p.id === post.id);
  const slagen = slaIhopOp(i >= 0 ? ko[i] : undefined, ny);
  const nyKo = i >= 0 ? ko.filter((_, j) => j !== i) : [...ko];
  if (slagen) { if (i >= 0) nyKo.splice(i, 0, slagen); else nyKo.push(slagen); }
  skrivKo(nyKo);
  meddela();
  if (autoKor) void korKartkommentarKo(true);
}

export function vantandePosterFor(objektId: string): KoPost[] { return aktuellKo().filter((p) => p.objekt_id === objektId); }
export function antalVantande(): number { return aktuellKo().length; }

async function skickaEn(db: KoDb, p: KoPost): Promise<SkickaUtfall> {
  try {
    if (p.op === 'ny') {
      const { error } = await db.from('kartkommentar').insert({ id: p.id, objekt_id: p.objekt_id, yta_nyckel: p.yta_nyckel, text: p.text, skapad_av: p.skapad_av });
      if (!error) return 'klar';
      if (String(error.code) === '23505') {
        // Finns redan (ett tidigare försök nådde fram): ev. nyare text skickas som en ändring.
        const u = await db.from('kartkommentar').update({ text: p.text }).eq('id', p.id);
        return u.error && arVaranFel(u.error) ? 'ge_upp' : u.error ? 'igen' : 'klar';
      }
      return arVaranFel(error) ? 'ge_upp' : 'igen';
    }
    if (p.op === 'andra') {
      const { data, error } = await db.from('kartkommentar').update({ text: p.text }).eq('id', p.id).select('id');
      if (error) return arVaranFel(error) ? 'ge_upp' : 'igen';
      return Array.isArray(data) && data.length === 0 ? 'ge_upp' : 'klar';   // raden finns inte (borttagen) eller är inte min
    }
    const { error } = await db.from('kartkommentar').delete().eq('id', p.id);
    if (error) return arVaranFel(error) ? 'ge_upp' : 'igen';
    return 'klar';
  } catch {
    return 'igen';   // nätfel: supabase-js kastar inte, men fetch kan göra det
  }
}

let kor: Promise<void> | null = null;
/** Något lades i kön medan en körning pågick → kör en gång till direkt efteråt. */
let omkor = false;

/** Skickar det som väntar. `tvinga` hoppar över väntetiden (nätet kom tillbaka, appen öppnades). Kastar aldrig. */
export function korKartkommentarKo(tvinga = false, db: KoDb = supabase as unknown as KoDb, nu: () => number = () => Date.now()): Promise<void> {
  if (kor) { if (tvinga) omkor = true; return kor; }
  kor = (async () => {
    await Promise.resolve();   // så att `kor` hunnit sättas innan finally nollar den (en körning utan väntan blir annars kvar som "pågår" för alltid)
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      let ko = aktuellKo();
      let andrad = false;
      for (const p of [...ko]) {
        if (!tvinga && p.nasta > nu()) continue;
        const u = await skickaEn(db, p);
        // Läs om kön: en ny åtgärd kan ha slagits ihop med posten medan den skickades.
        ko = aktuellKo();
        const nu_ = ko.find((q) => q.id === p.id);
        if (u === 'klar' || u === 'ge_upp') {
          if (u === 'ge_upp') { try { console.warn('[Kartkommentar] gav upp en post', p.op, p.id); } catch { /* */ } }
          const ändradMedan = u === 'klar' && !!nu_ && (nu_.text !== p.text || nu_.op !== p.op) && nu_.op !== 'radera';
          // Ändrades kommentaren medan den skickades ligger den nya texten kvar att skickas (som en ändring, för posten finns nu på servern).
          ko = ändradMedan ? ko.map((q) => (q.id === p.id ? { ...q, op: 'andra' as const, forsok: 0, nasta: 0 } : q)) : ko.filter((q) => q.id !== p.id);
          skrivKo(ko); andrad = true;
        } else if (nu_) {
          const forsok = nu_.forsok + 1;
          ko = ko.map((q) => (q.id === p.id ? { ...q, forsok, nasta: nu() + koVantan(forsok) } : q));
          skrivKo(ko);
          break;   // inget nät: försök inte resten, den ordningen är viktig
        }
      }
      if (andrad) meddela();
    } catch { /* kön får aldrig kasta */ } finally { kor = null; if (omkor) { omkor = false; void korKartkommentarKo(true, db, nu); } }
  })();
  return kor;
}

/** Startar kön oberoende av planeringsvyn (global startare): nätet kommer tillbaka, appen öppnas/blir synlig, jämna mellanrum. */
export function startaKartkommentarTriggers(): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void korKartkommentarKo(true); };
  const synlig = () => { if (document.visibilityState === 'visible') void korKartkommentarKo(true); };
  const tick = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) void korKartkommentarKo(false); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', synlig);
  const iv = window.setInterval(tick, 20_000);
  void korKartkommentarKo(true);
  return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', synlig); window.clearInterval(iv); };
}

/** Bara för tester: tömmer kön och minnesreserven. */
export function nollstallKartkommentarKo(): void {
  minneKo = []; lagringFel = false; kor = null; omkor = false; autoKor = true;
  try { localStorage.removeItem(NYCKEL); } catch { /* */ }
}
