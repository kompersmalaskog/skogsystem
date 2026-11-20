/**
 * POST /api/maskin/las-upp — en person låser upp maskinen med sin kod: { medarbetare_id, kod }.
 *
 * Bara maskinkontot (brytaren på) får anropa. Koden kontrolleras HÄR, aldrig i webbläsaren:
 *  1. personen måste vara en aktiv förare/admin med inloggning och ha valt en kod,
 *  2. felräknaren (databasen) släpper bara fem fel i rad — det sjätte försöket får en minuts väntan, oberoende av enhet,
 *  3. rätt kod → servern skapar en engångstoken för just den personens konto (token_hash) som webbläsaren byter mot en session.
 * Varje utfall loggas (maskin_upplasning_logg). Svaret bär aldrig koden eller hashen.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/auth/admin";
import { arGiltigKod, kodPepparFinns, stammerKod } from "@/lib/maskinkonto/kod";
import { kravMaskinkonto, nej, pepparSaknas } from "@/lib/maskinkonto/server";
import { koaMaskinKodSparr } from "@/lib/maskinkonto/notis";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const vakt = await kravMaskinkonto();
  if (!vakt.ok) return vakt.res;
  const body = await request.json().catch(() => null) as { medarbetare_id?: unknown; kod?: unknown } | null;
  if (!body || typeof body.medarbetare_id !== "string" || !UUID.test(body.medarbetare_id) || !arGiltigKod(body.kod)) return nej(400, "Fel indata");
  if (!kodPepparFinns()) return pepparSaknas();       // före allt som räknar: saknad konfiguration är aldrig "fel kod"

  const db = adminSupabase();
  const logga = (utfall: string, medarbetareId: string | null, detalj?: string) =>
    db.from("maskin_upplasning_logg").insert({ maskin_id: vakt.maskinId, medarbetare_id: medarbetareId, utfall, detalj: detalj ?? null }).then(() => undefined, () => undefined);

  const { data: p } = await db.from("medarbetare").select("id, namn, roll, aktiv, user_id").eq("id", body.medarbetare_id).maybeSingle();
  if (!p || !p.aktiv || !p.user_id || (p.roll !== "forare" && p.roll !== "admin")) {
    await logga("avslagen", null, "okänd eller inaktiv person");
    return nej(404, "Personen finns inte");
  }

  const { data: rad } = await db.from("forare_maskinkod").select("kod_hash, salt").eq("medarbetare_id", p.id).maybeSingle();
  if (!rad) { await logga("ingen_kod", p.id); return nej(409, "Välj din kod i telefonen först", { fel: "ingen_kod" }); }

  // Försöket räknas FÖRE kontrollen, så parallella gissningar inte hinner före varandra.
  const gate = await db.rpc("maskin_kod_forsok", { p_med: p.id });
  const g = Array.isArray(gate.data) ? gate.data[0] : gate.data;
  if (gate.error || !g) return nej(500, "Kunde inte kontrollera koden.");
  if (!g.tillat) {
    await logga("vantar", p.id);
    return nej(429, "Vänta en minut", { fel: "vantar", vantar_till: g.vantar_till });
  }

  if (!stammerKod(body.kod, rad)) {
    const fel = await db.rpc("maskin_kod_fel", { p_med: p.id });
    const f = (Array.isArray(fel.data) ? fel.data[0] : fel.data) as { vantar_till?: string | null; timme?: boolean } | null;
    await logga("fel_kod", p.id);
    if (f?.timme) {
      // Tio fel i rad: en timmes väntan, och admin får veta det (en notis köas och skickas direkt).
      await logga("spard_timme", p.id, "tio fel i rad");
      const { data: m } = await db.from("dim_maskin").select("visningsnamn").eq("maskin_id", vakt.maskinId).maybeSingle();
      await koaMaskinKodSparr(db, { medarbetareId: p.id, namn: p.namn, maskinId: vakt.maskinId, maskinNamn: m?.visningsnamn ?? vakt.maskinId, till: f.vantar_till ?? null }, request);
    }
    return nej(401, "Fel kod", { fel: "fel_kod", vantar_till: f?.vantar_till ?? null, timme: !!f?.timme });
  }
  await db.rpc("maskin_kod_ratt", { p_med: p.id });

  // Engångstoken för personens EGET konto. Kontot kan inte logga in på något annat sätt än sitt lösenord/inbjudan — den här vägen
  // finns bara bakom koden, och token_hash gäller en gång.
  const anv = await db.auth.admin.getUserById(p.user_id);
  const epost = anv.data?.user?.email;
  if (!epost) return nej(500, "Personens konto saknar e-post.");
  const lank = await db.auth.admin.generateLink({ type: "magiclink", email: epost });
  const tokenHash = lank.data?.properties?.hashed_token;
  if (lank.error || !tokenHash) return nej(500, "Kunde inte låsa upp just nu.");

  await logga("upplast", p.id);
  return NextResponse.json({ ok: true, token_hash: tokenHash, medarbetare_id: p.id, namn: p.namn, roll: p.roll });
}
