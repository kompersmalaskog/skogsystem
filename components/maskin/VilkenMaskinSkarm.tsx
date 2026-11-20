'use client';

// Helskärmsfrågan "Vilken maskin är det här?" — visas en gång när en dator med serial-GPS inte vet vilken maskin den är.
// Maskinerna är stora knappar (visningsnamn ur dim_maskin, bara aktiva, med känd roll). Ett tryck sparar valet
// (lib/enhetMaskin) och appen startar sedan direkt i maskinläge — frågan kommer inte tillbaka.
//
// Rent presentationslager: den som visar frågan äger laddningen (maskiner/status) och vad som händer efter valet.
// Frågan är aldrig en återvändsgränd: laddar den visas text, går laddningen fel eller finns inga maskiner står det
// vad som saknas, och "Till appen" finns alltid.

import React from 'react';
import { rollText, type FragaMaskin } from '@/lib/maskinFraga';
import type { RegisterStatus } from '@/lib/maskinFraga';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';

export function VilkenMaskinSkarm({ maskiner, status, onVald, onForsokIgen, onTillAppen, zIndex = 9300 }: {
  maskiner: FragaMaskin[];
  status: RegisterStatus;
  onVald: (maskinId: string) => void;
  onForsokIgen: () => void;
  onTillAppen: () => void;
  zIndex?: number;
}) {
  const laddar = status === 'laddar';
  const fel = status === 'fel';
  const tomt = status === 'ok' && maskiner.length === 0;

  return (
    <div data-testid="vilken-maskin" style={{
      position: 'fixed', inset: 0, zIndex, background: '#000', color: '#fff', overflowY: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px calc(env(safe-area-inset-bottom, 0px) + 24px)',
      fontFamily: FONT, textAlign: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: '720px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px' }}>
        <div>
          <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Vilken maskin är det här?</h1>
          <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)' }}>
            Välj en gång — sedan startar appen direkt i rätt körvy.
          </div>
        </div>

        {laddar && <div role="status" style={{ fontSize: '17px', color: 'rgba(255,255,255,0.7)' }}>Hämtar maskiner…</div>}

        {fel && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '17px', lineHeight: 1.4, maxWidth: '420px' }}>Maskinerna gick inte att hämta. Kontrollera nätet och försök igen.</div>
            <button type="button" onClick={onForsokIgen} style={KNAPP_PRIMAR}>Försök igen</button>
          </div>
        )}

        {tomt && (
          <div role="alert" style={{ fontSize: '17px', lineHeight: 1.4, maxWidth: '420px' }}>
            Inga aktiva maskiner finns i maskinregistret. Be en planerare lägga in maskinen.
          </div>
        )}

        {maskiner.length > 0 && (
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {maskiner.map((m) => (
              <button
                key={m.maskinId}
                type="button"
                data-testid={`maskinval-${m.maskinId}`}
                onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12); onVald(m.maskinId); }}
                style={{
                  minHeight: '88px', padding: '14px 18px', borderRadius: '18px',
                  border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                }}
              >
                <span style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.01em' }}>{m.namn}</span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>{rollText(m.roll)}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={onTillAppen} data-testid="maskinfraga-till-appen"
          style={{ minHeight: '48px', padding: '0 24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: '16px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Till appen
        </button>
      </div>
    </div>
  );
}

const KNAPP_PRIMAR: React.CSSProperties = {
  minHeight: '52px', padding: '0 32px', borderRadius: '14px', border: 'none', background: '#fff', color: '#000',
  fontSize: '18px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
