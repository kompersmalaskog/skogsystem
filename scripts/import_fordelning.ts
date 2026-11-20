/**
 * import_fordelning.ts — lokal HPR-import till fördelningsuppföljningen, körs på
 * driften i stället för att POST:a till Vercel. Återanvänder EXAKT samma
 * importorkestrering som /api/hpr-import (lib/hpr/import-fordelning → parseHpr +
 * fordelning + objekt-data) — ingen kopia av logiken.
 *
 * Körs: npx tsx scripts/import_fordelning.ts <sökväg-till-.hpr>
 *
 * Skillnad mot route:n: läser den LOKALA filen direkt (ingen Vercel-body-gräns,
 * ingen Storage-staging), och gzippar den permanenta rådatakopian (rawCopyGzip)
 * så den ryms under Supabase Storages uppladdningsgräns. Samma skyddsregler:
 * hash-dedupe, avbryt()-rollback (ingen halvregistrering), inga fel som stoppar.
 *
 * Exit 0 = imported/duplicate, exit 1 = validation_failed/fel. Vaktprogrammet
 * sväljer ändå utfallet — ett importfel får aldrig stoppa arkiveringen.
 */
import { readFileSync, existsSync } from "fs";
import { basename, join } from "path";
import { createClient } from "@supabase/supabase-js";
import { importeraHpr } from "../lib/hpr/import-fordelning";

/**
 * Läs en variabel ur miljön, med fallback till .env.local. Letar i cwd och
 * någon nivå upp (vaktprogrammet kör med cwd = drift-roten där .env.local
 * ligger; lokala testkörningar startar ofta från repo-roten).
 */
function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  for (const dir of [process.cwd(), join(process.cwd(), ".."), join(process.cwd(), "..", "..")]) {
    const f = join(dir, ".env.local");
    if (!existsSync(f)) continue;
    for (const rad of readFileSync(f, "utf8").split("\n")) {
      const t = rad.trim();
      if (t.startsWith(`${name}=`)) return t.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

/** Returnerar exit-kod. Sätter process.exitCode i stället för process.exit() —
 *  ett abrupt exit() medan supabase-fetchens undici-keep-alive-sockets stängs
 *  kraschar libuv på Windows (UV_HANDLE_CLOSING). Naturlig drain undviker det. */
async function main(): Promise<number> {
  const filväg = process.argv[2];
  if (!filväg) {
    console.error("Användning: npx tsx scripts/import_fordelning.ts <sökväg-till-.hpr>");
    return 2;
  }

  const url = env("NEXT_PUBLIC_SUPABASE_URL") ?? env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("Fördelning: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY saknas i miljö/.env.local");
    return 2;
  }

  let buf: Buffer;
  try {
    buf = readFileSync(filväg);
  } catch (e: any) {
    console.error(`Fördelning: kunde inte läsa ${filväg}: ${e?.message ?? e}`);
    return 2;
  }

  const supabase = createClient(url, serviceKey);
  const namn = basename(filväg);

  // Löpande drift: skip_raw_copy = false (Storage är enda arkivet av rådatan),
  // gzippa kopian. Ingen staging att städa (lokal fil).
  const res = await importeraHpr(supabase, buf, {
    sourceName: namn,
    skipRawCopy: false,
    rawCopyGzip: true,
  });

  const b = res.body;
  if (b.status === "imported") {
    console.log(`Fördelning: ${namn} → imported [${b.objectKey}${b.objectStatus === "completed" ? " COMPLETED" : ""}${b.reopened ? " reopened" : ""}]`);
    return 0;
  }
  if (b.status === "duplicate") {
    console.log(`Fördelning: ${namn} → duplicate`);
    return 0;
  }
  if (b.status === "validation_failed") {
    console.error(`Fördelning: ${namn} → validation_failed: ${(b.validation?.errors ?? []).join("; ")}`);
    return 1;
  }
  console.error(`Fördelning: ${namn} → fel: ${b.error ?? JSON.stringify(b)}`);
  return 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    console.error(`Fördelning: oväntat fel: ${e?.message ?? e}`);
    process.exitCode = 1;
  });
