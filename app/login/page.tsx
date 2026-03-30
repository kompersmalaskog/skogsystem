'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError('Fel e-post eller lösenord');
      setLoading(false);
      return;
    }

    window.location.href = '/';
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#111110', fontFamily: ff, padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src="/logo.png" alt="Kompersmåla Skog" style={{ width: 180, marginBottom: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: -0.5 }}>
            Kompersmåla Skog
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            Logga in för att fortsätta
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-postadress"
              autoComplete="email"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12,
                background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 16, fontFamily: ff, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Lösenord"
              autoComplete="current-password"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12,
                background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 16, fontFamily: ff, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              fontSize: 13, color: '#ef4444', textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
              background: '#3b82f6', color: '#fff', fontSize: 16, fontWeight: 600,
              fontFamily: ff, cursor: 'pointer',
              opacity: (loading || !email || !password) ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Loggar in...' : 'Logga in'}
          </button>
        </form>
      </div>
    </div>
  );
}
