import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { beraknaLoneunderlag } from "@/lib/lonesystem/loneunderlag";
import { ritaTidsspec } from "@/lib/lonesystem/tidsspecPdf";
import { målMedarbetareId } from "@/lib/auth/server";
import { loneperiodFranArbetsmanad } from "../route";

/**
 * GET /api/lon/min-manad/pdf?arbetsmanad=YYYY-MM[&medarbetare_id=]
 *
 * Förarens tidsspecifikation som PDF (A4) — SAMMA beräkning som skärmen och
 * exporten (beraknaLoneunderlag), ritad server-side med pdf-lib. Inga kronor.
 * Öppnas som länk i appen → iOS visar PDF:en med delningsarket (Spara i Filer,
 * skicka). Identitet ur sessionen (målMedarbetareId), aldrig ur URL:en.
 *
 * Själva sidan ritas i lib/lonesystem/tidsspecPdf.ts (svaret först, lönen med
 * förklaring i ord, dagarna per vecka; Fortnox-koderna bara i foten).
 */
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const arbetsmanad = req.nextUrl.searchParams.get("arbetsmanad") || "";
  if (!/^\d{4}-\d{2}$/.test(arbetsmanad)) {
    return NextResponse.json({ ok: false, error: "arbetsmanad (YYYY-MM) krävs" }, { status: 400 });
  }
  const mål = await målMedarbetareId(req.nextUrl.searchParams.get("medarbetare_id"));
  if (!mål.ok) return mål.res;

  try {
    const period = loneperiodFranArbetsmanad(arbetsmanad);
    const u = await beraknaLoneunderlag(serverSupabase(), { period, medarbetareIds: [mål.id] });
    const m = u.berikad.find(r => r.medarbetare_id === mål.id) ?? null;
    const bytes = await ritaTidsspec(arbetsmanad, m);
    const [å, mm] = arbetsmanad.split("-");
    const namnSlug = (m?.namn || "medarbetare").toLowerCase().replace(/[^a-z0-9åäö]+/gi, "-");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="tidsspecifikation-${å}-${mm}-${namnSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
