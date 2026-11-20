// "Här har Giant varit" — maskinens resa under året, ren logik (läsningen ligger i lasResa.ts).
//
// Martin 2026-10-24: "en del trakter hjular vi till, så det är inte alltid vi kör med lastbilen". Lastbilens flyttar räcker
// alltså inte för att veta var maskinen varit: Giant hjulade fem gånger på åtta veckor (Bågskyttebanan → Mölleryd →
// Skälviken i oktober), och arket sa "Står på Bågskyttebanan sedan 18 dagar" när den stod på Skälviken.
//
// Regler:
//  - Var maskinen JOBBAT läses ur dess egna filer: skördarens fakt_produktion, skotarens fakt_lass (810E:s manuella lass också).
//    En trakt är ett objektnamn (dim_objekt.object_name), så flera objekt_id med samma namn blir en trakt.
//  - Dagarna läggs i ordning; samma trakt flera dagar i följd är ETT stopp. En dag med två trakter ordnas på dagens första
//    tid (skördarens monitoring_start, skotarens lossningstid); saknas tiden kommer trakten maskinen redan var på först.
//  - Mellan två stopp: finns en lastbilsflytt för maskinen som lossades från sista dagen på förra stoppet till första dagen
//    på nästa, kom den dit med lastbil. Annars körde den själv. Bara dagar — klockslaget för en hjulning vet vi inte.
//    Årets första stopp tar närmaste flytt före sin första dag (bilen lämnar på fredagen, filerna börjar på måndagen).
//  - En lastbilsflytt som inte hör till något byte (verkstad, eller en trakt den inte börjat köra på än) blir ett eget stopp
//    utan arbetsdagar ("inga filer härifrån").
//  - Snittet "jobbar N dagar på varje trakt" räknar avslutade stopp med arbetsdagar (inte det pågående), minst MIN_STOPP_SNITT.

import { sthlmDelar } from '@/lib/sthlmTid';
import type { Flytt } from './maskiner';

export const MIN_STOPP_SNITT = 3;

/** En dag maskinen jobbade på en trakt, enligt filerna. `tid` = dagens första tid på trakten (ISO) om den finns. */
export interface FilDag { datum: string; namn: string; tid: string | null }

export interface Stopp {
  namn: string;
  fran: string;          // första dagen, 'YYYY-MM-DD'
  till: string;          // sista dagen
  dagar: number;         // dagar med filer (0 = bara lastbilen vet att den var här)
}

export type Hit = { typ: 'lastbil'; flytt: Flytt } | { typ: 'sjalv'; datum: string };

/** Ett steg i resan: stoppet och hur maskinen kom dit (null = okänt, årets första stopp). */
export interface Steg { stopp: Stopp; hit: Hit | null }

export interface Resa {
  steg: Steg[];          // nyast först
  lastbil: number;
  sjalv: number;
  /** Snitt arbetsdagar per avslutat stopp, null när för få. `antal` = stopp det bygger på. */
  dagarPerTrakt: { snitt: number | null; antal: number };
}

const dagAv = (iso: string): string | null => sthlmDelar(new Date(iso))?.datum ?? null;

/** Dagarna i ordning, utan dubbletter. */
function ordnaDagar(dagar: readonly FilDag[]): FilDag[] {
  const perDag = new Map<string, Map<string, FilDag>>();
  for (const d of dagar) {
    const m = perDag.get(d.datum) ?? new Map<string, FilDag>();
    const fore = m.get(d.namn);
    if (!fore || (d.tid && (!fore.tid || d.tid < fore.tid))) m.set(d.namn, d);
    perDag.set(d.datum, m);
  }
  const ut: FilDag[] = [];
  let aktuell: string | null = null;
  for (const datum of Array.from(perDag.keys()).sort()) {
    const dagens = Array.from(perDag.get(datum)!.values());
    const ms = (d: FilDag) => (d.tid ? Date.parse(d.tid) : NaN);
    dagens.sort((a, b) => (Number.isFinite(ms(a)) && Number.isFinite(ms(b)) && ms(a) !== ms(b) ? ms(a) - ms(b) : 0)
      || Number(b.namn === aktuell) - Number(a.namn === aktuell) || a.namn.localeCompare(b.namn, 'sv'));
    ut.push(...dagens);
    aktuell = dagens[dagens.length - 1].namn;
  }
  return ut;
}

export function byggResa(dagar: readonly FilDag[], flyttar: readonly Flytt[]): Resa {
  // 1. Stoppen ur filerna.
  const filstopp: Stopp[] = [];
  const dagSet: Set<string>[] = [];
  for (const d of ordnaDagar(dagar)) {
    const sista = filstopp[filstopp.length - 1];
    if (sista && sista.namn === d.namn) { sista.till = d.datum; dagSet[dagSet.length - 1].add(d.datum); }
    else { filstopp.push({ namn: d.namn, fran: d.datum, till: d.datum, dagar: 0 }); dagSet.push(new Set([d.datum])); }
  }
  filstopp.forEach((s, i) => { s.dagar = dagSet[i].size; });

  // 2. Lastbilens flyttar, äldst först, till bytena.
  const lastbil = flyttar.map(f => ({ f, dag: dagAv(f.lossad) })).filter((x): x is { f: Flytt; dag: string } => !!x.dag)
    .sort((a, b) => Date.parse(a.f.lossad) - Date.parse(b.f.lossad));
  const anvand = new Set<string>();
  const hitar: (Hit | null)[] = filstopp.map((s, i) => {
    // Första stoppet: närmaste flytt före eller samma dag (bilen lämnar ofta på fredagen, filerna börjar på måndagen).
    // Samma dag flera flyttar: den tidigaste hör hit, de senare till stoppen efter.
    const fore = lastbil.filter(l => !anvand.has(l.f.id) && l.dag <= s.fran);
    const x = i === 0
      ? fore.find(l => l.dag === fore[fore.length - 1]?.dag)
      : lastbil.find(l => !anvand.has(l.f.id) && l.dag >= filstopp[i - 1].till && l.dag <= s.fran);
    if (x) { anvand.add(x.f.id); return { typ: 'lastbil', flytt: x.f }; }
    return i === 0 ? null : { typ: 'sjalv', datum: s.fran };
  });

  // 3. Flyttar utan byte blir egna stopp, insatta efter det sista stopp som börjat senast samma dag.
  const steg: Steg[] = filstopp.map((stopp, i) => ({ stopp, hit: hitar[i] }));
  for (const l of lastbil) {
    if (anvand.has(l.f.id)) continue;
    const ny: Steg = { stopp: { namn: l.f.tillNamn ?? 'Okänd plats', fran: l.dag, till: l.dag, dagar: 0 }, hit: { typ: 'lastbil', flytt: l.f } };
    let pos = 0;
    while (pos < steg.length && steg[pos].stopp.fran <= l.dag) pos++;
    steg.splice(pos, 0, ny);
  }

  // 4. Snittet: avslutade stopp med arbetsdagar.
  const avslutade = steg.slice(0, -1).filter(s => s.stopp.dagar > 0).map(s => s.stopp.dagar);
  const snitt = avslutade.length >= MIN_STOPP_SNITT ? avslutade.reduce((a, b) => a + b, 0) / avslutade.length : null;

  return {
    steg: steg.reverse(),
    lastbil: steg.filter(s => s.hit?.typ === 'lastbil').length,
    sjalv: steg.filter(s => s.hit?.typ === 'sjalv').length,
    dagarPerTrakt: { snitt, antal: avslutade.length },
  };
}
