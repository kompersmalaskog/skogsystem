import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────
// /api/* är STÄNGT som default. Kartläggning 2026-09: 30 av 79 rutter saknade
// auth helt — salary-export lämnade ut allas löneunderlag, employee-details
// vem som helsts semester/ATK, db-inspect rader ur medarbetare. Rutt-för-rutt
// är 30 ändringar och nästa rutt någon skriver är öppen igen; default-stängt
// i middleware är hela poängen.
//
// Släpps igenom UTAN session (explicit allowlist — lägg till med motivering):
//   • Authorization: Bearer $CRON_SECRET   — Vercel cron (skickas automatiskt)
//   • Authorization: Bearer $IMPORT_SECRET — importern (auto_import_watch.py →
//     /api/mom-import). Deployas via deploy_import.ps1; saknas headern loggar
//     watchern ERROR, aldrig tyst.
//   • OAuth-handskakningen (/api/auth/*, /api/fortnox/auth, /api/fortnox/callback)
//   • /api/version — PWA-versionspoll, körs även utan session
// Rollkrav (admin/chef) och "vems data" ligger i rutterna (lib/auth/server.ts) —
// middleware svarar bara på frågan "finns det en session?".
// ─────────────────────────────────────────────────────────────
const API_UTAN_SESSION = new Set<string>([
  '/api/version',
  '/api/fortnox/auth',
  '/api/fortnox/callback',
]);

function bearerMatchar(request: NextRequest, envNamn: 'CRON_SECRET' | 'IMPORT_SECRET'): boolean {
  const secret = process.env[envNamn];
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() refreshes the session and updates cookies
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === '/login';
  const isAuthCallback = pathname.startsWith('/api/auth/');
  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute || isAuthCallback) {
    if (isAuthCallback || API_UTAN_SESSION.has(pathname)) return supabaseResponse;
    if (bearerMatchar(request, 'CRON_SECRET') || bearerMatchar(request, 'IMPORT_SECRET')) return supabaseResponse;
    if (user) return supabaseResponse;
    // API svarar JSON 401 — aldrig redirect till /login (klienter parsar svaret).
    return NextResponse.json({ ok: false, error: 'Ej inloggad' }, { status: 401 });
  }

  // Not logged in and not on login page → redirect to login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // Copy cookies from supabaseResponse to redirect
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  // Logged in and on login page → redirect to home
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  // Statiska hjälpresurser går ALDRIG genom auth-middleware (ingen getUser). De är
  // publika filer, inte skyddad data — och en helper som kräver auth kan HÄNGA vid en
  // Auth-störning (pdf.js-workern gav 307→/login; service workern likaså). Undanta
  // dem hårt: pdf.worker.min.mjs (.mjs), sw.js (service worker), teckensnitt (.woff*),
  // utöver bilder/ikoner/manifest. Sidrutter (utan filändelse) fortsätter gå via auth.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.mjs$|.*\\.woff2?$).*)'],
};
