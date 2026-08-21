'use client';

// Stubbehandling: foto pa stubben plus tackningsgrad, en stubbe i taget.
//
// EGEN FIL med avsikt. AvvikelseSheet har redan tva lagen; ett tredje med
// reglage och upprepning hade gjort bada svarare att lasa. Komprimeringen,
// sokvagen och uppladdningen delas daremot - de bar risken och far inte
// finnas i tva utforanden.
//
// STEG OM 5 PROCENT ar ett medvetet val. Ingen kan skilja 78 fran 81 pa en
// stubbe, och falsk precision ar varre an grov arlighet. Steget gor ocksa att
// fingret traffar ratt med handske.
//
// SPARORDNING som i PR 5: bilden UPP forst, fotoraden och punktens
// sammanfattning SIST. Misslyckas uppladdningen stangs formularet aldrig.

import { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/utbildning';
import {
  sparaStubbe,
  stubbeDom,
  KRAVNIVA_STUBBEHANDLING,
  type EgenkontrollPunkt,
} from '@/lib/egenkontroll';
import { komprimeraBild, byggSokvag, laddaUppFoto } from '@/lib/egenkontrollfoto';

const GUL = '#FFD60A';

export default function StubbeSheet({
  punkt,
  egenkontrollId,
  antalSedanTidigare,
  onStang,
  onSparad,
}: {
  punkt: EgenkontrollPunkt;
  egenkontrollId: string;
  /** Antal stubbar som redan ligger pa punkten - styr rubriken. */
  antalSedanTidigare: number;
  onStang: () => void;
  onSparad: () => void;
}) {
  const [bild, setBild] = useState<Blob | null>(null);
  const [forhandsvisning, setForhandsvisning] = useState<string | null>(null);
  const [tackning, setTackning] = useState(KRAVNIVA_STUBBEHANDLING);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [misslyckanden, setMisslyckanden] = useState(0);
  const filRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!bild) return;
    const url = URL.createObjectURL(bild);
    setForhandsvisning(url);
    return () => URL.revokeObjectURL(url);
  }, [bild]);

  const valjBild = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fil = e.target.files?.[0];
    e.target.value = '';
    if (!fil) return;
    setFel(null);
    try {
      setBild(await komprimeraBild(fil));
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Bilden kunde inte behandlas.');
    }
  };

  const spara = async () => {
    if (!bild) return;
    setSparar(true);
    setFel(null);
    try {
      // 1. BILDEN FORST. byggSokvag ar lasbarande - ror den inte.
      const sokvag = byggSokvag(egenkontrollId, punkt.id);
      await laddaUppFoto(sokvag, bild);
      // 2. Fotoraden med sitt varde, 3. punktens medelvarde.
      await sparaStubbe({
        egenkontrollId,
        punktId: punkt.id,
        sokvag,
        tackningsgrad: tackning,
      });
      onSparad();
    } catch (err) {
      // Formularet stangs INTE - bilden och talet ligger kvar.
      setMisslyckanden((n) => n + 1);
      setFel(err instanceof Error ? err.message : 'Kunde inte spara.');
    } finally {
      setSparar(false);
    }
  };

  const dom = stubbeDom(tackning);
  const domFarg = dom.status === 'ok' ? T.green : GUL;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stubbehandling"
      onClick={() => { if (!sparar) onStang(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.group, borderRadius: '16px 16px 0 0',
          padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
          width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
          fontFamily: T.ff, color: T.t1,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
          {antalSedanTidigare === 0 ? 'Stubbehandling' : `Stubbe ${antalSedanTidigare + 1}`}
        </div>
        <div style={{ fontSize: 14, color: T.t2, marginBottom: 16 }}>
          Fotografera stubben och ange hur stor del av snittytan som är behandlad.
        </div>

        {/* 1. FOTOT */}
        <input
          ref={filRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={valjBild}
          style={{ display: 'none' }}
        />
        {forhandsvisning ? (
          <div style={{ marginBottom: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={forhandsvisning}
              alt="Foto på stubben"
              style={{ width: '100%', borderRadius: 10, display: 'block' }}
            />
            <button onClick={() => filRef.current?.click()} disabled={sparar} style={knapp(false)}>
              Ta om bilden
            </button>
          </div>
        ) : (
          <button
            onClick={() => filRef.current?.click()}
            disabled={sparar}
            style={{ ...knapp(false), marginBottom: 16 }}
          >
            Ta foto på stubben
          </button>
        )}

        {/* 2. TACKNINGSGRADEN */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, color: T.t2 }}>Täckningsgrad</span>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{tackning} %</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={tackning}
          onChange={(e) => setTackning(Number(e.target.value))}
          disabled={sparar}
          aria-label="Täckningsgrad i procent"
          aria-valuetext={`${tackning} procent, ${dom.text}`}
          style={{ width: '100%', height: 44, accentColor: domFarg }}
        />

        {/* 3. DOMEN - andras nar man drar. Texten sager samma sak som fargen. */}
        <div style={{ fontSize: 17, fontWeight: 600, color: domFarg, marginTop: 2 }}>
          {dom.text}
        </div>
        {/* Kravnivan skrivs ut sa talet inte ar nagot man ska minnas. */}
        <div style={{ fontSize: 13, color: T.t2, margin: '2px 0 18px' }}>
          Kravnivå {KRAVNIVA_STUBBEHANDLING} %
        </div>

        {fel && (
          <div
            role="alert"
            style={{
              background: 'rgba(255,69,58,0.15)', border: `1px solid ${T.red}`,
              borderRadius: 10, padding: '10px 12px', fontSize: 14,
              lineHeight: 1.4, marginBottom: 14,
            }}
          >
            <div style={{ marginBottom: 4 }}>{fel}</div>
            <div style={{ color: T.t2, fontSize: 13 }}>
              Inget är förlorat — bilden och talet ligger kvar.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={spara} disabled={sparar || !bild} style={knapp(true, sparar || !bild)}>
            {sparar ? 'Sparar…' : fel ? 'Försök igen' : 'Spara stubben'}
          </button>
          {misslyckanden >= 2 && (
            <div style={{ fontSize: 13, color: T.t2, lineHeight: 1.45 }}>
              Går det inte igenom nu: stäng och försök igen när du har täckning.
              En stubbe utan bild sparas inte — bilden är beviset för talet.
            </div>
          )}
          <button onClick={onStang} disabled={sparar} style={knapp(false)}>
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}

function knapp(primar: boolean, inaktiv = false): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: primar ? 'none' : '1.5px solid rgba(255,255,255,0.14)',
    background: primar ? (inaktiv ? '#2C2C2E' : T.green) : 'transparent',
    color: primar ? (inaktiv ? T.t2 : '#000') : T.t1,
    fontSize: 16,
    fontWeight: 600,
    fontFamily: T.ff,
  };
}
