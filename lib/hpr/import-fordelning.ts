/**
 * import-fordelning.ts — DELAD importorkestrering för fördelningsuppföljningen.
 *
 * EN källa för importlogiken: både /api/hpr-import (drag-drop, Vercel) och det
 * lokala scriptet scripts/import_fordelning.ts (driftens timflöde) anropar
 * importeraHpr(). Ingen kopia av logiken — samma hash-dedupe, upsert av
 * produkter/celler/stockar, DB-snapshot ur HELA objektet, EndDate-detektering
 * och avbryt()-rollback på båda ställena.
 *
 * Skillnaden mellan anroparna hålls i opts:
 *  - cleanup(): route:n städar sin Storage-staging (incoming/); scriptet läser
 *    en lokal fil och har inget att städa (no-op).
 *  - rawCopyGzip: scriptet gzippar den permanenta rådatakopian (~19:1) så den
 *    ryms under Supabase Storages gräns; route:ns drag-drop behåller okomprimerat.
 */
import { createHash } from "crypto";
import { gzipSync } from "zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHpr, type HprValidation } from "./hpr-parser";
import { computeDistribution } from "./fordelning";
import { hamtaObjektData } from "./objekt-data";

export interface ImportOpts {
  sourceName: string;
  skipRawCopy?: boolean;
  archiveRef?: string | null;
  rawCopyGzip?: boolean;
  /** Städa ev. staging (route:ns incoming/-fil). Anropas i alla utgångar. */
  cleanup?: () => Promise<void>;
}

export interface ImportResult {
  httpStatus: number;
  body: any;
}

/**
 * Maskin-id för skopning av object_key: BaseMachineManufacturerID
 * (= serienumret PONS20SDJAA270231). Parsern exponerar bara MachineKey (GUID)
 * och får inte ändras, så fältet läses defensivt ur rå-XML. Fallback: GUID:en.
 */
export function detectMachineId(xml: string, fallback: string | null): string | null {
  const m = xml.match(/<BaseMachineManufacturerID>([^<]+)<\/BaseMachineManufacturerID>/);
  return m?.[1]?.trim() || fallback;
}

/**
 * Defensiv EndDate-detektion ur ObjectDefinition-blocket. Saknas fältet (eller
 * är odaterbart) → null, objektet lämnas 'active'.
 */
export function detectEndDate(xml: string): string | null {
  const start = xml.indexOf("<ObjectDefinition");
  if (start === -1) return null;
  const end = xml.indexOf("</ObjectDefinition>", start);
  if (end === -1) return null;
  const block = xml.slice(start, end);
  const m = block.match(/<EndDate[^>]*>([^<]+)<\/EndDate>/);
  if (!m) return null;
  const d = new Date(m[1].trim());
  if (isNaN(d.getTime())) {
    console.warn(`hpr-import: EndDate hittad men odaterbar: "${m[1].trim()}" — lämnar objektet active`);
    return null;
  }
  return m[1].trim();
}

/**
 * Importera en .hpr (originalbytes) till fördelningsuppföljningen. Returnerar
 * {httpStatus, body} exakt som route:n svarade tidigare, så drag-drop-svaren
 * är oförändrade. supabase = service-role-klient (bypassar RLS).
 */
export async function importeraHpr(
  supabase: SupabaseClient,
  buf: Buffer,
  opts: ImportOpts
): Promise<ImportResult> {
  const cleanup = opts.cleanup ?? (async () => {});
  const hash = createHash("sha256").update(buf).digest("hex");

  // hpr_files-raden skrivs innan stockarna. Kraschar en stock-batch skulle
  // filhashen annars ligga kvar och få en OMKÖRNING att svara "duplicate" —
  // en halvimporterad fil som ser komplett ut. Varje felutgång går via avbryt(),
  // som tar bort filraden så importen kan köras om. Redan skrivna stockar lämnas
  // kvar (giltiga upsertade rader); source_file_id nollas bara för FK.
  let fileRowId: string | null = null;
  const avbryt = async (body: any, httpStatus: number): Promise<ImportResult> => {
    await cleanup();
    if (fileRowId) {
      await supabase.from("logs").update({ source_file_id: null }).eq("source_file_id", fileRowId);
      const { error } = await supabase.from("hpr_files").delete().eq("id", fileRowId);
      if (error) console.error(`hpr-import: KUNDE INTE rulla tillbaka filrad ${fileRowId} — ` +
        `omkörning kommer svara "duplicate" trots ofullständig import: ${error.message}`);
    }
    return { httpStatus, body };
  };

  // 1. Exakt samma fil igen? Klart, ingen åtgärd.
  const { data: existing } = await supabase
    .from("hpr_files").select("id").eq("file_hash", hash).maybeSingle();
  if (existing) {
    await cleanup();
    return { httpStatus: 200, body: { status: "duplicate" } };
  }

  // 2. Parsa + validera. Fel = importera INTE tyst — visa varför.
  const parsed = parseHpr(buf);
  if (!parsed.validation.ok) {
    return avbryt({ status: "validation_failed", validation: parsed.validation }, 422);
  }
  const xmlText = buf.toString("utf8");
  const rawObjectKey = parsed.fileMeta.objectKey;
  const machineId = detectMachineId(xmlText, parsed.fileMeta.machineKey);
  if (!rawObjectKey || !machineId) {
    return avbryt(
      {
        status: "validation_failed",
        validation: { ...parsed.validation, errors: [`${!rawObjectKey ? "ObjectKey" : "Maskin-id (BaseMachineManufacturerID/MachineKey)"} saknas i filen`] },
      },
      422
    );
  }
  // Maskinskopad nyckel — ObjectKey är en maskin-lokal räknare.
  const objectKey = `${machineId}:${rawObjectKey}`;

  const endDate = detectEndDate(xmlText);
  if (!endDate) console.log(`hpr-import: ingen EndDate i ${opts.sourceName} — objektet lämnas/förblir active`);

  // 3. Rådatan till Storage — alltid i löpande drift. Vid skip_raw_copy pekar
  //    storage_path i stället ut OneDrive-arkivet. rawCopyGzip → gzippa kopian.
  let storagePath: string;
  if (opts.skipRawCopy) {
    storagePath = `onedrive:Behandlade/${machineId}/HPR/${opts.archiveRef ?? `${hash}.hpr`}`;
  } else {
    const gz = !!opts.rawCopyGzip;
    storagePath = `hpr/${machineId}/${rawObjectKey}/${hash}.hpr${gz ? ".gz" : ""}`;
    const { error: storageErr } = await supabase.storage.from("raw-files").upload(
      storagePath, gz ? gzipSync(buf) : buf,
      { contentType: gz ? "application/gzip" : "application/xml", upsert: true }
    );
    if (storageErr) {
      return avbryt({ error: `Kunde inte spara rådatafilen: ${storageErr.message}` }, 500);
    }
  }

  // 4. Objekt + fil + produkter + matrisceller (upsert — kumulativa filer)
  const { data: prevObj } = await supabase
    .from("harvest_objects").select("status").eq("object_key", objectKey).maybeSingle();
  const reopened = prevObj?.status === "completed" && !endDate;
  if (reopened) console.log(`hpr-import: ny fil på completed objekt ${objectKey} — öppnar igen`);

  await supabase.from("harvest_objects").upsert({
    object_key: objectKey,
    object_name: parsed.fileMeta.objectName,
    last_file_at: parsed.fileMeta.creationDate,
    status: endDate ? "completed" : "active",
    completed_at: endDate ?? null,
  }, { onConflict: "object_key", ignoreDuplicates: false });

  const { data: fileRow, error: fileErr } = await supabase.from("hpr_files").insert({
    file_hash: hash, storage_path: storagePath, object_key: objectKey,
    object_name: parsed.fileMeta.objectName, machine_key: machineId,
    creation_date: parsed.fileMeta.creationDate,
    log_count: parsed.validation.logCount, validation: parsed.validation,
  }).select("id").single();
  fileRowId = fileRow?.id ?? null;
  if (fileErr) {
    return avbryt({ error: `Kunde inte registrera filen: ${fileErr.message}` }, 500);
  }

  for (const p of parsed.products.filter((p) => p.classified)) {
    const { data: prodRow, error: prodErr } = await supabase.from("products").upsert({
      object_key: objectKey, product_key: p.productKey, name: p.name,
      product_group: p.group, species_group_key: p.speciesGroupKey,
      dia_class_category: p.diaClassCategory, diameter_under_bark: p.diameterUnderBark,
      dia_limits: p.diaLimits, dia_max: p.diaMax,
      len_limits: p.lenLimits, len_max: p.lenMax,
      distribution_allowed: p.distributionAllowed,
      distribution_category: p.distributionCategory, max_deviation: p.maxDeviation,
    }, { onConflict: "object_key,product_key" }).select("id").single();
    if (prodErr) {
      return avbryt({ error: `Kunde inte spara produkt ${p.productKey}: ${prodErr.message}` }, 500);
    }
    if (prodRow && p.cells.length) {
      const { error: cellErr } = await supabase.from("matrix_cells").upsert(
        p.cells.map((c) => ({
          product_id: prodRow.id, dia_lower: c.diaLower, len_lower: c.lenLower,
          price: c.price, distribution: c.distribution,
          limitation: c.limitation, bucking_criteria: c.buckingCriteria,
        })),
        { onConflict: "product_id,dia_lower,len_lower" }
      );
      if (cellErr) {
        return avbryt({ error: `Kunde inte spara matrisceller för ${p.productKey}: ${cellErr.message}` }, 500);
      }
    }
  }

  // 5. Stockar — upsert i batchar på PK (object_key, stem_key, log_key).
  const rows = parsed.logs.map((l) => ({
    object_key: objectKey, stem_key: l.stemKey, log_key: l.logKey,
    product_key: l.productKey, harvest_date: l.harvestDate,
    length_cm: l.lengthCm, dia_top_ob_mm: l.diaTopObMm, dia_top_ub_mm: l.diaTopUbMm,
    vol_price_m3: l.volPriceM3, vol_sob_m3: l.volSobM3, vol_sub_m3: l.volSubM3,
    cutting_reason: l.cuttingReason, source_file_id: fileRow?.id,
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error: logErr } = await supabase.from("logs").upsert(rows.slice(i, i + 1000), {
      onConflict: "object_key,stem_key,log_key",
    });
    if (logErr) {
      return avbryt({ error: `Kunde inte spara stockar (batch ${i / 1000 + 1}): ${logErr.message}` }, 500);
    }
  }

  // 6. Snapshot ur DATABASENS samlade stockar för HELA objektet (ej filens
  //    delmängd — delfiler efter 4000-taket ger annars falsk snapshot).
  //    Stämplas med filens CreationDate; is_final = true när filen bär EndDate.
  const objektData = await hamtaObjektData(supabase, objectKey);
  const summaries = objektData.produkter
    .map((p) => computeDistribution(p, objektData.stockar))
    .filter((d) => d != null)
    .map((d) => ({
      object_key: objectKey, product_key: d!.total.productKey,
      computed_at: parsed.fileMeta.creationDate ?? undefined,
      is_final: !!endDate,
      grade_total_pct: d!.total.gradePct,
      grade_automatic_pct: d!.automaticOnly.gradePct,
      forced_cut_share_pct: d!.forcedCutSharePct,
      log_count: d!.total.logCount, total_volume_m3: d!.total.totalVolumeM3,
    }));
  if (summaries.length) {
    const { error: snapErr } = await supabase.from("distribution_snapshots").insert(summaries);
    if (snapErr) {
      return avbryt({ error: `Kunde inte spara snapshot: ${snapErr.message}` }, 500);
    }
  }

  await cleanup();
  return {
    httpStatus: 200,
    body: {
      status: "imported",
      objectKey,
      objectStatus: endDate ? "completed" : "active",
      reopened,
      validation: parsed.validation,
      summaries,
    },
  };
}
