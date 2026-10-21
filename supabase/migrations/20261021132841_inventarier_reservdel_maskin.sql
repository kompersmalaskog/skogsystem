alter table public.inventarie_artikel
  add column maskin_id text references public.dim_maskin(maskin_id),
  add column sitter_pa text;

comment on column public.inventarie_artikel.maskin_id is 'Reservdel till en viss maskin (t.ex. hydraulslang). NULL = passar alla / hör inte till någon maskin.';
comment on column public.inventarie_artikel.sitter_pa is 'Var på maskinen delen sitter, fri text ("Hjularm vänster"). Skärmen föreslår tidigare värden för samma maskin så stavningen hålls ihop. Visas efter namnet: "Hydraulslang · Hjularm vänster".';

create index on public.inventarie_artikel (maskin_id);