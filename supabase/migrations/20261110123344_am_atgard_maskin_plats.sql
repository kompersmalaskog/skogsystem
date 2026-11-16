-- Var på maskinen felet sitter (Något är fel, tryck på maskinbilden). Bara tillägg.
-- maskin_del = delens id (lib/arbetsmiljo/maskinBild.ts), maskin_x/maskin_y = 0..1 av teckningen.
alter table public.am_atgard add column if not exists maskin_del text;
alter table public.am_atgard add column if not exists maskin_x real;
alter table public.am_atgard add column if not exists maskin_y real;
alter table public.am_atgard add constraint am_atgard_maskin_plats_ok check (
  (maskin_del is null and maskin_x is null and maskin_y is null)
  or (maskin_del is not null and length(maskin_del) between 1 and 40
      and maskin_x between 0 and 1 and maskin_y between 0 and 1)
);
