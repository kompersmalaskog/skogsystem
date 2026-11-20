-- Flytten av de tre små tabellerna till verkligt UTC (fakt_skift, hpr_filer, detalj_kontroll_stock; 1 748 + 112 + 2 611 rader).
-- Kördes i prod 2026-10-19 11:18 UTC, direkt EFTER att production förts fram: den nya appen läser via tid_ar_utc och ger samma svar
-- för båda konventionerna, den gamla läste skifttiderna rakt av. Före/efter-kontroll (hash av tiderna via opti_tid_lokal, arbetsdag
-- sep/okt, stammar per dag, hpr_filer, detalj_kontroll_stock) var identisk, se PR-texten.
-- detalj_stam flyttas i omgångar efter kl 18:  select * from opti_tider_till_utc('detalj_stam', 25000);  (upprepa tills 0 rader)
SELECT * FROM opti_tider_till_utc('fakt_skift');
SELECT * FROM opti_tider_till_utc('hpr_filer');
SELECT * FROM opti_tider_till_utc('detalj_kontroll_stock');

DO $kvitto$
DECLARE
  kvar bigint;
BEGIN
  SELECT (SELECT count(*) FROM fakt_skift WHERE NOT tid_ar_utc)
       + (SELECT count(*) FROM detalj_kontroll_stock WHERE NOT tid_ar_utc)
       + (SELECT count(*) FROM hpr_filer WHERE NOT tid_ar_utc) INTO kvar;
  IF kvar <> 0 THEN
    RAISE EXCEPTION 'Opti-tider: % rader är fortfarande märkta som äldre efter flytten', kvar;
  END IF;
  IF EXISTS (SELECT 1 FROM fakt_skift WHERE utloggning_tid > now() + interval '30 minutes') THEN
    RAISE EXCEPTION 'Opti-tider ligger fortfarande i framtiden efter flytten';
  END IF;
END $kvitto$;
