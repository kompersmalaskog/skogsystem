'use client';

// Landningssidan för inbjudningsmailet (POST /api/personal/bjud-in). Länken från Supabase loggar in den inbjudna
// (token i adressens #-del, som webbläsarklienten läser av sig själv) och hit kommer hen för att välja lösenord.
// Utan en inloggad session visas bara en förklaring — sidan kan inte användas för att byta någon annans lösenord.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { kontrolleraLosen, lankFel, LOSEN_MIN } from '@/lib/personal/valkommen';

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif";

type Lage = 'laddar' | 'valj' | 'utgangen' | 'ingen' | 'klart';

const faltStil: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 16, fontFamily: ff, outline: 'none', boxSizing: 'border-box',
};

export default function ValkommenPage() {
  const [lage, setLage] = useState<Lage>('laddar');
  const [losen, setLosen] = useState('');
  const [igen, setIgen] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);

  useEffect(() => {
    let avbruten = false;
    const fraga = async () => {
      const lank = lankFel(window.location.hash);
      if (lank) { setLage('utgangen'); return; }
      // getSession väntar in att klienten läst token ur adressen.
      const { data } = await supabase.auth.getSession();
      if (avbruten) return;
      setLage(data.session ? 'valj' : 'ingen');
    };
    void fraga();
    return () => { avbruten = true; };
  }, []);

  const spara = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = kontrolleraLosen(losen, igen);
    if (f) { setFel(f); return; }
    setSparar(true); setFel(null);
    const { error } = await supabase.auth.updateUser({ password: losen });
    if (error) { setSparar(false); setFel('Lösenordet kunde inte sparas. Försök igen.'); return; }
    setLage('klart');
    setTimeout(() => window.location.replace('/'), 1200);
  };

  const rubrik = lage === 'klart' ? 'Klart' : 'Välkommen till Kompersmåla Skog';
  const text = {
    laddar: 'Ett ögonblick…',
    valj: 'Välj ett lösenord så är du igång.',
    utgangen: 'Länken har gått ut. Be Martin skicka en ny inbjudan.',
    ingen: 'Den här länken fungerar inte längre. Be Martin skicka en ny inbjudan, eller logga in om du redan har ett lösenord.',
    klart: 'Lösenordet är sparat. Du skickas vidare…',
  }[lage];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111110', fontFamily: ff, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Kompersmåla Skog" style={{ width: 180, marginBottom: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: -0.5 }}>{rubrik}</h1>
          <p data-valkommen-text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{text}</p>
        </div>

        {lage === 'valj' && (
          <form onSubmit={spara}>
            <div style={{ marginBottom: 12 }}>
              <input type="password" value={losen} onChange={e => setLosen(e.target.value)} placeholder="Nytt lösenord" autoComplete="new-password" style={faltStil} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <input type="password" value={igen} onChange={e => setIgen(e.target.value)} placeholder="Skriv det igen" autoComplete="new-password" style={faltStil} />
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>Minst {LOSEN_MIN} tecken.</p>
            {fel && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444', textAlign: 'center' }}>{fel}</div>
            )}
            <button type="submit" disabled={sparar || !losen || !igen}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 16, fontWeight: 600, fontFamily: ff, cursor: 'pointer', opacity: (sparar || !losen || !igen) ? 0.5 : 1 }}>
              {sparar ? 'Sparar…' : 'Spara lösenord'}
            </button>
          </form>
        )}

        {(lage === 'utgangen' || lage === 'ingen') && (
          <a href="/login" style={{ display: 'block', textAlign: 'center', color: '#3b82f6', fontSize: 15, fontFamily: ff, textDecoration: 'none', padding: 12 }}>Till inloggningen</a>
        )}
      </div>
    </div>
  );
}
