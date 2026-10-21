// Serverklient för markägarrapportens sidor — bara admin kommer in (samma som app/admin/page.tsx).
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function adminSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  const { data: medarbetare } = await supabase
    .from('medarbetare')
    .select('id, namn, roll')
    .eq('epost', user.email)
    .single();
  if (!medarbetare || medarbetare.roll !== 'admin') redirect('/arbetsrapport');
  return supabase;
}
