import { notFound } from 'next/navigation';
import type { Viewport } from 'next';
import { adminSupabase } from '@/lib/markagarrapport/admin';
import { lasProduktion, lasUnderlag } from '@/lib/objektoversikt/las';
import { sammanstall, summeraProduktion } from '@/lib/objektoversikt/berakna';
import { byggObjektVy } from '@/lib/objektoversikt/vy';
import { AVSTAND, FARG, KNAPP, KOLUMN, TYP } from '@/lib/design/tokens';
import Objekt from '@/components/objektoversikt/Objekt';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Objektöversikt' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

interface Props {
  params: Promise<{ objekt_id: string }>;
}

export default async function Page({ params }: Props) {
  const { objekt_id } = await params;
  const supabase = await adminSupabase();
  const igen = `/admin/objektoversikt/${encodeURIComponent(objekt_id)}`;
  const svar = await lasUnderlag(supabase as any);
  if (!svar.underlag) return <Tom rubrik={`Kunde inte läsa ${svar.fel}`} text="Försök igen om en stund." igen={igen} />;
  const u = svar.underlag;
  const o = u.objekt.find(x => x.id === objekt_id);
  if (!o) notFound();
  const prod = await lasProduktion(supabase as any, o, u);
  if (prod.error) {
    console.error('[objektoversikt] läsfel produktionen', objekt_id, prod.error);
    return <Tom rubrik="Kunde inte läsa produktionen" text="Försök igen om en stund." igen={igen} />;
  }
  const maskinNamn = (id: string) => u.maskiner.find(m => m.maskin_id === id)?.visningsnamn?.trim() || id;
  const vy = byggObjektVy(sammanstall(o, u), summeraProduktion(o, u, prod.data), maskinNamn);
  return <Objekt vy={vy} />;
}

function Tom({ rubrik, text, igen }: { rubrik: string; text: string; igen?: string }) {
  return (
    <div style={{ maxWidth: KOLUMN.smal, margin: '0 auto', padding: `${AVSTAND.xxl * 2}px ${AVSTAND.sidmarginal}px` }}>
      <h1 style={{ margin: 0, ...TYP.rubrik }}>{rubrik}</h1>
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>{text}</p>
      {igen && <a href={igen} style={{ ...KNAPP.lank, marginTop: AVSTAND.s, textDecoration: 'none' }}>Försök igen</a>}
    </div>
  );
}
