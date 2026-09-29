import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { målMedarbetareId, ADMIN_ROLLER } from "@/lib/auth/server";
import { geokodaMedarbetare } from "@/lib/geokod";

export const dynamic = "force-dynamic";

/**
 * POST /api/medarbetare/geokoda { id?, tvinga?, acceptera? }
 * Geokodar en medarbetares hemadress (lib/geokod) och svarar med vad adressen
 * hamnade på. Föraren får geokoda SIN EGEN adress (efter att ha sparat den i
 * Inställningar); admin/chef vem som helst. `tvinga` (skriv över en gps/manuell
 * punkt) och `acceptera` (använd ett osäkert förslag ändå) är admin-beslut.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const v = await målMedarbetareId(typeof body?.id === "string" ? body.id : null);
  if (!v.ok) return v.res;
  const arAdmin = !!v.session.roll && (ADMIN_ROLLER as readonly string[]).includes(v.session.roll);
  if ((body?.tvinga || body?.acceptera) && !arAdmin) {
    return NextResponse.json({ ok: false, error: "Bara admin kan skriva över eller godkänna en osäker punkt" }, { status: 403 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const res = await geokodaMedarbetare(sb, v.id, { tvinga: !!body?.tvinga, acceptera: !!body?.acceptera });
  if ("fel" in res) return NextResponse.json({ ok: false, error: res.fel }, { status: 422 });
  return NextResponse.json({ ok: true, ...res });
}
