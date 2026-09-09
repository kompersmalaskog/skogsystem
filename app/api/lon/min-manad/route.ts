import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { beraknaLoneunderlag } from "@/lib/lonesystem/loneunderlag";
import { målMedarbetareId } from "@/lib/auth/server";

/**
 * POST /api/lon/min-manad  { arbetsmanad: "YYYY-MM", medarbetare_id?: string }
 *
 * Förarens EGEN tidsspecifikation för en arbetsmånad: exakt de rader som går
 * till Fortnox för honom (löneart, mängd, enhet), det som saknas (obekräftat,
 * obesvarad brandrisk, oförklarade tidsavvikelser) och dag för dag.
 *
 * Identiteten härleds ur sessionen (målMedarbetareId): egen id alltid; ett
 * främmande id accepteras bara för admin/chef, annars 403. 401 utan session,
 * 404 utan medarbetare-träff — aldrig fallback till "första bästa".
 *
 * SAMMA beräkning som exporten (lib/lonesystem/loneunderlag) — specen kan aldrig
 * säga något annat än löneunderlaget. Räknas vid varje anrop; inget cachas.
 */
export const dynamic = "force-dynamic";

export function loneperiodFranArbetsmanad(arbetsmanad: string): string {
  const [å, m] = arbetsmanad.split("-").map(Number);
  const d = new Date(å, m, 1); // m är 1-baserad → nästa månad
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const arbetsmanad: string | undefined = body.arbetsmanad;
  if (!arbetsmanad || !/^\d{4}-\d{2}$/.test(arbetsmanad)) {
    return NextResponse.json({ ok: false, error: "arbetsmanad (YYYY-MM) krävs" }, { status: 400 });
  }
  const mål = await målMedarbetareId(body.medarbetare_id);
  if (!mål.ok) return mål.res;

  try {
    const period = loneperiodFranArbetsmanad(arbetsmanad);
    const u = await beraknaLoneunderlag(serverSupabase(), { period, medarbetareIds: [mål.id] });
    const min = u.berikad.find(r => r.medarbetare_id === mål.id) ?? null;
    return NextResponse.json(
      { ok: true, arbetsmanad, loneperiod: period, medarbetare: min },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
