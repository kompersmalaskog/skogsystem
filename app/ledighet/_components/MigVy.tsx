'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat } from '@/lib/supabase-save';
import type { CurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { C, ff, labelStyle } from './tema';
import { toISO } from './datum';
import { useLedighetData } from './useLedighetData';
import type { Ansokan } from './typer';
import SaldoKort from './SaldoKort';
import AnsokanKort from './AnsokanKort';
import AnsokFormular from './AnsokFormular';
import GodkannSektion from './GodkannSektion';
import Toast from './Toast';

/**
 * "Mig" — inloggad person är alltid "jag" (scopat på medarbetare.id från
 * auth-kontexten). Ingen personväljare. Saldon läses lagrade ur
 * medarbetare_saldo; ansökningar filtreras på egen medarbetare_id.
 */
export default function MigVy({ medarbetare }: { medarbetare: CurrentMedarbetare }) {
  const { saldo, saldoSaknas, ansokningar, laddar, lasfel, hamtaOm } = useLedighetData(medarbetare.id);
  const [formOppen, setFormOppen] = useState(false);
  const [redigerar, setRedigerar] = useState<Ansokan | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  const arGodkannare = medarbetare.roll === 'admin' || medarbetare.roll === 'chef';
  const idag = toISO(new Date());

  const mina = useMemo(
    () => ansokningar.filter(a => a.medarbetare_id === medarbetare.id),
    [ansokningar, medarbetare.id],
  );
  const kommande = useMemo(
    () => mina.filter(a => a.slutdatum >= idag && a.status !== 'nekad')
      .sort((a, b) => a.startdatum.localeCompare(b.startdatum)),
    [mina, idag],
  );
  const tidigare = useMemo(
    () => mina.filter(a => a.slutdatum < idag || a.status === 'nekad'),
    [mina, idag],
  );
  const vantandeAlla = useMemo(
    () => ansokningar.filter(a => a.status === 'väntar'),
    [ansokningar],
  );

  const taBort = async (a: Ansokan) => {
    if (!window.confirm('Ta bort denna ansökan?')) return;
    const res = await raderaVerifierat(supabase, 'ledighet_ansokningar', {
      id: a.id, medarbetare_id: medarbetare.id,
    });
    if (!res.ok) {
      setFel(res.fel);
      return;
    }
    hamtaOm();
  };

  return (
    <div style={{ fontFamily: ff }}>
      <Toast text={fel} onDold={() => setFel(null)} />

      {arGodkannare && (
        <GodkannSektion vantande={vantandeAlla} onKlar={hamtaOm} visaFel={setFel} />
      )}

      <div style={{ marginBottom: 20 }}>
        <SaldoKort saldo={saldo} saldoSaknas={saldoSaknas} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>Mina ansökningar</span>
        <button onClick={() => { setRedigerar(null); setFormOppen(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          borderRadius: 10, border: 'none',
          background: C.blue, color: '#fff', fontSize: 13, fontWeight: 600,
          fontFamily: ff, cursor: 'pointer',
        }}>
          + Ansök om ledighet
        </button>
      </div>

      {lasfel ? (
        <div style={{
          color: C.red, padding: 24, textAlign: 'center', fontSize: 13,
          background: C.redDim, borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)',
        }}>
          {lasfel}
        </div>
      ) : laddar ? (
        <div style={{ color: C.t3, padding: 40, textAlign: 'center', fontSize: 13 }}>Laddar...</div>
      ) : (
        <>
          {kommande.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {kommande.map(a => (
                <AnsokanKort key={a.id} a={a} arEgen
                  onRedigera={x => { setRedigerar(x); setFormOppen(true); }}
                  onTaBort={taBort} />
              ))}
            </div>
          )}

          {tidigare.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ ...labelStyle, marginTop: 4 }}>TIDIGARE</div>
              {tidigare.map(a => (
                <AnsokanKort key={a.id} a={a} arEgen tidigare onTaBort={taBort} />
              ))}
            </div>
          )}

          {kommande.length === 0 && tidigare.length === 0 && (
            <div style={{
              color: C.t3, padding: 30, textAlign: 'center', fontSize: 13,
              background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
            }}>
              Inga ansökningar ännu. Tryck &quot;Ansök om ledighet&quot; för att skapa din första.
            </div>
          )}
        </>
      )}

      {formOppen && (
        <AnsokFormular
          redigerar={redigerar}
          egenId={medarbetare.id}
          egenNamn={medarbetare.namn}
          ansokningar={ansokningar}
          onStang={() => { setFormOppen(false); setRedigerar(null); }}
          onSparad={() => { setFormOppen(false); setRedigerar(null); hamtaOm(); }}
        />
      )}
    </div>
  );
}
