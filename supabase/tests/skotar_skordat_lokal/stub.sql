-- Minsta stub för skotar_skordat: tabellerna med de kolumner funktionen läser.
create table objekt (id uuid primary key, vo_nummer text, dim_objekt_id text);
create table objekt_alt_nummer (objekt_id uuid, nummer text, maskin_id text);
create table dim_sortiment (sortiment_id int primary key, namn text);
create table fakt_sortiment (objekt_id text, sortiment_id int, volym_m3sub numeric);
