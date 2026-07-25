import { NextResponse } from "next/server";
import { autentisera, supaService } from "@/lib/resurs-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// KOMPATIBILITETS-SHIM (#6). Mappar nya resurs+kontroll tillbaka till den gamla
// Fordon-formen så nuvarande FordonsoversiktClient fungerar oförändrad tills
// vyn byggs om. ENBART läsning — skatt/försäkring utgår (returneras null).
// Kastas i nästa steg.

type NyTyp = "bil" | "lastbil" | "slap" | "maskin" | "cistern";

// Nya resurstyper → gammal (typ, grupp) som klienten känner igen.
function gammalTypGrupp(typ: NyTyp): { typ: string; grupp: string } {
  switch (typ) {
    case "bil":     return { typ: "bil",   grupp: "bil" };
    case "lastbil": return { typ: "lastbil", grupp: "lastbil_slap" };
    case "slap":    return { typ: "slap",  grupp: "lastbil_slap" };
    case "maskin":  return { typ: "annan", grupp: "maskin" };
    case "cistern": return { typ: "annan", grupp: "maskin" };
  }
}

export async function GET() {
  const { user } = await autentisera();
  if (!user) return NextResponse.json({ ok: false, error: "Ej inloggad" }, { status: 401 });

  const supabase = supaService();
  const { data, error } = await supabase
    .from("resurs")
    .select("id, namn, regnr, typ, matarstallning, anteckning, kontroll(*)")
    .eq("aktiv", true)
    .order("typ")
    .order("namn");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const fordon = (data || []).map((r: any) => {
    const { typ, grupp } = gammalTypGrupp(r.typ);
    const arMaskin = r.typ === "maskin";
    const kontroller: any[] = r.kontroll || [];
    const besiktning = kontroller.find((k) => k.typ === "besiktning" && k.aktiv);
    const service = kontroller.find((k) => k.typ === "service" && k.aktiv);

    return {
      id: r.id,
      namn: r.namn,
      regnr: r.regnr,
      typ,
      grupp,
      besiktning_datum: besiktning?.nasta_forfall ?? null,
      forsakring_datum: null, // utgår
      skatt_datum: null,      // utgår
      service_datum: service?.nasta_forfall ?? null,
      service_timmar: arMaskin ? service?.nasta_matarvarde ?? null : null,
      nuvarande_timmar: arMaskin ? r.matarstallning ?? null : null,
      service_km: arMaskin ? null : service?.nasta_matarvarde ?? null,
      nuvarande_km: arMaskin ? null : r.matarstallning ?? null,
      anteckning: r.anteckning,
    };
  });

  return NextResponse.json({ ok: true, fordon });
}
