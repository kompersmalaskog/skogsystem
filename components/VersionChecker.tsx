'use client';

import { useCallback, useEffect, useState } from 'react';

// Bygg-SHA som bakades in i KLIENTEN vid build (via next.config env). Den installerade
// appen kör den gamla bundlen → detta är dess "egen" version.
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

// Hur ofta vi frågar servern om det finns en nyare deploy.
const POLL_MS = 15 * 60 * 1000;

export default function VersionChecker() {
  const [serverSha, setServerSha] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    try {
      // no-store = gå ALLTID till nätet, förbi webview-/CDN-cachen. Det är hela poängen:
      // annars kan en installerad iOS-app servera ett cachat gammalt svar och aldrig
      // upptäcka en ny version.
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const sv = j?.version;
      if (typeof sv === 'string' && sv) {
        setServerSha(sv);
        // Ny version ute → låt bannern komma tillbaka även om den nyss avfärdats, så den
        // inte glöms bort. Avfärda = tyst till nästa poll, inte för alltid.
        if (sv !== BUILD_SHA) setDismissed(false);
      }
    } catch {
      // Offline / nätfel → visa INGEN banner. Vi gissar aldrig att en version är gammal.
    }
  }, []);

  useEffect(() => {
    check(); // vid start
    const iv = setInterval(check, POLL_MS); // var ~15 min
    const onFocus = () => check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [check]);

  // Bara om servern har en ANNAN, giltig version än den vi kör. 'dev' (lokalt/utan
  // Vercel-env) triggar aldrig bannern.
  const nyVersion =
    !!serverSha && serverSha !== BUILD_SHA && BUILD_SHA !== 'dev' && serverSha !== 'dev';
  if (!nyVersion || dismissed) return null;

  const laddaOm = async () => {
    // Rensa ev. cache-lagring defensivt (ingen SW-cache idag, men om en läggs till i
    // framtiden ska den aldrig kunna låsa fast en gammal version).
    try {
      if (typeof caches !== 'undefined') {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      }
    } catch { /* ignorera */ }
    // CACHE-BUSTING: byt URL (ny ?v=) så webview:en TVINGAS hämta ett nytt dokument.
    // location.reload() har buggat i installerade iOS-appar och kunnat servera samma
    // cachade dokument igen → föraren fastnar i en loop (banner → tryck → inget → banner).
    // En ny URL kan webview:en inte cache-matcha. Efter omladdningen är BUILD_SHA === server
    // → bannern försvinner av sig själv. Kommer den TILLBAKA vet vi att bustningen inte tog.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('v', (serverSha || '').slice(0, 12));
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
  };

  return (
    <div
      role="status"
      style={{
        // Topprad: slutar ~20px OVANFÖR körvyns GPS-chip (safe-area + 70px), alltså fri
        // från karta, centrera-knapp, GPS-status och nästa-hinder-panelen. Överlappar bara
        // den översta headern (hem/objekt-pill) — som inte är körkritisk och nås igen efter
        // att bannern avfärdats. Ej modal: man kan köra vidare.
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 3000,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'rgba(20,20,22,0.97)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 9px 16px' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true">&#x1F504;</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: -0.2 }}>
          Ny version tillgänglig
        </span>
        <button
          type="button"
          onClick={laddaOm}
          style={{
            flexShrink: 0, padding: '7px 15px', borderRadius: 10, border: 'none',
            background: '#0a84ff', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Ladda om
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Stäng — påminner igen vid nästa koll"
          style={{
            flexShrink: 0, width: 32, height: 32, borderRadius: 16, border: 'none',
            background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
            fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
