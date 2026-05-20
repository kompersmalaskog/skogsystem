import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Always allow API routes and auth callbacks through
  if (isApiRoute || isAuthCallback) return supabaseResponse;

  // === Dev-mock bypass för /korvy ===
  // Tillåter åtkomst utan login ENDAST om BÅDA url-paramen är satta:
  //   ?devmock=1 och ?devkey=skogsystem-debug
  // Saknas eller fel värde → vanlig auth-flow kör som vanligt (redirect till
  // /login). Bara /korvy-routen är bypassbar — ingen annan vy. Varje träff
  // loggas så användning kan upptäckas i Vercel-loggarna.
  //
  // Trade-off: devkey är hårdkodad i klartext. För att begränsa skadan
  // läser /korvy bara från Supabase (objekt, markeringar, HPR-stammar) — inga
  // skrivoperationer. Eventuell data-exponering begränsas av RLS-policies på
  // Supabase-tabellerna. Använd inte produktions-URL:en med devkey publikt.
  if (pathname === '/korvy') {
    const devmock = request.nextUrl.searchParams.get('devmock');
    const devkey = request.nextUrl.searchParams.get('devkey');
    if (devmock === '1' && devkey === 'skogsystem-debug') {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      console.log('[DEV-MOCK ACCESS]', pathname, 'from', ip, 'at', new Date().toISOString());
      return supabaseResponse;
    }
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

  // STEG 3: rollbaserad routing från startsidan. Förare landar på /forare,
  // admin/chef/medarbetare-ej-hittad ser admin-hemvyn som idag.
  // Endast på '/' — andra paths slipper DB-uppslaget per request.
  if (user && pathname === '/') {
    const { data: medarbetare } = await supabase
      .from('medarbetare')
      .select('roll')
      .eq('user_id', user.id)
      .maybeSingle();

    if (medarbetare?.roll === 'forare') {
      const url = request.nextUrl.clone();
      url.pathname = '/forare';
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
    // Admin, chef, eller medarbetare ej hittad: fortsätt till HomeClient
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.png$|.*\\.ico$|.*\\.svg$).*)'],
};
