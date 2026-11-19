import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { lasVaderLage, type VaderSvar } from "@/lib/kalibrering/vaderServer";

/**
 * GET /api/kalibrering/vader?maskin_id=X — vädret vid maskinen nu och vid senaste kontrollen (SMHI:s närmaste station), för Läget › Kontrollerna.
 * Alla inloggade (förarna ska se det). Regeln i lib/kalibrering/vaderOmslag, läsningen i lib/kalibrering/vaderServer (samma som pushen).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const maskinId = new URL(req.url).searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, orsak: "las", fel: "maskin_id krävs" } satisfies VaderSvar, { status: 400 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    return NextResponse.json(await lasVaderLage(supabase, maskinId));
  } catch (e) {
    return NextResponse.json({ ok: false, orsak: "las", fel: (e as Error).message } satisfies VaderSvar, { status: 500 });
  }
}
