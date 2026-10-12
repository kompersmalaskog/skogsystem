import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/lonesystem/server';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * POST /api/faktura/kontraktsnr
 * Body: { vo_nummer: string, kontraktsnummer: string | null }
 *
 * Skriver kontraktsnumret på trakten, direkt ur listan.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ 27 AV 44 TRAKTER HAR INGEN RAD I objekt — ATT SPARA LÄGGER UPP DEN.
 *
 * Kontraktsnumret bor i objekt.kontraktsnummer, och objekt är trakt-tabellen
 * med planering, status och tilldelning. Tjugosju av de trakter som saknar
 * nummer har aldrig lagts upp där; de har bara maskindata. En ren UPDATE
 * hade träffat noll rader och sagt ingenting — precis den tysta skrivningen
 * lib/supabase-save finns för att stoppa.
 *
 * Därför en UPSERT, och raden som skapas märks `saknar_planering = true`
 * med `status = 'avslutat'`. Vyn skriver ut det INNAN Martin trycker.
 *
 * ⚠️ STATUS MÅSTE SÄTTAS EXPLICIT. objekt.status defaultar till 'planerad',
 * alltså "klar att köra" — en trakt som skapas här hade annars dykt upp i
 * förarkön som nästa jobb. Det upptäcktes i ett insert-prov mot prod som
 * rullades tillbaka, inte av att någon läste schemat.
 *
 * VERIFIERAT SPARANDE: värdet läses tillbaka och jämförs. En insert eller
 * update som inte kastar bevisar inte att något ändrades — RLS kan svälja
 * skrivningen tyst och ge noll rader utan fel.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  try {
    const body = await req.json().catch(() => ({}));
    const vo = String(body.vo_nummer || '').trim();
    const raw = body.kontraktsnummer;
    // Tom sträng betyder "ta bort numret", inte "skriv en tom text".
    const nr = raw == null || String(raw).trim() === '' ? null : String(raw).trim();

    if (!vo) {
      return NextResponse.json({ ok: false, meddelande: 'vo_nummer krävs.' }, { status: 400 });
    }

    const sb = serverSupabase();

    // Namnet tas ur dim_objekt när traktraden ska skapas. Utan namn går den
    // inte att spara (objekt.namn är NOT NULL) och ska inte heller — en
    // trakt utan namn är oläsbar i varje vy som listar den.
    const { data: dim, error: dimFel } = await sb.from('dim_objekt')
      .select('object_name').eq('vo_nummer', vo).limit(1);
    if (dimFel) throw new Error('Kunde inte läsa dim_objekt: ' + dimFel.message);
    const namn = (dim || [])[0]?.object_name;
    if (!namn) {
      return NextResponse.json({
        ok: false,
        meddelande: `VO ${vo} finns inte i dim_objekt — numret kan inte knytas till någon trakt.`,
      }, { status: 400 });
    }

    const { data: fore } = await sb.from('objekt')
      .select('id, kontraktsnummer').eq('vo_nummer', vo).limit(1);
    const fanns = (fore || []).length > 0;

    if (fanns) {
      const { error } = await sb.from('objekt')
        .update({ kontraktsnummer: nr }).eq('vo_nummer', vo);
      if (error) throw new Error('Kunde inte spara: ' + error.message);
    } else {
      const { error } = await sb.from('objekt').insert({
        vo_nummer: vo,
        namn,
        kontraktsnummer: nr,
        // STATUS MÅSTE SÄTTAS EXPLICIT. Kolumnen defaultar till 'planerad',
        // alltså "klar att köra" — en trakt som skapas här hade då dykt upp
        // i förarkön som nästa jobb. Trakten är slutavräknad (den ligger i
        // listan just därför), så 'avslutat' är det sanna värdet.
        // 'oplanerad' hade varit frestande men bryter objekt_status_check,
        // som bara tillåter planerad/pagaende/skotning/avslutat.
        status: 'avslutat',
        // Den lades aldrig upp i planeringen — den skapas för att bära ett
        // nummer, och det ska synas i planeringsvyn.
        saknar_planering: true,
      });
      if (error) throw new Error('Kunde inte lägga upp trakten: ' + error.message);
    }

    // LÄS TILLBAKA VÄRDET, inte antalet rader. Radräkning bevisar att en rad
    // rördes, inte att ändringen finns i den.
    const { data: efter, error: kollFel } = await sb.from('objekt')
      .select('kontraktsnummer').eq('vo_nummer', vo).limit(1);
    if (kollFel) throw new Error('Kunde inte läsa tillbaka: ' + kollFel.message);
    const sparat = (efter || [])[0]?.kontraktsnummer ?? null;
    if (sparat !== nr) {
      return NextResponse.json({
        ok: false,
        meddelande: `Sparandet gick inte igenom: läste tillbaka ${sparat === null ? 'tomt' : `"${sparat}"`}`
          + ` där ${nr === null ? 'tomt' : `"${nr}"`} skulle stå.`,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      vo_nummer: vo,
      kontraktsnummer: sparat,
      // Sant när trakten lades upp av den här skrivningen. Vyn säger det
      // vidare, så att en ny rad i objekt aldrig blir en överraskning.
      trakt_upplagd: !fanns,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e?.message || String(e) }, { status: 500 });
  }
}
