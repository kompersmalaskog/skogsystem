import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { adminSupabase } from '@/lib/markagarrapport/admin';
import { lasUnderlag } from '@/lib/objektoversikt/las';
import { sammanstall, visasIOversikten } from '@/lib/objektoversikt/berakna';
import { listPost } from '@/lib/objektoversikt/vy';
import OversiktRam from '@/components/objektoversikt/OversiktRam';

export const dynamic = 'force-dynamic';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// Listan läses här, en gång: på telefon och iPad stående är den egen sida, från 1100 px står den till vänster
// om objektet (som Mail). OversiktRam avgör vad som syns utifrån adressen. Bara admin.
export default async function Layout({ children }: { children: ReactNode }) {
  const supabase = await adminSupabase();
  const svar = await lasUnderlag(supabase as any);
  const poster = svar.underlag
    ? svar.underlag.objekt.filter(visasIOversikten).map(o => listPost(sammanstall(o, svar.underlag)))
    : [];
  return <OversiktRam poster={poster} fel={svar.fel}>{children}</OversiktRam>;
}
