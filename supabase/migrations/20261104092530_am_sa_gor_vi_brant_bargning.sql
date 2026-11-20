-- Så gör vi: två jobb till ur Skogsentreprenörernas lista (brant terräng, bärgning av maskin).
alter table public.am_sa_gor_vi drop constraint am_sa_gor_vi_id_check,
  add constraint am_sa_gor_vi_id_check check (id in ('hydraulslang', 'trailer', 'kraftledning', 'motorsag', 'heta_arbeten', 'ensam', 'brant', 'bargning'));
alter table public.am_sa_gor_vi_last drop constraint am_sa_gor_vi_last_instruktion_check,
  add constraint am_sa_gor_vi_last_instruktion_check check (instruktion in ('hydraulslang', 'trailer', 'kraftledning', 'motorsag', 'heta_arbeten', 'ensam', 'brant', 'bargning'));
