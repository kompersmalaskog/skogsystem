-- STARTA JOBB: privat / väntar på Vida, GROT hör till virkesobjekt, hyttspår utan objekt, VO-numret rätt för alla.
-- Alla steg är additiva/idempotenta (IF NOT EXISTS / OR REPLACE) och kan köras före release utan att något i appen ändras.
-- Kör HELA filen EN gång före production förs fram (kod och schema ska inte glida isär).

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. objekt: ursprung, hör-till, avvisade ihopslagningar
-- ───────────────────────────────────────────────────────────────────────────────
-- ursprung: NULL = vanligt objekt (importerat från Vida). 'privat' = privat jobb, inget Vida-objekt kommer.
-- 'vanta_vida' = Vida har inte levererat än → förslag att slå ihop när Vida-objektet importeras (lib/vidaSammanslagning).
alter table public.objekt add column if not exists ursprung text;
alter table public.objekt drop constraint if exists objekt_ursprung_check;
alter table public.objekt add constraint objekt_ursprung_check check (ursprung is null or ursprung in ('privat', 'vanta_vida'));
create index if not exists objekt_ursprung_idx on public.objekt (ursprung) where ursprung is not null;

-- GROT-jobb: virkesobjektet på samma trakt. Då visas virkesobjektets traktgräns, ytor, anteckningar och skördarens spår också på GROT-jobbet.
-- ON DELETE SET NULL: tas virkesobjektet bort tappar GROT-jobbet bara kopplingen, aldrig sig självt.
alter table public.objekt add column if not exists hor_till_objekt_id uuid references public.objekt(id) on delete set null;
create index if not exists objekt_hor_till_idx on public.objekt (hor_till_objekt_id) where hor_till_objekt_id is not null;

-- Vida-objekt som någon sagt NEJ till för det här jobbet — förslaget kommer inte tillbaka för just det paret.
alter table public.objekt add column if not exists sla_ihop_avvisade uuid[] not null default '{}';

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. hyttspar utan objekt (skyddsnätet på maskindatorn)
-- ───────────────────────────────────────────────────────────────────────────────
-- hyttspar.objekt_id är redan NULLABLE (kontrollerat mot prod-schemat: kolumnen är inte NOT NULL, 0 rader utan objekt idag).
-- Den unika nyckeln (objekt_id, roll, datum) dedupar däremot ALDRIG NULL (NULL ≠ NULL) → en rad utan objekt hittas i stället på maskinen:
-- en rad per (maskin, roll, datum) så länge objekt_id är NULL. Appen sätter alltid maskin_id på sådana rader.
create unique index if not exists hyttspar_utan_objekt_unik on public.hyttspar (maskin_id, roll, datum) where objekt_id is null;

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. next_privat_vo: SECURITY DEFINER
-- ───────────────────────────────────────────────────────────────────────────────
-- Funktionen låg utan SECURITY DEFINER i scripts/setup-supabase-tables.sql (ingen migration) → den körs som den inloggade och kräver USAGE på
-- sekvensen privat_vo_seq. Vilka grants sekvensen har i prod är inte verifierat; DEFINER gör att varje inloggad får ett nummer oavsett.
create or replace function public.next_privat_vo()
returns text
language sql
security definer
set search_path = public
as $$
  select 'P-' || nextval('public.privat_vo_seq')::text;
$$;
revoke all on function public.next_privat_vo() from public, anon;
grant execute on function public.next_privat_vo() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. Maskinobjekt-fliken: VO-numret på ett maskinobjekt (dim_objekt)
-- ───────────────────────────────────────────────────────────────────────────────
-- dim_objekt har RLS med SELECT för alla inloggade men skrivning bara för admin (20260524153632: dim_objekt_admin_write FOR ALL ... ar_admin()).
-- En förares UPDATE från Starta jobb träffade därför 0 rader UTAN fel → "Inget sparades — VO-numret sattes inte på maskinobjektet".
-- I stället för att öppna hela tabellen för skrivning: en smal funktion som BARA kan sätta ett P-VO på en rad som saknar VO.
create or replace function public.tilldela_vo_maskinobjekt(p_dim_objekt_id text, p_vo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_vo is null or p_vo !~ '^P-[0-9]+$' then
    raise exception 'Ogiltigt privat VO-nummer: %', p_vo;
  end if;
  update public.dim_objekt
     set vo_nummer = p_vo,
         uppdaterad_tid = now()
   where objekt_id = p_dim_objekt_id
     and (vo_nummer is null or btrim(vo_nummer) = '');
  get diagnostics n = row_count;
  return n;   -- 0 = raden finns inte eller har redan ett VO (anroparen säger det i klartext)
end;
$$;
revoke all on function public.tilldela_vo_maskinobjekt(text, text) from public, anon;
grant execute on function public.tilldela_vo_maskinobjekt(text, text) to authenticated;

notify pgrst, 'reload schema';
