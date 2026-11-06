// Kör traktanalysen AV SIG SJÄLV mot Vidas traktgräns och sparar i objekt.trakt_analys (Martin 2026-11-05: "vi vet det först när vi öppnar
// trakten och då kanske skördaren redan är på plats"). Anropas av cron /api/cron/traktanalys varje timme — en ny trakt från Vida är alltså
// analyserad inom en timme, långt innan maskinen kommer.
//
// Vilka trakter: alla som inte är avslutade (oplanerad, planerad, pågående, skotning) och har Vidas traktgräns. Ordning: aldrig analyserade
// först, sedan de där gränsen ändrats, sedan de där en kontroll föll, sist de äldre än 30 dagar. En åt gången inom tidsbudgeten.

import type { SupabaseClient } from '@supabase/supabase-js';
import { analyseraRingar, type AnalysisResult } from './kor';
import { ANTAL_KONTROLLER } from './markning';
import { traktgransRingar } from '@/lib/objektPlats';

export const AKTIVA_STATUS = ['oplanerad', 'planerad', 'pagaende', 'skotning'] as const;
/** En analys där en kontroll föll görs om tidigast efter så här lång tid (tjänsten kan vara nere en stund). */
export const FEL_OMFORSOK_MS = 6 * 3600_000;
/** Registren ändras sällan, men en ny nyckelbiotop eller fornlämning ska komma med: gör om allt efter 30 dagar. */
export const GAMMAL_MS = 30 * 24 * 3600_000;

type Sparad = { at?: string; grans?: string; fel?: string[] } | null;

/** Ett avtryck av traktgränsen, så en ny gräns från Vida gör om analysen. Avrundat till ~1 m. */
export function gransAvtryck(ringar: [number, number][][]): string {
  return ringar.map((r) => r.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(';')).join('|');
}

/** Varför trakten ska analyseras nu — eller null om den är aktuell. Lägre tal = viktigare. */
export function behov(sparad: Sparad, grans: string, nu: number): number | null {
  if (!sparad?.at) return 0;
  if (sparad.grans !== grans) return 1;
  const alder = nu - Date.parse(sparad.at);
  if ((sparad.fel?.length ?? 0) > 0 && alder >= FEL_OMFORSOK_MS) return 2;
  if (alder >= GAMMAL_MS) return 3;
  return null;
}

/** Det som sparas. Föll ALLA kontroller (tjänsterna nere, nätet) och en tidigare analys med samma gräns finns, sparas inget — den gamla står kvar. */
export function attSpara(r: AnalysisResult, grans: string, tidigare: Sparad, nu: Date): Record<string, unknown> | null {
  if (r.errors.length >= ANTAL_KONTROLLER && r.hits.length === 0 && tidigare?.at && tidigare.grans === grans) return null;
  return {
    at: nu.toISOString(),
    grans,
    fynd: r.hits.map((h) => ({ type: h.type, name: h.name, details: h.details ?? null, warning: h.warning ?? null, id: h.id ?? null, url: h.url ?? null, plats: h.plats ?? null })),
    fel: r.errors,
  };
}

export type KorSvar = { ok: boolean; analyserade: string[]; oforandrade: number; kvar: number; utanGrans: number; fel: string[] };

export async function korTraktanalys(
  sb: SupabaseClient,
  opt: { budgetMs: number; nu?: () => number; analysera?: (r: [number, number][][]) => Promise<AnalysisResult> },
): Promise<KorSvar> {
  const nu = opt.nu ?? Date.now;
  const analysera = opt.analysera ?? analyseraRingar;
  const start = nu();
  const svar: KorSvar = { ok: true, analyserade: [], oforandrade: 0, kvar: 0, utanGrans: 0, fel: [] };

  const o = await sb.from('objekt').select('id, namn, status, trakt_analys').in('status', [...AKTIVA_STATUS]);
  if (o.error) return { ...svar, ok: false, fel: [`objekt: ${o.error.message}`] };
  const objekt = (o.data ?? []) as { id: string; namn: string | null; status: string; trakt_analys: Sparad }[];
  if (!objekt.length) return svar;

  const g = await sb.from('objekt_traktgrans').select('objekt_id, geometri').in('objekt_id', objekt.map((x) => x.id));
  if (g.error) return { ...svar, ok: false, fel: [`objekt_traktgrans: ${g.error.message}`] };
  const ringarPer = new Map<string, [number, number][][]>();
  for (const rad of (g.data ?? []) as { objekt_id: string; geometri: unknown }[]) {
    const r = traktgransRingar(rad.geometri as never);
    if (r.length) ringarPer.set(rad.objekt_id, [...(ringarPer.get(rad.objekt_id) ?? []), ...r]);
  }

  const ko: { id: string; namn: string; ringar: [number, number][][]; grans: string; sparad: Sparad; vikt: number }[] = [];
  for (const x of objekt) {
    const ringar = ringarPer.get(x.id);
    if (!ringar?.length) { svar.utanGrans++; continue; }
    const grans = gransAvtryck(ringar);
    const v = behov(x.trakt_analys, grans, start);
    if (v === null) { svar.oforandrade++; continue; }
    ko.push({ id: x.id, namn: x.namn ?? x.id, ringar, grans, sparad: x.trakt_analys, vikt: v });
  }
  ko.sort((a, b) => a.vikt - b.vikt);

  for (let i = 0; i < ko.length; i++) {
    if (nu() - start > opt.budgetMs) { svar.kvar = ko.length - i; break; }
    const t = ko[i];
    try {
      const r = await analysera(t.ringar);
      const rad = attSpara(r, t.grans, t.sparad, new Date(nu()));
      if (!rad) { svar.fel.push(`${t.namn}: alla kontroller föll — förra analysen står kvar`); continue; }
      const u = await sb.from('objekt').update({ trakt_analys: rad }).eq('id', t.id);
      if (u.error) { svar.fel.push(`${t.namn}: ${u.error.message}`); continue; }
      svar.analyserade.push(t.namn);
    } catch (e) {
      svar.fel.push(`${t.namn}: ${(e as Error)?.message ?? 'okänt fel'}`);
    }
  }
  svar.ok = svar.fel.length === 0;
  return svar;
}
