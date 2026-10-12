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

const AUTH_TIMEOUT_MS = 3000;

function bearerMatchar(request: NextRequest, envNamn: 'CRON_SECRET' | 'IMPORT_SECRET'): boolean {
  const secret = process.env[envNamn];
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// Reservväg vid Auth-timeout, ENDAST för sidor: läser sessionscookien och kollar att
// access-token har sub och inte gått ut. Signaturen verifieras INTE här — det kan inte
// göras utan Auth/JWKS, som just inte svarar. Det räcker för att inte kasta ut en
// inloggad förare i ett Auth-hack; all data går via /api och Supabase-RLS, som verifierar.
function cookieHarGiltigSession(request: NextRequest): boolean {
  try {
    const delar = new Map<string, string>();
    for (const { name, value } of request.cookies.getAll()) {
      const m = /^(sb-.+-auth-token)(?:\.(\d+))?$/.exec(name);
      if (m) delar.set(m[1] + '|' + (m[2] ?? '0'), value);
    }
    const bas = Array.from(delar.keys(), (k) => k.split('|')[0])[0];
    if (!bas) return false;
    let raw = '';
    for (let i = 0; delar.has(bas + '|' + i); i++) raw += delar.get(bas + '|' + i);
    if (raw.startsWith('base64-')) {
      const b64 = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      raw = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    }
    const token: string | undefined = JSON.parse(raw)?.access_token;
    if (!token) return false;
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64));
    return typeof claims.sub === 'string' && typeof claims.exp === 'number' && claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
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

  // getClaims() verifierar JWT:n lokalt mot projektets publika nyckel (JWKS, ES256) —
  // inget nätanrop till /auth/v1/user per request som med getUser(). Förnyar fortfarande
  // utgången session och uppdaterar cookies. Rutter som behöver ett färskt svar från
  // Auth (t.ex. spärrad användare) gör eget getUser() i lib/auth/server.ts.
  // Tar kontrollen > AUTH_TIMEOUT_MS hänger vi inte: /api är default-stängt och får
  // 503; sidor släpps bara igenom om cookien redan bär en ej utgången session
  // (cookieHarGiltigSession), annars redirect till /login?retry=1.
  const pathname = request.nextUrl.pathname;
  let user: { id: string } | null = null;
  let authTimeout = false;
  try {
    const res = await Promise.race([
      supabase.auth.getClaims(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), AUTH_TIMEOUT_MS)),
    ]);
    if (res === 'timeout') authTimeout = true;
    else if (res.data?.claims?.sub) user = { id: res.data.claims.sub };
  } catch {
    authTimeout = true;
  }
  const isLoginPage = pathname === '/login';
  const isAuthCallback = pathname.startsWith('/api/auth/');
  const isApiRoute = pathname.startsWith('/api/');

  if (authTimeout) {
    if (isApiRoute || isAuthCallback) {
      if (isAuthCallback || API_UTAN_SESSION.has(pathname)) return supabaseResponse;
      if (bearerMatchar(request, 'CRON_SECRET') || bearerMatchar(request, 'IMPORT_SECRET')) return supabaseResponse;
      return NextResponse.json({ ok: false, error: 'Auth svarar inte — försök igen' }, { status: 503 });
    }
    if (isLoginPage || cookieHarGiltigSession(request)) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?retry=1';
    return NextResponse.redirect(url);
  }

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
