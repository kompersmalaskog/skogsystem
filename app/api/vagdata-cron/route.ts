import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hamtaOchLagraVagdata } from '@/lib/vagdata';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Cron-svep (Vercel-cron, Bearer CRON_SECRET). SKYDDSNÄT + tålmodig retry: fyller vägdata för objekt
// som saknar rad (nya trakter, oavsett hur de skapades — import/UI/starta-jobb), retryar 'misslyckad'
// och omhämtar stale 'ok'. Aldrig i förarens väg. Rapporterar exakt vad som hände + vilken instans.
const STALE_DAGAR = 30;     // omhämta 'ok' äldre än så (vägdata ändras sällan)
const TIDSBUDGET_MS = 50_000; // < maxDuration 60 s — sluta i tid, resten tas nästa svep
const MAX_PER_KORNING = 25;   // tak även om budgeten räcker

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET saknas i miljön' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [objRes, vagRes] = await Promise.all([
    supabase.from('objekt').select('id, lat, lng, larmkoordinat_lat, larmkoordinat_lng'),
    supabase.from('objekt_vagdata').select('objekt_id, status, hamtad_at'),
  ]);
  if (objRes.error) return NextResponse.json({ ok: false, error: 'kunde inte läsa objekt', details: objRes.error.message }, { status: 500 });

  const vMap = new Map<string, any>((vagRes.data || []).map((v: any) => [v.objekt_id, v]));
  const staleMs = STALE_DAGAR * 24 * 3600 * 1000;
  const behover = (objRes.data || []).filter((o: any) => {
    const harKoord = (o.lat != null && o.lng != null) || (o.larmkoordinat_lat != null && o.larmkoordinat_lng != null);
    if (!harKoord) return false;                 // utan koordinat kan vi ändå inte hämta
    const v = vMap.get(o.id);
    if (!v) return true;                          // saknar rad → hämta
    if (v.status === 'ok') return v.hamtad_at ? Date.now() - new Date(v.hamtad_at).getTime() > staleMs : true;
    return true;                                  // 'misslyckad' | 'vantar' | 'pagar' → försök igen
  }).slice(0, MAX_PER_KORNING);

  const start = Date.now();
  const rapport: any[] = [];
  let hoppadeTid = 0;
  for (const o of behover) {
    if (Date.now() - start > TIDSBUDGET_MS) { hoppadeTid = behover.length - rapport.length; break; }
    const res = await hamtaOchLagraVagdata(supabase, o.id);
    rapport.push({ objekt_id: o.id, status: res.status, kalla: res.kalla, instans: res.instans, antalVagar: res.antalVagar, fel: res.fel });
  }

  return NextResponse.json({
    ok: true,
    kandidater: behover.length,
    behandlade: rapport.length,
    hoppade_tidsbudget: hoppadeTid,   // tas nästa svep
    rapport,
  });
}
