import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Debug-endpoint som returnerar innehållet i valda källkodsfiler som text.
// Använd endast för utveckling — inga auth-skydd förutom statisk nyckel.
// Begränsat till en whitelist för att undvika att hela repot kan läckas.

const DEBUG_KEY = 'skogsystem-debug';

// Nycklar som pekar på faktiska filsökvägar relativt repo-roten.
// Lägg till fler vid behov.
const FIL_KARTA: Record<string, string> = {
  Arbetsrapport: 'components/arbetsrapport/Arbetsrapport.tsx',
  TopBar: 'components/TopBar.tsx',
  Notify: 'app/api/notify/route.ts',
  Routing: 'app/api/routing/route.ts',
  KmSummary: 'app/api/km-summary/route.ts',
  KmChain: 'app/api/km-chain/route.ts',
  AppState: 'app/api/app-state/route.ts',
  Source: 'app/api/source/route.ts',
  Status: 'STATUS.md',
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key !== DEBUG_KEY) {
    return new NextResponse('Ogiltig nyckel', { status: 401 });
  }

  const fil = url.searchParams.get('file');
  if (!fil) {
    const tillgängliga = Object.keys(FIL_KARTA).join(', ');
    return new NextResponse(
      `Ange ?file=<namn>. Tillgängliga: ${tillgängliga}`,
      { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const rel = FIL_KARTA[fil];
  if (!rel) {
    return new NextResponse(
      `Filen "${fil}" är inte whitelist:ad. Lägg till i FIL_KARTA för åtkomst.`,
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const abs = join(process.cwd(), rel);
  if (!existsSync(abs)) {
    return new NextResponse(`Filen finns inte: ${rel}`, { status: 404 });
  }

  try {
    const innehåll = readFileSync(abs, 'utf8');
    return new NextResponse(innehåll, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Kunde inte läsa filen: ${e.message || e}`, { status: 500 });
  }
}
