'use client';

import React, { useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { C, ff } from './_components/tema';
import MigVy from './_components/MigVy';

/**
 * Ledighet — självbetjäning. Inloggad person = "jag" (ingen personväljare).
 * Två vyer: "Mig" (saldon, ansök, mina ansökningar, godkänn-sektion för
 * chef/admin) och "Kalender" (delad — byggs i steg 5).
 */
export default function LedighetPage() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const [vy, setVy] = useState<'mig' | 'kalender'>('mig');

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', width: '100%', fontFamily: ff,
      background: C.bg, color: C.t1, WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Flikar */}
      <div style={{
        display: 'flex', background: C.surface,
        borderBottom: `1px solid ${C.border}`, padding: '0 16px',
      }}>
        {([['mig', 'Mig'], ['kalender', 'Kalender']] as const).map(([tab, label]) => {
          const aktiv = vy === tab;
          return (
            <button key={tab} onClick={() => setVy(tab)} style={{
              flex: 1, padding: '14px 0 12px', background: 'none', border: 'none',
              borderBottom: aktiv ? `2.5px solid ${C.t1}` : '2.5px solid transparent',
              color: aktiv ? C.t1 : C.t3,
              fontSize: 14, fontWeight: 600, fontFamily: ff, cursor: 'pointer',
            }}>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '20px 16px 100px', maxWidth: 480, margin: '0 auto' }}>
        {loading ? (
          <div style={{ color: C.t3, padding: 40, textAlign: 'center', fontSize: 13 }}>Laddar...</div>
        ) : !medarbetare ? (
          <div style={{
            color: C.red, padding: 24, textAlign: 'center', fontSize: 13,
            background: C.redDim, borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)',
          }}>
            Ditt konto är inte kopplat till en medarbetare — kontakta admin.
          </div>
        ) : vy === 'mig' ? (
          <MigVy medarbetare={medarbetare} />
        ) : (
          <div style={{
            color: C.t3, padding: 40, textAlign: 'center', fontSize: 13,
            background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
            lineHeight: 1.6,
          }}>
            Den delade kalendern byggs om — allas ledigheter och maskinstopp
            i samma vy. Kommer i nästa steg.
          </div>
        )}
      </div>
    </div>
  );
}
