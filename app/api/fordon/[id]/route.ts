import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// KOMPATIBILITETS-SHIM (#6). Redigering via gamla vyn är pausad tills den byggs
// om. Returnerar både `error` och `meddelande` med samma text: klientens
// spara-väg läser body.error, och `meddelande` täcker den nya formen — ingen
// "Fel: undefined".
const PAUSAD = {
  ok: false,
  error: "Fordonsvyn byggs om — redigering är pausad",
  meddelande: "Fordonsvyn byggs om — redigering är pausad",
};

export async function PATCH() {
  return NextResponse.json(PAUSAD, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json(PAUSAD, { status: 405 });
}
