// Körs före varje testfil (vitest.config.ts → setupFiles). Se lib/testStod/supabaseVakt.ts.
import { afterEach, vi } from 'vitest';
import { kontrolleraEfterTest } from '@/lib/testStod/supabaseVakt';

// En testfils egen vi.mock('@/lib/supabase', …) går före den här (annars hade 53 filer slutat fungera).
vi.mock('@/lib/supabase', async () => ({ supabase: (await import('@/lib/testStod/supabaseVakt')).byggVaktKlient() }));

afterEach(() => kontrolleraEfterTest());
