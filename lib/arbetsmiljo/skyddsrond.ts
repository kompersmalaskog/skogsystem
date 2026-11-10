// SKYDDSRONDEN (arbetsmiljö, 2026-11-02). Arbetsgivaren och skyddsombudet går igenom arbetsmiljön tillsammans en gång om året
// (AFS 2023:1, Arbetsmiljöverkets mall: arbetsgivaren tar initiativet, skyddsombudet är med, både det fysiska och hur folk mår).
// Maskinkollen är förarens egen kontroll varje månad — ronden är det stora, en gång om året.
//
// Punkterna står HÄR (ändras här). När en rond startar sparas listan på ronden (am_skyddsrond.punkter), så en gammal rond visar det den
// frågade då. Svar: Bra · Brist (text krävs, blir en åtgärd i databasen, 30 dagar) · Gäller inte. Klar = alla punkter besvarade + vilka gick.
// Källor till punkterna: Arbetsmiljöverkets exempelhandbok (Undersöka arbetsmiljön), Länsförsäkringar/SBF 127 (brandskydd på
// skogsmaskiner), Skogforsks Riskhantering avseende brand vid skogsarbete. Ren logik + läsning/skrivning; ingen React.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hamtaAnsvar } from './atgarder';
import type { RondAtgard } from './dokument';

export type Punkt = { id: string; omrade: string; text: string; hjalp?: string; lank?: string; maskinId?: string };
export type Omrade = { id: string; namn: string; punkter: { id: string; text: string; hjalp?: string; lank?: string }[] };

/** Områdena i ordning. Brandskyddet per maskin läggs in först, för varje maskin vi har (byggPunkter). */
export const OMRADEN: Omrade[] = [
  { id: 'brand_skog', namn: 'Brand i skogen', punkter: [
    { id: 'sasong', text: 'Under brandsäsongen finns vattensläckare, kratta och spade i varje maskin' },
    { id: 'hog_risk', text: 'Alla vet vad vi gör när brandrisken är hög', hjalp: 'Från brandrisk 4 ska vi prata med Vida innan vi kör.' },
  ] },
  { id: 'forsta_hjalpen', namn: 'Första hjälpen', punkter: [
    { id: 'forband', text: 'Förbandslåda och ögonspolning finns i varje maskin och bil' },
    { id: 'hlr', text: 'Alla har gått första hjälpen och HLR', lank: '/utbildning' },
    { id: 'larma', text: 'Alla vet hur man larmar och beskriver vägen till trakten', lank: '/om-nagot-hander' },
  ] },
  { id: 'ensam', namn: 'Ensamarbete', punkter: [
    { id: 'var', text: 'Någon vet alltid var varje förare är' },
    { id: 'tackning', text: 'Det går att larma från alla trakter, med telefon eller på annat sätt' },
    { id: 'storm', text: 'Ingen jobbar ensam i stormfälld skog' },
  ] },
  { id: 'personal', namn: 'Rast och omklädning', punkter: [
    { id: 'bod', text: 'Det finns en varm plats att äta, toalett och varmt vatten' },
    { id: 'torka', text: 'Det går att torka blöta kläder' },
  ] },
  { id: 'kemi', namn: 'Oljor och kemikalier', punkter: [
    { id: 'datablad', text: 'Säkerhetsdatablad finns för hydraulolja, kedjeolja, diesel och AdBlue' },
    { id: 'sanering', text: 'Saneringsutrustning för olja finns i varje maskin' },
  ] },
  { id: 'ma', namn: 'Arbetstid och hur vi mår', punkter: [
    { id: 'vila', text: 'Ingen jobbar för långa dagar eller utan vila', hjalp: 'Titta på vilobrotten under Admin › Lön.' },
    { id: 'mar', text: 'Vi har pratat om hur alla mår', hjalp: 'Stress, ensamhet, bråk eller att någon blir illa behandlad.' },
    { id: 'fhv', text: 'Alla vet hur de når företagshälsovården' },
  ] },
  { id: 'utbildning', namn: 'Utbildning', punkter: [
    { id: 'utb', text: 'Alla har de utbildningar som krävs', hjalp: 'Motorsågskörkort, första hjälpen och det beställaren kräver.', lank: '/utbildning' },
  ] },
  { id: 'lastbil', namn: 'Lastbilen och verkstaden', punkter: [
    { id: 'lb_brand', text: 'Lastbilen har två brandsläckare och en huvudströmbrytare som fungerar' },
    { id: 'surr', text: 'Kedjor, spännen och ramper på lastbilen är hela' },
    { id: 'verkstad', text: 'Verkstaden är städad. Lyftdon, domkrafter och stegar är hela' },
  ] },
  { id: 'uppfoljning', namn: 'Uppföljning', punkter: [
    { id: 'risk', text: 'Riskbedömningen för varje maskintyp är godkänd i år', lank: '/riskbedomning' },
    { id: 'atgarder', text: 'Åtgärderna från förra ronden är gjorda', lank: '/atgarder' },
    { id: 'maskinkoll', text: 'Maskinkollen görs varje månad på alla maskiner', lank: '/maskinkoll' },
  ] },
];

export const BRAND_OMRADE = 'brand_maskin';
export const BRAND_NAMN = 'Brandskydd på maskinerna';

/** Hela listan för en ny rond: två brandskyddspunkter per maskin vi har, sedan områdena. */
export function byggPunkter(maskiner: readonly { id: string; namn: string }[]): Punkt[] {
  const brand: Punkt[] = maskiner.flatMap(m => [
    { id: `brand_protokoll:${m.id}`, omrade: BRAND_OMRADE, maskinId: m.id, text: `${m.namn}: brandskyddskontroll gjord senaste året och protokollet finns`,
      hjalp: 'Kontrollen görs av en godkänd firma. Utan protokoll kan försäkringen bli lägre om maskinen brinner.' },
    { id: `brand_slackare:${m.id}`, omrade: BRAND_OMRADE, maskinId: m.id, text: `${m.namn}: två brandsläckare på minst 6 kg och huvudströmbrytaren fungerar` },
  ]);
  return [...brand, ...OMRADEN.flatMap(o => o.punkter.map(p => ({ ...p, omrade: o.id })))];
}

export function omradeNamn(id: string): string {
  return id === BRAND_OMRADE ? BRAND_NAMN : OMRADEN.find(o => o.id === id)?.namn ?? 'Övrigt';
}

/** Punkterna grupperade på område, i den ordning de står i ronden. */
export function grupperaPunkter(punkter: readonly Punkt[]): { omrade: string; namn: string; punkter: Punkt[] }[] {
  const ut: { omrade: string; namn: string; punkter: Punkt[] }[] = [];
  for (const p of punkter) {
    let g = ut.find(x => x.omrade === p.omrade);
    if (!g) { g = { omrade: p.omrade, namn: omradeNamn(p.omrade), punkter: [] }; ut.push(g); }
    g.punkter.push(p);
  }
  return ut;
}

export type SvarTyp = 'ok' | 'brist' | 'galler_inte';
export type Svar = { id?: string; punkt: string; svar: SvarTyp; beskrivning: string | null; fotoUrl?: string | null };
export type Rond = { id: string; punkter: Punkt[]; deltagare: string | null; startad: string; klar: string | null; svar: Svar[] };

export const OFTA_DAGAR = 365;

/** Läget för startsidan och sidans svar. pagar = en rond är startad; dags = ingen klar rond det senaste året; ok = gjord i tid. */
export type Lage = { typ: 'pagar'; rond: Rond } | { typ: 'dags'; senast: Rond | null } | { typ: 'ok'; senast: Rond; nasta: string };

export function lage(ronder: readonly Rond[], nu: Date): Lage {
  const pagar = ronder.find(r => !r.klar);
  if (pagar) return { typ: 'pagar', rond: pagar };
  const klara = ronder.filter(r => r.klar).sort((a, b) => b.klar!.localeCompare(a.klar!));
  const senast = klara[0] ?? null;
  if (!senast) return { typ: 'dags', senast: null };
  const nasta = new Date(new Date(senast.klar!).getTime() + OFTA_DAGAR * 86_400_000);
  return nasta.getTime() <= nu.getTime() ? { typ: 'dags', senast } : { typ: 'ok', senast, nasta: nasta.toISOString() };
}

export function antalBesvarade(r: Rond): number {
  const ids = new Set(r.punkter.map(p => p.id));
  return r.svar.filter(s => ids.has(s.punkt)).length;
}

export function antalBrister(r: Rond): number {
  return r.svar.filter(s => s.svar === 'brist').length;
}

/** Startsidans rad för admin och skyddsombud. null = inget att göra. */
export function behoverDigText(l: Lage): string | null {
  if (l.typ === 'pagar') return `Fortsätt skyddsronden · ${antalBesvarade(l.rond)} av ${l.rond.punkter.length}`;
  if (l.typ === 'dags') return 'Dags för skyddsrond';
  return null;
}

// ── Lagring ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function tolkaPunkter(raw: unknown): Punkt[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(x => {
    const o = x as Record<string, unknown> | null;
    if (!o || typeof o.id !== 'string' || typeof o.text !== 'string' || typeof o.omrade !== 'string') return [];
    return [{ id: o.id, omrade: o.omrade, text: o.text, hjalp: typeof o.hjalp === 'string' ? o.hjalp : undefined, lank: typeof o.lank === 'string' ? o.lank : undefined, maskinId: typeof o.maskinId === 'string' ? o.maskinId : undefined }];
  });
}

/** Alla ronder med svar. null = kunde inte läsas. */
export async function hamtaRonder(sb: SupabaseClient): Promise<Rond[] | null> {
  const [r, s] = await Promise.all([
    sb.from('am_skyddsrond').select('id, punkter, deltagare, startad, klar').order('startad', { ascending: false }),
    sb.from('am_skyddsrond_svar').select('id, rond_id, punkt, svar, beskrivning, foto_url'),
  ]);
  if (r.error || s.error || !Array.isArray(r.data) || !Array.isArray(s.data)) return null;
  const svar = s.data as { id: string; rond_id: string; punkt: string; svar: SvarTyp; beskrivning: string | null; foto_url: string | null }[];
  return (r.data as { id: string; punkter: unknown; deltagare: string | null; startad: string; klar: string | null }[]).map(x => ({
    id: x.id, punkter: tolkaPunkter(x.punkter), deltagare: x.deltagare, startad: x.startad, klar: x.klar,
    svar: svar.filter(y => y.rond_id === x.id).map(y => ({ id: y.id, punkt: y.punkt, svar: y.svar, beskrivning: y.beskrivning, fotoUrl: y.foto_url ?? null })),
  }));
}

/** Åtgärderna som bristerna blev (för PDF:en). null = kunde inte läsas. */
export async function hamtaRondAtgarder(sb: SupabaseClient): Promise<RondAtgard[] | null> {
  const [{ data, error }, ansvar] = await Promise.all([
    sb.from('am_atgard').select('id, skyddsrond_svar_id, status, deadline, vad_gjordes, stangd_tid').eq('kalla', 'skyddsrond'),
    hamtaAnsvar(sb),
  ]);
  if (error || !Array.isArray(data)) return null;
  return (data as { id: string; skyddsrond_svar_id: string | null; status: 'oppen' | 'klar'; deadline: string | null; vad_gjordes: string | null; stangd_tid: string | null }[])
    .filter(a => a.skyddsrond_svar_id)
    .map(a => ({
      svarId: a.skyddsrond_svar_id!, status: a.status, deadline: a.deadline, vadGjordes: a.vad_gjordes, stangdTid: a.stangd_tid,
      // Vem (tillägget am_atgard_ansvar): går det inte att läsa sägs ingenting om vem i PDF:en.
      ansvarig: ansvar ? ansvar.get(a.id)?.namn ?? null : undefined,
    }));
}

/** Startar en rond med listan som gäller nu. null = gick inte. */
export async function startaRond(sb: SupabaseClient, punkter: Punkt[]): Promise<string | null> {
  const { data, error } = await sb.from('am_skyddsrond').insert({ punkter }).select('id').single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Sparar ett svar. Brist utan text sparas inte. Bara en brist kan ha ett foto (sökväg i am-foton). false = gick inte. */
export async function svara(sb: SupabaseClient, rondId: string, p: Punkt, svar: SvarTyp, beskrivning: string | null, fotoUrl: string | null = null): Promise<boolean> {
  const text = beskrivning?.trim() || null;
  if (svar === 'brist' && !text) return false;
  const { error } = await sb.from('am_skyddsrond_svar').upsert(
    { rond_id: rondId, punkt: p.id, punkt_text: p.text, maskin_id: p.maskinId ?? null, svar, beskrivning: svar === 'brist' ? text : null, foto_url: svar === 'brist' ? fotoUrl : null },
    { onConflict: 'rond_id,punkt' },
  );
  return !error;
}

/** Avslutar. Databasen kräver alla svar och deltagare och sätter tiden. Returnerar felet i ord, eller null. */
export async function avsluta(sb: SupabaseClient, rondId: string, deltagare: string): Promise<string | null> {
  if (!deltagare.trim()) return 'Skriv vilka som gick ronden.';
  const { data, error } = await sb.from('am_skyddsrond').update({ deltagare: deltagare.trim(), klar: new Date().toISOString() })
    .eq('id', rondId).is('klar', null).select('klar');
  if (error) return error.message?.startsWith('Svara på alla') ? error.message : 'Kunde inte spara. Försök igen.';
  if (!data || data.length === 0) return 'Ronden är redan klar.';
  return null;
}
