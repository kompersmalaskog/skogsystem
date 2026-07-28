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
 *        watchdog/backfill GZIPPAR filen (HPR = XML, ~8:1) och laddar upp den
 *        till raw-files/incoming/*.hpr.gz — så den kommer under Supabase Storages
 *        uppladdningsgräns (filerna passerade 50 MB). Routen dekomprimerar efter
 *        nedladdning; hashen beräknas på originalet så dedup är oförändrad.
 *        skip_raw_copy sätts av backfillen: originalen finns redan i OneDrive-
 *        arkivet, så den permanenta Storage-kopian hoppas över (~8 GB dubbellagring).
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
import { gunzipSync } from "zlib";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { importeraHpr } from "@/lib/hpr/import-fordelning";

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
    const raw = Buffer.from(await blob.arrayBuffer());
    // Watchdog/backfill gzippar filen före uppladdning (HPR är XML, ~8:1) för
    // att komma under Supabase Storages uppladdningsgräns. .gz → dekomprimera
    // här, så allt nedströms (hash, parse) ser originalinnehållet. Hashen
    // beräknas alltså på det DEKOMPRIMERADE innehållet → dedup oförändrad.
    try {
      buf = storagePath.endsWith(".gz") ? gunzipSync(raw) : raw;
    } catch (e: any) {
      return NextResponse.json(
        { error: `Kunde inte dekomprimera ${storagePath}: ${e?.message ?? e}` },
        { status: 422 }
      );
    }
    sourceName = storagePath;
    stagingPath = storagePath;
  } else {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Ingen fil" }, { status: 400 });
    buf = Buffer.from(await file.arrayBuffer());
    sourceName = file.name;
  }

  // Städa staging-objektet (incoming/-filen) när importen är avgjord — oavsett
  // utfall, annars samlas timfilerna för evigt. Best effort. Delas till
  // importeraHpr som anropar den i alla utgångar.
  const cleanupStaging = async () => {
    if (!stagingPath) return;
    const { error } = await supabase.storage.from("raw-files").remove([stagingPath]);
    if (error) console.warn(`hpr-import: kunde inte städa ${stagingPath}: ${error.message}`);
    stagingPath = null;
  };

  // Gemensam importorkestrering (lib/hpr/import-fordelning). Drag-drop behåller
  // okomprimerad rådatakopia (rawCopyGzip: false) → svaren är oförändrade.
  const result = await importeraHpr(supabase, buf, {
    sourceName, skipRawCopy, archiveRef, rawCopyGzip: false, cleanup: cleanupStaging,
  });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
