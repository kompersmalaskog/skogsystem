// Mutationskontroll för säkerhetsmigrationerna (SQL) 2026-10-23: varje spärr tas bort, EN i taget, och databasproven
// (supabase/tests/sakerhet_lokal, riktig Postgres + RLS) ska bli RÖDA. Kräver en lokal Postgres:
//   pg_ctlcluster 16 main start; su postgres -c "createdb sakerhet_test"
// Kör:  node scripts/mutationskontroll-sakerhet-sql.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const AUDIO = "supabase/migrations/20261023120000_audio_bucket_privat.sql";
const MED = "supabase/migrations/20261023152043_medarbetare_skydda_kolumner.sql";
const GRANTS = "supabase/migrations/20261023160000_revoke_truncate_trigger_references.sql";

const M = [
  ["audio: bucketen förblir publik", "set public = false,", "set public = true,", AUDIO],
  ["audio: ingen storleksgräns", "file_size_limit = 15728640", "file_size_limit = null", AUDIO],
  ["audio: anon kan fortfarande ladda upp", 'drop policy if exists "Allow public upload to audio"   on storage.objects;\n', "", AUDIO],
  ["audio: anon kan fortfarande radera", 'drop policy if exists "Allow public delete from audio" on storage.objects;\n', "", AUDIO],
  ["audio: anon kan fortfarande läsa", 'drop policy if exists "Allow public read from audio"   on storage.objects;\n', "", AUDIO],
  ["audio: anon kan fortfarande läsa (storage_las_publik)", 'drop policy if exists "storage_las_publik"             on storage.objects;\n', "", AUDIO],
  ["audio: anon kan fortfarande skriva över", 'drop policy if exists "storage_uppdatera_publik"       on storage.objects;\n', "", AUDIO],
  ["audio: läsning kräver ingen medarbetarrad", "using (bucket_id = 'audio' and public.aktuell_medarbetare_id() is not null);\n\ncreate policy \"audio_skapa", "using (bucket_id = 'audio');\n\ncreate policy \"audio_skapa", AUDIO],
  ["audio: uppladdning kräver ingen medarbetarrad", "with check (bucket_id = 'audio' and public.aktuell_medarbetare_id() is not null);", "with check (bucket_id = 'audio');", AUDIO],
  ["audio: vem som helst inloggad kan radera andras ljud", "(owner = auth.uid() or public.ar_admin())", "true", AUDIO],
  ["audio: admin kan inte radera andras", "(owner = auth.uid() or public.ar_admin())", "(owner = auth.uid())", AUDIO],
  ["medarbetare: roll får ändras av förare", "'telefon', 'anhorig_namn',", "'telefon', 'roll', 'anhorig_namn',", MED],
  ["medarbetare: lön får ändras av förare", "'telefon', 'anhorig_namn',", "'telefon', 'timlon_kr', 'anhorig_namn',", MED],
  ["medarbetare: e-post får ändras av förare", "'telefon', 'anhorig_namn',", "'telefon', 'epost', 'anhorig_namn',", MED],
  ["medarbetare: hemadress får ändras av förare", "'telefon', 'anhorig_namn',", "'telefon', 'hemadress', 'anhorig_namn',", MED],
  ["medarbetare: ingen spärr alls (triggern borta)", "create or replace trigger a_medarbetare_skydda_kolumner\n  before update on public.medarbetare\n  for each row execute function public.medarbetare_skydda_kolumner();", "", MED],
  ["medarbetare: triggern gäller bara 'roll'", "before update on public.medarbetare", "before update of roll on public.medarbetare", MED],
  ["medarbetare: admin spärras också", "  if public.ar_admin() then\n    return new;\n  end if;\n", "", MED],
  ["medarbetare: servicenyckeln spärras (inbjudningsflödet slutar fungera)", "coalesce(auth.role(), '') not in ('authenticated', 'anon')", "false", MED],
  ["medarbetare: spärren släpper igenom förare (jämför inget)", "is distinct from (to_jsonb(old) - tillatna)", "is distinct from (to_jsonb(new) - tillatna)", MED],
  ["medarbetare: tillåtna fält spärras också (telefon går inte att ändra)", "if (to_jsonb(new) - tillatna) is distinct", "if (to_jsonb(new)) is distinct", MED],
  ["grants: ingen återkallning på befintliga tabeller", "revoke truncate, trigger, references on all tables in schema public from anon, authenticated;", "", GRANTS],
  ["grants: bara anon (authenticated behåller dem)", "revoke truncate, trigger, references on all tables in schema public from anon, authenticated;", "revoke truncate, trigger, references on all tables in schema public from anon;", GRANTS],
  ["grants: TRUNCATE återkallas inte", "revoke truncate, trigger, references on all tables", "revoke trigger, references on all tables", GRANTS],
  ["grants: TRIGGER återkallas inte", "revoke truncate, trigger, references on all tables", "revoke truncate, references on all tables", GRANTS],
  ["grants: REFERENCES återkallas inte", "revoke truncate, trigger, references on all tables", "revoke truncate, trigger on all tables", GRANTS],
  ["grants: default privileges ändras inte (nya tabeller får dem)", "alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;", "", GRANTS],
  ["grants: service_role förlorar sina rättigheter", "from anon, authenticated;\n\nalter default", "from anon, authenticated, service_role;\n\nalter default", GRANTS],
  ["grants: SELECT återkallas (appen slutar fungera)", "revoke truncate, trigger, references on all tables", "revoke select, truncate, trigger, references on all tables", GRANTS],
  ["medarbetare: ingen exception (felet sväljs)", "raise exception 'Bara admin får ändra roll, lön, aktiv, e-post och liknande på en medarbetare'\n      using errcode = '42501';", "return new;", MED],
];

const filer = [...new Set(M.map(m => m[3]))];
const original = Object.fromEntries(filer.map(f => [f, readFileSync(f, "utf8")]));
const aterstall = () => { for (const [f, s] of Object.entries(original)) writeFileSync(f, s); };
const prova = () => spawnSync("bash", ["supabase/tests/sakerhet_lokal/kor-alla.sh"], { encoding: "utf8" });

const grund = prova();
if (grund.status !== 0) { console.error("Databasproven är röda innan mutationerna:\n" + grund.stdout + grund.stderr); process.exit(2); }
const overlevde = [];
let dog = 0;
try {
  for (const [namn, fran, till, fil] of M) {
    const antal = original[fil].split(fran).length - 1;
    if (antal !== 1) { console.error(`✗ "${namn}": mönstret finns ${antal} gånger i ${fil}:\n   ${fran}`); aterstall(); process.exit(2); }
    aterstall();
    writeFileSync(fil, original[fil].replace(fran, () => till));
    const r = prova();
    if (r.stdout.includes("gick inte att applicera")) { console.error(`✗ "${namn}": mutanten är ogiltig SQL (migrationen gick inte att applicera) — räknas inte som död`); aterstall(); process.exit(2); }
    const dod = r.status !== 0;
    if (dod) dog++; else overlevde.push(namn);
    console.log(`${dod ? "död     " : "ÖVERLEVDE"}  ${namn}`);
  }
} finally { aterstall(); }
console.log(`\n${dog} av ${M.length} mutanter dödades${overlevde.length ? `, ${overlevde.length} överlevde:` : "."}`);
for (const n of overlevde) console.log("  - " + n);
process.exit(overlevde.length ? 1 : 0);
