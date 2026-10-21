// Förslag: vilket skördarobjekt har producerat på det här jobbet? (Starta jobb utan Vida-nummer, t.ex. P-1024.)
// Databasen räknar fram förslaget (RPC foresla_skordarobjekt: samma VO, eller stammar inom 500 m senaste 60 dagarna) och kopplar på ett tryck
// (koppla_skordarobjekt: lägger skördarens — och skotarens — maskinobjekt som extra nummer, objekt_alt_nummer). Produktionen läses sedan
// som för alla andra objekt: lib/objektNummer.ts hogarObjektIds. Förare får inte skriva objekt_alt_nummer direkt (RLS), därför RPC.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SkordarForslag {
  /** Nyckeln skördardatan ligger under (detalj_stam.objekt_id), t.ex. 'PONS20SDJAA270231_132'. */
  stamObjektId: string;
  namn: string;
  skal: 'samma VO' | 'inom 500 m';
  stammar: number;
  forsta: string | null;
  sista: string | null;
  avstandM: number | null;
}

const NEJ_NYCKEL = 'skordar_forslag_nej_v1';
const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Rad ur RPC:n → förslag. Trasig rad → null (aldrig ett påhittat förslag). */
export function tolkaForslag(r: any): SkordarForslag | null {
  if (!r || typeof r.stam_objekt_id !== 'string' || !r.stam_objekt_id) return null;
  const skal = r.skal === 'samma VO' || r.skal === 'inom 500 m' ? r.skal : null;
  if (!skal) return null;
  const n = Number(r.stammar);
  const avst = r.avstand_m == null ? null : Number(r.avstand_m);
  return {
    stamObjektId: r.stam_objekt_id,
    namn: typeof r.objekt_namn === 'string' && r.objekt_namn ? r.objekt_namn : r.stam_objekt_id,
    skal,
    stammar: Number.isFinite(n) ? n : 0,
    forsta: typeof r.forsta === 'string' ? r.forsta : null,
    sista: typeof r.sista === 'string' ? r.sista : null,
    avstandM: avst != null && Number.isFinite(avst) ? avst : null,
  };
}

/** '2026-10-05','2026-10-06' → "5–6 okt"; samma dag → "5 okt"; olika månad → "30 sep–2 okt". */
export function datumSpann(forsta: string | null, sista: string | null): string {
  const d = (s: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
    return m ? { ar: +m[1], man: +m[2] - 1, dag: +m[3] } : null;
  };
  const a = d(forsta), b = d(sista);
  if (!a && !b) return '';
  if (!a || !b) { const x = (a || b)!; return `${x.dag} ${MANADER[x.man]}`; }
  if (a.ar === b.ar && a.man === b.man && a.dag === b.dag) return `${a.dag} ${MANADER[a.man]}`;
  if (a.ar === b.ar && a.man === b.man) return `${a.dag}–${b.dag} ${MANADER[a.man]}`;
  return `${a.dag} ${MANADER[a.man]}–${b.dag} ${MANADER[b.man]}`;
}

function tusental(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Raden som frågan består av. Samma VO: ett konstaterande. Inom 500 m: avståndet står med, så ett grannobjekt går att avfärda. */
export function forslagText(f: SkordarForslag): { fraga: string; svar: string } {
  const delar = [f.namn, f.stammar > 0 ? `${tusental(f.stammar)} stammar` : 'inga stammar', datumSpann(f.forsta, f.sista)].filter(Boolean).join(' · ');
  if (f.skal === 'samma VO') return { fraga: `Skördaren har kört här: ${delar}`, svar: 'Koppla' };
  const avst = f.avstandM != null ? `${f.avstandM} m härifrån` : 'nära här';
  return { fraga: `Skördaren har kört ${avst}: ${delar}. Samma jobb?`, svar: 'Ja, koppla' };
}

/** Förslagen för ett objekt, bästa först. Fel eller saknad funktion → [] (loggas) — ett förslag är aldrig något föraren behöver. */
export async function hamtaSkordarForslag(supabase: SupabaseClient, objektId: string): Promise<SkordarForslag[]> {
  try {
    const { data, error } = await supabase.rpc('foresla_skordarobjekt', { p_objekt: objektId });
    if (error) { console.warn('foresla_skordarobjekt:', error.message); return []; }
    return ((data ?? []) as any[]).map(tolkaForslag).filter((f): f is SkordarForslag => !!f);
  } catch (e) {
    console.warn('foresla_skordarobjekt:', e);
    return [];
  }
}

export async function kopplaSkordarObjekt(supabase: SupabaseClient, objektId: string, stamObjektId: string): Promise<{ ok: true } | { ok: false; fel: string }> {
  try {
    const { error } = await supabase.rpc('koppla_skordarobjekt', { p_objekt: objektId, p_stam_objekt_id: stamObjektId });
    if (error) return { ok: false, fel: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, fel: e instanceof Error ? e.message : 'okänt fel' };
  }
}

const nejNyckel = (objektId: string, stamObjektId: string) => `${objektId}|${stamObjektId}`;

/** "Inte nu" gäller på den här enheten tills appdatan rensas. Localstorage som inte går att nå → frågan kommer igen, aldrig ett kast. */
export function arAvvisat(objektId: string, stamObjektId: string): boolean {
  try {
    const lista = JSON.parse(localStorage.getItem(NEJ_NYCKEL) || '[]');
    return Array.isArray(lista) && lista.includes(nejNyckel(objektId, stamObjektId));
  } catch { return false; }
}

export function avvisa(objektId: string, stamObjektId: string): void {
  try {
    const lista = JSON.parse(localStorage.getItem(NEJ_NYCKEL) || '[]');
    const ny = Array.isArray(lista) ? lista : [];
    const k = nejNyckel(objektId, stamObjektId);
    if (!ny.includes(k)) ny.push(k);
    localStorage.setItem(NEJ_NYCKEL, JSON.stringify(ny.slice(-100)));
  } catch { /* */ }
}
