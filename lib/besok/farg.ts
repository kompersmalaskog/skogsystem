// Maskinernas färg på besökssidans karta: samma som i resten av appen — skördaren lila, skotaren grön (lib/sparStil, de absoluta rollfärgerna).
// (Martin 2026-10-24 rättade sin egen order om gul: skördaren ska vara lila överallt.)
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil';
import type { MaskinRoll } from './sakerhet';

export const BESOK_MASKINFARG: Record<MaskinRoll, string> = { skordare: ROLLFARG_SKORDARE, skotare: ROLLFARG_SKOTARE };
