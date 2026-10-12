import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MARKERING_FOTO_BUCKET } from '@/lib/markeringFotoSokvag';
import { valjForaldralosa, MIN_ALDER_DAGAR, MAX_RADERA_PER_KORNING, type BucketFil } from '@/lib/stadaMarkeringFoto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Nattlig städning av föräldralösa markeringsfoton: filer i markering-foton som INGEN
// planering_markeringar-rad refererar via data.photoPath OCH som är äldre än 7 dagar.
// Appen raderar aldrig fotofiler själv (Ångra måste kunna ge tillbaka fotot).
//
// Anropas av Vercel-cron (se vercel.json). CRON_SECRET är OBLIGATORISK: endpointen raderar
// filer. Saknas secret → 500, radera ingenting.
//
// TORRKÖRNING: ?torrkorning=1 listar vad som skulle raderas och raderar ingenting.
// vercel.json anropar den med torrkorning=1 tills Martin tagit bort flaggan efter att ha läst loggen.
//
// FAIL-CLOSED: fel vid läsning av rader eller filer → radera ingenting. Noll refererade filer
// medan bucketen har filer tolkas som ett fel i läsningen, inte som "allt är skräp".
const SIDA = 1000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET saknas i miljön' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Otillåten' }, { status: 401 });

  const torrkorning = request.nextUrl.searchParams.get('torrkorning') === '1';

  try {
    const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

    // 1. Alla refererade sökvägar. Bara photoPath hämtas, aldrig hela data.
    const refererade = new Set<string>();
    for (let from = 0; ; from += SIDA) {
      const { data, error } = await service.from('planering_markeringar')
        .select('p:data->>photoPath')
        .not('data->>photoPath', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + SIDA - 1);
      if (error) return NextResponse.json({ error: 'kunde inte läsa rader: ' + error.message, raderade: 0 }, { status: 500 });
      for (const r of (data || []) as unknown as { p: string | null }[]) if (r.p) refererade.add(r.p);
      if (!data || data.length < SIDA) break;
    }

    // 2. Alla filer: mappar (objekt) på toppnivå, sedan filerna i varje mapp.
    const filer: BucketFil[] = [];
    const mappar: string[] = [];
    for (let offset = 0; ; offset += SIDA) {
      const { data, error } = await service.storage.from(MARKERING_FOTO_BUCKET).list('', { limit: SIDA, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) return NextResponse.json({ error: 'kunde inte lista bucketen: ' + error.message, raderade: 0 }, { status: 500 });
      for (const e of data || []) if (e.id === null) mappar.push(e.name);   // id null = mapp
      if (!data || data.length < SIDA) break;
    }
    for (const mapp of mappar) {
      for (let offset = 0; ; offset += SIDA) {
        const { data, error } = await service.storage.from(MARKERING_FOTO_BUCKET).list(mapp, { limit: SIDA, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) return NextResponse.json({ error: `kunde inte lista ${mapp}: ${error.message}`, raderade: 0 }, { status: 500 });
        for (const f of data || []) {
          if (f.id === null) continue;
          const tider = [f.created_at, f.updated_at].map((t) => (t ? new Date(t).getTime() : NaN)).filter((t) => Number.isFinite(t));
          filer.push({ sokvag: `${mapp}/${f.name}`, senastMs: tider.length ? Math.max(...tider) : null });
        }
        if (!data || data.length < SIDA) break;
      }
    }

    if (filer.length > 0 && refererade.size === 0) {
      return NextResponse.json({ error: 'bucketen har filer men inga rader refererar något — avbryter (misstänkt läsfel)', filer: filer.length, raderade: 0 }, { status: 500 });
    }

    const beslut = valjForaldralosa(filer, refererade, Date.now());

    // 3. Radera (eller bara rapportera)
    let raderade = 0;
    if (!torrkorning) {
      for (let i = 0; i < beslut.radera.length; i += 100) {
        const chunk = beslut.radera.slice(i, i + 100);
        const { error } = await service.storage.from(MARKERING_FOTO_BUCKET).remove(chunk);
        if (error) {
          console.error('[stada-markering-foton] remove misslyckades', error.message, { raderade });
          return NextResponse.json({ error: error.message, raderade }, { status: 500 });
        }
        raderade += chunk.length;
      }
    }

    const rapport = {
      torrkorning,
      filer: filer.length,
      refererade: beslut.refererade,
      foraldralosaForNya: beslut.forNya.length,
      skullaRaderas: beslut.radera.length,
      overTak: beslut.overTak,
      raderade,
      minAlderDagar: MIN_ALDER_DAGAR,
      tak: MAX_RADERA_PER_KORNING,
    };
    console.log('[stada-markering-foton]', JSON.stringify({ ...rapport, ...(torrkorning ? { kandidater: beslut.radera.slice(0, 50) } : {}) }));
    return NextResponse.json(torrkorning ? { ...rapport, kandidater: beslut.radera } : rapport);
  } catch (err: any) {
    return NextResponse.json({ error: err.message, raderade: 0 }, { status: 500 });
  }
}
