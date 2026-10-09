// SLÅ IHOP ETT "VÄNTAR PÅ VIDA"-JOBB MED VIDAS OBJEKT (service-roll, anropas bara av /api/starta-jobb/sla-ihop efter att någon sagt Ja).
//
// Flyttar jobbets hyttspår, markeringar, anteckningar, media och tilldelning till Vida-objektet och tar bort P-objektet. Ordningen är vald så att
// ett avbrott mitt i aldrig kan förlora data:
//   1. FÖRKONTROLL — jobbet är "Väntar på Vida" med P-VO, målet ett riktigt Vida-objekt, och målets traktgräns täcker jobbets spår/position (samma
//      regel som förslaget, räknad om HÄR: ett POST från en klient flyttar ingenting som inte täcks).
//   2. FLYTTA — hyttspår (rader för samma roll+dag slås ihop punkt för punkt), sedan varje tabell med en kolumn mot objekt.id, sedan objektets egna
//      fält (tilldelning, pågående, anteckningar), maskindatans VO (dim_objekt.vo_nummer P → Vidas) och GROT-jobb som hörde till jobbet.
//   3. KONTROLLERA — inget kvar på P-objektet i någon av tabellerna (läses tillbaka, inte antas av att ett anrop "gick bra").
//   4. RADERA P-objektet — SIST. Först nu. Allt som hängde på det via ON DELETE CASCADE är då redan flyttat.
// Varje steg är idempotent: ett avbrutet anrop kan köras om och fortsätter där det slutade. Går något fel före steg 4 finns P-objektet kvar helt.
//
// objekt_geometri, objekt_vagdata och objekt_kvittering FLYTTAS INTE: Vida-objektet har sina egna (traktgräns ur importen, väg-data ur cron),
// jobbets (om något) är en kopia av platsen vi redan har.

import { arVantaVidaJobb, arVidaObjekt, traktTackerJobb, type SparPunkt } from './vidaSammanslagning';
import { slaIhopPunkter } from './hyttsparSlaIhop';

type Db = { from(t: string): any };

/** (tabell, kolumn mot objekt.id) som flyttas. Ordningen är ingen funktion — alla körs. */
export const FLYTTA_TABELLER: readonly (readonly [string, string])[] = [
  ['planering_markeringar', 'objekt_id'],
  ['objekt_yta_anteckning', 'objekt_id'],
  ['objekt_yta_media', 'objekt_id'],
  ['korvy_kvittens', 'objekt_id'],
  ['avlagg_assessments', 'objekt_id'],
  ['tma_assessments', 'objekt_id'],
  ['brand_brandvakt', 'objekt_id'],
  ['brand_efterkontroll', 'objekt_id'],
  ['brand_samrad', 'objekt_id'],
  ['brand_tillbud', 'objekt_id'],
  ['brand_kontakter', 'objekt_id'],
  ['egenkontroll', 'objekt_id'],
  ['skotning_uttag', 'objekt_id'],
  ['skordarstrak', 'objekt_id'],
  ['maskin_ko', 'objekt_id'],
  ['arbetsrapporter', 'objekt_id'],
  ['planner', 'objekt_id'],
  ['kalibrering_filer', 'objekt_id'],
  ['fpr_filer', 'objekt_id'],
  ['mom_filer', 'objekt_id'],
  ['mom_produktion', 'objekt_id'],
  ['hpr_filer', 'objekt_id'],
  ['maskin_flytt', 'till_objekt_id'],
  ['maskin_flytt', 'fran_objekt_id'],
  ['gps_tracks', 'objekt_id'],
];

/** En krock här (målet har redan en rad med samma nyckel) STOPPAR sammanslagningen — raderna ska inte tyst försvinna med P-objektet. */
const BLOCKERANDE_TABELLER = new Set(['egenkontroll']);

/** Tilldelningen som följer med (bara när Vida-objektet saknar värde — det som redan är satt där vinner). */
export const TILLDELNINGSFALT = [
  'assigned_skordare_user_id', 'assigned_skotare_user_id', 'skordare_maskin_id', 'skotare_maskin_id',
  'skordare_utforare', 'skotare_utforare', 'skordare_utforare_namn', 'skotare_utforare_namn',
] as const;

export interface SlaIhopResultat {
  ok: boolean;
  fel?: string;
  hyttspar: { flyttade: number; sammanslagna: number };
  /** tabell.kolumn → antal flyttade rader (bara de som flyttade något). */
  flyttat: Record<string, number>;
  /** Tabeller där målet redan hade en rad med samma nyckel — jobbets rader följde inte med (föll med P-objektet). */
  krockar: string[];
  /** Tabeller som inte finns i den här databasen (hoppades över). */
  saknas: string[];
  tilldelning: string[];
  statusPagaende: boolean;
  anteckningarSammanfogade: boolean;
  dimUppdaterade: number;
  raderat: boolean;
}

const tom = (): SlaIhopResultat => ({ ok: false, hyttspar: { flyttade: 0, sammanslagna: 0 }, flyttat: {}, krockar: [], saknas: [], tilldelning: [], statusPagaende: false, anteckningarSammanfogade: false, dimUppdaterade: 0, raderat: false });
const fel = (r: SlaIhopResultat, msg: string): SlaIhopResultat => ({ ...r, ok: false, fel: msg });
const saknasTabell = (e: { message?: string; code?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|Could not find the table/i.test(e.message || ''));
const finns = (v: unknown) => v != null && String(v).trim() !== '';

/** Anteckningstext: båda → jobbets läggs UNDER målets med en rubrik som säger varifrån den kommer. */
export function sammanfogaAnteckning(mal: string | null | undefined, jobb: string | null | undefined, jobbNamn: string): string | null {
  if (!finns(jobb)) return finns(mal) ? String(mal) : null;
  if (!finns(mal)) return String(jobb);
  return `${String(mal).trimEnd()}\n\n— Från ${jobbNamn}:\n${String(jobb).trim()}`;
}

export async function slaIhopJobb(db: Db, args: { franId: string; tillId: string; nu?: Date }): Promise<SlaIhopResultat> {
  const nu = args.nu ?? new Date();
  const r = tom();
  if (!args.franId || !args.tillId || args.franId === args.tillId) return fel(r, 'Jobbet och objektet måste vara två olika objekt');

  // ── 1. FÖRKONTROLL ──────────────────────────────────────────────────────────────────────────
  const { data: rader, error: lasFel } = await db.from('objekt').select('*').in('id', [args.franId, args.tillId]);
  if (lasFel) return fel(r, 'Kunde inte läsa objekten: ' + lasFel.message);
  const fran = (rader || []).find((o: any) => o.id === args.franId);
  const till = (rader || []).find((o: any) => o.id === args.tillId);
  if (!fran) return fel(r, 'Jobbet finns inte (längre)');
  if (!till) return fel(r, 'Vida-objektet finns inte');
  if (!arVantaVidaJobb(fran)) return fel(r, 'Bara jobb som väntar på Vida kan slås ihop (privata jobb frågas aldrig)');
  if (!arVidaObjekt(till)) return fel(r, 'Målet är inget Vida-objekt');

  const { data: spar, error: sparFel } = await db.from('hyttspar').select('id, roll, datum, points').eq('objekt_id', fran.id);
  if (sparFel) return fel(r, 'Kunde inte läsa jobbets hyttspår: ' + sparFel.message);
  const { data: geoRad, error: geoFel } = await db.from('objekt_geometri').select('geometri').eq('objekt_id', till.id).maybeSingle();
  if (geoFel) return fel(r, 'Kunde inte läsa Vida-objektets traktgräns: ' + geoFel.message);
  const punkter: SparPunkt[] = [];
  for (const s of spar || []) for (const p of Array.isArray(s.points) ? s.points : []) if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) punkter.push({ lat: p.lat, lng: p.lng });
  const tack = traktTackerJobb(geoRad?.geometri ?? null, fran, punkter);
  if (!tack.tacker) return fel(r, 'Vida-objektets traktgräns täcker inte jobbets position eller hyttspår — inget flyttades');

  // ── 2. FLYTTA ───────────────────────────────────────────────────────────────────────────────
  // 2a. Hyttspår: samma roll+dag på båda → punkterna slås ihop på Vida-objektets rad, jobbets rad tas bort; annars byter raden objekt.
  for (const s of spar || []) {
    const { data: mal, error: malFel } = await db.from('hyttspar').select('id, points').eq('objekt_id', till.id).eq('roll', s.roll).eq('datum', s.datum).maybeSingle();
    if (malFel) return fel(r, 'Kunde inte läsa Vida-objektets spår: ' + malFel.message);
    if (mal) {
      const ihop = slaIhopPunkter(mal.points, s.points);
      const { data: upd, error: updFel } = await db.from('hyttspar').update({ points: ihop, antal_punkter: ihop.length, uppdaterad_at: nu.toISOString() }).eq('id', mal.id).select('id');
      if (updFel || !upd || upd.length !== 1) return fel(r, 'Kunde inte slå ihop hyttspåren' + (updFel ? ': ' + updFel.message : ' — raden träffades inte'));
      const { error: delFel } = await db.from('hyttspar').delete().eq('id', s.id);
      if (delFel) return fel(r, 'Kunde inte ta bort den ihopslagna spårraden: ' + delFel.message);
      r.hyttspar.sammanslagna++; r.hyttspar.flyttade++;
    } else {
      const { data: upd, error: updFel } = await db.from('hyttspar').update({ objekt_id: till.id }).eq('id', s.id).select('id');
      if (updFel || !upd || upd.length !== 1) return fel(r, 'Kunde inte flytta hyttspåret' + (updFel ? ': ' + updFel.message : ' — raden träffades inte'));
      r.hyttspar.flyttade++;
    }
  }

  // 2b. Övriga tabeller.
  for (const [tabell, kol] of FLYTTA_TABELLER) {
    const { data: upd, error: updFel } = await db.from(tabell).update({ [kol]: till.id }).eq(kol, fran.id).select(kol);
    if (updFel) {
      if (saknasTabell(updFel)) { if (!r.saknas.includes(tabell)) r.saknas.push(tabell); continue; }
      if (updFel.code === '23505') {
        if (BLOCKERANDE_TABELLER.has(tabell)) return fel(r, `${tabell}: Vida-objektet har redan en rad som krockar med jobbets — slå ihop dem för hand. Inget raderades.`);
        r.krockar.push(`${tabell}.${kol}`); continue;
      }
      return fel(r, `${tabell}: ${updFel.message}`);
    }
    if (upd && upd.length > 0) r.flyttat[`${tabell}.${kol}`] = upd.length;
  }

  // 2c. Objektets egna fält på Vida-objektet.
  const patch: Record<string, unknown> = {};
  for (const f of TILLDELNINGSFALT) if (finns(fran[f]) && !finns(till[f])) { patch[f] = fran[f]; r.tilldelning.push(f); }
  if (fran.status === 'pagaende' && till.status === 'planerad') {
    patch.status = 'pagaende';
    patch.pagaende_startad_timestamp = fran.pagaende_startad_timestamp ?? nu.toISOString();
    r.statusPagaende = true;
  }
  const jobbNamn = `${fran.vo_nummer}${fran.namn ? ' ' + fran.namn : ''}`;
  for (const f of ['anteckningar', 'info_anteckningar'] as const) {
    const ny = sammanfogaAnteckning(till[f], fran[f], jobbNamn);
    if (finns(fran[f]) && ny !== (till[f] ?? null)) { patch[f] = ny; r.anteckningarSammanfogade = true; }
  }
  if (!finns(till.dim_objekt_id) && finns(fran.dim_objekt_id)) patch.dim_objekt_id = fran.dim_objekt_id;
  if (Object.keys(patch).length > 0) {
    const { data: upd, error: updFel } = await db.from('objekt').update(patch).eq('id', till.id).select('id');
    if (updFel || !upd || upd.length !== 1) return fel(r, 'Kunde inte föra över jobbets uppgifter till Vida-objektet' + (updFel ? ': ' + updFel.message : ' — raden träffades inte'));
  }
  // GROT-jobb som hörde till detta jobb följer med till Vida-objektet.
  {
    const { error: grotFel } = await db.from('objekt').update({ hor_till_objekt_id: till.id }).eq('hor_till_objekt_id', fran.id);
    if (grotFel) return fel(r, 'Kunde inte flytta GROT-jobb som hör till jobbet: ' + grotFel.message);
  }
  // Maskindatans VO: filerna som kom in med P-numret hör nu till Vidas VO (importens VO-koppling går på dim_objekt.vo_nummer).
  {
    const { data: upd, error: dimFel } = await db.from('dim_objekt').update({ vo_nummer: till.vo_nummer }).eq('vo_nummer', fran.vo_nummer).select('objekt_id');
    if (dimFel) return fel(r, 'Kunde inte flytta maskindatans VO-nummer: ' + dimFel.message);
    r.dimUppdaterade = upd?.length ?? 0;
  }

  // ── 3. KONTROLLERA att inget hänger kvar på jobbet (läst tillbaka) ─────────────────────────────
  {
    const { data: kvarSpar, error: kvarFel } = await db.from('hyttspar').select('id').eq('objekt_id', fran.id);
    if (kvarFel) return fel(r, 'Kunde inte kontrollera hyttspåren: ' + kvarFel.message);
    if ((kvarSpar || []).length > 0) return fel(r, `${kvarSpar.length} hyttspår-rader hänger kvar på jobbet — P-objektet raderades INTE`);
  }
  for (const [tabell, kol] of FLYTTA_TABELLER) {
    if (r.saknas.includes(tabell) || r.krockar.includes(`${tabell}.${kol}`)) continue;
    const { data: kvar, error: kvarFel } = await db.from(tabell).select(kol).eq(kol, fran.id).limit(1);
    if (kvarFel) { if (saknasTabell(kvarFel)) continue; return fel(r, `${tabell}: kunde inte kontrolleras: ${kvarFel.message}`); }
    if ((kvar || []).length > 0) return fel(r, `${tabell} har rader kvar på jobbet — P-objektet raderades INTE`);
  }

  // ── 4. RADERA P-objektet — sist ──────────────────────────────────────────────────────────────
  const { data: borta, error: delFel } = await db.from('objekt').delete().eq('id', fran.id).select('id');
  if (delFel) return fel(r, 'Allt flyttades men jobbet kunde inte tas bort: ' + delFel.message);
  if (!borta || borta.length !== 1) return fel(r, 'Allt flyttades men jobbet kunde inte tas bort (raden träffades inte)');
  r.raderat = true;
  r.ok = true;
  return r;
}
