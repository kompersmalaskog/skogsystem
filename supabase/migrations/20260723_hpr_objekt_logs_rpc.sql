-- RPC som returnerar ETT objekts alla stockar som en jsonb-array i ETT anrop.
-- PostgREST kapar radbaserade svar vid max-rows (1000) — en 50k-stammars trakt
-- skulle annars kräva 50 round-trips och riskera Vercels 60s-tak. En funktion
-- som returnerar en enda jsonb-rad kringgår radtaket och sorterar deterministiskt.
create or replace function hpr_objekt_logs(p_object_key text)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stem_key', stem_key,
        'log_key', log_key,
        'product_key', product_key,
        'length_cm', length_cm,
        'dia_top_ob_mm', dia_top_ob_mm,
        'dia_top_ub_mm', dia_top_ub_mm,
        'vol_price_m3', vol_price_m3,
        'vol_sob_m3', vol_sob_m3,
        'vol_sub_m3', vol_sub_m3,
        'cutting_reason', cutting_reason,
        'harvest_date', harvest_date
      )
      order by stem_key, log_key
    ),
    '[]'::jsonb
  )
  from logs
  where object_key = p_object_key;
$$;
