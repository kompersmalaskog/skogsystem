-- Skotarlänken: ett lass skapas av en markering ("Timmer är taget" → avlägg 2). Lasset bär id:n på markeringarna det skapades av,
-- så att Ångra och Ta bort tar bort båda — högarna kommer tillbaka på kartan och volymen försvinner från avlägget. Additiv.
alter table public.skotar_lank_lass add column if not exists markeringar uuid[] not null default '{}';
