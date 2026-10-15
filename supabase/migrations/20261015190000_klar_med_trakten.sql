-- "Klar med trakten?" — planerarens färdigplanering (PR A).
-- SKRIVEN, INTE KÖRD. Körs av chat-Claude efter Martins ja. Idempotent (kan köras om). Additiv utom två avsiktliga
-- dataändringar (1b, 1c) som är märkta nedan. Efter körning: byt filens version till den prod stämplat (CLAUDE.md).
--
-- Kontrollerat mot prod 2026-10-15 (bara SELECT): objekt_status_check = planerad/pagaende/skotning/avslutat, kolumnen
-- status defaultar 'planerad', 5 objekt är 'planerad' utan klar_skickad_timestamp, skordare_band/skotare_band är redan
-- nullbara men defaultar false.

begin;

-- ── 1. STATUS 'oplanerad' ───────────────────────────────────────────────────────────────────────────────────────────
-- Modellen: ett nytt objekt är oplanerat tills planeraren tryckt "Klar för maskin" ('planerad' + klar_skickad_timestamp).
-- 'planerad' betyder alltså "klar att köra" — och bara det.

-- 1a. Tillåt värdet. (Gamla definitionen kan inte "utökas"; samma namn byts.)
alter table public.objekt drop constraint if exists objekt_status_check;
alter table public.objekt add constraint objekt_status_check
  check (status = any (array['oplanerad'::text, 'planerad'::text, 'pagaende'::text, 'skotning'::text, 'avslutat'::text]));

-- Ett nytt objekt utan uttryckligt värde är OPLANERAT (förut 'planerad' = dök upp i förarkön som nästa jobb).
alter table public.objekt alter column status set default 'oplanerad';

-- 1b. DATAÄNDRING: 'planerad' utan klar_skickad_timestamp har ingen människa bekräftat → 'oplanerad' (5 rader i prod
-- 2026-10-15). Pågående och avslutade rörs inte.
update public.objekt
   set status = 'oplanerad'
 where status = 'planerad'
   and klar_skickad_timestamp is null;

-- ── 2. BAND: null = "ingen har svarat" ─────────────────────────────────────────────────────────────────────────────
-- Kolumnerna var nullbara men defaultade false, så "inga band" och "ingen har tagit ställning" gick inte att skilja.
alter table public.objekt alter column skordare_band drop default;
alter table public.objekt alter column skotare_band drop default;

-- 1c. DATAÄNDRING: befintliga false på oplanerade/planerade objekt blir null (obesvarat). Pågående/avslutade rörs inte.
update public.objekt set skordare_band = null where skordare_band = false and status in ('oplanerad', 'planerad');
update public.objekt set skotare_band  = null where skotare_band  = false and status in ('oplanerad', 'planerad');

-- ── 3. NYA KOLUMNER på objekt ──────────────────────────────────────────────────────────────────────────────────────
-- Prognosen godkänd ("Stämmer"): vem, när, och ett fingeravtryck av underlaget. Kortet jämför fingeravtrycket med
-- dagens underlag — ändras volym/medelstam/basväg/förutsättningar/maskinval räknas godkännandet som ogiltigt utan att
-- något behöver nollställas.
alter table public.objekt add column if not exists prognos_godkand_av uuid references public.medarbetare(id) on delete set null;
alter table public.objekt add column if not exists prognos_godkand_at timestamptz;
alter table public.objekt add column if not exists prognos_godkand_underlag text;

-- Medelstam (m³fub). Importen läser "Medelstam" ur traktdirektivets tabell när fältet saknas (PR C); kortet visar/rättar.
alter table public.objekt add column if not exists medelstam numeric;

-- "Har du…": sex frågor, alltid ställda. { "gransar": {"svar":"ja","av":"<medarbetare-id>","at":"<iso>"}, ... }
-- Nycklar: gransar, naturvarden, kulturlamningar, ledningar, snitslat, avlagg_hugga. svar: ja | behovs_inte | inga | nej.
alter table public.objekt add column if not exists har_du_svar jsonb;

-- Ved till markägaren: { "plats":"avlagg"|"karta", "lat":..,"lng":.., "langd":"3m"|"fallande"|"annan",
-- "langd_annan":"..", "sortiment":["bjork","lov","energi"], "ovrigt":"..", "markering_id":".." }
alter table public.objekt add column if not exists ved_detaljer jsonb;

-- Ögonblicksbild av hur många punkter som är kvar, skriven av kortet när planeraren tittar. Objektlistorna visar den
-- ("N kvar") utan att behöva läsa markeringar för varje objekt. null = ingen har öppnat kortet än → listan säger inget tal.
alter table public.objekt add column if not exists klar_kvar_antal integer;
alter table public.objekt add column if not exists klar_kvar_beraknad_at timestamptz;

-- ── 4. VÄNTANDE KORT / "FORTSÄTTER EN ANNAN DAG" — per objekt och användare (används av PR B) ──────────────────────
create table if not exists public.klar_trakt_paminnelse (
  objekt_id            uuid        not null references public.objekt(id) on delete cascade,
  medarbetare_id       uuid        not null references public.medarbetare(id) on delete cascade,
  vantar_sedan         timestamptz,            -- lämnade trakten med något kvar; kortet väntar på att man står stilla
  fortsatter_datum     date,                   -- "Fortsätter en annan dag" tryckt den dagen → inget mer idag
  kvar_senast          jsonb,                  -- vad som var kvar sist (för "kvar sedan sist: …")
  paminnelse_skickad   date,                   -- push 2 dagar före planerad start skickad (en gång)
  uppdaterad           timestamptz not null default now(),
  primary key (objekt_id, medarbetare_id)
);

alter table public.klar_trakt_paminnelse enable row level security;

drop policy if exists klar_trakt_paminnelse_egen on public.klar_trakt_paminnelse;
create policy klar_trakt_paminnelse_egen on public.klar_trakt_paminnelse
  for all to authenticated
  using (medarbetare_id in (select id from public.medarbetare where user_id = auth.uid()))
  with check (medarbetare_id in (select id from public.medarbetare where user_id = auth.uid()));

commit;

-- Kvitto (kör efter migrationen):
--   select status, count(*) from public.objekt group by 1;                       -- inga 'planerad' utan klar_skickad_timestamp
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'objekt_status_check';   -- fem värden
--   select count(*) filter (where skordare_band is false) from public.objekt where status in ('oplanerad','planerad');   -- 0
-- Ångra (om något ska backas): se kommentaren i docs/klar-med-trakten.md.
