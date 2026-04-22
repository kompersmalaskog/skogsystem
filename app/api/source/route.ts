import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Debug-endpoint som returnerar innehållet i valda källkodsfiler som text.
// Använd endast för utveckling — inga auth-skydd förutom statisk nyckel.
// Begränsat till en whitelist för att undvika att hela repot kan läckas.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEBUG_KEY = 'skogsystem-debug';

// Nycklar som pekar på faktiska filsökvägar relativt repo-roten.
// Kalender/Löneunderlag/Inställningar/MinTid är egna steg-vyer inom
// Arbetsrapport.tsx — de pekar därför alla på samma källkodsfil.
// Lägg till fler vid behov.
const FIL_KARTA: Record<string, string> = {
  // Huvudkomponent + vy-alias (alla bor i Arbetsrapport.tsx via `steg`)
  Arbetsrapport: 'components/arbetsrapport/Arbetsrapport.tsx',
  Kalender:      'components/arbetsrapport/Arbetsrapport.tsx',
  Loneunderlag:  'components/arbetsrapport/Arbetsrapport.tsx',
  Installningar: 'components/arbetsrapport/Arbetsrapport.tsx',
  MinTid:        'components/arbetsrapport/Arbetsrapport.tsx',

  // Andra komponenter
  TopBar:        'components/TopBar.tsx',
  BottomNav:     'components/BottomNav.tsx',
  PushRegister:  'components/PushRegister.tsx',
  MapLibreMap:   'components/MapLibreMap.tsx',

  // Admin-flikar
  AdminClient:     'components/admin/AdminClient.tsx',
  MedarbetareFlik: 'components/admin/MedarbetareFlik.tsx',
  AvtalFlik:       'components/admin/AvtalFlik.tsx',
  LonFlik:         'components/admin/LonFlik.tsx',
  AtkUnderflik:    'components/admin/AtkUnderflik.tsx',
  LonesystemUnderflik: 'components/admin/LonesystemUnderflik.tsx',
  VilobrottUnderflik:  'components/admin/VilobrottUnderflik.tsx',

  // Ekonomi
  EkonomiClient:       'app/ekonomi/EkonomiClient.tsx',
  EkonomiPage:         'app/ekonomi/page.tsx',
  InstallningarClient: 'app/ekonomi/installningar/InstallningarClient.tsx',
  InstallningarPage:   'app/ekonomi/installningar/page.tsx',

  // Hem
  HomeClient: 'app/HomeClient.tsx',

  // API-routes som används av dag-vyn
  Notify:     'app/api/notify/route.ts',
  Routing:    'app/api/routing/route.ts',
  KmSummary:  'app/api/km-summary/route.ts',
  KmChain:    'app/api/km-chain/route.ts',
  AppState:   'app/api/app-state/route.ts',
  Source:     'app/api/source/route.ts',

  // Fortnox
  FortnoxEmployeeDetails: 'app/api/fortnox/employee-details/route.ts',
  FortnoxDebugSaldon:     'app/api/fortnox/debug-saldon/route.ts',
  FortnoxSalaryExport:    'app/api/fortnox/salary-export/route.ts',
  FortnoxResultPerCC:     'app/api/fortnox/result-per-costcenter/route.ts',
  FortnoxProbe:           'app/api/fortnox/probe/route.ts',
  FortnoxSyncInvoices:    'app/api/fortnox/sync-invoices/route.ts',
  PerObjektClient:        'app/ekonomi/per-objekt/PerObjektClient.tsx',

  // Meta
  Status:     'STATUS.md',
  Claude:     'CLAUDE.md',
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key !== DEBUG_KEY) {
    return new NextResponse('Ogiltig nyckel', { status: 401 });
  }

  const fil = url.searchParams.get('file');
  if (!fil) {
    const rader = Object.entries(FIL_KARTA)
      .map(([nyckel, sökväg]) => `  ${nyckel.padEnd(24)} → ${sökväg}`)
      .join('\n');
    return new NextResponse(
      `Ange ?file=<namn>. Tillgängliga filer:\n\n${rader}\n\nAnvändning: /api/source?file=<namn>&key=skogsystem-debug\n`,
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
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
