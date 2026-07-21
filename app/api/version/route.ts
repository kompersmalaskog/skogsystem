import { NextResponse } from 'next/server';

// Aktuellt UTROLLAT bygge. force-dynamic + no-store gör att svaret ALLTID kommer från
// den just nu deployade funktionen — aldrig CDN-cachat, aldrig webview-cachat. Klienten
// jämför detta mot sitt inbyggda NEXT_PUBLIC_BUILD_SHA (bakat vid build) för att upptäcka
// att en nyare version rullats ut medan den installerade appen stått öppen.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
  return NextResponse.json(
    { version },
    { headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' } },
  );
}
