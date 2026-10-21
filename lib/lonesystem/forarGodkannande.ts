// Förarens godkännande av månaden styr Fortnox-exporten (Admin → Lön, Martin 2026-10-21).
//
// Godkännandet ligger där det alltid legat: `loneunderlag` (en rad per förare och ARBETSMÅNAD, period "2026-09"). Föraren godkänner i
// Arbetsrapport (status 'godkand_av_forare'; äldre rader har 'inskickat'). Är status NULL gäller inget godkännande: det är så en
// ändring i en godkänd månad nollställer det (migration 20261021100000) och Arbetsrapport visar då Godkänn-knappen igen.
// Skickat till Fortnox är en annan sak (fortnox_export_logg) och vinner alltid i visningen.
//
// Ren modul (ingen Supabase-import): används av lönemotorn, exportroutern, notiserna och Admins vyer.

/** Förarens eget godkännande av månaden. 'vantar' = inget godkännande finns (aldrig givet, eller nollställt av en ändring). */
export type Godkannande = "godkand" | "vantar";

/** Det Admin ser på förarkortet. Företagsledare har ingen (lönen ligger utanför appen). */
export type ForarStatus = "vantar" | "godkand" | "skickad";

export const GODKANDA_STATUS = ["godkand_av_forare", "inskickat"] as const;

export const arGodkandStatus = (status: unknown): boolean => status === "godkand_av_forare" || status === "inskickat";

export const godkannandeAv = (status: unknown): Godkannande => (arGodkandStatus(status) ? "godkand" : "vantar");

/** Det enda sättet en rad räknas som skickbar: godkänd av föraren — eller uttryckligen vald av admin, en förare i taget. */
type Sandbar = { status: string; godkannande?: string; foretagsledare?: boolean };

export function arSandbar(m: Sandbar, utanGodkannande = false): boolean {
  if (m.foretagsledare === true) return false;
  if (m.status === "skickat") return false;
  return utanGodkannande || m.godkannande === "godkand";
}

/** Förare som VÄNTAR på sitt eget godkännande (och som annars hade skickats). Skickade och företagsledare räknas inte. */
export function vantandeForare<T extends Sandbar & { medarbetare_id: string; namn: string }>(rader: T[]): { medarbetare_id: string; namn: string }[] {
  return rader
    .filter(m => m.foretagsledare !== true && m.status !== "skickat" && m.godkannande !== "godkand")
    .map(m => ({ medarbetare_id: m.medarbetare_id, namn: m.namn }));
}

export function forarStatus(m: Sandbar): ForarStatus | null {
  if (m.foretagsledare === true) return null;
  if (m.status === "skickat") return "skickad";
  return m.godkannande === "godkand" ? "godkand" : "vantar";
}

export const FORAR_STATUS_TEXT: Record<ForarStatus, string> = {
  vantar: "Väntar på föraren",
  godkand: "Godkänd av föraren",
  skickad: "Skickad",
};
