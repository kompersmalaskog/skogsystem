// Vilka adresser som är öppna utan inloggning. EXAKT besökssidan och dess tre rutter med en lång slumpad token i adressen — inget annat.
// Middleware släpper igenom dem (och bara dem); `AppRamverk` hoppar över appens egna startare på just dessa sidor.

import { TOKEN_MIN_TECKEN } from './konstanter';

const TOKEN = `[A-Za-z0-9_-]{${TOKEN_MIN_TECKEN},128}`;
const SIDA = new RegExp(`^/besok/${TOKEN}/?$`);
const API = new RegExp(`^/api/besok/${TOKEN}(?:/(?:anmal|karta))?/?$`);

export const arBesoksSida = (sokvag: string): boolean => SIDA.test(sokvag);
export const arBesoksApi = (sokvag: string): boolean => API.test(sokvag);
export const arOffentligBesokSokvag = (sokvag: string): boolean => arBesoksSida(sokvag) || arBesoksApi(sokvag);

export const arGiltigtToken = (t: unknown): t is string => typeof t === 'string' && new RegExp(`^${TOKEN}$`).test(t);

/** Länken markägaren får. `origin` = adressen appen körs på just nu. */
export const besoksUrl = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}/besok/${token}`;
