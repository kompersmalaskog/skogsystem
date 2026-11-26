// ─────────────────────────────────────────────────────────────
// Påminnelsen "Gör ditt ATK-val" (Admin › Lön › ATK-val › Påminn alla, Martin 2026-11-25).
//
// Samma väg som lönenotiserna: notis_kö → /api/notis/flush → web-push, köad med skickas_at = 'infinity' så den gamla
// flushen på production aldrig skickar en okänd typ. Texten byggs FÄRSKT vid utskick: har föraren hunnit välja, har
// valet stängt eller är raden köad för mer än 24 h sedan skickas ingenting; ett läsfel skjuter upp.
// Länken öppnar Min tid › Saldon i Arbetsrapport, där valet görs.
// ─────────────────────────────────────────────────────────────

import { atkLage } from "./atkVy";

export const ATK_PAMINN = "atk_paminn";
export const arAtkNotis = (typ: unknown): typ is typeof ATK_PAMINN => typ === ATK_PAMINN;
export const ATK_MAX_ALDER_MS = 24 * 60 * 60 * 1000;
export const ATK_LANK = "/arbetsrapport?steg=saldon";

const UPSERT = { onConflict: "typ,mottagare_id,dedup_nyckel", ignoreDuplicates: true } as const;

export type AtkNotisRad = { harValt: boolean; foretagsledare: boolean };
export type LasAtkRad = (medarbetareId: string, period: string) => Promise<{ rad: AtkNotisRad | null; fel?: string }>;

export type AtkNotisUtfall =
  | { typ: "skicka"; meddelande: { title: string; body: string; url: string; tag: string } }
  | { typ: "hoppa_over"; orsak: string }
  | { typ: "uppskjut" };

export async function byggAtkNotis(
  n: { mottagare_id?: string; payload?: Record<string, unknown> | null; skapad_at?: string | null },
  lasRad: LasAtkRad,
  nu: number = Date.now(),
): Promise<AtkNotisUtfall> {
  const period = n.payload?.period;
  if (typeof period !== "string" || !/^\d{4}$/.test(period)) return { typ: "hoppa_over", orsak: "Ej skickad — notisen saknar ett giltigt år" };
  const koad = n.skapad_at ? Date.parse(n.skapad_at) : NaN;
  if (Number.isFinite(koad) && nu - koad > ATK_MAX_ALDER_MS) return { typ: "hoppa_over", orsak: "Ej skickad — för gammal (köad för mer än 24 timmar sedan)" };
  if (atkLage(Number(period), new Date(nu)) !== "oppen") return { typ: "hoppa_over", orsak: "Ej skickad — ATK-valet är inte öppet" };
  const { rad, fel } = await lasRad(String(n.mottagare_id ?? ""), period);
  if (fel) return { typ: "uppskjut" };
  if (!rad) return { typ: "hoppa_over", orsak: "Ej skickad — mottagaren finns inte kvar" };
  if (rad.foretagsledare) return { typ: "hoppa_over", orsak: "Ej skickad — företagsledare gör inget ATK-val" };
  if (rad.harValt) return { typ: "hoppa_over", orsak: "Ej skickad — föraren har redan valt" };
  return {
    typ: "skicka",
    meddelande: { title: "ATK-val", body: "Välj pengar, ledig tid eller pension senast 15 maj", url: ATK_LANK, tag: `atk-${period}-${n.mottagare_id ?? ""}` },
  };
}

/** Tiominutersfönster: en andra tryckning inom fönstret köar inga nya notiser. */
export const atkDedup = (period: string, nu: Date) => `atk:${period}:${Math.floor(nu.getTime() / 600_000)}`;

/** Köar EN påminnelse per förare som inte valt (ej företagsledare, ej maskinkonto). Kollar valet och läget före köandet. */
export async function koaAtkPaminnelse(sb: any, opt: { period: string; nu: Date }): Promise<{ ok: boolean; koade: number; fel?: string }> {
  if (!/^\d{4}$/.test(opt.period)) return { ok: false, koade: 0, fel: "Ogiltigt år." };
  if (atkLage(Number(opt.period), opt.nu) !== "oppen") return { ok: false, koade: 0, fel: "ATK-valet är inte öppet. Det går att påminna 1–15 maj." };
  const [med, val] = await Promise.all([
    sb.from("medarbetare").select("id, roll, foretagsledare, aktiv"),
    sb.from("atk_val").select("medarbetare_id").eq("period", opt.period),
  ]);
  const fel = med.error?.message || val.error?.message;
  if (fel) return { ok: false, koade: 0, fel: `Kunde inte läsa förarna: ${fel}` };
  const harValt = new Set((val.data || []).map((v: any) => v.medarbetare_id));
  const mottagare = (med.data || []).filter((m: any) => m.aktiv !== false && m.roll !== "maskin" && m.foretagsledare !== true && !harValt.has(m.id));
  if (mottagare.length === 0) return { ok: true, koade: 0 };
  const dedup = atkDedup(opt.period, opt.nu);
  const ins = await sb.from("notis_kö").upsert(
    mottagare.map((m: any) => ({ mottagare_id: m.id, typ: ATK_PAMINN, payload: { period: opt.period }, skickas_at: "infinity", dedup_nyckel: dedup })),
    UPSERT,
  ).select("mottagare_id");
  if (ins.error) return { ok: false, koade: 0, fel: `Kunde inte köa påminnelsen: ${ins.error.message}` };
  return { ok: true, koade: (ins.data || []).length };
}

/** Läsaren mot databasen för flushen (färsk text vid utskick). */
export function lasAtkRadMotDb(sb: any): LasAtkRad {
  return async (medarbetareId, period) => {
    const [med, val] = await Promise.all([
      sb.from("medarbetare").select("id, foretagsledare").eq("id", medarbetareId).maybeSingle(),
      sb.from("atk_val").select("id").eq("medarbetare_id", medarbetareId).eq("period", period).maybeSingle(),
    ]);
    const fel = med.error?.message || val.error?.message;
    if (fel) return { rad: null, fel };
    if (!med.data) return { rad: null };
    return { rad: { harValt: !!val.data, foretagsledare: med.data.foretagsledare === true } };
  };
}
