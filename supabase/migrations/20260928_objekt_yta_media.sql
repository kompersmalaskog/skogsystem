-- Per-yta-MEDIA på ytkortet: ljud + foto knutna till en trakt-yta / eget område.
-- Komplement till objekt_yta_anteckning (som håller TEXTEN, en rad per yta). Media är en
-- egen tabell med FLERA rader per yta (flera ljud + flera foton), i skapelseordning.
--
-- yta_nyckel = SAMMA stabila nyckel som objekt_yta_anteckning (överlever omimport):
--   hansyn:<LOPNR> | traktdel:<TRDEL_ID[:idx]> | nb:<Beteckn> | raa:<lamningsnu> | omrade:<marker_id>
-- Se lib/traktGeometri.ts (ytaNyckel) för nyckelbyggaren.
--
-- Filerna ligger i storage:
--   typ='audio' → befintliga bucketen 'audio' (public), path 'yta/<objekt>/<nyckel>/…' — samma
--                 upload-flöde (uploadAudioToStorage) som markörernas ljud.
--   typ='foto'  → NY bucket 'ytfoto' (public, bara bilder) — markörernas base64-foton kopieras INTE.
-- url = publik URL (getPublicUrl), samma mönster som markör-ljudet.
--
-- Behörighet: alla inloggade LÄSER (förare ser + spelar upp); bara admin (planerare) SKAPAR/RADERAR.

create table if not exists public.objekt_yta_media (
  id         uuid primary key default gen_random_uuid(),
  objekt_id  uuid not null references public.objekt(id) on delete cascade,
  yta_nyckel text not null,
  typ        text not null check (typ in ('audio', 'foto')),
  url        text not null,
  skapad_av  uuid references public.medarbetare(id) on delete set null,
  skapad_at  timestamptz not null default now()
);

-- Kortet hämtar all media för ett objekt och grupperar per yta_nyckel i ordning.
create index if not exists objekt_yta_media_objekt_nyckel_idx
  on public.objekt_yta_media (objekt_id, yta_nyckel, skapad_at);

alter table public.objekt_yta_media enable row level security;

-- Alla inloggade läser (förare ska se + spela upp planerarens media).
drop policy if exists objekt_yta_media_select on public.objekt_yta_media;
create policy objekt_yta_media_select on public.objekt_yta_media
  for select to authenticated using (true);

-- Bara admin (planerare) skapar.
drop policy if exists objekt_yta_media_insert on public.objekt_yta_media;
create policy objekt_yta_media_insert on public.objekt_yta_media
  for insert to authenticated with check (ar_admin());

-- Bara admin raderar (media redigeras inte, bara läggs till / tas bort).
drop policy if exists objekt_yta_media_delete on public.objekt_yta_media;
create policy objekt_yta_media_delete on public.objekt_yta_media
  for delete to authenticated using (ar_admin());

-- === Storage: NY bucket 'ytfoto' för trakt-/områdesfoton (public read, bara bilder) ===
-- Public som 'audio' → klienten visar via getPublicUrl (ingen signerad URL). Innehåller fältfoton
-- på trakter/områden, inga markägar-personuppgifter (de ligger i privata trakt-inbox).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ytfoto', 'ytfoto', true, 15728640,   -- 15 MB
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- SELECT: publik läsmarginal (bucket är public=true; explicit policy gör avsikten tydlig,
-- i linje med storage_las_publik för 'audio').
drop policy if exists ytfoto_las_publik on storage.objects;
create policy ytfoto_las_publik on storage.objects
  for select to public using (bucket_id = 'ytfoto');

-- INSERT/DELETE: bara admin (planerare). Själva media-raden är redan admin-gatead ovan;
-- detta gör att inga orphan-filer kan laddas upp av icke-planerare.
drop policy if exists ytfoto_skapa_admin on storage.objects;
create policy ytfoto_skapa_admin on storage.objects
  for insert to authenticated with check (bucket_id = 'ytfoto' and ar_admin());

drop policy if exists ytfoto_radera_admin on storage.objects;
create policy ytfoto_radera_admin on storage.objects
  for delete to authenticated using (bucket_id = 'ytfoto' and ar_admin());
