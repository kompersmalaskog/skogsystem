-- KÖRS AV MARTIN mot prod FÖRE koden deployas. Skriv inte om.
--
-- OB-ersättning betalas BARA vid brandrisk-beordrad tidig start. Alla andra tidiga
-- (eller sena) starter är förarens eget val på sin egen maskin → ingen OB, oavsett
-- klockslag. Samma klockslag ger alltså OB eller inte beroende på OM starten var
-- beordrad — det går inte att läsa ur tiden, bara föraren vet. Därför lagras svaret.
--
-- brandrisk_beordrad (tre tillstånd):
--   null  = obesvarad (dagen har inte fått frågan, eller föraren har inte svarat)
--   true  = ja, tidig start beordrad pga brandrisk → OB-timmar = start_tid → 06:30
--   false = nej, eget val → ingen OB
--
-- OB-TIMMARNA LAGRAS INTE — de härleds vid visning ur (start_tid, brandrisk_beordrad)
-- via lib/ob.ts (delad av förarkort, admin och framtida Fortnox-export). Lagrade tal
-- driver isär så fort en tid redigeras. Appen räknar TIMMAR; Fortnox äger satsen
-- (ob_kvall_kr) — inga kronor i appen.
--
-- Bara VARDAGSMORGON (start → 06:30). Helg-OB och kvälls-OB byggs ALDRIG (enkelskift,
-- helg kör bara Martin utan OB — verifierat med Martin).

ALTER TABLE arbetsdag ADD COLUMN IF NOT EXISTS brandrisk_beordrad boolean;

COMMENT ON COLUMN arbetsdag.brandrisk_beordrad IS
  'Var den tidiga starten beordrad pga brandrisk? null=obesvarad, true=ja (OB '
  'start_tid→06:30), false=nej/eget val. OB-timmarna lagras EJ — härleds i lib/ob.ts. '
  'Bara vardagsmorgon; frågas när vardag + start_tid < 05:30 + obesvarad.';
