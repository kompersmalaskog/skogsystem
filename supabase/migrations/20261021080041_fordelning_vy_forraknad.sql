-- Apteringsvyn räknas i förväg (2026-10-21).
--
-- Förut räknade /api/fordelning om ALLA objekt ur logs vid varje öppning
-- (47 objekt, ~512 000 stockar) och slog i statement timeout. Nu räknas
-- objektets vymodell när en HPR-fil importeras och sparas här; vyn läser
-- bara färdiga rader. Siffrorna kommer fortfarande ur logs/matrix_cells
-- (samma byggObjektVy) — tabellen är en lagrad beräkning, aldrig en källa.
--
-- Raden är aktuell när last_file_at = harvest_objects.last_file_at och
-- version = VY_VERSION i lib/hpr/vy-lager.ts. Annars räknas den om.

create table if not exists fordelning_vy (
  object_key   text primary key,
  last_file_at timestamptz,
  version      int not null,
  computed_at  timestamptz not null default now(),
  kort         jsonb,  -- objektkortet (ObjektVy utan produkter); null = inga fördelningsmål
  vy           jsonb   -- hela ObjektVy för detaljvyn
);

alter table fordelning_vy enable row level security;
create policy "authenticated_read_fordelning_vy" on fordelning_vy
  for select to authenticated using (true);
-- Skrivning bara service_role (import och /api/fordelning/berakna).
