/**
 * GET /api/maskin/vem — arket "Vem är du?": vilka som kan låsa upp maskinen. Bara maskinkontot (med brytaren på) får svar.
 * Webbläsaren kan inte läsa medarbetare (RLS: bara den egna raden), så namnen kommer härifrån — bara id, namn, roll och om personen
 * har valt en kod. Maskinens förare (samma regel som schema_forare i databasen: den aktiva föraren på maskinen som inte är ledig)
 * står först, sedan övriga förare, sist arbetsledningen.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/auth/admin";
import { kravMaskinkonto, nej } from "@/lib/maskinkonto/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const vakt = await kravMaskinkonto();
  if (!vakt.ok) return vakt.res;
  const db = adminSupabase();

  const [med, koder, schema] = await Promise.all([
    db.from("medarbetare").select("id, namn, roll, maskin_id").eq("aktiv", true).in("roll", ["forare", "admin"]).order("namn"),
    db.from("forare_maskinkod").select("medarbetare_id"),
    db.rpc("schema_forare", { p_maskin: vakt.maskinId, p_tid: new Date().toISOString() }),
  ]);
  if (med.error || koder.error) return nej(500, "Kunde inte läsa personerna.");
  const harKod = new Set((koder.data ?? []).map((r: { medarbetare_id: string }) => r.medarbetare_id));
  const schemaId: string | null = typeof schema.data === "string" ? schema.data : null;

  type Rad = { id: string; namn: string; roll: string; maskin_id: string | null };
  const rang = (p: Rad) => (p.id === schemaId ? 0 : p.roll === "forare" && p.maskin_id === vakt.maskinId ? 1 : p.roll === "forare" ? 2 : 3);
  const personer = ((med.data ?? []) as Rad[])
    .sort((a, b) => rang(a) - rang(b) || a.namn.localeCompare(b.namn, "sv"))
    .map((p) => ({ id: p.id, namn: p.namn, roll: p.roll, harKod: harKod.has(p.id) }));

  return NextResponse.json({ ok: true, personer });
}
