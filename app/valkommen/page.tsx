'use client';

// Landningssidan för inbjudningsmailet (POST /api/personal/bjud-in). Länken från Supabase loggar in den inbjudna
// (token i adressens #-del, som webbläsarklienten läser av sig själv) och hit kommer hen för att välja lösenord.
// Utan en inloggad session visas bara en förklaring — sidan kan inte användas för att byta någon annans lösenord.
// Byggd på lib/design/tokens (samma mörka tema som resten av appen); blått bara på länken som navigerar.

import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import { kontrolleraLosen, lankFel, LOSEN_MIN } from '@/lib/personal/valkommen';
import { AVSTAND, FARG, FONT, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';

type Lage = 'laddar' | 'valj' | 'utgangen' | 'ingen' | 'klart';

const faltStil: CSSProperties = {
  width: '100%', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp,
  background: FARG.kort, border: `1px solid ${FARG.linje}`, color: FARG.text,
  ...TYP.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
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
      if (lankFel(window.location.hash)) { setLage('utgangen'); return; }
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
  const kanSpara = !sparar && !!losen && !!igen;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: FARG.bg, color: FARG.text, fontFamily: FONT, padding: AVSTAND.xl }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: AVSTAND.xxl }}>
          <img src="/logo.png" alt="Kompersmåla Skog" style={{ width: 180, marginBottom: AVSTAND.l, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
          <h1 style={{ ...TYP.titel, margin: `0 0 ${AVSTAND.s}px` }}>{rubrik}</h1>
          <p data-valkommen-text style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>{text}</p>
        </div>

        {lage === 'valj' && (
          <form onSubmit={spara}>
            <div style={{ marginBottom: AVSTAND.m }}>
              <input type="password" value={losen} onChange={e => setLosen(e.target.value)} placeholder="Nytt lösenord" autoComplete="new-password" style={faltStil} />
            </div>
            <div style={{ marginBottom: AVSTAND.s }}>
              <input type="password" value={igen} onChange={e => setIgen(e.target.value)} placeholder="Skriv det igen" autoComplete="new-password" style={faltStil} />
            </div>
            <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.xl}px` }}>Minst {LOSEN_MIN} tecken.</p>
            {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: `0 0 ${AVSTAND.l}px`, textAlign: 'center' }}>{fel}</p>}
            <button type="submit" disabled={!kanSpara} style={{ ...KNAPP.primar, opacity: kanSpara ? 1 : 0.5 }}>
              {sparar ? 'Sparar…' : 'Spara lösenord'}
            </button>
          </form>
        )}

        {(lage === 'utgangen' || lage === 'ingen') && (
          <a href="/login" style={{ ...KNAPP.lank, justifyContent: 'center', width: '100%', textDecoration: 'none' }}>Till inloggningen</a>
        )}
      </div>
    </div>
  );
}
