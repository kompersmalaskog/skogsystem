'use client';
// Mät GPS-strömmen — Inställningar › GPS-källa (bara maskindatorn). Svarar på EN fråga: hur många fixar och omrenderingar per sekund kommer det från mottagaren,
// före och efter strypningen (lib/gpsStrypning)? Mätningen tar 2 × MATT_S sekunder: först utan strypning (så som appen var), sedan med. Strypningen står alltid PÅ
// utom under den första halvan och slås på igen även om kortet stängs mitt i. Inget sparas.
import { useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { perSekund, sattStrypning, stromLas, stromNollstall, type StromPerSekund } from '@/lib/gpsStrom';

export const MATT_S = 30;

type Fas = { fas: 'vilar' } | { fas: 'fore' | 'efter'; kvar: number };

export default function GpsStromMatning() {
  const [fas, setFas] = useState<Fas>({ fas: 'vilar' });
  const [fore, setFore] = useState<StromPerSekund | null>(null);
  const [efter, setEfter] = useState<StromPerSekund | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopp = () => { if (timer.current) clearInterval(timer.current); timer.current = null; sattStrypning(true); };
  useEffect(() => stopp, []);

  const start = () => {
    stopp();
    setFore(null); setEfter(null);
    let aktuell: 'fore' | 'efter' = 'fore';
    let kvar = MATT_S;
    sattStrypning(false);
    stromNollstall();
    setFas({ fas: 'fore', kvar });
    timer.current = setInterval(() => {
      kvar -= 1;
      if (kvar > 0) { setFas({ fas: aktuell, kvar }); return; }
      const r = perSekund(stromLas(), MATT_S * 1000);
      if (aktuell === 'fore') {
        setFore(r);
        aktuell = 'efter'; kvar = MATT_S;
        sattStrypning(true);
        stromNollstall();
        setFas({ fas: 'efter', kvar });
      } else {
        setEfter(r);
        stopp();
        setFas({ fas: 'vilar' });
      }
    }, 1000);
  };

  const rad = (r: StromPerSekund) => `${r.rader} rader · ${r.fixar} fixar · ${r.positioner} positioner · ${r.renderingar} renderingar per sekund`;
  const pagar = fas.fas !== 'vilar';

  return (
    <div data-testid="gps-strom-matning" style={{ marginBottom: AVSTAND.xl }}>
      <Sektion rubrik="Mät GPS-strömmen" not={`Tar ${MATT_S * 2} sekunder: ${MATT_S} utan och ${MATT_S} med strypning. Kör medan mottagaren skickar.`}>
        <div style={{ padding: `${AVSTAND.m}px 0` }}>
          <button type="button" data-testid="gps-strom-start" onClick={start} disabled={pagar}
            style={{ ...KNAPP.sekundar, opacity: pagar ? 0.4 : 1 }}>
            {fas.fas === 'fore' ? <span style={TNUM}>Mäter utan strypning… {fas.kvar} s</span>
              : fas.fas === 'efter' ? <span style={TNUM}>Mäter med strypning… {fas.kvar} s</span>
              : 'Mät GPS-strömmen'}
          </button>
        </div>
        {fore && <Rad titel="Utan strypning" under={rad(fore)} sista={!efter} attr={{ 'data-testid': 'gps-strom-fore' }} />}
        {efter && <Rad titel="Med strypning" under={rad(efter)} sista attr={{ 'data-testid': 'gps-strom-efter' }} />}
      </Sektion>
      {fore && efter && fore.renderingar > 0 && (
        <div style={{ ...TYP.meta, color: FARG.text2 }}>Omrenderingar: {fore.renderingar} → {efter.renderingar} per sekund.</div>
      )}
    </div>
  );
}
