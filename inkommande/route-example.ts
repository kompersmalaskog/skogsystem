/**
 * app/api/hpr-import/route.ts — exempel på importflödet.
 *
 * OBS: export const runtime = "nodejs" krävs — edge-runtime klarar inte
 * 35 MB XML i minnet. Parsning av den verkliga filen tar ~5 s.
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseHpr } from "@/lib/hpr/hpr-parser";
import { computeDistribution } from "@/lib/hpr/fordelning";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Ingen fil" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  const supabase = await createClient();

  // 1. Exakt samma fil igen? Klart, ingen åtgärd.
  const { data: existing } = await supabase
    .from("hpr_files").select("id").eq("file_hash", hash).maybeSingle();
  if (existing) return NextResponse.json({ status: "duplicate" });

  // 2. Parsa + validera. Fel = importera INTE tyst — visa varför.
  const parsed = parseHpr(buf);
  if (!parsed.validation.ok) {
    return NextResponse.json(
      { status: "validation_failed", validation: parsed.validation },
      { status: 422 }
    );
  }
  const objectKey = parsed.fileMeta.objectKey!;

  // 3. Rådatan till Storage — alltid, oavsett vad som händer sen.
  const storagePath = `hpr/${objectKey}/${hash}.hpr`;
  await supabase.storage.from("raw-files").upload(storagePath, buf, {
    contentType: "application/xml", upsert: true,
  });

  // 4. Objekt + fil + produkter + matrisceller (upsert — kumulativa filer)
  await supabase.from("harvest_objects").upsert({
    object_key: objectKey,
    object_name: parsed.fileMeta.objectName,
    last_file_at: parsed.fileMeta.creationDate,
  }, { onConflict: "object_key", ignoreDuplicates: false });

  const { data: fileRow } = await supabase.from("hpr_files").insert({
    file_hash: hash, storage_path: storagePath, object_key: objectKey,
    object_name: parsed.fileMeta.objectName, machine_key: parsed.fileMeta.machineKey,
    creation_date: parsed.fileMeta.creationDate,
    log_count: parsed.validation.logCount, validation: parsed.validation,
  }).select("id").single();

  for (const p of parsed.products.filter((p) => p.classified)) {
    const { data: prodRow } = await supabase.from("products").upsert({
      object_key: objectKey, product_key: p.productKey, name: p.name,
      product_group: p.group, species_group_key: p.speciesGroupKey,
      dia_class_category: p.diaClassCategory, diameter_under_bark: p.diameterUnderBark,
      dia_limits: p.diaLimits, dia_max: p.diaMax,
      len_limits: p.lenLimits, len_max: p.lenMax,
      distribution_allowed: p.distributionAllowed,
      distribution_category: p.distributionCategory, max_deviation: p.maxDeviation,
    }, { onConflict: "object_key,product_key" }).select("id").single();

    if (prodRow && p.cells.length) {
      await supabase.from("matrix_cells").upsert(
        p.cells.map((c) => ({
          product_id: prodRow.id, dia_lower: c.diaLower, len_lower: c.lenLower,
          price: c.price, distribution: c.distribution,
          limitation: c.limitation, bucking_criteria: c.buckingCriteria,
        })),
        { onConflict: "product_id,dia_lower,len_lower" }
      );
    }
  }

  // 5. Stockar — upsert i batchar på PK (object_key, stem_key, log_key).
  //    Nästa kumulativa fil skriver bara över samma rader.
  const rows = parsed.logs.map((l) => ({
    object_key: objectKey, stem_key: l.stemKey, log_key: l.logKey,
    product_key: l.productKey, harvest_date: l.harvestDate,
    length_cm: l.lengthCm, dia_top_ob_mm: l.diaTopObMm, dia_top_ub_mm: l.diaTopUbMm,
    vol_price_m3: l.volPriceM3, vol_sob_m3: l.volSobM3, vol_sub_m3: l.volSubM3,
    cutting_reason: l.cuttingReason, source_file_id: fileRow?.id,
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    await supabase.from("logs").upsert(rows.slice(i, i + 1000), {
      onConflict: "object_key,stem_key,log_key",
    });
  }

  // 6. Snapshot av fördelningsgraden (is_final sätts när objektet avslutas)
  const summaries = parsed.products
    .map((p) => computeDistribution(p, parsed.logs))
    .filter((d) => d != null)
    .map((d) => ({
      object_key: objectKey, product_key: d!.total.productKey,
      grade_total_pct: d!.total.gradePct,
      grade_automatic_pct: d!.automaticOnly.gradePct,
      forced_cut_share_pct: d!.forcedCutSharePct,
      log_count: d!.total.logCount, total_volume_m3: d!.total.totalVolumeM3,
    }));
  if (summaries.length)
    await supabase.from("distribution_snapshots").insert(summaries);

  return NextResponse.json({ status: "imported", summaries });
}
