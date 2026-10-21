import { notFound } from 'next/navigation';
import type { Viewport } from 'next';
import { adminSupabase } from '@/lib/markagarrapport/admin';
import { aggregateMarkagarRapport } from '@/lib/markagarrapport/aggregate';
import { byggRapportVy } from '@/lib/markagarrapport/vy';
import { AVSTAND, FARG, KNAPP, KOLUMN, TYP } from '@/lib/design/tokens';
import Rapport from '@/components/markagarrapport/Rapport';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Markägarrapport' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

interface Props {
  params: Promise<{ objekt_id: string }>;
}

export default async function Page({ params }: Props) {
  const { objekt_id } = await params;
  const supabase = await adminSupabase();
  let result: Awaited<ReturnType<typeof aggregateMarkagarRapport>>;
  try {
    result = await aggregateMarkagarRapport(supabase as any, objekt_id);
  } catch (e) {
    // Ett läsfel är ett fel med Försök igen, aldrig en krasch med "Något gick fel".
    console.error('[markagarrapport] kunde inte läsa', objekt_id, e);
    return <Tom rubrik="Kunde inte läsa rapporten just nu" text="Försök igen om en stund." igen={`/admin/markagarrapport/${encodeURIComponent(objekt_id)}`} />;
  }

  if (result.status === 'objekt_saknas') notFound();
  if (result.status === 'ej_implementerad') {
    return <Tom rubrik="Rapporten finns bara för slutavverkning än" text="Det här är en gallring eller en annan åtgärd. Rapporten byggs för slutavverkning." />;
  }
  if (result.status === 'ingen_data') {
    return <Tom rubrik="Inga träd är inlästa än" text="Rapporten fylls i när skördarens filer för den här avverkningen har lästs in." />;
  }
  return <Rapport vy={byggRapportVy(result.data)} stammar={result.data.karta.stammar} />;
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
