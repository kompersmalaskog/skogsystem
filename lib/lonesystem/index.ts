/**
 * Klient-säkra exports — inga node:crypto-beroenden.
 * Server-funktioner importeras DIREKT från './server' i API-routes.
 */
export type { SystemTyp, Koppling, ExternEmployee } from "./types";
export { SYSTEM_LABELS } from "./types";

export const IMPLEMENTERADE: SystemTyp[] = ["fortnox", "csv"];

import type { SystemTyp } from "./types";
