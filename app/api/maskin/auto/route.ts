/**
 * POST /api/maskin/auto — { maskin_id }: enheten är en riktig maskindator (maskinens GPS ansluten) och vill bli maskinen.
 *
 * Bara en inloggad förare eller admin kan utlösa det (kravPerson — aldrig maskinkontot självt, aldrig en utloggad). Servern kontrollerar:
 *  1. maskinen finns, är en skördare/skotare och är inte avvecklad,
 *  2. brytaren för just den maskinen är PÅ (annars 403 { fel: 'av' } och ingenting skapas — maskinen fungerar som förut),
 *  3. kontot finns, annars skapas det (lib/maskinkonto/autoKonto): auth-användare, medarbetarrad roll 'maskin', koppling.
 * Svaret är en engångstoken (token_hash) för MASKINENS konto som webbläsaren byter mot en session — samma sak som vid en upplåsning, men åt andra
 * hållet. Svaret bär aldrig adressen, lösenordet eller något annat om kontot. Varje utfall loggas i maskin_upplasning_logg.
 *
 * Webbläsaren avgör själv att datorn är en maskindator (Web Serial-GPS, vald maskin, inte testläget). Servern kan inte se det — den litar på att en
 * inloggad person som ber om det vill det, och det en person får ut är ett SNÄVARE konto än hens eget.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/auth/admin";
import { kravPerson, nej } from "@/lib/maskinkonto/server";
import { sakraMaskinkonto } from "@/lib/maskinkonto/autoKonto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const vakt = await kravPerson();
  if (!vakt.ok) return vakt.res;
  const body = await request.json().catch(() => null) as { maskin_id?: unknown } | null;
  if (!body || typeof body.maskin_id !== "string" || !body.maskin_id.trim() || body.maskin_id.length > 64) return nej(400, "Fel indata");
  const maskinId = body.maskin_id.trim();

  const db = adminSupabase();
  const logga = (utfall: string, detalj?: string) =>
    db.from("maskin_upplasning_logg").insert({ maskin_id: maskinId, medarbetare_id: vakt.medarbetareId, utfall, detalj: detalj ?? null }).then(() => undefined, () => undefined);

  const idag = new Date().toISOString().slice(0, 10);
  const { data: maskin } = await db.from("dim_maskin").select("maskin_id, visningsnamn, maskin_typ, aktiv_till").eq("maskin_id", maskinId).maybeSingle();
  if (!maskin || !["Harvester", "Forwarder"].includes(maskin.maskin_typ ?? "") || (maskin.aktiv_till && maskin.aktiv_till < idag)) {
    await logga("auto_nekad", "okänd eller avvecklad maskin");
    return nej(404, "Maskinen finns inte.", { fel: "okand" });
  }
  const { data: brytare } = await db.from("maskin_konto").select("aktiv").eq("maskin_id", maskinId).maybeSingle();
  if (!brytare?.aktiv) {
    await logga("auto_nekad", "brytaren är av");
    return nej(403, "Maskinkonto är inte påslaget för den här maskinen.", { fel: "av" });
  }

  const konto = await sakraMaskinkonto(db, maskin, vakt.medarbetareId);
  if (!konto.ok) { await logga("auto_nekad", konto.fel); return nej(konto.status, konto.fel, { fel: "konto" }); }
  if (konto.skapad) await logga("auto_konto", "skapades vid första starten");

  const lank = await db.auth.admin.generateLink({ type: "magiclink", email: konto.epost });
  const tokenHash = lank.data?.properties?.hashed_token;
  if (lank.error || !tokenHash) { await logga("auto_nekad", "ingen engångstoken"); return nej(500, "Kunde inte byta till maskinens konto just nu.", { fel: "token" }); }

  await logga("auto_inloggad");
  return NextResponse.json({ ok: true, token_hash: tokenHash, maskin_id: maskinId, skapad: konto.skapad });
}
