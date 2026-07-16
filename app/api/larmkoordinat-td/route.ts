import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';
import { larmkoordinatFranTdText } from '@/lib/larmkoordinat-td';

// Importerar larmkoordinaten ur Vidas traktdirektiv (PDF) till objekt.larmkoordinat_*.
// Kör server-side: pdf-parsningen ska inte ligga i förarens telefon-bundle.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { objektId } = await req.json();
    if (!objektId) {
      return NextResponse.json({ ok: false, skal: 'objektId saknas' }, { status: 400 });
    }

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !supaKey) {
      return NextResponse.json({ ok: false, skal: 'Serverkonfiguration saknas' }, { status: 500 });
    }
    const supabase = createClient(supaUrl, supaKey);

    const { data: obj, error } = await supabase
      .from('objekt')
      .select('id, traktdirektiv_url, larmkoordinat_kalla')
      .eq('id', objektId)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, skal: 'Kunde inte läsa objektet' }, { status: 500 });
    if (!obj) return NextResponse.json({ ok: false, skal: 'Objektet hittades inte' }, { status: 404 });
    if (!obj.traktdirektiv_url) {
      return NextResponse.json({ ok: false, skal: 'Objektet saknar traktdirektiv' });
    }
    // Överskrivningsregeln: egen (manuellt satt) vinner ALLTID. Vidas är bara startvärde.
    if (obj.larmkoordinat_kalla === 'egen') {
      return NextResponse.json({ ok: false, skal: 'Egen larmkoordinat finns — importerar inte' });
    }

    const pdfSvar = await fetch(obj.traktdirektiv_url);
    if (!pdfSvar.ok) {
      return NextResponse.json({ ok: false, skal: 'Kunde inte hämta traktdirektivet' });
    }
    const buf = new Uint8Array(await pdfSvar.arrayBuffer());

    let text = '';
    try {
      const parsad = await new PDFParse({ data: buf }).getText();
      text = parsad.text || '';
    } catch {
      return NextResponse.json({ ok: false, skal: 'Kunde inte läsa PDF:en' });
    }

    const res = larmkoordinatFranTdText(text);
    if (!res.ok) return NextResponse.json({ ok: false, skal: res.skal });

    // Vida ritar från kontoret → aldrig bekräftad. Någon måste ha varit på plats.
    const { data: uppdaterad, error: sparFel } = await supabase
      .from('objekt')
      .update({
        larmkoordinat_lat: res.lat,
        larmkoordinat_lng: res.lng,
        larmkoordinat_kalla: 'td',
        larmkoordinat_bekraftad: false,
      })
      .eq('id', objektId)
      .select('id');

    if (sparFel) return NextResponse.json({ ok: false, skal: 'Kunde inte spara koordinaten' }, { status: 500 });
    // Verifierat sparande: en update mot 0 rader är tyst i Supabase — larma i stället.
    if (!uppdaterad || uppdaterad.length === 0) {
      return NextResponse.json({ ok: false, skal: 'Sparningen träffade 0 rader' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lat: res.lat, lng: res.lng });
  } catch (e: any) {
    return NextResponse.json({ ok: false, skal: 'Fel vid import: ' + (e?.message || 'okänt') }, { status: 500 });
  }
}
