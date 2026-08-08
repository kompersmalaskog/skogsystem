import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

// Städar staging-filer i trakt-inbox/incoming/ äldre än 30 dagar. Råfilen behålls så länge så
// att en import kan köras om utan att någon letar rätt på zippen igen — men inte för alltid.
// Anropas av Vercel-cron (se vercel.json).
//
// CRON_SECRET är OBLIGATORISK: endpointen raderar filer, så den får aldrig köras
// oautentiserad. Saknas secret i miljön → 500, radera ingenting.
const CUTOFF_DAGAR = 30;
const LIMIT = 1000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET saknas i miljön' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Otillåten' }, { status: 401 });
  }

  try {
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Paginera igenom HELA incoming/ — list() tar max en sida (LIMIT) åt gången och gamla
    // filer ligger inte garanterat först, så vi loopar med offset tills en sida kommer
    // tillbaka med färre än LIMIT. sortBy created_at asc gör ordningen deterministisk.
    const cutoff = Date.now() - CUTOFF_DAGAR * 86400 * 1000;
    const gamla: string[] = [];
    let offset = 0;
    let sidor = 0;
    while (true) {
      const { data: sida, error } = await service.storage
        .from('trakt-inbox')
        .list('incoming', { limit: LIMIT, offset, sortBy: { column: 'created_at', order: 'asc' } });
      if (error) {
        return NextResponse.json({ error: error.message, sidor }, { status: 500 });
      }
      const batch = sida || [];
      sidor++;
      for (const f of batch) {
        if (f.created_at && new Date(f.created_at).getTime() < cutoff) {
          gamla.push(`incoming/${f.name}`);
        }
      }
      if (batch.length < LIMIT) break;
      offset += batch.length;
    }

    // Radera i chunkar så ett stort städbatch inte blir en enda gigantisk request.
    let raderade = 0;
    for (let i = 0; i < gamla.length; i += 100) {
      const chunk = gamla.slice(i, i + 100);
      const { error: delErr } = await service.storage.from('trakt-inbox').remove(chunk);
      if (delErr) {
        return NextResponse.json({ error: delErr.message, raderade, sidor }, { status: 500 });
      }
      raderade += chunk.length;
    }

    return NextResponse.json({ raderade, sidor });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
