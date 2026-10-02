'use client';

import { useCallback, useEffect, useState } from 'react';
import { BUILD_SHA, hamtaServerVersion, arNyVersion, laddaOmMedCacheBust } from '../lib/autoUppdatering';

// Hur ofta vi frågar servern om det finns en nyare deploy.
const POLL_MS = 15 * 60 * 1000;

export default function VersionChecker() {
  const [serverSha, setServerSha] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    const sv = await hamtaServerVersion();   // no-store, förbi webview-cachen; delad hjälpare
    if (sv) {
      setServerSha(sv);
      // Ny version ute → låt bannern komma tillbaka även om den nyss avfärdats, så den
      // inte glöms bort. Avfärda = tyst till nästa poll, inte för alltid.
      if (sv !== BUILD_SHA) setDismissed(false);
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
  // Vercel-env) triggar aldrig bannern. Delad regel med auto-uppdateringen.
  if (!arNyVersion(serverSha) || dismissed) return null;

  const laddaOm = () => laddaOmMedCacheBust(serverSha);   // delad cache-bust-omladdning

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
