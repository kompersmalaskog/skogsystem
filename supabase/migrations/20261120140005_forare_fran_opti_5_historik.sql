-- Föraren från Opti, del 5: historiken. Alla befintliga lass, besökskvittenser och kvittenser räknas om enligt SAMMA regel som
-- nya (triggrarna i del 4 gör arbetet; här rörs bara raderna om). Strukna lass rörs inte. Kvittenstiderna är skyddade av
-- flaggan från del 3 — `kvitterad_at` och `sett_at` ändras inte. Idempotent: en omkörning ger samma rader.
--
-- Körs EFTER del 1–4. Ångra: `update skotar_lass set medarbetare_id = registrerad_av, forare_kalla = null where status <> 'struket';`
-- (`registrerad_av` är den som var inloggad), och för kvittenserna `update … set utford_av = null, utford_kalla = null`.

do $$
begin
  perform set_config('app.forare_omrakning', 'on', true);
  update public.skotar_lass set forare_kalla = forare_kalla where status <> 'struket';
  update public.objekt_besok_kvittens set forare_kalla = forare_kalla where not coalesce(testlage, false);
  update public.korvy_kvittens_forare set utford_kalla = utford_kalla;
  update public.kommentar_sett_forare set utford_kalla = utford_kalla;
  perform set_config('app.forare_omrakning', 'off', true);
end $$;
