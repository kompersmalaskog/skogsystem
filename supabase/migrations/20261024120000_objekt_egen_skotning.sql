-- Starta jobb: egen skotning redan när jobbet föds (Martin 2026-10-24).
--
-- dim_objekt.egen_skotning finns sedan tidigare, men dim_objekt-raden finns först när maskindata kommit in. Ett jobb från
-- Starta jobb föds som en objekt-rad UTAN dim_objekt, så valet "Egen skotning" måste kunna sparas där. Additiv kolumn,
-- null/false = vi skotar (som förut). Appen skriver den bara när den är sann (lib/startaJobb byggObjektRad).
--
-- Ej gjort här (följd): att föra över värdet till dim_objekt.egen_skotning när maskindatan kopplas, så att översikten och
-- skotningKvar (som läser dim_objekt) också slutar vänta på skotaren.

alter table public.objekt add column if not exists egen_skotning boolean;

comment on column public.objekt.egen_skotning is
  'Säljaren/markägaren skotar själv — inga skotarfiler väntas. Sätts i Starta jobb för slutavverkning/gallring. Speglar dim_objekt.egen_skotning för jobb utan maskindata.';
