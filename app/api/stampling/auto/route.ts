// AUTOMATISK LÄSNING av stämplingslängder som redan ligger på trakterna (Vidas import). Ingen ska behöva trycka på en knapp per trakt.
//
// Schema: Vercel-cron en gång i timmen (vercel.json) → Bearer CRON_SECRET (middleware släpper igenom den). Varje körning läser högst
// PER_KORNING trakter (en läsning tar upp till en minut), äldst VO först, och högst MAX_LASNINGAR_PER_TIMME per timme totalt.
// Urvalet (lib/rotpost/kalla.ts attLasa): en stämplingslängd och ingen rapport än — en misslyckad läsning görs ALDRIG om av sig själv
// (då kostar den om och om igen); knappen på traktsidan finns för det. En gissad (inskannad) stämplingslängd läses bara på en rotpost.
//
// En inloggad admin kan anropa rutten i webbläsaren: då är det en TORRKÖRNING (listar vad som skulle läsas) om inte ?skarp=1.

import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_ROLLER, kravRoll } from '@/lib/auth/server';
import { attLasa, type ObjektMedDokument } from '@/lib/rotpost/kalla';
import { lasRapport, skapaForObjekt } from '@/lib/stampling/pdf/franObjekt';
import { adminKlient, MAX_LASNINGAR_PER_TIMME } from '@/lib/stampling/pdf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PER_KORNING = 3;
const AV = 'auto';

async function kor(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const arCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!arCron) {
    const vakt = await kravRoll(ADMIN_ROLLER);
    if (!vakt.ok) return vakt.res;
  }
  const skarp = arCron || new URL(req.url).searchParams.get('skarp') === '1';
  const admin = adminKlient();

  const [o, d, r] = await Promise.all([
    admin.from('objekt').select('vo_nummer,namn,avtalsform,stamplingslangd_url,ovriga_dokument').not('vo_nummer', 'is', null),
    admin.from('dim_objekt').select('objekt_id,avtalsform'),
    admin.from('stamplings_rapport').select('objekt_id').not('objekt_id', 'is', null),
  ]);
  const fel = o.error ?? d.error ?? r.error;
  if (fel) return NextResponse.json({ ok: false, error: fel.message }, { status: 500 });

  const dim = new Map(((d.data ?? []) as { objekt_id: string; avtalsform: string | null }[]).map(x => [String(x.objekt_id), x.avtalsform]));
  const har = new Set(((r.data ?? []) as { objekt_id: string }[]).map(x => String(x.objekt_id)));
  const kvar = attLasa((o.data ?? []) as ObjektMedDokument[], dim, har);
  if (!skarp) return NextResponse.json({ ok: true, lage: 'torrkörning — inget lästes', attLasa: kvar });

  const sedan = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('stamplings_rapport').select('id', { count: 'exact', head: true }).eq('skapad_av', AV).gte('skapad', sedan);
  const utrymme = Math.max(0, Math.min(PER_KORNING, MAX_LASNINGAR_PER_TIMME - (count ?? 0)));

  const resultat: { objekt: string; status: string; fel?: string }[] = [];
  for (const objektId of kvar.slice(0, utrymme)) {
    const s = await skapaForObjekt(admin, objektId, AV);
    if (!s.ok) { resultat.push({ objekt: objektId, status: 'fel', fel: s.error }); continue; }
    if (s.v.finns) { resultat.push({ objekt: objektId, status: 'fanns' }); continue; }
    const l = await lasRapport(admin, s.v.id);
    resultat.push(l.ok ? { objekt: objektId, status: l.v.rad.status } : { objekt: objektId, status: 'fel', fel: l.error });
  }
  if (resultat.some(x => x.status === 'fel')) console.error('[stampling/auto]', resultat);
  return NextResponse.json({ ok: true, lage: 'skarp', lasta: resultat, kvarEfter: kvar.length - resultat.length });
}

export async function GET(req: NextRequest) { return kor(req); }
export async function POST(req: NextRequest) { return kor(req); }
