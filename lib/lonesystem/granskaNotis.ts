/**
 * Lönenotiserna (Admin → Lön, Martin 2026-10-21): förarens godkännande av månaden styr Fortnox-exporten, så föraren ska få veta när det är dags.
 *
 *  lon_granska     den 1:a kl 18 (svensk tid) till alla förare med lönerader, och knappen "Påminn" på förarkortet (samma notis, direkt)
 *                  "Granska din september – lönen skickas när du godkänt"
 *  lon_paminnelse  två dagar senare (den 3:e kl 18) till dem som ännu inte godkänt
 *                  "Du har inte godkänt din september än – lönen skickas när du godkänt"
 *  lon_andrad      när en dag ändrats i en godkänd månad (köas av databasen, migration 20261021181920)
 *                  "Din september ändrades efter ditt godkännande – granska och godkänn igen"
 *
 * Alla tre länkar till Lön-fliken i Arbetsrapport på just den månaden (/arbetsrapport?steg=lon&manad=2026-09). Aldrig till företagsledare (lönen ligger utanför appen).
 * Texten byggs FÄRSKT vid utskick, ur månaden som den ser ut just då: redan godkänd eller skickad → ingenting skickas; ett LÄSFEL lämnar raden
 * oskickad så nästa cron försöker igen; köat för mer än 24 timmar sedan → hoppas över (en hög som väntat på release skickas aldrig på en gång).
 * Raderna köas med skickas_at = 'infinity' (som ledighetsnotiserna): den GAMLA flushen på production skickar okända typer som en generisk
 * "Notis" + rå JSON, men väljer aldrig rader med skickas_at i framtiden. Den nya flushen tar typerna oavsett (flushUrval, lib/ledighet/notis).
 *
 * Ren modul (ingen Supabase-import): klienten och läsningarna skickas in, så reglerna testas utan nätverk.
 */
import { manadNamn } from "./lonemanad";

export const LON_GRANSKA = "lon_granska";
export const LON_PAMINNELSE = "lon_paminnelse";
export const LON_ANDRAD = "lon_andrad";
export const LON_NOTIS_TYPER = [LON_GRANSKA, LON_PAMINNELSE, LON_ANDRAD] as const;

export const arLonNotis = (typ: unknown): typ is (typeof LON_NOTIS_TYPER)[number] => typ === LON_GRANSKA || typ === LON_PAMINNELSE || typ === LON_ANDRAD;

export const LON_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
/** Lön-fliken i Arbetsrapport, på just den månaden (djuplänken läses i Arbetsrapport.tsx). */
export const lonLank = (arbetsmanad: string) => `/arbetsrapport?steg=lon&manad=${arbetsmanad}`;

const ARBETSMANAD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Det en notis behöver veta om månaden just nu. */
export type LonNotisRad = {
  /** Föraren har godkänt arbetsmånaden (loneunderlag.status). */
  godkand: boolean;
  /** Redan skickad till Fortnox (fortnox_export_logg, löneperioden). */
  skickad: boolean;
  foretagsledare: boolean;
};
export type LasLonRad = (medarbetareId: string, arbetsmanad: string) => Promise<{ rad: LonNotisRad | null; fel?: string }>;

export type LonNotisUtfall =
  | { typ: "skicka"; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: "hoppa_over"; orsak: string }
  | { typ: "uppskjut" };

const manadOrd = (arbetsmanad: string) => manadNamn(arbetsmanad, Number(arbetsmanad.slice(0, 4))).toLowerCase();

export async function byggLonNotis(
  n: { typ: string; mottagare_id?: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  lasRad: LasLonRad,
  nu: number = Date.now(),
): Promise<LonNotisUtfall> {
  const arbetsmanad = n.payload?.arbetsmanad;
  if (typeof arbetsmanad !== "string" || !ARBETSMANAD.test(arbetsmanad)) return { typ: "hoppa_over", orsak: "Ej skickad — notisen saknar en giltig arbetsmånad" };

  // För gammal? Kollas FÖRE läsningen: en gammal rad ska aldrig skjutas upp av ett läsfel (och aldrig skickas).
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > LON_MAX_ALDER_MS) return { typ: "hoppa_over", orsak: "Ej skickad — för gammal (köad för mer än 24 timmar sedan)" };

  const { rad, fel } = await lasRad(String(n.mottagare_id ?? ""), arbetsmanad);
  if (fel) return { typ: "uppskjut" };
  if (!rad) return { typ: "hoppa_over", orsak: "Ej skickad — mottagaren finns inte kvar" };
  if (rad.foretagsledare) return { typ: "hoppa_over", orsak: "Ej skickad — företagsledare får inga lönenotiser" };
  if (rad.skickad) return { typ: "hoppa_over", orsak: "Ej skickad — månaden är redan skickad till Fortnox" };
  if (rad.godkand) return { typ: "hoppa_over", orsak: "Ej skickad — månaden är redan godkänd" };

  const manad = manadOrd(arbetsmanad);
  const body =
    n.typ === LON_PAMINNELSE ? `Du har inte godkänt din ${manad} än – lönen skickas när du godkänt`
    : n.typ === LON_ANDRAD ? `Din ${manad} ändrades efter ditt godkännande – granska och godkänn igen`
    : `Granska din ${manad} – lönen skickas när du godkänt`;
  return { typ: "skicka", meddelande: { title: "Lön", body, url: lonLank(arbetsmanad), tag: `lon-${n.typ}-${arbetsmanad}-${n.mottagare_id ?? ""}` } };
}

// ── Schemat ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type LonSchemaPost = { typ: typeof LON_GRANSKA | typeof LON_PAMINNELSE; arbetsmanad: string; dedup: string };

/** Datum och timme i Stockholm (sommar- och vintertid), aldrig UTC: kvällen den 1:a efter midnatt är redan den 2:a. */
function stockholm(nu: Date): { ar: number; manad: number; dag: number; timme: number } {
  const delar = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" }).formatToParts(nu);
  const v = (t: string) => Number(delar.find(d => d.type === t)?.value);
  return { ar: v("year"), manad: v("month"), dag: v("day"), timme: v("hour") };
}

/**
 * Vilka notiser gäller just nu? Den 1:a kl 18 → granska, den 3:e kl 18 → påminnelse, båda för FÖREGÅENDE månad. Fönstret är kl 18–24: cronen går
 * varje timme och databasens dedup ser till att det köas en gång, så en körning som missar kl 18 tar det nästa timme.
 */
export function lonNotisSchema(nu: Date): LonSchemaPost[] {
  const s = stockholm(nu);
  if (s.timme < 18) return [];
  const forra = s.manad === 1 ? { ar: s.ar - 1, manad: 12 } : { ar: s.ar, manad: s.manad - 1 };
  const arbetsmanad = `${forra.ar}-${String(forra.manad).padStart(2, "0")}`;
  if (s.dag === 1) return [{ typ: LON_GRANSKA, arbetsmanad, dedup: `granska:${arbetsmanad}` }];
  if (s.dag === 3) return [{ typ: LON_PAMINNELSE, arbetsmanad, dedup: `paminn:${arbetsmanad}` }];
  return [];
}

// ── Köaren ──────────────────────────────────────────────────────────────────────────────────────────────────────

const arbetsmanadTillLoneperiod = (a: string) => {
  const [å, m] = a.split("-").map(Number);
  const d = new Date(Date.UTC(å, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

type UnderlagsRad = { medarbetare_id: string; rader: unknown[]; status: string; godkannande?: string; foretagsledare?: boolean };

export interface LonKoRapport {
  ok: boolean;
  dry: boolean;
  schema: LonSchemaPost[];
  kandidater: { typ: string; arbetsmanad: string; mottagare: string[] }[];
  koade: number;
  fel?: string;
}

const UPSERT = { onConflict: "typ,mottagare_id,dedup_nyckel", ignoreDuplicates: true } as const;

export async function koaLonNotiser(
  sb: any,
  opt: { nu: Date; dry: boolean; /** Underlaget för LÖNEperioden (beraknaLoneunderlag(...).resultat). */ hamtaUnderlag: (loneperiod: string) => Promise<UnderlagsRad[]> },
): Promise<LonKoRapport> {
  const schema = lonNotisSchema(opt.nu);
  const rapport: LonKoRapport = { ok: true, dry: opt.dry, schema, kandidater: [], koade: 0 };
  if (schema.length === 0) return rapport;
  try {
    for (const post of schema) {
      const underlag = await opt.hamtaUnderlag(arbetsmanadTillLoneperiod(post.arbetsmanad));
      // "Förare med lönerader": något att skicka, inte företagsledare, inte redan skickad. Påminnelsen går bara till dem som inte godkänt.
      const mottagare = underlag
        .filter(r => r.foretagsledare !== true && r.status !== "skickat" && (r.rader?.length ?? 0) > 0)
        .filter(r => post.typ === LON_GRANSKA || r.godkannande !== "godkand")
        .map(r => r.medarbetare_id);
      rapport.kandidater.push({ typ: post.typ, arbetsmanad: post.arbetsmanad, mottagare });
      if (opt.dry || mottagare.length === 0) continue;
      const rader = mottagare.map(id => ({ mottagare_id: id, typ: post.typ, payload: { arbetsmanad: post.arbetsmanad }, skickas_at: "infinity", dedup_nyckel: post.dedup }));
      const ins = await sb.from("notis_kö").upsert(rader, UPSERT).select("mottagare_id");
      if (ins.error) return { ...rapport, ok: false, fel: `Kunde inte köa lönenotiserna: ${ins.error.message}` };
      rapport.koade += (ins.data || []).length;
    }
    return rapport;
  } catch (e: any) {
    return { ...rapport, ok: false, fel: `Kunde inte läsa löneunderlaget för notiserna: ${e?.message || String(e)}` };
  }
}

/** Tiominutersfönster: en andra tryckning på Påminn inom fönstret köar ingen ny notis (databasens dedup släpper den). */
export const manuellDedup = (arbetsmanad: string, nu: Date) => `manuell:${arbetsmanad}:${Math.floor(nu.getTime() / 600_000)}`;

export async function koaManuellPaminnelse(
  sb: any,
  opt: { medarbetareId: string; arbetsmanad: string; nu: Date; lasRad: LasLonRad },
): Promise<{ ok: boolean; koad: boolean; fel?: string }> {
  if (!opt.medarbetareId) return { ok: false, koad: false, fel: "Förare saknas." };
  if (!ARBETSMANAD.test(opt.arbetsmanad)) return { ok: false, koad: false, fel: "Ogiltig månad." };
  const { rad, fel } = await opt.lasRad(opt.medarbetareId, opt.arbetsmanad);
  if (fel) return { ok: false, koad: false, fel: `Kunde inte läsa månaden: ${fel}` };
  if (!rad) return { ok: false, koad: false, fel: "Föraren finns inte." };
  if (rad.foretagsledare) return { ok: false, koad: false, fel: "Företagsledare får inga lönenotiser." };
  if (rad.skickad) return { ok: false, koad: false, fel: "Månaden är redan skickad till Fortnox." };
  if (rad.godkand) return { ok: false, koad: false, fel: "Föraren har redan godkänt månaden." };
  const ins = await sb.from("notis_kö").upsert(
    [{ mottagare_id: opt.medarbetareId, typ: LON_GRANSKA, payload: { arbetsmanad: opt.arbetsmanad, manuell: true }, skickas_at: "infinity", dedup_nyckel: manuellDedup(opt.arbetsmanad, opt.nu) }],
    UPSERT,
  ).select("mottagare_id");
  if (ins.error) return { ok: false, koad: false, fel: `Kunde inte köa påminnelsen: ${ins.error.message}` };
  return { ok: true, koad: (ins.data || []).length > 0 };
}

/** Läsaren mot databasen, delad av flushen (färsk text) och Påminn-knappen (kontroll före köandet). */
export function lasLonRadMotDb(sb: any): LasLonRad {
  return async (medarbetareId, arbetsmanad) => {
    const [lu, med, logg] = await Promise.all([
      sb.from("loneunderlag").select("status").eq("medarbetare_id", medarbetareId).eq("period", arbetsmanad).maybeSingle(),
      sb.from("medarbetare").select("id, foretagsledare").eq("id", medarbetareId).maybeSingle(),
      sb.from("fortnox_export_logg").select("status").eq("medarbetare_id", medarbetareId).eq("period", arbetsmanadTillLoneperiod(arbetsmanad)).maybeSingle(),
    ]);
    const fel = lu.error?.message || med.error?.message || logg.error?.message;
    if (fel) return { rad: null, fel };
    if (!med.data) return { rad: null };
    const status = lu.data?.status;
    return { rad: { godkand: status === "godkand_av_forare" || status === "inskickat", skickad: logg.data?.status === "skickat", foretagsledare: med.data.foretagsledare === true } };
  };
}
