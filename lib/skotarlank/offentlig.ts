// Skotarlänken: vilka adresser som är öppna utan inloggning. EXAKT skotarsidan och dess rutter med en lång slumpad token i adressen — inget annat.
// Middleware släpper igenom dem (och bara dem) och sätter noindex; `AppRamverk` hoppar över appens egna startare på sidan.

import { TOKEN_MIN_TECKEN } from '@/lib/besok/konstanter';

const TOKEN = `[A-Za-z0-9_-]{${TOKEN_MIN_TECKEN},128}`;
const SIDA = new RegExp(`^/skotare/${TOKEN}/?$`);
const API = new RegExp(`^/api/skotare/${TOKEN}(?:/(?:karta|foto|manifest))?/?$`);

export const arSkotarSida = (sokvag: string): boolean => SIDA.test(sokvag);
export const arSkotarApi = (sokvag: string): boolean => API.test(sokvag);
export const arOffentligSkotarSokvag = (sokvag: string): boolean => arSkotarSida(sokvag) || arSkotarApi(sokvag);

export const arGiltigtSkotarToken = (t: unknown): t is string => typeof t === 'string' && new RegExp(`^${TOKEN}$`).test(t);

/** Länken skotaren får. `origin` = adressen appen körs på just nu. */
export const skotarUrl = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}/skotare/${token}`;
