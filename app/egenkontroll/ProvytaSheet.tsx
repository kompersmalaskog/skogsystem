'use client';

// Provytans inmatning: raknare, matvarden, foto.
//
// RAKNAREN AR DET VIKTIGA. Man star i beståndet med handske och raknar trad ett
// i taget - da far man inte behova rakna i huvudet eller minnas var man var.
// Darfor: 76 pt hoga knappar, lopande summa och skadeandel ovanfor, och en
// angra-knapp for senaste trycket.
//
// SKADEANDELEN FARGAS ALDRIG ROTT. Det ar en matning, inte en avvikelse mot
// planen. Samma gula som "kan bli battre".

import { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/utbildning';
import {
  sparaProvyta,
  hoppaOverProvyta,
  laggTillProvytaFoto,
  type EgenkontrollProvyta,
} from '@/lib/egenkontroll';
import { skadeandel } from '@/lib/provytor';
import { komprimeraBild, byggSokvag, laddaUppFoto } from '@/lib/egenkontrollfoto';

const GUL = '#FFD60A';

type Tryck = 'frisk' | 'skadad';

export default function ProvytaSheet({
  yta,
  egenkontrollId,
  noggrannhetM,
  onStang,
  onSparad,
}: {
  yta: EgenkontrollProvyta;
  egenkontrollId: string;
  /** GPS-noggrannheten just nu, sparas med matningen. */
  noggrannhetM: number | null;
  onStang: () => void;
  onSparad: () => void;
}) {
  // Historiken bar angra-knappen: varje tryck laggs pa, angra tar av det sista.
  const [tryck, setTryck] = useState<Tryck[]>(() => [
    ...Array<Tryck>(yta.antal_frisk ?? 0).fill('frisk'),
    ...Array<Tryck>(yta.antal_skadad ?? 0).fill('skadad'),
  ]);
  const [bredd, setBredd] = useState(yta.stickvagsbredd_m?.toString() ?? '');
  const [avstand, setAvstand] = useState(yta.stickvagsavstand_m?.toString() ?? '');
  const [grundyta, setGrundyta] = useState(yta.grundyta_m2_ha?.toString() ?? '');
  const [snitslad, setSnitslad] = useState(yta.markt_i_falt);
  const [bild, setBild] = useState<Blob | null>(null);
  const [forhandsvisning, setForhandsvisning] = useState<string | null>(null);
  const [hoppaLage, setHoppaLage] = useState(false);
  const [skal, setSkal] = useState(yta.overhoppad ? (yta.kommentar ?? '') : '');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const filRef = useRef<HTMLInputElement>(null);

  const frisk = tryck.filter((t) => t === 'frisk').length;
  const skadad = tryck.filter((t) => t === 'skadad').length;
  const andel = skadeandel(frisk, skadad);

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
    try { setBild(await komprimeraBild(fil)); }
    catch (err) { setFel(err instanceof Error ? err.message : 'Bilden kunde inte behandlas.'); }
  };

  const tal = (v: string): number | null => {
    const t = v.trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const spara = async () => {
    setSparar(true);
    setFel(null);
    try {
      // Bilden UPP forst, precis som avvikelsen och stubben.
      let sokvag: string | null = null;
      if (bild) {
        sokvag = byggSokvag(egenkontrollId, yta.id);
        await laddaUppFoto(sokvag, bild);
      }
      await sparaProvyta(yta.id, {
        antalFrisk: frisk,
        antalSkadad: skadad,
        stickvagsbreddM: tal(bredd),
        stickvagsavstandM: tal(avstand),
        grundytaM2Ha: tal(grundyta),
        markessnitslad: snitslad,
        noggrannhetM,
      });
      if (sokvag) {
        await laggTillProvytaFoto({ egenkontrollId, provytaId: yta.id, sokvag });
      }
      onSparad();
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Kunde inte spara.');
    } finally { setSparar(false); }
  };

  const hoppaOver = async () => {
    setSparar(true);
    setFel(null);
    try {
      await hoppaOverProvyta(yta.id, skal);
      onSparad();
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Kunde inte hoppa över ytan.');
    } finally { setSparar(false); }
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`Provyta ${yta.nummer}`}
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
        <div style={{ fontSize: 20, fontWeight: 700 }}>Provyta {yta.nummer}</div>
        <div style={{ fontSize: 14, color: T.t2, marginBottom: 16 }}>
          Radie {Number(yta.radie_m ?? 5.64).toString().replace('.', ',')} m · 100 m²
        </div>

        {hoppaLage ? (
          <>
            <div style={{ fontSize: 15, color: T.t2, lineHeight: 1.5, marginBottom: 12 }}>
              Skriv varför ytan hoppas över. Skälet visas i dokumentet — en
              överhoppad yta utan förklaring säger inget.
            </div>
            <input
              value={skal}
              onChange={(e) => setSkal(e.target.value)}
              placeholder="T.ex. ligger i kärr, otillgänglig"
              style={faltStil}
            />
          </>
        ) : (
          <>
            {/* RAKNAREN */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
                {skadad} av {frisk + skadad}
              </span>
              <span style={{ fontSize: 17, fontWeight: 600, color: andel == null ? T.t2 : GUL }}>
                {andel == null ? 'inga träd räknade' : `${andel} % skadade`}
              </span>
            </div>
            <div style={{ fontSize: 13, color: T.t2, margin: '2px 0 12px' }}>
              skadade av räknade träd
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <RaknarKnapp
                etikett="Frisk" antal={frisk} farg={T.green} disabled={sparar}
                onClick={() => setTryck((t) => [...t, 'frisk'])}
              />
              <RaknarKnapp
                etikett="Skadad" antal={skadad} farg={GUL} disabled={sparar}
                onClick={() => setTryck((t) => [...t, 'skadad'])}
              />
            </div>
            <button
              onClick={() => setTryck((t) => t.slice(0, -1))}
              disabled={sparar || tryck.length === 0}
              style={{ ...knapp(false), opacity: tryck.length === 0 ? 0.4 : 1, marginBottom: 18 }}
            >
              Ångra senaste
            </button>

            {/* MATVARDEN - alla valfria, alla ytor ligger inte vid en stickvag */}
            <div style={{ fontSize: 13, color: T.t2, marginBottom: 8 }}>
              Mätvärden (valfria)
            </div>
            <Falt etikett="Stickvägsbredd (m)" varde={bredd} onChange={setBredd} />
            <Falt etikett="Stickvägsavstånd, centrum–centrum (m)" varde={avstand} onChange={setAvstand} />
            <Falt etikett="Grundyta kvar (m²/ha)" varde={grundyta} onChange={setGrundyta} />

            {/* SNITSLINGEN - det enda som gor en kontrollmatning mojlig */}
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, margin: '6px 0 4px' }}>
              <input
                type="checkbox" checked={snitslad} disabled={sparar}
                onChange={(e) => setSnitslad(e.target.checked)}
                style={{ width: 22, height: 22, marginTop: 11, accentColor: T.blue }}
              />
              <span style={{ fontSize: 15, paddingTop: 10 }}>
                Snitslad i fält
                <span style={{ display: 'block', fontSize: 13, color: T.t2, lineHeight: 1.4, paddingBottom: 8 }}>
                  Telefonens GPS under krontak är 5–15 m och ytan är 5,64 m i radie — utan
                  snitsel hittar ingen tillbaka till exakt samma yta.
                </span>
              </span>
            </label>

            <input ref={filRef} type="file" accept="image/*" capture="environment"
                   onChange={valjBild} style={{ display: 'none' }} />
            {forhandsvisning ? (
              <div style={{ marginBottom: 14 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={forhandsvisning} alt="Foto på provytan"
                     style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                <button onClick={() => filRef.current?.click()} disabled={sparar} style={knapp(false)}>
                  Ta om bilden
                </button>
              </div>
            ) : (
              <button onClick={() => filRef.current?.click()} disabled={sparar}
                      style={{ ...knapp(false), marginBottom: 14 }}>
                Ta foto (valfritt)
              </button>
            )}
          </>
        )}

        {fel && (
          <div role="alert" style={{
            background: 'rgba(255,69,58,0.15)', border: `1px solid ${T.red}`,
            borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: 1.4, marginBottom: 14,
          }}>
            <div style={{ marginBottom: 4 }}>{fel}</div>
            <div style={{ color: T.t2, fontSize: 13 }}>Inget är förlorat — det du fyllt i ligger kvar.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hoppaLage ? (
            <>
              <button onClick={hoppaOver} disabled={sparar || skal.trim() === ''}
                      style={knapp(true, sparar || skal.trim() === '')}>
                {sparar ? 'Sparar…' : 'Hoppa över ytan'}
              </button>
              <button onClick={() => setHoppaLage(false)} disabled={sparar} style={knapp(false)}>
                Tillbaka
              </button>
            </>
          ) : (
            <>
              <button onClick={spara} disabled={sparar || tryck.length === 0}
                      style={knapp(true, sparar || tryck.length === 0)}>
                {sparar ? 'Sparar…' : 'Spara provytan'}
              </button>
              <button onClick={() => setHoppaLage(true)} disabled={sparar} style={knapp(false)}>
                Hoppa över ytan
              </button>
              <button onClick={onStang} disabled={sparar} style={knapp(false)}>Avbryt</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 76 pt hog - den ska gå att träffa med tumme utan att titta. */
function RaknarKnapp({
  etikett, antal, farg, disabled, onClick,
}: { etikett: string; antal: number; farg: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minHeight: 76, borderRadius: 12,
        border: `1.5px solid ${farg}`, background: 'transparent', color: T.t1,
        fontFamily: T.ff, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600, color: farg }}>{etikett}</span>
      <span style={{ fontSize: 26, fontWeight: 700 }}>{antal}</span>
    </button>
  );
}

function Falt({ etikett, varde, onChange }: { etikett: string; varde: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 13, color: T.t2, marginBottom: 4 }}>{etikett}</span>
      <input
        value={varde}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        style={faltStil}
      />
    </label>
  );
}

const faltStil: React.CSSProperties = {
  width: '100%', minHeight: 44, boxSizing: 'border-box',
  borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.14)',
  background: 'transparent', color: T.t1, fontSize: 16,
  fontFamily: T.ff, padding: '0 12px',
};

function knapp(primar: boolean, inaktiv = false): React.CSSProperties {
  return {
    width: '100%', minHeight: 44, borderRadius: 10,
    border: primar ? 'none' : '1.5px solid rgba(255,255,255,0.14)',
    background: primar ? (inaktiv ? '#2C2C2E' : T.green) : 'transparent',
    color: primar ? (inaktiv ? T.t2 : '#000') : T.t1,
    fontSize: 16, fontWeight: 600, fontFamily: T.ff,
  };
}
