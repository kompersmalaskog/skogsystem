/**
 * POST /api/maskin/las — maskinen låser sig: personens session upphör att gälla på servern. Webbläsaren skickar personens
 * access-token i Authorization: Bearer (den är på väg att kastas), och servern spärrar just den sessionen. Maskinkontots egen session
 * berörs aldrig (vägras uttryckligen). Anropet är best effort från webbläsaren — går det inte fram gäller ändå att sessionen kastas
 * lokalt och att personens token går ut av sig själv.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "Ingen token" }, { status: 401 });
  const db = adminSupabase();
  const u = await db.auth.getUser(token);
  const id = u.data?.user?.id;
  if (!id) return NextResponse.json({ ok: false, error: "Ogiltig token" }, { status: 401 });
  const { data: med } = await db.from("medarbetare").select("id, roll").eq("user_id", id).maybeSingle();
  if (!med || med.roll === "maskin") return NextResponse.json({ ok: false, error: "Det här är maskinens eget konto" }, { status: 403 });
  await db.auth.admin.signOut(token, "local");
  await db.from("maskin_upplasning_logg").insert({ medarbetare_id: med.id, utfall: "las" }).then(() => undefined, () => undefined);
  return NextResponse.json({ ok: true });
}
