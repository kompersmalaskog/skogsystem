// Grot-koppling: vilka AVVERKNINGSobjekt ett RISJOBB hämtar riset från.
//
// Kopplingen fångas vid källan (redigeringsvyn, där risskotning sätts) och gör
// grot-avbockningen automatisk: när risjobbet markeras färdigskotat bockas
// grot_hamtad av på de kopplade avverkningsobjekten.
//
// TVÅ BÄRANDE REGLER:
//  1. Mänsklig kunskap vinner. Automatiken skriver ALDRIG över ett redan satt
//     grot_hamtad — guarden ligger i DATABASFILTRET (grot_hamtad IS NULL), inte
//     i en läs-sen-skriv-kontroll, så en mänsklig ändring vinner även om den
//     sker mellan läsning och skrivning.
//  2. Ångra rör bara det automatiken själv satte. auto_avbockad_datum på
//     kopplingsraden är kvittot; saknas det, eller har någon ändrat datumet
//     efteråt, lämnas objektet ifred.
//
// Alla skrivningar verifieras enligt #222-mönstret: läs tillbaka VÄRDET,
// inte bara radantalet.

import { supabase } from '@/lib/supabase';

export interface GrotKopplingRad {
  risjobb_objekt_id: string;
  avverknings_objekt_id: string;
  auto_avbockad_datum: string | null;
}

export interface Utfall {
  ok: boolean;
  message: string;
}

// ── Läs kopplingar för ett risjobb ────────────────────────────────────────
export async function hamtaKopplingar(risjobbId: string): Promise<{ ok: boolean; rader: GrotKopplingRad[]; message: string }> {
  const { data, error } = await supabase
    .from('grot_koppling')
    .select('risjobb_objekt_id, avverknings_objekt_id, auto_avbockad_datum')
    .eq('risjobb_objekt_id', risjobbId);
  if (error) return { ok: false, rader: [], message: 'Kunde inte läsa kopplingarna: ' + error.message };
  return { ok: true, rader: (data || []) as GrotKopplingRad[], message: '' };
}

// ── Spara urvalet (ersätter hela mängden för risjobbet) ───────────────────
// Ärlig sparning: både borttag och tillägg verifieras mot faktiskt utfall.
export async function sparaKopplingar(risjobbId: string, valda: string[]): Promise<Utfall> {
  const nuvarande = await hamtaKopplingar(risjobbId);
  if (!nuvarande.ok) return { ok: false, message: nuvarande.message };

  const har = new Set(nuvarande.rader.map(r => r.avverknings_objekt_id));
  const ska = new Set(valda);
  const taBort = [...har].filter(id => !ska.has(id));
  const laggTill = [...ska].filter(id => !har.has(id));

  if (taBort.length > 0) {
    const { error } = await supabase
      .from('grot_koppling')
      .delete()
      .eq('risjobb_objekt_id', risjobbId)
      .in('avverknings_objekt_id', taBort);
    if (error) return { ok: false, message: 'Kunde inte ta bort koppling: ' + error.message };
  }

  if (laggTill.length > 0) {
    const rader = laggTill.map(id => ({ risjobb_objekt_id: risjobbId, avverknings_objekt_id: id }));
    const { data, error } = await supabase
      .from('grot_koppling')
      .insert(rader)
      .select('avverknings_objekt_id');
    if (error) return { ok: false, message: 'Kunde inte spara koppling: ' + error.message };
    if ((data || []).length !== laggTill.length) {
      return { ok: false, message: `Bara ${(data || []).length} av ${laggTill.length} kopplingar sparades` };
    }
  }

  // Läs tillbaka och bekräfta att mängden faktiskt stämmer
  const efter = await hamtaKopplingar(risjobbId);
  if (!efter.ok) return { ok: false, message: efter.message };
  const nu = new Set(efter.rader.map(r => r.avverknings_objekt_id));
  if (nu.size !== ska.size || [...ska].some(id => !nu.has(id))) {
    return { ok: false, message: 'Kopplingarna ser inte ut som valt efter sparning — ladda om och försök igen' };
  }
  return { ok: true, message: '' };
}

// ── AUTOMATIK PÅ: risjobbet färdigskotat → bocka av grot på kopplade objekt ──
export async function grotHamtadAutomatik(risjobbId: string, datum: string): Promise<Utfall & { satta: number }> {
  const kopplingar = await hamtaKopplingar(risjobbId);
  if (!kopplingar.ok) return { ok: false, message: kopplingar.message, satta: 0 };
  if (kopplingar.rader.length === 0) return { ok: true, message: '', satta: 0 };

  const satta: string[] = [];
  for (const rad of kopplingar.rader) {
    // Guarden ligger i filtret: bara NULL skrivs. Ett satt datum (mänskligt
    // eller från ett annat risjobb) rörs aldrig.
    const { data, error } = await supabase
      .from('dim_objekt')
      .update({ grot_hamtad: datum })
      .eq('objekt_id', rad.avverknings_objekt_id)
      .is('grot_hamtad', null)
      .select('objekt_id, grot_hamtad');
    if (error) return { ok: false, message: 'Kunde inte bocka av grot: ' + error.message, satta: satta.length };
    const traff = (data || [])[0] as any;
    if (!traff) continue; // redan satt — mänsklig kunskap vinner, hoppa
    if (traff.grot_hamtad !== datum) {
      return { ok: false, message: `Grot-datumet landade inte på ${rad.avverknings_objekt_id} — ladda om och försök igen`, satta: satta.length };
    }
    satta.push(rad.avverknings_objekt_id);
  }

  // Kvittot: stämpla BARA de rader automatiken faktiskt satte.
  if (satta.length > 0) {
    const { data, error } = await supabase
      .from('grot_koppling')
      .update({ auto_avbockad_datum: datum })
      .eq('risjobb_objekt_id', risjobbId)
      .in('avverknings_objekt_id', satta)
      .select('avverknings_objekt_id, auto_avbockad_datum');
    if (error) return { ok: false, message: 'Grot bockades av men stämpeln kunde inte sparas: ' + error.message, satta: satta.length };
    const stamplade = (data || []).filter((r: any) => r.auto_avbockad_datum === datum).length;
    if (stamplade !== satta.length) {
      return { ok: false, message: 'Grot bockades av men stämpeln blev ofullständig — ångra kan bli opålitlig', satta: satta.length };
    }
  }
  return { ok: true, message: '', satta: satta.length };
}

// ── AUTOMATIK AV: färdigmarkeringen ångrad → nolla BARA det automatiken satte ──
export async function angraGrotHamtadAutomatik(risjobbId: string): Promise<Utfall & { nollade: number }> {
  const kopplingar = await hamtaKopplingar(risjobbId);
  if (!kopplingar.ok) return { ok: false, message: kopplingar.message, nollade: 0 };
  const auto = kopplingar.rader.filter(r => r.auto_avbockad_datum != null);
  if (auto.length === 0) return { ok: true, message: '', nollade: 0 };

  const nollade: string[] = [];
  for (const rad of auto) {
    // Nollas BARA om datumet fortfarande är exakt det automatiken satte —
    // har någon ändrat det efteråt är det mänsklig kunskap och lämnas ifred.
    const { data, error } = await supabase
      .from('dim_objekt')
      .update({ grot_hamtad: null })
      .eq('objekt_id', rad.avverknings_objekt_id)
      .eq('grot_hamtad', rad.auto_avbockad_datum as string)
      .select('objekt_id, grot_hamtad');
    if (error) return { ok: false, message: 'Kunde inte ångra grot-avbockningen: ' + error.message, nollade: nollade.length };
    const traff = (data || [])[0] as any;
    if (!traff) continue; // ändrat av människa — rör inte
    if (traff.grot_hamtad !== null) {
      return { ok: false, message: `Grot-datumet nollades inte på ${rad.avverknings_objekt_id} — ladda om och försök igen`, nollade: nollade.length };
    }
    nollade.push(rad.avverknings_objekt_id);
  }

  if (nollade.length > 0) {
    const { data, error } = await supabase
      .from('grot_koppling')
      .update({ auto_avbockad_datum: null })
      .eq('risjobb_objekt_id', risjobbId)
      .in('avverknings_objekt_id', nollade)
      .select('avverknings_objekt_id, auto_avbockad_datum');
    if (error) return { ok: false, message: 'Grot nollades men stämpeln kunde inte rensas: ' + error.message, nollade: nollade.length };
    const kvar = (data || []).filter((r: any) => r.auto_avbockad_datum != null).length;
    if (kvar > 0) return { ok: false, message: 'Grot nollades men stämpeln finns kvar — ladda om', nollade: nollade.length };
  }
  return { ok: true, message: '', nollade: nollade.length };
}

// ── Kandidater till kopplingen: ris-urvalet (C) ───────────────────────────
// grot_anpassad, ej exkluderad, HAR stamvolym, grot inte hämtad. Äldst först
// på sista avverkningsdag — samma urval och ordning som rislistan i vyn.
export interface RisKandidat {
  objekt_id: string;
  namn: string;
  volym_m3sub: number;
  sista_datum: string | null;
}

export async function hamtaRisKandidater(): Promise<{ ok: boolean; rader: RisKandidat[]; message: string }> {
  const [dimRes, prodRes] = await Promise.all([
    supabase.from('dim_objekt')
      .select('objekt_id, object_name, grot_anpassad, exkludera, grot_hamtad')
      .eq('grot_anpassad', true)
      .is('grot_hamtad', null),
    supabase.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub, sista_datum'),
  ]);
  if (dimRes.error) return { ok: false, rader: [], message: 'Kunde inte läsa objekten: ' + dimRes.error.message };
  if (prodRes.error) return { ok: false, rader: [], message: 'Kunde inte läsa volymerna: ' + prodRes.error.message };

  const prod = new Map<string, { v: number; d: string | null }>();
  for (const p of prodRes.data || []) {
    prod.set((p as any).objekt_id, { v: Number((p as any).volym_m3sub) || 0, d: (p as any).sista_datum || null });
  }

  const rader: RisKandidat[] = [];
  for (const d of dimRes.data || []) {
    const rad = d as any;
    if (rad.exkludera === true) continue;
    const p = prod.get(rad.objekt_id);
    if (!p || p.v <= 0) continue; // utan stamvolym finns ingen grund
    rader.push({ objekt_id: rad.objekt_id, namn: rad.object_name || 'Namnlöst objekt', volym_m3sub: p.v, sista_datum: p.d });
  }
  rader.sort((a, b) => {
    if (!a.sista_datum) return 1;
    if (!b.sista_datum) return -1;
    return a.sista_datum.localeCompare(b.sista_datum); // äldst först
  });
  return { ok: true, rader, message: '' };
}
