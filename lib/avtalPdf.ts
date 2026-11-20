// Avtalets PDF ("Läs hela avtalet" i Mitt avtal, uppladdning i Admin → Avtal).
//
// Filen ligger i den PRIVATA Storage-bucketen `avtal` (aldrig i public/: avtalet kommer från Grönas medlemssidor och ska bara
// nå inloggade). Vilken fil som gäller styrs av gs_avtal.avtal_pdf_path — nytt avtal = ny uppladdning, ingen kodändring.
// Läsning går via en signerad länk med kort giltighet. Förut öppnade knappen `/avtal/skogsavtalet-2025-2027.pdf`, en fil som
// aldrig fanns → 404.

export const AVTAL_BUCKET = "avtal";
/** Samma tak som bucketens file_size_limit (migrationen) — klientens kontroll är den begripliga felvägen. */
export const AVTAL_PDF_MAX_BYTES = 20 * 1024 * 1024;
/** Hur länge den signerade länken gäller. Länken öppnas direkt; den sparas aldrig. */
export const SIGNERAD_LANK_SEKUNDER = 60;

export const MEDD_EJ_UPPLADDAT = "Avtalet är inte uppladdat än";
export const MEDD_KUNDE_INTE_OPPNA = "Kunde inte öppna avtalet just nu. Försök igen om en stund.";

/** Sökvägen en uppladdning får: en fil per avtalsrad, ny uppladdning ersätter den förra (upsert). */
export function avtalPdfPath(avtalId: string): string {
  return `${avtalId}.pdf`;
}

type StorageFel = { message?: string; statusCode?: string | number; status?: string | number } | null | undefined;

/** "Filen finns inte" ur Storages felsvar (ett saknat objekt eller en saknad bucket). RLS som döljer objektet ser likadant ut. */
export function arSaknadFil(fel: StorageFel): boolean {
  if (!fel) return false;
  const kod = String(fel.statusCode ?? fel.status ?? "");
  return kod === "404" || /not.?found|does not exist/i.test(String(fel.message || ""));
}

export type SigneringsResultat =
  | { ok: true; url: string }
  | { ok: false; skal: "saknas" | "fel"; meddelande: string };

type StorageKlient = { storage: { from: (b: string) => { createSignedUrl: (path: string, sek: number) => Promise<{ data: { signedUrl?: string } | null; error: StorageFel }> } } };

/**
 * Signerad länk till avtalets PDF. Saknas sökvägen eller filen är resultatet `saknas` ("Avtalet är inte uppladdat än") — aldrig
 * en 404-sida. Alla andra fel (nät, session) är `fel` och säger att man kan försöka igen.
 */
export async function signeraAvtalPdf(supabase: StorageKlient, path: string | null | undefined): Promise<SigneringsResultat> {
  const p = (path || "").trim();
  if (!p) return { ok: false, skal: "saknas", meddelande: MEDD_EJ_UPPLADDAT };
  try {
    const { data, error } = await supabase.storage.from(AVTAL_BUCKET).createSignedUrl(p, SIGNERAD_LANK_SEKUNDER);
    if (error) return arSaknadFil(error)
      ? { ok: false, skal: "saknas", meddelande: MEDD_EJ_UPPLADDAT }
      : { ok: false, skal: "fel", meddelande: MEDD_KUNDE_INTE_OPPNA };
    if (!data?.signedUrl) return { ok: false, skal: "fel", meddelande: MEDD_KUNDE_INTE_OPPNA };
    return { ok: true, url: data.signedUrl };
  } catch {
    return { ok: false, skal: "fel", meddelande: MEDD_KUNDE_INTE_OPPNA };
  }
}

/** Kontroll före uppladdning. null = godkänd, annars en mening som säger vad man ska göra. */
export function kontrolleraAvtalPdf(fil: { name?: string; type?: string; size?: number } | null | undefined): string | null {
  if (!fil) return "Välj en PDF-fil.";
  const arPdf = fil.type === "application/pdf" || (!fil.type && /\.pdf$/i.test(fil.name || ""));
  if (!arPdf) return "Filen är inte en PDF. Välj avtalet som PDF-fil.";
  if (!fil.size) return "Filen är tom. Välj avtalet som PDF-fil igen.";
  if (fil.size > AVTAL_PDF_MAX_BYTES) return `Filen är för stor (${Math.round(fil.size / 1048576)} MB). Största tillåtna är ${AVTAL_PDF_MAX_BYTES / 1048576} MB.`;
  return null;
}

/**
 * Öppnar avtalets PDF i en ny flik. Fliken öppnas SYNKRONT i klicket (en webbläsare blockerar window.open efter ett await) och
 * får sin adress när den signerade länken finns; blockeras fliken byter sidan själv adress. Misslyckas signeringen stängs fliken
 * och resultatet säger varför (`saknas` = "Avtalet är inte uppladdat än").
 */
export async function oppnaAvtalPdf(supabase: StorageKlient, path: string | null | undefined): Promise<SigneringsResultat> {
  const flik = typeof window !== "undefined" ? window.open("", "_blank") : null;
  const r = await signeraAvtalPdf(supabase, path);
  if (!r.ok) {
    if (flik) flik.close();
    return r;
  }
  if (flik) flik.location.href = r.url;
  else if (typeof window !== "undefined") window.location.href = r.url;
  return r;
}
