alter policy "dim_objekt_sortiment_fonster_select" on public.dim_objekt_sortiment_fonster to authenticated;
alter policy "dim_objekt_sortiment_fonster_admin_write" on public.dim_objekt_sortiment_fonster to authenticated;
revoke all on public.dim_objekt_sortiment_fonster from anon;