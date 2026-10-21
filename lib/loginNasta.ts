// Inloggningen tar dig tillbaka dit du skulle.
//
// Förut skickade inloggningen alltid till startsidan: en länk till /inventarier (eller en QR-kod på en låda, som öppnar
// /i/<id> i Safari där man kanske inte är inloggad) hamnade på startsidan efter inloggningen. Nu bär middleware med
// adressen som ?nasta= till /login, och inloggningen går dit.
//
// Bara en sökväg inom appen godtas: den ska börja med ETT snedstreck. "//evil.se" och "/\evil.se" är adresser till en
// annan sajt i webbläsaren och avvisas, liksom /login (en slinga) och allt med styrtecken.

export const NASTA_PARAM = 'nasta';

export function sakerNasta(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.length === 0 || s.length > 500) return null;
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  const vag = s.split(/[?#]/)[0];
  if (vag === '/login' || vag.startsWith('/login/')) return null;
  return s;
}

/** Sökningen till /login: "?nasta=%2Finventarier" — tom för startsidan (dit går man ändå). */
export function loginSok(pathname: string, search: string): string {
  const nasta = sakerNasta(pathname + (search || ''));
  if (!nasta || nasta === '/') return '';
  return `?${NASTA_PARAM}=${encodeURIComponent(nasta)}`;
}
