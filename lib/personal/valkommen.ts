// /valkommen: den inbjudna väljer lösenord. Ren logik för sidan, testad i valkommen.test.ts.

export const LOSEN_MIN = 8;

/** Fel i adressens #-del (Supabase lägger dem där): `#error=access_denied&error_code=otp_expired&...`. */
export function lankFel(hash: string): "utgangen" | "annat" | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  if (!p.get("error") && !p.get("error_code") && !p.get("error_description")) return null;
  return p.get("error_code") === "otp_expired" ? "utgangen" : "annat";
}

export function kontrolleraLosen(losen: string, igen: string): string | null {
  if (losen.length < LOSEN_MIN) return `Lösenordet måste vara minst ${LOSEN_MIN} tecken.`;
  if (losen !== igen) return "Lösenorden är olika.";
  return null;
}
