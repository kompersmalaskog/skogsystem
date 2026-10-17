-- fakturaunderlag_flytt: km och kund går att ändra före fakturering, med originalet bevarat.
-- Martin kör i Supabase SQL editor EFTER 20261015150000_fakturaunderlag_flytt_godkannande.sql.
-- Idempotent (add column if not exists, create or replace function/trigger).
--
-- ─────────────────────────────────────────────────────────────────────────
-- VARFÖR: en flytt ska gå att RÄTTA innan den godkänns (som en arbetsdag i Arbetsrapporten),
-- inte bara strykas och registreras om. Fel km eller fel kund på en flytt som i övrigt stämmer
-- är det vanliga felet.
--
-- ETT REDIGERAT TAL FÅR ALDRIG SE UT SOM EN MÄTNING. Därför bevaras originalet:
--   km_original / kund_original   värdet FÖRE första ändringen (kan vara NULL: "saknades")
--   redigerad_tid / redigerad_av  när och av vem det senast ändrades
-- Visningen skriver "42 km · ändrad från 47" så länge värdet skiljer sig från originalet.
--
-- SKYDDET LIGGER I DATABASEN, inte i appen (samma tanke som fakt_skift_bara_utoka):
--   * Första ändringen kopierar nuvarande km och kund till *_original. Båda, oavsett vilket av
--     fälten som ändrades — då går "är den redigerad?" att svara på med redigerad_tid, och ett
--     original som är NULL (kund saknades) kan skiljas från "aldrig redigerad".
--   * Originalen skrivs ALDRIG av klienten och rörs inte igen: varje UPDATE sätter tillbaka dem
--     till raden som den var.
--   * Rader som är fakturerade eller strukna går inte att ändra (fel: check_violation).
--   * Godkännandet BRYTS INTE av en ändring: den som rättar är den som godkänner, och
--     redigerad_av/tid + "ändrad från" ligger kvar på raden. (Arbetsrapportens bekräftelse bryts
--     för att FÖRAREN bekräftade och någon annan ändrade; här är det samma admin.)
--
-- KONSEKVENS FÖR FAKTURERINGEN: radbyggaren läser km härifrån och använder det för att välja
-- artikel — till och med 30 km fast belopp (artikel 5), däröver per timme (artikel 3,
-- timmarna skrivs in på VO:t). Ett rättat km över 30-gränsen byter alltså rad. faktura_oversikt()
-- läser samma kolumn och följer med. Appen säger det i arket när gränsen korsas.
--
-- RLS: policyn fakturaunderlag_flytt_admin (for all, ar_admin()) tillåter redan admins UPDATE.
-- ─────────────────────────────────────────────────────────────────────────

alter table fakturaunderlag_flytt add column if not exists km_original    numeric;
alter table fakturaunderlag_flytt add column if not exists kund_original  text;
alter table fakturaunderlag_flytt add column if not exists redigerad_tid  timestamptz;
alter table fakturaunderlag_flytt add column if not exists redigerad_av   text;

comment on column fakturaunderlag_flytt.km_original is
  'km FÖRE första redigeringen (NULL = saknades). Skrivs bara av triggern, aldrig av klienten, '
  'och rörs inte igen. Gäller bara om redigerad_tid är satt.';
comment on column fakturaunderlag_flytt.kund_original is
  'kund FÖRE första redigeringen (NULL = saknades). Se km_original.';
comment on column fakturaunderlag_flytt.redigerad_tid is
  'NULL = km och kund är orörda sedan flytten registrerades. Satt = senaste ändringen av km/kund. '
  'Sätts av triggern (now()).';
comment on column fakturaunderlag_flytt.redigerad_av is
  'Vem som senast ändrade km/kund (medarbetarens namn). Klienten skriver det; triggern kräver det.';

do $$ begin
  alter table fakturaunderlag_flytt add constraint redigerad_konsistens
    check ((redigerad_tid is null) = (redigerad_av is null));
exception when duplicate_object then null; end $$;

create or replace function fakturaunderlag_flytt_redigering()
returns trigger
language plpgsql
as $$
begin
  if new.km is distinct from old.km or new.kund is distinct from old.kund then
    if old.status <> 'aktiv' or old.fakturerad_tid is not null then
      raise exception 'Flytten är % och kan inte ändras',
        case when old.status <> 'aktiv' then 'struken' else 'fakturerad' end
        using errcode = 'check_violation';
    end if;
    if new.redigerad_av is null or btrim(new.redigerad_av) = '' then
      raise exception 'Skriv vem som ändrar flytten (redigerad_av)'
        using errcode = 'not_null_violation';
    end if;
    if old.redigerad_tid is null then
      -- Första ändringen: originalet är värdet som står på raden NU.
      new.km_original   := old.km;
      new.kund_original := old.kund;
    else
      new.km_original   := old.km_original;
      new.kund_original := old.kund_original;
    end if;
    new.redigerad_tid := now();
  else
    -- Ingen ändring av km/kund (Godkänn, traillertimmar, fakturerad …): spåret rörs inte.
    new.km_original   := old.km_original;
    new.kund_original := old.kund_original;
    new.redigerad_tid := old.redigerad_tid;
    new.redigerad_av  := old.redigerad_av;
  end if;
  return new;
end
$$;

create or replace trigger trg_fakturaunderlag_flytt_redigering
  before update on fakturaunderlag_flytt
  for each row
  execute function fakturaunderlag_flytt_redigering();

-- ── Kvitto ──────────────────────────────────────────────────────────────
-- Förväntat idag: kolumnerna finns, ingen rad är redigerad än (8 rader, 0 redigerade).
select count(*) as rader,
       count(*) filter (where redigerad_tid is not null) as redigerade,
       count(*) filter (where km_original is not null or kund_original is not null) as med_original
from fakturaunderlag_flytt;
