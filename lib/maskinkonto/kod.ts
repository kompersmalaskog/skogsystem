// Koden för maskinen: fyra siffror per person. ENDAST serverkod (importerar node:crypto) — hashen läggs i forare_maskinkod,
// som inte går att läsa från webbläsaren. Koden sparas aldrig läsbart: scrypt med eget salt per person och en hemlighet ("peppar", MASKIN_KOD_PEPPAR) som bara
// finns på servern, så en läckt databasrad inte räcker för att prova de 10 000 möjliga koderna offline.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const KOD_LANGD = 4;

/** Exakt fyra siffror. Allt annat (mellanslag, bokstäver, fem siffror) avvisas. */
export function arGiltigKod(kod: unknown): kod is string {
  return typeof kod === "string" && /^\d{4}$/.test(kod);
}

/** ENDAST MASKIN_KOD_PEPPAR — aldrig en reserv till service-nyckeln: nyckeln ska kunna bytas (före Vida-piloten) utan att alla koder slutar fungera. */
export const kodPepparFinns = (): boolean => !!process.env.MASKIN_KOD_PEPPAR;

function peppar(): string {
  const p = process.env.MASKIN_KOD_PEPPAR;
  if (!p) throw new Error("MASKIN_KOD_PEPPAR saknas i servermiljön (lägg in den i Vercel)");
  return p;
}

function hasha(kod: string, salt: string): Buffer {
  return scryptSync(`${peppar()}:${kod}`, Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 });
}

export function skapaHash(kod: string): { kod_hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  return { kod_hash: hasha(kod, salt).toString("hex"), salt };
}

/** Saknas peppar KASTAR den (aldrig ett tyst "fel kod"): rutterna kontrollerar kodPepparFinns() först och svarar 500 utan att räkna något försök. */
export function stammerKod(kod: string, rad: { kod_hash: string; salt: string }): boolean {
  const a = hasha(kod, rad.salt);
  const b = Buffer.from(rad.kod_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Slumpat lösenord för ett maskinkonto (visas en enda gång i appen). */
export function slumpLosenord(): string {
  return randomBytes(18).toString("base64url");
}
