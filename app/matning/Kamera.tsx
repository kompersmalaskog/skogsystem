'use client';

// Mätvyns kameravy — telefonen ÄR relaskopet.
//
// TVÅ TILLSTÅND, INGA FLER: jag siktar, och jag är klar med varvet.
//
// Allt annat finns på skärmen men får aldrig kräva en handling som avbryter
// siktandet. Varje gång Martin måste titta bort från trädet för att hantera
// appen är det ett designfel.
//
// DÄRFÖR:
//
// • HELA skärmen är knappen. Trädet registreras i kamerans riktning — mitt i
//   relaskopcirkeln — så det spelar ingen roll var fingret landar. Med handskar
//   och i rörelse är en 60-punktsknapp fortfarande något att sikta på; en hel
//   skärm är det inte.
//
// • Trädslag väljs med EN gest. Tryck och håll, fyra fält vecklar ut sig runt
//   fingret, dra åt rätt håll, släpp. Fingret lämnar aldrig skärmen. Snabbtryck
//   utan drag ger samma trädslag som förra trädet, för de flesta träd i rad är
//   samma art.
//
// • Prickarna ritas på canvas, inte som React-element. Ett varv är 60 bildrutor
//   i sekunden och en omrendering per bildruta skulle göra bilden hackig precis
//   när han snurrar.
//
// • ETT tal dominerar: grundytan. Gradringen som visar hur långt varvet gått är
//   avsiktligt tunn och nästan omärklig tills varvet sluts. Inga andra tal.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  brannvidd,
  kameraRiktning,
  relaskopRadiePx,
  slutVarv,
  tillSkarm,
  varvGrader,
  vinkelDiff,
  type Enhetsvinklar,
  type Riktning,
} from '@/lib/matning/orientering';
import {
  KALLSTART_TEXT,
  nastaOrdning,
  varvSlutet,
  type MattTrad,
} from '@/lib/matning/lager';
import { tradslagStil } from '@/lib/tradslag';

/** Fyra fält i gesten. Ordningen är fast — den ska sitta i handen. */
const TRADSLAG = ['Gran', 'Tall', 'Björk', 'Övrigt löv'] as const;
/** upp, höger, ner, vänster */
const SEKTOR_VINKEL = [-90, 0, 90, 180];

const HALL_MS = 260;
const PICKER_RADIE = 104;

type Orientering = 'ej_fragad' | 'pa' | 'nekad' | 'saknas';
type Kameralage = 'startar' | 'pa' | 'nekad' | 'saknas';

export default function Kamera({
  punktNummer,
  faktor,
  synfaltGrader,
  onKlar,
  onAvbryt,
}: {
  punktNummer: number;
  faktor: number;
  synfaltGrader: number;
  onKlar: (trad: MattTrad[], varv: number) => void;
  onAvbryt: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const tradRef = useRef<MattTrad[]>([]);
  const riktningRef = useRef<Riktning | null>(null);
  const baringsSpar = useRef<number[]>([]);
  const strommenRef = useRef<MediaStream | null>(null);

  const [antal, setAntal] = useState(0);
  const [varv, setVarv] = useState(0);
  const [sisteTradslag, setSisteTradslag] = useState<string>('Gran');
  const [orientering, setOrientering] = useState<Orientering>('ej_fragad');
  const [kameralage, setKameralage] = useState<Kameralage>('startar');
  const [picker, setPicker] = useState<{ x: number; y: number; vald: number } | null>(null);
  const [visaStart, setVisaStart] = useState(true);

  const hallTimer = useRef<number | null>(null);
  const pekStart = useRef<{ x: number; y: number } | null>(null);
  const pickerRef = useRef<typeof picker>(null);
  pickerRef.current = picker;

  // ── Kameran ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let avbruten = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (avbruten) { s.getTracks().forEach((t) => t.stop()); return; }
        strommenRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        // ZOOMEN LÅSES. Ändras den är kalibreringen ogiltig utan att något
        // syns på skärmen — cirkeln skulle motsvara en annan vinkel än den
        // Martin ställde in mot sitt relaskop.
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
        setKameralage('pa');
      } catch (e) {
        setKameralage((e as Error)?.name === 'NotAllowedError' ? 'nekad' : 'saknas');
      }
    })();
    return () => {
      avbruten = true;
      strommenRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Kompassen — aktiveras med ETT tryck, aldrig automatiskt ──────────────
  // iOS kräver en riktig gest för DeviceOrientationEvent.requestPermission.
  // Samma linje som platsprompten och kompassen i egenkontrollen.
  const aktiveraKompass = useCallback(async () => {
    const DO = (window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
    }).DeviceOrientationEvent;
    if (!DO) { setOrientering('saknas'); return; }
    try {
      if (typeof DO.requestPermission === 'function') {
        const svar = await DO.requestPermission();
        if (svar !== 'granted') { setOrientering('nekad'); return; }
      }
      const lyssnare = (e: DeviceOrientationEvent) => {
        const v: Enhetsvinklar = {
          alpha: e.alpha, beta: e.beta, gamma: e.gamma,
          webkitCompassHeading: (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading,
        };
        const r = kameraRiktning(v);
        riktningRef.current = r;
        if (r) {
          const spar = baringsSpar.current;
          if (spar.length === 0 || Math.abs(vinkelDiff(spar[spar.length - 1], r.baring)) > 1) {
            spar.push(r.baring);
            if (spar.length > 4000) spar.splice(0, 2000);
            setVarv(varvGrader(spar));
          }
        }
      };
      window.addEventListener('deviceorientation', lyssnare, true);
      setOrientering('pa');
      return () => window.removeEventListener('deviceorientation', lyssnare, true);
    } catch {
      setOrientering('nekad');
    }
  }, []);

  // ── Ritslingan ───────────────────────────────────────────────────────────
  useEffect(() => {
    let id = 0;
    const rita = () => {
      id = requestAnimationFrame(rita);
      const c = canvasRef.current;
      if (!c) return;
      const b = c.clientWidth, h = c.clientHeight;
      if (c.width !== b || c.height !== h) { c.width = b; c.height = h; }
      const g = c.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, b, h);

      const bv = brannvidd(b, synfaltGrader);
      const kam = riktningRef.current;

      // Prickarna — bara när riktningen är känd. Utan kompass ritas ingenting,
      // för en prick på en gissad riktning pekar på fel träd.
      if (kam) {
        for (const t of tradRef.current) {
          const p = tillSkarm(t, kam, bv, b, h);
          if (!p) continue;
          const stil = tradslagStil(t.tradslag);
          g.beginPath();
          g.arc(p.x, p.y, 13, 0, Math.PI * 2);
          g.fillStyle = stil.fyll;
          g.fill();
          g.lineWidth = 3;
          g.strokeStyle = stil.kontur ?? 'rgba(0,0,0,0.65)';
          g.stroke();
        }
      }

      // Relaskopcirkeln — mätinstrumentet självt.
      const r = relaskopRadiePx(bv, faktor);
      g.beginPath();
      g.arc(b / 2, h / 2, Math.max(r, 3), 0, Math.PI * 2);
      g.lineWidth = 4;
      g.strokeStyle = '#FFFFFF';
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.stroke();
    };
    id = requestAnimationFrame(rita);
    return () => cancelAnimationFrame(id);
  }, [faktor, synfaltGrader]);

  // ── Gesten ───────────────────────────────────────────────────────────────
  const laggTill = useCallback((tradslag: string) => {
    const kam = riktningRef.current;
    if (!kam) return;
    const nytt: MattTrad = {
      tradslag,
      baring: kam.baring,
      hojdvinkel: kam.hojdvinkel,
      ordning: nastaOrdning(tradRef.current),
    };
    tradRef.current = [...tradRef.current, nytt];
    setAntal(tradRef.current.length);
    setSisteTradslag(tradslag);
    if (navigator.vibrate) navigator.vibrate(12);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (orientering !== 'pa') return;
    pekStart.current = { x: e.clientX, y: e.clientY };
    hallTimer.current = window.setTimeout(() => {
      setPicker({ x: e.clientX, y: e.clientY, vald: -1 });
      if (navigator.vibrate) navigator.vibrate(20);
    }, HALL_MS);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = pickerRef.current;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const avst = Math.hypot(dx, dy);
    if (avst < 34) { setPicker({ ...p, vald: -1 }); return; }
    const vinkel = (Math.atan2(dy, dx) * 180) / Math.PI;
    let bast = 0, bastDiff = 999;
    SEKTOR_VINKEL.forEach((v, i) => {
      const d = Math.abs(((((vinkel - v) % 360) + 540) % 360) - 180);
      if (d < bastDiff) { bastDiff = d; bast = i; }
    });
    if (p.vald !== bast) { setPicker({ ...p, vald: bast }); if (navigator.vibrate) navigator.vibrate(8); }
  };

  const onUp = () => {
    if (hallTimer.current) { clearTimeout(hallTimer.current); hallTimer.current = null; }
    const p = pickerRef.current;
    if (p) {
      if (p.vald >= 0) laggTill(TRADSLAG[p.vald]);
      setPicker(null);
      return;
    }
    // Snabbtryck = samma trädslag som förra trädet.
    laggTill(sisteTradslag);
  };

  const slutet = varvSlutet(varv);
  const grundyta = antal * faktor;

  // ── Tillstånd som inte är "siktar" ───────────────────────────────────────
  if (kameralage === 'nekad' || kameralage === 'saknas') {
    return (
      <Besked
        rubrik={kameralage === 'nekad' ? 'Kameran är avstängd' : 'Ingen kamera'}
        text={
          kameralage === 'nekad'
            ? 'Släpp fram kameran i telefonens inställningar för att mäta. Utan kamerabild finns inget att sikta med.'
            : 'Den här enheten har ingen kamera som mätvyn kan använda.'
        }
        onAvbryt={onAvbryt}
      />
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />

      {/* ETT TAL. Stort, överst, stilla. */}
      <div
        style={{
          position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'inline-block', padding: '6px 22px', borderRadius: 14,
            background: 'rgba(0,0,0,0.55)',
          }}
        >
          <span style={{ fontSize: 62, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -2 }}>
            {Math.round(grundyta)}
          </span>
          <span style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginLeft: 8 }}>m²/ha</span>
        </div>
      </div>

      {/* Gradringen — tunn i kanten, nästan omärklig tills varvet sluts. */}
      <Gradring andel={Math.min(Math.abs(varv) / 360, 1)} slutet={slutet} />

      {/* Trädslagsgesten */}
      {picker && <Picker x={picker.x} y={picker.y} vald={picker.vald} />}

      {/* Kompassen först — utan den kan inget träd sättas. */}
      {orientering !== 'pa' && (
        <Overlay>
          <p style={{ fontSize: 19, color: '#fff', margin: '0 0 22px', lineHeight: 1.5 }}>
            {orientering === 'nekad'
              ? 'Kompassen nekades. Utan den vet appen inte åt vilket håll du siktar, och prickarna skulle hamna på fel träd. Ladda om sidan och tillåt rörelse för att mäta.'
              : orientering === 'saknas'
                ? 'Den här enheten saknar kompass. Mätvyn kan inte hålla reda på var träden står och mätningen går inte att göra här.'
                : 'Mätvyn behöver kompassen för att prickarna ska sitta kvar på träden när du snurrar.'}
          </p>
          {orientering === 'ej_fragad' && (
            <Knapp primar onClick={aktiveraKompass}>Starta mätningen</Knapp>
          )}
          <Knapp onClick={onAvbryt}>Tillbaka</Knapp>
        </Overlay>
      )}

      {/* Kallstartsraden — sägs när mätningen börjar, inte när han står i skogen. */}
      {orientering === 'pa' && visaStart && (
        <div
          onClick={() => setVisaStart(false)}
          style={{
            position: 'absolute', left: 12, right: 12, bottom: 'calc(112px + env(safe-area-inset-bottom))',
            background: 'rgba(0,0,0,0.78)', borderRadius: 14, padding: '14px 16px',
            color: '#fff', fontSize: 16, lineHeight: 1.45, minHeight: 60,
          }}
        >
          {KALLSTART_TEXT}
          <div style={{ fontSize: 14, color: '#FFD60A', marginTop: 6 }}>Tryck för att stänga</div>
        </div>
      )}

      {/* Punkt + trädslag: syns, kräver ingenting. */}
      {orientering === 'pa' && (
        <div
          style={{
            position: 'absolute', left: 12, top: 'calc(96px + env(safe-area-inset-top))',
            display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
            background: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: '7px 12px',
          }}
        >
          <span
            style={{
              width: 16, height: 16, borderRadius: 4, background: tradslagStil(sisteTradslag).fyll,
              border: `2px solid ${tradslagStil(sisteTradslag).kontur ?? 'rgba(0,0,0,0.6)'}`,
              boxSizing: 'border-box',
            }}
          />
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>{sisteTradslag}</span>
          <span style={{ color: '#fff', fontSize: 16, opacity: 0.85 }}>· punkt {punktNummer}</span>
        </div>
      )}

      {/* Det andra tillståndet: klar med varvet. */}
      {orientering === 'pa' && (
        <button
          onClick={() => onKlar(slutVarv(tradRef.current, varv) as MattTrad[], varv)}
          disabled={antal === 0}
          style={{
            position: 'absolute', left: 12, right: 12,
            bottom: 'calc(12px + env(safe-area-inset-bottom))',
            minHeight: 84, borderRadius: 18, border: 'none',
            background: slutet ? '#30D158' : 'rgba(255,255,255,0.22)',
            color: slutet ? '#04240F' : '#fff',
            fontSize: 24, fontWeight: 700, opacity: antal === 0 ? 0.45 : 1,
          }}
        >
          {slutet ? 'Klar med varvet' : `Varvet ${Math.round(Math.abs(varv))}° av 360°`}
        </button>
      )}
    </div>
  );
}

/** Gradringen. Tunn båge längs skärmkanten — färgen är aldrig ensam bärare,
 *  knappen längst ned säger samma sak i text. */
function Gradring({ andel, slutet }: { andel: number; slutet: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <rect
        x="1" y="1" width="98" height="98" rx="3"
        fill="none"
        stroke={slutet ? '#30D158' : 'rgba(255,255,255,0.5)'}
        strokeWidth={slutet ? 1.4 : 0.7}
        strokeDasharray={`${andel * 392} 392`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Fyra fält runt fingret. Färg OCH namn — färgen ensam duger inte i solljus. */
function Picker({ x, y, vald }: { x: number; y: number; vald: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {TRADSLAG.map((namn, i) => {
        const v = (SEKTOR_VINKEL[i] * Math.PI) / 180;
        const cx = x + Math.cos(v) * PICKER_RADIE;
        const cy = y + Math.sin(v) * PICKER_RADIE;
        const stil = tradslagStil(namn);
        const aktiv = vald === i;
        return (
          <div
            key={namn}
            style={{
              position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)',
              minWidth: aktiv ? 108 : 92, minHeight: aktiv ? 72 : 62,
              borderRadius: 16, background: stil.fyll,
              border: `4px solid ${aktiv ? '#fff' : stil.kontur ?? 'rgba(0,0,0,0.55)'}`,
              boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: aktiv ? '0 0 0 5px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            <span
              style={{
                fontSize: 15, fontWeight: 800, textAlign: 'center', padding: '0 6px',
                color: namn === 'Björk' ? '#111' : '#fff',
                textShadow: namn === 'Björk' ? 'none' : '0 1px 3px rgba(0,0,0,0.85)',
              }}
            >
              {namn}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.86)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '24px 20px', gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Knapp({
  children, onClick, primar,
}: { children: React.ReactNode; onClick: () => void; primar?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 68, borderRadius: 16, border: 'none', width: '100%',
        background: primar ? '#0A84FF' : 'rgba(255,255,255,0.16)',
        color: '#fff', fontSize: 20, fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function Besked({
  rubrik, text, onAvbryt,
}: { rubrik: string; text: string; onAvbryt: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', padding: '24px 20px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
      <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 700, margin: 0 }}>{rubrik}</h1>
      <p style={{ color: '#fff', fontSize: 18, lineHeight: 1.5, margin: 0 }}>{text}</p>
      <Knapp onClick={onAvbryt}>Tillbaka</Knapp>
    </div>
  );
}
