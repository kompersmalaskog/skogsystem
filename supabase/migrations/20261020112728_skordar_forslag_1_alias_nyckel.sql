-- Skördarens maskinobjekt -> extra nummer. Samma regel som lib/objektNummer.ts stamObjektId, åt andra hållet:
-- 'PONS20SDJAA270231_132' -> k132 för maskinen, '11218523' -> kontraktsnumret självt. Annat -> inga rader.
create or replace function skordar_alias_nyckel(p_objekt_id text)
returns table (nummer text, maskin_id text)
language sql immutable
set search_path = public
as $$
  select case when p_objekt_id ~ '^[0-9]+$' then p_objekt_id else 'k' || substring(p_objekt_id from '_([0-9]+)$') end,
         case when p_objekt_id ~ '^[0-9]+$' then null::text else substring(p_objekt_id from '^(.*)_[0-9]+$') end
  where p_objekt_id ~ '^[0-9]+$' or p_objekt_id ~ '^.+_[0-9]+$';
$$;
