-- ─────────────────────────────────────────────────────────────
-- BYTESDAG — "nej tack" ska minnas. arbetsdag.bytesdag_avbojd_at.
--
-- Bytesfrågan (skoftning §5 mom 4) ställs vid Bekräfta av en arbetad röd
-- vardag — men de flesta bekräftar samma kväll, långt innan de tänker på att
-- ta ledigt i stället (Martin: Kristi himmelsfärd 14 maj, redan bekräftad).
-- Därför erbjuds bytet även i efterhand, i Dag-vyns väntar-kort och i
-- Redigera. Då måste ett "nej" sparas, annars ligger raden kvar och tjatar
-- om en dag föraren medvetet valt att inte byta — samma mönster som
-- brandrisk_beordrad (svaret på brandriskfrågan bor på arbetsdag-raden).
--
-- Utan kolumn hade svaret bara kunnat bo i telefonens localStorage: då
-- tjatar frågan på nästa enhet och efter varje ominstallation. Ett svar
-- som ska gälla föraren, inte enheten, hör hemma i databasen.
--
-- Ett "ja" är ledighet_ansokningar-raden (typ inarbetad) — ingen kolumn.
-- Kör i prod av Martin. Additivt, inga rader rörs.
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE arbetsdag ADD COLUMN IF NOT EXISTS bytesdag_avbojd_at timestamptz;

COMMENT ON COLUMN arbetsdag.bytesdag_avbojd_at IS
  'Föraren har svarat nej på "vill du ta ledigt en annan dag i stället?" för den här arbetade röda vardagen (skoftning §5 mom 4). NULL = inte tillfrågad eller inte svarat. Ett ja är raden i ledighet_ansokningar (typ inarbetad, ersatter_datum = detta datum).';

COMMIT;

-- EFTER:
--   select column_name, data_type, is_nullable from information_schema.columns
--     where table_name = 'arbetsdag' and column_name = 'bytesdag_avbojd_at';
--     → bytesdag_avbojd_at | timestamp with time zone | YES
--   select count(*) from arbetsdag where bytesdag_avbojd_at is not null;  → 0
