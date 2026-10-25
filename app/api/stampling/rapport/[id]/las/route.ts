// Läs en uppladdad stämplingsrapport med Claude (dokument → JSON) och kontrollera den med vanlig kod.
//
// AI:n LÄSER bara. Kontrollen (lib/stampling/pdf/kontroll.ts) summerar de inlästa raderna och jämför mot rapportens
// egna tryckta summor, på antal OCH volym m3sk per trädslag. Stämmer allt → status 'stammer'. Annars 'avviker' med
// ÅTGÄRD BEHÖVS, och användaren rättar rader i appen. Läsningen sparas orörd i `las`.
// Själva läsningen bor i lib/stampling/pdf/franObjekt.ts (lasRapport), så den automatiska läsningen gör exakt samma sak.
//
// En läsning kan ta en minut för en inskannad rapport — därför maxDuration 300.
import { NextResponse } from 'next/server';
import { kravInloggad } from '@/lib/auth/server';
import { lasRapport } from '@/lib/stampling/pdf/franObjekt';
import { adminKlient, arUuid, tillSvar } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const v = await kravInloggad();
  if (!v.ok) return v.res;
  if (!arUuid(params.id)) return NextResponse.json({ ok: false, error: 'Ogiltigt id.' }, { status: 400 });
  const r = await lasRapport(adminKlient(), params.id);
  if (!r.ok) return NextResponse.json({ ok: false, kod: r.kod, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, rapport: tillSvar(r.v.rad), varningar: r.v.varningar, tokens: r.v.tokens });
}
