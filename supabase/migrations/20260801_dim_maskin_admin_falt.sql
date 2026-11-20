-- Maskin-hantering i admin: två fält som gör dim_maskin admin-redigerbar och
-- inför "upptäckta maskiner"-flödet (speglar dim_operator↔medarbetare-mönstret).
--
-- aktiv_fran : när maskinen togs i drift (komplement till befintliga aktiv_till).
-- bekraftad  : false = importen har SKAPAT maskinen automatiskt ur en fil men
--              admin har inte bekräftat den ännu ("Nya maskiner upptäckta").
--              true  = admin äger visningsnamn/tillverkare/maskin_typ och importen
--              slutar skriva över dem (guard i skogsmaskin_import_version_6.py:
--              upsert_maskin/maskin_ar_bekraftad). Maskindata skriver aldrig över
--              mänsklig kunskap — samma princip som objekt-namnpolicyn och
--              arbetsdag.bekraftad.
--
-- RLS: dim_maskin har redan _select (alla authenticated) + _admin_write
-- (ar_admin(), dvs roll='admin') sedan 20260524153632. Inga nya policies behövs —
-- admin-vyns skrivningar går via den befintliga admin-write-policyn.

ALTER TABLE dim_maskin
  ADD COLUMN IF NOT EXISTS aktiv_fran date,
  ADD COLUMN IF NOT EXISTS bekraftad  boolean NOT NULL DEFAULT false;

-- Backfill: alla NUVARANDE maskiner är kända och godkända sedan tidigare →
-- markera dem bekräftade. Bara maskiner som importen upptäcker HÄREFTER föds
-- obekräftade (via DEFAULT false) och dyker upp i admin för bekräftelse.
UPDATE dim_maskin SET bekraftad = true;
