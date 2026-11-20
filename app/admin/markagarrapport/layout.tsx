import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { adminSupabase } from '@/lib/markagarrapport/admin';
import { hamtaListRader } from '@/lib/markagarrapport/lista';
import MarkagarRam from '@/components/markagarrapport/MarkagarRam';

export const dynamic = 'force-dynamic';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// Listan läses här, en gång: på telefon och iPad stående är den egen sida, från 1100 px står den till vänster
// om rapporten (som Mail). MarkagarRam avgör vad som syns utifrån adressen.
export default async function Layout({ children }: { children: ReactNode }) {
  const supabase = await adminSupabase();
  const { rader, fel } = await hamtaListRader(supabase as any);
  return <MarkagarRam rader={rader} fel={fel}>{children}</MarkagarRam>;
}
