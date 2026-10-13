'use client';

import React, { useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { AVSTAND, FARG, LAYOUT, VY_ROT, designCss } from '@/lib/design/tokens';
import VyKolumn from '@/components/design/VyKolumn';
import Flikkontroll from '@/components/design/Flikkontroll';
import { FelText, StatusText } from './_components/delar';
import MigVy from './_components/MigVy';
import SchemaVy from './_components/SchemaVy';

/**
 * Ledighet — självbetjäning. Inloggad person = "jag" (ingen personväljare).
 * Två vyer: "Mig" (saldon, ansök, mina ansökningar, godkänn-sektion för
 * admin) och "Schema" (delad lagöversikt — alla ser alla).
 *
 * Färg och typografi ur lib/design/tokens (samma som Arbetsrapport); bredd enligt Kolumnen
 * (KOLUMN): "Mig" i den smala kolumnen, "Schema" i den breda, flikkontrollen i samma kolumn.
 * Telefonen är oförändrad.
 */
export default function LedighetPage() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const [vy, setVy] = useState<'mig' | 'schema'>('mig');

  return (
    <div style={{ ...VY_ROT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}</style>
      <VyKolumn bredd={vy === 'schema' ? 'bred' : 'smal'}>
        {/* Sticky i flödet (Min tids form): rubriken reserverar sin egen höjd under toppfältet. */}
        <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 50, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: `${AVSTAND.l}px 0 ${AVSTAND.m}px` }}>
          <Flikkontroll flikar={[['mig', 'Mig'], ['schema', 'Schema']] as const} aktiv={vy} onVal={setVy} />
        </div>

        <div style={{ paddingTop: AVSTAND.s }}>
          {loading ? (
            <StatusText text="Läser…" />
          ) : !medarbetare ? (
            <div style={{ padding: `${AVSTAND.xl}px 0`, textAlign: 'center' }}>
              <FelText text="Ditt konto är inte kopplat till en medarbetare — kontakta admin." />
            </div>
          ) : vy === 'mig' ? (
            <MigVy medarbetare={medarbetare} />
          ) : (
            <SchemaVy
              arGodkannare={medarbetare.roll === 'admin'}
              egenMedarbetareId={medarbetare.id}
            />
          )}
        </div>
      </VyKolumn>
    </div>
  );
}
