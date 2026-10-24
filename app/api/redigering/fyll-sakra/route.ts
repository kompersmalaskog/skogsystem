// Fyller i det appen är säker på i dim_objekt (Martin 2026-10-23: "allt som är säkert").
//
// Vercel-cron varje timme (vercel.json). Läser alla objektrader + trakten (objekt), planerar med `planeraSakra` (bara
// säkert = två oberoende källor, ingen emot; bara tomma fält; bara fält som gäller) och skriver via databasfunktionen
// `redigering_skriv_auto`, som själv vägrar skriva över ett ifyllt fält och märker källan i `auto_ifyllt`.
//
// `?torr=1` skriver ingenting och svarar med vad som SKULLE fyllas — kör den först.
// Ett fel för ett objekt stoppar aldrig de andra; varje skrivning och varje fel loggas.
// Saknas funktionen (migrationen 20261023175500 inte körd) svarar rutten 503 och skriver ingenting.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { kravRoll, ADMIN_ROLLER } from '@/lib/auth/server';
import { planeraSakra, traktTyp, type FyllRad } from '@/lib/redigering/fyllSakra';
import type { TraktUppgifter } from '@/lib/redigering/harledning';

export const dynamic = 'force-dynamic';

async function tillaten(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return null;
  const vakt = await kravRoll(ADMIN_ROLLER);
  return vakt.ok ? null : vakt.res;
}

export async function GET(req: NextRequest) {
  return (await tillaten(req)) ?? kor(req.nextUrl.searchParams.get('torr') === '1');
}

async function kor(torr: boolean) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [dimRes, objRes] = await Promise.all([
    db.from('dim_objekt').select('objekt_id, object_name, vo_nummer, huvudtyp, avtalsform, bolag, cutting_method, exkludera, risskotning, special'),
    db.from('objekt').select('vo_nummer, typ, avtalsform, bolag').not('vo_nummer', 'is', null),
  ]);
  // Ett läsfel är ett fel — aldrig en planering på halva datan.
  if (dimRes.error) return NextResponse.json({ ok: false, fel: 'dim_objekt: ' + dimRes.error.message }, { status: 500 });
  if (objRes.error) return NextResponse.json({ ok: false, fel: 'objekt: ' + objRes.error.message }, { status: 500 });

  const trakt = new Map<string, TraktUppgifter>();
  for (const o of objRes.data ?? []) {
    trakt.set(String(o.vo_nummer).trim(), { huvudtyp: traktTyp(o.typ), avtalsform: o.avtalsform ?? null, bolag: o.bolag ?? null });
  }
  const plan = planeraSakra((dimRes.data ?? []) as FyllRad[], trakt);

  if (torr) return NextResponse.json({ ok: true, torr: true, antal: plan.length, plan });

  const skrivna: unknown[] = [];
  const fel: unknown[] = [];
  for (const p of plan) {
    const { data, error } = await db.rpc('redigering_skriv_auto', {
      p_ids: p.ids, p_falt: p.falt, p_varde: p.varde, p_kallor: p.kallor.join(', '),
    });
    if (error) {
      // Funktionen saknas: migrationen är inte körd. Stanna, skriv inget mer, säg det.
      if (error.code === 'PGRST202' || error.code === '42883') {
        console.error('[redigering/fyll-sakra] redigering_skriv_auto saknas — kör migration 20261023175500');
        return NextResponse.json({ ok: false, fel: 'Databasfunktionen redigering_skriv_auto saknas (migration 20261023175500).' }, { status: 503 });
      }
      console.error('[redigering/fyll-sakra]', p.namn, p.falt, error.message);
      fel.push({ ...p, fel: error.message });
      continue;
    }
    console.log('[redigering/fyll-sakra] fyllde', p.namn, p.falt, '=', p.varde, '·', p.kallor.join(', '), '·', data, 'rader');
    skrivna.push({ ...p, rader: data });
  }
  return NextResponse.json({ ok: fel.length === 0, antal: skrivna.length, skrivna, fel });
}
