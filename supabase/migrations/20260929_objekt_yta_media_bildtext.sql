-- Bildtext per yt-media: en valfri text under varje foto/ljud på ytkortet.
-- Ny nullable kolumn på objekt_yta_media (se 20260928_objekt_yta_media.sql).
--
-- Kräver dessutom en UPDATE-policy: tabellen skapades med SELECT (alla inloggade),
-- INSERT + DELETE (admin) men INGEN UPDATE → att sätta bildtext hade annars blockerats
-- tyst av RLS (0 rader → verifierat sparande visar fel). Bildtext sätts bara av admin
-- (planerare), som resten av media-skrivningen.

alter table public.objekt_yta_media add column if not exists text text;

drop policy if exists objekt_yta_media_update on public.objekt_yta_media;
create policy objekt_yta_media_update on public.objekt_yta_media
  for update to authenticated using (ar_admin()) with check (ar_admin());
