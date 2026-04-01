import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const results: Record<string, any> = {};

  // Sample from each table
  const tables = [
    'dim_maskin', 'maskiner', 'fakt_produktion', 'fakt_tid',
    'dim_operator', 'medarbetare', 'dim_objekt', 'fakt_skift',
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(3);
    results[t] = {
      data: data || [],
      error: error?.message || null,
      columns: data && data.length > 0 ? Object.keys(data[0]) : [],
      count: data?.length || 0,
    };
  }

  return NextResponse.json(results);
}
