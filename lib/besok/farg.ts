// Maskinernas färg på besökssidans karta. Skördaren är GUL här (Martin 2026-10-23: "gul, som i resten av appen"), skotaren grön som överallt.
// OBS: appens rollfärg för skördare är lila (lib/sparStil ROLLFARG_SKORDARE) – besökskartan avviker medvetet och bara här; markägaren ser ingen annan vy.
import { FARG } from '@/lib/design/tokens';
import { ROLLFARG_SKOTARE } from '@/lib/sparStil';
import type { MaskinRoll } from './sakerhet';

export const BESOK_MASKINFARG: Record<MaskinRoll, string> = { skordare: FARG.gul, skotare: ROLLFARG_SKOTARE };
