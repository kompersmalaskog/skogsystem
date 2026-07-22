/**
 * POST /api/hpr-import — importera en .hpr-fil till fördelningsuppföljningen.
 *
 * Bygger på route-example.ts ur uppdraget. Anpassningar mot mallen:
 *  - Supabase-klient: projektets mönster (autentisera via @supabase/ssr-cookies,
 *    skrivningar via service-role) i stället för "@/lib/supabase/server".
 *  - Åtkomst: inloggad användare ELLER nyckel via ?key= som måste matcha
 *    env HPR_IMPORT_KEY (Vercel + .env.local). Ingen nyckel i koden.
 *  - Två body-format:
 *      multipart/form-data med "file"  — drag-drop-sidan (obs: Vercel kapar
 *        request-bodies vid ~4,5 MB, så stora filer fungerar bara lokalt)
 *      application/json {storage_path, skip_raw_copy?, source_name?} —
 *        watchdog/backfill laddar först upp filen till raw-files/incoming/
 *        (Storage har ingen 4,5 MB-gräns) och pekar hit. skip_raw_copy sätts
 *        av backfillen: originalen finns redan i OneDrive-arkivet, så den
 *        permanenta Storage-kopian hoppas över (~8 GB dubbellagring).
 *  - object_key är MASKINSKOPAD: "{maskin_id}:{ObjectKey}" där maskin_id =
 *    BaseMachineManufacturerID (serienumret, t.ex. PONS20SDJAA270231). StanForD:s
 *    ObjectKey är en maskin-lokal räknare — Hushållningssällskapet=109 på
 *    Scorpion kan kollidera med ett helt annat objekt=109 på en Rottne.
 *    Samma läxa som maskin:vo-nyckeln i gamla hpr-importen (#78).
 *  - distribution_snapshots stämplas med filens CreationDate (inte now()) —
 *    annars blir historiken falsk vid backfill av gamla filer.
 *  - Objektavslut: EndDate i ObjectDefinition detekteras defensivt ur rå-XML
 *    (parsern exponerar inte fältet och får inte ändras). Finns EndDate →
 *    completed + slutsnapshot (is_final). Ny fil utan EndDate på ett
 *    completed objekt → öppnas igen.
 *
 * runtime = "nodejs" krävs — edge-runtime klarar inte 35 MB XML i minnet.
 * Parsning av den verkliga filen tar ~5 s.
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { parseHpr } from "@/lib/hpr/hpr-parser";
import { computeDistribution } from "@/lib/hpr/fordelning";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function autentisera(): Promise<{ user: any }> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );
  const { data: { user } } = await authClient.auth.getUser();
  return { user };
}

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Defensiv EndDate-detektion ur ObjectDefinition-blocket i rå-XML.
 * EndDate är ÄNNU EJ VERIFIERAT mot en verklig slutfil — pågående objekt
 * saknar fältet. Saknas det (eller är odaterbart) returneras null och
 * objektet lämnas 'active'.
 */
/**
 * Maskin-id för skopning av object_key: BaseMachineManufacturerID
 * (= serienumret PONS20SDJAA270231 — samma maskin_id som resten av systemet).
 * Parsern exponerar bara MachineKey (en GUID) och får inte ändras, så fältet
 * läses defensivt ur rå-XML. Fallback: MachineKey-GUID:en — också stabil och
 * maskinunik, bara oläslig.
 */
function detectMachineId(xml: string, fallback: string | null): string | null {
  const m = xml.match(/<BaseMachineManufacturerID>([^<]+)<\/BaseMachineManufacturerID>/);
  return m?.[1]?.trim() || fallback;
}

function detectEndDate(xml: string): string | null {
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

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const envKey = process.env.HPR_IMPORT_KEY;
  if (!(envKey && key === envKey)) {
    const { user } = await autentisera();
    if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });
  }

  const supabase = supaService();

  // Två vägar in: multipart (drag-drop) eller JSON {storage_path} (watchdog/backfill).
  let buf: Buffer;
  let sourceName: string;
  let stagingPath: string | null = null;
  // Backfill av redan arkiverade filer sätter skip_raw_copy: originalen ligger
  // kvar i OneDrive (Behandlade/), så en permanent kopia i Storage vore ~8 GB
  // dubbellagring utan värde. Staging-filen städas som vanligt. Löpande drift
  // sätter INTE flaggan — där är Storage-kopian enda arkivet av rådatan.
  let skipRawCopy = false;
  let archiveRef: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const storagePath: unknown = body?.storage_path;
    if (typeof storagePath !== "string" || !storagePath.startsWith("incoming/")) {
      return NextResponse.json({ error: "storage_path saknas eller ligger utanför incoming/" }, { status: 400 });
    }
    skipRawCopy = body?.skip_raw_copy === true;
    if (typeof body?.source_name === "string") archiveRef = body.source_name;
    const { data: blob, error: dlErr } = await supabase.storage.from("raw-files").download(storagePath);
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: `Kunde inte hämta ${storagePath} ur raw-files: ${dlErr?.message ?? "tom"}` },
        { status: 404 }
      );
    }
    buf = Buffer.from(await blob.arrayBuffer());
    sourceName = storagePath;
    stagingPath = storagePath;
  } else {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Ingen fil" }, { status: 400 });
    buf = Buffer.from(await file.arrayBuffer());
    sourceName = file.name;
  }

  const hash = createHash("sha256").update(buf).digest("hex");

  // Städa staging-objektet när importen är avgjord — oavsett utfall, annars
  // samlas timfilerna i incoming/ för evigt (en backfill lämnade 4,2 GB skräp
  // efter sig innan avbryt() fanns). Best effort.
  const cleanupStaging = async () => {
    if (!stagingPath) return;
    const { error } = await supabase.storage.from("raw-files").remove([stagingPath]);
    if (error) console.warn(`hpr-import: kunde inte städa ${stagingPath}: ${error.message}`);
    stagingPath = null;
  };

  // hpr_files-raden skrivs innan stockarna. Kraschar en stock-batch skulle
  // filhashen annars ligga kvar och få en OMKÖRNING att svara "duplicate" —
  // en halvimporterad fil som ser komplett ut. Varje felutgång går därför
  // via avbryt(), som tar bort filraden så importen kan köras om.
  // Redan skrivna stockar lämnas kvar (de är giltiga upsertade rader);
  // source_file_id nollas bara för att inte bryta främmande nyckel.
  let fileRowId: string | null = null;
  const avbryt = async (body: unknown, status: number) => {
    await cleanupStaging();
    if (fileRowId) {
      await supabase.from("logs").update({ source_file_id: null }).eq("source_file_id", fileRowId);
      const { error } = await supabase.from("hpr_files").delete().eq("id", fileRowId);
      if (error) console.error(`hpr-import: KUNDE INTE rulla tillbaka filrad ${fileRowId} — ` +
        `omkörning kommer svara "duplicate" trots ofullständig import: ${error.message}`);
    }
    return NextResponse.json(body as any, { status });
  };

  // 1. Exakt samma fil igen? Klart, ingen åtgärd.
  const { data: existing } = await supabase
    .from("hpr_files").select("id").eq("file_hash", hash).maybeSingle();
  if (existing) {
    await cleanupStaging();
    return NextResponse.json({ status: "duplicate" });
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

  // Objektavslut: EndDate i ObjectDefinition (defensivt — se detectEndDate).
  const endDate = detectEndDate(xmlText);
  if (!endDate) console.log(`hpr-import: ingen EndDate i ${sourceName} — objektet lämnas/förblir active`);

  // 3. Rådatan till Storage — alltid i löpande drift. Vid backfill av redan
  //    arkiverade filer (skip_raw_copy) pekar storage_path i stället ut
  //    OneDrive-arkivet, så raden aldrig ljuger om var rådatan finns.
  let storagePath: string;
  if (skipRawCopy) {
    storagePath = `onedrive:Behandlade/${machineId}/HPR/${archiveRef ?? `${hash}.hpr`}`;
  } else {
    storagePath = `hpr/${machineId}/${rawObjectKey}/${hash}.hpr`;
    const { error: storageErr } = await supabase.storage.from("raw-files").upload(storagePath, buf, {
      contentType: "application/xml", upsert: true,
    });
    if (storageErr) {
      return avbryt({ error: `Kunde inte spara rådatafilen: ${storageErr.message}` }, 500);
    }
  }

  // 4. Objekt + fil + produkter + matrisceller (upsert — kumulativa filer)
  const { data: prevObj } = await supabase
    .from("harvest_objects").select("status").eq("object_key", objectKey).maybeSingle();

  // Ny fil på ett completed objekt utan EndDate → öppna igen
  // (verkligheten trumfar statusflaggan).
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
  //    Nästa kumulativa fil skriver bara över samma rader.
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

  // 6. Snapshot av fördelningsgraden, stämplad med filens CreationDate så
  //    historiken blir sann även när gamla filer backfillas. is_final = true
  //    när filen bär EndDate (objektet avslutat).
  //    OBS: snapshotten beräknas ur DENNA fils stockar. För objekt som
  //    passerat 4000-stammarstaket (delfiler _1, _2 …) täcker en delfil inte
  //    hela objektet — vyn (etapp 2) ska räkna live ur logs-tabellen.
  const summaries = parsed.products
    .map((p) => computeDistribution(p, parsed.logs))
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

  await cleanupStaging();

  return NextResponse.json({
    status: "imported",
    objectKey,
    objectStatus: endDate ? "completed" : "active",
    reopened,
    validation: parsed.validation,
    summaries,
  });
}
