import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EN diametermätpunkt = en jämförelse maskin vs operatör.
 *
 * TVÅ KÄLLOR, olika punkter på stocken — ingen dubbelräkning:
 *   - 'matpunkt': ControlLogDiameter längs stocken (position_cm 100/130/200/
 *     300/400/500), egna rader i `detalj_kontroll_stock_matpunkt` med
 *     UNIQUE(detalj_kontroll_stock_id, position_cm).
 *   - 'topp': toppdiametern vid KAPSNITTET (LogDiameter "Top ob"), kolumnerna
 *     maskin_toppdia_mm/operator_toppdia_mm på själva stockraden.
 * Verifierat mot prod 2026-07-22: 0 av 4451 mätpunkter ligger vid eller efter
 * stockens slut, så toppen finns inte som mätpunktsrad.
 *
 * VARFÖR TOPPEN RÄKNAS MED: den klavas av operatören men ströks tidigare ur
 * all statistik — det kastade bort ~30 % av underlaget (PONSSE 741→1013 mått
 * i 90-dagarsfönstret) utan att svaret ändrades (syst +0,30→+0,26). Vidas
 * avtal: "Alla mätpunkter skall kunna användas för kalibrering."
 *
 * KRITISKT — OMÄTT ≠ AVVIKELSE: operatörsvärde NULL/0 betyder aldrig
 * kontrollmätt, inte "noll avvikelse", och exkluderas INNAN något räknas.
 * Filtret sitter HÄR, på ett ställe, för BÅDA källorna — så de inte kan
 * glida isär mellan de fyra rutter som räknar diameterstatistik.
 *
 * Används av: bedomning, diagnos, objekt, tradslag. INTE av trend — dess
 * driftkurva aggregerar per position_cm längs stocken, och toppen sitter vid
 * kapsnittet utan jämförbar position.
 */

/** Kolumnerna varje anropare måste selecta ur detalj_kontroll_stock. */
export const TOPPDIA_COLS = "maskin_toppdia_mm,operator_toppdia_mm";

export type DiaPunkt = {
  stockId: number;
  maskin_mm: number;
  operator_mm: number;
  avvik: number;
  kalla: "matpunkt" | "topp";
};

export type StockMedTopp = {
  id: number;
  maskin_toppdia_mm: number | null;
  operator_toppdia_mm: number | null;
};

const CHUNK = 1000;
const PAGE = 1000;

export async function hamtaDiameterPunkter(
  supabase: SupabaseClient,
  stockar: StockMedTopp[],
): Promise<{ data: DiaPunkt[]; error: { message?: string } | null }> {
  const punkter: DiaPunkt[] = [];

  // === 1) Toppdiametern — en punkt per stock, vid kapsnittet ===
  for (const s of stockar) {
    const dm = s.maskin_toppdia_mm;
    const op = s.operator_toppdia_mm;
    if (dm == null || op == null || op === 0) continue; // OMÄTT-filter
    punkter.push({ stockId: s.id, maskin_mm: dm, operator_mm: op, avvik: dm - op, kalla: "topp" });
  }

  // === 2) Mätpunkter längs stocken ===
  const ids = stockar.map((s) => s.id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    let offset = 0;
    for (;;) {
      // order på PK — utan stabil sortering kan paginering tappa/dubblera rader.
      const { data, error } = await supabase
        .from("detalj_kontroll_stock_matpunkt")
        .select("detalj_kontroll_stock_id,diameter_maskin_mm,diameter_operator_mm")
        .in("detalj_kontroll_stock_id", chunk)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) return { data: punkter, error };
      const batch = (data ?? []) as {
        detalj_kontroll_stock_id: number;
        diameter_maskin_mm: number | null;
        diameter_operator_mm: number | null;
      }[];
      for (const m of batch) {
        const dm = m.diameter_maskin_mm;
        const op = m.diameter_operator_mm;
        if (dm == null || op == null || op === 0) continue; // OMÄTT-filter
        punkter.push({
          stockId: m.detalj_kontroll_stock_id,
          maskin_mm: dm,
          operator_mm: op,
          avvik: dm - op,
          kalla: "matpunkt",
        });
      }
      if (batch.length < PAGE) break;
      offset += PAGE;
    }
  }

  return { data: punkter, error: null };
}
