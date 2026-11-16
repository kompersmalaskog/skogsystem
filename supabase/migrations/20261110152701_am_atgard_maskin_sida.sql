-- Vilken sida av maskinen felet sitter på (Martin 2026-11-10: höger och vänster, aldrig fram eller bak).
-- null = okänd (rader från före sidorna, eller "Vet inte var"). Platsen (maskin_x) är i den visade teckningen.
alter table public.am_atgard
  add column if not exists maskin_sida text check (maskin_sida in ('vanster', 'hoger'));
comment on column public.am_atgard.maskin_sida is 'Vilken sida av maskinen teckningen visade när föraren tryckte: vanster | hoger. null = okänd.';
