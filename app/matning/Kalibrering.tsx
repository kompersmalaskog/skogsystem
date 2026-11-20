'use client';

// Kalibrering av relaskopcirkeln.
//
// VARFÖR DEN MÅSTE FINNAS
// Cirkelns storlek på skärmen ska motsvara en vinkel: faktor 1 = 1:50 =
// 1,1459°. Den vinkeln går att räkna om man vet kamerans synfält — men
// webbläsaren lämnar inte ut synfältet på ett pålitligt sätt. Räknar vi på ett
// antaget värde mäter Martin systematiskt fel utan att någonsin märka det.
// En mätning som är 15 % fel ser exakt likadan ut som en som stämmer.
//
// Därför: mätning är SPÄRRAD tills enheten kalibrerats. Hellre ett extra steg
// en gång än ett helt bestånd mätt mot fel vinkel.
//
// HUR
// Martin siktar på ett träd som precis fyller hans riktiga relaskop och drar
// reglaget tills skärmcirkeln gör detsamma. Ingen inmatning, inget tangentbord.
// Det kalibrerade synfältet skrivs sedan in i varje mätning, så gamla
// mätningar går att tolka även om kalibreringen görs om eller telefonen byts.

import { useEffect, useRef, useState } from 'react';
import {
  ANTAGET_SYNFALT,
  enhetsNamn,
  lasKalibrering,
  sparaKalibrering,
} from '@/lib/matning/lager';
import { brannvidd, relaskopRadiePx } from '@/lib/matning/orientering';

export default function Kalibrering({
  onKlar,
  onAvbryt,
}: {
  onKlar: () => void;
  onAvbryt: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const strommenRef = useRef<MediaStream | null>(null);
  const ytaRef = useRef<HTMLDivElement>(null);

  const befintlig = typeof window !== 'undefined' ? lasKalibrering() : null;
  const [synfalt, setSynfalt] = useState(befintlig?.synfalt_grader ?? ANTAGET_SYNFALT);
  const [faktor, setFaktor] = useState(befintlig?.relaskop_faktor ?? 1);
  const [bredd, setBredd] = useState(0);
  const [kamerafel, setKamerafel] = useState<string | null>(null);

  useEffect(() => {
    let avbruten = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, audio: false,
        });
        if (avbruten) { s.getTracks().forEach((t) => t.stop()); return; }
        strommenRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
        // Samma zoomlåsning som i mätläget — kalibreras det med en zoom och
        // mäts med en annan är kalibreringen värdelös.
        const spar = s.getVideoTracks()[0];
        const kap = spar?.getCapabilities?.() as { zoom?: { min: number } } | undefined;
        if (kap?.zoom) {
          // zoom finns i praktiken men inte i TypeScripts MediaTrackConstraints —
          // den ar en tillaggsegenskap som webblasarna stodjer utan att den ar
          // standardiserad. Kastas via unknown i stallet for att tystas med any,
          // sa det syns att det ar ett medvetet hal och inte slarv.
          const lasZoom = { advanced: [{ zoom: kap.zoom.min }] } as unknown as MediaTrackConstraints;
          await spar.applyConstraints(lasZoom).catch(() => {});
        }
      } catch {
        setKamerafel('Kameran släpptes inte fram. Utan bild går cirkeln inte att ställa in mot ditt relaskop.');
      }
    })();
    return () => { avbruten = true; strommenRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const mat = () => setBredd(ytaRef.current?.clientWidth ?? 0);
    mat();
    window.addEventListener('resize', mat);
    return () => window.removeEventListener('resize', mat);
  }, []);

  const radie = bredd > 0 ? relaskopRadiePx(brannvidd(bredd, synfalt), faktor) : 0;

  const spara = () => {
    sparaKalibrering({
      synfalt_grader: synfalt,
      relaskop_faktor: faktor,
      enhet: enhetsNamn(),
      kalibrerad: new Date().toISOString(),
    });
    onKlar();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div ref={ytaRef} style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* Cirkeln, i exakt den storlek mätningen kommer använda. */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <circle cx="50%" cy="50%" r={Math.max(radie, 2)} fill="none" stroke="#fff" strokeWidth={4} />
          <circle cx="50%" cy="50%" r={Math.max(radie, 2)} fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth={1.5} />
        </svg>
        {kamerafel && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', padding: 24,
            display: 'flex', alignItems: 'center', color: '#fff', fontSize: 18, lineHeight: 1.5 }}>
            {kamerafel}
          </div>
        )}
      </div>

      <div style={{ background: '#000', padding: '16px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <p style={{ color: '#fff', fontSize: 17, lineHeight: 1.45, margin: '0 0 14px' }}>
          Sikta på ett träd som <strong>precis fyller ditt relaskop</strong>. Dra tills cirkeln
          gör detsamma.
        </p>

        <Reglage
          etikett="Cirkelns storlek"
          varde={synfalt}
          min={35}
          max={100}
          steg={0.5}
          onChange={setSynfalt}
          visa={`${synfalt.toFixed(1)}° synfält`}
        />

        <div style={{ display: 'flex', gap: 8, margin: '18px 0 6px' }}>
          {[1, 2].map((f) => (
            <button
              key={f}
              onClick={() => setFaktor(f)}
              style={{
                flex: 1, minHeight: 68, borderRadius: 14, fontSize: 19, fontWeight: 700,
                border: faktor === f ? '3px solid #0A84FF' : '3px solid rgba(255,255,255,0.25)',
                background: faktor === f ? 'rgba(10,132,255,0.25)' : 'transparent', color: '#fff',
              }}
            >
              Faktor {f}
            </button>
          ))}
        </div>
        <p style={{ color: '#fff', fontSize: 15, margin: '0 0 16px', opacity: 0.9 }}>
          Faktor 1 = 1:50. Varje träd som fyller cirkeln är {faktor} m²/ha.
        </p>

        <button
          onClick={spara}
          style={{ width: '100%', minHeight: 76, borderRadius: 16, border: 'none',
            background: '#30D158', color: '#04240F', fontSize: 22, fontWeight: 700 }}
        >
          Spara kalibreringen
        </button>
        <button
          onClick={onAvbryt}
          style={{ width: '100%', minHeight: 60, marginTop: 8, borderRadius: 14, border: 'none',
            background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 18, fontWeight: 600 }}
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}

/** Reglage med stora träffytor — inget tangentbord någonstans i flödet. */
function Reglage({
  etikett, varde, min, max, steg, onChange, visa,
}: {
  etikett: string; varde: number; min: number; max: number; steg: number;
  onChange: (v: number) => void; visa: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{etikett}</span>
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{visa}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Stegknapp onClick={() => onChange(Math.max(min, +(varde - steg).toFixed(1)))}>−</Stegknapp>
        <input
          type="range" min={min} max={max} step={steg} value={varde}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, height: 60 }}
        />
        <Stegknapp onClick={() => onChange(Math.min(max, +(varde + steg).toFixed(1)))}>+</Stegknapp>
      </div>
    </div>
  );
}

function Stegknapp({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 68, height: 68, borderRadius: 14, border: 'none', flexShrink: 0,
        background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 30, fontWeight: 700 }}
    >
      {children}
    </button>
  );
}
